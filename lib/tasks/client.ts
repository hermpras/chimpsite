export interface SubmitTaskEvidenceClientInput {
  submissionType?: "URL" | "IMAGE_URL" | "TEXT_PROOF" | "OAUTH_VERIFICATION";
  payload: string;
}

export async function submitTaskEvidence(
  taskId: string,
  input: SubmitTaskEvidenceClientInput,
) {
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/evidence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to submit evidence.");
  }
  return data;
}

export interface GetTaskEvidenceClientOptions {
  userId?: string;
}

export async function getTaskEvidence(
  taskId: string,
  options?: GetTaskEvidenceClientOptions,
) {
  const query = options?.userId ? `?userId=${encodeURIComponent(options.userId)}` : "";
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/evidence${query}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to retrieve evidence.");
  }
  return data;
}

export interface ActiveCampaignTask {
  id: string;
  versionId: string;
  campaignId: string;
  taskCode: string;
  title: string;
  description: string | null;
  taskType: "URL" | "IMAGE_URL" | "TEXT_PROOF" | "OAUTH_VERIFICATION" | string;
  points: number;
  isRequired: boolean;
  sortOrder: number;
  requirementMetadata?: Record<string, unknown> | null;
  progress?: {
    id: string;
    status: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "VERIFIED" | "REJECTED";
    verifiedAt: string | null;
    completedAt: string | null;
  } | null;
  latestSubmission?: {
    id: string;
    submissionType: "URL" | "IMAGE_URL" | "TEXT_PROOF" | "OAUTH_VERIFICATION" | string;
    payload: string;
    status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
    reviewerNotes: string | null;
    reviewedAt: string | null;
    createdAt: string;
  } | null;
}

export interface ActiveCampaignItem {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: string;
  wlProgramId: string;
  version: {
    id: string;
    versionNumber: number;
    startsAt: string;
    endsAt: string | null;
  } | null;
  tasks: ActiveCampaignTask[];
}

export interface FetchActiveTasksResponse {
  configured: boolean;
  message?: string;
  program?: {
    id: string;
    slug: string;
    name: string;
  };
  campaigns: ActiveCampaignItem[];
}

export async function fetchActiveTasks(
  programSlug?: string,
): Promise<FetchActiveTasksResponse> {
  const query = programSlug ? `?programSlug=${encodeURIComponent(programSlug)}` : "";
  const res = await fetch(`/api/tasks${query}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to fetch active tasks.");
  }
  return data;
}
