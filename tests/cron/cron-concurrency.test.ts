import { describe, it, expect, vi } from "vitest";
import { sweepExpiredGifts } from "@/server/inventory/gift";
import { cleanupExpiredAuth } from "@/server/auth/cleanup";
import { reconcileAllOpenPrograms } from "@/server/whitelist/qualification";

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
              if (where.expiresAt?.lt && !(g.expiresAt < where.expiresAt.lt))
                return false;
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
      expect(mockPrisma._store.items.find((i) => i.id === "item-1")?.isLocked).toBe(
        false,
      );
      expect(mockPrisma._store.items.find((i) => i.id === "item-2")?.isLocked).toBe(
        false,
      );
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
      const run3 = await sweepExpiredGifts(
        mockPrisma as any,
        new Date("2026-10-24T13:00:00Z"),
      );
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
      expect(mockPrisma._store.items.find((i) => i.id === "item-race-1")?.isLocked).toBe(
        false,
      );
      expect(mockPrisma._store.items.find((i) => i.id === "item-race-2")?.isLocked).toBe(
        false,
      );
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
      expect(mockPrisma._store.items.find((i) => i.id === "item-healthy")?.isLocked).toBe(
        false,
      );

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
          {
            id: "sess-revoked",
            token: "t3",
            expiresAt: past,
            revokedAt: new Date("2026-10-24T10:00:00Z"),
          },
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

  // ─── 3. reconcileAllOpenPrograms Service (Task O-4) ──────────────────────

  describe("reconcileAllOpenPrograms Service (Task O-4)", () => {
    function createMockPrismaForPrograms(
      initialPrograms: any[],
      initialQueueEntries: any[],
      initialSlots: any[],
    ) {
      const store = {
        programs: JSON.parse(JSON.stringify(initialPrograms)),
        queueEntries: JSON.parse(JSON.stringify(initialQueueEntries)),
        slots: JSON.parse(JSON.stringify(initialSlots)),
        statusHistories: [] as any[],
        auditLogs: [] as any[],
      };

      const mockPrisma: any = {
        wLProgram: {
          findMany: vi.fn(async ({ where }: any) => {
            return store.programs.filter((p: any) => {
              if (where?.status && p.status !== where.status) return false;
              return true;
            });
          }),
        },
        $transaction: vi.fn(async (callback: any) => {
          const tx = {
            wLProgram: {
              findUnique: vi.fn(async ({ where }: any) => {
                return store.programs.find((p: any) => p.id === where.id) || null;
              }),
              update: vi.fn(async ({ where, data }: any) => {
                const p = store.programs.find((prog: any) => prog.id === where.id);
                if (p && data.allocatedSlotsCount?.increment) {
                  p.allocatedSlotsCount += data.allocatedSlotsCount.increment;
                }
                return p;
              }),
            },
            wLSlot: {
              count: vi.fn(async ({ where }: any) => {
                return store.slots.filter(
                  (s: any) =>
                    s.programId === where.programId && where.status.in.includes(s.status),
                ).length;
              }),
              findMany: vi.fn(async ({ where }: any) => {
                return store.slots.filter(
                  (s: any) =>
                    s.programId === where.programId && where.status.in.includes(s.status),
                );
              }),
              create: vi.fn(async ({ data }: any) => {
                const newSlot = { id: `slot-${store.slots.length + 1}`, ...data };
                store.slots.push(newSlot);
                return newSlot;
              }),
            },
            wLQueueEntry: {
              findMany: vi.fn(async ({ where, take }: any) => {
                const waiting = store.queueEntries.filter(
                  (e: any) =>
                    e.programId === where.programId && e.status === where.status,
                );
                waiting.sort((a: any, b: any) => {
                  const timeDiff =
                    new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
                  if (timeDiff !== 0) return timeDiff;
                  return a.queueNumber - b.queueNumber;
                });
                return take ? waiting.slice(0, take) : waiting;
              }),
              updateMany: vi.fn(async ({ where, data }: any) => {
                const target = store.queueEntries.find(
                  (e: any) => e.id === where.id && e.status === where.status,
                );
                if (target) {
                  Object.assign(target, data);
                  return { count: 1 };
                }
                return { count: 0 };
              }),
              update: vi.fn(async ({ where, data }: any) => {
                const target = store.queueEntries.find((e: any) => e.id === where.id);
                if (target) {
                  Object.assign(target, data);
                  return target;
                }
                throw new Error("Queue entry not found");
              }),
            },
            wLStatusHistory: {
              create: vi.fn(async ({ data }: any) => {
                store.statusHistories.push(data);
                return data;
              }),
            },
            auditLog: {
              create: vi.fn(async ({ data }: any) => {
                store.auditLogs.push(data);
                return data;
              }),
            },
          };
          return callback(tx);
        }),
        _store: store,
      };

      return mockPrisma;
    }

    it("reconciles waiting queue entries across multiple OPEN programs and ignores non-open programs", async () => {
      const now = new Date("2026-10-25T10:00:00Z");
      const mockPrisma = createMockPrismaForPrograms(
        [
          { id: "prog-open-1", status: "OPEN", totalSlots: 2, allocatedSlotsCount: 1 },
          { id: "prog-open-2", status: "OPEN", totalSlots: 3, allocatedSlotsCount: 1 },
          { id: "prog-closed", status: "CLOSED", totalSlots: 5, allocatedSlotsCount: 0 },
        ],
        [
          // Prog 1 queue
          {
            id: "qe-1",
            programId: "prog-open-1",
            userId: "u1",
            queueNumber: 1,
            joinedAt: new Date("2026-10-25T08:00:00Z"),
            status: "WAITING",
          },
          {
            id: "qe-2",
            programId: "prog-open-1",
            userId: "u2",
            queueNumber: 2,
            joinedAt: new Date("2026-10-25T09:00:00Z"),
            status: "WAITING",
          },
          // Prog 2 queue
          {
            id: "qe-3",
            programId: "prog-open-2",
            userId: "u3",
            queueNumber: 1,
            joinedAt: new Date("2026-10-25T08:30:00Z"),
            status: "WAITING",
          },
          // Prog closed queue
          {
            id: "qe-4",
            programId: "prog-closed",
            userId: "u4",
            queueNumber: 1,
            joinedAt: new Date("2026-10-25T08:00:00Z"),
            status: "WAITING",
          },
        ],
        [
          {
            id: "slot-init-1",
            programId: "prog-open-1",
            userId: "u0",
            slotNumber: 1,
            status: "ALLOCATED",
          },
          {
            id: "slot-init-2",
            programId: "prog-open-2",
            userId: "u00",
            slotNumber: 1,
            status: "ALLOCATED",
          },
        ],
      );

      const result = await reconcileAllOpenPrograms(mockPrisma as any, now);

      expect(result.processedPrograms).toBe(2);
      expect(result.totalSlotsFilled).toBe(2); // 1 in prog-1 (hit capacity 2), 1 in prog-2
      expect(result.results).toEqual([
        { programId: "prog-open-1", slotsFilled: 1, openSlotsRemaining: 0 },
        { programId: "prog-open-2", slotsFilled: 1, openSlotsRemaining: 1 },
      ]);

      // Prog-1: u1 received slot 2, u2 remains WAITING
      expect(
        mockPrisma._store.slots.find(
          (s: any) => s.programId === "prog-open-1" && s.userId === "u1",
        ),
      ).toBeDefined();
      expect(
        mockPrisma._store.queueEntries.find((e: any) => e.id === "qe-1")?.status,
      ).toBe("PROCESSED");
      expect(
        mockPrisma._store.queueEntries.find((e: any) => e.id === "qe-2")?.status,
      ).toBe("WAITING");

      // Prog-2: u3 received slot 2
      expect(
        mockPrisma._store.slots.find(
          (s: any) => s.programId === "prog-open-2" && s.userId === "u3",
        ),
      ).toBeDefined();
      expect(
        mockPrisma._store.queueEntries.find((e: any) => e.id === "qe-3")?.status,
      ).toBe("PROCESSED");

      // Prog-closed: not touched
      expect(
        mockPrisma._store.queueEntries.find((e: any) => e.id === "qe-4")?.status,
      ).toBe("WAITING");
    });

    it("is strictly idempotent: repeated executions fill 0 additional slots", async () => {
      const now = new Date("2026-10-25T10:00:00Z");
      const mockPrisma = createMockPrismaForPrograms(
        [
          {
            id: "prog-idempotent",
            status: "OPEN",
            totalSlots: 2,
            allocatedSlotsCount: 1,
          },
        ],
        [
          {
            id: "qe-idemp",
            programId: "prog-idempotent",
            userId: "u-idemp",
            queueNumber: 1,
            joinedAt: new Date("2026-10-25T08:00:00Z"),
            status: "WAITING",
          },
        ],
        [
          {
            id: "slot-idemp-1",
            programId: "prog-idempotent",
            userId: "u-initial",
            slotNumber: 1,
            status: "ALLOCATED",
          },
        ],
      );

      // Run 1: fills 1 slot
      const run1 = await reconcileAllOpenPrograms(mockPrisma as any, now);
      expect(run1.totalSlotsFilled).toBe(1);
      expect(run1.results[0].openSlotsRemaining).toBe(0);

      // Run 2: immediately after, clean no-op
      const run2 = await reconcileAllOpenPrograms(mockPrisma as any, now);
      expect(run2.totalSlotsFilled).toBe(0);
      expect(run2.results[0].openSlotsRemaining).toBe(0);

      // Total slots allocated remains exactly 2
      expect(mockPrisma._store.slots).toHaveLength(2);
      expect(mockPrisma._store.programs[0].allocatedSlotsCount).toBe(2);
    });

    it("handles zero open programs or empty queues cleanly", async () => {
      const now = new Date("2026-10-25T10:00:00Z");
      // Case A: No open programs
      const mockPrismaEmpty = createMockPrismaForPrograms([], [], []);
      const resEmpty = await reconcileAllOpenPrograms(mockPrismaEmpty as any, now);
      expect(resEmpty.processedPrograms).toBe(0);
      expect(resEmpty.totalSlotsFilled).toBe(0);
      expect(resEmpty.results).toEqual([]);

      // Case B: Open program but queue is empty
      const mockPrismaNoQueue = createMockPrismaForPrograms(
        [{ id: "prog-no-q", status: "OPEN", totalSlots: 5, allocatedSlotsCount: 0 }],
        [],
        [],
      );
      const resNoQueue = await reconcileAllOpenPrograms(mockPrismaNoQueue as any, now);
      expect(resNoQueue.processedPrograms).toBe(1);
      expect(resNoQueue.totalSlotsFilled).toBe(0);
      expect(resNoQueue.results[0].openSlotsRemaining).toBe(5);
    });

    it("runs concurrently without exceeding total slot capacity", async () => {
      const now = new Date("2026-10-25T10:00:00Z");
      const mockPrisma = createMockPrismaForPrograms(
        [
          {
            id: "prog-concurrent",
            status: "OPEN",
            totalSlots: 2,
            allocatedSlotsCount: 1,
          },
        ],
        [
          {
            id: "qe-c1",
            programId: "prog-concurrent",
            userId: "u-c1",
            queueNumber: 1,
            joinedAt: new Date("2026-10-25T08:00:00Z"),
            status: "WAITING",
          },
          {
            id: "qe-c2",
            programId: "prog-concurrent",
            userId: "u-c2",
            queueNumber: 2,
            joinedAt: new Date("2026-10-25T08:05:00Z"),
            status: "WAITING",
          },
        ],
        [
          {
            id: "slot-init",
            programId: "prog-concurrent",
            userId: "u-first",
            slotNumber: 1,
            status: "ALLOCATED",
          },
        ],
      );

      // Launch 2 parallel reconciliations
      const [res1, res2] = await Promise.all([
        reconcileAllOpenPrograms(mockPrisma as any, now),
        reconcileAllOpenPrograms(mockPrisma as any, now),
      ]);

      const totalFilled = res1.totalSlotsFilled + res2.totalSlotsFilled;
      expect(totalFilled).toBe(1); // exactly 1 slot available, exactly 1 slot filled
      expect(mockPrisma._store.slots).toHaveLength(2); // total capacity 2 respected
    });
  });
});
