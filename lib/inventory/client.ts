export interface InventoryTrait {
  id: string;
  name: string;
  category: string;
  rarity: string;
  imageUrl: string;
  description?: string | null;
}

export interface InventoryItemData {
  id: string;
  trait: InventoryTrait;
  edition: number;
  acquiredVia: string;
  acquiredAt: string;
  isLocked: boolean;
  lockReason?: string | null;
  isEquipped?: boolean;
}

export interface UserInventoryResponse {
  items: InventoryItemData[];
  error?: string;
  message?: string;
}

// Re-export gifting utilities & types (I-1)
export * from "./gift-client";

/**
 * Client helper to fetch user inventory by wallet address.
 */
export async function fetchUserInventory(
  address: string,
): Promise<UserInventoryResponse> {
  const url = `/api/user/inventory?address=${encodeURIComponent(address)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data.message || data.error || `Failed to fetch inventory: ${res.statusText}`,
    );
  }
  return data;
}
