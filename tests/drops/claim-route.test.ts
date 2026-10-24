import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, GET } from "@/app/api/drops/claim/route";

vi.mock("@/server/db", () => ({ prisma: { __fake: true } }));

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

vi.mock("@/server/drops/claim", () => ({
  claimDrop: vi.fn(),
  DropClaimError: class DropClaimError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number = 400) {
      super(message);
      this.name = "DropClaimError";
      this.code = code;
      this.status = status;
    }
  },
}));

import { authenticateRequest } from "@/server/auth/session";
import { claimDrop, DropClaimError } from "@/server/drops/claim";
import { checkRateLimit } from "@/lib/auth/rate-limit";

describe("POST /api/drops/claim route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 405 on GET", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
  });

  it("returns 401 if unauthenticated", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/drops/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dropId: "d1", periodId: "p1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 if dropId or periodId missing", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0x123",
    });

    const req = new Request("http://localhost:3000/api/drops/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dropId: "d1" }), // missing periodId
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 on successful claim", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0x123",
    });

    vi.mocked(claimDrop).mockResolvedValue({
      claim: { id: "claim-1", claimedAt: new Date() } as any,
      inventoryItem: { id: "inv-1", edition: 1 } as any,
      trait: { id: "t1", name: "Jungle Mist" } as any,
      probabilities: [],
    });

    const req = new Request("http://localhost:3000/api/drops/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dropId: "d1", periodId: "p1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.claimId).toBe("claim-1");
  });

  it("maps DropClaimError code and status properly", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0x123",
    });

    vi.mocked(claimDrop).mockRejectedValue(
      new DropClaimError(
        "WL_HOLDER_CLAIM_PROHIBITED",
        "WL holders cannot claim drops",
        403,
      ),
    );

    const req = new Request("http://localhost:3000/api/drops/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dropId: "d1", periodId: "p1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("WL_HOLDER_CLAIM_PROHIBITED");
  });

  it("returns 429 when rate limit is exceeded on claim (Task 3-B)", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0x123",
    });

    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 45,
    });

    const req = new Request("http://localhost:3000/api/drops/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dropId: "d1", periodId: "p1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("45");
    const body = await res.json();
    expect(body.error).toBe("RATE_LIMITED");
    expect(checkRateLimit).toHaveBeenCalledWith("drops-claim:0x123", 5, 120_000);
  });

  it("returns 500 when rate limiter fails closed (Task 3-B)", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0x123",
    });

    vi.mocked(checkRateLimit).mockRejectedValueOnce(
      new Error("Redis connection dropped"),
    );

    const req = new Request("http://localhost:3000/api/drops/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dropId: "d1", periodId: "p1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("SERVER_ERROR");
  });
});
