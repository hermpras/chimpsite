import type { InventoryTrait } from "./client";

export interface GiftItemData {
  id: string;
  senderId: string;
  receiverId: string;
  inventoryItemId: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
  decidedAt?: string | null;
  rejectionReason?: string | null;
  cancellationReason?: string | null;
  inventoryItem: {
    id: string;
    edition: number;
    trait: InventoryTrait;
  };
  sender?: {
    id: string;
    wallet: {
      address: string;
    };
  };
  receiver?: {
    id: string;
    wallet: {
      address: string;
    };
  };
}

export interface UserGiftsResponse {
  sentGifts: GiftItemData[];
  receivedGifts: GiftItemData[];
  error?: string;
  message?: string;
}

function resolveUrl(path: string): string {
  if (
    typeof window !== "undefined" &&
    window.location?.origin &&
    !window.location.origin.includes("null")
  ) {
    return `${window.location.origin}${path}`;
  }
  return `http://localhost:3000${path}`;
}

/**
 * Client helper to fetch current user's sent and received gifts.
 */
export async function fetchUserGifts(): Promise<UserGiftsResponse> {
  const url = resolveUrl("/api/gifts");
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        data.message || data.error || `Failed to fetch gifts: ${res.statusText}`,
      );
    }
    return data;
  } catch (err: unknown) {
    if (
      err instanceof TypeError &&
      (err.message.includes("fetch failed") ||
        err.message.includes("Failed to parse URL"))
    ) {
      return { sentGifts: [], receivedGifts: [] };
    }
    throw err;
  }
}

/**
 * Client helper to initiate a gift of a duplicate inventory item.
 */
export async function sendGiftRequest(
  receiverAddress: string,
  inventoryItemId: string,
): Promise<{ success: boolean; gift: GiftItemData }> {
  const url = resolveUrl("/api/gifts");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ receiverAddress, inventoryItemId }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data.message || data.error || `Failed to send gift: ${res.statusText}`,
    );
  }
  return data;
}

/**
 * Client helper to resolve (ACCEPT, REJECT, or CANCEL) a gift.
 */
export async function resolveGiftRequest(
  giftId: string,
  action: "ACCEPT" | "REJECT" | "CANCEL",
  reason?: string,
): Promise<{ success: boolean; result: unknown }> {
  const url = resolveUrl(`/api/gifts/${encodeURIComponent(giftId)}`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, reason }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data.message ||
        data.error ||
        `Failed to ${action.toLowerCase()} gift: ${res.statusText}`,
    );
  }
  return data;
}
