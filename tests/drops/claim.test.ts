import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  claimDrop,
  calculateTransparentProbabilities,
  selectWinningPoolItem,
  DropClaimError,
} from "@/server/drops/claim";
import type { PrismaClient } from "@prisma/client";

function createMockPrisma() {
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
    abuseFlags: [] as any[],
  };

  const hooks = {
    onInventoryItemCreate: null as ((data: any) => Promise<void> | void) | null,
    onClaimCreate: null as ((data: any) => Promise<void> | void) | null,
    onAuditCreate: null as ((data: any) => Promise<void> | void) | null,
  };

  const createTxClient = () => {
    const uncommittedItems: any[] = [];
    const uncommittedClaims: any[] = [];
    const uncommittedAuditLogs: any[] = [];
    const uncommittedAbuseFlags: any[] = [];
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
      for (const flag of uncommittedAbuseFlags) {
        const idx = store.abuseFlags.indexOf(flag);
        if (idx !== -1) store.abuseFlags.splice(idx, 1);
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
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.bans.find(
              (b) =>
                b.userId === where.userId &&
                b.isActive &&
                (!where.scope?.in || where.scope.in.includes(b.scope)),
            ) || null
          );
        }),
      },
      wLSlot: {
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.wlSlots.find(
              (s) =>
                s.userId === where.userId &&
                (!where.status?.in || where.status.in.includes(s.status)),
            ) || null
          );
        }),
      },
      dropPeriod: {
        findUnique: vi.fn(async ({ where }: any) => {
          const period = store.periods.find((p) => p.id === where.id);
          if (!period) return null;
          const drop = store.drops.find((d) => d.id === period.dropId);
          return { ...period, drop };
        }),
      },
      claim: {
        findUnique: vi.fn(async ({ where }: any) => {
          const key = where.userId_dropId_periodId;
          return (
            store.claims.find(
              (c) =>
                c.userId === key.userId &&
                c.dropId === key.dropId &&
                c.periodId === key.periodId,
            ) || null
          );
        }),
        findMany: vi.fn(async ({ where }: any) => {
          return store.claims.filter((c) => {
            if (where.periodId && c.periodId !== where.periodId) return false;
            if (where.ipAddress && c.ipAddress !== where.ipAddress) return false;
            if (where.status && c.status !== where.status) return false;
            return true;
          });
        }),
        create: vi.fn(async ({ data }: any) => {
          if (hooks.onClaimCreate) {
            await hooks.onClaimCreate(data);
          }
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
        }),
      },
      abuseFlag: {
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.abuseFlags.find((f) => {
              if (where.userId && f.userId !== where.userId) return false;
              if (where.flagType && f.flagType !== where.flagType) return false;
              if (where.status && f.status !== where.status) return false;
              return true;
            }) || null
          );
        }),
        findMany: vi.fn(async ({ where }: any) => {
          return store.abuseFlags.filter((f) => {
            if (where.userId && f.userId !== where.userId) return false;
            if (where.flagType && f.flagType !== where.flagType) return false;
            if (where.status && f.status !== where.status) return false;
            return true;
          });
        }),
        create: vi.fn(async ({ data }: any) => {
          const record = {
            id: `abuse-flag-${store.abuseFlags.length + 1}`,
            createdAt: new Date(),
            ...data,
          };
          store.abuseFlags.push(record);
          uncommittedAbuseFlags.push(record);
          return record;
        }),
      },
      dropPoolItem: {
        findMany: vi.fn(async ({ where }: any) => {
          return store.poolItems
            .filter((p) => p.periodId === where.periodId && p.remainingStock > 0)
            .map((p) => ({
              ...p,
              trait: store.traits.find((t) => t.id === p.traitId),
            }));
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
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
        }),
      },
      inventoryItem: {
        findFirst: vi.fn(async ({ where, orderBy }: any) => {
          const matches = store.inventoryItems.filter((i) => i.traitId === where.traitId);
          if (orderBy?.edition === "desc") {
            matches.sort((a, b) => b.edition - a.edition);
          }
          return matches[0] || null;
        }),
        create: vi.fn(async ({ data }: any) => {
          if (hooks.onInventoryItemCreate) {
            await hooks.onInventoryItemCreate(data);
          }
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
          const trait = store.traits.find((t) => t.id === data.traitId);
          const record = { id: `inv-${store.inventoryItems.length + 1}`, ...data, trait };
          store.inventoryItems.push(record);
          uncommittedItems.push(record);
          return record;
        }),
      },
      auditLog: {
        create: vi.fn(async ({ data }: any) => {
          if (hooks.onAuditCreate) {
            await hooks.onAuditCreate(data);
          }
          const r = { id: `audit-${store.auditLogs.length + 1}`, ...data };
          store.auditLogs.push(r);
          uncommittedAuditLogs.push(r);
          return r;
        }),
      },
    };

    return { tx, rollback };
  };

  const defaultTx = createTxClient().tx;

  const prisma = {
    $transaction: vi.fn(async (cb: (txClient: any) => any) => {
      const { tx, rollback } = createTxClient();
      try {
        return await cb(tx);
      } catch (err) {
        rollback();
        throw err;
      }
    }),
    ...defaultTx,
  } as unknown as PrismaClient & { _store: typeof store; _tx: any; _hooks: typeof hooks };

  (prisma as any)._store = store;
  (prisma as any)._tx = defaultTx;
  (prisma as any)._hooks = hooks;
  return prisma as unknown as PrismaClient & {
    _store: typeof store;
    _tx: any;
    _hooks: typeof hooks;
  };
}

describe("Drop Claim Engine", () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  const baseTime = new Date("2026-10-16T02:10:00.000Z");

  beforeEach(() => {
    mockPrisma = createMockPrisma();

    mockPrisma._store.drops.push({
      id: "drop-1",
      slug: "drop-alpha",
      title: "ChimpHood Genesis Drop",
      status: "ACTIVE",
      startsAt: new Date("2026-10-16T00:00:00.000Z"),
      endsAt: new Date("2026-10-16T12:00:00.000Z"),
    });

    mockPrisma._store.periods.push({
      id: "period-1",
      dropId: "drop-1",
      periodIndex: 1,
      startsAt: new Date("2026-10-16T02:00:00.000Z"),
      endsAt: new Date("2026-10-16T04:00:00.000Z"),
      configLockAt: new Date("2026-10-16T01:45:00.000Z"),
      isStockConfigured: true,
      isStockLocked: true,
      status: "ACTIVE",
    });

    mockPrisma._store.traits.push(
      { id: "trait-bg", name: "Jungle Mist", category: "BG", rarity: "COMMON" },
      { id: "trait-fur", name: "Golden Fur", category: "FUR", rarity: "RARE" },
    );

    mockPrisma._store.poolItems.push(
      {
        id: "pool-1",
        periodId: "period-1",
        traitId: "trait-bg",
        allocatedStock: 10,
        claimedStock: 0,
        remainingStock: 10,
        weight: 100,
      },
      {
        id: "pool-2",
        periodId: "period-1",
        traitId: "trait-fur",
        allocatedStock: 2,
        claimedStock: 0,
        remainingStock: 2,
        weight: 20,
      },
    );
  });

  it("calculates transparent probabilities based on remaining stock and weights", () => {
    const items = [
      {
        id: "p1",
        traitId: "t1",
        remainingStock: 5,
        weight: 100,
        trait: { name: "A", category: "BG", rarity: "COMMON" },
      },
      {
        id: "p2",
        traitId: "t2",
        remainingStock: 0,
        weight: 100,
        trait: { name: "B", category: "FUR", rarity: "RARE" },
      },
      {
        id: "p3",
        traitId: "t3",
        remainingStock: 2,
        weight: 100,
        trait: { name: "C", category: "EYEWEAR", rarity: "EPIC" },
      },
    ];

    const probs = calculateTransparentProbabilities(items);
    expect(probs).toHaveLength(2); // Exhausted item excluded
    expect(probs[0].probabilityPercent).toBe(50);
    expect(probs[1].probabilityPercent).toBe(50);
  });

  it("successfully claims a trait, decrements stock atomically, and mints sequential edition", async () => {
    const result = await claimDrop(mockPrisma, {
      userId: "user-1",
      dropId: "drop-1",
      periodId: "period-1",
      now: baseTime,
      randomSeed: () => 0.1, // Selects first trait
    });

    expect(result.claim.status).toBe("SUCCESS");
    expect(result.inventoryItem.edition).toBe(1);
    expect(result.inventoryItem.traitId).toBe("trait-bg");

    // Pool item stock decremented
    const poolBg = mockPrisma._store.poolItems.find((p) => p.id === "pool-1");
    expect(poolBg?.remainingStock).toBe(9);
    expect(poolBg?.claimedStock).toBe(1);

    // Second claim for next user mints edition #2
    const result2 = await claimDrop(mockPrisma, {
      userId: "user-2",
      dropId: "drop-1",
      periodId: "period-1",
      now: baseTime,
      randomSeed: () => 0.1,
    });
    expect(result2.inventoryItem.edition).toBe(2);
  });

  it("enforces 1 claim per user per drop per period strictly", async () => {
    await claimDrop(mockPrisma, {
      userId: "user-1",
      dropId: "drop-1",
      periodId: "period-1",
      now: baseTime,
    });

    await expect(
      claimDrop(mockPrisma, {
        userId: "user-1",
        dropId: "drop-1",
        periodId: "period-1",
        now: baseTime,
      }),
    ).rejects.toThrow("You have already claimed an item in this drop period.");
  });

  it("strictly prohibits drop claims for users holding an active WL slot", async () => {
    mockPrisma._store.wlSlots.push({
      id: "slot-1",
      userId: "user-wl-holder",
      status: "ALLOCATED",
      slotNumber: 1,
    });

    await expect(
      claimDrop(mockPrisma, {
        userId: "user-wl-holder",
        dropId: "drop-1",
        periodId: "period-1",
        now: baseTime,
      }),
    ).rejects.toThrow("Users holding an allocated Whitelist slot cannot claim drops.");
  });

  it("rejects claim when period stock is completely exhausted", async () => {
    for (const item of mockPrisma._store.poolItems) {
      item.remainingStock = 0;
    }

    await expect(
      claimDrop(mockPrisma, {
        userId: "user-1",
        dropId: "drop-1",
        periodId: "period-1",
        now: baseTime,
      }),
    ).rejects.toThrow("All stock for this drop period is currently exhausted.");
  });

  it("rejects claims outside the 30-minute claim window", async () => {
    const outsideWindow = new Date("2026-10-16T02:35:00.000Z"); // 35 min after start

    await expect(
      claimDrop(mockPrisma, {
        userId: "user-1",
        dropId: "drop-1",
        periodId: "period-1",
        now: outsideWindow,
      }),
    ).rejects.toThrow(
      "The 30-minute claim window for this period is not currently active.",
    );
  });

  it("rejects in-flight claims when administrator emergency-cancels period", async () => {
    mockPrisma._store.periods[0].status = "CANCELLED";

    await expect(
      claimDrop(mockPrisma, {
        userId: "user-1",
        dropId: "drop-1",
        periodId: "period-1",
        now: baseTime,
      }),
    ).rejects.toThrow(
      "The drop period is closed or has been cancelled by an administrator.",
    );
  });

  it("rejects claims when drop status is DRAFT or SCHEDULED", async () => {
    // Drop in DRAFT status
    mockPrisma._store.drops[0].status = "DRAFT";

    await expect(
      claimDrop(mockPrisma, {
        userId: "user-1",
        dropId: "drop-1",
        periodId: "period-1",
        now: baseTime,
      }),
    ).rejects.toThrow("Drop is not active (current status: DRAFT).");

    // Drop in SCHEDULED status
    mockPrisma._store.drops[0].status = "SCHEDULED";

    await expect(
      claimDrop(mockPrisma, {
        userId: "user-1",
        dropId: "drop-1",
        periodId: "period-1",
        now: baseTime,
      }),
    ).rejects.toThrow("Drop is not active (current status: SCHEDULED).");

    // Restore to ACTIVE
    mockPrisma._store.drops[0].status = "ACTIVE";
  });

  it("rejects claims if user has an active ban record", async () => {
    mockPrisma._store.bans.push({
      userId: "banned-user",
      isActive: true,
      scope: "CLAIM_RESTRICTED",
    });

    await expect(
      claimDrop(mockPrisma, {
        userId: "banned-user",
        dropId: "drop-1",
        periodId: "period-1",
        now: baseTime,
      }),
    ).rejects.toThrow("Your account is restricted from claiming drops.");
  });

  describe("P2002 Edition Collision & Concurrency Handling", () => {
    it("handles P2002 edition collision by retrying safely and allocating next edition without double-decrementing stock", async () => {
      // Trait pool starts with 10 stock
      const poolBg = mockPrisma._store.poolItems.find((p) => p.id === "pool-1")!;
      expect(poolBg.remainingStock).toBe(10);
      expect(poolBg.claimedStock).toBe(0);

      // Simulate a concurrent collision on Attempt 0:
      // When Attempt 0 tries to create edition 1, simulate that a concurrent transaction
      // just committed edition 1 right before this create call.
      let attemptCount = 0;
      mockPrisma._hooks.onInventoryItemCreate = async (data: any) => {
        attemptCount++;
        if (attemptCount === 1) {
          // Concurrent transaction secretly committed edition 1
          mockPrisma._store.inventoryItems.push({
            id: "inv-concurrent",
            traitId: data.traitId,
            ownerId: "other-user",
            edition: 1,
            acquiredVia: "CLAIM",
          });
          // Attempt 0 hits P2002 unique constraint violation
          const err: any = new Error(
            "Unique constraint failed on the fields: (`traitId`,`edition`)",
          );
          err.code = "P2002";
          err.meta = { target: ["traitId", "edition"], modelName: "InventoryItem" };
          throw err;
        }
      };

      const result = await claimDrop(mockPrisma, {
        userId: "user-1",
        dropId: "drop-1",
        periodId: "period-1",
        now: baseTime,
        randomSeed: () => 0.1, // Selects trait-bg
      });

      // Verify Attempt 1 succeeded with edition 2
      expect(result.inventoryItem.edition).toBe(2);
      expect(result.claim.status).toBe("SUCCESS");

      // Verify stock was NOT double-decremented: Attempt 0 rolled back its decrement,
      // Attempt 1 decremented stock exactly once for user-1.
      expect(poolBg.remainingStock).toBe(9);
      expect(poolBg.claimedStock).toBe(1);

      // Verify user-1 has exactly 1 claim
      const userClaims = mockPrisma._store.claims.filter((c) => c.userId === "user-1");
      expect(userClaims).toHaveLength(1);
    });

    it("exhausts bounded retries on repeated P2002 collisions and returns deliberate retryable error without partial state", async () => {
      const poolBg = mockPrisma._store.poolItems.find((p) => p.id === "pool-1")!;
      expect(poolBg.remainingStock).toBe(10);
      expect(poolBg.claimedStock).toBe(0);

      // Force inventory item creation to always throw P2002
      mockPrisma._hooks.onInventoryItemCreate = async () => {
        const err: any = new Error(
          "Unique constraint failed on the fields: (`traitId`,`edition`)",
        );
        err.code = "P2002";
        err.meta = { target: ["traitId", "edition"], modelName: "InventoryItem" };
        throw err;
      };

      // Attempt claim with maxRetries = 2 (total 3 attempts)
      await expect(
        claimDrop(mockPrisma, {
          userId: "user-exhaust",
          dropId: "drop-1",
          periodId: "period-1",
          now: baseTime,
          maxRetries: 2,
        }),
      ).rejects.toMatchObject({
        name: "DropClaimError",
        code: "EDITION_COLLISION_RETRYABLE",
        status: 409,
      });

      // Verify that after transaction rollback, stock was NOT decremented
      expect(poolBg.remainingStock).toBe(10);
      expect(poolBg.claimedStock).toBe(0);

      // Verify no partial inventory items or claims were left
      expect(mockPrisma._store.inventoryItems).toHaveLength(0);
      expect(mockPrisma._store.claims).toHaveLength(0);
    });

    it("does not retry when P2002 is on Claim uniqueness and maps to ALREADY_CLAIMED_IN_PERIOD", async () => {
      // Simulate race where initial findUnique missed, but claim.create hits P2002 on userId_dropId_periodId
      mockPrisma._hooks.onClaimCreate = async () => {
        const err: any = new Error(
          "Unique constraint failed on the fields: (`userId`,`dropId`,`periodId`)",
        );
        err.code = "P2002";
        err.meta = {
          target: ["userId", "dropId", "periodId"],
          modelName: "Claim",
        };
        throw err;
      };

      await expect(
        claimDrop(mockPrisma, {
          userId: "user-dup",
          dropId: "drop-1",
          periodId: "period-1",
          now: baseTime,
        }),
      ).rejects.toMatchObject({
        name: "DropClaimError",
        code: "ALREADY_CLAIMED_IN_PERIOD",
        status: 409,
      });

      // Stock is untouched
      const poolBg = mockPrisma._store.poolItems.find((p) => p.id === "pool-1")!;
      expect(poolBg.remainingStock).toBe(10);
    });

    it("concurrent claims allocate distinct sequential editions and preserve stock consistency", async () => {
      const poolBg = mockPrisma._store.poolItems.find((p) => p.id === "pool-1")!;

      const [claim1, claim2] = await Promise.all([
        claimDrop(mockPrisma, {
          userId: "user-concurrent-1",
          dropId: "drop-1",
          periodId: "period-1",
          now: baseTime,
          randomSeed: () => 0.1, // Both choose trait-bg
        }),
        claimDrop(mockPrisma, {
          userId: "user-concurrent-2",
          dropId: "drop-1",
          periodId: "period-1",
          now: baseTime,
          randomSeed: () => 0.1,
        }),
      ]);

      expect(claim1.claim.status).toBe("SUCCESS");
      expect(claim2.claim.status).toBe("SUCCESS");

      // Editions must be distinct and sequential: [1, 2]
      const editions = [
        claim1.inventoryItem.edition,
        claim2.inventoryItem.edition,
      ].sort();
      expect(editions).toEqual([1, 2]);

      // Stock was decremented exactly twice
      expect(poolBg.remainingStock).toBe(8);
      expect(poolBg.claimedStock).toBe(2);

      expect(mockPrisma._store.claims).toHaveLength(2);
      expect(mockPrisma._store.inventoryItems).toHaveLength(2);
    });

    it("records DROP_CLAIM_MINTED in AuditLog", async () => {
      const res = await claimDrop(mockPrisma, {
        userId: "user-audit-1",
        dropId: "drop-1",
        periodId: "period-1",
        now: baseTime,
        ipAddress: "192.168.1.1",
        userAgent: "ChimpBrowser/1.0",
      });

      const auditRecord = mockPrisma._store.auditLogs.find(
        (log: any) => log.action === "DROP_CLAIM_MINTED" && log.entityId === res.claim.id,
      );
      expect(auditRecord).toBeDefined();
      expect(auditRecord.actorId).toBe("user-audit-1");
      expect(auditRecord.actorIp).toBe("192.168.1.1");
      expect(auditRecord.userAgent).toBe("ChimpBrowser/1.0");
      expect(auditRecord.entityType).toBe("Claim");
      expect(auditRecord.newValues.dropId).toBe("drop-1");
      expect(auditRecord.newValues.periodId).toBe("period-1");
    });

    it("rolls back claim, stock, and inventory item if audit log creation fails", async () => {
      const poolBg = mockPrisma._store.poolItems.find((p: any) => p.id === "pool-1")!;
      const initialRemaining = poolBg.remainingStock;
      const initialClaimed = poolBg.claimedStock;

      mockPrisma._hooks.onAuditCreate = () => {
        throw new Error("Audit log database failure");
      };

      await expect(
        claimDrop(mockPrisma, {
          userId: "user-audit-fail",
          dropId: "drop-1",
          periodId: "period-1",
          now: baseTime,
        }),
      ).rejects.toThrow("Audit log database failure");

      expect(
        mockPrisma._store.claims.find((c: any) => c.userId === "user-audit-fail"),
      ).toBeUndefined();
      expect(
        mockPrisma._store.inventoryItems.find(
          (i: any) => i.ownerId === "user-audit-fail",
        ),
      ).toBeUndefined();
      expect(poolBg.remainingStock).toBe(initialRemaining);
      expect(poolBg.claimedStock).toBe(initialClaimed);
      expect(
        mockPrisma._store.auditLogs.find((l: any) => l.actorId === "user-audit-fail"),
      ).toBeUndefined();

      mockPrisma._hooks.onAuditCreate = null;
    });
  });

  describe("DEC-012: Sybil Cluster IP Abuse Detection", () => {
    const testIp = "198.51.100.42";

    it("does not trigger AbuseFlag when distinct wallets from same IP is below threshold (< 5)", async () => {
      // 4 distinct users claim from the same IP in period-1
      for (let i = 1; i <= 4; i++) {
        const result = await claimDrop(mockPrisma, {
          userId: `sybil-user-${i}`,
          dropId: "drop-1",
          periodId: "period-1",
          ipAddress: testIp,
          now: baseTime,
        });
        expect(result.claim.id).toBeDefined();
      }

      // Below threshold of 5: No AbuseFlag created
      expect(mockPrisma._store.abuseFlags).toHaveLength(0);
      expect(mockPrisma._store.bans).toHaveLength(0);
    });

    it("triggers AbuseFlag for the sybil cluster when distinct wallets from same IP reaches threshold (>= 5)", async () => {
      // 5 distinct users claim from the same IP in period-1
      for (let i = 1; i <= 5; i++) {
        const result = await claimDrop(mockPrisma, {
          userId: `sybil-user-${i}`,
          dropId: "drop-1",
          periodId: "period-1",
          ipAddress: testIp,
          now: baseTime,
        });
        expect(result.claim.id).toBeDefined();
      }

      // Threshold reached (5): AbuseFlag created for each wallet in cluster
      expect(mockPrisma._store.abuseFlags).toHaveLength(5);

      for (let i = 1; i <= 5; i++) {
        const flag = mockPrisma._store.abuseFlags.find(
          (f: any) => f.userId === `sybil-user-${i}`,
        );
        expect(flag).toBeDefined();
        expect(flag.flagType).toBe("SYBIL_WALLET_CLUSTER");
        expect(flag.severity).toBe("HIGH");
        expect(flag.status).toBe("OPEN");
        expect(flag.details.ipAddress).toBe(testIp);
        expect(flag.details.periodId).toBe("period-1");
        expect(flag.details.clusterSize).toBe(5);
        expect(flag.details.clusterUserIds).toEqual(
          expect.arrayContaining([
            "sybil-user-1",
            "sybil-user-2",
            "sybil-user-3",
            "sybil-user-4",
            "sybil-user-5",
          ]),
        );
      }

      // AuditLog recorded for abuse flags
      const auditLogs = mockPrisma._store.auditLogs.filter(
        (l: any) => l.action === "ABUSE_FLAG_CREATED",
      );
      expect(auditLogs).toHaveLength(5);
    });

    it("strictly does NOT auto-ban any user based on shared IP alone (DEC-012)", async () => {
      for (let i = 1; i <= 5; i++) {
        await claimDrop(mockPrisma, {
          userId: `sybil-user-${i}`,
          dropId: "drop-1",
          periodId: "period-1",
          ipAddress: testIp,
          now: baseTime,
        });
      }

      // No BanRecords should be created
      expect(mockPrisma._store.bans).toHaveLength(0);

      // All 5 claims and items are successfully awarded
      expect(mockPrisma._store.claims).toHaveLength(5);
      expect(mockPrisma._store.inventoryItems).toHaveLength(5);
    });

    it("does not count duplicate claims by the same wallet toward threshold", async () => {
      // 4 distinct users claim
      for (let i = 1; i <= 4; i++) {
        await claimDrop(mockPrisma, {
          userId: `sybil-user-${i}`,
          dropId: "drop-1",
          periodId: "period-1",
          ipAddress: testIp,
          now: baseTime,
        });
      }

      // sybil-user-1 tries to claim again in the same period
      await expect(
        claimDrop(mockPrisma, {
          userId: "sybil-user-1",
          dropId: "drop-1",
          periodId: "period-1",
          ipAddress: testIp,
          now: baseTime,
        }),
      ).rejects.toThrowError(DropClaimError);

      // Distinct wallets remains 4 -> No flags
      expect(mockPrisma._store.abuseFlags).toHaveLength(0);
    });

    it("strictly bounds calculation to single drop cycle (periodId) without cross-cycle accumulation", async () => {
      // Setup a second period in the same drop
      mockPrisma._store.periods.push({
        id: "period-2",
        dropId: "drop-1",
        periodIndex: 2,
        startsAt: new Date("2026-10-16T02:00:00.000Z"),
        endsAt: new Date("2026-10-16T04:00:00.000Z"),
        configLockAt: new Date("2026-10-16T01:45:00.000Z"),
        isStockConfigured: true,
        isStockLocked: true,
        status: "ACTIVE",
      });
      mockPrisma._store.poolItems.push({
        id: "pool-p2",
        periodId: "period-2",
        traitId: "trait-bg",
        allocatedStock: 10,
        claimedStock: 0,
        remainingStock: 10,
        weight: 100,
      });

      // 3 distinct users claim in period-1 from testIp
      for (let i = 1; i <= 3; i++) {
        await claimDrop(mockPrisma, {
          userId: `user-p1-${i}`,
          dropId: "drop-1",
          periodId: "period-1",
          ipAddress: testIp,
          now: baseTime,
        });
      }

      // 2 distinct users claim in period-2 from testIp
      for (let i = 1; i <= 2; i++) {
        await claimDrop(mockPrisma, {
          userId: `user-p2-${i}`,
          dropId: "drop-1",
          periodId: "period-2",
          ipAddress: testIp,
          now: baseTime,
        });
      }

      // Total across cycles is 5, but per-cycle is 3 and 2 (< 5 each)
      // Calculation MUST NOT accumulate across cycles!
      expect(mockPrisma._store.abuseFlags).toHaveLength(0);
    });

    it("does not trigger AbuseFlag when 5 claims originate from distinct IPs", async () => {
      // 5 distinct users, each with a different IP
      for (let i = 1; i <= 5; i++) {
        await claimDrop(mockPrisma, {
          userId: `distinct-ip-user-${i}`,
          dropId: "drop-1",
          periodId: "period-1",
          ipAddress: `198.51.100.${i}`,
          now: baseTime,
        });
      }

      // Each IP has only 1 wallet -> No flags
      expect(mockPrisma._store.abuseFlags).toHaveLength(0);
    });

    it("flags an incoming 6th wallet in the same cluster without creating duplicate flags for earlier wallets", async () => {
      // First 5 users trigger the cluster
      for (let i = 1; i <= 5; i++) {
        await claimDrop(mockPrisma, {
          userId: `sybil-user-${i}`,
          dropId: "drop-1",
          periodId: "period-1",
          ipAddress: testIp,
          now: baseTime,
        });
      }
      expect(mockPrisma._store.abuseFlags).toHaveLength(5);

      // 6th user claims from the same IP
      await claimDrop(mockPrisma, {
        userId: "sybil-user-6",
        dropId: "drop-1",
        periodId: "period-1",
        ipAddress: testIp,
        now: baseTime,
      });

      // Total flags should be 6 (no duplicate flag created for sybil-user-1..5)
      expect(mockPrisma._store.abuseFlags).toHaveLength(6);

      const user6Flag = mockPrisma._store.abuseFlags.find(
        (f: any) => f.userId === "sybil-user-6",
      );
      expect(user6Flag).toBeDefined();
      expect(user6Flag.details.clusterSize).toBe(6);
    });

    it("ignores claims with unknown, whitespace-only, or missing IP addresses", async () => {
      // 5 claims with unknown IP
      for (let i = 1; i <= 5; i++) {
        await claimDrop(mockPrisma, {
          userId: `unknown-ip-user-${i}`,
          dropId: "drop-1",
          periodId: "period-1",
          ipAddress: "unknown",
          now: baseTime,
        });
      }

      // 5 claims with undefined IP
      for (let i = 1; i <= 5; i++) {
        await claimDrop(mockPrisma, {
          userId: `no-ip-user-${i}`,
          dropId: "drop-1",
          periodId: "period-1",
          now: baseTime,
        });
      }

      expect(mockPrisma._store.abuseFlags).toHaveLength(0);
    });
  });
});
