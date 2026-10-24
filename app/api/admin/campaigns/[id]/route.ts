import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import { getCampaign, updateCampaign, AdminCampaignError } from "@/server/admin/campaign";
import { readLimitedBody } from "@/lib/auth/body-limit";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * GET /api/admin/campaigns/[id]
 * Retrieves a single campaign by ID, including its current version.
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
    console.error("GET /api/admin/campaigns/[id] admin auth error:", err);
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  try {
    const campaign = await getCampaign(prisma, id);
    return Response.json(campaign);
  } catch (err: unknown) {
    if (err instanceof AdminCampaignError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error("GET /api/admin/campaigns/[id] unexpected error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while fetching the campaign.",
      },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/admin/campaigns/[id]
 * Updates title, description, and/or status of a campaign.
 * Status transitions are enforced: ARCHIVED is terminal.
 * Body: { title?, description?, status? }
 * Auth: requireAdminSession("MANAGE_CAMPAIGNS")
 */
export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await props.params;

  let adminSession;
  try {
    adminSession = await requireAdminSession(prisma, "MANAGE_CAMPAIGNS");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("PUT /api/admin/campaigns/[id] admin auth error:", err);
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
    const result = await updateCampaign(prisma, {
      campaignId: id,
      adminUserId: adminSession.userId,
      title: body.title as string | undefined,
      description: body.description as string | null | undefined,
      status: body.status as string | undefined,
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return Response.json(result);
  } catch (err: unknown) {
    if (err instanceof AdminCampaignError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error("PUT /api/admin/campaigns/[id] unexpected error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while updating the campaign.",
      },
      { status: 500 },
    );
  }
}

function methodNotAllowed(): Response {
  return Response.json(
    { error: "Method not allowed. Use GET or PUT." },
    { status: 405, headers: { Allow: "GET, PUT" } },
  );
}

export const POST = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
