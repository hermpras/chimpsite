import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isAlignedToUtc2HourCycle,
  generate2HourCycleBoundaries,
  createAdminDrop,
  updateAdminDrop,
  createAdminDropPeriod,
  configurePeriodStock,
  activateDropPeriod,
  listAdminDrops,
  getAdminDrop,
  listAdminTraits,
  AdminDropError,
} from "@/server/admin/drops";

describe("Admin Drops Service - B-1 Drop Configuration Engine", () => {
  let mockPrisma: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma = {
      drop: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      dropPeriod: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
      dropPoolItem: {
        deleteMany: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
      },
      trait: {
        findMany: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-drop-test" }),
      },
      $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
    };
  });

  describe("1. 2-Hour UTC Cycle Validation & Boundaries", () => {
    it("validates precise alignment to 2-hour UTC cycles (00:00, 02:00, 04:00, etc.)", () => {
      // Valid boundaries
      expect(isAlignedToUtc2HourCycle(new Date("2026-10-25T00:00:00.000Z"))).toBe(true);
      expect(isAlignedToUtc2HourCycle(new Date("2026-10-25T02:00:00.000Z"))).toBe(true);
      expect(isAlignedToUtc2HourCycle(new Date("2026-10-25T14:00:00.000Z"))).toBe(true);
      expect(isAlignedToUtc2HourCycle(new Date("2026-10-25T22:00:00.000Z"))).toBe(true);

      // Invalid: odd hour
      expect(isAlignedToUtc2HourCycle(new Date("2026-10-25T01:00:00.000Z"))).toBe(false);
      expect(isAlignedToUtc2HourCycle(new Date("2026-10-25T03:00:00.000Z"))).toBe(false);

      // Invalid: non-zero minutes/seconds
      expect(isAlignedToUtc2HourCycle(new Date("2026-10-25T02:15:00.000Z"))).toBe(false);
      expect(isAlignedToUtc2HourCycle(new Date("2026-10-25T02:00:01.000Z"))).toBe(false);
      expect(isAlignedToUtc2HourCycle(new Date("2026-10-25T02:00:00.123Z"))).toBe(false);
    });

    it("generates correct 2.5-hour cycle periods with 15-minute config lock lead", () => {
      const startsAt = new Date("2026-10-25T00:00:00.000Z");
      const endsAt = new Date("2026-10-25T07:30:00.000Z"); // 3 cycles (7.5 hours = 3 * 2.5h)

      const periods = generate2HourCycleBoundaries(startsAt, endsAt);
      expect(periods).toHaveLength(3);

      // Period 1
      expect(periods[0].periodIndex).toBe(1);
      expect(periods[0].startsAt.toISOString()).toBe("2026-10-25T00:00:00.000Z");
      expect(periods[0].endsAt.toISOString()).toBe("2026-10-25T02:30:00.000Z");
      expect(periods[0].configLockAt.toISOString()).toBe("2026-10-24T23:45:00.000Z"); // 15m lead

      // Period 2
      expect(periods[1].periodIndex).toBe(2);
      expect(periods[1].startsAt.toISOString()).toBe("2026-10-25T02:30:00.000Z");
      expect(periods[1].endsAt.toISOString()).toBe("2026-10-25T05:00:00.000Z");
      expect(periods[1].configLockAt.toISOString()).toBe("2026-10-25T02:15:00.000Z");

      // Period 3
      expect(periods[2].periodIndex).toBe(3);
      expect(periods[2].startsAt.toISOString()).toBe("2026-10-25T05:00:00.000Z");
      expect(periods[2].endsAt.toISOString()).toBe("2026-10-25T07:30:00.000Z");
      expect(periods[2].configLockAt.toISOString()).toBe("2026-10-25T04:45:00.000Z");
    });
  });

  describe("2. Drop Creation & Management", () => {
    it("creates a drop and auto-generates 2-hour UTC periods", async () => {
      mockPrisma.drop.findUnique
        .mockResolvedValueOnce(null) // Uniqueness check
        .mockResolvedValueOnce({
          id: "drop-new-1",
          slug: "genesis-drop",
          title: "Genesis Drop",
          periods: [{ id: "p1" }, { id: "p2" }],
        });
      mockPrisma.drop.create.mockResolvedValue({
        id: "drop-new-1",
        slug: "genesis-drop",
        title: "Genesis Drop",
        description: "Official genesis trait drop",
        status: "DRAFT",
        startsAt: new Date("2026-10-25T02:00:00.000Z"),
        endsAt: new Date("2026-10-25T07:00:00.000Z"),
      });
      mockPrisma.dropPeriod.create.mockResolvedValue({ id: "period-mock" });

      const result = await createAdminDrop(mockPrisma, {
        slug: "genesis-drop",
        title: "Genesis Drop",
        description: "Official genesis trait drop",
        startsAt: "2026-10-25T02:00:00.000Z",
        endsAt: "2026-10-25T07:00:00.000Z",
        adminUserId: "admin-1",
      });

      expect(mockPrisma.drop.create).toHaveBeenCalledWith({
        data: {
          slug: "genesis-drop",
          title: "Genesis Drop",
          description: "Official genesis trait drop",
          status: "DRAFT",
          startsAt: new Date("2026-10-25T02:00:00.000Z"),
          endsAt: new Date("2026-10-25T07:00:00.000Z"),
        },
      });

      // 5 hours span = 2 periods of 2.5 hours created
      expect(mockPrisma.dropPeriod.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "CREATE_DROP",
            entityType: "Drop",
            actorId: "admin-1",
          }),
        }),
      );
      expect(result.drop.id).toBe("drop-new-1");
    });

    it("rejects drop creation if startsAt does not align to 2-hour UTC cycle", async () => {
      mockPrisma.drop.findUnique.mockResolvedValue(null);

      await expect(
        createAdminDrop(mockPrisma, {
          slug: "bad-cycle",
          title: "Bad Cycle Drop",
          startsAt: "2026-10-25T01:30:00.000Z", // Not aligned
          endsAt: "2026-10-25T06:00:00.000Z",
          adminUserId: "admin-1",
        }),
      ).rejects.toThrow(AdminDropError);

      await expect(
        createAdminDrop(mockPrisma, {
          slug: "bad-cycle",
          title: "Bad Cycle Drop",
          startsAt: "2026-10-25T01:30:00.000Z",
          endsAt: "2026-10-25T06:00:00.000Z",
          adminUserId: "admin-1",
        }),
      ).rejects.toMatchObject({
        code: "CYCLE_NOT_ALIGNED",
        status: 400,
      });
    });

    it("rejects drop creation with duplicate slug", async () => {
      mockPrisma.drop.findUnique.mockResolvedValue({ id: "drop-existing" });

      await expect(
        createAdminDrop(mockPrisma, {
          slug: "duplicate-slug",
          title: "Duplicate Drop",
          startsAt: "2026-10-25T02:00:00.000Z",
          endsAt: "2026-10-25T06:00:00.000Z",
          adminUserId: "admin-1",
        }),
      ).rejects.toMatchObject({
        code: "SLUG_CONFLICT",
        status: 409,
      });
    });

    it("updates drop title, description, and status", async () => {
      mockPrisma.drop.findUnique.mockResolvedValue({
        id: "drop-1",
        slug: "drop-1",
        title: "Old Title",
        description: "Old Desc",
        status: "DRAFT",
      });
      mockPrisma.drop.update.mockResolvedValue({
        id: "drop-1",
        title: "New Title",
        description: "New Desc",
        status: "ACTIVE",
      });

      const res = await updateAdminDrop(mockPrisma, "drop-1", {
        title: "New Title",
        description: "New Desc",
        status: "ACTIVE",
        adminUserId: "admin-1",
      });

      expect(mockPrisma.drop.update).toHaveBeenCalledWith({
        where: { id: "drop-1" },
        data: {
          title: "New Title",
          description: "New Desc",
          status: "ACTIVE",
        },
        include: { periods: { orderBy: { periodIndex: "asc" } } },
      });
      expect(res.drop.title).toBe("New Title");
    });
  });

  describe("3. Period Creation & 2-Hour Alignment", () => {
    it("creates a single period aligned with 2-hour UTC cycle", async () => {
      mockPrisma.drop.findUnique.mockResolvedValue({
        id: "drop-1",
        periods: [{ periodIndex: 2 }],
      });
      mockPrisma.dropPeriod.findFirst.mockResolvedValue(null); // No collision
      mockPrisma.dropPeriod.create.mockResolvedValue({
        id: "period-3",
        dropId: "drop-1",
        periodIndex: 3,
        startsAt: new Date("2026-10-25T04:00:00.000Z"),
        endsAt: new Date("2026-10-25T06:30:00.000Z"),
        configLockAt: new Date("2026-10-25T03:45:00.000Z"),
        status: "PENDING_CONFIG",
      });

      const res = await createAdminDropPeriod(mockPrisma, {
        dropId: "drop-1",
        startsAt: "2026-10-25T04:00:00.000Z",
        adminUserId: "admin-1",
      });

      expect(mockPrisma.dropPeriod.create).toHaveBeenCalledWith({
        data: {
          dropId: "drop-1",
          periodIndex: 3,
          startsAt: new Date("2026-10-25T04:00:00.000Z"),
          endsAt: new Date("2026-10-25T06:30:00.000Z"),
          configLockAt: new Date("2026-10-25T03:45:00.000Z"),
          status: "PENDING_CONFIG",
          isStockConfigured: false,
          isStockLocked: false,
        },
      });
      expect(res.period.periodIndex).toBe(3);
    });

    it("rejects period creation if unaligned to 2-hour boundary", async () => {
      mockPrisma.drop.findUnique.mockResolvedValue({ id: "drop-1", periods: [] });

      await expect(
        createAdminDropPeriod(mockPrisma, {
          dropId: "drop-1",
          startsAt: "2026-10-25T04:30:00.000Z", // 30 min offset -> unaligned
          adminUserId: "admin-1",
        }),
      ).rejects.toMatchObject({
        code: "CYCLE_NOT_ALIGNED",
        status: 400,
      });
    });
  });

  describe("4. Trait Pool Stock Configuration & Timing Constraints", () => {
    const periodStartsAt = new Date("2026-10-25T04:00:00.000Z");
    const periodConfigLockAt = new Date("2026-10-25T03:45:00.000Z"); // 15m lead

    it("configures trait pool stock when called > 15 minutes before period start", async () => {
      const now = new Date("2026-10-25T03:30:00.000Z"); // 30 minutes before start (allowed)

      mockPrisma.dropPeriod.findUnique.mockResolvedValue({
        id: "period-1",
        dropId: "drop-1",
        periodIndex: 1,
        startsAt: periodStartsAt,
        endsAt: new Date("2026-10-25T06:00:00.000Z"),
        configLockAt: periodConfigLockAt,
        status: "PENDING_CONFIG",
        isStockLocked: false,
      });

      mockPrisma.trait.findMany.mockResolvedValue([
        { id: "trait-bg", isActive: true },
        { id: "trait-fur", isActive: true },
      ]);

      mockPrisma.dropPeriod.update.mockResolvedValue({
        id: "period-1",
        isStockConfigured: true,
        status: "CONFIGURED",
        poolItems: [
          { traitId: "trait-bg", allocatedStock: 50, remainingStock: 50, weight: 100 },
          { traitId: "trait-fur", allocatedStock: 50, remainingStock: 50, weight: 100 },
        ],
      });

      const res = await configurePeriodStock(mockPrisma, {
        dropId: "drop-1",
        periodId: "period-1",
        items: [
          { traitId: "trait-bg", stock: 50 },
          { traitId: "trait-fur", stock: 50 },
        ],
        adminUserId: "admin-1",
        now,
      });

      // Pool items cleared and re-created
      expect(mockPrisma.dropPoolItem.deleteMany).toHaveBeenCalledWith({
        where: { periodId: "period-1" },
      });
      expect(mockPrisma.dropPoolItem.create).toHaveBeenCalledTimes(2);

      // Default equal weight 100 applied
      expect(mockPrisma.dropPoolItem.create).toHaveBeenCalledWith({
        data: {
          periodId: "period-1",
          traitId: "trait-bg",
          allocatedStock: 50,
          remainingStock: 50,
          claimedStock: 0,
          weight: 100, // Equal probability by default
        },
      });

      // Period status transitioned to CONFIGURED
      expect(mockPrisma.dropPeriod.update).toHaveBeenCalledWith({
        where: { id: "period-1" },
        data: {
          isStockConfigured: true,
          status: "CONFIGURED",
        },
        include: { poolItems: { include: { trait: true } } },
      });

      expect(res.period.status).toBe("CONFIGURED");
    });

    it("strictly rejects stock configuration within the 15-minute freeze window", async () => {
      // 10 minutes before start -> inside the 15-min freeze window!
      const now = new Date("2026-10-25T03:50:00.000Z");

      mockPrisma.dropPeriod.findUnique.mockResolvedValue({
        id: "period-1",
        dropId: "drop-1",
        startsAt: periodStartsAt,
        configLockAt: periodConfigLockAt,
        status: "PENDING_CONFIG",
        isStockLocked: false,
      });

      await expect(
        configurePeriodStock(mockPrisma, {
          dropId: "drop-1",
          periodId: "period-1",
          items: [{ traitId: "trait-bg", stock: 50 }],
          adminUserId: "admin-1",
          now,
        }),
      ).rejects.toMatchObject({
        code: "STOCK_CONFIG_LOCKED",
        status: 409,
      });
    });

    it("strictly rejects stock modification after the period has started", async () => {
      // 5 minutes after start
      const now = new Date("2026-10-25T04:05:00.000Z");

      mockPrisma.dropPeriod.findUnique.mockResolvedValue({
        id: "period-1",
        dropId: "drop-1",
        startsAt: periodStartsAt,
        configLockAt: periodConfigLockAt,
        status: "ACTIVE",
        isStockLocked: true,
      });

      await expect(
        configurePeriodStock(mockPrisma, {
          dropId: "drop-1",
          periodId: "period-1",
          items: [{ traitId: "trait-bg", stock: 50 }],
          adminUserId: "admin-1",
          now,
        }),
      ).rejects.toMatchObject({
        code: "STOCK_PERIOD_STARTED",
        status: 409,
      });
    });

    it("rejects configuration if period is already locked or in non-editable status", async () => {
      const now = new Date("2026-10-25T03:00:00.000Z"); // early enough

      mockPrisma.dropPeriod.findUnique.mockResolvedValue({
        id: "period-1",
        dropId: "drop-1",
        startsAt: periodStartsAt,
        configLockAt: periodConfigLockAt,
        status: "CANCELLED",
        isStockLocked: true,
      });

      await expect(
        configurePeriodStock(mockPrisma, {
          dropId: "drop-1",
          periodId: "period-1",
          items: [{ traitId: "trait-bg", stock: 50 }],
          adminUserId: "admin-1",
          now,
        }),
      ).rejects.toMatchObject({
        code: "STOCK_ALREADY_LOCKED",
        status: 409,
      });
    });

    it("rejects invalid stock inputs (negative, non-integer, or zero total stock)", async () => {
      const now = new Date("2026-10-25T03:00:00.000Z");

      mockPrisma.dropPeriod.findUnique.mockResolvedValue({
        id: "period-1",
        dropId: "drop-1",
        startsAt: periodStartsAt,
        configLockAt: periodConfigLockAt,
        status: "PENDING_CONFIG",
        isStockLocked: false,
      });

      // Negative stock
      await expect(
        configurePeriodStock(mockPrisma, {
          dropId: "drop-1",
          periodId: "period-1",
          items: [{ traitId: "trait-bg", stock: -5 }],
          adminUserId: "admin-1",
          now,
        }),
      ).rejects.toMatchObject({
        code: "INVALID_STOCK",
        status: 400,
      });

      // Total stock 0
      await expect(
        configurePeriodStock(mockPrisma, {
          dropId: "drop-1",
          periodId: "period-1",
          items: [{ traitId: "trait-bg", stock: 0 }],
          adminUserId: "admin-1",
          now,
        }),
      ).rejects.toMatchObject({
        code: "ZERO_STOCK",
        status: 400,
      });
    });

    it("rejects unknown or inactive traits", async () => {
      const now = new Date("2026-10-25T03:00:00.000Z");

      mockPrisma.dropPeriod.findUnique.mockResolvedValue({
        id: "period-1",
        dropId: "drop-1",
        startsAt: periodStartsAt,
        configLockAt: periodConfigLockAt,
        status: "PENDING_CONFIG",
        isStockLocked: false,
      });

      // Trait not found in active traits
      mockPrisma.trait.findMany.mockResolvedValue([]);

      await expect(
        configurePeriodStock(mockPrisma, {
          dropId: "drop-1",
          periodId: "period-1",
          items: [{ traitId: "trait-nonexistent", stock: 10 }],
          adminUserId: "admin-1",
          now,
        }),
      ).rejects.toMatchObject({
        code: "TRAIT_NOT_FOUND",
        status: 404,
      });
    });
  });

  describe("5. Period Activation & Stock Invariants", () => {
    const periodStartsAt = new Date("2026-10-25T04:00:00.000Z");
    const periodEndsAt = new Date("2026-10-25T06:00:00.000Z");

    it("activates period when time arrives and stock is configured and valid", async () => {
      const now = new Date("2026-10-25T04:05:00.000Z"); // within period window

      mockPrisma.dropPeriod.findUnique.mockResolvedValue({
        id: "period-1",
        dropId: "drop-1",
        periodIndex: 1,
        startsAt: periodStartsAt,
        endsAt: periodEndsAt,
        status: "CONFIGURED",
        isStockConfigured: true,
        drop: { id: "drop-1", status: "SCHEDULED" },
        poolItems: [
          { id: "pi-1", traitId: "trait-bg", allocatedStock: 20, remainingStock: 20 },
        ],
      });

      mockPrisma.dropPeriod.update.mockResolvedValue({
        id: "period-1",
        status: "ACTIVE",
        isStockLocked: true,
      });

      const res = await activateDropPeriod(mockPrisma, {
        dropId: "drop-1",
        periodId: "period-1",
        adminUserId: "admin-1",
        now,
      });

      // Period status transitioned to ACTIVE and stock locked
      expect(mockPrisma.dropPeriod.update).toHaveBeenCalledWith({
        where: { id: "period-1" },
        data: {
          status: "ACTIVE",
          isStockLocked: true,
        },
        include: { poolItems: { include: { trait: true } } },
      });

      // Drop status transitioned to ACTIVE
      expect(mockPrisma.drop.update).toHaveBeenCalledWith({
        where: { id: "drop-1" },
        data: { status: "ACTIVE" },
      });

      expect(res.period.status).toBe("ACTIVE");
    });

    it("INVARIANT: jika stock hilang atau tidak valid saat period seharusnya dimulai, period TIDAK dibuka", async () => {
      const now = new Date("2026-10-25T04:05:00.000Z"); // cycle time arrived

      // Case A: isStockConfigured is false
      mockPrisma.dropPeriod.findUnique.mockResolvedValue({
        id: "period-unconfigured",
        dropId: "drop-1",
        periodIndex: 1,
        startsAt: periodStartsAt,
        endsAt: periodEndsAt,
        status: "PENDING_CONFIG",
        isStockConfigured: false,
        drop: { id: "drop-1", status: "SCHEDULED" },
        poolItems: [],
      });

      await expect(
        activateDropPeriod(mockPrisma, {
          dropId: "drop-1",
          periodId: "period-unconfigured",
          adminUserId: "admin-1",
          now,
        }),
      ).rejects.toMatchObject({
        code: "PERIOD_STOCK_INVALID",
        status: 400,
      });

      // Case B: pool items empty even if isStockConfigured was true
      mockPrisma.dropPeriod.findUnique.mockResolvedValue({
        id: "period-empty-stock",
        dropId: "drop-1",
        periodIndex: 1,
        startsAt: periodStartsAt,
        endsAt: periodEndsAt,
        status: "CONFIGURED",
        isStockConfigured: true,
        drop: { id: "drop-1", status: "SCHEDULED" },
        poolItems: [], // No items!
      });

      await expect(
        activateDropPeriod(mockPrisma, {
          dropId: "drop-1",
          periodId: "period-empty-stock",
          adminUserId: "admin-1",
          now,
        }),
      ).rejects.toMatchObject({
        code: "PERIOD_STOCK_INVALID",
        status: 400,
      });

      // Case C: pool items with 0 remaining stock
      mockPrisma.dropPeriod.findUnique.mockResolvedValue({
        id: "period-zero-stock",
        dropId: "drop-1",
        periodIndex: 1,
        startsAt: periodStartsAt,
        endsAt: periodEndsAt,
        status: "CONFIGURED",
        isStockConfigured: true,
        drop: { id: "drop-1", status: "SCHEDULED" },
        poolItems: [
          { id: "pi-1", traitId: "trait-bg", allocatedStock: 0, remainingStock: 0 },
        ],
      });

      await expect(
        activateDropPeriod(mockPrisma, {
          dropId: "drop-1",
          periodId: "period-zero-stock",
          adminUserId: "admin-1",
          now,
        }),
      ).rejects.toMatchObject({
        code: "PERIOD_STOCK_INVALID",
        status: 400,
      });
    });

    it("rejects activation before period start time or after end time", async () => {
      // 10 minutes before start
      const earlyNow = new Date("2026-10-25T03:50:00.000Z");

      mockPrisma.dropPeriod.findUnique.mockResolvedValue({
        id: "period-1",
        dropId: "drop-1",
        startsAt: periodStartsAt,
        endsAt: periodEndsAt,
        status: "CONFIGURED",
        isStockConfigured: true,
        poolItems: [{ remainingStock: 10, allocatedStock: 10 }],
      });

      await expect(
        activateDropPeriod(mockPrisma, {
          dropId: "drop-1",
          periodId: "period-1",
          adminUserId: "admin-1",
          now: earlyNow,
        }),
      ).rejects.toMatchObject({
        code: "PERIOD_NOT_STARTED",
        status: 400,
      });

      // After end time
      const lateNow = new Date("2026-10-25T06:30:00.000Z");

      await expect(
        activateDropPeriod(mockPrisma, {
          dropId: "drop-1",
          periodId: "period-1",
          adminUserId: "admin-1",
          now: lateNow,
        }),
      ).rejects.toMatchObject({
        code: "PERIOD_ALREADY_ENDED",
        status: 400,
      });
    });
  });

  describe("6. Trait Listing", () => {
    it("lists active traits ordered by category and name", async () => {
      mockPrisma.trait.findMany.mockResolvedValue([
        { id: "t1", name: "Alpha", category: "BG", rarity: "COMMON" },
        { id: "t2", name: "Beta", category: "FUR", rarity: "RARE" },
      ]);

      const traits = await listAdminTraits(mockPrisma);
      expect(traits).toHaveLength(2);
      expect(mockPrisma.trait.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: [{ category: "asc" }, { name: "asc" }],
        select: expect.any(Object),
      });
    });
  });
});
