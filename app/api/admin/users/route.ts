import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import { listAdminUsers, AdminUsersError } from "@/server/admin/users";

/**
 * GET /api/admin/users
 * Search and list users for admin management and ban enforcement.
 * Filters: ?search=... &address=... &userId=... &role=... &isBanned=... &limit=... &offset=...
 * Auth: requireAdminSession("MANAGE_BANS")
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminSession(prisma, "MANAGE_BANS");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("GET /api/admin/users admin auth error:", err);
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const searchParam =
    url.searchParams.get("search") ||
    url.searchParams.get("q") ||
    url.searchParams.get("query") ||
    undefined;
  const addressParam = url.searchParams.get("address") || undefined;
  const userIdParam = url.searchParams.get("userId") || undefined;
  const roleParam = url.searchParams.get("role") || undefined;
  const isBannedParam = url.searchParams.get("isBanned") || undefined;
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");

  const limit = limitParam !== null ? parseInt(limitParam, 10) : undefined;
  const offset = offsetParam !== null ? parseInt(offsetParam, 10) : undefined;

  try {
    const result = await listAdminUsers(prisma, {
      search: searchParam,
      address: addressParam,
      userId: userIdParam,
      role: roleParam,
      isBanned: isBannedParam,
      limit: isNaN(limit as number) ? undefined : limit,
      offset: isNaN(offset as number) ? undefined : offset,
    });

    return Response.json(result, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof AdminUsersError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }

    console.error("GET /api/admin/users error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while listing users.",
      },
      { status: 500 },
    );
  }
}

function methodNotAllowed(): Response {
  return Response.json(
    { error: "Method not allowed. Use GET." },
    { status: 405, headers: { Allow: "GET" } },
  );
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
