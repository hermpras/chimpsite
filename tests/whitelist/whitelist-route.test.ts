import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/whitelist/status/route";
import { POST } from "@/app/api/whitelist/qualify/route";

vi.mock("@/server/auth/session", () => ({
  authenticateRequest: vi.fn(),
}));

vi.mock("@/lib/auth/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
  };
});

vi.mock("@/server/whitelist/qualification", () => ({
  evaluateUserQualification: vi.fn(),
  REQUIRED_TRAIT_CATEGORIES: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
  WhitelistError: class WhitelistError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number = 400) {
      super(message);
      this.name = "WhitelistError";
      this.code = code;
      this.status = status;
    }
  },
}));

vi.mock("@/server/db", () => ({
  prisma: {
    wLProgram: {
      findUnique: vi.fn().mockResolvedValue({
        id: "p1",
        slug: "chimphood-wl-main",
        name: "Main WL",
        totalSlots: 10,
        allocatedSlotsCount: 2,
        status: "OPEN",
      }),
      findFirst: vi.fn().mockResolvedValue({
        id: "p1",
        slug: "chimphood-wl-main",
        name: "Main WL",
        totalSlots: 10,
        allocatedSlotsCount: 2,
        status: "OPEN",
      }),
    },
    walletIdentity: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    wLSlot: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    wLQueueEntry: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    wLQualification: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

import { authenticateRequest } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { evaluateUserQualification } from "@/server/whitelist/qualification";
import { checkRateLimit } from "@/lib/auth/rate-limit";

describe("Whitelist API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/whitelist/status returns program details when unauthenticated", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/whitelist/status");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.program.name).toBe("Main WL");
    expect(body.authenticated).toBe(false);
  });

  it("GET /api/whitelist/status passes readOnly: true and performs no write operations", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0x123",
    });

    vi.mocked(evaluateUserQualification).mockResolvedValue({
      qualified: true,
      phase: "NONE",
      missingRequirements: [],
      details: {
        hasVerifiedWallet: true,
        hasLinkedX: true,
        heldCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
        missingCategories: [],
        completedMandatoryTasksCount: 1,
        totalMandatoryTasksCount: 1,
        isBanned: false,
      },
    });

    const req = new Request("http://localhost:3000/api/whitelist/status");
    const res = await GET(req);
    expect(res.status).toBe(200);

    expect(evaluateUserQualification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "u1",
        programId: "p1",
        readOnly: true,
      }),
    );
  });

  it("POST /api/whitelist/qualify returns 401 when unauthenticated", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/whitelist/qualify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("POST /api/whitelist/qualify rejects fallback if program is in DRAFT status", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0x123",
    });

    // prisma.wLProgram.findFirst returns null or draft program
    vi.mocked(prisma.wLProgram.findFirst).mockResolvedValueOnce(null);

    const req = new Request("http://localhost:3000/api/whitelist/qualify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("NO_ACTIVE_PROGRAM");
  });

  it("POST /api/whitelist/qualify rejects explicit programId if program is in DRAFT status", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0x123",
    });

    vi.mocked(prisma.wLProgram.findUnique).mockResolvedValueOnce({
      id: "p-draft",
      slug: "draft-wl",
      name: "Draft WL",
      totalSlots: 10,
      allocatedSlotsCount: 0,
      status: "UPCOMING",
    } as any);

    const req = new Request("http://localhost:3000/api/whitelist/qualify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId: "p-draft" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("NO_ACTIVE_PROGRAM");
  });

  it("POST /api/whitelist/qualify returns 429 when rate limit exceeded (Task 3-B)", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0x123",
    });

    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 120,
    });

    const req = new Request("http://localhost:3000/api/whitelist/qualify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
    const body = await res.json();
    expect(body.error).toBe("RATE_LIMITED");
    expect(checkRateLimit).toHaveBeenCalledWith("whitelist-qualify:0x123", 3, 300_000);
  });

  it("POST /api/whitelist/qualify returns 500 when rate limiter fails closed (Task 3-B)", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0x123",
    });

    vi.mocked(checkRateLimit).mockRejectedValueOnce(new Error("Redis unreachable"));

    const req = new Request("http://localhost:3000/api/whitelist/qualify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("SERVER_ERROR");
  });

  // Regression: program FINALIZED must not cause HTTP 500
  // Previously evaluateUserQualification threw WhitelistError("PROGRAM_NOT_ACTIVE", ..., 400)
  // which was unhandled in the route and propagated as HTTP 500.
  it("GET /api/whitelist/status returns 200 with program info when program is FINALIZED (regression O-3)", async () => {
    vi.mocked(prisma.wLProgram.findUnique).mockResolvedValueOnce({
      id: "p-final",
      slug: "chimphood-wl-main",
      name: "Main WL",
      totalSlots: 500,
      allocatedSlotsCount: 500,
      status: "FINALIZED",
    } as any);
    // findFirst fallbacks are not reached because findUnique returns a result
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0xabc",
    });

    const { WhitelistError } = await import("@/server/whitelist/qualification");
    vi.mocked(evaluateUserQualification).mockRejectedValueOnce(
      new WhitelistError(
        "PROGRAM_NOT_ACTIVE",
        "Whitelist program is not open (current status: FINALIZED).",
        400,
      ),
    );

    const req = new Request("http://localhost:3000/api/whitelist/status");
    const res = await GET(req);

    // Must be 200, not 400 or 500
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.program.status).toBe("FINALIZED");
    expect(body.status.qualified).toBe(false);
    expect(body.status.phase).toBe("NONE");
    expect(body.status.missingRequirements[0]).toMatch(/FINALIZED/);
    // Ensure no error key leaks out
    expect(body.error).toBeUndefined();
  });

  it("GET /api/whitelist/status returns 200 with program info when program is UPCOMING (non-OPEN regression)", async () => {
    vi.mocked(prisma.wLProgram.findUnique).mockResolvedValueOnce({
      id: "p-upcoming",
      slug: "chimphood-wl-main",
      name: "Main WL",
      totalSlots: 500,
      allocatedSlotsCount: 0,
      status: "UPCOMING",
    } as any);
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s2",
      userId: "u2",
      address: "0xdef",
    });

    const { WhitelistError } = await import("@/server/whitelist/qualification");
    vi.mocked(evaluateUserQualification).mockRejectedValueOnce(
      new WhitelistError(
        "PROGRAM_NOT_ACTIVE",
        "Whitelist program is not open (current status: UPCOMING).",
        400,
      ),
    );

    const req = new Request("http://localhost:3000/api/whitelist/status");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.program.status).toBe("UPCOMING");
    expect(body.status.qualified).toBe(false);
    expect(body.status.missingRequirements[0]).toMatch(/UPCOMING/);
    expect(body.error).toBeUndefined();
  });

  it("GET /api/whitelist/status returns the WhitelistError status for other WhitelistError codes", async () => {
    vi.mocked(prisma.wLProgram.findUnique).mockResolvedValueOnce({
      id: "p1",
      slug: "chimphood-wl-main",
      name: "Main WL",
      totalSlots: 10,
      allocatedSlotsCount: 2,
      status: "OPEN",
    } as any);
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s3",
      userId: "u-missing",
      address: "0x999",
    });

    const { WhitelistError } = await import("@/server/whitelist/qualification");
    vi.mocked(evaluateUserQualification).mockRejectedValueOnce(
      new WhitelistError("USER_NOT_FOUND", "User not found.", 404),
    );

    const req = new Request("http://localhost:3000/api/whitelist/status");
    const res = await GET(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("USER_NOT_FOUND");
  });

  it("GET /api/whitelist/status returns 500 for truly unexpected errors", async () => {
    vi.mocked(prisma.wLProgram.findUnique).mockResolvedValueOnce({
      id: "p1",
      slug: "chimphood-wl-main",
      name: "Main WL",
      totalSlots: 10,
      allocatedSlotsCount: 2,
      status: "OPEN",
    } as any);
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s4",
      userId: "u1",
      address: "0x123",
    });

    vi.mocked(evaluateUserQualification).mockRejectedValueOnce(
      new Error("Database connection lost"),
    );

    const req = new Request("http://localhost:3000/api/whitelist/status");
    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("SERVER_ERROR");
  });

  // ==========================================
  // Phase 7 Task 7.1 — Status API & Contract
  // ==========================================
  describe("Phase 7: User Status & Transparency", () => {
    it("returns reviewStatus and slotNumber for active GTD slot holder, prioritizing GTD over FCFS", async () => {
      vi.mocked(authenticateRequest).mockResolvedValue({
        sessionId: "s-gtd",
        userId: "user-gtd",
        address: "0x1111111111111111111111111111111111111111",
      });

      // User has both a GTD slot and a legacy/directory queue entry
      vi.mocked(prisma.wLSlot.findFirst).mockResolvedValueOnce({
        slotNumber: 42,
        status: "ALLOCATED",
        reviewStatus: "FLAGGED",
        reviewedAt: new Date("2026-10-25T10:00:00.000Z"),
        allocatedAt: new Date("2026-10-20T10:00:00.000Z"),
      } as any);

      vi.mocked(prisma.wLQueueEntry.findUnique).mockResolvedValueOnce({
        queueNumber: 5,
        joinedAt: new Date("2026-10-15T00:00:00.000Z"),
        status: "PROCESSED",
      } as any);

      vi.mocked(evaluateUserQualification).mockResolvedValueOnce({
        qualified: true,
        phase: "SLOT_ALLOCATED",
        slotNumber: 42,
        missingRequirements: [],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          xUsername: "chimphood_ape",
          xProfileImageUrl: "https://example.com/avatar.jpg",
          heldCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
          missingCategories: [],
          completedMandatoryTasksCount: 2,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      });

      const req = new Request("http://localhost:3000/api/whitelist/status");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.configured).toBe(true);
      expect(body.status.phase).toBe("SLOT_ALLOCATED");
      expect(body.status.slotNumber).toBe(42);
      expect(body.status.reviewStatus).toBe("FLAGGED");
      expect(body.status.reviewedAt).toBe("2026-10-25T10:00:00.000Z");
      expect(body.status.allocatedAt).toBe("2026-10-20T10:00:00.000Z");
      expect(body.status.qualified).toBe(true);
      expect(body.status.isFullyQualified).toBe(true);
      expect(body.status.missingRequirements).toEqual([]);
      // Ensure GTD is strictly prioritized over FCFS
      expect(body.status.queueNumber).toBeUndefined();
    });

    it("returns FCFS_REGISTERED with immutable joinedAt and queueNumber for user who is registered but not yet qualified", async () => {
      vi.mocked(authenticateRequest).mockResolvedValue({
        sessionId: "s-fcfs-incomplete",
        userId: "user-fcfs-1",
        address: "0x2222222222222222222222222222222222222222",
      });

      // No active GTD slot
      vi.mocked(prisma.wLSlot.findFirst).mockResolvedValueOnce(null);

      // Has WLQueueEntry (registered in FCFS Directory via wallet + X connection per DEC-013)
      const registeredJoinedAt = new Date("2026-10-18T14:20:00.000Z");
      vi.mocked(prisma.wLQueueEntry.findUnique).mockResolvedValueOnce({
        queueNumber: 77,
        joinedAt: registeredJoinedAt,
        status: "WAITING",
      } as any);

      vi.mocked(evaluateUserQualification).mockResolvedValueOnce({
        qualified: false,
        phase: "NONE",
        missingRequirements: [
          "Missing trait categories: CLOTHING, HEADWEAR.",
          "Incomplete task: Genesis Quest.",
        ],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          xUsername: "fcfs_chimp",
          heldCategories: ["BG", "FUR", "EYEWEAR"],
          missingCategories: ["CLOTHING", "HEADWEAR"],
          completedMandatoryTasksCount: 1,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      });

      const req = new Request("http://localhost:3000/api/whitelist/status");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.status.phase).toBe("FCFS_REGISTERED");
      expect(body.status.queueNumber).toBe(77);
      expect(body.status.joinedAt).toBe(registeredJoinedAt.toISOString());
      expect(body.status.qualified).toBe(false);
      expect(body.status.isFullyQualified).toBe(false);
      expect(body.status.missingRequirements).toHaveLength(2);
      expect(body.status.missingRequirements).toContain(
        "Missing trait categories: CLOTHING, HEADWEAR.",
      );
      expect(body.status.queueRank).toBeUndefined();
    });

    it("returns FCFS_REGISTERED with isFullyQualified: true for fully qualified participant without GTD", async () => {
      vi.mocked(authenticateRequest).mockResolvedValue({
        sessionId: "s-fcfs-complete",
        userId: "user-fcfs-2",
        address: "0x3333333333333333333333333333333333333333",
      });

      vi.mocked(prisma.wLSlot.findFirst).mockResolvedValueOnce(null);

      const registeredJoinedAt = new Date("2026-10-16T11:00:00.000Z");
      vi.mocked(prisma.wLQueueEntry.findUnique).mockResolvedValueOnce({
        queueNumber: 15,
        joinedAt: registeredJoinedAt,
        status: "WAITING",
      } as any);

      vi.mocked(evaluateUserQualification).mockResolvedValueOnce({
        qualified: true,
        phase: "IN_QUEUE", // Legacy qualification engine return value
        missingRequirements: [],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          xUsername: "alpha_chimp",
          heldCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
          missingCategories: [],
          completedMandatoryTasksCount: 2,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      });

      const req = new Request("http://localhost:3000/api/whitelist/status");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.status.phase).toBe("FCFS_REGISTERED");
      expect(body.status.queueNumber).toBe(15);
      expect(body.status.joinedAt).toBe(registeredJoinedAt.toISOString());
      expect(body.status.qualified).toBe(true);
      expect(body.status.isFullyQualified).toBe(true);
      expect(body.status.missingRequirements).toEqual([]);
      // DEC-018: Never return queueRank or portray as waiting queue
      expect(body.status.queueRank).toBeUndefined();
      expect(body.status.slotNumber).toBeUndefined();
    });

    it("returns phase: NONE when user is not registered in FCFS Directory and holds no GTD slot", async () => {
      vi.mocked(authenticateRequest).mockResolvedValue({
        sessionId: "s-unregistered",
        userId: "user-unregistered",
        address: "0x4444444444444444444444444444444444444444",
      });

      vi.mocked(prisma.wLSlot.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.wLQueueEntry.findUnique).mockResolvedValueOnce(null);

      vi.mocked(evaluateUserQualification).mockResolvedValueOnce({
        qualified: false,
        phase: "NONE",
        missingRequirements: [
          "Linked X (Twitter) account required.",
          "Missing trait categories: BG, FUR, CLOTHING, HEADWEAR, EYEWEAR.",
        ],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: false,
          heldCategories: [],
          missingCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
          completedMandatoryTasksCount: 0,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      });

      const req = new Request("http://localhost:3000/api/whitelist/status");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.status.phase).toBe("NONE");
      expect(body.status.qualified).toBe(false);
      expect(body.status.isFullyQualified).toBe(false);
      expect(body.status.queueNumber).toBeUndefined();
      expect(body.status.joinedAt).toBeUndefined();
      expect(body.status.slotNumber).toBeUndefined();
      expect(body.status.missingRequirements).toContain(
        "Linked X (Twitter) account required.",
      );
    });

    it("prioritizes REVOKED status over FCFS_REGISTERED when a user has a revoked slot/qualification but still has a WLQueueEntry (DEC-022)", async () => {
      vi.mocked(authenticateRequest).mockResolvedValue({
        sessionId: "s-revoked-user",
        userId: "user-revoked-gtd",
        address: "0x6666666666666666666666666666666666666666",
      });

      // No active slot (ALLOCATED / CONFIRMED returns null)
      vi.mocked(prisma.wLSlot.findFirst)
        .mockResolvedValueOnce(null) // For active slot query
        .mockResolvedValueOnce({
          id: "slot-revoked",
          slotNumber: 7,
          notes: "Multi-accounting sybil detection",
          status: "REVOKED_MANUAL_ADMIN",
        } as any); // For revokedSlot check

      // User still has an existing WLQueueEntry from initial registration
      vi.mocked(prisma.wLQueueEntry.findUnique).mockResolvedValueOnce({
        queueNumber: 99,
        joinedAt: new Date("2026-10-15T08:00:00.000Z"),
        status: "WAITING",
      } as any);

      // WLQualification status is REVOKED
      vi.mocked(prisma.wLQualification.findUnique).mockResolvedValueOnce({
        status: "REVOKED",
        reason: "Multi-accounting sybil detection",
      } as any);

      vi.mocked(evaluateUserQualification).mockResolvedValueOnce({
        qualified: false,
        phase: "REVOKED",
        missingRequirements: [
          "Whitelist qualification revoked: Multi-accounting sybil detection",
        ],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          heldCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
          missingCategories: [],
          completedMandatoryTasksCount: 2,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      });

      const req = new Request("http://localhost:3000/api/whitelist/status");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();

      // DEC-022: REVOKED strictly takes priority over FCFS_REGISTERED
      expect(body.status.phase).toBe("REVOKED");
      expect(body.status.qualified).toBe(false);
      expect(body.status.isFullyQualified).toBe(false);
      expect(body.status.queueNumber).toBeUndefined(); // Never expose as active FCFS participant
      expect(body.status.slotNumber).toBeUndefined();
      expect(body.status.missingRequirements).toContain(
        "Whitelist qualification revoked: Multi-accounting sybil detection",
      );
    });

    it("strictly enforces read-only behavior with zero database mutations on GET", async () => {
      vi.mocked(authenticateRequest).mockResolvedValue({
        sessionId: "s-ro",
        userId: "user-ro",
        address: "0x5555555555555555555555555555555555555555",
      });

      vi.mocked(prisma.wLSlot.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.wLQueueEntry.findUnique).mockResolvedValueOnce(null);

      vi.mocked(evaluateUserQualification).mockResolvedValueOnce({
        qualified: false,
        phase: "NONE",
        missingRequirements: [],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          heldCategories: [],
          missingCategories: [],
          completedMandatoryTasksCount: 0,
          totalMandatoryTasksCount: 0,
          isBanned: false,
        },
      });

      const req = new Request("http://localhost:3000/api/whitelist/status");
      const res = await GET(req);

      expect(res.status).toBe(200);

      // Verify evaluateUserQualification received readOnly: true
      expect(evaluateUserQualification).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: "user-ro",
          programId: "p1",
          readOnly: true,
        }),
      );

      // Verify zero mutative operations were called on any prisma model
      expect(prisma.wLSlot.create).not.toHaveBeenCalled();
      expect(prisma.wLSlot.update).not.toHaveBeenCalled();
      expect(prisma.wLSlot.updateMany).not.toHaveBeenCalled();
      expect(prisma.wLSlot.delete).not.toHaveBeenCalled();
      expect(prisma.wLQueueEntry.create).not.toHaveBeenCalled();
      expect(prisma.wLQueueEntry.update).not.toHaveBeenCalled();
      expect(prisma.wLQueueEntry.updateMany).not.toHaveBeenCalled();
      expect(prisma.wLQueueEntry.delete).not.toHaveBeenCalled();
    });
  });
});
