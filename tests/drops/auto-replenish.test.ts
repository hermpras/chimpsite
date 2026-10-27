import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DEFAULT_TRAIT_TEMPLATES,
  DEFAULT_CYCLE_STOCK_TOTAL,
  ensureActiveCyclePeriod,
  ensureDefaultTraits,
} from "@/server/drops/auto-replenish";
import {
  getUtcCycleForTime,
  HYPE_CONTROL_CYCLE_DURATION_HOURS,
  DEFAULT_CYCLE_DURATION_HOURS,
} from "@/server/drops/schedule";
import { calculateTransparentProbabilities } from "@/server/drops/claim";

describe("Auto-Replenish Drop Engine", () => {
  it("enforces default template totals exactly 250 stock units with 5 core categories", () => {
    expect(DEFAULT_CYCLE_STOCK_TOTAL).toBe(250);

    const totalStock = DEFAULT_TRAIT_TEMPLATES.reduce((acc, t) => acc + t.stock, 0);
    expect(totalStock).toBe(250);

    const categories = new Set(DEFAULT_TRAIT_TEMPLATES.map((t) => t.category));
    expect(categories.has("BG")).toBe(true);
    expect(categories.has("FUR")).toBe(true);
    expect(categories.has("CLOTHING")).toBe(true);
    expect(categories.has("HEADWEAR")).toBe(true);
    expect(categories.has("EYEWEAR")).toBe(true);
  });

  it("includes Cyber Halo as Legendary Headwear with 10 stock / 4% probability", () => {
    const cyberHalo = DEFAULT_TRAIT_TEMPLATES.find((t) => t.slug === "cyber-halo");
    expect(cyberHalo).toBeDefined();
    expect(cyberHalo?.rarity).toBe("LEGENDARY");
    expect(cyberHalo?.category).toBe("HEADWEAR");
    expect(cyberHalo?.stock).toBe(10);
    expect(cyberHalo?.weight).toBe(10);

    const probs = calculateTransparentProbabilities(
      DEFAULT_TRAIT_TEMPLATES.map((t, idx) => ({
        id: `pool-${idx}`,
        traitId: `trait-${idx}`,
        remainingStock: t.stock,
        weight: t.weight,
        trait: { name: t.name, category: t.category, rarity: t.rarity },
      })),
    );

    const haloProb = probs.find((p) => p.traitName === "Cyber Halo");
    expect(haloProb?.probabilityPercent).toBe(4); // 10/250 * 100 = 4.00%

    const totalProb = probs.reduce((acc, p) => acc + p.probabilityPercent, 0);
    expect(Math.round(totalProb)).toBe(100);
  });

  it("calculates exact transparent probability distribution for all 5 template traits", () => {
    const probs = calculateTransparentProbabilities(
      DEFAULT_TRAIT_TEMPLATES.map((t, idx) => ({
        id: `pool-${idx}`,
        traitId: `trait-${idx}`,
        remainingStock: t.stock,
        weight: t.weight,
        trait: { name: t.name, category: t.category, rarity: t.rarity },
      })),
    );

    expect(probs).toEqual([
      expect.objectContaining({ traitName: "Cyber Jungle", remainingStock: 85, probabilityPercent: 34 }),
      expect.objectContaining({ traitName: "Stealth Hoodie", remainingStock: 65, probabilityPercent: 26 }),
      expect.objectContaining({ traitName: "Golden Fur", remainingStock: 50, probabilityPercent: 20 }),
      expect.objectContaining({ traitName: "Laser Visor", remainingStock: 40, probabilityPercent: 16 }),
      expect.objectContaining({ traitName: "Cyber Halo", remainingStock: 10, probabilityPercent: 4 }),
    ]);
  });

  it("ensureDefaultTraits upserts all 5 default traits", async () => {
    const upsertMock = vi.fn().mockImplementation(({ create }) => Promise.resolve({ id: `id-${create.slug}`, ...create }));
    const mockPrisma = {
      trait: {
        upsert: upsertMock,
      },
    } as any;

    const traits = await ensureDefaultTraits(mockPrisma);
    expect(traits).toHaveLength(5);
    expect(upsertMock).toHaveBeenCalledTimes(5);
  });

  it("ensureActiveCyclePeriod returns existing period if already active with pool stock", async () => {
    const existing = {
      id: "period-active-1",
      status: "ACTIVE",
      poolItems: [
        { id: "pi-1", traitId: "t-1", remainingStock: 50, trait: { name: "Cyber Jungle" } },
      ],
    };

    const mockPrisma = {
      dropPeriod: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    } as any;

    const drop = { id: "drop-1", startsAt: new Date(), endsAt: new Date(Date.now() + 1000000) } as any;
    const period = await ensureActiveCyclePeriod(mockPrisma, drop, new Date());

    expect(period).toBe(existing);
    expect(mockPrisma.dropPeriod.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ dropId: "drop-1", status: { in: ["ACTIVE", "CONFIGURED", "PENDING_CONFIG"] } }),
        data: { status: "ENDED" },
      }),
    );
  });

  it("ensureActiveCyclePeriod provisions 250 stock template when no active period exists for cycle", async () => {
    const createdPeriod = {
      id: "period-new",
      periodIndex: 1,
      status: "ACTIVE",
      isStockConfigured: true,
      isStockLocked: true,
      poolItems: DEFAULT_TRAIT_TEMPLATES.map((t, i) => ({
        id: `pi-${i}`,
        periodId: "period-new",
        traitId: `trait-${t.slug}`,
        allocatedStock: t.stock,
        remainingStock: t.stock,
        claimedStock: 0,
        weight: t.weight,
        trait: {
          id: `trait-${t.slug}`,
          slug: t.slug,
          name: t.name,
          category: t.category,
          rarity: t.rarity,
        },
      })),
    };

    const txMock = {
      dropPeriod: {
        upsert: vi.fn().mockResolvedValue(createdPeriod),
        findUniqueOrThrow: vi.fn().mockResolvedValue(createdPeriod),
      },
      dropPoolItem: {
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const mockPrisma = {
      dropPeriod: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      trait: {
        upsert: vi.fn().mockImplementation(({ create }) =>
          Promise.resolve({ id: `trait-${create.slug}`, ...create }),
        ),
      },
      $transaction: vi.fn().mockImplementation(async (cb) => cb(txMock)),
    } as any;

    const now = new Date();
    const drop = {
      id: "drop-1",
      startsAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      endsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    } as any;

    const result = await ensureActiveCyclePeriod(mockPrisma, drop, now);

    expect(result.id).toBe("period-new");
    expect(result.status).toBe("ACTIVE");
    expect(txMock.dropPoolItem.upsert).toHaveBeenCalledTimes(5);
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  it("getUtcCycleForTime correctly calculates 5-hour Hype Control cycles with 30m claim window", () => {
    const anchor = new Date("2026-10-26T00:00:00.000Z");
    const testTime = new Date("2026-10-26T07:15:00.000Z"); // 7h15m after anchor -> Cycle 2 (05:00 - 10:00)

    const cycle = getUtcCycleForTime(testTime, HYPE_CONTROL_CYCLE_DURATION_HOURS, anchor);
    expect(cycle.startsAt.toISOString()).toBe("2026-10-26T05:00:00.000Z");
    expect(cycle.endsAt.toISOString()).toBe("2026-10-26T10:00:00.000Z");
    expect(cycle.claimWindowEndsAt.toISOString()).toBe("2026-10-26T05:30:00.000Z");
    expect(cycle.cycleDurationHours).toBe(5);
  });

  it("ensureActiveCyclePeriod creates a 5-hour period when drop is configured for Hype Control", async () => {
    let capturedUpsertData: any = null;
    const createdPeriod = {
      id: "period-hype-5h",
      periodIndex: 2,
      status: "ACTIVE",
      isStockConfigured: true,
      isStockLocked: true,
      poolItems: [],
    };

    const txMock = {
      dropPeriod: {
        upsert: vi.fn().mockImplementation(({ create }) => {
          capturedUpsertData = create;
          return Promise.resolve(createdPeriod);
        }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(createdPeriod),
      },
      dropPoolItem: {
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const mockPrisma = {
      dropPeriod: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      trait: {
        upsert: vi.fn().mockImplementation(({ create }) =>
          Promise.resolve({ id: `trait-${create.slug}`, ...create }),
        ),
      },
      $transaction: vi.fn().mockImplementation(async (cb) => cb(txMock)),
    } as any;

    const anchor = new Date("2026-10-26T00:00:00.000Z");
    const testNow = new Date("2026-10-26T06:00:00.000Z");
    const drop = {
      id: "drop-hype",
      startsAt: anchor,
      endsAt: new Date("2026-11-26T00:00:00.000Z"),
      cycleDurationHours: 5,
    } as any;

    const result = await ensureActiveCyclePeriod(mockPrisma, drop, testNow);

    expect(result.id).toBe("period-hype-5h");
    expect(capturedUpsertData).toBeDefined();
    // startsAt is 05:00 UTC, endsAt is 10:00 UTC (5 hours duration)
    expect(capturedUpsertData.startsAt.toISOString()).toBe("2026-10-26T05:00:00.000Z");
    expect(capturedUpsertData.endsAt.toISOString()).toBe("2026-10-26T10:00:00.000Z");
  });
});
