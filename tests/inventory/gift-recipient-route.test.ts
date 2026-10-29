import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/gifts/recipient/route";
import { lookupGiftRecipient } from "@/lib/inventory/gift-client";

const { mockUserFindFirst, mockXIdentityFindFirst, mockWalletIdentityFindUnique, mockInventoryItemCount } = vi.hoisted(() => ({
  mockUserFindFirst: vi.fn(),
  mockXIdentityFindFirst: vi.fn(),
  mockWalletIdentityFindUnique: vi.fn(),
  mockInventoryItemCount: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    user: {
      findFirst: mockUserFindFirst,
    },
    xIdentity: {
      findFirst: mockXIdentityFindFirst,
    },
    walletIdentity: {
      findUnique: mockWalletIdentityFindUnique,
    },
    inventoryItem: {
      count: mockInventoryItemCount,
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

import { authenticateRequest } from "@/server/auth/session";

describe("/api/gifts/recipient route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInventoryItemCount.mockResolvedValue(0);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue(null);
    const req = new Request("https://chimphood.xyz/api/gifts/recipient?q=alice");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when query parameter q is missing or blank", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0xsender",
    });
    const req = new Request("https://chimphood.xyz/api/gifts/recipient?q=");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("INVALID_INPUT");
    expect(data.message).toBe("Username or wallet address query is required.");
  });

  it("returns 404 when user is not found", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0xsender",
    });
    mockWalletIdentityFindUnique.mockResolvedValue(null);
    mockXIdentityFindFirst.mockResolvedValue(null);

    const req = new Request("https://chimphood.xyz/api/gifts/recipient?q=nonexistent");
    const res = await GET(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("RECIPIENT_NOT_FOUND");
    expect(data.message).toContain("No ChimpHood account found linked to @nonexistent");
  });

  it("finds recipient by X username, normalizes @ prefix, and checks rules", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0xsender",
    });

    mockXIdentityFindFirst.mockResolvedValue({
      user: {
        id: "u2",
        role: "USER",
        isBanned: false,
        wallet: { address: "0x2222222222222222222222222222222222222222" },
        xIdentity: {
          username: "alice",
          name: "Alice Chimp",
          profileImageUrl: "https://example.com/alice.png",
        },
        wlSlots: [],
        banRecords: [],
      },
    });

    const req = new Request("https://chimphood.xyz/api/gifts/recipient?q=@alice&traitId=trait-1");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.recipient.userId).toBe("u2");
    expect(data.recipient.address).toBe("0x2222222222222222222222222222222222222222");
    expect(data.recipient.xUsername).toBe("alice");
    expect(data.recipient.xName).toBe("Alice Chimp");
    expect(data.recipient.canReceive).toBe(true);
    expect(data.recipient.isSelf).toBe(false);
    expect(data.recipient.isWlAllocated).toBe(false);
    expect(data.recipient.alreadyOwnsTrait).toBe(false);
    expect(data.recipient.isBanned).toBe(false);
  });

  it("finds recipient by EVM wallet address", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0xsender",
    });

    mockWalletIdentityFindUnique.mockResolvedValue({
      user: {
        id: "u2",
        role: "USER",
        isBanned: false,
        wallet: { address: "0x2222222222222222222222222222222222222222" },
        xIdentity: {
          username: "alice_wallet",
          name: "Alice Wallet",
          profileImageUrl: null,
        },
        wlSlots: [],
        banRecords: [],
      },
    });

    const req = new Request("https://chimphood.xyz/api/gifts/recipient?q=0x2222222222222222222222222222222222222222");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.recipient.userId).toBe("u2");
    expect(data.recipient.address).toBe("0x2222222222222222222222222222222222222222");
    expect(data.recipient.xUsername).toBe("alice_wallet");
    expect(data.recipient.canReceive).toBe(true);
  });

  it("detects when recipient is self", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0xsender",
    });

    mockXIdentityFindFirst.mockResolvedValue({
      user: {
        id: "u1",
        role: "USER",
        isBanned: false,
        wallet: { address: "0xsender" },
        xIdentity: { username: "sender_user", name: "Sender", profileImageUrl: null },
        wlSlots: [],
        banRecords: [],
      },
    });

    const req = new Request("https://chimphood.xyz/api/gifts/recipient?q=sender_user");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.recipient.isSelf).toBe(true);
    expect(data.recipient.canReceive).toBe(false);
  });

  it("detects when recipient already owns the trait", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0xsender",
    });

    mockXIdentityFindFirst.mockResolvedValue({
      user: {
        id: "u2",
        role: "USER",
        isBanned: false,
        wallet: { address: "0xreceiver" },
        xIdentity: { username: "bob", name: "Bob", profileImageUrl: null },
        wlSlots: [],
        banRecords: [],
      },
    });
    // Recipient already owns an item with trait-1
    mockInventoryItemCount.mockResolvedValue(1);

    const req = new Request("https://chimphood.xyz/api/gifts/recipient?q=bob&traitId=trait-1");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.recipient.alreadyOwnsTrait).toBe(true);
    expect(data.recipient.canReceive).toBe(false);
  });

  it("detects when recipient has an allocated Whitelist slot", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0xsender",
    });

    mockXIdentityFindFirst.mockResolvedValue({
      user: {
        id: "u3",
        role: "USER",
        isBanned: false,
        wallet: { address: "0xreceiver" },
        xIdentity: { username: "charlie", name: "Charlie", profileImageUrl: null },
        wlSlots: [{ id: "wl-1", status: "ALLOCATED" }],
        banRecords: [],
      },
    });

    const req = new Request("https://chimphood.xyz/api/gifts/recipient?q=charlie");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.recipient.isWlAllocated).toBe(true);
    expect(data.recipient.canReceive).toBe(false);
  });

  it("detects when recipient is banned via active banRecords", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0xsender",
    });

    mockXIdentityFindFirst.mockResolvedValue({
      user: {
        id: "u4",
        role: "USER",
        isBanned: false,
        wallet: { address: "0xreceiver" },
        xIdentity: { username: "banned_user", name: "Banned", profileImageUrl: null },
        wlSlots: [],
        banRecords: [{ id: "ban-1", isActive: true, scope: "FULL_SYSTEM" }],
      },
    });

    const req = new Request("https://chimphood.xyz/api/gifts/recipient?q=banned_user");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.recipient.isBanned).toBe(true);
    expect(data.recipient.canReceive).toBe(false);
  });

  it("detects when recipient has isBanned flag set to true", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0xsender",
    });

    mockXIdentityFindFirst.mockResolvedValue({
      user: {
        id: "u5",
        role: "USER",
        isBanned: true,
        wallet: { address: "0xreceiver" },
        xIdentity: { username: "flagged_user", name: "Flagged", profileImageUrl: null },
        wlSlots: [],
        banRecords: [],
      },
    });

    const req = new Request("https://chimphood.xyz/api/gifts/recipient?q=flagged_user");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.recipient.isBanned).toBe(true);
    expect(data.recipient.canReceive).toBe(false);
  });

  it("returns 500 JSON response with error details when database query throws", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0xsender",
    });
    mockXIdentityFindFirst.mockRejectedValue(new Error("Unknown field 'bans' for include statement on model 'User'"));

    const req = new Request("https://chimphood.xyz/api/gifts/recipient?q=broken_query");
    const res = await GET(req);
    expect(res.status).toBe(500);

    const data = await res.json();
    expect(data.error).toBe("INTERNAL_ERROR");
    expect(data.message).toContain("Unknown field 'bans'");
  });
});

describe("lookupGiftRecipient client helper", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("successfully parses valid recipient JSON from server", async () => {
    const mockRecipient = {
      userId: "u2",
      address: "0x2222222222222222222222222222222222222222",
      xUsername: "alice",
      canReceive: true,
      isSelf: false,
      isBanned: false,
      isWlAllocated: false,
      alreadyOwnsTrait: false,
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, recipient: mockRecipient }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await lookupGiftRecipient("alice", "trait-1");
    expect(res.success).toBe(true);
    expect(res.recipient.xUsername).toBe("alice");
  });

  it("gracefully handles 500 HTML or empty non-JSON server error without crashing on JSON parsing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html><body>500 Internal Server Error</body></html>", {
        status: 500,
        headers: { "Content-Type": "text/html" },
      }),
    );

    await expect(lookupGiftRecipient("alice")).rejects.toThrow(
      "Server error occurred while searching recipient. Please try again later.",
    );
  });

  it("gracefully handles 404 response with custom error message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "RECIPIENT_NOT_FOUND",
          message: "No ChimpHood account found linked to @alice.",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(lookupGiftRecipient("alice")).rejects.toThrow(
      "No ChimpHood account found linked to @alice.",
    );
  });
});
