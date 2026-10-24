import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import {
  createCampaign,
  listCampaigns,
  AdminCampaignError,
} from "@/server/admin/campaign";
import { readLimitedBody } from "@/lib/auth/body-limit";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * POST /api/admin/campaigns
 * Creates a new PromoCampaign (initially in DRAFT status).
 * Body: { slug, title, description?, wlProgramId, initialVersion? }
 * Auth: requireAdminSession("MANAGE_CAMPAIGNS")
 */
export async function POST(request: Request): Promise<Response> {
  let adminSession;
  try {
    adminSession = await requireAdminSession(prisma, "MANAGE_CAMPAIGNS");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("POST /api/admin/campaigns admin auth error:", err);
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
    const result = await createCampaign(prisma, {
      slug: body.slug as string,
      title: body.title as string,
      description: (body.description as string | null | undefined) ?? null,
      wlProgramId: body.wlProgramId as string,
      adminUserId: adminSession.userId,
      initialVersion: body.initialVersion as
        | {
            startsAt: string;
            endsAt?: string | null;
            changeNotes?: string | null;
            compatibilityMode?: string;
          }
        | undefined,
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
    console.error("POST /api/admin/campaigns unexpected error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while creating the campaign.",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/admin/campaigns
 * Lists all campaigns. Optional query params: ?wlProgramId=...&status=...
 * Auth: requireAdminSession("MANAGE_CAMPAIGNS")
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminSession(prisma, "MANAGE_CAMPAIGNS");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("GET /api/admin/campaigns admin auth error:", err);
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const wlProgramId = url.searchParams.get("wlProgramId") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;

  try {
    const result = await listCampaigns(prisma, { wlProgramId, status });
    return Response.json(result);
  } catch (err: unknown) {
    if (err instanceof AdminCampaignError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error("GET /api/admin/campaigns unexpected error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while listing campaigns.",
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
