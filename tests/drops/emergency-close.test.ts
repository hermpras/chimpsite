import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  emergencyCloseDropPeriod,
  emergencyCloseDropWindow,
} from "@/server/drops/emergency-close";
import { claimDrop, DropClaimError } from "@/server/drops/claim";
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
    const periodStateSnapshots: Array<{ id: string; status: string }> = [];
    const claimStatusSnapshots: Array<{ id: string; status: string }> = [];
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
      for (const snap of periodStateSnapshots) {
        const p = store.periods.find((item) => item.id === snap.id);
        if (p) p.status = snap.status;
      }
      for (const snap of claimStatusSnapshots) {
        const c = store.claims.find((item) => item.id === snap.id);
        if (c) c.status = snap.status;
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
        updateMany: vi.fn(async ({ where, data }: any) => {
          let updatedCount = 0;
          for (const period of store.periods) {
            const matchesId = where.id === undefined || period.id === where.id;
            const matchesStatus =
              where.status === undefined || period.status === where.status;
            if (matchesId && matchesStatus) {
              periodStateSnapshots.push({ id: period.id, status: period.status });
              if (data.status) {
                period.status = data.status;
              }
              updatedCount++;
            }
          }
          return { count: updatedCount };
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
        create: vi.fn(async ({ data }: any) => {
          if (hooks.onClaimCreate) {
            await hooks.onClaimCreate(data);
          }
          const record = { id: `claim-${store.claims.length + 1}`, ...data };
          store.claims.push(record);
          uncommittedClaims.push(record);
          return record;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const c of store.claims) {
            const matchesPeriod =
              where.periodId === undefined || c.periodId === where.periodId;
            const matchesStatus =
              where.status === undefined || c.status === where.status;
            if (matchesPeriod && matchesStatus) {
              claimStatusSnapshots.push({ id: c.id, status: c.status });
              if (data.status) {
                c.status = data.status;
              }
              count++;
            }
          }
          return { count };
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

describe("Emergency Close for Active Drop Windows (Task 1-C)", () => {
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

    mockPrisma._store.periods.push(
      {
        id: "period-1",
        dropId: "drop-1",
        periodIndex: 1,
        startsAt: new Date("2026-10-16T02:00:00.000Z"),
        endsAt: new Date("2026-10-16T04:00:00.000Z"),
        configLockAt: new Date("2026-10-16T01:45:00.000Z"),
        isStockConfigured: true,
        isStockLocked: true,
        status: "ACTIVE",
      },
      {
        id: "period-2",
        dropId: "drop-1",
        periodIndex: 2,
        startsAt: new Date("2026-10-16T04:00:00.000Z"),
        endsAt: new Date("2026-10-16T06:00:00.000Z"),
        configLockAt: new Date("2026-10-16T03:45:00.000Z"),
        isStockConfigured: true,
        isStockLocked: false,
        status: "CONFIGURED",
      },
    );

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

  it("successfully emergency-closes an active drop window and writes audit log", async () => {
    const result = await emergencyCloseDropPeriod(mockPrisma, {
      dropId: "drop-1",
      periodId: "period-1",
      adminUserId: "admin-1",
      reason: "Suspected exploit in drop window",
      now: baseTime,
      ipAddress: "10.0.0.1",
      userAgent: "AdminOps/1.0",
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("CANCELLED");
    expect(result.periodId).toBe("period-1");
    expect(result.dropId).toBe("drop-1");
    expect(result.reason).toBe("Suspected exploit in drop window");
    expect(result.closedAt).toEqual(baseTime);

    // Verify DropPeriod status was updated to CANCELLED in database
    const periodInStore = mockPrisma._store.periods.find((p) => p.id === "period-1");
    expect(periodInStore?.status).toBe("CANCELLED");

    // Verify audit log record
    const auditRecord = mockPrisma._store.auditLogs.find(
      (log) => log.action === "DROP_PERIOD_EMERGENCY_CLOSED",
    );
    expect(auditRecord).toBeDefined();
    expect(auditRecord.actorId).toBe("admin-1");
    expect(auditRecord.actorIp).toBe("10.0.0.1");
    expect(auditRecord.userAgent).toBe("AdminOps/1.0");
    expect(auditRecord.entityType).toBe("DropPeriod");
    expect(auditRecord.entityId).toBe("period-1");
    expect(auditRecord.oldValues).toEqual({ status: "ACTIVE" });
    expect(auditRecord.newValues).toEqual({ status: "CANCELLED" });
    expect(auditRecord.metadata.reason).toBe("Suspected exploit in drop window");
    expect(auditRecord.metadata.closedAt).toBe(baseTime.toISOString());
  });

  it("handles optional reason cleanly when reason is omitted", async () => {
    const result = await emergencyCloseDropPeriod(mockPrisma, {
      dropId: "drop-1",
      periodId: "period-1",
      adminUserId: "admin-2",
      now: baseTime,
    });

    expect(result.success).toBe(true);
    expect(result.reason).toBeNull();

    const auditRecord = mockPrisma._store.auditLogs.find(
      (log) => log.action === "DROP_PERIOD_EMERGENCY_CLOSED",
    );
    expect(auditRecord?.metadata.reason).toBeNull();
  });

  it("rejects all claims that are still pending when the window is closed", async () => {
    // Add pending claim
    mockPrisma._store.claims.push({
      id: "claim-pending-1",
      userId: "user-pending",
      dropId: "drop-1",
      periodId: "period-1",
      status: "PENDING",
      claimedAt: baseTime,
    });

    const result = await emergencyCloseDropPeriod(mockPrisma, {
      dropId: "drop-1",
      periodId: "period-1",
      adminUserId: "admin-1",
      now: baseTime,
    });

    expect(result.cancelledPendingClaimsCount).toBe(1);

    const pendingClaim = mockPrisma._store.claims.find((c) => c.id === "claim-pending-1");
    expect(pendingClaim?.status).toBe("CANCELLED");
  });

  it("preserves claims that completed successfully before the emergency close", async () => {
    // User 1 completes claim successfully before emergency close
    const claimRes = await claimDrop(mockPrisma, {
      userId: "user-1",
      dropId: "drop-1",
      periodId: "period-1",
      now: baseTime,
    });
    expect(claimRes.claim.status).toBe("SUCCESS");

    // Also simulate a pending claim in the database
    mockPrisma._store.claims.push({
      id: "claim-pending-2",
      userId: "user-2",
      dropId: "drop-1",
      periodId: "period-1",
      status: "PENDING",
      claimedAt: baseTime,
    });

    // Execute emergency close
    await emergencyCloseDropPeriod(mockPrisma, {
      dropId: "drop-1",
      periodId: "period-1",
      adminUserId: "admin-1",
      now: baseTime,
    });

    // Verify completed claim remains SUCCESS
    const completedClaim = mockPrisma._store.claims.find((c) => c.id === claimRes.claim.id);
    expect(completedClaim?.status).toBe("SUCCESS");

    // Verify completed inventory item remains intact
    const completedItem = mockPrisma._store.inventoryItems.find(
      (i) => i.id === claimRes.inventoryItem.id,
    );
    expect(completedItem).toBeDefined();
    expect(completedItem?.edition).toBe(1);

    // Verify pending claim was cancelled
    const pendingClaim = mockPrisma._store.claims.find((c) => c.id === "claim-pending-2");
    expect(pendingClaim?.status).toBe("CANCELLED");
  });

  it("handles repeated emergency-close requests safely and consistently (409 PERIOD_ALREADY_CLOSED)", async () => {
    // First emergency close
    await emergencyCloseDropPeriod(mockPrisma, {
      dropId: "drop-1",
      periodId: "period-1",
      adminUserId: "admin-1",
      now: baseTime,
    });

    // Second repeated emergency close
    await expect(
      emergencyCloseDropPeriod(mockPrisma, {
        dropId: "drop-1",
        periodId: "period-1",
        adminUserId: "admin-1",
        now: baseTime,
      }),
    ).rejects.toMatchObject({
      name: "DropClaimError",
      code: "PERIOD_ALREADY_CLOSED",
      status: 409,
    });

    // Ensure only 1 audit log was recorded
    const auditLogs = mockPrisma._store.auditLogs.filter(
      (log) => log.action === "DROP_PERIOD_EMERGENCY_CLOSED",
    );
    expect(auditLogs).toHaveLength(1);
  });

  it("rolls back all changes if audit log write fails", async () => {
    mockPrisma._store.claims.push({
      id: "claim-p1",
      userId: "user-p1",
      dropId: "drop-1",
      periodId: "period-1",
      status: "PENDING",
      claimedAt: baseTime,
    });

    // Make audit log write fail
    mockPrisma._hooks.onAuditCreate = async () => {
      throw new Error("Audit service unavailable");
    };

    await expect(
      emergencyCloseDropPeriod(mockPrisma, {
        dropId: "drop-1",
        periodId: "period-1",
        adminUserId: "admin-1",
        now: baseTime,
      }),
    ).rejects.toThrow("Audit service unavailable");

    // Ensure period status rolled back to ACTIVE
    const periodInStore = mockPrisma._store.periods.find((p) => p.id === "period-1");
    expect(periodInStore?.status).toBe("ACTIVE");

    // Ensure pending claim was NOT cancelled (rolled back to PENDING)
    const claimInStore = mockPrisma._store.claims.find((c) => c.id === "claim-p1");
    expect(claimInStore?.status).toBe("PENDING");
  });

  it("prevents race condition: rejects in-flight claim when emergency close commits concurrently", async () => {
    const poolBg = mockPrisma._store.poolItems.find((p) => p.id === "pool-1")!;
    expect(poolBg.remainingStock).toBe(10);

    // Simulate concurrent emergency close executing while claim is in flight (during inventory creation)
    mockPrisma._hooks.onInventoryItemCreate = async () => {
      // Emergency close commits concurrently
      mockPrisma._store.periods[0].status = "CANCELLED";
    };

    await expect(
      claimDrop(mockPrisma, {
        userId: "user-race",
        dropId: "drop-1",
        periodId: "period-1",
        now: baseTime,
      }),
    ).rejects.toMatchObject({
      name: "DropClaimError",
      code: "PERIOD_CANCELLED",
      status: 410,
    });

    // Verify claim transaction rolled back completely: stock untouched, no claim created
    expect(poolBg.remainingStock).toBe(10);
    expect(mockPrisma._store.claims).toHaveLength(0);
    expect(mockPrisma._store.inventoryItems).toHaveLength(0);
  });

  it("preserves future periods and stock allocations", async () => {
    await emergencyCloseDropPeriod(mockPrisma, {
      dropId: "drop-1",
      periodId: "period-1",
      adminUserId: "admin-1",
      now: baseTime,
    });

    // Future period remains CONFIGURED and untouched
    const futurePeriod = mockPrisma._store.periods.find((p) => p.id === "period-2");
    expect(futurePeriod?.status).toBe("CONFIGURED");
    expect(futurePeriod?.isStockLocked).toBe(false);

    // Pool stock allocations are preserved
    const poolBg = mockPrisma._store.poolItems.find((p) => p.id === "pool-1");
    expect(poolBg?.allocatedStock).toBe(10);
    expect(poolBg?.remainingStock).toBe(10);
  });

  it("rejects emergency close when period is not found", async () => {
    await expect(
      emergencyCloseDropPeriod(mockPrisma, {
        dropId: "drop-1",
        periodId: "non-existent-period",
        adminUserId: "admin-1",
      }),
    ).rejects.toMatchObject({
      name: "DropClaimError",
      code: "PERIOD_NOT_FOUND",
      status: 404,
    });
  });

  it("rejects emergency close when period is already ended", async () => {
    mockPrisma._store.periods[0].status = "ENDED";

    await expect(
      emergencyCloseDropPeriod(mockPrisma, {
        dropId: "drop-1",
        periodId: "period-1",
        adminUserId: "admin-1",
      }),
    ).rejects.toMatchObject({
      name: "DropClaimError",
      code: "PERIOD_ALREADY_ENDED",
      status: 409,
    });
  });

  it("rejects emergency close when period is in non-active status such as PENDING_CONFIG", async () => {
    mockPrisma._store.periods[0].status = "PENDING_CONFIG";

    await expect(
      emergencyCloseDropPeriod(mockPrisma, {
        dropId: "drop-1",
        periodId: "period-1",
        adminUserId: "admin-1",
      }),
    ).rejects.toMatchObject({
      name: "DropClaimError",
      code: "PERIOD_NOT_ACTIVE",
      status: 400,
    });
  });

  it("works seamlessly through emergencyCloseDropWindow alias", async () => {
    const result = await emergencyCloseDropWindow(mockPrisma, {
      periodId: "period-1",
      adminUserId: "admin-alias",
      now: baseTime,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("CANCELLED");
  });
});
