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
  cycleDurationHours?: number;
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
  cycleDurationHours?: number;
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

// ---------------------------------------------------------------------------
// Whitelist (WL) Programs
// ---------------------------------------------------------------------------

export interface AdminWLProgramRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  totalSlots: number;
  allocatedSlotsCount: number;
  status: "UPCOMING" | "OPEN" | "PAUSED" | "FINALIZED" | "CLOSED";
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
  campaignsCount?: number;
  slotsCount?: number;
  queueEntriesCount?: number;
}

export interface AdminCreateWLProgramInput {
  slug: string;
  name: string;
  description?: string | null;
  totalSlots: number;
  status?: string;
  startsAt: string;
  endsAt?: string | null;
}

export interface AdminUpdateWLProgramInput {
  name?: string;
  description?: string | null;
  totalSlots?: number;
  status?: string;
  startsAt?: string;
  endsAt?: string | null;
}

export async function adminListWLPrograms(params?: {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ programs: AdminWLProgramRecord[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);
  if (params?.limit !== undefined) query.set("limit", String(params.limit));
  if (params?.offset !== undefined) query.set("offset", String(params.offset));

  const qs = query.toString();
  const url = qs ? `/api/admin/wl-programs?${qs}` : "/api/admin/wl-programs";

  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to fetch whitelist programs.");
  }
  return data;
}

export async function adminGetWLProgram(
  idOrSlug: string,
): Promise<{ program: AdminWLProgramRecord }> {
  const res = await fetch(`/api/admin/wl-programs/${encodeURIComponent(idOrSlug)}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to fetch whitelist program.");
  }
  return data;
}

export async function adminCreateWLProgram(
  input: AdminCreateWLProgramInput,
): Promise<{ program: AdminWLProgramRecord; auditLogId: string }> {
  const res = await fetch("/api/admin/wl-programs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to create whitelist program.");
  }
  return data;
}

export async function adminUpdateWLProgram(
  programId: string,
  input: AdminUpdateWLProgramInput,
): Promise<{ program: AdminWLProgramRecord; auditLogId: string }> {
  const res = await fetch(`/api/admin/wl-programs/${encodeURIComponent(programId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to update whitelist program.");
  }
  return data;
}

export interface AdminExportOpenSeaAllowlistParams {
  stage: "gtd" | "fcfs";
  programId?: string;
}

export interface AdminExportOpenSeaAllowlistResult {
  filename: string;
  count: number;
}

export async function adminExportOpenSeaAllowlist(
  params: AdminExportOpenSeaAllowlistParams,
): Promise<AdminExportOpenSeaAllowlistResult> {
  const base = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const url = new URL("/api/admin/whitelist/export", base);
  url.searchParams.set("stage", params.stage);
  if (params.programId && params.programId.trim()) {
    url.searchParams.set("programId", params.programId.trim());
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "text/csv, application/json",
    },
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      errorBody.message || errorBody.error || `Export failed with status ${res.status}`,
    );
  }

  const csvText = await res.text();
  const disposition = res.headers.get("Content-Disposition");
  let filename = `chimphood-${params.stage}-allowlist.csv`;
  if (disposition) {
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match && match[1]) {
      filename = match[1];
    }
  }

  const lines = csvText.trim() ? csvText.trim().split("\n").filter(Boolean) : [];
  const lineCount = lines.length;

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  }

  return { filename, count: lineCount };
}

export interface AdminListAbuseFlagsInput {
  status?: string;
  flagType?: string;
  severity?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}

export async function adminListAbuseFlags(input?: AdminListAbuseFlagsInput) {
  const params = new URLSearchParams();
  if (input?.status) params.set("status", input.status);
  if (input?.flagType) params.set("flagType", input.flagType);
  if (input?.severity) params.set("severity", input.severity);
  if (input?.userId) params.set("userId", input.userId);
  if (input?.limit !== undefined) params.set("limit", String(input.limit));
  if (input?.offset !== undefined) params.set("offset", String(input.offset));

  const query = params.toString();
  const url = query ? `/api/admin/abuse-flags?${query}` : "/api/admin/abuse-flags";

  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to list abuse flags.");
  }
  return data;
}

export async function adminGetAbuseFlag(flagId: string) {
  const res = await fetch(`/api/admin/abuse-flags/${encodeURIComponent(flagId)}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to fetch abuse flag.");
  }
  return data;
}

export interface AdminUpdateAbuseFlagInput {
  flagId: string;
  status: string;
  resolutionNotes?: string | null;
}

export async function adminUpdateAbuseFlag(input: AdminUpdateAbuseFlagInput) {
  const { flagId, ...body } = input;
  const res = await fetch(`/api/admin/abuse-flags/${encodeURIComponent(flagId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to update abuse flag.");
  }
  return data;
}

export interface AdminListAuditLogsInput {
  action?: string;
  entityType?: string;
  actorId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface AdminAuditLogActor {
  id: string;
  role: string;
  wallet?: { address: string } | null;
  xIdentity?: { username: string } | null;
}

export interface AdminAuditLogRecord {
  id: string;
  actorId: string | null;
  actor?: AdminAuditLogActor | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: unknown;
  newValues?: unknown;
  metadata?: unknown;
  createdAt: string;
}

export interface AdminListAuditLogsResponse {
  logs: AdminAuditLogRecord[];
  total: number;
  limit: number;
  offset: number;
}

export async function adminListAuditLogs(
  input?: AdminListAuditLogsInput,
): Promise<AdminListAuditLogsResponse> {
  const params = new URLSearchParams();
  if (input?.action) params.set("action", input.action);
  if (input?.entityType) params.set("entityType", input.entityType);
  if (input?.actorId) params.set("actorId", input.actorId);
  if (input?.from) params.set("from", input.from);
  if (input?.to) params.set("to", input.to);
  if (input?.limit !== undefined) params.set("limit", String(input.limit));
  if (input?.offset !== undefined) params.set("offset", String(input.offset));

  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`/api/admin/audit-logs${query}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to fetch audit logs.");
  }
  return data;
}


