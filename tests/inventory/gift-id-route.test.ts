import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/gifts/[id]/route";

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

vi.mock("@/server/inventory/gift", () => ({
  acceptGift: vi.fn(),
  rejectOrCancelGift: vi.fn(),
  GiftError: class GiftError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number = 400) {
      super(message);
      this.name = "GiftError";
      this.code = code;
      this.status = status;
    }
  },
}));

vi.mock("@/server/inventory/avatar-renderer", () => ({
  safeTriggerAvatarUpdate: vi.fn(),
}));

import { authenticateRequest } from "@/server/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { acceptGift, rejectOrCancelGift, GiftError } from "@/server/inventory/gift";

describe("POST /api/gifts/[id] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(authenticateRequest).mockResolvedValueOnce(null);

    const req = new Request("http://localhost:3000/api/gifts/gift-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ACCEPT" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "gift-1" }) });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("UNAUTHORIZED");
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(authenticateRequest).mockResolvedValueOnce({
      sessionId: "s1",
      userId: "u1",
      address: "0x123",
    });

    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 30,
    });

    const req = new Request("http://localhost:3000/api/gifts/gift-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ACCEPT" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "gift-1" }) });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    const json = await res.json();
    expect(json.error).toBe("RATE_LIMITED");
  });

  it("returns 400 when body has invalid action", async () => {
    vi.mocked(authenticateRequest).mockResolvedValueOnce({
      sessionId: "s1",
      userId: "u1",
      address: "0x123",
    });

    const req = new Request("http://localhost:3000/api/gifts/gift-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "INVALID_ACTION" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "gift-1" }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_ACTION");
  });

  it("calls acceptGift and returns 200 on valid ACCEPT action", async () => {
    vi.mocked(authenticateRequest).mockResolvedValueOnce({
      sessionId: "s1",
      userId: "u1",
      address: "0x123",
    });

    vi.mocked(acceptGift).mockResolvedValueOnce({
      outcome: "SUCCESS",
      gift: { id: "gift-1", senderId: "u2", status: "ACCEPTED" } as any,
      item: { id: "item-1" } as any,
    } as any);

    const req = new Request("http://localhost:3000/api/gifts/gift-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ACCEPT" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "gift-1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(acceptGift).toHaveBeenCalledWith(expect.anything(), {
      userId: "u1",
      giftId: "gift-1",
    });
  });

  it("calls rejectOrCancelGift on CANCEL action", async () => {
    vi.mocked(authenticateRequest).mockResolvedValueOnce({
      sessionId: "s1",
      userId: "u1",
      address: "0x123",
    });

    vi.mocked(rejectOrCancelGift).mockResolvedValueOnce({
      id: "gift-1",
      status: "CANCELLED",
    } as any);

    const req = new Request("http://localhost:3000/api/gifts/gift-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CANCEL", reason: "Mistake" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "gift-1" }) });
    expect(res.status).toBe(200);
    expect(rejectOrCancelGift).toHaveBeenCalledWith(expect.anything(), {
      userId: "u1",
      giftId: "gift-1",
      action: "CANCEL",
      reason: "Mistake",
    });
  });

  it("returns GiftError status and code on service failure", async () => {
    vi.mocked(authenticateRequest).mockResolvedValueOnce({
      sessionId: "s1",
      userId: "u1",
      address: "0x123",
    });

    vi.mocked(acceptGift).mockRejectedValueOnce(
      new GiftError(
        "RECEIVER_GIFT_RESTRICTED",
        "Your account is restricted from receiving gifts.",
        403,
      ),
    );

    const req = new Request("http://localhost:3000/api/gifts/gift-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ACCEPT" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "gift-1" }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("RECEIVER_GIFT_RESTRICTED");
  });
});
