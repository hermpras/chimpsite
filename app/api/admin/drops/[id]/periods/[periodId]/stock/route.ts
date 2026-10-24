import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import {
  configurePeriodStock,
  AdminDropError,
  type TraitStockConfigItem,
} from "@/server/admin/drops";
import { readLimitedBody } from "@/lib/auth/body-limit";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * PUT /api/admin/drops/[id]/periods/[periodId]/stock
 * Configures trait pool stock for a period.
 * Body: { items: Array<{ traitId: string; stock: number; weight?: number }> }
 * Auth: requireAdminSession("MANAGE_DROPS")
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; periodId: string }> },
): Promise<Response> {
  let adminSession;
  try {
    adminSession = await requireAdminSession(prisma, "MANAGE_DROPS");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error(
      "PUT /api/admin/drops/[id]/periods/[periodId]/stock admin auth error:",
      err,
    );
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  const { id, periodId } = await params;

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
    const result = await configurePeriodStock(prisma, {
      dropId: id,
      periodId,
      items: body.items as TraitStockConfigItem[],
      adminUserId: adminSession.userId,
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? null,
    });

    return Response.json(result);
  } catch (err: unknown) {
    if (err instanceof AdminDropError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error(
      "PUT /api/admin/drops/[id]/periods/[periodId]/stock unexpected error:",
      err,
    );
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while configuring stock.",
      },
      { status: 500 },
    );
  }
}

function methodNotAllowed(): Response {
  return Response.json(
    { error: "Method not allowed. Use PUT." },
    { status: 405, headers: { Allow: "PUT" } },
  );
}

export const GET = methodNotAllowed;
export const POST = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
