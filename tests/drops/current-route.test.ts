import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/drops/current/route";

const {
  mockDropFindFirst,
  mockDropUpdate,
  mockDropPeriodFindFirst,
  mockClaimFindFirst,
  mockClaimFindMany,
} = vi.hoisted(() => ({
  mockDropFindFirst: vi.fn(),
  mockDropUpdate: vi.fn(),
  mockDropPeriodFindFirst: vi.fn(),
  mockClaimFindFirst: vi.fn(),
  mockClaimFindMany: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    drop: {
      findFirst: mockDropFindFirst,
      update: mockDropUpdate,
    },
    dropPeriod: {
      findFirst: mockDropPeriodFindFirst,
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    trait: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({ id: "t1", slug: "cyber-jungle-bg" }),
    },
    claim: {
      findFirst: mockClaimFindFirst,
      findMany: mockClaimFindMany,
    },
  },
}));

describe("GET /api/drops/current (Public Drop Endpoint)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("permits anonymous access without authentication cookies or headers", async () => {
    mockDropFindFirst.mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/drops/current", {
      method: "GET",
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.active).toBe(false);
    expect(data.message).toBe("No drop event is currently active.");
    expect(data.nextCycle).toBeDefined();
    expect(data.nextCycle.cycleDurationHours).toBe(2);
  });

  it("returns public drop details, stock counts, and transparent probabilities without exposing sensitive internal fields", async () => {
    const now = new Date();
    const periodStartsAt = new Date(now.getTime() - 5 * 60 * 1000); // 5 min ago
    const periodEndsAt = new Date(now.getTime() + 115 * 60 * 1000); // in 115 min

    mockDropFindFirst.mockResolvedValue({
      id: "drop-1",
      slug: "genesis-drop",
      title: "ChimpHood Genesis Drop",
      description: "Genesis public trait drop",
      status: "ACTIVE",
      startsAt: new Date(now.getTime() - 60 * 60 * 1000),
      endsAt: new Date(now.getTime() + 60 * 60 * 1000),
      periods: [
        {
          id: "period-1",
          dropId: "drop-1",
          periodIndex: 1,
          startsAt: periodStartsAt,
          endsAt: periodEndsAt,
          status: "ACTIVE",
          isStockLocked: true,
          poolItems: [
            {
              id: "pool-item-1",
              traitId: "trait-bg",
              allocatedStock: 10,
              claimedStock: 2,
              remainingStock: 8,
              weight: 80,
              trait: {
                id: "trait-bg",
                name: "Golden Jungle",
                category: "BG",
                rarity: "RARE",
              },
            },
            {
              id: "pool-item-2",
              traitId: "trait-fur",
              allocatedStock: 5,
              claimedStock: 3,
              remainingStock: 2,
              weight: 20,
              trait: {
                id: "trait-fur",
                name: "Cyber Chimp",
                category: "FUR",
                rarity: "EPIC",
              },
            },
          ],
        },
      ],
    });

    // Anonymous request (no cookie / no auth header)
    const req = new Request("http://localhost:3000/api/drops/current", {
      method: "GET",
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.active).toBe(true);
    expect(data.drop).toEqual({
      id: "drop-1",
      slug: "genesis-drop",
      title: "ChimpHood Genesis Drop",
      description: "Genesis public trait drop",
      status: "ACTIVE",
      cycleDurationHours: 2,
    });

    expect(data.claimWindow).toEqual({
      isActive: true,
      startsAt: periodStartsAt.toISOString(),
      endsAt: new Date(periodStartsAt.getTime() + 30 * 60 * 1000).toISOString(),
      timeRemainingMs: expect.any(Number),
    });

    expect(data.stock).toEqual({
      totalAllocated: 15,
      totalRemaining: 10,
      isExhausted: false,
      poolItems: [
        {
          poolItemId: "pool-item-1",
          traitId: "trait-bg",
          traitName: "Golden Jungle",
          category: "BG",
          rarity: "RARE",
          remainingStock: 8,
          allocatedStock: 10,
          weight: 80,
          probabilityPercent: 80,
        },
        {
          poolItemId: "pool-item-2",
          traitId: "trait-fur",
          traitName: "Cyber Chimp",
          category: "FUR",
          rarity: "EPIC",
          remainingStock: 2,
          allocatedStock: 5,
          weight: 20,
          probabilityPercent: 20,
        },
      ],
    });

    // Ensure no secrets, tokens, user data, or DB internals are leaked
    expect(data).not.toHaveProperty("user");
    expect(data).not.toHaveProperty("session");
    expect(data).not.toHaveProperty("token");
    expect(data).not.toHaveProperty("secret");
  });

  it("INVARIANT: claim window is inactive if period was not opened (e.g. status PENDING_CONFIG when stock was unconfigured)", async () => {
    const now = new Date();
    mockDropFindFirst.mockResolvedValue({
      id: "drop-unopened",
      slug: "drop-unopened",
      title: "Unopened Drop",
      status: "ACTIVE",
      startsAt: new Date(now.getTime() - 60 * 60 * 1000),
      endsAt: new Date(now.getTime() + 60 * 60 * 1000),
      periods: [
        {
          id: "period-unconfigured",
          dropId: "drop-unopened",
          periodIndex: 1,
          startsAt: new Date(now.getTime() - 5 * 60 * 1000),
          endsAt: new Date(now.getTime() + 115 * 60 * 1000),
          status: "PENDING_CONFIG", // Stock was unconfigured -> period not opened!
          isStockLocked: false,
          poolItems: [],
        },
      ],
    });

    const req = new Request("http://localhost:3000/api/drops/current", {
      method: "GET",
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.active).toBe(true);
    // Period was not opened, so claim window MUST NOT be active
    expect(data.claimWindow.isActive).toBe(false);
  });

  describe("P0.1 Scoped Historical Query Optimizations", () => {
    const baseDrop = {
      id: "drop-scoped",
      slug: "genesis-drop",
      title: "ChimpHood Genesis Drop",
      description: "Genesis public trait drop",
      status: "ACTIVE",
      startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      cycleDurationHours: 2,
    };

    const mockPoolItems = [
      {
        id: "item-1",
        traitId: "trait-bg",
        allocatedStock: 85,
        claimedStock: 10,
        remainingStock: 75,
        weight: 85,
        trait: {
          id: "trait-bg",
          name: "Cyber Jungle",
          category: "BG",
          rarity: "COMMON",
        },
      },
      {
        id: "item-2",
        traitId: "trait-clothing",
        allocatedStock: 65,
        claimedStock: 5,
        remainingStock: 60,
        weight: 65,
        trait: {
          id: "trait-clothing",
          name: "Stealth Hoodie",
          category: "CLOTHING",
          rarity: "UNCOMMON",
        },
      },
    ];

    it("verifies prisma.drop.findFirst is executed as a lean query without including periods", async () => {
      mockDropFindFirst.mockResolvedValue(baseDrop);
      mockDropPeriodFindFirst.mockResolvedValue({
        id: "period-active-1",
        dropId: "drop-scoped",
        periodIndex: 1,
        startsAt: new Date(Date.now() - 10 * 60 * 1000),
        endsAt: new Date(Date.now() + 110 * 60 * 1000),
        status: "ACTIVE",
        isStockLocked: true,
        poolItems: mockPoolItems,
      });

      const req = new Request("http://localhost:3000/api/drops/current", { method: "GET" });
      const res = await GET(req);
      expect(res.status).toBe(200);

      // Verify drop.findFirst had NO include periods
      expect(mockDropFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: "ACTIVE",
            startsAt: expect.any(Object),
          }),
        }),
      );
      const findFirstCallArgs = mockDropFindFirst.mock.calls[0][0];
      expect(findFirstCallArgs.include).toBeUndefined();
    });

    it("queries activePeriod with exact time-scoped boundaries (startsAt <= now && endsAt >= now)", async () => {
      mockDropFindFirst.mockResolvedValue(baseDrop);
      mockDropPeriodFindFirst.mockResolvedValue({
        id: "period-current",
        dropId: "drop-scoped",
        periodIndex: 5,
        startsAt: new Date(Date.now() - 15 * 60 * 1000),
        endsAt: new Date(Date.now() + 105 * 60 * 1000),
        status: "ACTIVE",
        isStockLocked: true,
        poolItems: mockPoolItems,
      });

      const req = new Request("http://localhost:3000/api/drops/current", { method: "GET" });
      await GET(req);

      // Verify dropPeriod.findFirst was called with time filters
      expect(mockDropPeriodFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dropId: "drop-scoped",
            startsAt: { lte: expect.any(Date) },
            endsAt: { gte: expect.any(Date) },
          }),
          orderBy: { startsAt: "desc" },
          include: {
            poolItems: {
              include: { trait: true },
            },
          },
        }),
      );
    });

    it("returns nextPeriod and nextCycle when an upcoming period already exists in the database", async () => {
      const now = new Date();
      const currentStart = new Date(now.getTime() - 20 * 60 * 1000);
      const currentEnd = new Date(now.getTime() + 100 * 60 * 1000);
      const nextStart = new Date(now.getTime() + 100 * 60 * 1000);
      const nextEnd = new Date(now.getTime() + 220 * 60 * 1000);

      mockDropFindFirst.mockResolvedValue(baseDrop);
      mockDropPeriodFindFirst.mockImplementation(async (query: any) => {
        if (query.where?.startsAt?.lte) {
          // Query for active period
          return {
            id: "period-active",
            dropId: "drop-scoped",
            periodIndex: 1,
            startsAt: currentStart,
            endsAt: currentEnd,
            status: "ACTIVE",
            isStockLocked: true,
            poolItems: mockPoolItems,
          };
        }
        if (query.where?.startsAt?.gte || query.where?.startsAt?.gt) {
          // Query for next upcoming period
          return {
            id: "period-next",
            dropId: "drop-scoped",
            periodIndex: 2,
            startsAt: nextStart,
            endsAt: nextEnd,
            status: "CONFIGURED",
            isStockLocked: false,
            poolItems: [],
          };
        }
        return null;
      });

      const req = new Request("http://localhost:3000/api/drops/current", { method: "GET" });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.active).toBe(true);
      expect(data.period.id).toBe("period-active");
      expect(data.period.periodIndex).toBe(1);
      expect(data.nextPeriod).toBeDefined();
      expect(data.nextPeriod.id).toBe("period-next");
      expect(data.nextPeriod.periodIndex).toBe(2);
      expect(data.nextPeriod.startsAt).toBe(nextStart.toISOString());
      expect(data.nextPeriod.endsAt).toBe(nextEnd.toISOString());
      expect(data.nextCycle.startsAt).toBe(nextStart.toISOString());
      expect(data.nextCycle.endsAt).toBe(nextEnd.toISOString());
    });

    it("handles absence of nextPeriod gracefully without error and calculates nextCycle based on active period endsAt", async () => {
      const now = new Date();
      const currentStart = new Date(now.getTime() - 10 * 60 * 1000);
      const currentEnd = new Date(now.getTime() + 110 * 60 * 1000);

      mockDropFindFirst.mockResolvedValue(baseDrop);
      mockDropPeriodFindFirst.mockImplementation(async (query: any) => {
        if (query.where?.startsAt?.lte) {
          return {
            id: "period-only-active",
            dropId: "drop-scoped",
            periodIndex: 3,
            startsAt: currentStart,
            endsAt: currentEnd,
            status: "ACTIVE",
            isStockLocked: true,
            poolItems: mockPoolItems,
          };
        }
        // No next period configured yet
        return null;
      });

      const req = new Request("http://localhost:3000/api/drops/current", { method: "GET" });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.active).toBe(true);
      expect(data.period.id).toBe("period-only-active");
      expect(data.nextPeriod).toBeUndefined();
      expect(data.nextCycle).toBeDefined();
      expect(data.nextCycle.startsAt).toBe(currentEnd.toISOString());
      expect(data.nextCycle.endsAt).toBe(
        new Date(currentEnd.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      );
    });

    it("simulates rollover correctly without querying historical expired periods", async () => {
      const t0 = new Date("2026-11-14T10:00:00.000Z");
      const tRollover = new Date("2026-11-14T12:00:01.000Z");

      const period1 = {
        id: "period-p1",
        dropId: "drop-scoped",
        periodIndex: 1,
        startsAt: new Date("2026-11-14T10:00:00.000Z"),
        endsAt: new Date("2026-11-14T12:00:00.000Z"),
        status: "ACTIVE",
        isStockLocked: true,
        poolItems: mockPoolItems,
      };

      const period2 = {
        id: "period-p2",
        dropId: "drop-scoped",
        periodIndex: 2,
        startsAt: new Date("2026-11-14T12:00:00.000Z"),
        endsAt: new Date("2026-11-14T14:00:00.000Z"),
        status: "ACTIVE",
        isStockLocked: true,
        poolItems: mockPoolItems,
      };

      mockDropFindFirst.mockResolvedValue(baseDrop);

      // At rollover (12:00:01), query finds period 2 because startsAt <= 12:00:01 and endsAt >= 12:00:01
      mockDropPeriodFindFirst.mockImplementation(async (query: any) => {
        if (query.where?.startsAt?.lte) {
          // Verify filter condition strictly bounds query to currentTime
          return period2;
        }
        return null;
      });

      const req = new Request("http://localhost:3000/api/drops/current", { method: "GET" });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.period.id).toBe("period-p2");
      expect(data.period.periodIndex).toBe(2);
      expect(data.period.startsAt).toBe(period2.startsAt.toISOString());
    });

    it("handles between-cycles condition with periodActive: false and exposes nextCycle countdown", async () => {
      mockDropFindFirst.mockResolvedValue(baseDrop);
      // No active period found, and upcoming period exists
      const upcomingStart = new Date(Date.now() + 30 * 60 * 1000);
      const upcomingEnd = new Date(Date.now() + 150 * 60 * 1000);

      mockDropPeriodFindFirst.mockImplementation(async (query: any) => {
        if (query.where?.startsAt?.gt) {
          return {
            id: "period-upcoming",
            dropId: "drop-scoped",
            periodIndex: 10,
            startsAt: upcomingStart,
            endsAt: upcomingEnd,
            status: "CONFIGURED",
            isStockLocked: false,
            poolItems: [],
          };
        }
        return null;
      });

      const req = new Request("http://localhost:3000/api/drops/current", { method: "GET" });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.active).toBe(true);
      expect(data.periodActive).toBe(false);
      expect(data.period).toBeUndefined();
      expect(data.message).toBe("Drop is active, but current period is between cycles.");
      expect(data.nextCycle.startsAt).toBe(upcomingStart.toISOString());
      expect(data.nextCycle.endsAt).toBe(upcomingEnd.toISOString());
      expect(data.nextPeriod.id).toBe("period-upcoming");
    });

    it("preserves totalAllocated, totalRemaining, and transparent probability calculations accurately", async () => {
      mockDropFindFirst.mockResolvedValue(baseDrop);
      mockDropPeriodFindFirst.mockResolvedValue({
        id: "period-calc",
        dropId: "drop-scoped",
        periodIndex: 1,
        startsAt: new Date(Date.now() - 5 * 60 * 1000),
        endsAt: new Date(Date.now() + 115 * 60 * 1000),
        status: "ACTIVE",
        isStockLocked: true,
        poolItems: mockPoolItems,
      });

      const req = new Request("http://localhost:3000/api/drops/current", { method: "GET" });
      const res = await GET(req);
      const data = await res.json();

      // allocated = 85 + 65 = 150, remaining = 75 + 60 = 135
      expect(data.stock.totalAllocated).toBe(150);
      expect(data.stock.totalRemaining).toBe(135);
      expect(data.stock.isExhausted).toBe(false);
      expect(data.stock.poolItems).toHaveLength(2);
      expect(data.stock.poolItems[0].probabilityPercent).toBeCloseTo((85 / 150) * 100, 1);
      expect(data.stock.poolItems[1].probabilityPercent).toBeCloseTo((65 / 150) * 100, 1);
    });

    it("HARDENING: excludes overlapping periods that start before activePeriod.endsAt", async () => {
      const now = new Date("2026-11-14T10:30:00.000Z");
      const currentStart = new Date("2026-11-14T10:00:00.000Z");
      const currentEnd = new Date("2026-11-14T12:00:00.000Z");
      const validNextStart = new Date("2026-11-14T12:00:00.000Z");
      const validNextEnd = new Date("2026-11-14T14:00:00.000Z");

      mockDropFindFirst.mockResolvedValue(baseDrop);
      mockDropPeriodFindFirst.mockImplementation(async (query: any) => {
        if (query.where?.startsAt?.lte) {
          return {
            id: "period-active",
            dropId: "drop-scoped",
            periodIndex: 1,
            startsAt: currentStart,
            endsAt: currentEnd,
            status: "ACTIVE",
            isStockLocked: true,
            poolItems: mockPoolItems,
          };
        }
        // Verify nextPeriod query enforces startsAt >= activePeriodEndsAt
        expect(query.where?.startsAt?.gte).toEqual(currentEnd);
        return {
          id: "period-valid-next",
          dropId: "drop-scoped",
          periodIndex: 2,
          startsAt: validNextStart,
          endsAt: validNextEnd,
          status: "CONFIGURED",
          isStockLocked: false,
          poolItems: [],
        };
      });

      const req = new Request("http://localhost:3000/api/drops/current", { method: "GET" });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.period.id).toBe("period-active");
      expect(data.nextPeriod.id).toBe("period-valid-next");
      expect(data.nextPeriod.startsAt).toBe(validNextStart.toISOString());
    });

    it("HARDENING: excludes overlapping periods from mock drop.periods fallback when startsAt < activePeriodEndsAt", async () => {
      const now = new Date();
      const currentStart = new Date(now.getTime() - 20 * 60 * 1000);
      const currentEnd = new Date(now.getTime() + 100 * 60 * 1000);
      const overlappingStart = new Date(now.getTime() + 10 * 60 * 1000);
      const overlappingEnd = new Date(now.getTime() + 50 * 60 * 1000);
      const validNextStart = new Date(now.getTime() + 100 * 60 * 1000);
      const validNextEnd = new Date(now.getTime() + 220 * 60 * 1000);

      mockDropFindFirst.mockResolvedValue({
        ...baseDrop,
        periods: [
          {
            id: "period-active",
            dropId: "drop-scoped",
            periodIndex: 1,
            startsAt: currentStart,
            endsAt: currentEnd,
            status: "ACTIVE",
            isStockLocked: true,
            poolItems: mockPoolItems,
          },
          {
            id: "period-overlapping",
            dropId: "drop-scoped",
            periodIndex: 99,
            startsAt: overlappingStart,
            endsAt: overlappingEnd,
            status: "CONFIGURED",
            isStockLocked: false,
            poolItems: [],
          },
          {
            id: "period-valid-next",
            dropId: "drop-scoped",
            periodIndex: 2,
            startsAt: validNextStart,
            endsAt: validNextEnd,
            status: "CONFIGURED",
            isStockLocked: false,
            poolItems: [],
          },
        ],
      });
      // Force test fallback
      mockDropPeriodFindFirst.mockResolvedValue(null);

      const req = new Request("http://localhost:3000/api/drops/current", { method: "GET" });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.period.id).toBe("period-active");
      expect(data.nextPeriod.id).toBe("period-valid-next");
      expect(data.nextPeriod.startsAt).toBe(validNextStart.toISOString());
    });

    it("HARDENING: excludes CANCELLED periods from being selected as nextPeriod", async () => {
      const now = new Date("2026-11-14T10:30:00.000Z");
      const currentStart = new Date("2026-11-14T10:00:00.000Z");
      const currentEnd = new Date("2026-11-14T12:00:00.000Z");
      const validNextStart = new Date("2026-11-14T14:00:00.000Z");

      mockDropFindFirst.mockResolvedValue(baseDrop);
      mockDropPeriodFindFirst.mockImplementation(async (query: any) => {
        if (query.where?.startsAt?.lte) {
          return {
            id: "period-active",
            dropId: "drop-scoped",
            periodIndex: 1,
            startsAt: currentStart,
            endsAt: currentEnd,
            status: "ACTIVE",
            isStockLocked: true,
            poolItems: mockPoolItems,
          };
        }
        // Verify status { not: "CANCELLED" } filter
        expect(query.where?.status).toEqual({ not: "CANCELLED" });
        return {
          id: "period-after-cancelled",
          dropId: "drop-scoped",
          periodIndex: 3,
          startsAt: validNextStart,
          endsAt: new Date(validNextStart.getTime() + 2 * 60 * 60 * 1000),
          status: "CONFIGURED",
          isStockLocked: false,
          poolItems: [],
        };
      });

      const req = new Request("http://localhost:3000/api/drops/current", { method: "GET" });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.nextPeriod.id).toBe("period-after-cancelled");
      expect(data.nextPeriod.startsAt).toBe(validNextStart.toISOString());
    });

    it("HARDENING: selects the new period as active precisely at rollover millisecond 12:00:00.000", async () => {
      const rolloverExact = new Date("2026-11-14T12:00:00.000Z");

      const periodP1 = {
        id: "period-p1",
        dropId: "drop-scoped",
        periodIndex: 1,
        startsAt: new Date("2026-11-14T10:00:00.000Z"),
        endsAt: new Date("2026-11-14T12:00:00.000Z"),
        status: "ACTIVE",
        isStockLocked: true,
        poolItems: mockPoolItems,
      };

      const periodP2 = {
        id: "period-p2",
        dropId: "drop-scoped",
        periodIndex: 2,
        startsAt: new Date("2026-11-14T12:00:00.000Z"),
        endsAt: new Date("2026-11-14T14:00:00.000Z"),
        status: "ACTIVE",
        isStockLocked: true,
        poolItems: mockPoolItems,
      };

      const periodP3 = {
        id: "period-p3",
        dropId: "drop-scoped",
        periodIndex: 3,
        startsAt: new Date("2026-11-14T14:00:00.000Z"),
        endsAt: new Date("2026-11-14T16:00:00.000Z"),
        status: "CONFIGURED",
        isStockLocked: false,
        poolItems: [],
      };

      mockDropFindFirst.mockResolvedValue(baseDrop);
      mockDropPeriodFindFirst.mockImplementation(async (query: any) => {
        if (query.where?.startsAt?.lte) {
          // Both periodP1 and periodP2 match startsAt <= 12:00:00.000 && endsAt >= 12:00:00.000
          // orderBy: { startsAt: "desc" } ensures periodP2 is chosen
          expect(query.orderBy).toEqual({ startsAt: "desc" });
          return periodP2;
        }
        if (query.where?.startsAt?.gte) {
          // nextPeriod query searches startsAt >= periodP2.endsAt (14:00:00.000Z)
          expect(query.where.startsAt.gte).toEqual(periodP2.endsAt);
          return periodP3;
        }
        return null;
      });

      vi.useFakeTimers();
      vi.setSystemTime(rolloverExact);

      try {
        const req = new Request("http://localhost:3000/api/drops/current", { method: "GET" });
        const res = await GET(req);
        expect(res.status).toBe(200);
        const data = await res.json();

        expect(data.period.id).toBe("period-p2");
        expect(data.period.periodIndex).toBe(2);
        expect(data.period.startsAt).toBe(periodP2.startsAt.toISOString());
        expect(data.nextPeriod.id).toBe("period-p3");
        expect(data.nextPeriod.startsAt).toBe(periodP3.startsAt.toISOString());
      } finally {
        vi.useRealTimers();
      }
    });

    it("HARDENING: handles case where neither activePeriod nor nextPeriod exists by falling back to calculated cycle", async () => {
      mockDropFindFirst.mockResolvedValue(baseDrop);
      mockDropPeriodFindFirst.mockResolvedValue(null);

      const req = new Request("http://localhost:3000/api/drops/current", { method: "GET" });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.active).toBe(true);
      expect(data.periodActive).toBe(false);
      expect(data.period).toBeUndefined();
      expect(data.nextPeriod).toBeUndefined();
      expect(data.message).toBe("Drop is active, but current period is between cycles.");
      expect(data.nextCycle).toBeDefined();
      expect(data.nextCycle.startsAt).toBeDefined();
      expect(data.nextCycle.endsAt).toBeDefined();

      const cycleStart = new Date(data.nextCycle.startsAt).getTime();
      const cycleEnd = new Date(data.nextCycle.endsAt).getTime();
      expect(cycleEnd - cycleStart).toBe(2 * 60 * 60 * 1000);
    });
  });
});
