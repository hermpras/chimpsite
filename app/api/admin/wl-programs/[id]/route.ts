import { prisma } from "@/server/db";
import {
  requireAdminSession,
  checkAdminSession,
  AdminAuthError,
} from "@/server/auth/session";
import {
  getWLProgram,
  updateWLProgram,
  AdminWLProgramError,
} from "@/server/admin/wl-program";
import { readLimitedBody } from "@/lib/auth/body-limit";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/wl-programs/[id]
 * Retrieves a single WL Program by ID or Slug.
 * Authorized for admins with MANAGE_WL or MANAGE_CAMPAIGNS.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  const { id } = await params;

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

  try {
    const program = await getWLProgram(prisma, id);
    return Response.json({ program }, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof AdminWLProgramError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error(`GET /api/admin/wl-programs/${id} unexpected error:`, err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while retrieving whitelist program.",
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/admin/wl-programs/[id]
 * Updates a Whitelist Program.
 * Body: { name?, description?, totalSlots?, status?, startsAt?, endsAt? }
 * Auth: requireAdminSession("MANAGE_WL")
 */
export async function PATCH(
  request: Request,
  { params }: RouteParams,
): Promise<Response> {
  const { id } = await params;

  let adminSession;
  try {
    adminSession = await requireAdminSession(prisma, "MANAGE_WL");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error(`PATCH /api/admin/wl-programs/${id} admin auth error:`, err);
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
    const result = await updateWLProgram(prisma, {
      programId: id,
      name: body.name !== undefined ? (body.name as string) : undefined,
      description:
        body.description !== undefined ? (body.description as string | null) : undefined,
      totalSlots: body.totalSlots !== undefined ? (body.totalSlots as number) : undefined,
      status: body.status !== undefined ? (body.status as string) : undefined,
      startsAt:
        body.startsAt !== undefined ? (body.startsAt as string | Date) : undefined,
      endsAt:
        body.endsAt !== undefined ? (body.endsAt as string | Date | null) : undefined,
      adminUserId: adminSession.userId,
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return Response.json(result, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof AdminWLProgramError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error(`PATCH /api/admin/wl-programs/${id} unexpected error:`, err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while updating whitelist program.",
      },
      { status: 500 },
    );
  }
}
