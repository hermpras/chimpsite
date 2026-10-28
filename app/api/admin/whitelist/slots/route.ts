import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import { listAdminWlSlots, AdminSlotError } from "@/server/admin/slot";

/**
 * GET /api/admin/whitelist/slots
 * Lists allocated whitelist slots with program details and wallet addresses.
 * Filters: ?programId=... &status=... &search=... &userId=... &address=... &limit=... &offset=...
 * Auth: requireAdminSession("MANAGE_WL")
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminSession(prisma, "MANAGE_WL");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("GET /api/admin/whitelist/slots admin auth error:", err);
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const programIdParam = url.searchParams.get("programId") || undefined;
  const statusParam = url.searchParams.get("status") || undefined;
  const userIdParam = url.searchParams.get("userId") || undefined;
  const addressParam = url.searchParams.get("address") || undefined;
  const searchParam =
    url.searchParams.get("search") ||
    url.searchParams.get("q") ||
    url.searchParams.get("query") ||
    undefined;
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");

  const limit = limitParam !== null ? parseInt(limitParam, 10) : undefined;
  const offset = offsetParam !== null ? parseInt(offsetParam, 10) : undefined;

  try {
    const result = await listAdminWlSlots(prisma, {
      programId: programIdParam,
      status: statusParam,
      userId: userIdParam,
      address: addressParam,
      search: searchParam,
      limit: isNaN(limit as number) ? undefined : limit,
      offset: isNaN(offset as number) ? undefined : offset,
    });

    return Response.json(result, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof AdminSlotError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }

    console.error("GET /api/admin/whitelist/slots error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while listing whitelist slots.",
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
