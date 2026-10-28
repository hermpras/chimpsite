import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import {
  getCampaignTask,
  updateCampaignTask,
  deleteCampaignTask,
  AdminCampaignTaskError,
} from "@/server/admin/campaign-task";
import { readLimitedBody } from "@/lib/auth/body-limit";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * GET /api/admin/campaigns/[id]/versions/[v]/tasks/[taskId]
 * Retrieves a single task.
 * Auth: requireAdminSession("MANAGE_CAMPAIGNS")
 */
export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string; v: string; taskId: string }> },
): Promise<Response> {
  const { id: campaignId, v: versionIdentifier, taskId } = await props.params;

  try {
    await requireAdminSession(prisma, "MANAGE_CAMPAIGNS");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error(
      "GET /api/admin/campaigns/[id]/versions/[v]/tasks/[taskId] admin auth error:",
      err,
    );
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  try {
    const result = await getCampaignTask(prisma, {
      campaignId,
      versionIdentifier,
      taskId,
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
      "GET /api/admin/campaigns/[id]/versions/[v]/tasks/[taskId] unexpected error:",
      err,
    );
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while fetching the campaign task.",
      },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/admin/campaigns/[id]/versions/[v]/tasks/[taskId]
 * Updates an existing task by path parameter taskId.
 * Auth: requireAdminSession("MANAGE_CAMPAIGNS")
 */
export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string; v: string; taskId: string }> },
): Promise<Response> {
  const { id: campaignId, v: versionIdentifier, taskId } = await props.params;

  let adminSession;
  try {
    adminSession = await requireAdminSession(prisma, "MANAGE_CAMPAIGNS");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error(
      "PUT /api/admin/campaigns/[id]/versions/[v]/tasks/[taskId] admin auth error:",
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
      "PUT /api/admin/campaigns/[id]/versions/[v]/tasks/[taskId] unexpected error:",
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
 * DELETE /api/admin/campaigns/[id]/versions/[v]/tasks/[taskId]
 * Deletes an existing task by path parameter taskId.
 * Auth: requireAdminSession("MANAGE_CAMPAIGNS")
 */
export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string; v: string; taskId: string }> },
): Promise<Response> {
  const { id: campaignId, v: versionIdentifier, taskId } = await props.params;

  let adminSession;
  try {
    adminSession = await requireAdminSession(prisma, "MANAGE_CAMPAIGNS");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error(
      "DELETE /api/admin/campaigns/[id]/versions/[v]/tasks/[taskId] admin auth error:",
      err,
    );
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
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
      "DELETE /api/admin/campaigns/[id]/versions/[v]/tasks/[taskId] unexpected error:",
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
    { error: "Method not allowed. Use GET, PUT, or DELETE." },
    { status: 405, headers: { Allow: "GET, PUT, DELETE" } },
  );
}

export const POST = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
