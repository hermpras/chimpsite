import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import {
  getPreExportAuditSummary,
  OpenSeaExportError,
} from "@/server/admin/opensea-export";

/**
 * GET /api/admin/whitelist/export/summary
 * Generates Pre-Export Audit Summary (Task 4.1) prior to OpenSea allowlist export.
 *
 * Query Parameters:
 * - programId / slug / program: optional program identifier
 *
 * Auth: requireAdminSession(prisma, "MANAGE_WL")
 */
export async function GET(request: Request): Promise<Response> {
  // 1. Authenticate & Authorize Admin Session
  try {
    await requireAdminSession(prisma, "MANAGE_WL");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("GET /api/admin/whitelist/export/summary admin auth error:", err);
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  // 2. Parse Query Parameters
  const url = new URL(request.url);
  const programIdOrSlug =
    url.searchParams.get("programId") ||
    url.searchParams.get("slug") ||
    url.searchParams.get("program") ||
    undefined;

  // 3. Generate Summary
  try {
    const summary = await getPreExportAuditSummary({
      prisma,
      programIdOrSlug,
    });

    return Response.json(summary, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err: unknown) {
    if (
      err instanceof OpenSeaExportError ||
      (err && typeof err === "object" && (err as any).name === "OpenSeaExportError")
    ) {
      const exportErr = err as OpenSeaExportError;
      return Response.json(
        { error: exportErr.code, message: exportErr.message },
        { status: exportErr.status || 400 },
      );
    }

    console.error("GET /api/admin/whitelist/export/summary error:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message:
          process.env.NODE_ENV === "production"
            ? "An unexpected error occurred while generating pre-export summary."
            : `An unexpected error occurred while generating pre-export summary: ${detail}`,
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
