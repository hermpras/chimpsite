import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/gifts/route";

const { mockGiftFindMany } = vi.hoisted(() => ({
  mockGiftFindMany: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    gift: {
      findMany: mockGiftFindMany,
    },
  },
}));

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
  sendGift: vi.fn(),
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

import { authenticateRequest } from "@/server/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";

describe("/api/gifts route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns 401 when unauthenticated", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("GET returns sent and received gifts querying only minimum public wallet fields", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0x123",
    });

    mockGiftFindMany
      .mockResolvedValueOnce([
        {
          id: "g-sent",
          senderId: "u1",
          receiverId: "u2",
          inventoryItem: { id: "inv-1", trait: { name: "Hoodie" } },
          receiver: { id: "u2", wallet: { address: "0xreceiver" } },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "g-rec",
          senderId: "u3",
          receiverId: "u1",
          inventoryItem: { id: "inv-2", trait: { name: "Cap" } },
          sender: { id: "u3", wallet: { address: "0xsender" } },
        },
      ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sentGifts).toHaveLength(1);
    expect(data.receivedGifts).toHaveLength(1);
    expect(data.sentGifts[0].receiver.wallet).toEqual({ address: "0xreceiver" });
    expect(data.receivedGifts[0].sender.wallet).toEqual({ address: "0xsender" });

    // Assert findMany used select: { id: true, wallet: { select: { address: true } } }
    expect(mockGiftFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { senderId: "u1" },
        include: expect.objectContaining({
          receiver: {
            select: {
              id: true,
              wallet: {
                select: {
                  address: true,
                },
              },
            },
          },
        }),
      }),
    );
  });

  it("POST returns 401 when unauthenticated", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue(null);
    const req = new Request("http://localhost:3000/api/gifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiverAddress: "0x123", inventoryItemId: "inv-1" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("POST returns 400 when missing fields", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0x123",
    });

    const req = new Request("http://localhost:3000/api/gifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("POST returns 429 when rate limit is exceeded (Task 3-B)", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0x123",
    });

    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 30,
    });

    const req = new Request("http://localhost:3000/api/gifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiverAddress: "0x456", inventoryItemId: "inv-1" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    const body = await res.json();
    expect(body.error).toBe("RATE_LIMITED");
    expect(checkRateLimit).toHaveBeenCalledWith("gifts-send:0x123", 10, 60_000);
  });

  it("POST returns 500 when rate limiter fails closed (Task 3-B)", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0x123",
    });

    vi.mocked(checkRateLimit).mockRejectedValueOnce(new Error("Redis offline"));

    const req = new Request("http://localhost:3000/api/gifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiverAddress: "0x456", inventoryItemId: "inv-1" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("SERVER_ERROR");
  });
});
