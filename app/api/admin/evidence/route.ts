import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import { listAdminEvidence, AdminEvidenceError } from "@/server/admin/evidence";

/**
 * GET /api/admin/evidence
 * Lists evidence submissions for admin review with optional filters.
 * Filters: ?status=PENDING_REVIEW|APPROVED|REJECTED &taskId=... &userId=... &limit=... &offset=...
 * Auth: requireAdminSession("REVIEW_EVIDENCE")
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminSession(prisma, "REVIEW_EVIDENCE");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("GET /api/admin/evidence admin auth error:", err);
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") || undefined;
  const taskIdParam = url.searchParams.get("taskId") || undefined;
  const userIdParam = url.searchParams.get("userId") || undefined;
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");

  const limit = limitParam !== null ? parseInt(limitParam, 10) : undefined;
  const offset = offsetParam !== null ? parseInt(offsetParam, 10) : undefined;

  try {
    const result = await listAdminEvidence(prisma, {
      status: statusParam,
      taskId: taskIdParam,
      userId: userIdParam,
      limit,
      offset,
    });

    return Response.json(result, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof AdminEvidenceError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }

    console.error("GET /api/admin/evidence error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while listing evidence submissions.",
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
