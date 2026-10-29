/**
 * Task 3-C: F3 Pixel Renderer
 *
 * Composites a user's equipped trait layers into a single 240×240 PNG.
 *
 * Layer order (back → front): Background → Fur → Clothing → Headwear → Eyewear
 * Source artwork grid: 24×24 px — upscaled to 240×240 px using nearest-neighbor
 * interpolation to preserve pixel-art sharpness.
 *
 * Strategy (Option A - PostgreSQL Binary Storage):
 * Pre-render PNG buffer and store it in PostgreSQL (User.avatarPng bytea column).
 * Avatar is served via dynamic Next.js Route Handler with Content-Type: image/png
 * and ETag/Cache-Control versioning headers.
 *
 * Concurrency Protection:
 *  - In-flight render deduping per userId prevents duplicate parallel computations.
 *  - Timestamp-guarded database write (avatarUpdatedAt <= renderStartedAt) prevents
 *    stale renders from overwriting newer inventory state.
 *
 * Non-blocking Event Triggers:
 *  - `safeTriggerAvatarUpdate` can be called after claim or gift events without
 *    blocking or failing the primary inventory transaction.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { normalizeAddress } from "@/lib/auth/address";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Original artwork pixel grid (24 × 24). */
export const PIXEL_GRID_SIZE = 24;

/** Final PNG output dimensions (240 × 240 = 10× upscale). */
export const OUTPUT_SIZE = 240;

/**
 * Ordered layer categories back → front.
 * Matches final product decision: BG → FUR → CLOTHING → HEADWEAR → EYEWEAR.
 */
export const LAYER_ORDER = ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"] as const;
export type TraitCategory = (typeof LAYER_ORDER)[number];

/** Public URL base path for the avatar route handler. */
export const AVATAR_ROUTE_BASE = "/api/renders/avatar";

/** Base directory on disk for local trait artwork layers. */
export const TRAITS_BASE_DIR = path.resolve(process.cwd(), "public", "traits");

// ---------------------------------------------------------------------------
// In-Flight Concurrency Map (Deduping)
// ---------------------------------------------------------------------------

const inFlightRenders = new Map<string, Promise<RenderResult>>();

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class AvatarRenderError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number = 500) {
    super(message);
    this.name = "AvatarRenderError";
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TraitLayer {
  category: TraitCategory;
  imageUrl: string;
}

export interface RenderResult {
  userId: string;
  pngBuffer: Buffer;
  publicUrl: string;
  width: number;
  height: number;
  layerCount: number;
  updatedAt: Date;
}

export interface AvatarRecord {
  userId: string;
  pngBuffer: Buffer | null;
  updatedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Core Rendering Helpers
// ---------------------------------------------------------------------------

function getBaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (!url || !url.trim()) return null;
  return url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;
}

/**
 * Fetches a remote image URL or reads a local trait asset from `public/traits/`
 * and returns its raw bytes as Buffer.
 * Exported for testability and dependency injection.
 */
export async function fetchLayerBuffer(
  imageUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<Buffer> {
  if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.trim()) {
    throw new AvatarRenderError(
      "INVALID_LAYER_PATH",
      "Trait layer URL or path cannot be empty.",
      400,
    );
  }

  // 1. Remote HTTP/HTTPS URL: preserve existing fetch behavior
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    let response: Response;
    try {
      response = await fetchFn(imageUrl);
    } catch {
      throw new AvatarRenderError(
        "FETCH_LAYER_FAILED",
        `Failed to fetch trait layer from "${imageUrl}": network error.`,
        502,
      );
    }

    if (!response.ok) {
      throw new AvatarRenderError(
        "FETCH_LAYER_FAILED",
        `Failed to fetch trait layer from "${imageUrl}": HTTP ${response.status}.`,
        502,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // 2. Local relative trait path: must strictly reside in public/traits/
  const cleanPath = imageUrl.split(/[?#]/)[0];

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(cleanPath);
  } catch {
    throw new AvatarRenderError(
      "INVALID_LAYER_PATH",
      `Malformed URI encoding in trait layer path: "${imageUrl}".`,
      400,
    );
  }

  if (decodedPath.includes("\0")) {
    throw new AvatarRenderError(
      "INVALID_LAYER_PATH",
      `Null byte detected in trait layer path: "${imageUrl}".`,
      400,
    );
  }

  if (!cleanPath.startsWith("/traits/")) {
    throw new AvatarRenderError(
      "INVALID_LAYER_PATH",
      `Invalid trait layer path: "${imageUrl}". Local trait paths must start with "/traits/".`,
      400,
    );
  }

  const relativePath = decodedPath.slice("/traits/".length);
  if (!relativePath || relativePath.startsWith("/")) {
    throw new AvatarRenderError(
      "INVALID_LAYER_PATH",
      `Invalid trait layer path: "${imageUrl}".`,
      400,
    );
  }

  const resolvedPath = path.resolve(TRAITS_BASE_DIR, relativePath);
  if (!resolvedPath.startsWith(TRAITS_BASE_DIR + path.sep)) {
    throw new AvatarRenderError(
      "INVALID_LAYER_PATH",
      `Path traversal detected in trait layer path: "${imageUrl}".`,
      400,
    );
  }

  try {
    return await readFile(resolvedPath);
  } catch (fsErr: unknown) {
    const code = (fsErr as { code?: string })?.code;
    if (code === "ENOENT") {
      // Fallback for Vercel Serverless environment where public assets might be served via CDN
      const baseUrl = getBaseUrl();
      if (baseUrl) {
        try {
          const absoluteUrl = new URL(imageUrl, baseUrl).toString();
          let response: Response;
          try {
            response = await fetchFn(absoluteUrl);
          } catch {
            throw new AvatarRenderError(
              "FETCH_LAYER_FAILED",
              `Failed to fetch trait layer from "${imageUrl}": network error.`,
              502,
            );
          }

          if (!response.ok) {
            throw new AvatarRenderError(
              "FETCH_LAYER_FAILED",
              `Failed to fetch trait layer from "${imageUrl}": HTTP ${response.status}.`,
              response.status === 404 ? 404 : 502,
            );
          }

          const arrayBuffer = await response.arrayBuffer();
          return Buffer.from(arrayBuffer);
        } catch (fallbackErr) {
          if (fallbackErr instanceof AvatarRenderError) {
            throw fallbackErr;
          }
        }
      }

      throw new AvatarRenderError(
        "FETCH_LAYER_FAILED",
        `Trait layer file not found: "${imageUrl}".`,
        404,
      );
    }

    throw new AvatarRenderError(
      "FETCH_LAYER_FAILED",
      `Failed to read trait layer from "${imageUrl}": ${fsErr instanceof Error ? fsErr.message : "filesystem error"}.`,
      500,
    );
  }
}

/**
 * Composites an ordered list of 24×24 pixel-art layer buffers into a single
 * 240×240 PNG buffer using nearest-neighbor upscaling.
 *
 * Preserves pixel-art crispness via sharp `kernel: "nearest"`.
 */
export async function compositeLayerBuffers(layerBuffers: Buffer[]): Promise<Buffer> {
  if (layerBuffers.length === 0) {
    throw new AvatarRenderError(
      "NO_LAYERS",
      "Cannot render avatar: no trait layers provided.",
      400,
    );
  }

  let base = sharp(layerBuffers[0]);

  if (layerBuffers.length > 1) {
    const overlays = layerBuffers
      .slice(1)
      .map((input) => ({ input, blend: "over" as const }));
    base = base.composite(overlays);
  }

  return base
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
      kernel: "nearest",
      fit: "fill",
    })
    .png()
    .toBuffer();
}

/**
 * Resolves the user's best trait layer per category (lowest edition wins).
 * Trait layers are ordered strictly back-to-front: BG → FUR → CLOTHING → HEADWEAR → EYEWEAR.
 */
export async function resolveUserLayers(
  prisma: PrismaClient,
  userId: string,
): Promise<TraitLayer[]> {
  const items = await prisma.inventoryItem.findMany({
    where: { ownerId: userId },
    select: {
      edition: true,
      trait: {
        select: {
          category: true,
          imageUrl: true,
          isActive: true,
        },
      },
    },
    orderBy: { edition: "asc" },
  });

  const layerMap = new Map<TraitCategory, string>();
  for (const item of items) {
    const cat = item.trait.category as TraitCategory;
    if (!item.trait.isActive) continue;
    if (!layerMap.has(cat)) {
      layerMap.set(cat, item.trait.imageUrl);
    }
  }

  return LAYER_ORDER.filter((cat) => layerMap.has(cat)).map((cat) => ({
    category: cat,
    imageUrl: layerMap.get(cat)!,
  }));
}

/**
 * Builds the canonical public URL for an avatar, appending a version timestamp
 * query parameter to invalidate stale CDN and browser caches.
 */
export function buildAvatarPublicUrl(
  userId: string,
  updatedAt?: Date | number | null,
): string {
  const safeId = encodeURIComponent(userId.replace(/[^a-zA-Z0-9_-]/g, "_"));
  if (!updatedAt) {
    return `${AVATAR_ROUTE_BASE}/${safeId}`;
  }
  const timestamp = updatedAt instanceof Date ? updatedAt.getTime() : updatedAt;
  return `${AVATAR_ROUTE_BASE}/${safeId}?v=${timestamp}`;
}

// ---------------------------------------------------------------------------
// Main Rendering & Persistence Service
// ---------------------------------------------------------------------------

/**
 * Executes avatar rendering and persists the PNG buffer in the User record.
 * Handles concurrency deduping so parallel triggers for the same user coalesce.
 */
export async function renderUserAvatar(
  prisma: PrismaClient,
  userId: string,
  {
    fetchFn = fetch,
  }: {
    fetchFn?: typeof fetch;
  } = {},
): Promise<RenderResult> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AvatarRenderError("MISSING_USER_ID", "userId is required.", 400);
  }

  // Deduplicate parallel in-flight renders for the same userId
  const existingTask = inFlightRenders.get(userId);
  if (existingTask) {
    return existingTask;
  }

  const renderTask = (async () => {
    const renderStartedAt = new Date();

    // 1. Resolve layers from current inventory
    const layers = await resolveUserLayers(prisma, userId);

    if (layers.length === 0) {
      throw new AvatarRenderError(
        "NO_INVENTORY",
        "User has no active inventory items to render.",
        404,
      );
    }

    // 2. Fetch layer buffers
    const layerBuffers = await Promise.all(
      layers.map((layer) => fetchLayerBuffer(layer.imageUrl, fetchFn)),
    );

    // 3. Composite & upscale 24x24 -> 240x240 PNG
    const pngBuffer = await compositeLayerBuffers(layerBuffers);

    // 4. Persist in PostgreSQL (User.avatarPng) with concurrency check:
    // Only update if avatarUpdatedAt is null or older than renderStartedAt.
    try {
      await prisma.user.updateMany({
        where: {
          id: userId,
          OR: [{ avatarUpdatedAt: null }, { avatarUpdatedAt: { lte: renderStartedAt } }],
        },
        data: {
          avatarPng: new Uint8Array(pngBuffer),
          avatarUpdatedAt: renderStartedAt,
        },
      });
    } catch (persistErr: unknown) {
      const err = persistErr as { code?: string; message?: string };
      if (
        err?.code === "P2022" ||
        (typeof err?.message === "string" &&
          (err.message.includes("avatarPng") || err.message.includes("ColumnNotFound")))
      ) {
        console.warn(
          `[renderUserAvatar] avatarPng column not accessible in DB during updateMany for user ${userId}. Serving rendered PNG directly.`,
        );
      } else {
        throw persistErr;
      }
    }

    const publicUrl = buildAvatarPublicUrl(userId, renderStartedAt);

    return {
      userId,
      pngBuffer,
      publicUrl,
      width: OUTPUT_SIZE,
      height: OUTPUT_SIZE,
      layerCount: layers.length,
      updatedAt: renderStartedAt,
    };
  })();

  inFlightRenders.set(userId, renderTask);
  try {
    return await renderTask;
  } finally {
    inFlightRenders.delete(userId);
  }
}

/**
 * Retrieves the stored avatar PNG buffer and timestamp from the database.
 * Supports identifier lookup by User.id or WalletIdentity.address.
 */
export async function getAvatarRecord(
  prisma: PrismaClient,
  identifier: string,
): Promise<AvatarRecord | null> {
  if (!identifier || typeof identifier !== "string" || !identifier.trim()) {
    return null;
  }

  const isColumnNotFoundError = (err: unknown) => {
    const error = err as { code?: string; message?: string };
    return (
      error?.code === "P2022" ||
      (typeof error?.message === "string" &&
        (error.message.includes("avatarPng") || error.message.includes("ColumnNotFound")))
    );
  };

  // 1. Try lookup by User ID
  let user: {
    id: string;
    avatarPng?: Uint8Array | Buffer | null;
    avatarUpdatedAt?: Date | null;
  } | null = null;

  try {
    user = await prisma.user.findUnique({
      where: { id: identifier },
      select: {
        id: true,
        avatarPng: true,
        avatarUpdatedAt: true,
      },
    });
  } catch (err: unknown) {
    if (isColumnNotFoundError(err)) {
      console.warn(
        `[getAvatarRecord] avatarPng column not accessible in DB for user ${identifier}, falling back to id-only lookup.`,
      );
      try {
        const fallbackUser = await prisma.user.findUnique({
          where: { id: identifier },
          select: { id: true },
        });
        if (fallbackUser) {
          user = { id: fallbackUser.id, avatarPng: null, avatarUpdatedAt: null };
        }
      } catch {
        user = null;
      }
    } else {
      throw err;
    }
  }

  if (user) {
    return {
      userId: user.id,
      pngBuffer: user.avatarPng ? Buffer.from(user.avatarPng) : null,
      updatedAt: user.avatarUpdatedAt ?? null,
    };
  }

  // 2. Try lookup by wallet address
  let normalizedAddress: string;
  try {
    normalizedAddress = normalizeAddress(identifier);
  } catch {
    return null;
  }

  let walletUser: {
    id: string;
    avatarPng?: Uint8Array | Buffer | null;
    avatarUpdatedAt?: Date | null;
  } | null = null;

  try {
    const wallet = await prisma.walletIdentity.findUnique({
      where: { address: normalizedAddress },
      select: {
        user: {
          select: {
            id: true,
            avatarPng: true,
            avatarUpdatedAt: true,
          },
        },
      },
    });

    if (wallet?.user) {
      walletUser = wallet.user;
    }
  } catch (err: unknown) {
    if (isColumnNotFoundError(err)) {
      console.warn(
        `[getAvatarRecord] avatarPng column not accessible in DB for address ${identifier}, falling back to id-only lookup.`,
      );
      try {
        const fallbackWallet = await prisma.walletIdentity.findUnique({
          where: { address: normalizedAddress },
          select: {
            user: {
              select: { id: true },
            },
          },
        });
        if (fallbackWallet?.user) {
          walletUser = {
            id: fallbackWallet.user.id,
            avatarPng: null,
            avatarUpdatedAt: null,
          };
        }
      } catch {
        walletUser = null;
      }
    } else {
      throw err;
    }
  }

  if (!walletUser) {
    return null;
  }

  return {
    userId: walletUser.id,
    pngBuffer: walletUser.avatarPng ? Buffer.from(walletUser.avatarPng) : null,
    updatedAt: walletUser.avatarUpdatedAt ?? null,
  };
}

/**
 * Safe, non-blocking avatar update trigger for post-claim and post-gift events.
 * Executes in the background without throwing errors to caller.
 */
export function safeTriggerAvatarUpdate(
  prisma: PrismaClient,
  userId: string,
  fetchFn?: typeof fetch,
): void {
  if (!userId) return;

  renderUserAvatar(prisma, userId, { fetchFn }).catch((err) => {
    // Log structured warning: failed render must never abort core claim/gift operations.
    // The user can re-trigger on demand or route handler will attempt lazy render on next GET.
    console.warn(
      `[AvatarRender] Background avatar render failed for user ${userId}:`,
      err?.message || err,
    );
  });
}
