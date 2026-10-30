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
});
