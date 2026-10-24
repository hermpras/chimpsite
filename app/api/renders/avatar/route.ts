/**
 * /api/renders/avatar
 *
 * Task 3-C: F3 Pixel Renderer — avatar API endpoints.
 *
 * POST /api/renders/avatar:
 *   Triggers an on-demand re-render of the authenticated caller's 240×240 PNG avatar.
 *   Persists the PNG to PostgreSQL and returns the versioned public URL.
 *
 * GET /api/renders/avatar:
 *   Retrieves avatar for ?userId=... or ?address=... or authenticated session.
 *   Streams binary PNG directly with Content-Type: image/png and ETag caching.
 */

import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth/session";
import {
  renderUserAvatar,
  getAvatarRecord,
  AvatarRenderError,
} from "@/server/inventory/avatar-renderer";
import {
  checkRateLimit,
  AVATAR_RENDER_RATE_LIMIT_MAX,
  AVATAR_RENDER_RATE_LIMIT_WINDOW_MS,
} from "@/lib/auth/rate-limit";

export async function POST(request: Request): Promise<Response> {
  // Authentication
  const session = await authenticateRequest(prisma).catch(() => null);
  if (!session) {
    return Response.json(
      { error: "UNAUTHENTICATED", message: "Authentication required." },
      { status: 401 },
    );
  }

  try {
    const rateLimitKey = `avatar-render:${session.address || session.userId}`;
    const limit = await checkRateLimit(
      rateLimitKey,
      AVATAR_RENDER_RATE_LIMIT_MAX,
      AVATAR_RENDER_RATE_LIMIT_WINDOW_MS,
    );
    if (!limit.allowed) {
      return Response.json(
        {
          error: "RATE_LIMITED",
          message: "Too many avatar render requests. Please try again later.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        },
      );
    }
  } catch (err: unknown) {
    console.error("POST /api/renders/avatar rate limit failure:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "Rate limit service temporarily unavailable.",
      },
      { status: 500 },
    );
  }

  try {
    const result = await renderUserAvatar(prisma, session.userId);

    return Response.json({
      publicUrl: result.publicUrl,
      width: result.width,
      height: result.height,
      layerCount: result.layerCount,
      updatedAt: result.updatedAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof AvatarRenderError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }

    console.error("POST /api/renders/avatar error:", err);
    return Response.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to render avatar.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let identifier = url.searchParams.get("userId") || url.searchParams.get("address");

  if (!identifier) {
    const session = await authenticateRequest(prisma).catch(() => null);
    if (session?.userId) {
      identifier = session.userId;
    }
  }

  if (!identifier) {
    return new Response("Missing identifier query parameter (userId or address)", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const record = await getAvatarRecord(prisma, identifier);
  if (!record || !record.pngBuffer) {
    return new Response("Avatar not found", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const version = record.updatedAt ? record.updatedAt.getTime() : 0;
  const etag = `W/"${version}"`;

  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "public, max-age=3600, must-revalidate",
      },
    });
  }

  return new Response(new Uint8Array(record.pngBuffer), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(record.pngBuffer.length),
      ETag: etag,
      "Cache-Control": "public, max-age=3600, must-revalidate",
    },
  });
}
