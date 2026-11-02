import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DEFAULT_TRAIT_TEMPLATES,
  DEFAULT_CYCLE_STOCK_TOTAL,
  ensureActiveCyclePeriod,
  ensureDefaultTraits,
  calculateDynamicPoolAllocations,
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
      $queryRaw: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
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
    expect(mockPrisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { maxWait: 5_000, timeout: 10_000 },
    );
    // Verified: findUniqueOrThrow is eliminated from the transaction to save network roundtrip
    expect(txMock.dropPeriod.findUniqueOrThrow).not.toHaveBeenCalled();
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
      $queryRaw: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
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

  it("dynamically allocates 250 stock units across 25 traits proportionally by rarity (Opsi 1)", () => {
    const categories = ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"] as const;
    const rarities = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"] as const;

    // Generate 25 mock traits (5 categories x 5 rarities)
    const mockTraits: any[] = [];
    let id = 1;
    for (const cat of categories) {
      for (const rarity of rarities) {
        mockTraits.push({
          id: `trait-${id++}`,
          slug: `trait-${cat.toLowerCase()}-${rarity.toLowerCase()}`,
          name: `${cat} ${rarity}`,
          category: cat,
          rarity,
          isActive: true,
        });
      }
    }

    expect(mockTraits).toHaveLength(25);

    const allocations = calculateDynamicPoolAllocations(mockTraits);
    expect(allocations).toHaveLength(25);

    // Total stock must be exactly 250
    const totalAllocatedStock = allocations.reduce((sum, a) => sum + a.stock, 0);
    expect(totalAllocatedStock).toBe(250);

    const traitMap = new Map(mockTraits.map((t) => [t.id, t]));

    // Verify stock distribution matches expected rarity tiers:
    // 5 Common traits get 17 stock each (5 x 17 = 85)
    const commonTraits = allocations.filter((a) => traitMap.get(a.traitId)?.rarity === "COMMON");
    expect(commonTraits).toHaveLength(5);
    expect(commonTraits.reduce((sum, a) => sum + a.stock, 0)).toBe(85);

    // 5 Uncommon traits get 13 stock each (5 x 13 = 65)
    const uncommonTraits = allocations.filter((a) => traitMap.get(a.traitId)?.rarity === "UNCOMMON");
    expect(uncommonTraits).toHaveLength(5);
    expect(uncommonTraits.reduce((sum, a) => sum + a.stock, 0)).toBe(65);

    // 5 Rare traits get 10 stock each (5 x 10 = 50)
    const rareTraits = allocations.filter((a) => traitMap.get(a.traitId)?.rarity === "RARE");
    expect(rareTraits).toHaveLength(5);
    expect(rareTraits.reduce((sum, a) => sum + a.stock, 0)).toBe(50);

    // 5 Epic traits get 8 stock each (5 x 8 = 40)
    const epicTraits = allocations.filter((a) => traitMap.get(a.traitId)?.rarity === "EPIC");
    expect(epicTraits).toHaveLength(5);
    expect(epicTraits.reduce((sum, a) => sum + a.stock, 0)).toBe(40);

    // 5 Legendary traits get 2 stock each (5 x 2 = 10)
    const legendaryTraits = allocations.filter((a) => traitMap.get(a.traitId)?.rarity === "LEGENDARY");
    expect(legendaryTraits).toHaveLength(5);
    expect(legendaryTraits.reduce((sum, a) => sum + a.stock, 0)).toBe(10);
  });

  it("skips re-upserting pool items when transaction finds all active trait items are already complete", async () => {
    const fullPoolItems = DEFAULT_TRAIT_TEMPLATES.map((t, i) => ({
      id: `pi-${i}`,
      periodId: "period-already-complete",
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
    }));

    const fullPeriod = {
      id: "period-already-complete",
      periodIndex: 1,
      status: "ACTIVE",
      isStockConfigured: true,
      isStockLocked: true,
      poolItems: fullPoolItems,
    };

    const txMock = {
      $queryRaw: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
      dropPeriod: {
        upsert: vi.fn().mockResolvedValue(fullPeriod),
        findUniqueOrThrow: vi.fn().mockResolvedValue(fullPeriod),
      },
      dropPoolItem: {
        findMany: vi.fn().mockResolvedValue(fullPoolItems),
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
        findMany: vi.fn().mockResolvedValue(
          DEFAULT_TRAIT_TEMPLATES.map((t) => ({
            id: `trait-${t.slug}`,
            slug: t.slug,
            name: t.name,
            category: t.category,
            rarity: t.rarity,
            isActive: true,
          })),
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

    expect(result.id).toBe("period-already-complete");
    // Crucial: upsert should NOT be called when pool is already complete (saves RTT and prevents lock contention)
    expect(txMock.dropPoolItem.upsert).not.toHaveBeenCalled();
  });

  it("provisions missing traits when existing pool is incomplete without corrupting existing items", async () => {
    // Only 2 of the 5 traits exist in the pool
    const partialPoolItems = [
      {
        id: "pi-0",
        periodId: "period-partial",
        traitId: `trait-${DEFAULT_TRAIT_TEMPLATES[0].slug}`,
        allocatedStock: 85,
        remainingStock: 70, // Already partially claimed (15 claimed)
        claimedStock: 15,
        weight: 85,
        trait: DEFAULT_TRAIT_TEMPLATES[0],
      },
      {
        id: "pi-1",
        periodId: "period-partial",
        traitId: `trait-${DEFAULT_TRAIT_TEMPLATES[1].slug}`,
        allocatedStock: 65,
        remainingStock: 65,
        claimedStock: 0,
        weight: 65,
        trait: DEFAULT_TRAIT_TEMPLATES[1],
      },
    ];

    const completedPeriod = {
      id: "period-partial",
      periodIndex: 1,
      status: "ACTIVE",
      isStockConfigured: true,
      isStockLocked: true,
      poolItems: [...partialPoolItems],
    };

    const txMock = {
      $queryRaw: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
      dropPeriod: {
        upsert: vi.fn().mockResolvedValue(completedPeriod),
        findUniqueOrThrow: vi.fn().mockResolvedValue(completedPeriod),
      },
      dropPoolItem: {
        findMany: vi.fn().mockResolvedValue(partialPoolItems),
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
        findMany: vi.fn().mockResolvedValue(
          DEFAULT_TRAIT_TEMPLATES.map((t) => ({
            id: `trait-${t.slug}`,
            slug: t.slug,
            name: t.name,
            category: t.category,
            rarity: t.rarity,
            isActive: true,
          })),
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

    expect(result.id).toBe("period-partial");
    // Only the 3 missing trait items are upserted, avoiding redundant round trips and lock contention on existing items
    expect(txMock.dropPoolItem.upsert).toHaveBeenCalledTimes(3);
    expect(result.poolItems).toHaveLength(5);
  });

  it("handles concurrent ensureActiveCyclePeriod invocations safely and idempotently", async () => {
    let transactionCount = 0;
    let findManyCalls = 0;
    const sharedPeriod = {
      id: "period-concurrent",
      periodIndex: 1,
      status: "ACTIVE",
      isStockConfigured: true,
      isStockLocked: true,
      poolItems: DEFAULT_TRAIT_TEMPLATES.map((t, i) => ({
        id: `pi-${i}`,
        periodId: "period-concurrent",
        traitId: `trait-${t.slug}`,
        allocatedStock: t.stock,
        remainingStock: t.stock,
        claimedStock: 0,
        weight: t.weight,
        trait: t,
      })),
    };

    const txMock = {
      $queryRaw: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
      dropPeriod: {
        upsert: vi.fn().mockResolvedValue(sharedPeriod),
        findUniqueOrThrow: vi.fn().mockResolvedValue(sharedPeriod),
      },
      dropPoolItem: {
        findMany: vi.fn().mockImplementation(async () => {
          findManyCalls++;
          // First caller finds empty pool and provisions; subsequent concurrent callers find pool complete
          return findManyCalls > 1 ? sharedPeriod.poolItems : [];
        }),
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
        findMany: vi.fn().mockResolvedValue(
          DEFAULT_TRAIT_TEMPLATES.map((t) => ({
            id: `trait-${t.slug}`,
            slug: t.slug,
            name: t.name,
            category: t.category,
            rarity: t.rarity,
            isActive: true,
          })),
        ),
      },
      $transaction: vi.fn().mockImplementation(async (cb) => {
        transactionCount++;
        return await cb(txMock);
      }),
    } as any;

    const now = new Date();
    const drop = {
      id: "drop-1",
      startsAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      endsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    } as any;

    // Simulate 3 concurrent callers arriving simultaneously
    const [res1, res2, res3] = await Promise.all([
      ensureActiveCyclePeriod(mockPrisma, drop, now),
      ensureActiveCyclePeriod(mockPrisma, drop, now),
      ensureActiveCyclePeriod(mockPrisma, drop, now),
    ]);

    expect(res1.id).toBe("period-concurrent");
    expect(res2.id).toBe("period-concurrent");
    expect(res3.id).toBe("period-concurrent");
    expect(transactionCount).toBe(3);
    // Only the first transaction provisioned items; concurrent transactions found pool complete and skipped re-upserting
    expect(txMock.dropPoolItem.upsert).toHaveBeenCalledTimes(5);
    expect(txMock.dropPeriod.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  describe("P2028 Concurrency Guard & Advisory Lock Tests", () => {
    it("executes PostgreSQL advisory lock via $queryRaw and post-lock re-check to prevent concurrent duplicate periods", async () => {
      let queryRawCallCount = 0;
      let capturedRawQuery: any = null;
      let dropPeriodUpsertCalls = 0;
      let sharedDbPeriod: any = null;

      let isLocked = false;
      const waitQueue: Array<() => void> = [];
      const acquireLock = () =>
        new Promise<void>((resolve) => {
          if (!isLocked) {
            isLocked = true;
            resolve();
          } else {
            waitQueue.push(resolve);
          }
        });
      const releaseLock = () => {
        if (waitQueue.length > 0) {
          const next = waitQueue.shift();
          next!();
        } else {
          isLocked = false;
        }
      };

      const provisionedPoolItems: any[] = [];

      const txMock = {
        $queryRaw: vi.fn().mockImplementation(async (strings, ...values) => {
          queryRawCallCount++;
          capturedRawQuery = { strings, values };
          // Simulate PostgreSQL pg_advisory_xact_lock blocking subsequent transactions until prior transaction completes
          await acquireLock();
          return [{ pg_advisory_xact_lock: null }];
        }),
        dropPeriod: {
          findFirst: vi.fn().mockImplementation(async () => {
            // Post-lock check: returns period if another concurrent caller already committed it with full pool items
            if (sharedDbPeriod && provisionedPoolItems.length >= 5) {
              return {
                ...sharedDbPeriod,
                poolItems: provisionedPoolItems,
              };
            }
            return null;
          }),
          upsert: vi.fn().mockImplementation(async () => {
            dropPeriodUpsertCalls++;
            sharedDbPeriod = {
              id: "period-p2028-safe",
              periodIndex: 1,
              status: "ACTIVE",
              isStockConfigured: true,
              isStockLocked: true,
              poolItems: [],
            };
            return sharedDbPeriod;
          }),
        },
        dropPoolItem: {
          findMany: vi.fn().mockImplementation(async () => {
            return [...provisionedPoolItems];
          }),
          upsert: vi.fn().mockImplementation(async (args) => {
            const item = {
              id: `pool-item-${args.where.periodId_traitId.traitId}`,
              periodId: "period-p2028-safe",
              traitId: args.where.periodId_traitId.traitId,
              allocatedStock: args.create.allocatedStock,
              remainingStock: args.create.remainingStock,
              claimedStock: 0,
              weight: args.create.weight,
            };
            provisionedPoolItems.push(item);
            return item;
          }),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };

      const mockPrisma = {
        dropPeriod: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        trait: {
          findMany: vi.fn().mockResolvedValue(
            DEFAULT_TRAIT_TEMPLATES.map((t) => ({
              id: `trait-${t.slug}`,
              slug: t.slug,
              name: t.name,
              category: t.category,
              rarity: t.rarity,
              isActive: true,
            })),
          ),
        },
        $transaction: vi.fn().mockImplementation(async (cb) => {
          try {
            return await cb(txMock);
          } finally {
            // Transaction completion releases PostgreSQL transaction-level advisory lock
            releaseLock();
          }
        }),
      } as any;

      const now = new Date();
      const drop = {
        id: "drop-concurrent-test",
        startsAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      } as any;

      // Simulate 3 requests executing ensureActiveCyclePeriod simultaneously for the exact same drop
      const [res1, res2, res3] = await Promise.all([
        ensureActiveCyclePeriod(mockPrisma, drop, now),
        ensureActiveCyclePeriod(mockPrisma, drop, now),
        ensureActiveCyclePeriod(mockPrisma, drop, now),
      ]);

      // All 3 callers receive the exact same period instance
      expect(res1.id).toBe("period-p2028-safe");
      expect(res2.id).toBe("period-p2028-safe");
      expect(res3.id).toBe("period-p2028-safe");

      // Advisory lock was acquired for all 3 transaction runs with drop id via $queryRaw
      expect(queryRawCallCount).toBe(3);
      expect(capturedRawQuery.values).toContain("drop-concurrent-test");

      // Only the first transaction upserted the period!
      // The subsequent 2 transactions acquired the lock, found sharedDbPeriod via post-lock findFirst, and returned immediately
      expect(dropPeriodUpsertCalls).toBe(1);

      // Exactly 5 pool items were provisioned across all 3 concurrent requests (1 per trait)
      expect(txMock.dropPoolItem.upsert).toHaveBeenCalledTimes(5);
      expect(res1.poolItems).toHaveLength(5);
      expect(res2.poolItems).toHaveLength(5);
      expect(res3.poolItems).toHaveLength(5);
    });

    it("fails closed when advisory lock acquisition fails ($queryRaw throws)", async () => {
      const txMock = {
        $queryRaw: vi.fn().mockRejectedValue(new Error("canceling statement due to lock timeout")),
        dropPeriod: {
          findFirst: vi.fn(),
          upsert: vi.fn(),
        },
        dropPoolItem: {
          findMany: vi.fn(),
          upsert: vi.fn(),
          deleteMany: vi.fn(),
        },
      };

      const mockPrisma = {
        dropPeriod: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        trait: {
          findMany: vi.fn().mockResolvedValue(
            DEFAULT_TRAIT_TEMPLATES.map((t) => ({
              id: `trait-${t.slug}`,
              slug: t.slug,
              name: t.name,
              category: t.category,
              rarity: t.rarity,
              isActive: true,
            })),
          ),
        },
        $transaction: vi.fn().mockImplementation(async (cb) => {
          return await cb(txMock);
        }),
      } as any;

      const now = new Date();
      const drop = {
        id: "drop-lock-fail-test",
        startsAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      } as any;

      await expect(ensureActiveCyclePeriod(mockPrisma, drop, now)).rejects.toThrow(
        "canceling statement due to lock timeout",
      );

      // Advisory lock was attempted via $queryRaw
      expect(txMock.$queryRaw).toHaveBeenCalledTimes(1);

      // Fail-closed verification: No database mutations occurred because lock failed
      expect(txMock.dropPeriod.findFirst).not.toHaveBeenCalled();
      expect(txMock.dropPeriod.upsert).not.toHaveBeenCalled();
      expect(txMock.dropPoolItem.upsert).not.toHaveBeenCalled();
    });

    it("fails closed when $queryRaw is unavailable on transaction client", async () => {
      const txMockWithoutRaw = {
        dropPeriod: {
          findFirst: vi.fn(),
          upsert: vi.fn(),
        },
        dropPoolItem: {
          findMany: vi.fn(),
          upsert: vi.fn(),
          deleteMany: vi.fn(),
        },
      };

      const mockPrisma = {
        dropPeriod: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        trait: {
          findMany: vi.fn().mockResolvedValue(
            DEFAULT_TRAIT_TEMPLATES.map((t) => ({
              id: `trait-${t.slug}`,
              slug: t.slug,
              name: t.name,
              category: t.category,
              rarity: t.rarity,
              isActive: true,
            })),
          ),
        },
        $transaction: vi.fn().mockImplementation(async (cb) => {
          return await cb(txMockWithoutRaw);
        }),
      } as any;

      const now = new Date();
      const drop = {
        id: "drop-no-raw-test",
        startsAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      } as any;

      await expect(ensureActiveCyclePeriod(mockPrisma, drop, now)).rejects.toThrow(
        "PostgreSQL advisory lock is unavailable",
      );

      // Verify no mutations or queries were attempted after advisory lock check failed
      expect(txMockWithoutRaw.dropPeriod.findFirst).not.toHaveBeenCalled();
      expect(txMockWithoutRaw.dropPeriod.upsert).not.toHaveBeenCalled();
      expect(txMockWithoutRaw.dropPoolItem.upsert).not.toHaveBeenCalled();
    });

    it("ensures transaction failure propagates cleanly and leaves no partial state", async () => {
      const txMock = {
        $queryRaw: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
        dropPeriod: {
          findFirst: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockRejectedValue(new Error("P2028: Transaction timeout simulated")),
        },
        dropPoolItem: {
          findMany: vi.fn().mockResolvedValue([]),
          upsert: vi.fn(),
          deleteMany: vi.fn(),
        },
      };

      const mockPrisma = {
        dropPeriod: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        trait: {
          findMany: vi.fn().mockResolvedValue(
            DEFAULT_TRAIT_TEMPLATES.map((t) => ({
              id: `trait-${t.slug}`,
              slug: t.slug,
              name: t.name,
              category: t.category,
              rarity: t.rarity,
              isActive: true,
            })),
          ),
        },
        $transaction: vi.fn().mockImplementation(async (cb) => {
          return await cb(txMock);
        }),
      } as any;

      const now = new Date();
      const drop = {
        id: "drop-fail-test",
        startsAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      } as any;

      await expect(ensureActiveCyclePeriod(mockPrisma, drop, now)).rejects.toThrow(
        "P2028: Transaction timeout simulated",
      );

      // Because dropPeriod failed, dropPoolItem.upsert was never reached
      expect(txMock.dropPoolItem.upsert).not.toHaveBeenCalled();
    });

    it("preserves consumed remainingStock and claimedStock on existing items when replenishing missing traits", async () => {
      // 2 traits exist: 1 has been claimed 10 times, 1 has low stock
      const existingPoolItems = [
        {
          id: "existing-pi-1",
          periodId: "period-with-existing-stock",
          traitId: "trait-cyber-jungle-bg",
          allocatedStock: 85,
          remainingStock: 75, // Consumed: 10 claimed
          claimedStock: 10,
          weight: 85,
        },
        {
          id: "existing-pi-2",
          periodId: "period-with-existing-stock",
          traitId: "trait-stealth-hoodie",
          allocatedStock: 65,
          remainingStock: 5, // Consumed: 60 claimed
          claimedStock: 60,
          weight: 65,
        },
      ];

      const txMock = {
        $queryRaw: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
        dropPeriod: {
          findFirst: vi.fn().mockResolvedValue({
            id: "period-with-existing-stock",
            periodIndex: 1,
            status: "ACTIVE",
            isStockConfigured: true,
            isStockLocked: true,
            poolItems: existingPoolItems,
          }),
          update: vi.fn().mockResolvedValue({
            id: "period-with-existing-stock",
            periodIndex: 1,
            status: "ACTIVE",
          }),
        },
        dropPoolItem: {
          findMany: vi.fn().mockResolvedValue(existingPoolItems),
          upsert: vi.fn().mockImplementation(async (args) => ({
            id: `new-pi-${args.where.periodId_traitId.traitId}`,
            periodId: "period-with-existing-stock",
            traitId: args.where.periodId_traitId.traitId,
            allocatedStock: args.create.allocatedStock,
            remainingStock: args.create.remainingStock,
            claimedStock: 0,
            weight: args.create.weight,
          })),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };

      const mockPrisma = {
        dropPeriod: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        trait: {
          findMany: vi.fn().mockResolvedValue(
            DEFAULT_TRAIT_TEMPLATES.map((t) => ({
              id: `trait-${t.slug}`,
              slug: t.slug,
              name: t.name,
              category: t.category,
              rarity: t.rarity,
              isActive: true,
            })),
          ),
        },
        $transaction: vi.fn().mockImplementation(async (cb) => {
          return await cb(txMock);
        }),
      } as any;

      const now = new Date();
      const drop = {
        id: "drop-existing-stock-test",
        startsAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      } as any;

      const result = await ensureActiveCyclePeriod(mockPrisma, drop, now);

      // Verify exactly 3 missing items were upserted (traits 3, 4, 5)
      expect(txMock.dropPoolItem.upsert).toHaveBeenCalledTimes(3);

      // Verify existing items retain their consumed remainingStock and claimedStock!
      const item1 = result.poolItems.find((p) => p.traitId === "trait-cyber-jungle-bg");
      expect(item1?.remainingStock).toBe(75);
      expect(item1?.claimedStock).toBe(10);

      const item2 = result.poolItems.find((p) => p.traitId === "trait-stealth-hoodie");
      expect(item2?.remainingStock).toBe(5);
      expect(item2?.claimedStock).toBe(60);

      // All 5 items are in the final pool
      expect(result.poolItems).toHaveLength(5);
    });

    it("optimizes DropPoolItem provisioning using createMany when supported by client", async () => {
      let createManyCalledWith: any = null;
      const createdItemsFromDb = DEFAULT_TRAIT_TEMPLATES.map((t, i) => ({
        id: `created-pi-${i}`,
        periodId: "period-batch-create",
        traitId: `trait-${t.slug}`,
        allocatedStock: t.stock,
        remainingStock: t.stock,
        claimedStock: 0,
        weight: t.weight,
        trait: t,
      }));

      const txMock = {
        $queryRaw: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
        dropPeriod: {
          findFirst: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue({
            id: "period-batch-create",
            periodIndex: 1,
            status: "ACTIVE",
          }),
        },
        dropPoolItem: {
          findMany: vi.fn().mockImplementation(async () => {
            // First call finds empty pool, second call (after createMany) returns batch created items
            return createManyCalledWith ? createdItemsFromDb : [];
          }),
          createMany: vi.fn().mockImplementation(async (args) => {
            createManyCalledWith = args;
            return { count: args.data.length };
          }),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };

      const mockPrisma = {
        dropPeriod: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        trait: {
          findMany: vi.fn().mockResolvedValue(
            DEFAULT_TRAIT_TEMPLATES.map((t) => ({
              id: `trait-${t.slug}`,
              slug: t.slug,
              name: t.name,
              category: t.category,
              rarity: t.rarity,
              isActive: true,
            })),
          ),
        },
        $transaction: vi.fn().mockImplementation(async (cb) => {
          return await cb(txMock);
        }),
      } as any;

      const now = new Date();
      const drop = {
        id: "drop-batch-test",
        startsAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      } as any;

      const result = await ensureActiveCyclePeriod(mockPrisma, drop, now);

      expect(txMock.dropPoolItem.createMany).toHaveBeenCalledTimes(1);
      expect(createManyCalledWith.data).toHaveLength(5);
      expect(createManyCalledWith.skipDuplicates).toBe(true);
      expect(result.poolItems).toHaveLength(5);
    });
  });
});
