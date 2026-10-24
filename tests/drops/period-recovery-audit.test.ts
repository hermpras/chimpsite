import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  configurePeriodStock,
  activateDropPeriod,
  AdminDropError,
} from "@/server/admin/drops";
import { claimDrop, DropClaimError } from "@/server/drops/claim";
import { GET as getCurrentDrop } from "@/app/api/drops/current/route";

describe("B-1 Audit: DropPeriod Recovery, Stock Timings & Claim Invariants", () => {
  let mockPrisma: any;

  const cycleStartsAt = new Date("2026-10-25T04:00:00.000Z");
  const cycleEndsAt = new Date("2026-10-25T06:00:00.000Z");
  const cycleConfigLockAt = new Date("2026-10-25T03:45:00.000Z"); // 15 mins before startsAt

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma = {
      drop: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      dropPeriod: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      dropPoolItem: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      trait: {
        findMany: vi.fn(),
      },
      banRecord: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      wLSlot: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      claim: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
      inventoryItem: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "item-new-1",
          edition: 1,
          trait: { name: "Jungle", category: "BG" },
        }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-audit-1" }),
      },
      $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
    };
  });

  describe("Condition 1: Admin fixes configuration before 15-minute deadline and period activates", () => {
    it("allows admin to configure stock 25 minutes before startsAt, then activate at start time and allow claims", async () => {
      // 1. Initially unconfigured period
      const recoveryTime = new Date("2026-10-25T03:35:00.000Z"); // 25 mins before startsAt (allowed)

      mockPrisma.dropPeriod.findUnique.mockResolvedValue({
        id: "period-recovery",
        dropId: "drop-1",
        periodIndex: 1,
        startsAt: cycleStartsAt,
        endsAt: cycleEndsAt,
        configLockAt: cycleConfigLockAt,
        status: "PENDING_CONFIG",
        isStockConfigured: false,
        isStockLocked: false,
      });

      mockPrisma.trait.findMany.mockResolvedValue([
        { id: "trait-bg", isActive: true },
        { id: "trait-fur", isActive: true },
      ]);

      mockPrisma.dropPeriod.update.mockResolvedValue({
        id: "period-recovery",
        isStockConfigured: true,
        status: "CONFIGURED",
        poolItems: [
          { traitId: "trait-bg", allocatedStock: 20, remainingStock: 20, weight: 100 },
          { traitId: "trait-fur", allocatedStock: 20, remainingStock: 20, weight: 100 },
        ],
      });

      // 2. Admin configures stock successfully
      const configResult = await configurePeriodStock(mockPrisma, {
        dropId: "drop-1",
        periodId: "period-recovery",
        items: [
          { traitId: "trait-bg", stock: 20 },
          { traitId: "trait-fur", stock: 20 },
        ],
        adminUserId: "admin-1",
        now: recoveryTime,
      });

      expect(configResult.period.status).toBe("CONFIGURED");
      expect(configResult.period.isStockConfigured).toBe(true);

      // 3. When start time arrives (04:05 UTC), period can now be activated
      const activationTime = new Date("2026-10-25T04:05:00.000Z");

      mockPrisma.dropPeriod.findUnique.mockResolvedValue({
        id: "period-recovery",
        dropId: "drop-1",
        periodIndex: 1,
        startsAt: cycleStartsAt,
        endsAt: cycleEndsAt,
        status: "CONFIGURED",
        isStockConfigured: true,
        drop: { id: "drop-1", status: "SCHEDULED" },
        poolItems: [
          {
            id: "pi-1",
            traitId: "trait-bg",
            allocatedStock: 20,
            remainingStock: 20,
            weight: 100,
          },
          {
            id: "pi-2",
            traitId: "trait-fur",
            allocatedStock: 20,
            remainingStock: 20,
            weight: 100,
          },
        ],
      });

      mockPrisma.dropPeriod.update.mockResolvedValue({
        id: "period-recovery",
        status: "ACTIVE",
        isStockLocked: true,
      });

      const activateResult = await activateDropPeriod(mockPrisma, {
        dropId: "drop-1",
        periodId: "period-recovery",
        adminUserId: "admin-1",
        now: activationTime,
      });

      expect(activateResult.period.status).toBe("ACTIVE");
      expect(mockPrisma.dropPeriod.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "period-recovery" },
          data: expect.objectContaining({
            status: "ACTIVE",
            isStockLocked: true,
          }),
        }),
      );

      // 4. Now user claims item during active window
      mockPrisma.dropPeriod.findUnique.mockResolvedValue({
        id: "period-recovery",
        dropId: "drop-1",
        periodIndex: 1,
        startsAt: cycleStartsAt,
        endsAt: cycleEndsAt,
        status: "ACTIVE",
        isStockLocked: true,
        drop: { id: "drop-1", status: "ACTIVE" },
      });

      mockPrisma.dropPoolItem.findMany.mockResolvedValue([
        {
          id: "pi-1",
          traitId: "trait-bg",
          allocatedStock: 20,
          remainingStock: 20,
          weight: 100,
          trait: { name: "Jungle", category: "BG", rarity: "COMMON" },
        },
      ]);
      mockPrisma.dropPoolItem.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.claim.create.mockResolvedValue({ id: "claim-rec-1" });

      const claimResult = await claimDrop(mockPrisma, {
        userId: "user-1",
        dropId: "drop-1",
        periodId: "period-recovery",
        now: activationTime,
      });

      expect(claimResult.claim).toBeDefined();
      expect(claimResult.trait.name).toBe("Jungle");
    });
  });

  describe("Condition 2: Deadline passed (within 15-min freeze or after start) -> strictly unopenable", () => {
    it("rejects stock configuration when within 15-minute freeze window (e.g. 10 mins before start)", async () => {
      // 10 minutes before start -> within 15-minute freeze window
      const freezeTime = new Date("2026-10-25T03:50:00.000Z");

      mockPrisma.dropPeriod.findUnique.mockResolvedValue({
        id: "period-missed",
        dropId: "drop-1",
        startsAt: cycleStartsAt,
        endsAt: cycleEndsAt,
        configLockAt: cycleConfigLockAt,
        status: "PENDING_CONFIG",
        isStockConfigured: false,
        isStockLocked: false,
      });

      await expect(
        configurePeriodStock(mockPrisma, {
          dropId: "drop-1",
          periodId: "period-missed",
          items: [{ traitId: "trait-bg", stock: 10 }],
          adminUserId: "admin-1",
          now: freezeTime,
        }),
      ).rejects.toMatchObject({
        code: "STOCK_CONFIG_LOCKED",
        status: 409,
      });
    });

    it("rejects stock configuration after period start time", async () => {
      // 5 minutes after period start time
      const afterStartTime = new Date("2026-10-25T04:05:00.000Z");

      mockPrisma.dropPeriod.findUnique.mockResolvedValue({
        id: "period-missed",
        dropId: "drop-1",
        startsAt: cycleStartsAt,
        endsAt: cycleEndsAt,
        configLockAt: cycleConfigLockAt,
        status: "PENDING_CONFIG",
        isStockConfigured: false,
        isStockLocked: false,
      });

      await expect(
        configurePeriodStock(mockPrisma, {
          dropId: "drop-1",
          periodId: "period-missed",
          items: [{ traitId: "trait-bg", stock: 10 }],
          adminUserId: "admin-1",
          now: afterStartTime,
        }),
      ).rejects.toMatchObject({
        code: "STOCK_PERIOD_STARTED",
        status: 409,
      });
    });

    it("strictly prevents opening/activating period when stock was not configured by deadline", async () => {
      const startArriveTime = new Date("2026-10-25T04:01:00.000Z");

      mockPrisma.dropPeriod.findUnique.mockResolvedValue({
        id: "period-unopened",
        dropId: "drop-1",
        periodIndex: 1,
        startsAt: cycleStartsAt,
        endsAt: cycleEndsAt,
        status: "PENDING_CONFIG",
        isStockConfigured: false,
        drop: { id: "drop-1", status: "SCHEDULED" },
        poolItems: [], // Stock missing!
      });

      // Admin activation attempt fails closed
      await expect(
        activateDropPeriod(mockPrisma, {
          dropId: "drop-1",
          periodId: "period-unopened",
          adminUserId: "admin-1",
          now: startArriveTime,
        }),
      ).rejects.toMatchObject({
        code: "PERIOD_STOCK_INVALID",
        status: 400,
      });

      // Period status remains PENDING_CONFIG and is never updated to ACTIVE
      expect(mockPrisma.dropPeriod.update).not.toHaveBeenCalled();
    });
  });

  describe("Condition 3: Period never claimable when stock is missing, unopened, or invalid", () => {
    it("rejects claims when period remains in PENDING_CONFIG (unopened)", async () => {
      const now = new Date("2026-10-25T04:15:00.000Z"); // inside claim window time

      mockPrisma.dropPeriod.findUnique.mockResolvedValue({
        id: "period-unopened",
        dropId: "drop-1",
        periodIndex: 1,
        startsAt: cycleStartsAt,
        endsAt: cycleEndsAt,
        status: "PENDING_CONFIG", // Period never opened!
        isStockConfigured: false,
        isStockLocked: false,
        drop: { id: "drop-1", status: "ACTIVE" },
      });

      await expect(
        claimDrop(mockPrisma, {
          userId: "user-attacker",
          dropId: "drop-1",
          periodId: "period-unopened",
          now,
        }),
      ).rejects.toMatchObject({
        code: "PERIOD_CANCELLED",
        status: 410,
      });

      // No claim or inventory item created
      expect(mockPrisma.claim.create).not.toHaveBeenCalled();
      expect(mockPrisma.inventoryItem.create).not.toHaveBeenCalled();
    });

    it("rejects claims when period is CONFIGURED but never opened to ACTIVE", async () => {
      const now = new Date("2026-10-25T04:15:00.000Z");

      mockPrisma.dropPeriod.findUnique.mockResolvedValue({
        id: "period-configured-not-active",
        dropId: "drop-1",
        periodIndex: 1,
        startsAt: cycleStartsAt,
        endsAt: cycleEndsAt,
        status: "CONFIGURED", // Not ACTIVE!
        isStockConfigured: true,
        isStockLocked: false,
        drop: { id: "drop-1", status: "ACTIVE" },
      });

      await expect(
        claimDrop(mockPrisma, {
          userId: "user-1",
          dropId: "drop-1",
          periodId: "period-configured-not-active",
          now,
        }),
      ).rejects.toMatchObject({
        code: "PERIOD_CANCELLED",
        status: 410,
      });
    });

    it("rejects claims when period is ACTIVE but has 0 remaining stock", async () => {
      const now = new Date("2026-10-25T04:15:00.000Z");

      mockPrisma.dropPeriod.findUnique.mockResolvedValue({
        id: "period-empty-stock",
        dropId: "drop-1",
        periodIndex: 1,
        startsAt: cycleStartsAt,
        endsAt: cycleEndsAt,
        status: "ACTIVE",
        isStockConfigured: true,
        isStockLocked: true,
        drop: { id: "drop-1", status: "ACTIVE" },
      });

      // No pool items with remainingStock > 0
      mockPrisma.dropPoolItem.findMany.mockResolvedValue([]);

      await expect(
        claimDrop(mockPrisma, {
          userId: "user-1",
          dropId: "drop-1",
          periodId: "period-empty-stock",
          now,
        }),
      ).rejects.toMatchObject({
        code: "STOCK_EXHAUSTED",
        status: 409,
      });
    });
  });
});
