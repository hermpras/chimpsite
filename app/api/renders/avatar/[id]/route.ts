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

    const url = new URL(request.url);
    const requestedVersion = url.searchParams.get("v");
    const requestedTimestamp = requestedVersion ? Number(requestedVersion) : null;
    const currentRecordVersion = record?.updatedAt ? record.updatedAt.getTime() : 0;

    // Check if client requested a newer version (e.g. after equipping a trait)
    const isStale = Boolean(
      requestedTimestamp &&
        Number.isFinite(requestedTimestamp) &&
        requestedTimestamp > currentRecordVersion + 1000,
    );

    // If record exists in DB but PNG has not been rendered yet (or client requested a newer version),
    // attempt lazy on-demand render
    if (!record?.pngBuffer || isStale) {
      if (!record?.userId) {
        if (!record?.pngBuffer) {
          // User not found in database — do not attempt expensive render on arbitrary identifiers
          return new Response("Avatar not found", {
            status: 404,
            headers: { "Content-Type": "text/plain" },
          });
        }
      } else {
        // Protect against CPU exhaustion: rate-limit fallback lazy renders per target user
        try {
          const rateLimitKey = `avatar-lazy-render:${record.userId}`;
          const limit = await checkRateLimit(
            rateLimitKey,
            AVATAR_RENDER_RATE_LIMIT_MAX,
            AVATAR_RENDER_RATE_LIMIT_WINDOW_MS,
          );
          if (!limit.allowed) {
            if (!record?.pngBuffer) {
              return new Response("Too many render requests. Please try again later.", {
                status: 429,
                headers: {
                  "Content-Type": "text/plain",
                  "Retry-After": String(limit.retryAfterSeconds),
                },
              });
            }
          } else {
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
                if (!record?.pngBuffer) {
                  return new Response("Avatar not found: user has no active inventory", {
                    status: 404,
                    headers: { "Content-Type": "text/plain" },
                  });
                }
              }
              console.warn(`[avatar-route] Lazy re-render for ${record.userId} failed:`, renderErr);
              // Fall through to serving existing record if render failed
            }
          }
        } catch (rateErr) {
          console.error("GET /api/renders/avatar/[id] rate limit failure:", rateErr);
          if (!record?.pngBuffer) {
            return new Response("Rate limit service temporarily unavailable", {
              status: 500,
              headers: { "Content-Type": "text/plain" },
            });
          }
        }
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
          "Cache-Control": "no-cache, must-revalidate",
        },
      });
    }

    return new Response(new Uint8Array(record.pngBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(record.pngBuffer.length),
        ETag: etag,
        "Cache-Control": "no-cache, must-revalidate",
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
