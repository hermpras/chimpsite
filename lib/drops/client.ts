export interface RecentDropPull {
  id: string;
  traitName: string;
  category: string;
  rarity: string;
  edition: number;
  imageUrl?: string;
  claimedBy: string;
  periodIndex: number;
  claimedAt: string;
}

export interface CurrentDropResponse {
  active: boolean;
  message?: string;
  userHasClaimed?: boolean;
  recentPulls?: RecentDropPull[];
  userEligibility?: {
    isEligible: boolean;
    hasWallet: boolean;
    hasLinkedX: boolean;
    xUsername: string | null;
    totalMandatoryTasksCount: number;
    completedMandatoryTasksCount: number;
    areMandatoryTasksCompleted: boolean;
    isBanned?: boolean;
    hasAllocatedSlot?: boolean;
    missingRequirements: string[];
  };
  drop?: {
    id: string;
    slug: string;
    title: string;
    description?: string;
    status: string;
    cycleDurationHours?: number;
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
  nextCycle?: {
    startsAt: string;
    endsAt: string;
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
      imageUrl?: string;
      remainingStock: number;
      allocatedStock?: number;
      weight: number;
      probabilityPercent: number;
    }>;
  };
}

let lastETag: string | null = null;
let cachedCurrentDrop: CurrentDropResponse | null = null;

export function __clearClientDropCache(): void {
  lastETag = null;
  cachedCurrentDrop = null;
}

export async function fetchCurrentDrop(): Promise<CurrentDropResponse> {
  try {
    const headers: Record<string, string> = {};
    if (lastETag) {
      headers["If-None-Match"] = lastETag;
    }
    const res = await fetch("/api/drops/current", { headers });
    if (res.status === 304 && cachedCurrentDrop) {
      return cachedCurrentDrop;
    }
    if (!res.ok) {
      return { active: false, message: `Failed to fetch drop: ${res.statusText}` };
    }
    const etag = res.headers.get("ETag");
    if (etag) {
      lastETag = etag;
    }
    const data = await res.json();
    cachedCurrentDrop = data;
    return data;
  } catch {
    return cachedCurrentDrop || { active: false, message: "Could not reach drop service." };
  }
}

export interface UserDropEligibilityData {
  isEligible: boolean;
  hasWallet: boolean;
  hasLinkedX: boolean;
  xUsername: string | null;
  totalMandatoryTasksCount: number;
  completedMandatoryTasksCount: number;
  areMandatoryTasksCompleted: boolean;
  isBanned?: boolean;
  hasAllocatedSlot?: boolean;
  missingRequirements: string[];
}

export interface UserDropStatusResponse {
  authenticated: boolean;
  userHasClaimed?: boolean;
  userEligibility?: UserDropEligibilityData | null;
  error?: string;
  message?: string;
}

export async function fetchUserDropStatus(): Promise<UserDropStatusResponse> {
  try {
    const res = await fetch("/api/drops/user-status");
    if (!res.ok) {
      return { authenticated: false };
    }
    return res.json();
  } catch {
    return { authenticated: false };
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

export async function emergencyCloseDropWindow(
  periodId: string,
  dropId?: string,
  reason?: string,
) {
  const res = await fetch("/api/drops/emergency-close", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ periodId, dropId, reason }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Emergency close failed.");
  }
  return data;
}
