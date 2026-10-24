import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import { getAdminEvidenceById, AdminEvidenceError } from "@/server/admin/evidence";

/**
 * GET /api/admin/evidence/[id]
 * Retrieves a single evidence submission with full details for admin review.
 * Auth: requireAdminSession("REVIEW_EVIDENCE")
 */
export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: submissionId } = await props.params;

  try {
    await requireAdminSession(prisma, "REVIEW_EVIDENCE");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("GET /api/admin/evidence/[id] admin auth error:", err);
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  try {
    const result = await getAdminEvidenceById(prisma, submissionId);
    return Response.json(result, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof AdminEvidenceError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }

    console.error("GET /api/admin/evidence/[id] error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while fetching evidence submission.",
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
