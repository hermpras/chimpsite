export interface CurrentDropResponse {
  active: boolean;
  message?: string;
  drop?: {
    id: string;
    slug: string;
    title: string;
    description?: string;
    status: string;
  };
  period?: {
    id: string;
    periodIndex: number;
    startsAt: string;
    endsAt: string;
    status: string;
    isStockLocked: boolean;
  };
  claimWindow?: {
    isActive: boolean;
    startsAt: string;
    endsAt: string;
    timeRemainingMs: number;
  };
  stock?: {
    totalAllocated: number;
    totalRemaining: number;
    isExhausted: boolean;
    poolItems: Array<{
      poolItemId: string;
      traitId: string;
      traitName: string;
      category: string;
      rarity: string;
      remainingStock: number;
      weight: number;
      probabilityPercent: number;
    }>;
  };
}

export async function fetchCurrentDrop(): Promise<CurrentDropResponse> {
  try {
    const res = await fetch("/api/drops/current");
    if (!res.ok) {
      return { active: false, message: `Failed to fetch drop: ${res.statusText}` };
    }
    return res.json();
  } catch {
    return { active: false, message: "Could not reach drop service." };
  }
}

export async function claimDropItem(dropId: string, periodId: string) {
  const res = await fetch("/api/drops/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dropId, periodId }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Claim failed.");
  }
  return data;
}

export async function sendGiftItem(receiverAddress: string, inventoryItemId: string) {
  const res = await fetch("/api/gifts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ receiverAddress, inventoryItemId }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Gift initiation failed.");
  }
  return data;
}

export async function resolveGiftItem(
  giftId: string,
  action: "ACCEPT" | "REJECT" | "CANCEL",
  reason?: string,
) {
  const res = await fetch(`/api/gifts/${giftId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, reason }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Gift action failed.");
  }
  return data;
}
