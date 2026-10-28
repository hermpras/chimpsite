import { prisma } from "@/server/db";
import {
  requireAdminSession,
  checkAdminSession,
  AdminAuthError,
} from "@/server/auth/session";
import {
  createWLProgram,
  listWLPrograms,
  AdminWLProgramError,
} from "@/server/admin/wl-program";
import { readLimitedBody } from "@/lib/auth/body-limit";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * GET /api/admin/wl-programs
 * Lists Whitelist Programs with optional filtering.
 * Authorized for admins with MANAGE_WL or MANAGE_CAMPAIGNS.
 */
export async function GET(request: Request): Promise<Response> {
  const wlCheck = await checkAdminSession(prisma, "MANAGE_WL");
  if (!wlCheck.ok) {
    const campCheck = await checkAdminSession(prisma, "MANAGE_CAMPAIGNS");
    if (!campCheck.ok) {
      return Response.json(
        { error: wlCheck.error, message: wlCheck.message },
        { status: wlCheck.status },
      );
    }
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const search =
    url.searchParams.get("search") ||
    url.searchParams.get("q") ||
    url.searchParams.get("query") ||
    undefined;
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");

  const limit = limitParam !== null ? parseInt(limitParam, 10) : undefined;
  const offset = offsetParam !== null ? parseInt(offsetParam, 10) : undefined;

  try {
    const result = await listWLPrograms(prisma, {
      status,
      search,
      limit: isNaN(limit as number) ? undefined : limit,
      offset: isNaN(offset as number) ? undefined : offset,
    });

    return Response.json(result, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof AdminWLProgramError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error("GET /api/admin/wl-programs unexpected error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while listing whitelist programs.",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/wl-programs
 * Creates a new Whitelist Program.
 * Body: { slug, name, description?, totalSlots, status?, startsAt, endsAt? }
 * Auth: requireAdminSession("MANAGE_WL")
 */
export async function POST(request: Request): Promise<Response> {
  let adminSession;
  try {
    adminSession = await requireAdminSession(prisma, "MANAGE_WL");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("POST /api/admin/wl-programs admin auth error:", err);
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

  try {
    const result = await createWLProgram(prisma, {
      slug: body.slug as string,
      name: body.name as string,
      description: (body.description as string | null | undefined) ?? null,
      totalSlots: body.totalSlots as number,
      status: body.status as string | undefined,
      startsAt: body.startsAt as string,
      endsAt: (body.endsAt as string | null | undefined) ?? null,
      adminUserId: adminSession.userId,
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return Response.json(result, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof AdminWLProgramError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error("POST /api/admin/wl-programs unexpected error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while creating the whitelist program.",
      },
      { status: 500 },
    );
  }
}
