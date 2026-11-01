import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import {
  createCampaignVersion,
  listCampaignVersions,
  AdminCampaignError,
} from "@/server/admin/campaign";
import { readLimitedBody } from "@/lib/auth/body-limit";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * GET /api/admin/campaigns/[id]/versions
 * Retrieves all versions for a campaign, ordered by versionNumber DESC.
 * Auth: requireAdminSession("MANAGE_CAMPAIGNS")
 */
export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await props.params;

  try {
    await requireAdminSession(prisma, "MANAGE_CAMPAIGNS");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("GET /api/admin/campaigns/[id]/versions admin auth error:", err);
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  try {
    const result = await listCampaignVersions(prisma, id);
    return Response.json(result);
  } catch (err: unknown) {
    if (err instanceof AdminCampaignError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error("GET /api/admin/campaigns/[id]/versions unexpected error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while listing campaign versions.",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/campaigns/[id]/versions
 * Creates and publishes a new CampaignVersion.
 * Clones tasks from the active version, applies requested changes/additions/removals,
 * and sets the new version as current with compatibilityMode=LEGACY_CARRIED.
 * Body: { changeNotes?, startsAt?, endsAt?, compatibilityMode?, taskUpdates?, taskAdditions?, taskRemovals?, tasks? }
 * Auth: requireAdminSession("MANAGE_CAMPAIGNS")
 */
export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: campaignId } = await props.params;

  let adminSession;
  try {
    adminSession = await requireAdminSession(prisma, "MANAGE_CAMPAIGNS");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("POST /api/admin/campaigns/[id]/versions admin auth error:", err);
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
    const result = await createCampaignVersion(prisma, {
      campaignId,
      adminUserId: adminSession.userId,
      changeNotes: (body.changeNotes as string | null | undefined) ?? null,
      startsAt: body.startsAt as string | undefined,
      endsAt: body.endsAt as string | undefined,
      compatibilityMode: body.compatibilityMode as any,
      taskUpdates: body.taskUpdates as any,
      taskAdditions: body.taskAdditions as any,
      taskRemovals: body.taskRemovals as any,
      tasks: body.tasks as any,
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return Response.json(result, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof AdminCampaignError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error("POST /api/admin/campaigns/[id]/versions unexpected error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while creating the campaign version.",
      },
      { status: 500 },
    );
  }
}

function methodNotAllowed(): Response {
  return Response.json(
    { error: "Method not allowed. Use GET or POST." },
    { status: 405, headers: { Allow: "GET, POST" } },
  );
}

export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
