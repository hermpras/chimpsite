import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth/session";
import {
  submitTaskEvidence,
  getTaskEvidence,
  TaskEvidenceError,
} from "@/server/tasks/evidence";
import { readLimitedBody } from "@/lib/auth/body-limit";
import {
  checkRateLimit,
  EVIDENCE_SUBMIT_RATE_LIMIT_MAX,
  EVIDENCE_SUBMIT_RATE_LIMIT_WINDOW_MS,
} from "@/lib/auth/rate-limit";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * POST /api/tasks/[id]/evidence
 * Submits evidence for task [id].
 * Auth: authenticateRequest (User SIWE session)
 * Body: { submissionType?: "URL" | "IMAGE_URL" | "TEXT_PROOF" | "OAUTH_VERIFICATION", payload: string }
 */
export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await authenticateRequest(prisma);
  if (!session) {
    return Response.json(
      { error: "UNAUTHORIZED", message: "Authentication required." },
      { status: 401 },
    );
  }

  // Rate Limiting
  try {
    const rateLimitKey = `evidence-submit:${session.address || session.userId}`;
    const limit = await checkRateLimit(
      rateLimitKey,
      EVIDENCE_SUBMIT_RATE_LIMIT_MAX,
      EVIDENCE_SUBMIT_RATE_LIMIT_WINDOW_MS,
    );
    if (!limit.allowed) {
      return Response.json(
        {
          error: "RATE_LIMITED",
          message: "Too many evidence submission attempts. Please try again later.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        },
      );
    }
  } catch (err: unknown) {
    console.error("POST /api/tasks/[id]/evidence rate limit failure:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "Rate limit service temporarily unavailable.",
      },
      { status: 500 },
    );
  }

  // Body reading & size bounds
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

  const { id: taskId } = await props.params;

  try {
    const result = await submitTaskEvidence(prisma, {
      taskId,
      userId: session.userId,
      submissionType: body.submissionType as any,
      payload: body.payload as string,
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return Response.json(result, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof TaskEvidenceError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error("POST /api/tasks/[id]/evidence unexpected error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while submitting evidence.",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/tasks/[id]/evidence
 * Retrieves evidence submissions and progress for task [id].
 * Auth: authenticateRequest (User SIWE session)
 * Query: ?userId=<targetUserId> (optional, admin-only if querying other users)
 */
export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await authenticateRequest(prisma);
  if (!session) {
    return Response.json(
      { error: "UNAUTHORIZED", message: "Authentication required." },
      { status: 401 },
    );
  }

  const { id: taskId } = await props.params;
  const url = new URL(request.url);
  const targetUserId = url.searchParams.get("userId") || undefined;

  let isAdmin = false;
  try {
    const adminRole = await prisma.adminRole.findUnique({
      where: { userId: session.userId },
    });
    if (
      adminRole &&
      (adminRole.permissions.includes("MANAGE_CAMPAIGNS") ||
        adminRole.roleType === "SUPER_ADMIN" ||
        adminRole.roleType === "ADMIN")
    ) {
      isAdmin = true;
    }
  } catch {
    isAdmin = false;
  }

  try {
    const result = await getTaskEvidence(prisma, {
      taskId,
      requesterUserId: session.userId,
      targetUserId,
      isAdmin,
    });

    return Response.json(result, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof TaskEvidenceError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error("GET /api/tasks/[id]/evidence unexpected error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while fetching task evidence.",
      },
      { status: 500 },
    );
  }
}

export function PUT(): Response {
  return Response.json(
    {
      error: "METHOD_NOT_ALLOWED",
      message: "PUT is not allowed on /api/tasks/[id]/evidence.",
    },
    { status: 405, headers: { Allow: "GET, POST" } },
  );
}

export function DELETE(): Response {
  return Response.json(
    {
      error: "METHOD_NOT_ALLOWED",
      message: "DELETE is not allowed on /api/tasks/[id]/evidence.",
    },
    { status: 405, headers: { Allow: "GET, POST" } },
  );
}

export function PATCH(): Response {
  return Response.json(
    {
      error: "METHOD_NOT_ALLOWED",
      message: "PATCH is not allowed on /api/tasks/[id]/evidence.",
    },
    { status: 405, headers: { Allow: "GET, POST" } },
  );
}

export function HEAD(): Response {
  return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: { Allow: "GET, POST, OPTIONS" } });
}
