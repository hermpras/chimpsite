import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/whitelist/status/route";
import { POST } from "@/app/api/whitelist/qualify/route";

vi.mock("@/server/auth/session", () => ({
  authenticateRequest: vi.fn(),
}));

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
  },
}));

import { authenticateRequest } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { evaluateUserQualification } from "@/server/whitelist/qualification";

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
});
