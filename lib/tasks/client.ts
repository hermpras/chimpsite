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
