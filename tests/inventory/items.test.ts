import { describe, it, expect, vi, beforeEach } from "vitest";
import { getUserInventory, InventoryError } from "@/server/inventory/items";
import { GET } from "@/app/api/user/inventory/route";
import { authenticateRequest } from "@/server/auth/session";

const { mockWalletFindUnique, mockInventoryFindMany } = vi.hoisted(() => ({
  mockWalletFindUnique: vi.fn(),
  mockInventoryFindMany: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    walletIdentity: {
      findUnique: mockWalletFindUnique,
    },
    inventoryItem: {
      findMany: mockInventoryFindMany,
    },
  },
}));

vi.mock("@/server/auth/session", () => ({
  authenticateRequest: vi.fn(),
}));

describe("Task 3-A: Inventory Service & API (server/inventory/items.ts & route.ts)", () => {
  const mockPrisma = {
    walletIdentity: {
      findUnique: mockWalletFindUnique,
    },
    inventoryItem: {
      findMany: mockInventoryFindMany,
    },
  } as any;

  const validAddressLower = "0x1234567890123456789012345678901234567890";
  const validAddressChecksum = "0x1234567890123456789012345678901234567890"
    .toUpperCase()
    .replace("0X", "0x");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Service: getUserInventory", () => {
    it("throws MISSING_ADDRESS when address is undefined, empty, or whitespace", async () => {
      await expect(getUserInventory(mockPrisma, "")).rejects.toThrow(InventoryError);
      await expect(getUserInventory(mockPrisma, "   ")).rejects.toThrow(
        /Wallet address is required/,
      );
      await expect(getUserInventory(mockPrisma, null as any)).rejects.toThrow(
        /Wallet address is required/,
      );
    });

    it("throws INVALID_ADDRESS when address is not a valid 40-hex EVM address", async () => {
      await expect(getUserInventory(mockPrisma, "not-an-address")).rejects.toThrow(
        InventoryError,
      );
      await expect(getUserInventory(mockPrisma, "0x123")).rejects.toThrow(
        /Invalid EVM wallet address format/,
      );
      await expect(
        getUserInventory(mockPrisma, "0xzzzz567890123456789012345678901234567890"),
      ).rejects.toThrow(/Invalid EVM wallet address format/);
    });

    it("normalizes checksum/mixed-case EVM address to lowercase for DB lookup", async () => {
      mockWalletFindUnique.mockResolvedValueOnce(null);

      const result = await getUserInventory(mockPrisma, validAddressChecksum);

      expect(mockWalletFindUnique).toHaveBeenCalledWith({
        where: { address: validAddressLower },
        select: { userId: true },
      });
      expect(result).toEqual({ items: [] });
    });

    it("returns empty items array when wallet does not exist in database", async () => {
      mockWalletFindUnique.mockResolvedValueOnce(null);

      const result = await getUserInventory(mockPrisma, validAddressLower);

      expect(result).toEqual({ items: [] });
      expect(mockInventoryFindMany).not.toHaveBeenCalled();
    });

    it("returns only inventory belonging to the resolved wallet ownerId", async () => {
      const userId = "user-abc-123";
      mockWalletFindUnique.mockResolvedValueOnce({ userId });

      const fakeDate = new Date("2026-10-15T10:00:00.000Z");
      mockInventoryFindMany.mockResolvedValueOnce([
        {
          id: "item-1",
          ownerId: userId,
          edition: 1,
          acquiredVia: "CLAIM",
          isLocked: false,
          lockReason: null,
          createdAt: fakeDate,
          trait: {
            id: "trait-hoodie",
            slug: "chimp-hoodie",
            name: "Chimp Hoodie",
            category: "CLOTHING",
            rarity: "RARE",
            imageUrl: "https://assets.chimphood.io/traits/hoodie.png",
            description: "Signature hoodie",
          },
        },
        {
          id: "item-2",
          ownerId: userId,
          edition: 4,
          acquiredVia: "GIFT",
          isLocked: true,
          lockReason: "PENDING_GIFT",
          createdAt: fakeDate,
          trait: {
            id: "trait-crown",
            slug: "gold-crown",
            name: "Gold Crown",
            category: "HEADWEAR",
            rarity: "LEGENDARY",
            imageUrl: "https://assets.chimphood.io/traits/crown.png",
            description: null,
          },
        },
      ]);

      const result = await getUserInventory(mockPrisma, validAddressLower);

      expect(mockInventoryFindMany).toHaveBeenCalledWith({
        where: { ownerId: userId },
        include: { trait: true },
        orderBy: [{ createdAt: "desc" }, { edition: "asc" }],
      });

      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual({
        id: "item-1",
        edition: 1,
        acquiredVia: "CLAIM",
        acquiredAt: "2026-10-15T10:00:00.000Z",
        isLocked: false,
        lockReason: null,
        trait: {
          id: "trait-hoodie",
          name: "Chimp Hoodie",
          category: "CLOTHING",
          rarity: "RARE",
          imageUrl: "https://assets.chimphood.io/traits/hoodie.png",
          description: "Signature hoodie",
        },
      });
      expect(result.items[1].isLocked).toBe(true);
      expect(result.items[1].lockReason).toBe("PENDING_GIFT");
    });
  });

  describe("Route: GET /api/user/inventory", () => {
    it("returns 400 MISSING_ADDRESS when address query param is missing and unauthenticated", async () => {
      vi.mocked(authenticateRequest).mockResolvedValueOnce(null);

      const req = new Request("http://localhost:3000/api/user/inventory");
      const res = await GET(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("MISSING_ADDRESS");
    });

    it("returns 400 INVALID_ADDRESS when address format is malformed", async () => {
      const req = new Request(
        "http://localhost:3000/api/user/inventory?address=invalid-eth",
      );
      const res = await GET(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_ADDRESS");
    });

    it("returns 200 with empty array for wallet with no inventory", async () => {
      mockWalletFindUnique.mockResolvedValueOnce(null);

      const req = new Request(
        `http://localhost:3000/api/user/inventory?address=${validAddressLower}`,
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ items: [] });
    });

    it("returns 200 with inventory items for valid wallet query", async () => {
      mockWalletFindUnique.mockResolvedValueOnce({ userId: "u-456" });
      mockInventoryFindMany.mockResolvedValueOnce([
        {
          id: "item-10",
          ownerId: "u-456",
          edition: 2,
          acquiredVia: "CLAIM",
          isLocked: false,
          lockReason: null,
          createdAt: new Date("2026-10-16T12:00:00.000Z"),
          trait: {
            id: "t-1",
            name: "Neon Shades",
            category: "EYEWEAR",
            rarity: "UNCOMMON",
            imageUrl: "/traits/shades.png",
            description: "Glowing cyberpunk eyewear",
          },
        },
      ]);

      const req = new Request(
        `http://localhost:3000/api/user/inventory?address=${validAddressLower}`,
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.items).toHaveLength(1);
      expect(data.items[0].trait.name).toBe("Neon Shades");
      expect(data.items[0].edition).toBe(2);
    });

    it("falls back to authenticated session address if query param is omitted", async () => {
      vi.mocked(authenticateRequest).mockResolvedValueOnce({
        sessionId: "s1",
        userId: "u-session",
        address: validAddressLower,
      });

      mockWalletFindUnique.mockResolvedValueOnce({ userId: "u-session" });
      mockInventoryFindMany.mockResolvedValueOnce([]);

      const req = new Request("http://localhost:3000/api/user/inventory");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.items).toEqual([]);
      expect(mockWalletFindUnique).toHaveBeenCalledWith({
        where: { address: validAddressLower },
        select: { userId: true },
      });
    });

    it("returns 500 INTERNAL_SERVER_ERROR on unexpected database error", async () => {
      mockWalletFindUnique.mockRejectedValueOnce(
        new Error("Database connection dropped"),
      );

      const req = new Request(
        `http://localhost:3000/api/user/inventory?address=${validAddressLower}`,
      );
      const res = await GET(req);

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe("INTERNAL_SERVER_ERROR");
      expect(data.message).toBe("Failed to retrieve user inventory.");
    });
  });
});
