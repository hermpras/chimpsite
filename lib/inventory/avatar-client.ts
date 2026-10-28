/**
 * Task 3-C: F3 Pixel Renderer — client-side helper.
 *
 * Exposes browser-callable utilities for requesting avatar re-renders and
 * resolving the public URL of a pre-rendered avatar PNG.
 */

/** Dimensions of the rendered avatar PNG. */
export const AVATAR_OUTPUT_SIZE = 240;

/** Public URL base route for rendered avatar PNGs served by Next.js. */
export const AVATAR_URL_PREFIX = "/api/renders/avatar";

export interface AvatarRenderResponse {
  publicUrl: string;
  width: number;
  height: number;
  layerCount: number;
}

/**
 * Triggers a server-side avatar re-render for the authenticated user.
 * Calls POST /api/renders/avatar and returns the render result.
 *
 * Throws on network errors or non-2xx responses.
 */
export async function triggerAvatarRender(): Promise<AvatarRenderResponse> {
  const res = await fetch("/api/renders/avatar", { method: "POST" });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      data.message || data.error || `Avatar render failed: ${res.statusText}`,
    );
  }

  return data as AvatarRenderResponse;
}

/**
 * Returns the public URL for a user's pre-rendered avatar PNG.
 *
 * Sanitizes the userId by replacing non-alphanumeric/-/_ characters with
 * underscores, matching the server-side sanitization.
 * Supports optional version timestamp (`updatedAt`) for cache-busting.
 */
export function getAvatarPublicUrl(
  userId: string,
  updatedAt?: Date | number | string | null,
): string {
  const safeName = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!updatedAt) {
    return `${AVATAR_URL_PREFIX}/${safeName}`;
  }
  const timestamp =
    updatedAt instanceof Date
      ? updatedAt.getTime()
      : typeof updatedAt === "string"
        ? new Date(updatedAt).getTime()
        : updatedAt;

  return `${AVATAR_URL_PREFIX}/${safeName}?v=${timestamp}`;
}
