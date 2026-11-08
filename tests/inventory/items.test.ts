import { describe, it, expect, vi, beforeEach } from "vitest";
import { getUserInventory, equipInventoryItem, InventoryError } from "@/server/inventory/items";
import { GET } from "@/app/api/user/inventory/route";
import { POST as equipPOST } from "@/app/api/user/inventory/equip/route";
import { authenticateRequest } from "@/server/auth/session";

const {
  mockWalletFindUnique,
  mockInventoryFindMany,
  mockInventoryFindUnique,
  mockInventoryUpdateMany,
  mockInventoryUpdate,
  mock$transaction,
} = vi.hoisted(() => ({
  mockWalletFindUnique: vi.fn(),
  mockInventoryFindMany: vi.fn(),
  mockInventoryFindUnique: vi.fn(),
  mockInventoryUpdateMany: vi.fn(),
  mockInventoryUpdate: vi.fn(),
  mock$transaction: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    walletIdentity: {
      findUnique: mockWalletFindUnique,
    },
    inventoryItem: {
      findMany: mockInventoryFindMany,
      findUnique: mockInventoryFindUnique,
      updateMany: mockInventoryUpdateMany,
      update: mockInventoryUpdate,
    },
    $transaction: mock$transaction,
  },
}));

vi.mock("@/server/inventory/avatar-renderer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/inventory/avatar-renderer")>();
  return {
    ...actual,
    renderUserAvatar: vi.fn().mockResolvedValue({
      publicUrl: "/api/renders/avatar/user-123",
      width: 240,
      height: 240,
      layerCount: 1,
      updatedAt: new Date(),
    }),
  };
});

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
      findUnique: mockInventoryFindUnique,
      updateMany: mockInventoryUpdateMany,
      update: mockInventoryUpdate,
    },
    $transaction: mock$transaction,
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
        isEquipped: true,
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
      expect(result.items[1].isEquipped).toBe(false);
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

  describe("Service: equipInventoryItem", () => {
    const userId = "user-test-equip";
    const itemId = "item-equip-target";

    it("throws UNAUTHENTICATED when userId is missing or empty", async () => {
      await expect(equipInventoryItem(mockPrisma, "", itemId)).rejects.toThrow(
        /Authentication required/,
      );
    });

    it("throws MISSING_ITEM_ID when itemId is missing or empty", async () => {
      await expect(equipInventoryItem(mockPrisma, userId, "")).rejects.toThrow(
        /Item ID is required/,
      );
    });

    it("throws ITEM_NOT_FOUND when item does not exist or belongs to another user", async () => {
      mockInventoryFindUnique.mockResolvedValueOnce(null);

      await expect(equipInventoryItem(mockPrisma, userId, itemId)).rejects.toThrow(
        /Item not found in your inventory/,
      );

      mockInventoryFindUnique.mockResolvedValueOnce({
        id: itemId,
        ownerId: "other-user",
        trait: { category: "HEADWEAR", isActive: true },
      });

      await expect(equipInventoryItem(mockPrisma, userId, itemId)).rejects.toThrow(
        /Item not found in your inventory/,
      );
    });

    it("throws ITEM_LOCKED when item is locked", async () => {
      mockInventoryFindUnique.mockResolvedValueOnce({
        id: itemId,
        ownerId: userId,
        isLocked: true,
        lockReason: "PENDING_GIFT",
        trait: { category: "HEADWEAR", isActive: true },
      });

      await expect(equipInventoryItem(mockPrisma, userId, itemId)).rejects.toThrow(
        /PENDING_GIFT/,
      );
    });

    it("throws ITEM_INACTIVE when trait is inactive", async () => {
      mockInventoryFindUnique.mockResolvedValueOnce({
        id: itemId,
        ownerId: userId,
        isLocked: false,
        trait: { category: "HEADWEAR", isActive: false },
      });

      await expect(equipInventoryItem(mockPrisma, userId, itemId)).rejects.toThrow(
        /Inactive traits cannot be equipped/,
      );
    });

    it("successfully equips trait: unequips existing category items and sets target as equipped", async () => {
      mockInventoryFindUnique.mockResolvedValueOnce({
        id: itemId,
        ownerId: userId,
        isLocked: false,
        isEquipped: false,
        trait: { category: "HEADWEAR", isActive: true },
      });

      mock$transaction.mockImplementationOnce(async (cb: any) => {
        return cb({
          inventoryItem: {
            updateMany: mockInventoryUpdateMany,
            update: mockInventoryUpdate,
          },
        });
      });

      const result = await equipInventoryItem(mockPrisma, userId, itemId);

      expect(result).toEqual({
        success: true,
        itemId,
        category: "HEADWEAR",
      });
      expect(mockInventoryUpdateMany).toHaveBeenCalledWith({
        where: {
          ownerId: userId,
          trait: { category: "HEADWEAR" },
          isEquipped: true,
        },
        data: { isEquipped: false },
      });
      expect(mockInventoryUpdate).toHaveBeenCalledWith({
        where: { id: itemId },
        data: { isEquipped: true },
      });
    });
  });

  describe("API Route: POST /api/user/inventory/equip", () => {
    it("returns 401 when request is not authenticated", async () => {
      vi.mocked(authenticateRequest).mockResolvedValueOnce(null);

      const req = new Request("http://localhost:3000/api/user/inventory/equip", {
        method: "POST",
        body: JSON.stringify({ itemId: "item-123" }),
      });
      const res = await equipPOST(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("UNAUTHENTICATED");
    });

    it("returns 400 when itemId is missing in body", async () => {
      vi.mocked(authenticateRequest).mockResolvedValueOnce({
        sessionId: "s1",
        userId: "u-session",
        address: validAddressLower,
      });

      const req = new Request("http://localhost:3000/api/user/inventory/equip", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const res = await equipPOST(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("MISSING_ITEM_ID");
    });

    it("returns 200 with result when item is equipped successfully", async () => {
      vi.mocked(authenticateRequest).mockResolvedValueOnce({
        sessionId: "s1",
        userId: "u-session",
        address: validAddressLower,
      });

      mockInventoryFindUnique.mockResolvedValueOnce({
        id: "item-123",
        ownerId: "u-session",
        isLocked: false,
        isEquipped: false,
        trait: { category: "FUR", isActive: true },
      });

      mock$transaction.mockImplementationOnce(async (cb: any) => {
        return cb({
          inventoryItem: {
            updateMany: mockInventoryUpdateMany,
            update: mockInventoryUpdate,
          },
        });
      });

      const req = new Request("http://localhost:3000/api/user/inventory/equip", {
        method: "POST",
        body: JSON.stringify({ itemId: "item-123" }),
      });
      const res = await equipPOST(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.itemId).toBe("item-123");
      expect(data.category).toBe("FUR");
    });
  });
});
