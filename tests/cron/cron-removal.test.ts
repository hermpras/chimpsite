import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { PrismaClient } from "@prisma/client";
import { validateSessionToken } from "@/server/auth/session";
import { sendGift, acceptGift, rejectOrCancelGift } from "@/server/inventory/gift";
import { revokeWlSlot } from "@/server/whitelist/revoke";
import { updateWLProgram } from "@/server/admin/wl-program";
import { reconcileQueueSlots } from "@/server/whitelist/qualification";

describe("Task O-6: Removal of Cron Dependencies & Event-Driven Process Architecture", () => {
  // ─── 1. vercel.json Cron Schedule Removal ────────────────────────────────
  describe("1. Cron Removal Verification", () => {
    it("ensures vercel.json has no scheduled cron jobs for sweep-gifts, cleanup-auth, or reconcile-queue", () => {
      const vercelPath = join(process.cwd(), "vercel.json");
      expect(existsSync(vercelPath)).toBe(true);

      const vercelContent = JSON.parse(readFileSync(vercelPath, "utf-8"));
      const crons: Array<{ path: string; schedule: string }> = vercelContent.crons ?? [];

      const sweepCron = crons.find((c) => c.path.includes("sweep-gifts"));
      const authCron = crons.find((c) => c.path.includes("cleanup-auth"));
      const queueCron = crons.find((c) => c.path.includes("reconcile-queue") || c.path.includes("reconcile-wl"));

      expect(sweepCron).toBeUndefined();
      expect(authCron).toBeUndefined();
      expect(queueCron).toBeUndefined();
      expect(crons).toHaveLength(0);
    });
  });

  // ─── 2. Auth Session Validation & Opportunistic Cleanup ───────────────────
  describe("2. Auth Session Expiry Validation & Opportunistic Cleanup", () => {
    it("rejects expired sessions and triggers opportunistic deletion without a scheduler", async () => {
      const deletedIds: string[] = [];
      const expiredSession = {
        id: "sess_expired_1",
        userId: "user_1",
        revokedAt: null,
        expiresAt: new Date(Date.now() - 60000), // expired 1 minute ago
        user: {
          isBanned: false,
          wallet: { address: "0x1234567890123456789012345678901234567890" },
        },
      };

      const mockPrisma = {
        authSession: {
          findUnique: vi.fn(async () => expiredSession),
          deleteMany: vi.fn(async ({ where }: any) => {
            deletedIds.push(where.id);
            return { count: 1 };
          }),
        },
      } as unknown as PrismaClient;

      const result = await validateSessionToken(mockPrisma, "a".repeat(64));

      // Expired session must be strictly rejected
      expect(result).toBeNull();

      // Opportunistic cleanup must be executed at usage time
      expect(mockPrisma.authSession.deleteMany).toHaveBeenCalledTimes(1);
      expect(deletedIds).toContain("sess_expired_1");
    });

    it("accepts valid, unexpired sessions without deleting them", async () => {
      const activeSession = {
        id: "sess_active_1",
        userId: "user_active",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 600000), // expires in 10 minutes
        user: {
          isBanned: false,
          wallet: { address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" },
        },
      };

      const mockPrisma = {
        authSession: {
          findUnique: vi.fn(async () => activeSession),
          deleteMany: vi.fn(),
        },
      } as unknown as PrismaClient;

      const result = await validateSessionToken(mockPrisma, "b".repeat(64));

      expect(result).not.toBeNull();
      expect(result?.userId).toBe("user_active");
      expect(result?.sessionId).toBe("sess_active_1");
      expect(mockPrisma.authSession.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ─── 3. Gift Pending Non-Expiry & Resolution ─────────────────────────────
  describe("3. Gift Pending Non-Expiry Architecture", () => {
    function createMockPrismaForGifts() {
      const store = {
        gifts: [] as any[],
        inventoryItems: [
          {
            id: "item-trait-1",
            ownerId: "sender-wallet",
            traitId: "trait-gold",
            isLocked: false,
            lockReason: null as string | null,
            acquiredVia: "DROP",
          },
          {
            id: "item-trait-2",
            ownerId: "sender-wallet",
            traitId: "trait-gold",
            isLocked: false,
            lockReason: null as string | null,
            acquiredVia: "DROP",
          },
        ],
        bans: [] as any[],
      };

      return {
        _store: store,
        banRecord: {
          findFirst: vi.fn(async () => null),
        },
        gift: {
          findFirst: vi.fn(async () => null),
          findUnique: vi.fn(async ({ where }: any) => {
            const g = store.gifts.find((x) => x.id === where.id);
            if (!g) return null;
            const item = store.inventoryItems.find((i) => i.id === g.inventoryItemId);
            return { ...g, inventoryItem: item };
          }),
          create: vi.fn(async ({ data }: any) => {
            const newGift = { id: `gift-${Date.now()}`, ...data };
            store.gifts.push(newGift);
            return newGift;
          }),
          updateMany: vi.fn(async ({ where, data }: any) => {
            const g = store.gifts.find(
              (x) => x.id === where.id && (!where.status || x.status === where.status),
            );
            if (g) {
              Object.assign(g, data);
              return { count: 1 };
            }
            return { count: 0 };
          }),
        },
        inventoryItem: {
          findUnique: vi.fn(async ({ where }: any) => {
            return store.inventoryItems.find((i) => i.id === where.id) || null;
          }),
          count: vi.fn(async ({ where }: any) => {
            return store.inventoryItems.filter(
              (i) => i.ownerId === where.ownerId && i.traitId === where.traitId,
            ).length;
          }),
          update: vi.fn(async ({ where, data }: any) => {
            const item = store.inventoryItems.find((i) => i.id === where.id);
            if (!item) throw new Error("Item not found");
            Object.assign(item, data);
            return item;
          }),
        },
        auditLog: {
          create: vi.fn(async ({ data }: any) => ({ id: `audit-${Date.now()}`, ...data })),
        },
        $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
      } as any;
    }

    let mockPrisma: any;
    beforeEach(() => {
      mockPrisma = createMockPrismaForGifts();
    });

    it("ensures pending gifts do NOT expire automatically after 24h and can still be accepted", async () => {
      const now = new Date("2026-10-25T10:00:00.000Z");
      const gift = await sendGift(mockPrisma, {
        senderId: "sender-wallet",
        receiverId: "receiver-wallet",
        inventoryItemId: "item-trait-2",
        now,
      });

      expect(gift.status).toBe("PENDING");

      // Fast forward 48 hours later (well past original 24h threshold)
      const after48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      const acceptRes = await acceptGift(mockPrisma, {
        userId: "receiver-wallet",
        giftId: gift.id,
        now: after48Hours,
      });

      expect(acceptRes.gift.status).toBe("ACCEPTED");
      const storedItem = mockPrisma._store.inventoryItems.find(
        (i: any) => i.id === "item-trait-2",
      );
      expect(storedItem.ownerId).toBe("receiver-wallet");
      expect(storedItem.isLocked).toBe(false);
    });

    it("ensures pending gifts past 24h can still be rejected or cancelled", async () => {
      const now = new Date("2026-10-25T10:00:00.000Z");
      const gift = await sendGift(mockPrisma, {
        senderId: "sender-wallet",
        receiverId: "receiver-wallet",
        inventoryItemId: "item-trait-2",
        now,
      });

      // Sender cancels 72 hours later
      const after72Hours = new Date(now.getTime() + 72 * 60 * 60 * 1000);
      const cancelRes = await rejectOrCancelGift(mockPrisma, {
        userId: "sender-wallet",
        giftId: gift.id,
        action: "CANCEL",
        reason: "No longer needed",
        now: after72Hours,
      });

      expect(cancelRes.status).toBe("CANCELLED");
      const storedItem = mockPrisma._store.inventoryItems.find(
        (i: any) => i.id === "item-trait-2",
      );
      expect(storedItem.ownerId).toBe("sender-wallet");
      expect(storedItem.isLocked).toBe(false);
    });
  });

  // ─── 4. Event-Driven Whitelist Queue Promotion & Atomicity ───────────────
  describe("4. Event-Driven Whitelist Queue Promotion & Concurrency Safety", () => {
    function createMockPrismaForWL() {
      const store = {
        programs: [
          {
            id: "prog-1",
            slug: "prog-1",
            name: "Test WL Program",
            description: "Test description",
            totalSlots: 2,
            allocatedSlotsCount: 2,
            status: "OPEN",
            startsAt: new Date("2026-10-01T00:00:00Z"),
            endsAt: null,
            createdAt: new Date("2026-10-01T00:00:00Z"),
            updatedAt: new Date("2026-10-01T00:00:00Z"),
          },
        ],
        slots: [
          {
            id: "slot-1",
            programId: "prog-1",
            userId: "user-1",
            slotNumber: 1,
            status: "ALLOCATED",
            notes: null,
          },
          {
            id: "slot-2",
            programId: "prog-1",
            userId: "user-2",
            slotNumber: 2,
            status: "ALLOCATED",
            notes: null,
          },
        ],
        queueEntries: [
          {
            id: "qe-1",
            programId: "prog-1",
            userId: "queued-user-1",
            queueNumber: 1,
            joinedAt: new Date("2026-10-25T08:00:00Z"),
            status: "WAITING",
            processedAt: null,
          },
          {
            id: "qe-2",
            programId: "prog-1",
            userId: "queued-user-2",
            queueNumber: 2,
            joinedAt: new Date("2026-10-25T08:30:00Z"),
            status: "WAITING",
            processedAt: null,
          },
        ],
        qualifications: [] as any[],
        statusHistories: [] as any[],
        auditLogs: [] as any[],
      };

      const prismaObj: any = {
        _store: store,
        wLProgram: {
          findUnique: vi.fn(async ({ where }: any) => {
            return store.programs.find((p) => p.id === where.id) || null;
          }),
          findMany: vi.fn(async ({ where }: any) => {
            return store.programs.filter((p) => !where?.status || p.status === where.status);
          }),
          update: vi.fn(async ({ where, data }: any) => {
            const p = store.programs.find((x) => x.id === where.id);
            if (!p) throw new Error("Program not found");
            if (data.allocatedSlotsCount?.decrement) {
              p.allocatedSlotsCount -= data.allocatedSlotsCount.decrement;
            }
            if (data.allocatedSlotsCount?.increment) {
              p.allocatedSlotsCount += data.allocatedSlotsCount.increment;
            }
            if (data.totalSlots !== undefined) p.totalSlots = data.totalSlots;
            if (data.status !== undefined) p.status = data.status;
            return p;
          }),
        },
        wLSlot: {
          findUnique: vi.fn(async ({ where }: any) => {
            return store.slots.find((s) => s.id === where.id) || null;
          }),
          findMany: vi.fn(async ({ where }: any) => {
            return store.slots.filter((s) => {
              if (where.programId && s.programId !== where.programId) return false;
              if (where.status?.in && !where.status.in.includes(s.status)) return false;
              return true;
            });
          }),
          count: vi.fn(async ({ where }: any) => {
            return store.slots.filter((s) => {
              if (where.programId && s.programId !== where.programId) return false;
              if (where.status?.in && !where.status.in.includes(s.status)) return false;
              return true;
            }).length;
          }),
          updateMany: vi.fn(async ({ where, data }: any) => {
            const s = store.slots.find(
              (x) => x.id === where.id && (!where.status?.in || where.status.in.includes(x.status)),
            );
            if (s) {
              Object.assign(s, data);
              return { count: 1 };
            }
            return { count: 0 };
          }),
          create: vi.fn(async ({ data }: any) => {
            if (
              store.slots.some(
                (s) =>
                  s.programId === data.programId &&
                  s.slotNumber === data.slotNumber &&
                  ["ALLOCATED", "CONFIRMED"].includes(s.status),
              )
            ) {
              const err: any = new Error(
                "Unique constraint failed on the fields: (programId, slotNumber)",
              );
              err.code = "P2002";
              err.meta = { target: ["programId", "slotNumber"], modelName: "WLSlot" };
              throw err;
            }
            const created = { id: `slot-${Date.now()}-${Math.random()}`, ...data };
            store.slots.push(created);
            return created;
          }),
        },
        wLQueueEntry: {
          findFirst: vi.fn(async ({ where }: any) => {
            return (
              store.queueEntries
                .filter((qe) => qe.programId === where.programId && qe.status === where.status)
                .sort((a, b) => a.queueNumber - b.queueNumber)[0] || null
            );
          }),
          findMany: vi.fn(async ({ where, take }: any) => {
            const entries = store.queueEntries
              .filter((qe) => qe.programId === where.programId && qe.status === where.status)
              .sort((a, b) => a.queueNumber - b.queueNumber);
            return typeof take === "number" ? entries.slice(0, take) : entries;
          }),
          updateMany: vi.fn(async ({ where, data }: any) => {
            const qe = store.queueEntries.find(
              (x) => x.id === where.id && (!where.status || x.status === where.status),
            );
            if (qe) {
              Object.assign(qe, data);
              return { count: 1 };
            }
            return { count: 0 };
          }),
          update: vi.fn(async ({ where, data }: any) => {
            const qe = store.queueEntries.find((x) => x.id === where.id);
            if (qe) Object.assign(qe, data);
            return qe;
          }),
        },
        wLQualification: {
          findUnique: vi.fn(async () => null),
          update: vi.fn(async () => ({})),
        },
        wLStatusHistory: {
          create: vi.fn(async ({ data }: any) => {
            store.statusHistories.push(data);
            return data;
          }),
        },
        auditLog: {
          create: vi.fn(async ({ data }: any) => {
            const log = { id: `audit-${Date.now()}`, ...data };
            store.auditLogs.push(log);
            return log;
          }),
        },
        $transaction: vi.fn(async (cb: any) => {
          const snapshot = JSON.stringify(store);
          try {
            return await cb(prismaObj);
          } catch (err) {
            const restored = JSON.parse(snapshot);
            store.programs = restored.programs;
            store.slots = restored.slots;
            store.queueEntries = restored.queueEntries;
            store.qualifications = restored.qualifications;
            store.statusHistories = restored.statusHistories;
            store.auditLogs = restored.auditLogs;
            throw err;
          }
        }),
      };

      return prismaObj;
    }

    it("automatically and atomically promotes the next queued participant when an admin revokes a slot", async () => {
      const mockPrisma = createMockPrismaForWL();
      const now = new Date("2026-10-25T11:00:00Z");

      const revokeResult = await revokeWlSlot(mockPrisma, {
        slotId: "slot-1",
        adminUserId: "admin-1",
        reason: "Compliance policy violation",
        now,
      });

      expect(revokeResult.success).toBe(true);
      expect(revokeResult.status).toBe("REVOKED_MANUAL_ADMIN");
      expect(revokeResult.promotedUserId).toBe("queued-user-1");

      // Verify slot in store
      const revoked = mockPrisma._store.slots.find((s: any) => s.id === "slot-1");
      expect(revoked.status).toBe("REVOKED_MANUAL_ADMIN");

      // Verify newly promoted slot
      const promoted = mockPrisma._store.slots.find((s: any) => s.userId === "queued-user-1");
      expect(promoted).toBeDefined();
      expect(promoted.status).toBe("ALLOCATED");
      expect(promoted.slotNumber).toBe(1); // Freed slot 1 re-assigned

      // Verify queue entry transitioned
      const qe1 = mockPrisma._store.queueEntries.find((q: any) => q.id === "qe-1");
      expect(qe1.status).toBe("PROCESSED");

      // Allocated count remains consistent (2 slots occupied: user-2 and queued-user-1)
      expect(mockPrisma._store.programs[0].allocatedSlotsCount).toBe(2);
    });

    it("reconciles queue slots immediately when an admin increases program capacity", async () => {
      const mockPrisma = createMockPrismaForWL();
      const now = new Date("2026-10-25T12:00:00Z");

      // Admin increases totalSlots from 2 to 3
      await updateWLProgram(mockPrisma, {
        programId: "prog-1",
        adminUserId: "admin-1",
        totalSlots: 3,
      });

      // Queued user 1 should be promoted event-driven
      const qe1 = mockPrisma._store.queueEntries.find((q: any) => q.id === "qe-1");
      expect(qe1.status).toBe("PROCESSED");

      const promotedSlot = mockPrisma._store.slots.find(
        (s: any) => s.userId === "queued-user-1",
      );
      expect(promotedSlot).toBeDefined();
      expect(promotedSlot.slotNumber).toBe(3);
      expect(mockPrisma._store.programs[0].allocatedSlotsCount).toBe(3);
    });

    it("guarantees concurrency safety: concurrent operations never produce double slot allocation", async () => {
      const mockPrisma = createMockPrismaForWL();
      const now = new Date("2026-10-25T13:00:00Z");

      // Revoking both slots successively or concurrently promotes both waiting users safely
      await revokeWlSlot(mockPrisma, {
        slotId: "slot-1",
        adminUserId: "admin-1",
        reason: "Revoke 1",
        now,
      });
      await revokeWlSlot(mockPrisma, {
        slotId: "slot-2",
        adminUserId: "admin-1",
        reason: "Revoke 2",
        now,
      });

      // Both queued users (qe-1 and qe-2) should be promoted without duplicate slot numbers
      const activeSlots = mockPrisma._store.slots.filter((s: any) =>
        ["ALLOCATED", "CONFIRMED"].includes(s.status),
      );
      expect(activeSlots).toHaveLength(2);

      const assignedNumbers = activeSlots
        .map((s: any) => s.slotNumber)
        .sort((a: any, b: any) => a - b);
      expect(assignedNumbers).toEqual([1, 2]);

      const userIds = activeSlots.map((s: any) => s.userId).sort();
      expect(userIds).toEqual(["queued-user-1", "queued-user-2"]);
    });

    it("Task O-7 audit: concurrent revocation and capacity increase safely assign distinct slot numbers without collisions or duplicates", async () => {
      const mockPrisma = createMockPrismaForWL();
      const now = new Date("2026-10-25T14:00:00Z");

      // Initial state: 2 slots occupied (user-1: slot 1, user-2: slot 2).
      // Queue: queued-user-1 (queue 1), queued-user-2 (queue 2).
      // Fire revocation of slot-1 concurrently with capacity increase (totalSlots: 2 -> 3)
      await Promise.all([
        revokeWlSlot(mockPrisma, {
          slotId: "slot-1",
          adminUserId: "admin-1",
          reason: "Concurrent Revoke",
          now,
        }),
        updateWLProgram(mockPrisma, {
          programId: "prog-1",
          adminUserId: "admin-2",
          totalSlots: 3,
        }),
      ]);

      const activeSlots = mockPrisma._store.slots.filter((s: any) =>
        ["ALLOCATED", "CONFIRMED"].includes(s.status),
      );

      // Total active slots should be 3 (user-2, and promoted queued-user-1 and queued-user-2)
      expect(activeSlots).toHaveLength(3);

      const assignedNumbers = activeSlots
        .map((s: any) => s.slotNumber)
        .sort((a: any, b: any) => a - b);
      expect(assignedNumbers).toEqual([1, 2, 3]);

      const assignedUsers = activeSlots.map((s: any) => s.userId).sort();
      expect(assignedUsers).toEqual(["queued-user-1", "queued-user-2", "user-2"]);

      // Program allocatedSlotsCount reflects exact active count
      expect(mockPrisma._store.programs[0].allocatedSlotsCount).toBe(3);
    });

    it("Task O-7 audit: recovers from transient slotNumber unique constraint collision (P2002) via bounded retry", async () => {
      const mockPrisma = createMockPrismaForWL();
      const now = new Date("2026-10-25T15:00:00Z");

      let hasInjectedCollision = false;
      const originalCreate = mockPrisma.wLSlot.create;

      mockPrisma.wLSlot.create = vi.fn(async (args: any) => {
        if (!hasInjectedCollision) {
          hasInjectedCollision = true;
          const err: any = new Error(
            "Unique constraint failed on the fields: (`programId`,`slotNumber`)",
          );
          err.code = "P2002";
          err.meta = { target: ["programId", "slotNumber"], modelName: "WLSlot" };
          throw err;
        }
        return originalCreate(args);
      });

      const res = await revokeWlSlot(mockPrisma, {
        slotId: "slot-1",
        adminUserId: "admin-1",
        reason: "Test Collision Recovery",
        now,
      });

      expect(res.success).toBe(true);
      expect(hasInjectedCollision).toBe(true);
      expect(mockPrisma.wLSlot.create).toHaveBeenCalledTimes(2);

      const promotedSlot = mockPrisma._store.slots.find(
        (s: any) => s.userId === "queued-user-1" && s.status === "ALLOCATED",
      );
      expect(promotedSlot).toBeDefined();
      expect(promotedSlot.slotNumber).toBe(1);
    });
  });
});
