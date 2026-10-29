import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import { listAuditLogs, AdminAuditLogError } from "@/server/admin/audit-logs";

/**
 * GET /api/admin/audit-logs
 * Retrieves system audit logs for administrative review.
 * Only SUPER_ADMIN accounts are authorized to read audit logs.
 * Audit logs are strictly read-only; editing or deleting is prohibited.
 *
 * Query Parameters:
 * - action: string (e.g. "BAN_USER", "LOCK_STOCK", "WL_SLOT_REVOKED")
 * - entityType: string (e.g. "User", "DropPeriod", "WLSlot", "Gift")
 * - actorId: string (ID of the user who performed the action)
 * - from: ISO date string (filter entries created at or after this date)
 * - to: ISO date string (filter entries created at or before this date)
 * - limit: number (pagination page size, default: 50, max: 100)
 * - offset: number (pagination skip count, default: 0)
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAdminSession(prisma, { requiredRole: "SUPER_ADMIN" });
    if (session.adminRole.roleType !== "SUPER_ADMIN") {
      return Response.json(
        {
          error: "FORBIDDEN",
          message: "Super admin role required to view audit logs.",
        },
        { status: 403 },
      );
    }
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("GET /api/admin/audit-logs admin auth error:", err);
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || undefined;
  const entityType = url.searchParams.get("entityType") || undefined;
  const actorId = url.searchParams.get("actorId") || undefined;
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");

  try {
    let limit: number | undefined;
    if (limitParam !== null) {
      const parsed = parseInt(limitParam, 10);
      if (Number.isNaN(parsed) || parsed < 1) {
        throw new AdminAuditLogError(
          "INVALID_LIMIT",
          "Limit must be a positive integer between 1 and 100.",
          400,
        );
      }
      limit = Math.min(parsed, 100);
    }

    let offset: number | undefined;
    if (offsetParam !== null) {
      const parsed = parseInt(offsetParam, 10);
      if (Number.isNaN(parsed) || parsed < 0) {
        throw new AdminAuditLogError(
          "INVALID_OFFSET",
          "Offset must be a non-negative integer.",
          400,
        );
      }
      offset = parsed;
    }

    const result = await listAuditLogs(prisma, {
      action,
      entityType,
      actorId,
      from,
      to,
      limit,
      offset,
    });

    return Response.json(result, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof AdminAuditLogError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }

    console.error("GET /api/admin/audit-logs error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while listing audit logs.",
      },
      { status: 500 },
    );
  }
}

function methodNotAllowed(): Response {
  return Response.json(
    { error: "Method not allowed. Audit logs are read-only; use GET." },
    { status: 405, headers: { Allow: "GET" } },
  );
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
