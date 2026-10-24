import { describe, it, expect, vi } from "vitest";
import { sweepExpiredGifts } from "@/server/inventory/gift";
import { cleanupExpiredAuth } from "@/server/auth/cleanup";

describe("Cron Concurrency, Idempotency & Safety Suite", () => {
  // ─── 1. sweepExpiredGifts Concurrency & Idempotency ──────────────────────

  describe("sweepExpiredGifts Service", () => {
    function createMockPrismaForSweep(initialGifts: any[], initialItems: any[]) {
      const store = {
        gifts: [...initialGifts],
        items: [...initialItems],
      };

      return {
        gift: {
          findMany: vi.fn(async ({ where }: any) => {
            return store.gifts.filter((g) => {
              if (where.status && g.status !== where.status) return false;
              if (where.expiresAt?.lt && !(g.expiresAt < where.expiresAt.lt)) return false;
              return true;
            });
          }),
        },
        inventoryItem: {
          update: vi.fn(async ({ where, data }: any) => {
            const item = store.items.find((i) => i.id === where.id);
            if (!item) throw new Error("Item not found");
            Object.assign(item, data);
            return item;
          }),
        },
        $transaction: vi.fn(async (callback: any) => {
          const tx = {
            gift: {
              updateMany: vi.fn(async ({ where, data }: any) => {
                const target = store.gifts.find(
                  (g) => g.id === where.id && g.status === where.status,
                );
                if (target) {
                  Object.assign(target, data);
                  return { count: 1 };
                }
                return { count: 0 };
              }),
            },
            inventoryItem: {
              update: vi.fn(async ({ where, data }: any) => {
                const item = store.items.find((i) => i.id === where.id);
                if (!item) throw new Error("Item not found");
                Object.assign(item, data);
                return item;
              }),
            },
          };
          return callback(tx);
        }),
        _store: store,
      };
    }

    it("sweeps expired pending gifts and unlocks items", async () => {
      const now = new Date("2026-10-24T12:00:00Z");
      const past = new Date("2026-10-24T11:00:00Z");
      const future = new Date("2026-10-24T13:00:00Z");

      const mockPrisma = createMockPrismaForSweep(
        [
          {
            id: "gift-expired-1",
            status: "PENDING",
            expiresAt: past,
            inventoryItemId: "item-1",
          },
          {
            id: "gift-expired-2",
            status: "PENDING",
            expiresAt: past,
            inventoryItemId: "item-2",
          },
          {
            id: "gift-active",
            status: "PENDING",
            expiresAt: future,
            inventoryItemId: "item-3",
          },
          {
            id: "gift-accepted",
            status: "ACCEPTED",
            expiresAt: past,
            inventoryItemId: "item-4",
          },
        ],
        [
          { id: "item-1", isLocked: true, lockReason: "PENDING_GIFT" },
          { id: "item-2", isLocked: true, lockReason: "PENDING_GIFT" },
          { id: "item-3", isLocked: true, lockReason: "PENDING_GIFT" },
          { id: "item-4", isLocked: false, lockReason: null },
        ],
      );

      const result = await sweepExpiredGifts(mockPrisma as any, now);

      expect(result.processedCount).toBe(2);
      expect(result.giftIds).toEqual(["gift-expired-1", "gift-expired-2"]);

      // Verify item unlocking
      expect(mockPrisma._store.items.find((i) => i.id === "item-1")?.isLocked).toBe(false);
      expect(mockPrisma._store.items.find((i) => i.id === "item-2")?.isLocked).toBe(false);
      // Verify active gift item remains locked
      expect(mockPrisma._store.items.find((i) => i.id === "item-3")?.isLocked).toBe(true);
    });

    it("is strictly idempotent: repeated executions do not re-process or fail", async () => {
      const now = new Date("2026-10-24T12:00:00Z");
      const past = new Date("2026-10-24T11:00:00Z");

      const mockPrisma = createMockPrismaForSweep(
        [
          {
            id: "gift-1",
            status: "PENDING",
            expiresAt: past,
            inventoryItemId: "item-1",
          },
        ],
        [{ id: "item-1", isLocked: true, lockReason: "PENDING_GIFT" }],
      );

      // First run: processes the gift
      const run1 = await sweepExpiredGifts(mockPrisma as any, now);
      expect(run1.processedCount).toBe(1);

      // Second run: 0 items to sweep
      const run2 = await sweepExpiredGifts(mockPrisma as any, now);
      expect(run2.processedCount).toBe(0);
      expect(run2.giftIds).toEqual([]);

      // Third run with later time: still 0
      const run3 = await sweepExpiredGifts(mockPrisma as any, new Date("2026-10-24T13:00:00Z"));
      expect(run3.processedCount).toBe(0);
    });

    it("handles concurrent overlapping executions safely without double-unlocking", async () => {
      const now = new Date("2026-10-24T12:00:00Z");
      const past = new Date("2026-10-24T11:00:00Z");

      const mockPrisma = createMockPrismaForSweep(
        [
          {
            id: "gift-race-1",
            status: "PENDING",
            expiresAt: past,
            inventoryItemId: "item-race-1",
          },
          {
            id: "gift-race-2",
            status: "PENDING",
            expiresAt: past,
            inventoryItemId: "item-race-2",
          },
        ],
        [
          { id: "item-race-1", isLocked: true, lockReason: "PENDING_GIFT" },
          { id: "item-race-2", isLocked: true, lockReason: "PENDING_GIFT" },
        ],
      );

      // Simulate overlapping concurrent executions of sweepExpiredGifts
      const [worker1, worker2] = await Promise.all([
        sweepExpiredGifts(mockPrisma as any, now),
        sweepExpiredGifts(mockPrisma as any, now),
      ]);

      // Total processed across both workers must equal exactly 2 (the total expired gifts)
      const totalProcessed = worker1.processedCount + worker2.processedCount;
      expect(totalProcessed).toBe(2);

      // Items are unlocked exactly once
      expect(mockPrisma._store.items.find((i) => i.id === "item-race-1")?.isLocked).toBe(false);
      expect(mockPrisma._store.items.find((i) => i.id === "item-race-2")?.isLocked).toBe(false);
    });

    it("isolates errors: failure on one gift does not abort remaining batch", async () => {
      const now = new Date("2026-10-24T12:00:00Z");
      const past = new Date("2026-10-24T11:00:00Z");

      const mockPrisma = createMockPrismaForSweep(
        [
          {
            id: "gift-faulty",
            status: "PENDING",
            expiresAt: past,
            inventoryItemId: "item-corrupt", // Item that will trigger an update error
          },
          {
            id: "gift-healthy",
            status: "PENDING",
            expiresAt: past,
            inventoryItemId: "item-healthy",
          },
        ],
        [{ id: "item-healthy", isLocked: true, lockReason: "PENDING_GIFT" }],
      );

      // Item-corrupt is missing from items store, so its update throws
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await sweepExpiredGifts(mockPrisma as any, now);

      // Healthy gift still succeeds
      expect(result.processedCount).toBe(1);
      expect(result.giftIds).toEqual(["gift-healthy"]);
      expect(mockPrisma._store.items.find((i) => i.id === "item-healthy")?.isLocked).toBe(false);

      consoleErrorSpy.mockRestore();
    });
  });

  // ─── 2. cleanupExpiredAuth Service ───────────────────────────────────────

  describe("cleanupExpiredAuth Service", () => {
    function createMockPrismaForCleanup(initialNonces: any[], initialSessions: any[]) {
      const store = {
        nonces: [...initialNonces],
        sessions: [...initialSessions],
      };

      return {
        siweNonce: {
          deleteMany: vi.fn(async ({ where }: any) => {
            const beforeCount = store.nonces.length;
            store.nonces = store.nonces.filter((n) => {
              if (where.expiresAt?.lt && n.expiresAt < where.expiresAt.lt) {
                return false; // delete
              }
              return true; // keep
            });
            return { count: beforeCount - store.nonces.length };
          }),
        },
        authSession: {
          deleteMany: vi.fn(async ({ where }: any) => {
            const beforeCount = store.sessions.length;
            store.sessions = store.sessions.filter((s) => {
              if (where.expiresAt?.lt && where.revokedAt === null) {
                if (s.expiresAt < where.expiresAt.lt && s.revokedAt === null) {
                  return false; // delete
                }
              }
              return true; // keep
            });
            return { count: beforeCount - store.sessions.length };
          }),
        },
        _store: store,
      };
    }

    it("deletes only expired nonces and expired unrevoked sessions", async () => {
      const now = new Date("2026-10-24T12:00:00Z");
      const past = new Date("2026-10-24T11:00:00Z");
      const future = new Date("2026-10-24T13:00:00Z");

      const mockPrisma = createMockPrismaForCleanup(
        [
          { id: "nonce-expired-1", nonce: "n1", expiresAt: past },
          { id: "nonce-expired-2", nonce: "n2", expiresAt: past },
          { id: "nonce-active", nonce: "n3", expiresAt: future },
        ],
        [
          { id: "sess-expired-1", token: "t1", expiresAt: past, revokedAt: null },
          { id: "sess-active", token: "t2", expiresAt: future, revokedAt: null },
          { id: "sess-revoked", token: "t3", expiresAt: past, revokedAt: new Date("2026-10-24T10:00:00Z") },
        ],
      );

      const result = await cleanupExpiredAuth(mockPrisma as any, now);

      expect(result.deletedNonces).toBe(2);
      expect(result.deletedSessions).toBe(1);

      // Verify preservation of active and revoked records
      expect(mockPrisma._store.nonces).toHaveLength(1);
      expect(mockPrisma._store.nonces[0].id).toBe("nonce-active");

      expect(mockPrisma._store.sessions).toHaveLength(2);
      expect(mockPrisma._store.sessions.map((s) => s.id).sort()).toEqual(
        ["sess-active", "sess-revoked"].sort(),
      );
    });

    it("is strictly idempotent: repeated cleanups delete 0 additional records", async () => {
      const now = new Date("2026-10-24T12:00:00Z");
      const past = new Date("2026-10-24T11:00:00Z");

      const mockPrisma = createMockPrismaForCleanup(
        [{ id: "n1", expiresAt: past }],
        [{ id: "s1", expiresAt: past, revokedAt: null }],
      );

      const firstRun = await cleanupExpiredAuth(mockPrisma as any, now);
      expect(firstRun.deletedNonces).toBe(1);
      expect(firstRun.deletedSessions).toBe(1);

      const secondRun = await cleanupExpiredAuth(mockPrisma as any, now);
      expect(secondRun.deletedNonces).toBe(0);
      expect(secondRun.deletedSessions).toBe(0);
    });

    it("runs concurrently in parallel without conflicts", async () => {
      const now = new Date("2026-10-24T12:00:00Z");
      const past = new Date("2026-10-24T11:00:00Z");

      const mockPrisma = createMockPrismaForCleanup(
        [
          { id: "n1", expiresAt: past },
          { id: "n2", expiresAt: past },
        ],
        [
          { id: "s1", expiresAt: past, revokedAt: null },
          { id: "s2", expiresAt: past, revokedAt: null },
        ],
      );

      const [run1, run2] = await Promise.all([
        cleanupExpiredAuth(mockPrisma as any, now),
        cleanupExpiredAuth(mockPrisma as any, now),
      ]);

      const totalDeletedNonces = run1.deletedNonces + run2.deletedNonces;
      const totalDeletedSessions = run1.deletedSessions + run2.deletedSessions;

      expect(totalDeletedNonces).toBe(2);
      expect(totalDeletedSessions).toBe(2);
    });
  });
});
