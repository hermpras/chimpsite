import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import {
  createCampaignTask,
  updateCampaignTask,
  deleteCampaignTask,
  listCampaignTasks,
  AdminCampaignTaskError,
} from "@/server/admin/campaign-task";
import { readLimitedBody } from "@/lib/auth/body-limit";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * POST /api/admin/campaigns/[id]/versions/[v]/tasks
 * Creates a new task in campaign version [v].
 * Body: { taskCode, title, description?, taskType?, points?, isRequired?, sortOrder?, requirementMetadata? }
 * Auth: requireAdminSession("MANAGE_CAMPAIGNS")
 */
export async function POST(
  request: Request,
  props: { params: Promise<{ id: string; v: string }> },
): Promise<Response> {
  const { id: campaignId, v: versionIdentifier } = await props.params;

  let adminSession;
  try {
    adminSession = await requireAdminSession(prisma, "MANAGE_CAMPAIGNS");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error(
      "POST /api/admin/campaigns/[id]/versions/[v]/tasks admin auth error:",
      err,
    );
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  const bodyResult = await readLimitedBody(request);
  if (!bodyResult.ok) {
    const status = bodyResult.reason === "too_large" ? 413 : 400;
    return Response.json({ error: bodyResult.reason }, { status });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(bodyResult.text);
  } catch {
    return Response.json(
      { error: "MALFORMED_JSON", message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json(
      { error: "INVALID_INPUT", message: "Request body must be a JSON object." },
      { status: 400 },
    );
  }

  try {
    const result = await createCampaignTask(prisma, {
      campaignId,
      versionIdentifier,
      adminUserId: adminSession.userId,
      taskCode: body.taskCode as string,
      title: body.title as string,
      description: body.description as string | null | undefined,
      taskType: body.taskType as any,
      requirementMetadata: body.requirementMetadata as
        Record<string, unknown> | null | undefined,
      points: body.points !== undefined ? Number(body.points) : undefined,
      isRequired: body.isRequired !== undefined ? Boolean(body.isRequired) : undefined,
      sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return Response.json(result, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof AdminCampaignTaskError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error(
      "POST /api/admin/campaigns/[id]/versions/[v]/tasks unexpected error:",
      err,
    );
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while creating the campaign task.",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/admin/campaigns/[id]/versions/[v]/tasks
 * Lists all tasks for a specific campaign version.
 * Auth: requireAdminSession("MANAGE_CAMPAIGNS")
 */
export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string; v: string }> },
): Promise<Response> {
  const { id: campaignId, v: versionIdentifier } = await props.params;

  try {
    await requireAdminSession(prisma, "MANAGE_CAMPAIGNS");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error(
      "GET /api/admin/campaigns/[id]/versions/[v]/tasks admin auth error:",
      err,
    );
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  try {
    const result = await listCampaignTasks(prisma, {
      campaignId,
      versionIdentifier,
    });
    return Response.json(result);
  } catch (err: unknown) {
    if (err instanceof AdminCampaignTaskError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error(
      "GET /api/admin/campaigns/[id]/versions/[v]/tasks unexpected error:",
      err,
    );
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while listing campaign tasks.",
      },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/admin/campaigns/[id]/versions/[v]/tasks
 * Updates an existing task. taskId can be passed in request body or query parameter (?taskId=...).
 * Body: { taskId, taskCode?, title?, description?, taskType?, points?, isRequired?, sortOrder?, requirementMetadata? }
 * Auth: requireAdminSession("MANAGE_CAMPAIGNS")
 */
export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string; v: string }> },
): Promise<Response> {
  const { id: campaignId, v: versionIdentifier } = await props.params;

  let adminSession;
  try {
    adminSession = await requireAdminSession(prisma, "MANAGE_CAMPAIGNS");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error(
      "PUT /api/admin/campaigns/[id]/versions/[v]/tasks admin auth error:",
      err,
    );
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const queryTaskId = url.searchParams.get("taskId");

  const bodyResult = await readLimitedBody(request);
  if (!bodyResult.ok) {
    const status = bodyResult.reason === "too_large" ? 413 : 400;
    return Response.json({ error: bodyResult.reason }, { status });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(bodyResult.text);
  } catch {
    return Response.json(
      { error: "MALFORMED_JSON", message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json(
      { error: "INVALID_INPUT", message: "Request body must be a JSON object." },
      { status: 400 },
    );
  }

  const taskId = (body.taskId as string) || queryTaskId;
  if (!taskId || typeof taskId !== "string") {
    return Response.json(
      {
        error: "MISSING_TASK_ID",
        message: "taskId is required in request body or query param.",
      },
      { status: 422 },
    );
  }

  try {
    const result = await updateCampaignTask(prisma, {
      campaignId,
      versionIdentifier,
      taskId,
      adminUserId: adminSession.userId,
      taskCode: body.taskCode as string | undefined,
      title: body.title as string | undefined,
      description: body.description as string | null | undefined,
      taskType: body.taskType as any,
      requirementMetadata: body.requirementMetadata as
        Record<string, unknown> | null | undefined,
      points: body.points !== undefined ? Number(body.points) : undefined,
      isRequired: body.isRequired !== undefined ? Boolean(body.isRequired) : undefined,
      sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return Response.json(result);
  } catch (err: unknown) {
    if (err instanceof AdminCampaignTaskError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error(
      "PUT /api/admin/campaigns/[id]/versions/[v]/tasks unexpected error:",
      err,
    );
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while updating the campaign task.",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/campaigns/[id]/versions/[v]/tasks
 * Deletes a task. taskId can be passed in request body or query parameter (?taskId=...).
 * Auth: requireAdminSession("MANAGE_CAMPAIGNS")
 */
export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string; v: string }> },
): Promise<Response> {
  const { id: campaignId, v: versionIdentifier } = await props.params;

  let adminSession;
  try {
    adminSession = await requireAdminSession(prisma, "MANAGE_CAMPAIGNS");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error(
      "DELETE /api/admin/campaigns/[id]/versions/[v]/tasks admin auth error:",
      err,
    );
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  let taskId = url.searchParams.get("taskId");

  if (!taskId) {
    const bodyResult = await readLimitedBody(request);
    if (bodyResult.ok && bodyResult.text.trim()) {
      try {
        const body = JSON.parse(bodyResult.text);
        if (body && typeof body === "object" && typeof body.taskId === "string") {
          taskId = body.taskId;
        }
      } catch {
        return Response.json(
          { error: "MALFORMED_JSON", message: "Request body must be valid JSON." },
          { status: 400 },
        );
      }
    }
  }

  if (!taskId || typeof taskId !== "string") {
    return Response.json(
      {
        error: "MISSING_TASK_ID",
        message: "taskId is required in query param or JSON body.",
      },
      { status: 422 },
    );
  }

  try {
    const result = await deleteCampaignTask(prisma, {
      campaignId,
      versionIdentifier,
      taskId,
      adminUserId: adminSession.userId,
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return Response.json(result);
  } catch (err: unknown) {
    if (err instanceof AdminCampaignTaskError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error(
      "DELETE /api/admin/campaigns/[id]/versions/[v]/tasks unexpected error:",
      err,
    );
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while deleting the campaign task.",
      },
      { status: 500 },
    );
  }
}

function methodNotAllowed(): Response {
  return Response.json(
    { error: "Method not allowed. Use GET, POST, PUT, or DELETE." },
    { status: 405, headers: { Allow: "GET, POST, PUT, DELETE" } },
  );
}

export const PATCH = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
