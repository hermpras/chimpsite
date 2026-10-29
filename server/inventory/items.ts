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
