import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import {
  listGtdSlotsForReview,
  AdminSlotReviewError,
} from "@/server/admin/slot-review";

/**
 * GET /api/admin/whitelist/reviews
 * Lists GTD whitelist slots for post-allocation review with pagination, status filter,
 * and user wallet / linked X profile details.
 * Auth: requireAdminSession({ requiredRole: "MODERATOR" })
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminSession(prisma, { requiredRole: "MODERATOR" });
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("GET /api/admin/whitelist/reviews admin auth error:", err);
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const programIdParam = url.searchParams.get("programId") || undefined;
  const reviewStatusParam = url.searchParams.get("reviewStatus") || undefined;
  const searchAddressParam = url.searchParams.get("searchAddress") || undefined;
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
    const result = await listGtdSlotsForReview(prisma, {
      programId: programIdParam,
      reviewStatus: reviewStatusParam,
      searchAddress: searchAddressParam,
      search: searchParam,
      limit: isNaN(limit as number) ? undefined : limit,
      offset: isNaN(offset as number) ? undefined : offset,
    });

    return Response.json(result, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof AdminSlotReviewError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }

    console.error("GET /api/admin/whitelist/reviews error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while listing whitelist reviews.",
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
