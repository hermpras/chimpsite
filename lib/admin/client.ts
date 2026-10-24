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

export interface AdminReconcileQueueInput {
  programId: string;
}

export interface AdminReconcileQueueResponse {
  success: boolean;
  programId: string;
  slotsFilled: number;
  openSlotsRemaining: number;
}

export async function adminReconcileQueue(
  input: AdminReconcileQueueInput,
): Promise<AdminReconcileQueueResponse> {
  const res = await fetch("/api/admin/wl/reconcile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Queue reconciliation failed.");
  }
  return data;
}

export interface AdminListEvidenceInput {
  status?: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  taskId?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}

export async function adminListEvidence(input?: AdminListEvidenceInput) {
  const params = new URLSearchParams();
  if (input?.status) params.set("status", input.status);
  if (input?.taskId) params.set("taskId", input.taskId);
  if (input?.userId) params.set("userId", input.userId);
  if (input?.limit !== undefined) params.set("limit", String(input.limit));
  if (input?.offset !== undefined) params.set("offset", String(input.offset));

  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`/api/admin/evidence${query}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to list evidence submissions.");
  }
  return data;
}

export async function adminGetEvidence(submissionId: string) {
  const res = await fetch(`/api/admin/evidence/${encodeURIComponent(submissionId)}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data.message || data.error || "Failed to retrieve evidence submission.",
    );
  }
  return data;
}

export interface AdminReviewEvidenceInput {
  status: "APPROVED" | "REJECTED";
  reviewerNotes?: string | null;
}

export async function adminReviewEvidence(
  submissionId: string,
  input: AdminReviewEvidenceInput,
) {
  const res = await fetch(
    `/api/admin/evidence/${encodeURIComponent(submissionId)}/review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data.message || data.error || "Failed to review evidence submission.",
    );
  }
  return data;
}

export interface AdminRevokeBanInput {
  banId: string;
  reason?: string | null;
}

export async function adminRevokeBan(input: AdminRevokeBanInput) {
  const res = await fetch("/api/admin/ban/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to revoke user ban.");
  }
  return data;
}

export interface AdminListCampaignsInput {
  wlProgramId?: string;
  status?: string;
}

export async function adminListCampaigns(input?: AdminListCampaignsInput) {
  const params = new URLSearchParams();
  if (input?.wlProgramId) params.set("wlProgramId", input.wlProgramId);
  if (input?.status) params.set("status", input.status);

  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`/api/admin/campaigns${query}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to list campaigns.");
  }
  return data;
}

export async function adminGetCampaign(campaignId: string) {
  const res = await fetch(`/api/admin/campaigns/${encodeURIComponent(campaignId)}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to retrieve campaign.");
  }
  return data;
}

export interface AdminCreateCampaignInput {
  slug: string;
  title: string;
  description?: string | null;
  wlProgramId: string;
  initialVersion?: {
    startsAt: string;
    endsAt?: string | null;
    changeNotes?: string | null;
    compatibilityMode?: string;
  };
}

export async function adminCreateCampaign(input: AdminCreateCampaignInput) {
  const res = await fetch("/api/admin/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to create campaign.");
  }
  return data;
}

export interface AdminUpdateCampaignInput {
  title?: string;
  description?: string | null;
  status?: string;
}

export async function adminUpdateCampaign(
  campaignId: string,
  input: AdminUpdateCampaignInput,
) {
  const res = await fetch(`/api/admin/campaigns/${encodeURIComponent(campaignId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to update campaign.");
  }
  return data;
}

export async function adminListCampaignTasks(
  campaignId: string,
  versionNumber: number | string,
) {
  const res = await fetch(
    `/api/admin/campaigns/${encodeURIComponent(campaignId)}/versions/${encodeURIComponent(String(versionNumber))}/tasks`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    },
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to list campaign tasks.");
  }
  return data;
}

export interface AdminUserRecord {
  id: string;
  role: string;
  isBanned: boolean;
  createdAt: string;
  updatedAt: string;
  wallet: {
    address: string;
    chainId: number;
    verifiedAt: string;
  } | null;
  xIdentity: {
    username: string;
    name: string | null;
  } | null;
  activeBan?: {
    id: string;
    banType: string;
    scope: string;
    reason: string;
    issuedAt: string;
    expiresAt: string | null;
  } | null;
}

export interface AdminListUsersInput {
  search?: string;
  address?: string;
  userId?: string;
  role?: string;
  isBanned?: boolean | string;
  limit?: number;
  offset?: number;
}

export interface AdminListUsersResponse {
  users: AdminUserRecord[];
  total: number;
  limit: number;
  offset: number;
}

export async function adminListUsers(
  input?: AdminListUsersInput,
): Promise<AdminListUsersResponse> {
  const params = new URLSearchParams();
  if (input?.search) params.set("search", input.search);
  if (input?.address) params.set("address", input.address);
  if (input?.userId) params.set("userId", input.userId);
  if (input?.role) params.set("role", input.role);
  if (input?.isBanned !== undefined) params.set("isBanned", String(input.isBanned));
  if (input?.limit !== undefined) params.set("limit", String(input.limit));
  if (input?.offset !== undefined) params.set("offset", String(input.offset));

  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`/api/admin/users${query}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to list users.");
  }
  return data;
}

export interface AdminSlotRecord {
  id: string;
  slotNumber: number;
  programId: string;
  programName?: string;
  programSlug?: string;
  userId: string;
  walletAddress: string | null;
  status: string;
  allocatedAt: string;
  confirmedAt: string | null;
  allocatedBy: string | null;
  notes: string | null;
}

export interface AdminListSlotsInput {
  programId?: string;
  status?: string;
  search?: string;
  userId?: string;
  address?: string;
  limit?: number;
  offset?: number;
}

export interface AdminListSlotsResponse {
  slots: AdminSlotRecord[];
  total: number;
  limit: number;
  offset: number;
}

export async function adminListSlots(
  input?: AdminListSlotsInput,
): Promise<AdminListSlotsResponse> {
  const params = new URLSearchParams();
  if (input?.programId) params.set("programId", input.programId);
  if (input?.status) params.set("status", input.status);
  if (input?.search) params.set("search", input.search);
  if (input?.userId) params.set("userId", input.userId);
  if (input?.address) params.set("address", input.address);
  if (input?.limit !== undefined) params.set("limit", String(input.limit));
  if (input?.offset !== undefined) params.set("offset", String(input.offset));

  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`/api/admin/whitelist/slots${query}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to list whitelist slots.");
  }
  return data;
}

// ---------------------------------------------------------------------------
// Drop Operations
// ---------------------------------------------------------------------------

export interface AdminDropRecord {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: "DRAFT" | "SCHEDULED" | "ACTIVE" | "PAUSED" | "ENDED";
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
  periods: Array<{
    id: string;
    periodIndex: number;
    startsAt: string;
    endsAt: string;
    configLockAt: string;
    status: "PENDING_CONFIG" | "CONFIGURED" | "ACTIVE" | "ENDED" | "CANCELLED";
    isStockConfigured: boolean;
    isStockLocked: boolean;
    _count?: { poolItems: number; claims: number };
  }>;
}

export interface AdminListDropsResponse {
  drops: AdminDropRecord[];
  total: number;
  limit: number;
  offset: number;
}

export async function adminListDrops(params?: {
  limit?: number;
  offset?: number;
}): Promise<AdminListDropsResponse> {
  const q = new URLSearchParams();
  if (params?.limit !== undefined) q.set("limit", String(params.limit));
  if (params?.offset !== undefined) q.set("offset", String(params.offset));
  const query = q.toString() ? `?${q.toString()}` : "";

  const res = await fetch(`/api/admin/drops${query}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to list drops.");
  }
  return data;
}

export async function adminGetDrop(dropIdOrSlug: string): Promise<{ drop: any }> {
  const res = await fetch(`/api/admin/drops/${encodeURIComponent(dropIdOrSlug)}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to fetch drop details.");
  }
  return data;
}

export interface AdminCreateDropInput {
  slug: string;
  title: string;
  startsAt: string;
  endsAt: string;
  description?: string | null;
  status?: string;
  generatePeriods?: boolean;
}

export async function adminCreateDrop(input: AdminCreateDropInput) {
  const res = await fetch("/api/admin/drops", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to create drop.");
  }
  return data;
}

export interface AdminUpdateDropInput {
  title?: string;
  description?: string | null;
  status?: string;
}

export async function adminUpdateDrop(dropId: string, input: AdminUpdateDropInput) {
  const res = await fetch(`/api/admin/drops/${encodeURIComponent(dropId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to update drop.");
  }
  return data;
}

export async function adminCreateDropPeriod(dropId: string, startsAt: string) {
  const res = await fetch(`/api/admin/drops/${encodeURIComponent(dropId)}/periods`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startsAt }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to add drop period.");
  }
  return data;
}

export interface TraitStockItemInput {
  traitId: string;
  stock: number;
  weight?: number;
}

export async function adminConfigurePeriodStock(
  dropId: string,
  periodId: string,
  items: TraitStockItemInput[],
) {
  const res = await fetch(
    `/api/admin/drops/${encodeURIComponent(dropId)}/periods/${encodeURIComponent(periodId)}/stock`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    },
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to configure period stock.");
  }
  return data;
}

export async function adminActivateDropPeriod(dropId: string, periodId: string) {
  const res = await fetch(
    `/api/admin/drops/${encodeURIComponent(dropId)}/periods/${encodeURIComponent(periodId)}/activate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to activate drop period.");
  }
  return data;
}

export interface AdminTraitRecord {
  id: string;
  slug: string;
  name: string;
  category: string;
  rarity: string;
  imageUrl: string;
  maxSupply: number | null;
}

export async function adminListTraits(): Promise<{ traits: AdminTraitRecord[] }> {
  const res = await fetch("/api/admin/traits", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to fetch traits.");
  }
  return data;
}
