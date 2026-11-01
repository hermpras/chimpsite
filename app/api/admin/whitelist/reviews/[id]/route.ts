import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import {
  updateGtdSlotReviewStatus,
  getGtdSlotReviewDetail,
  AdminSlotReviewError,
} from "@/server/admin/slot-review";
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
  params: Promise<{ id: string }>;
};

/**
 * GET /api/admin/whitelist/reviews/[id]
 * Retrieves full GTD slot review details (wallet/X profile, 5 traits, campaign tasks, slot audit history).
 * Auth: requireAdminSession({ requiredRole: "MODERATOR" })
 */
export async function GET(request: Request, props: RouteProps): Promise<Response> {
  const { id: slotId } = await props.params;

  try {
    await requireAdminSession(prisma, { requiredRole: "MODERATOR" });
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("GET /api/admin/whitelist/reviews/[id] admin auth error:", err);
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  try {
    const detail = await getGtdSlotReviewDetail(prisma, slotId);
    return Response.json(detail, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof AdminSlotReviewError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error("GET /api/admin/whitelist/reviews/[id] unhandled error:", err);
    return Response.json(
      { error: "INTERNAL_SERVER_ERROR", message: "Failed to fetch GTD slot review detail." },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/admin/whitelist/reviews/[id]
 * Updates review status and review notes for a GTD slot.
 * Auth: requireAdminSession({ requiredRole: "MODERATOR" })
 */
export async function PATCH(request: Request, props: RouteProps): Promise<Response> {
  const { id: slotId } = await props.params;

  let adminSession;
  try {
    adminSession = await requireAdminSession(prisma, { requiredRole: "MODERATOR" });
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("PATCH /api/admin/whitelist/reviews/[id] admin auth error:", err);
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

  let body: Record<string, unknown> = {};
  if (bodyResult.text.trim()) {
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
        {
          error: "INVALID_BODY",
          message: "Request body must be a valid JSON object.",
        },
        { status: 400 },
      );
    }
  }

  const reviewStatus = body.reviewStatus;
  if (!reviewStatus) {
    return Response.json(
      {
        error: "REVIEW_STATUS_REQUIRED",
        message: "Field 'reviewStatus' is required.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await updateGtdSlotReviewStatus(prisma, {
      slotId,
      reviewStatus: reviewStatus as string,
      reviewNotes:
        body.reviewNotes !== undefined ? (body.reviewNotes as string | null) : undefined,
      reviewedBy: adminSession.userId,
      ipAddress: getClientIp(request),
      userAgent: request.headers.get("user-agent") ?? null,
    });

    return Response.json(result, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof AdminSlotReviewError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }

    console.error("PATCH /api/admin/whitelist/reviews/[id] error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while updating whitelist review status.",
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
