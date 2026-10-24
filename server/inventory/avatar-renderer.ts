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

/**
 * Fetches a remote PNG/image URL and returns its raw bytes as Buffer.
 * Exported for testability and dependency injection.
 */
export async function fetchLayerBuffer(
  imageUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<Buffer> {
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

  // 1. Try lookup by User ID
  const user = await prisma.user.findUnique({
    where: { id: identifier },
    select: {
      id: true,
      avatarPng: true,
      avatarUpdatedAt: true,
    },
  });

  if (user) {
    return {
      userId: user.id,
      pngBuffer: user.avatarPng ? Buffer.from(user.avatarPng) : null,
      updatedAt: user.avatarUpdatedAt,
    };
  }

  // 2. Try lookup by wallet address
  let normalizedAddress: string;
  try {
    normalizedAddress = normalizeAddress(identifier);
  } catch {
    return null;
  }

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

  if (!wallet || !wallet.user) {
    return null;
  }

  return {
    userId: wallet.user.id,
    pngBuffer: wallet.user.avatarPng ? Buffer.from(wallet.user.avatarPng) : null,
    updatedAt: wallet.user.avatarUpdatedAt,
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
