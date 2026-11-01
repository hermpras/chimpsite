import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";

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

  // Decommissioned per DEC-018: Queue auto-reconciliation is eliminated.
  return Response.json({
    success: true,
    deprecated: true,
    message:
      "Queue auto-reconciliation has been decommissioned per DEC-018. Slots remain vacant upon revocation and must be granted manually via /api/admin/whitelist/slots/manual-grant.",
    slotsFilled: 0,
    openSlotsRemaining: 0,
  });
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
