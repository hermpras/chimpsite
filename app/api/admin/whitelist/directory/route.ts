import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import {
  listFcfsDirectory,
  AdminFcfsDirectoryError,
} from "@/server/admin/fcfs-directory";

/**
 * GET /api/admin/whitelist/directory
 * Lists all FCFS directory participants ordered chronologically (joinedAt ASC, queueNumber ASC).
 * Evaluates live qualification criteria (5 trait categories, mandatory campaign tasks, ban status).
 * Filters: ?programId=... &search=... &qualifiedOnly=true|false &limit=... &offset=...
 * Auth: requireAdminSession({ requiredRole: "MODERATOR" })
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminSession(prisma, { requiredRole: "MODERATOR" });
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("GET /api/admin/whitelist/directory admin auth error:", err);
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const programIdParam = url.searchParams.get("programId") || undefined;
  const searchParam =
    url.searchParams.get("search") ||
    url.searchParams.get("q") ||
    url.searchParams.get("query") ||
    undefined;
  const qualifiedOnlyParam = url.searchParams.get("qualifiedOnly");
  const qualifiedOnly = qualifiedOnlyParam === "true" || qualifiedOnlyParam === "1";
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");

  const limit = limitParam !== null ? parseInt(limitParam, 10) : undefined;
  const offset = offsetParam !== null ? parseInt(offsetParam, 10) : undefined;

  try {
    const result = await listFcfsDirectory(prisma, {
      programId: programIdParam,
      search: searchParam,
      qualifiedOnly,
      limit: isNaN(limit as number) ? undefined : limit,
      offset: isNaN(offset as number) ? undefined : offset,
    });

    return Response.json(result, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof AdminFcfsDirectoryError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error("GET /api/admin/whitelist/directory unhandled error:", err);
    return Response.json(
      { error: "INTERNAL_SERVER_ERROR", message: "Failed to list FCFS directory." },
      { status: 500 },
    );
  }
}
