export interface AdminBanRequestInput {
  userId: string;
  reason: string;
  banType?: "PERMANENT" | "TEMPORARY" | "SHADOWBAN" | "FEATURE_RESTRICTION";
  scope?: "FULL_SYSTEM" | "CLAIM_RESTRICTED" | "GIFT_RESTRICTED" | "WL_DISQUALIFIED";
  evidence?: string | null;
  expiresAt?: string | null;
}

export async function adminBanUser(input: AdminBanRequestInput) {
  const res = await fetch("/api/admin/ban", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Admin ban failed.");
  }
  return data;
}

export interface AdminRevokeSlotInput {
  slotId?: string;
  programId?: string;
  userId?: string;
  slotNumber?: number;
  reason?: string | null;
}

export async function adminRevokeSlot(input: AdminRevokeSlotInput) {
  const url = input.slotId
    ? `/api/admin/whitelist/slots/${encodeURIComponent(input.slotId)}/revoke`
    : "/api/admin/whitelist/slots/revoke";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Admin slot revocation failed.");
  }
  return data;
}
