import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import {
  getAbuseFlagById,
  updateAbuseFlag,
  AdminAbuseFlagError,
} from "@/server/admin/abuse-flags";
import { readLimitedBody } from "@/lib/auth/body-limit";

function getClientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  return "unknown";
}

type RouteProps = {
  params: Promise<{ id: string }> | { id: string };
};

/**
 * GET /api/admin/abuse-flags/[id]
 * Retrieves details of a specific abuse flag.
 * Auth: requireAdminSession("REVIEW_FLAGS")
 */
export async function GET(
  _request: Request,
  props: RouteProps,
): Promise<Response> {
  const { id } = await Promise.resolve(props.params);

  try {
    await requireAdminSession(prisma, "REVIEW_FLAGS");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("GET /api/admin/abuse-flags/[id] admin auth error:", err);
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  try {
    const flag = await getAbuseFlagById(prisma, id);
    return Response.json({ flag }, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof AdminAbuseFlagError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }

    console.error("GET /api/admin/abuse-flags/[id] error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while fetching abuse flag.",
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/admin/abuse-flags/[id]
 * Updates investigation status and resolution notes of an abuse flag.
 * Auth: requireAdminSession("REVIEW_FLAGS")
 * Body: { status: "OPEN" | "UNDER_REVIEW" | "DISMISSED" | "CONFIRMED_ACTION_TAKEN", resolutionNotes?: string | null }
 */
export async function PATCH(
  request: Request,
  props: RouteProps,
): Promise<Response> {
  const { id } = await Promise.resolve(props.params);

  let adminSession;
  try {
    adminSession = await requireAdminSession(prisma, "REVIEW_FLAGS");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("PATCH /api/admin/abuse-flags/[id] admin auth error:", err);
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

  if (body.status === undefined) {
    return Response.json(
      { error: "MISSING_STATUS", message: "status is required." },
      { status: 400 },
    );
  }

  try {
    const result = await updateAbuseFlag(prisma, {
      flagId: id,
      adminUserId: adminSession.userId,
      status: body.status as any,
      resolutionNotes: body.resolutionNotes as any,
      ipAddress: getClientIp(request),
      userAgent: request.headers.get("user-agent") ?? null,
    });

    return Response.json(result, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof AdminAbuseFlagError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }

    console.error("PATCH /api/admin/abuse-flags/[id] error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while updating abuse flag.",
      },
      { status: 500 },
    );
  }
}

function methodNotAllowed(): Response {
  return Response.json(
    { error: "Method not allowed. Use GET or PATCH." },
    { status: 405, headers: { Allow: "GET, PATCH" } },
  );
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
