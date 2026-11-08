import type { PrismaClient } from "@prisma/client";
import { normalizeAddress } from "@/lib/auth/address";
import { resolveEquippedItemIdsFromList } from "./avatar-renderer";

export class InventoryError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = "InventoryError";
    this.code = code;
    this.status = status;
  }
}

export interface InventoryTraitOutput {
  id: string;
  name: string;
  category: string;
  rarity: string;
  imageUrl: string;
  description?: string | null;
}

export interface InventoryItemOutput {
  id: string;
  trait: InventoryTraitOutput;
  edition: number;
  acquiredVia: string;
  acquiredAt: string;
  isLocked: boolean;
  lockReason?: string | null;
  isEquipped?: boolean;
}

export interface UserInventoryResult {
  items: InventoryItemOutput[];
}

/**
 * Retrieves the inventory items belonging to a given EVM wallet address.
 * Validates and normalizes the wallet address, then returns all owned items
 * with associated trait details.
 */
export async function getUserInventory(
  prisma: PrismaClient,
  address: string,
): Promise<UserInventoryResult> {
  if (!address || typeof address !== "string" || !address.trim()) {
    throw new InventoryError("MISSING_ADDRESS", "Wallet address is required.", 400);
  }

  let normalized: string;
  try {
    normalized = normalizeAddress(address);
  } catch {
    throw new InventoryError(
      "INVALID_ADDRESS",
      "Invalid EVM wallet address format.",
      400,
    );
  }

  const wallet = await prisma.walletIdentity.findUnique({
    where: { address: normalized },
    select: { userId: true },
  });

  if (!wallet) {
    return { items: [] };
  }

  const items = await prisma.inventoryItem.findMany({
    where: { ownerId: wallet.userId },
    include: {
      trait: true,
    },
    orderBy: [{ createdAt: "desc" }, { edition: "asc" }],
  });

  // Determine equipped item for each category (matching avatar-renderer resolution)
  const equippedIds = resolveEquippedItemIdsFromList(items);

  return {
    items: items.map((item) => ({
      id: item.id,
      trait: {
        id: item.trait.id,
        name: item.trait.name,
        category: item.trait.category,
        rarity: item.trait.rarity,
        imageUrl: item.trait.imageUrl,
        description: item.trait.description ?? null,
      },
      edition: item.edition,
      acquiredVia: item.acquiredVia,
      acquiredAt:
        item.createdAt instanceof Date
          ? item.createdAt.toISOString()
          : new Date(item.createdAt).toISOString(),
      isLocked: item.isLocked,
      lockReason: item.lockReason ?? null,
      isEquipped: equippedIds.has(item.id),
    })),
  };
}

/**
 * Equips a specific trait item for a user avatar.
 * Validates ownership, lock status, and active status.
 * Automatically unequips any existing item in that trait category and sets this item as equipped.
 * Triggers an avatar re-render so the user's avatar is updated immediately.
 */
export async function equipInventoryItem(
  prisma: PrismaClient | any,
  userId: string,
  itemId: string,
): Promise<{ success: boolean; itemId: string; category: string }> {
  if (!userId || !userId.trim()) {
    throw new InventoryError("UNAUTHENTICATED", "Authentication required.", 401);
  }
  if (!itemId || !itemId.trim()) {
    throw new InventoryError("MISSING_ITEM_ID", "Item ID is required.", 400);
  }

  const targetItem = await prisma.inventoryItem.findUnique({
    where: { id: itemId },
    include: { trait: true },
  });

  if (!targetItem || targetItem.ownerId !== userId) {
    throw new InventoryError("ITEM_NOT_FOUND", "Item not found in your inventory.", 404);
  }

  if (targetItem.isLocked) {
    throw new InventoryError(
      "ITEM_LOCKED",
      targetItem.lockReason || "Locked items cannot be equipped.",
      400,
    );
  }

  if (!targetItem.trait || targetItem.trait.isActive === false) {
    throw new InventoryError("ITEM_INACTIVE", "Inactive traits cannot be equipped.", 400);
  }

  const category = targetItem.trait.category;

  // Transaction: unequip others in category, equip target item
  if (typeof prisma.$transaction === "function") {
    await prisma.$transaction(async (tx: any) => {
      await tx.inventoryItem.updateMany({
        where: {
          ownerId: userId,
          trait: { category },
          isEquipped: true,
        },
        data: { isEquipped: false },
      });

      await tx.inventoryItem.update({
        where: { id: itemId },
        data: { isEquipped: true },
      });
    });
  } else {
    if (prisma.inventoryItem?.updateMany) {
      await prisma.inventoryItem.updateMany({
        where: {
          ownerId: userId,
          trait: { category },
          isEquipped: true,
        },
        data: { isEquipped: false },
      });
    }
    if (prisma.inventoryItem?.update) {
      await prisma.inventoryItem.update({
        where: { id: itemId },
        data: { isEquipped: true },
      });
    }
  }

  // Trigger avatar re-render
  try {
    const { renderUserAvatar } = await import("./avatar-renderer");
    await renderUserAvatar(prisma, userId).catch((err: unknown) => {
      console.warn(`[equipInventoryItem] Background avatar render failed for user ${userId}:`, err);
    });
  } catch (renderErr: unknown) {
    console.warn(`[equipInventoryItem] Error triggering avatar render:`, renderErr);
  }

  return { success: true, itemId, category };
}
