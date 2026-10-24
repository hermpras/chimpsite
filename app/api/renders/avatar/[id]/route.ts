/**
 * GET /api/renders/avatar/[id]
 *
 * Task 3-C: Serves the pre-rendered 240×240 PNG avatar for the given user ID
 * or EVM wallet address from PostgreSQL.
 *
 * Headers:
 *  - Content-Type: image/png
 *  - ETag: W/"<updatedAtTimestamp>"
 *  - Cache-Control: public, max-age=3600, must-revalidate
 *
 * Supports conditional GET via If-None-Match header (returns 304 Not Modified).
 * Performs lazy fallback render if an avatar record exists but has not been generated yet.
 */

import { prisma } from "@/server/db";
import {
  getAvatarRecord,
  renderUserAvatar,
  AvatarRenderError,
} from "@/server/inventory/avatar-renderer";
import {
  checkRateLimit,
  AVATAR_RENDER_RATE_LIMIT_MAX,
  AVATAR_RENDER_RATE_LIMIT_WINDOW_MS,
} from "@/lib/auth/rate-limit";

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: rawId } = await props.params;

  if (!rawId || typeof rawId !== "string" || !rawId.trim()) {
    return new Response("Missing identifier", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Remove .png suffix if client requested /api/renders/avatar/<id>.png
  const identifier = rawId.endsWith(".png") ? rawId.slice(0, -4) : rawId;

  try {
    let record = await getAvatarRecord(prisma, identifier);

    // If record exists in DB but PNG has not been rendered yet (e.g. background render pending/failed)
    // attempt lazy on-demand render
    if (!record?.pngBuffer) {
      if (!record?.userId) {
        // User not found in database — do not attempt expensive render on arbitrary identifiers
        return new Response("Avatar not found", {
          status: 404,
          headers: { "Content-Type": "text/plain" },
        });
      }

      // Protect against CPU exhaustion: rate-limit fallback lazy renders per target user
      try {
        const rateLimitKey = `avatar-lazy-render:${record.userId}`;
        const limit = await checkRateLimit(
          rateLimitKey,
          AVATAR_RENDER_RATE_LIMIT_MAX,
          AVATAR_RENDER_RATE_LIMIT_WINDOW_MS,
        );
        if (!limit.allowed) {
          return new Response("Too many render requests. Please try again later.", {
            status: 429,
            headers: {
              "Content-Type": "text/plain",
              "Retry-After": String(limit.retryAfterSeconds),
            },
          });
        }
      } catch (rateErr) {
        console.error("GET /api/renders/avatar/[id] rate limit failure:", rateErr);
        return new Response("Rate limit service temporarily unavailable", {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        });
      }

      try {
        const targetUserId = record.userId;
        const rendered = await renderUserAvatar(prisma, targetUserId);
        record = {
          userId: rendered.userId,
          pngBuffer: rendered.pngBuffer,
          updatedAt: rendered.updatedAt,
        };
      } catch (renderErr) {
        if (renderErr instanceof AvatarRenderError && renderErr.code === "NO_INVENTORY") {
          return new Response("Avatar not found: user has no active inventory", {
            status: 404,
            headers: { "Content-Type": "text/plain" },
          });
        }
        // Fall through to 404 if render not possible
      }
    }

    if (!record || !record.pngBuffer) {
      return new Response("Avatar not found", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const version = record.updatedAt ? record.updatedAt.getTime() : 0;
    const etag = `W/"${version}"`;

    // 304 Not Modified check
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
  } catch (err) {
    console.error("GET /api/renders/avatar/[id] error:", err);
    return new Response("Internal server error", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
