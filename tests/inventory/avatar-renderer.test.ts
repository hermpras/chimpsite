/**
 * Task 3-C: F3 Pixel Renderer — Comprehensive Unit & Integration Tests
 *
 * Scope:
 *  1. Constants & Specification (24x24 px artwork, 240x240 px PNG, layer order)
 *  2. Composite & Nearest-Neighbor Upscaling (sharpness, dimensions, transparency)
 *  3. Layer Resolution (back-to-front ordering, filtering, edition deduplication)
 *  4. Database Persistence (PostgreSQL User.avatarPng bytea storage & timestamp)
 *  5. Concurrency Protection (in-flight deduping & render timestamp race guards)
 *  6. Dynamic Route Handlers (GET binary PNG with ETag/Cache-Control, 304, POST on-demand)
 *  7. Event Triggers (safeTriggerAvatarUpdate in claim & gift workflows)
 *  8. Client Helpers (getAvatarPublicUrl versioning, triggerAvatarRender)
 */

// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import sharp from "sharp";
import {
  compositeLayerBuffers,
  resolveUserLayers,
  resolveUserEquippedTraits,
  resolveEquippedItemIdsFromList,
  renderUserAvatar,
  getAvatarRecord,
  fetchLayerBuffer,
  safeTriggerAvatarUpdate,
  buildAvatarPublicUrl,
  AvatarRenderError,
  LAYER_ORDER,
  OUTPUT_SIZE,
  PIXEL_GRID_SIZE,
  AVATAR_ROUTE_BASE,
} from "@/server/inventory/avatar-renderer";
import {
  getAvatarPublicUrl,
  triggerAvatarRender,
  AVATAR_OUTPUT_SIZE,
  AVATAR_URL_PREFIX,
} from "@/lib/inventory/avatar-client";
import { POST as routePOST, GET as routeGET } from "@/app/api/renders/avatar/route";
import { GET as dynamicIdGET } from "@/app/api/renders/avatar/[id]/route";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockInventoryFindMany,
  mockUserUpdateMany,
  mockUserFindUnique,
  mockWalletFindUnique,
} = vi.hoisted(() => ({
  mockInventoryFindMany: vi.fn(),
  mockUserUpdateMany: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockWalletFindUnique: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    inventoryItem: { findMany: mockInventoryFindMany },
    user: {
      updateMany: mockUserUpdateMany,
      findUnique: mockUserFindUnique,
    },
    walletIdentity: {
      findUnique: mockWalletFindUnique,
    },
  },
}));

vi.mock("@/server/auth/session", () => ({
  authenticateRequest: vi.fn(),
}));

vi.mock("@/lib/auth/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
  };
});

import { authenticateRequest } from "@/server/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";

// ---------------------------------------------------------------------------
// Helpers: create minimal PNG buffers using sharp
// ---------------------------------------------------------------------------

async function makePng24x24(
  r: number,
  g: number,
  b: number,
  alpha: number = 255,
): Promise<Buffer> {
  return sharp({
    create: {
      width: PIXEL_GRID_SIZE,
      height: PIXEL_GRID_SIZE,
      channels: 4,
      background: { r, g, b, alpha },
    },
  })
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// 1. Constants & Specification
// ---------------------------------------------------------------------------

describe("Task 3-C — Constants & Specification", () => {
  it("artwork grid size is strictly 24x24 pixel", () => {
    expect(PIXEL_GRID_SIZE).toBe(24);
  });

  it("final output dimensions are 240x240 pixel", () => {
    expect(OUTPUT_SIZE).toBe(240);
    expect(AVATAR_OUTPUT_SIZE).toBe(240);
  });

  it("canonical layer order is strictly BG -> FUR -> CLOTHING -> HEADWEAR -> EYEWEAR", () => {
    expect(LAYER_ORDER).toEqual(["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"]);
  });

  it("route base path matches /api/renders/avatar", () => {
    expect(AVATAR_ROUTE_BASE).toBe("/api/renders/avatar");
    expect(AVATAR_URL_PREFIX).toBe("/api/renders/avatar");
  });
});

// ---------------------------------------------------------------------------
// 2. compositeLayerBuffers — PNG Dimensions & Nearest-Neighbor Sharpness
// ---------------------------------------------------------------------------

describe("Task 3-C — compositeLayerBuffers", () => {
  it("throws NO_LAYERS when no layers are provided", async () => {
    await expect(compositeLayerBuffers([])).rejects.toThrow(AvatarRenderError);
    await expect(compositeLayerBuffers([])).rejects.toMatchObject({
      code: "NO_LAYERS",
      status: 400,
    });
  });

  it("upscales single layer to exactly 240x240 PNG format", async () => {
    const layer = await makePng24x24(255, 0, 0);
    const result = await compositeLayerBuffers([layer]);

    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(OUTPUT_SIZE);
    expect(meta.height).toBe(OUTPUT_SIZE);
    expect(meta.format).toBe("png");
  });

  it("composites all 5 layers with correct 240x240 output dimensions", async () => {
    const layers = await Promise.all([
      makePng24x24(200, 100, 50), // BG
      makePng24x24(100, 200, 50), // FUR
      makePng24x24(50, 100, 200), // CLOTHING
      makePng24x24(200, 50, 200), // HEADWEAR
      makePng24x24(50, 200, 200), // EYEWEAR
    ]);

    const result = await compositeLayerBuffers(layers);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(240);
    expect(meta.height).toBe(240);
  });

  it("preserves nearest-neighbor pixel boundaries without blur or antialiasing", async () => {
    // 24x24 split: left 12 cols pure Red (255,0,0), right 12 cols pure Blue (0,0,255)
    const rawPixels = Buffer.alloc(24 * 24 * 4);
    for (let row = 0; row < 24; row++) {
      for (let col = 0; col < 24; col++) {
        const idx = (row * 24 + col) * 4;
        if (col < 12) {
          rawPixels[idx] = 255;
          rawPixels[idx + 1] = 0;
          rawPixels[idx + 2] = 0;
          rawPixels[idx + 3] = 255;
        } else {
          rawPixels[idx] = 0;
          rawPixels[idx + 1] = 0;
          rawPixels[idx + 2] = 255;
          rawPixels[idx + 3] = 255;
        }
      }
    }

    const source = await sharp(rawPixels, {
      raw: { width: 24, height: 24, channels: 4 },
    })
      .png()
      .toBuffer();

    const composited = await compositeLayerBuffers([source]);
    const { data, info } = await sharp(composited)
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Pixel at (x=119, y=0) should be crisp Red
    const idxLeft = (0 * 240 + 119) * info.channels;
    expect(data[idxLeft]).toBeGreaterThan(200);
    expect(data[idxLeft + 2]).toBeLessThan(50);

    // Pixel at (x=120, y=0) should be crisp Blue
    const idxRight = (0 * 240 + 120) * info.channels;
    expect(data[idxRight]).toBeLessThan(50);
    expect(data[idxRight + 2]).toBeGreaterThan(200);
  });
});

// ---------------------------------------------------------------------------
// 3. resolveUserLayers — Ordering, Deduplication & Inactive Trait Skipping
// ---------------------------------------------------------------------------

describe("Task 3-C — resolveUserLayers", () => {
  const mockPrisma = {
    inventoryItem: { findMany: mockInventoryFindMany },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when user owns no items", async () => {
    mockInventoryFindMany.mockResolvedValueOnce([]);
    const layers = await resolveUserLayers(mockPrisma, "user-empty");
    expect(layers).toEqual([]);
  });

  it("orders traits back-to-front regardless of DB insertion or retrieval order", async () => {
    mockInventoryFindMany.mockResolvedValueOnce([
      {
        edition: 1,
        trait: { category: "EYEWEAR", imageUrl: "https://cdn/eye.png", isActive: true },
      },
      {
        edition: 1,
        trait: { category: "BG", imageUrl: "https://cdn/bg.png", isActive: true },
      },
      {
        edition: 1,
        trait: {
          category: "CLOTHING",
          imageUrl: "https://cdn/cloth.png",
          isActive: true,
        },
      },
      {
        edition: 1,
        trait: { category: "FUR", imageUrl: "https://cdn/fur.png", isActive: true },
      },
      {
        edition: 1,
        trait: { category: "HEADWEAR", imageUrl: "https://cdn/head.png", isActive: true },
      },
    ]);

    const layers = await resolveUserLayers(mockPrisma, "user-all");
    expect(layers.map((l) => l.category)).toEqual([
      "BG",
      "FUR",
      "CLOTHING",
      "HEADWEAR",
      "EYEWEAR",
    ]);
  });

  it("skips missing categories without throwing", async () => {
    mockInventoryFindMany.mockResolvedValueOnce([
      {
        edition: 1,
        trait: { category: "BG", imageUrl: "https://cdn/bg.png", isActive: true },
      },
      {
        edition: 1,
        trait: { category: "HEADWEAR", imageUrl: "https://cdn/head.png", isActive: true },
      },
    ]);

    const layers = await resolveUserLayers(mockPrisma, "user-partial");
    expect(layers.map((l) => l.category)).toEqual(["BG", "HEADWEAR"]);
  });

  it("skips inactive traits", async () => {
    mockInventoryFindMany.mockResolvedValueOnce([
      {
        edition: 1,
        trait: { category: "BG", imageUrl: "https://cdn/bg.png", isActive: false },
      },
      {
        edition: 1,
        trait: { category: "FUR", imageUrl: "https://cdn/fur.png", isActive: true },
      },
    ]);

    const layers = await resolveUserLayers(mockPrisma, "user-inactive");
    expect(layers.map((l) => l.category)).toEqual(["FUR"]);
  });

  it("picks lowest edition per category when user owns duplicate trait copies", async () => {
    mockInventoryFindMany.mockResolvedValueOnce([
      {
        edition: 1,
        trait: { category: "FUR", imageUrl: "https://cdn/fur-ed1.png", isActive: true },
      },
      {
        edition: 4,
        trait: { category: "FUR", imageUrl: "https://cdn/fur-ed4.png", isActive: true },
      },
    ]);

    const layers = await resolveUserLayers(mockPrisma, "user-dups");
    expect(layers).toHaveLength(1);
    expect(layers[0].imageUrl).toBe("https://cdn/fur-ed1.png");
  });

  it("ensures resolveUserEquippedTraits matches resolveUserLayers exactly", async () => {
    mockInventoryFindMany.mockResolvedValueOnce([
      {
        id: "item-bg-1",
        edition: 1,
        isLocked: false,
        trait: { id: "t-bg-1", category: "BG", imageUrl: "https://cdn/bg1.png", isActive: true },
      },
      {
        id: "item-bg-2",
        edition: 2,
        isLocked: false,
        trait: { id: "t-bg-2", category: "BG", imageUrl: "https://cdn/bg2.png", isActive: true },
      },
      {
        id: "item-fur-1",
        edition: 3,
        isLocked: false,
        trait: { id: "t-fur-1", category: "FUR", imageUrl: "https://cdn/fur1.png", isActive: true },
      },
    ]);

    const equippedMap = await resolveUserEquippedTraits(mockPrisma, "user-exact");
    expect(equippedMap.get("BG")?.itemId).toBe("item-bg-1");
    expect(equippedMap.get("BG")?.imageUrl).toBe("https://cdn/bg1.png");
    expect(equippedMap.get("FUR")?.itemId).toBe("item-fur-1");

    // Re-mock for resolveUserLayers
    mockInventoryFindMany.mockResolvedValueOnce([
      {
        id: "item-bg-1",
        edition: 1,
        isLocked: false,
        trait: { id: "t-bg-1", category: "BG", imageUrl: "https://cdn/bg1.png", isActive: true },
      },
      {
        id: "item-bg-2",
        edition: 2,
        isLocked: false,
        trait: { id: "t-bg-2", category: "BG", imageUrl: "https://cdn/bg2.png", isActive: true },
      },
      {
        id: "item-fur-1",
        edition: 3,
        isLocked: false,
        trait: { id: "t-fur-1", category: "FUR", imageUrl: "https://cdn/fur1.png", isActive: true },
      },
    ]);

    const layers = await resolveUserLayers(mockPrisma, "user-exact");
    expect(layers).toEqual([
      { category: "BG", imageUrl: "https://cdn/bg1.png" },
      { category: "FUR", imageUrl: "https://cdn/fur1.png" },
    ]);
  });

  it("in-memory resolveEquippedItemIdsFromList correctly resolves equipped IDs and skips locked/inactive", () => {
    const items = [
      {
        id: "item-cloth-inactive",
        edition: 1,
        isLocked: false,
        trait: { category: "CLOTHING", isActive: false },
      },
      {
        id: "item-cloth-active-lowest",
        edition: 2,
        isLocked: false,
        trait: { category: "CLOTHING", isActive: true },
      },
      {
        id: "item-cloth-extra",
        edition: 5,
        isLocked: false,
        trait: { category: "CLOTHING", isActive: true },
      },
      {
        id: "item-head-locked",
        edition: 1,
        isLocked: true,
        trait: { category: "HEADWEAR", isActive: true },
      },
      {
        id: "item-head-unlocked",
        edition: 3,
        isLocked: false,
        trait: { category: "HEADWEAR", isActive: true },
      },
    ];

    const equippedIds = resolveEquippedItemIdsFromList(items);
    expect(equippedIds.has("item-cloth-active-lowest")).toBe(true);
    expect(equippedIds.has("item-cloth-inactive")).toBe(false);
    expect(equippedIds.has("item-cloth-extra")).toBe(false);

    expect(equippedIds.has("item-head-unlocked")).toBe(true);
    expect(equippedIds.has("item-head-locked")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. renderUserAvatar — PostgreSQL Persist & Concurrency Control
// ---------------------------------------------------------------------------

describe("Task 3-C — renderUserAvatar & Concurrency", () => {
  const mockPrisma = {
    inventoryItem: { findMany: mockInventoryFindMany },
    user: { updateMany: mockUserUpdateMany },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws MISSING_USER_ID when userId is empty", async () => {
    await expect(renderUserAvatar(mockPrisma, "")).rejects.toMatchObject({
      code: "MISSING_USER_ID",
      status: 400,
    });
  });

  it("throws NO_INVENTORY when user has no active traits", async () => {
    mockInventoryFindMany.mockResolvedValue([]);
    await expect(renderUserAvatar(mockPrisma, "user-none")).rejects.toMatchObject({
      code: "NO_INVENTORY",
      status: 404,
    });
  });

  it("renders PNG and persists binary buffer into User table via updateMany", async () => {
    const bgPng = await makePng24x24(0, 255, 0);

    mockInventoryFindMany.mockResolvedValueOnce([
      {
        edition: 1,
        trait: { category: "BG", imageUrl: "https://cdn/bg.png", isActive: true },
      },
    ]);
    mockUserUpdateMany.mockResolvedValueOnce({ count: 1 });

    const mockFetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () =>
        bgPng.buffer.slice(bgPng.byteOffset, bgPng.byteOffset + bgPng.byteLength),
    })) as unknown as typeof fetch;

    const result = await renderUserAvatar(mockPrisma, "user-db-test", {
      fetchFn: mockFetch,
    });

    expect(result.width).toBe(240);
    expect(result.height).toBe(240);
    expect(result.layerCount).toBe(1);
    expect(result.pngBuffer).toBeInstanceOf(Buffer);
    expect(result.publicUrl).toContain("/api/renders/avatar/user-db-test?v=");

    // Verify DB write
    expect(mockUserUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "user-db-test",
        OR: [{ avatarUpdatedAt: null }, { avatarUpdatedAt: { lte: expect.any(Date) } }],
      },
      data: {
        avatarPng: expect.any(Uint8Array),
        avatarUpdatedAt: expect.any(Date),
      },
    });
  });

  it("coalesces simultaneous parallel renders for the same userId (in-flight deduplication)", async () => {
    const bgPng = await makePng24x24(10, 20, 30);

    mockInventoryFindMany.mockResolvedValue([
      {
        edition: 1,
        trait: { category: "BG", imageUrl: "https://cdn/bg.png", isActive: true },
      },
    ]);
    mockUserUpdateMany.mockResolvedValue({ count: 1 });

    let fetchCount = 0;
    const mockFetch = vi.fn(async () => {
      fetchCount++;
      return {
        ok: true,
        arrayBuffer: async () =>
          bgPng.buffer.slice(bgPng.byteOffset, bgPng.byteOffset + bgPng.byteLength),
      };
    }) as unknown as typeof fetch;

    // Trigger two renders in parallel for the exact same user
    const [res1, res2] = await Promise.all([
      renderUserAvatar(mockPrisma, "user-parallel", { fetchFn: mockFetch }),
      renderUserAvatar(mockPrisma, "user-parallel", { fetchFn: mockFetch }),
    ]);

    expect(res1.publicUrl).toBe(res2.publicUrl);
    // fetch should be called only once due to task deduplication
    expect(fetchCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5. getAvatarRecord — Lookup by userId or EVM address
// ---------------------------------------------------------------------------

describe("Task 3-C — getAvatarRecord", () => {
  const mockPrisma = {
    user: { findUnique: mockUserFindUnique },
    walletIdentity: { findUnique: mockWalletFindUnique },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for empty identifier", async () => {
    expect(await getAvatarRecord(mockPrisma, "")).toBeNull();
  });

  it("resolves record by User.id", async () => {
    const fakeBuffer = Buffer.from("fake-png-data");
    const fakeDate = new Date("2026-10-24T10:00:00.000Z");

    mockUserFindUnique.mockResolvedValueOnce({
      id: "u-123",
      avatarPng: fakeBuffer,
      avatarUpdatedAt: fakeDate,
    });

    const record = await getAvatarRecord(mockPrisma, "u-123");
    expect(record).toEqual({
      userId: "u-123",
      pngBuffer: fakeBuffer,
      updatedAt: fakeDate,
    });
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: "u-123" },
      select: { id: true, avatarPng: true, avatarUpdatedAt: true },
    });
  });

  it("resolves record by wallet address", async () => {
    const fakeBuffer = Buffer.from("wallet-png-data");
    const fakeDate = new Date("2026-10-24T12:00:00.000Z");
    const address = "0x1234567890123456789012345678901234567890";

    mockUserFindUnique.mockResolvedValueOnce(null);
    mockWalletFindUnique.mockResolvedValueOnce({
      user: {
        id: "u-wallet",
        avatarPng: fakeBuffer,
        avatarUpdatedAt: fakeDate,
      },
    });

    const record = await getAvatarRecord(mockPrisma, address);
    expect(record).toEqual({
      userId: "u-wallet",
      pngBuffer: fakeBuffer,
      updatedAt: fakeDate,
    });
    expect(mockWalletFindUnique).toHaveBeenCalledWith({
      where: { address: address.toLowerCase() },
      select: {
        user: {
          select: { id: true, avatarPng: true, avatarUpdatedAt: true },
        },
      },
    });
  });

  it("handles P2022 column not found error gracefully during User lookup", async () => {
    const p2022Err = Object.assign(
      new Error("The column `User.avatarPng` does not exist in the current database."),
      { code: "P2022" },
    );
    mockUserFindUnique
      .mockRejectedValueOnce(p2022Err)
      .mockResolvedValueOnce({ id: "u-missing-col" });

    const record = await getAvatarRecord(mockPrisma, "u-missing-col");
    expect(record).toEqual({
      userId: "u-missing-col",
      pngBuffer: null,
      updatedAt: null,
    });
  });

  it("handles P2022 column not found error gracefully during wallet lookup", async () => {
    const address = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const p2022Err = Object.assign(
      new Error("The column `User.avatarPng` does not exist in the current database."),
      { code: "P2022" },
    );

    mockUserFindUnique.mockResolvedValueOnce(null);
    mockWalletFindUnique
      .mockRejectedValueOnce(p2022Err)
      .mockResolvedValueOnce({ user: { id: "u-wallet-fallback" } });

    const record = await getAvatarRecord(mockPrisma, address);
    expect(record).toEqual({
      userId: "u-wallet-fallback",
      pngBuffer: null,
      updatedAt: null,
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Dynamic Route Handlers — GET & POST
// ---------------------------------------------------------------------------

describe("Task 3-C — Route Handlers (app/api/renders/avatar)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/renders/avatar/[id]", () => {
    it("returns 400 when identifier is empty", async () => {
      const req = new Request("http://localhost:3000/api/renders/avatar/");
      const res = await dynamicIdGET(req, { params: Promise.resolve({ id: "" }) });
      expect(res.status).toBe(400);
    });

    it("serves binary PNG with Content-Type, ETag and Cache-Control headers", async () => {
      const pngBytes = await makePng24x24(10, 20, 30);
      const fakeDate = new Date("2026-10-24T14:00:00.000Z");

      mockUserFindUnique.mockResolvedValueOnce({
        id: "u-static",
        avatarPng: pngBytes,
        avatarUpdatedAt: fakeDate,
      });

      const req = new Request("http://localhost:3000/api/renders/avatar/u-static");
      const res = await dynamicIdGET(req, {
        params: Promise.resolve({ id: "u-static" }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/png");
      expect(res.headers.get("Cache-Control")).toContain("must-revalidate");
      expect(res.headers.get("ETag")).toBe(`W/"${fakeDate.getTime()}"`);

      const arrayBuffer = await res.arrayBuffer();
      expect(Buffer.from(arrayBuffer)).toEqual(pngBytes);
    });

    it("returns 304 Not Modified when If-None-Match header matches current ETag", async () => {
      const pngBytes = await makePng24x24(10, 20, 30);
      const fakeDate = new Date("2026-10-24T14:00:00.000Z");
      const etag = `W/"${fakeDate.getTime()}"`;

      mockUserFindUnique.mockResolvedValueOnce({
        id: "u-static",
        avatarPng: pngBytes,
        avatarUpdatedAt: fakeDate,
      });

      const req = new Request("http://localhost:3000/api/renders/avatar/u-static", {
        headers: { "if-none-match": etag },
      });
      const res = await dynamicIdGET(req, {
        params: Promise.resolve({ id: "u-static" }),
      });

      expect(res.status).toBe(304);
      expect(res.headers.get("ETag")).toBe(etag);
    });

    it("returns 404 when user avatar record and inventory do not exist", async () => {
      mockUserFindUnique.mockResolvedValueOnce(null);
      mockWalletFindUnique.mockResolvedValueOnce(null);

      const req = new Request("http://localhost:3000/api/renders/avatar/u-none");
      const res = await dynamicIdGET(req, { params: Promise.resolve({ id: "u-none" }) });
      expect(res.status).toBe(404);
    });

    it("returns 429 when lazy fallback render is rate limited", async () => {
      // User exists in DB, but pngBuffer is null
      mockUserFindUnique.mockResolvedValueOnce({
        id: "u-lazy-ratelimited",
        avatarPng: null,
        avatarUpdatedAt: null,
      });

      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        allowed: false,
        retryAfterSeconds: 45,
      });

      const req = new Request(
        "http://localhost:3000/api/renders/avatar/u-lazy-ratelimited",
      );
      const res = await dynamicIdGET(req, {
        params: Promise.resolve({ id: "u-lazy-ratelimited" }),
      });

      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("45");
      const text = await res.text();
      expect(text).toContain("Too many render requests");
    });
  });

  describe("POST /api/renders/avatar (On-demand regeneration)", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(authenticateRequest).mockResolvedValueOnce(null);
      const req = new Request("http://localhost:3000/api/renders/avatar", {
        method: "POST",
      });
      const res = await routePOST(req);
      expect(res.status).toBe(401);
    });

    it("returns 429 when rate limited", async () => {
      vi.mocked(authenticateRequest).mockResolvedValueOnce({
        sessionId: "s1",
        userId: "u-limited",
        address: "0xabc",
      });

      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        allowed: false,
        retryAfterSeconds: 60,
      });

      const req = new Request("http://localhost:3000/api/renders/avatar", {
        method: "POST",
      });
      const res = await routePOST(req);
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("60");
      const json = await res.json();
      expect(json.error).toBe("RATE_LIMITED");
    });

    it("returns 200 with publicUrl and metadata on successful on-demand render", async () => {
      vi.mocked(authenticateRequest).mockResolvedValueOnce({
        sessionId: "s1",
        userId: "u-ok",
        address: "0xabc",
      });

      const bgPng = await makePng24x24(100, 150, 200);
      mockInventoryFindMany.mockResolvedValueOnce([
        {
          edition: 1,
          trait: { category: "BG", imageUrl: "https://cdn/bg.png", isActive: true },
        },
      ]);
      mockUserUpdateMany.mockResolvedValueOnce({ count: 1 });

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () =>
          bgPng.buffer.slice(bgPng.byteOffset, bgPng.byteOffset + bgPng.byteLength),
      } as unknown as Response);

      try {
        const req = new Request("http://localhost:3000/api/renders/avatar", {
          method: "POST",
        });
        const res = await routePOST(req);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.publicUrl).toContain("/api/renders/avatar/u-ok?v=");
        expect(body.width).toBe(240);
        expect(body.height).toBe(240);
        expect(body.layerCount).toBe(1);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});

// ---------------------------------------------------------------------------
// 7. Event Triggers — safeTriggerAvatarUpdate
// ---------------------------------------------------------------------------

describe("Task 3-C — safeTriggerAvatarUpdate", () => {
  it("does not throw or reject when background render fails", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Intentionally supply a broken fetch function that throws network error
    const brokenFetch = vi.fn().mockRejectedValue(new Error("CDN offline"));

    mockInventoryFindMany.mockResolvedValueOnce([
      {
        edition: 1,
        trait: { category: "BG", imageUrl: "https://cdn/bg.png", isActive: true },
      },
    ]);

    expect(() => {
      safeTriggerAvatarUpdate({} as any, "user-trigger-test", brokenFetch as any);
    }).not.toThrow();

    consoleSpy.mockRestore();
  });

  it("updates database when background render succeeds", async () => {
    const bgPng = await makePng24x24(0, 100, 200);

    const mockPrisma = {
      inventoryItem: {
        findMany: vi.fn().mockResolvedValueOnce([
          {
            edition: 1,
            trait: { category: "BG", imageUrl: "https://cdn/bg.png", isActive: true },
          },
        ]),
      },
      user: {
        updateMany: vi.fn().mockResolvedValueOnce({ count: 1 }),
      },
    } as any;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () =>
        bgPng.buffer.slice(bgPng.byteOffset, bgPng.byteOffset + bgPng.byteLength),
    } as unknown as Response);

    safeTriggerAvatarUpdate(mockPrisma, "user-bg-success", mockFetch as any);

    // Give microtask tick to resolve
    await new Promise((r) => setTimeout(r, 50));

    expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "user-bg-success" }),
      data: expect.objectContaining({
        avatarPng: expect.any(Uint8Array),
        avatarUpdatedAt: expect.any(Date),
      }),
    });
  });
});

// ---------------------------------------------------------------------------
// 8. Client Helpers — getAvatarPublicUrl & triggerAvatarRender
// ---------------------------------------------------------------------------

describe("Task 3-C — Client Helpers", () => {
  it("generates unversioned public URL when updatedAt is not provided", () => {
    expect(getAvatarPublicUrl("user-123")).toBe("/api/renders/avatar/user-123");
  });

  it("appends timestamp version query param when updatedAt is provided", () => {
    const date = new Date("2026-10-24T12:00:00.000Z");
    expect(getAvatarPublicUrl("user-123", date)).toBe(
      `/api/renders/avatar/user-123?v=${date.getTime()}`,
    );
  });

  it("sanitizes unsafe characters in userId", () => {
    expect(getAvatarPublicUrl("user/with/path")).toBe(
      "/api/renders/avatar/user_with_path",
    );
  });

  it("triggerAvatarRender calls POST /api/renders/avatar and returns JSON", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        publicUrl: "/api/renders/avatar/u-1?v=123",
        width: 240,
        height: 240,
        layerCount: 2,
      }),
    } as unknown as Response);

    try {
      const data = await triggerAvatarRender();
      expect(data.publicUrl).toBe("/api/renders/avatar/u-1?v=123");
      expect(data.width).toBe(240);
      expect(global.fetch).toHaveBeenCalledWith("/api/renders/avatar", {
        method: "POST",
      });
    } finally {
      global.fetch = originalFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// 9. fetchLayerBuffer — Local Filesystem & Remote Fetch Resolution
// ---------------------------------------------------------------------------

describe("Task 3-C — fetchLayerBuffer", () => {
  const originalEnvAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originalEnvVercelUrl = process.env.VERCEL_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalEnvAppUrl;
    process.env.VERCEL_URL = originalEnvVercelUrl;
  });

  describe("File lokal berhasil dibaca", () => {
    it("reads existing local trait layer from public/traits/ and returns valid buffer", async () => {
      const buffer = await fetchLayerBuffer("/traits/hoodie.png");
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      // Verify that sharp can parse it as a valid image
      const meta = await sharp(buffer).metadata();
      expect(meta.format).toBe("png");
      expect(meta.width).toBe(240);
      expect(meta.height).toBe(240);
    });

    it("handles query params and hash by stripping them before reading local file", async () => {
      const buffer = await fetchLayerBuffer("/traits/hoodie.png?v=123#test");
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe("File lokal tidak ditemukan", () => {
    it("throws 404 FETCH_LAYER_FAILED when local file does not exist and no base URL is set", async () => {
      await expect(
        fetchLayerBuffer("/traits/non-existent-layer-abc.png"),
      ).rejects.toMatchObject({
        name: "AvatarRenderError",
        code: "FETCH_LAYER_FAILED",
        status: 404,
      });
    });

    it("falls back to remote fetch if base URL is configured", async () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://assets.chimphood.io";
      const fakePng = await makePng24x24(20, 40, 60);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () =>
          fakePng.buffer.slice(fakePng.byteOffset, fakePng.byteOffset + fakePng.byteLength),
      });

      const buffer = await fetchLayerBuffer(
        "/traits/remote-only-layer.png",
        mockFetch,
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://assets.chimphood.io/traits/remote-only-layer.png",
      );
      expect(buffer).toEqual(fakePng);
    });

    it("handles remote fallback 404 cleanly when base URL is configured", async () => {
      process.env.VERCEL_URL = "chimphood.vercel.app";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(
        fetchLayerBuffer("/traits/missing-everywhere.png", mockFetch),
      ).rejects.toMatchObject({
        name: "AvatarRenderError",
        code: "FETCH_LAYER_FAILED",
        status: 404,
      });
      expect(mockFetch).toHaveBeenCalledWith(
        "https://chimphood.vercel.app/traits/missing-everywhere.png",
      );
    });
  });

  describe("URL absolut tetap menggunakan fetch", () => {
    it("uses fetchFn for http:// URLs without reading filesystem", async () => {
      const fakePng = await makePng24x24(10, 20, 30);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () =>
          fakePng.buffer.slice(fakePng.byteOffset, fakePng.byteOffset + fakePng.byteLength),
      });

      const buffer = await fetchLayerBuffer(
        "http://assets.example.com/traits/layer1.png",
        mockFetch,
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "http://assets.example.com/traits/layer1.png",
      );
      expect(buffer).toEqual(fakePng);
    });

    it("uses fetchFn for https:// URLs without reading filesystem", async () => {
      const fakePng = await makePng24x24(50, 60, 70);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () =>
          fakePng.buffer.slice(fakePng.byteOffset, fakePng.byteOffset + fakePng.byteLength),
      });

      const buffer = await fetchLayerBuffer(
        "https://assets.chimphood.io/traits/cyber-jungle.png",
        mockFetch,
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://assets.chimphood.io/traits/cyber-jungle.png",
      );
      expect(buffer).toEqual(fakePng);
    });

    it("throws 502 FETCH_LAYER_FAILED on network error", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("DNS resolution failed"));

      await expect(
        fetchLayerBuffer("https://assets.chimphood.io/traits/err.png", mockFetch),
      ).rejects.toMatchObject({
        name: "AvatarRenderError",
        code: "FETCH_LAYER_FAILED",
        status: 502,
      });
    });

    it("throws 502 FETCH_LAYER_FAILED on non-200 HTTP response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(
        fetchLayerBuffer("https://assets.chimphood.io/traits/err.png", mockFetch),
      ).rejects.toMatchObject({
        name: "AvatarRenderError",
        code: "FETCH_LAYER_FAILED",
        status: 502,
      });
    });
  });

  describe("Path tidak valid atau berpotensi traversal ditolak", () => {
    it("rejects empty or whitespace string", async () => {
      await expect(fetchLayerBuffer("")).rejects.toMatchObject({
        code: "INVALID_LAYER_PATH",
        status: 400,
      });
      await expect(fetchLayerBuffer("   ")).rejects.toMatchObject({
        code: "INVALID_LAYER_PATH",
        status: 400,
      });
    });

    it("rejects paths outside /traits/ prefix", async () => {
      await expect(fetchLayerBuffer("/etc/passwd")).rejects.toMatchObject({
        code: "INVALID_LAYER_PATH",
        status: 400,
      });
      await expect(fetchLayerBuffer("/images/logo.png")).rejects.toMatchObject({
        code: "INVALID_LAYER_PATH",
        status: 400,
      });
      await expect(
        fetchLayerBuffer("ftp://files.example.com/trait.png"),
      ).rejects.toMatchObject({
        code: "INVALID_LAYER_PATH",
        status: 400,
      });
    });

    it("rejects path traversal attempts with ../", async () => {
      await expect(
        fetchLayerBuffer("/traits/../package.json"),
      ).rejects.toMatchObject({
        code: "INVALID_LAYER_PATH",
        status: 400,
      });
      await expect(
        fetchLayerBuffer("/traits/../../etc/passwd"),
      ).rejects.toMatchObject({
        code: "INVALID_LAYER_PATH",
        status: 400,
      });
    });

    it("rejects URL-encoded path traversal attempts (%2e%2e%2f)", async () => {
      await expect(
        fetchLayerBuffer("/traits/%2e%2e%2fpackage.json"),
      ).rejects.toMatchObject({
        code: "INVALID_LAYER_PATH",
        status: 400,
      });
    });

    it("rejects null byte injection", async () => {
      await expect(
        fetchLayerBuffer("/traits/hoodie.png%00.jpg"),
      ).rejects.toMatchObject({
        code: "INVALID_LAYER_PATH",
        status: 400,
      });
    });

    it("rejects root directory /traits/ without file", async () => {
      await expect(fetchLayerBuffer("/traits/")).rejects.toMatchObject({
        code: "INVALID_LAYER_PATH",
        status: 400,
      });
    });

    it("rejects double leading slash /traits//hoodie.png", async () => {
      await expect(fetchLayerBuffer("/traits//hoodie.png")).rejects.toMatchObject({
        code: "INVALID_LAYER_PATH",
        status: 400,
      });
    });
  });
});
