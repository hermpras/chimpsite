import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/drops/current/route";

const { mockDropFindFirst } = vi.hoisted(() => ({
  mockDropFindFirst: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    drop: {
      findFirst: mockDropFindFirst,
    },
  },
}));

describe("GET /api/drops/current (Public Drop Endpoint)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
