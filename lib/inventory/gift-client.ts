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
    wallet?: {
      address: string;
    } | null;
    xIdentity?: {
      username: string;
      name?: string | null;
      profileImageUrl?: string | null;
    } | null;
  };
  receiver?: {
    id: string;
    wallet?: {
      address: string;
    } | null;
    xIdentity?: {
      username: string;
      name?: string | null;
      profileImageUrl?: string | null;
    } | null;
  };
}

export interface GiftRecipientInfo {
  userId: string;
  address: string | null;
  xUsername?: string | null;
  xName?: string | null;
  profileImageUrl?: string | null;
  isSelf: boolean;
  isBanned: boolean;
  isWlAllocated: boolean;
  alreadyOwnsTrait: boolean;
  canReceive: boolean;
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

async function safeParseJsonResponse(res: Response): Promise<{ data: any; rawText: string }> {
  let rawText = "";
  try {
    rawText = await res.text();
  } catch {
    rawText = "";
  }

  let data: any = null;
  if (rawText && rawText.trim().length > 0) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }
  }

  return { data, rawText };
}

/**
 * Client helper to fetch current user's sent and received gifts.
 */
export async function fetchUserGifts(): Promise<UserGiftsResponse> {
  const url = resolveUrl("/api/gifts");
  try {
    const res = await fetch(url);
    const { data } = await safeParseJsonResponse(res);
    if (!res.ok) {
      throw new Error(
        data?.message || data?.error || `Failed to fetch gifts: ${res.statusText || res.status}`,
      );
    }
    return data ?? { sentGifts: [], receivedGifts: [] };
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
  const { data } = await safeParseJsonResponse(res);
  if (!res.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        (res.status >= 500
          ? "Server error occurred while sending gift. Please try again later."
          : `Failed to send gift: ${res.statusText || res.status}`),
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
  const { data } = await safeParseJsonResponse(res);
  if (!res.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        (res.status >= 500
          ? `Server error occurred while trying to ${action.toLowerCase()} gift. Please try again later.`
          : `Failed to ${action.toLowerCase()} gift: ${res.statusText || res.status}`),
    );
  }
  return data;
}

/**
 * Client helper to lookup and verify a potential recipient by X handle or wallet address.
 */
export async function lookupGiftRecipient(
  query: string,
  traitId?: string,
): Promise<{ success: boolean; recipient: GiftRecipientInfo }> {
  const params = new URLSearchParams({ query: query.trim() });
  if (traitId) {
    params.set("traitId", traitId);
  }
  const url = resolveUrl(`/api/gifts/recipient?${params.toString()}`);
  const res = await fetch(url);
  const { data } = await safeParseJsonResponse(res);

  if (!res.ok) {
    const errorMsg =
      data?.message ||
      data?.error ||
      (res.status === 404
        ? "Recipient not found."
        : res.status >= 500
        ? "Server error occurred while searching recipient. Please try again later."
        : `Request failed with status ${res.status}`);
    throw new Error(errorMsg);
  }

  if (!data || !data.success) {
    throw new Error(data?.message || data?.error || "Invalid response received from server.");
  }

  return data;
}
