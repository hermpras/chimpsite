import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import { revokeWlSlot, WlSlotRevokeError } from "@/server/whitelist/revoke";
import { readLimitedBody } from "@/lib/auth/body-limit";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: routeSlotId } = await props.params;

  let adminSession;
  try {
    adminSession = await requireAdminSession(prisma, "MANAGE_WL");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("POST /api/admin/whitelist/slots/[id]/revoke admin auth error:", err);
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
        { error: "INVALID_INPUT", message: "Request body must be a JSON object." },
        { status: 400 },
      );
    }
  }

  const slotId = (body.slotId as string) || routeSlotId;

  try {
    const result = await revokeWlSlot(prisma, {
      slotId,
      programId: body.programId as string | undefined,
      userId: body.userId as string | undefined,
      slotNumber: typeof body.slotNumber === "number" ? body.slotNumber : undefined,
      reason: body.reason as string | null | undefined,
      adminUserId: adminSession.userId,
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return Response.json(result);
  } catch (err: unknown) {
    if (err instanceof WlSlotRevokeError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error("POST /api/admin/whitelist/slots/[id]/revoke unexpected error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while revoking whitelist slot.",
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
