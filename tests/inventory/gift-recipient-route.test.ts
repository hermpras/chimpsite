import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/gifts/recipient/route";

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
        wallet: { address: "0x2222222222222222222222222222222222222222" },
        xIdentity: {
          username: "alice",
          name: "Alice Chimp",
          profileImageUrl: "https://example.com/alice.png",
        },
        wlSlots: [],
        bans: [],
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
        wallet: { address: "0xsender" },
        xIdentity: { username: "sender_user", name: "Sender", profileImageUrl: null },
        wlSlots: [],
        bans: [],
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
        wallet: { address: "0xreceiver" },
        xIdentity: { username: "bob", name: "Bob", profileImageUrl: null },
        wlSlots: [],
        bans: [],
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
        wallet: { address: "0xreceiver" },
        xIdentity: { username: "charlie", name: "Charlie", profileImageUrl: null },
        wlSlots: [{ id: "wl-1", status: "ALLOCATED" }],
        bans: [],
      },
    });

    const req = new Request("https://chimphood.xyz/api/gifts/recipient?q=charlie");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.recipient.isWlAllocated).toBe(true);
    expect(data.recipient.canReceive).toBe(false);
  });

  it("detects when recipient is banned from gifting", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0xsender",
    });

    mockXIdentityFindFirst.mockResolvedValue({
      user: {
        id: "u4",
        role: "USER",
        wallet: { address: "0xreceiver" },
        xIdentity: { username: "banned_user", name: "Banned", profileImageUrl: null },
        wlSlots: [],
        bans: [{ id: "ban-1", isActive: true, scope: "FULL_SYSTEM" }],
      },
    });

    const req = new Request("https://chimphood.xyz/api/gifts/recipient?q=banned_user");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.recipient.isBanned).toBe(true);
    expect(data.recipient.canReceive).toBe(false);
  });
});
