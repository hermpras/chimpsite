import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import {
  emergencyCloseDropPeriod,
  DropClaimError,
} from "@/server/drops/claim";
import { readLimitedBody } from "@/lib/auth/body-limit";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(request: Request): Promise<Response> {
  // 1. Authenticate & Authorize Admin Session via requireAdminSession
  let adminSession;
  try {
    adminSession = await requireAdminSession(prisma, "MANAGE_DROPS");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("POST /api/drops/emergency-close admin auth error:", err);
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  // 2. Read and parse body with size limit protection
  const bodyResult = await readLimitedBody(request);
  if (!bodyResult.ok) {
    const status = bodyResult.reason === "too_large" ? 413 : 400;
    return Response.json({ error: bodyResult.reason }, { status });
  }

  let body: { dropId?: string; periodId?: string; reason?: string };
  try {
    body = JSON.parse(bodyResult.text);
  } catch {
    return Response.json({ error: "MALFORMED_JSON" }, { status: 400 });
  }

  // 3. Validate input
  if (!body.periodId || typeof body.periodId !== "string") {
    return Response.json(
      { error: "INVALID_INPUT", message: "periodId is required." },
      { status: 400 },
    );
  }

  if (body.reason !== undefined && body.reason !== null && typeof body.reason !== "string") {
    return Response.json(
      { error: "INVALID_INPUT", message: "reason must be a string." },
      { status: 400 },
    );
  }

  if (body.dropId !== undefined && body.dropId !== null && typeof body.dropId !== "string") {
    return Response.json(
      { error: "INVALID_INPUT", message: "dropId must be a string." },
      { status: 400 },
    );
  }

  // 4. Execute atomic emergency close
  try {
    const result = await emergencyCloseDropPeriod(prisma, {
      dropId: body.dropId,
      periodId: body.periodId,
      reason: body.reason,
      adminUserId: adminSession.userId,
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return Response.json(result);
  } catch (err: unknown) {
    if (err instanceof DropClaimError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error("POST /api/drops/emergency-close unexpected error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while executing emergency close.",
      },
      { status: 500 },
    );
  }
}

function methodNotAllowed(): Response {
  return Response.json(
    { error: "Method not allowed. Use POST." },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
