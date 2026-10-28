import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import { reconcileQueueSlots, WhitelistError } from "@/server/whitelist/qualification";
import { readLimitedBody } from "@/lib/auth/body-limit";

export async function POST(request: Request): Promise<Response> {
  // 1. Authenticate & Authorize Admin Session via requireAdminSession (MANAGE_WL)
  try {
    await requireAdminSession(prisma, "MANAGE_WL");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("POST /api/admin/wl/reconcile admin auth error:", err);
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  // 2. Read and parse body with size limit protection (8KB)
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

  // 3. Validate programId
  if (typeof body.programId !== "string" || body.programId.trim().length === 0) {
    return Response.json(
      {
        error: "INVALID_INPUT",
        message: "programId is required and must be a non-empty string.",
      },
      { status: 400 },
    );
  }

  const programId = body.programId.trim();

  // 4. Call existing reconcileQueueSlots service
  try {
    const result = await reconcileQueueSlots(prisma, programId);

    return Response.json({
      success: true,
      programId,
      slotsFilled: result.slotsFilled,
      openSlotsRemaining: result.openSlotsRemaining,
    });
  } catch (err: unknown) {
    if (err instanceof WhitelistError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error("POST /api/admin/wl/reconcile unexpected error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while reconciling whitelist queue.",
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
