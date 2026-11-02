import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import {
  manualGrantGtdSlot,
  AdminManualGrantError,
  isUserIdCollision,
  isRetryableManualGrantConflict,
} from "@/server/admin/manual-grant";
import { readLimitedBody } from "@/lib/auth/body-limit";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(request: Request): Promise<Response> {
  // 1. Authenticate Admin session (requires ADMIN or SUPER_ADMIN)
  let adminSession;
  try {
    adminSession = await requireAdminSession(prisma, { requiredRole: "ADMIN" });
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("POST /api/admin/whitelist/slots/manual-grant auth error:", err);
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  // 2. Read and parse body (max 8KB)
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

  const { programId, candidateUserId, slotNumber, notes } = body;

  if (typeof programId !== "string" || !programId.trim()) {
    return Response.json(
      { error: "INVALID_INPUT", message: "programId is required." },
      { status: 400 },
    );
  }

  if (typeof candidateUserId !== "string" || !candidateUserId.trim()) {
    return Response.json(
      { error: "INVALID_INPUT", message: "candidateUserId is required." },
      { status: 400 },
    );
  }

  if (
    slotNumber !== undefined &&
    slotNumber !== null &&
    (typeof slotNumber !== "number" || !Number.isInteger(slotNumber) || slotNumber <= 0)
  ) {
    return Response.json(
      { error: "INVALID_INPUT", message: "slotNumber must be a positive integer." },
      { status: 400 },
    );
  }

  if (notes !== undefined && notes !== null && typeof notes !== "string") {
    return Response.json(
      { error: "INVALID_INPUT", message: "notes must be a string." },
      { status: 400 },
    );
  }

  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent") ?? undefined;

  // 3. Execute with bounded retries (max 3 attempts)
  const MAX_ATTEMPTS = 3;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const result = await manualGrantGtdSlot(prisma, {
        programId: programId.trim(),
        candidateUserId: candidateUserId.trim(),
        adminUserId: adminSession.userId,
        slotNumber: slotNumber as number | undefined,
        notes: (notes as string | undefined)?.trim() ?? null,
        ipAddress: ip,
        userAgent,
      });

      return Response.json(result, { status: 200 });
    } catch (err: unknown) {
      if (isUserIdCollision(err)) {
        return Response.json(
          {
            error: "ALREADY_HOLDS_ACTIVE_SLOT",
            message: "Candidate already holds an active whitelist slot in this program.",
          },
          { status: 409 },
        );
      }

      if (err instanceof AdminManualGrantError) {
        return Response.json(
          { error: err.code, message: err.message },
          { status: err.status },
        );
      }

      if (isRetryableManualGrantConflict(err)) {
        if (attempt < MAX_ATTEMPTS - 1) {
          const delay = 50 * Math.pow(2, attempt) + Math.floor(Math.random() * 25);
          await new Promise((res) => setTimeout(res, delay));
          continue;
        }
        return Response.json(
          {
            error: "CONCURRENCY_CONFLICT",
            message: "Max retry attempts reached for slot allocation.",
          },
          { status: 409 },
        );
      }

      console.error("POST /api/admin/whitelist/slots/manual-grant error:", err);
      return Response.json(
        {
          error: "INTERNAL_SERVER_ERROR",
          message: "Failed to manually grant whitelist slot.",
        },
        { status: 500 },
      );
    }
  }

  return Response.json(
    {
      error: "CONCURRENCY_CONFLICT",
      message: "Max retry attempts reached for slot allocation.",
    },
    { status: 409 },
  );
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
