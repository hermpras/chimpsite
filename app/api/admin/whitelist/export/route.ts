import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import {
  exportOpenSeaAllowlist,
  OpenSeaExportError,
} from "@/server/admin/opensea-export";

/**
 * GET /api/admin/whitelist/export
 * Downloads the OpenSea SeaDrop allowlist CSV for either GTD or FCFS stage.
 *
 * Query Parameters:
 * - type / stage: "gtd" | "fcfs" (required)
 * - programId / slug / program: optional program identifier
 *
 * Auth: requireAdminSession("MANAGE_WL")
 */
export async function GET(request: Request): Promise<Response> {
  // 1. Authenticate & Authorize Admin Session
  try {
    await requireAdminSession(prisma, "MANAGE_WL");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("GET /api/admin/whitelist/export admin auth error:", err);
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  // 2. Parse Query Parameters
  const url = new URL(request.url);
  const stage = url.searchParams.get("type") || url.searchParams.get("stage");
  const programIdOrSlug =
    url.searchParams.get("programId") ||
    url.searchParams.get("slug") ||
    url.searchParams.get("program") ||
    undefined;

  if (!stage || !stage.trim()) {
    return Response.json(
      {
        error: "MISSING_EXPORT_STAGE",
        message: "Query parameter 'type' or 'stage' is required ('gtd' or 'fcfs').",
      },
      { status: 400 },
    );
  }

  // 3. Generate CSV
  try {
    const result = await exportOpenSeaAllowlist({
      prisma,
      programIdOrSlug,
      stage: stage.trim(),
    });

    return new Response(result.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
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

    console.error("GET /api/admin/whitelist/export error:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message:
          process.env.NODE_ENV === "production"
            ? "An unexpected error occurred while exporting allowlist."
            : `An unexpected error occurred while exporting allowlist: ${detail}`,
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
