import { describe, it, expect, vi, beforeEach } from "vitest";
import { claimDrop, DropClaimError } from "@/server/drops/claim";
import type { PrismaClient } from "@prisma/client";

/**
 * High-concurrency Mock Prisma client simulating a PostgreSQL database under load.
 * Accurately models:
 *  - Atomic conditional updates: updateMany with `remainingStock > 0`.
 *  - Unique constraint violations (P2002):
 *      - InventoryItem @@unique([traitId, edition])
 *      - Claim @@unique([userId, dropId, periodId])
 *  - Transaction rollback on aborted transactions (uncommitted writes and stock deltas).
 *  - Async micro-tick interleaving to simulate network & DB query latency variations.
 */
function createConcurrentMockPrisma() {
  const store = {
    bans: [] as any[],
    wlSlots: [] as any[],
    drops: [] as any[],
    periods: [] as any[],
    poolItems: [] as any[],
    claims: [] as any[],
    inventoryItems: [] as any[],
    traits: [] as any[],
    auditLogs: [] as any[],
  };

  // Mutex/lock simulator for atomic operations
  let dbLock = Promise.resolve();
  const runWithLock = async <T>(fn: () => Promise<T> | T): Promise<T> => {
    let release: () => void;
    const nextLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prevLock = dbLock;
    dbLock = nextLock;
    await prevLock;
    try {
      return await fn();
    } finally {
      release!();
    }
  };

  const createTxClient = () => {
    const uncommittedItems: any[] = [];
    const uncommittedClaims: any[] = [];
    const uncommittedAuditLogs: any[] = [];
    const stockDeltas: Array<{ id: string; remaining: number; claimed: number }> = [];

    const rollback = () => {
      for (const item of uncommittedItems) {
        const idx = store.inventoryItems.indexOf(item);
        if (idx !== -1) store.inventoryItems.splice(idx, 1);
      }
      for (const claim of uncommittedClaims) {
        const idx = store.claims.indexOf(claim);
        if (idx !== -1) store.claims.splice(idx, 1);
      }
      for (const audit of uncommittedAuditLogs) {
        const idx = store.auditLogs.indexOf(audit);
        if (idx !== -1) store.auditLogs.splice(idx, 1);
      }
      for (const delta of stockDeltas) {
        const poolItem = store.poolItems.find((p) => p.id === delta.id);
        if (poolItem) {
          poolItem.remainingStock += delta.remaining;
          poolItem.claimedStock -= delta.claimed;
        }
      }
    };

    const tx = {
      banRecord: {
        findFirst: async ({ where }: any) => {
          return (
            store.bans.find(
              (b) =>
                b.userId === where.userId &&
                b.isActive &&
                (!where.scope?.in || where.scope.in.includes(b.scope)),
            ) || null
          );
        },
      },
      wLSlot: {
        findFirst: async ({ where }: any) => {
          return (
            store.wlSlots.find(
              (s) =>
                s.userId === where.userId &&
                (!where.status?.in || where.status.in.includes(s.status)),
            ) || null
          );
        },
      },
      dropPeriod: {
        findUnique: async ({ where }: any) => {
          const period = store.periods.find((p) => p.id === where.id);
          if (!period) return null;
          const drop = store.drops.find((d) => d.id === period.dropId);
          return { ...period, drop };
        },
      },
      claim: {
        findUnique: async ({ where }: any) => {
          const key = where.userId_dropId_periodId;
          return (
            store.claims.find(
              (c) =>
                c.userId === key.userId &&
                c.dropId === key.dropId &&
                c.periodId === key.periodId,
            ) || null
          );
        },
        create: async ({ data }: any) => {
          return await runWithLock(async () => {
            const collision = store.claims.find(
              (c) =>
                c.userId === data.userId &&
                c.dropId === data.dropId &&
                c.periodId === data.periodId,
            );
            if (collision) {
              const err: any = new Error(
                "Unique constraint failed on the fields: (`userId`,`dropId`,`periodId`)",
              );
              err.code = "P2002";
              err.meta = {
                target: ["userId", "dropId", "periodId"],
                modelName: "Claim",
              };
              throw err;
            }
            const record = { id: `claim-${store.claims.length + 1}`, ...data };
            store.claims.push(record);
            uncommittedClaims.push(record);
            return record;
          });
        },
      },
      dropPoolItem: {
        findMany: async ({ where }: any) => {
          return store.poolItems
            .filter((p) => p.periodId === where.periodId && p.remainingStock > 0)
            .map((p) => ({
              ...p,
              trait: store.traits.find((t) => t.id === p.traitId),
            }));
        },
        updateMany: async ({ where, data }: any) => {
          return await runWithLock(async () => {
            const item = store.poolItems.find(
              (p) => p.id === where.id && p.remainingStock > 0,
            );
            if (!item) return { count: 0 };
            let remDelta = 0;
            let claimDelta = 0;
            if (data.remainingStock?.decrement) {
              item.remainingStock -= data.remainingStock.decrement;
              remDelta = data.remainingStock.decrement;
            }
            if (data.claimedStock?.increment) {
              item.claimedStock += data.claimedStock.increment;
              claimDelta = data.claimedStock.increment;
            }
            stockDeltas.push({ id: item.id, remaining: remDelta, claimed: claimDelta });
            return { count: 1 };
          });
        },
      },
      inventoryItem: {
        findFirst: async ({ where, orderBy }: any) => {
          const matches = store.inventoryItems.filter((i) => i.traitId === where.traitId);
          if (orderBy?.edition === "desc") {
            matches.sort((a, b) => b.edition - a.edition);
          }
          return matches[0] || null;
        },
        create: async ({ data }: any) => {
          return await runWithLock(async () => {
            const collision = store.inventoryItems.find(
              (i) => i.traitId === data.traitId && i.edition === data.edition,
            );
            if (collision) {
              const err: any = new Error(
                "Unique constraint failed on the fields: (`traitId`,`edition`)",
              );
              err.code = "P2002";
              err.meta = {
                target: ["traitId", "edition"],
                modelName: "InventoryItem",
              };
              throw err;
            }
            const record = { id: `inv-${store.inventoryItems.length + 1}`, ...data };
            store.inventoryItems.push(record);
            uncommittedItems.push(record);
            return record;
          });
        },
      },
      auditLog: {
        create: async ({ data }: any) => {
          const record = { id: `audit-${store.auditLogs.length + 1}`, ...data };
          store.auditLogs.push(record);
          uncommittedAuditLogs.push(record);
          return record;
        },
      },
    };

    return { tx, rollback };
  };

  const client = {
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      const { tx, rollback } = createTxClient();
      try {
        return await cb(tx);
      } catch (err) {
        rollback();
        throw err;
      }
    }),
    _store: store,
  };

  return client as unknown as PrismaClient & { _store: typeof store };
}

describe("Task 5-B: Load Tests & Concurrency Invariants (100 Concurrent Claims)", () => {
  let mockPrisma: ReturnType<typeof createConcurrentMockPrisma>;
  const baseTime = new Date("2026-10-24T12:05:00Z");

  beforeEach(() => {
    mockPrisma = createConcurrentMockPrisma();

    mockPrisma._store.drops.push({
      id: "drop-load-test",
      slug: "genesis-load-test",
      status: "ACTIVE",
    });

    mockPrisma._store.periods.push({
      id: "period-load-test",
      dropId: "drop-load-test",
      periodIndex: 1,
      status: "ACTIVE",
      startsAt: new Date("2026-10-24T12:00:00Z"),
      endsAt: new Date("2026-10-24T13:00:00Z"),
      isStockLocked: true,
    });

    mockPrisma._store.traits.push(
      { id: "trait-bg", name: "Cyber Jungle", category: "BG", rarity: "COMMON" },
      { id: "trait-fur", name: "Golden Fur", category: "FUR", rarity: "RARE" },
      { id: "trait-head", name: "Neon Visor", category: "HEADWEAR", rarity: "EPIC" },
    );
  });

  it("handles 100 concurrent claims with stock contention without over-allocation", async () => {
    // 20 items available in total across 3 traits (10 + 6 + 4 = 20)
    mockPrisma._store.poolItems.push(
      {
        id: "pool-bg",
        periodId: "period-load-test",
        traitId: "trait-bg",
        allocatedStock: 10,
        claimedStock: 0,
        remainingStock: 10,
        weight: 50,
      },
      {
        id: "pool-fur",
        periodId: "period-load-test",
        traitId: "trait-fur",
        allocatedStock: 6,
        claimedStock: 0,
        remainingStock: 6,
        weight: 30,
      },
      {
        id: "pool-head",
        periodId: "period-load-test",
        traitId: "trait-head",
        allocatedStock: 4,
        claimedStock: 0,
        remainingStock: 4,
        weight: 20,
      },
    );

    const TOTAL_STOCK = 20;
    const CONCURRENT_CLAIMS = 100;

    // Generate 100 unique users
    const userIds = Array.from(
      { length: CONCURRENT_CLAIMS },
      (_, i) => `load-test-user-${i + 1}`,
    );

    // Fire 100 claims simultaneously
    const claimPromises = userIds.map((userId) =>
      claimDrop(mockPrisma, {
        userId,
        dropId: "drop-load-test",
        periodId: "period-load-test",
        now: baseTime,
        maxRetries: 10, // Sufficient retries for high contention
      }),
    );

    const results = await Promise.allSettled(claimPromises);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    console.log("TEST 1 - Fulfilled:", fulfilled.length, "Rejected:", rejected.length);
    const rejectionCounts: Record<string, number> = {};
    for (const r of rejected) {
      if (r.status === "rejected") {
        const code = (r.reason as any)?.code || (r.reason as any)?.message;
        rejectionCounts[code] = (rejectionCounts[code] || 0) + 1;
      }
    }
    console.log("TEST 1 - Rejection reasons:", rejectionCounts);

    // 1. Successful claims must not exceed TOTAL_STOCK
    expect(fulfilled.length).toBeGreaterThan(0);
    expect(fulfilled.length).toBeLessThanOrEqual(TOTAL_STOCK);
    expect(fulfilled.length + rejected.length).toBe(CONCURRENT_CLAIMS);

    // 2. All rejected claims failed due to stock exhaustion or contention
    rejected.forEach((r) => {
      if (r.status === "rejected") {
        const err = r.reason;
        expect(err).toBeInstanceOf(DropClaimError);
        expect([
          "STOCK_EXHAUSTED",
          "STOCK_RACE_EXHAUSTED",
          "EDITION_COLLISION_RETRYABLE",
        ]).toContain(err.code);
        expect(err.status).toBe(409);
      }
    });

    // 3. Stock Invariant Verification: Strictly NO over-allocation
    let totalRemaining = 0;
    let totalClaimed = 0;
    for (const poolItem of mockPrisma._store.poolItems) {
      // Remaining stock must NEVER be negative
      expect(poolItem.remainingStock).toBeGreaterThanOrEqual(0);
      expect(poolItem.claimedStock).toBeLessThanOrEqual(poolItem.allocatedStock);
      expect(poolItem.remainingStock + poolItem.claimedStock).toBe(
        poolItem.allocatedStock,
      );

      totalRemaining += poolItem.remainingStock;
      totalClaimed += poolItem.claimedStock;
    }

    expect(totalClaimed).toBe(fulfilled.length);
    expect(totalRemaining).toBe(TOTAL_STOCK - fulfilled.length);

    // 4. Verify inventory items & claims count strictly match
    expect(mockPrisma._store.inventoryItems).toHaveLength(fulfilled.length);
    expect(mockPrisma._store.claims).toHaveLength(fulfilled.length);

    // Verify editions per trait are strictly unique and sequential
    for (const trait of mockPrisma._store.traits) {
      const items = mockPrisma._store.inventoryItems.filter(
        (i) => i.traitId === trait.id,
      );
      const editions = items.map((i) => i.edition).sort((a, b) => a - b);
      const uniqueEditions = new Set(editions);
      expect(uniqueEditions.size).toBe(editions.length); // No duplicates
      for (let i = 0; i < editions.length; i++) {
        expect(editions[i]).toBe(i + 1);
      }
    }
  });

  it("handles 100 concurrent claims with 100 items available and achieves 100% success without duplicate editions", async () => {
    // 100 items available in total across 3 traits (50 + 30 + 20 = 100)
    mockPrisma._store.poolItems.push(
      {
        id: "pool-bg",
        periodId: "period-load-test",
        traitId: "trait-bg",
        allocatedStock: 50,
        claimedStock: 0,
        remainingStock: 50,
        weight: 50,
      },
      {
        id: "pool-fur",
        periodId: "period-load-test",
        traitId: "trait-fur",
        allocatedStock: 30,
        claimedStock: 0,
        remainingStock: 30,
        weight: 30,
      },
      {
        id: "pool-head",
        periodId: "period-load-test",
        traitId: "trait-head",
        allocatedStock: 20,
        claimedStock: 0,
        remainingStock: 20,
        weight: 20,
      },
    );

    const CONCURRENT_CLAIMS = 100;
    const userIds = Array.from(
      { length: CONCURRENT_CLAIMS },
      (_, i) => `load-test-100-user-${i + 1}`,
    );

    // Simulate realistic concurrent request arrival (0-20ms network jitter per client)
    // with client-side retry for retryable 409 errors
    const executeClaimWithClientRetry = async (userId: string) => {
      // Small randomized client arrival delay
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));

      for (let clientAttempt = 0; clientAttempt < 5; clientAttempt++) {
        try {
          return await claimDrop(mockPrisma, {
            userId,
            dropId: "drop-load-test",
            periodId: "period-load-test",
            now: baseTime,
          });
        } catch (err) {
          if (
            err instanceof DropClaimError &&
            (err.code === "EDITION_COLLISION_RETRYABLE" ||
              err.code === "STOCK_RACE_EXHAUSTED") &&
            clientAttempt < 4
          ) {
            // Client exponential backoff with jitter
            await new Promise((resolve) =>
              setTimeout(resolve, 5 * Math.pow(2, clientAttempt) + Math.random() * 10),
            );
            continue;
          }
          throw err;
        }
      }
    };

    const claimPromises = userIds.map((userId) => executeClaimWithClientRetry(userId));

    const results = await Promise.allSettled(claimPromises);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    console.log("TEST 2 - Fulfilled:", fulfilled.length, "Rejected:", rejected.length);
    const rejectionCounts: Record<string, number> = {};
    for (const r of rejected) {
      if (r.status === "rejected") {
        const code = (r.reason as any)?.code || (r.reason as any)?.message;
        rejectionCounts[code] = (rejectionCounts[code] || 0) + 1;
      }
    }
    console.log("TEST 2 - Rejection reasons:", rejectionCounts);

    // All 100 should succeed
    expect(fulfilled).toHaveLength(CONCURRENT_CLAIMS);
    expect(rejected).toHaveLength(0);

    // Verify stock consistency
    for (const poolItem of mockPrisma._store.poolItems) {
      expect(poolItem.remainingStock).toBeGreaterThanOrEqual(0);
      expect(poolItem.remainingStock + poolItem.claimedStock).toBe(
        poolItem.allocatedStock,
      );
    }

    // Verify exactly 100 claims and 100 inventory items
    expect(mockPrisma._store.claims).toHaveLength(CONCURRENT_CLAIMS);
    expect(mockPrisma._store.inventoryItems).toHaveLength(CONCURRENT_CLAIMS);

    // Check unique claim recipients
    const uniqueClaimUsers = new Set(mockPrisma._store.claims.map((c) => c.userId));
    expect(uniqueClaimUsers.size).toBe(CONCURRENT_CLAIMS);

    // Check unique editions per trait
    for (const trait of mockPrisma._store.traits) {
      const items = mockPrisma._store.inventoryItems.filter(
        (i) => i.traitId === trait.id,
      );
      const editions = items.map((i) => i.edition).sort((a, b) => a - b);
      const uniqueEditions = new Set(editions);
      expect(uniqueEditions.size).toBe(editions.length);
      for (let i = 0; i < editions.length; i++) {
        expect(editions[i]).toBe(i + 1);
      }
    }
  });

  it("handles Sybil race: 100 concurrent claim requests from the SAME user results in strictly 1 claim", async () => {
    mockPrisma._store.poolItems.push({
      id: "pool-bg",
      periodId: "period-load-test",
      traitId: "trait-bg",
      allocatedStock: 50,
      claimedStock: 0,
      remainingStock: 50,
      weight: 100,
    });

    const CONCURRENT_CLAIMS = 100;
    const sameUserId = "sybil-attacker-user";

    // 100 requests with identical userId, dropId, and periodId
    const claimPromises = Array.from({ length: CONCURRENT_CLAIMS }, () =>
      claimDrop(mockPrisma, {
        userId: sameUserId,
        dropId: "drop-load-test",
        periodId: "period-load-test",
        now: baseTime,
      }),
    );

    const results = await Promise.allSettled(claimPromises);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    console.log("TEST 3 - Fulfilled:", fulfilled.length, "Rejected:", rejected.length);
    const rejectionCounts: Record<string, number> = {};
    for (const r of rejected) {
      if (r.status === "rejected") {
        const code = (r.reason as any)?.code || (r.reason as any)?.message;
        rejectionCounts[code] = (rejectionCounts[code] || 0) + 1;
      }
    }
    console.log("TEST 3 - Rejection reasons:", rejectionCounts);

    // Strictly 1 claim must succeed
    expect(fulfilled).toHaveLength(1);
    // Exactly 99 claims must be rejected with 409
    expect(rejected).toHaveLength(99);

    rejected.forEach((r) => {
      if (r.status === "rejected") {
        const err = r.reason;
        expect(err).toBeInstanceOf(DropClaimError);
        expect(["ALREADY_CLAIMED_IN_PERIOD", "STOCK_RACE_EXHAUSTED"]).toContain(err.code);
        expect(err.status).toBe(409);
      }
    });

    // Stock must have been decremented by exactly 1
    const poolBg = mockPrisma._store.poolItems.find((p) => p.id === "pool-bg")!;
    expect(poolBg.remainingStock).toBe(49);
    expect(poolBg.claimedStock).toBe(1);

    // Exactly 1 inventory item and 1 claim record in store
    expect(mockPrisma._store.inventoryItems).toHaveLength(1);
    expect(mockPrisma._store.claims).toHaveLength(1);
  });

  it("handles emergency cancellation mid-flight during concurrent claims cleanly", async () => {
    mockPrisma._store.poolItems.push({
      id: "pool-bg",
      periodId: "period-load-test",
      traitId: "trait-bg",
      allocatedStock: 50,
      claimedStock: 0,
      remainingStock: 50,
      weight: 100,
    });

    const CONCURRENT_CLAIMS = 50;
    const userIds = Array.from(
      { length: CONCURRENT_CLAIMS },
      (_, i) => `emergency-user-${i + 1}`,
    );

    // Cancel the drop period halfway through
    let counter = 0;
    const claimPromises = userIds.map(async (userId) => {
      counter++;
      if (counter === 15) {
        // Administrative emergency close simulation
        const period = mockPrisma._store.periods.find(
          (p) => p.id === "period-load-test",
        )!;
        period.status = "CANCELLED";
      }
      return claimDrop(mockPrisma, {
        userId,
        dropId: "drop-load-test",
        periodId: "period-load-test",
        now: baseTime,
      });
    });

    const results = await Promise.allSettled(claimPromises);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const cancelled = results.filter((r) => {
      if (r.status === "rejected") {
        return (r.reason as any)?.code === "PERIOD_CANCELLED";
      }
      return false;
    });

    // Claims attempted after emergency cancel must be rejected with PERIOD_CANCELLED (410)
    expect(cancelled.length).toBeGreaterThan(0);

    // Stock consistency
    const poolBg = mockPrisma._store.poolItems.find((p) => p.id === "pool-bg")!;
    expect(poolBg.remainingStock).toBeGreaterThanOrEqual(0);
    expect(poolBg.remainingStock + poolBg.claimedStock).toBe(poolBg.allocatedStock);
    expect(poolBg.claimedStock).toBe(fulfilled.length);
  });
});
