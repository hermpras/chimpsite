import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import { activateDropPeriod, AdminDropError } from "@/server/admin/drops";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * POST /api/admin/drops/[id]/periods/[periodId]/activate
 * Manually activate/open a drop period when its cycle starts.
 *
 * Invariant: "Jika stock hilang atau tidak valid saat period seharusnya dimulai, period tidak dibuka."
 * Strictly rejects activation if stock is unconfigured, missing, or zero.
 * Auth: requireAdminSession("MANAGE_DROPS")
 */
export async function POST(
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
      "POST /api/admin/drops/[id]/periods/[periodId]/activate admin auth error:",
      err,
    );
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  const { id, periodId } = await params;

  try {
    const result = await activateDropPeriod(prisma, {
      dropId: id,
      periodId,
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
      "POST /api/admin/drops/[id]/periods/[periodId]/activate unexpected error:",
      err,
    );
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while activating the period.",
      },
      { status: 500 },
    );
  }
}

function methodNotAllowed(): Response {
  return Response.json(
    { error: "Method not allowed. Use POST." },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
