import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  revokeWlSlot,
  validateRevokeWlSlotInput,
  WlSlotRevokeError,
} from "@/server/whitelist/revoke";
import { claimDrop } from "@/server/drops/claim";
import { getUserQualificationStatus } from "@/server/whitelist/qualification";
import type { PrismaClient } from "@prisma/client";

function createMockPrisma() {
  const store = {
    users: [] as any[],
    adminRoles: [] as any[],
    authSessions: [] as any[],
    auditLogs: [] as any[],
    wlSlots: [] as any[],
    wlQualifications: [] as any[],
    wlQueueEntries: [] as any[],
    wlPrograms: [] as any[],
    wlStatusHistories: [] as any[],
    drops: [] as any[],
    periods: [] as any[],
    poolItems: [] as any[],
    claims: [] as any[],
    inventoryItems: [] as any[],
    traits: [] as any[],
  };

  const hooks = {
    onAuditCreate: null as ((data: any) => Promise<void> | void) | null,
  };

  const createTxClient = () => {
    const uncommittedAuditLogs: any[] = [];
    const uncommittedStatusHistories: any[] = [];
    const slotSnapshots: Array<{ id: string; status: string; notes: string | null }> = [];
    const programSnapshots: Array<{ id: string; allocatedSlotsCount: number }> = [];
    const qualSnapshots: Array<{
      id: string;
      status: string;
      disqualifiedAt: Date | null;
      reason: string | null;
    }> = [];

    const rollback = () => {
      for (const audit of uncommittedAuditLogs) {
        const idx = store.auditLogs.indexOf(audit);
        if (idx !== -1) store.auditLogs.splice(idx, 1);
      }
      for (const hist of uncommittedStatusHistories) {
        const idx = store.wlStatusHistories.indexOf(hist);
        if (idx !== -1) store.wlStatusHistories.splice(idx, 1);
      }
      for (const snap of slotSnapshots) {
        const s = store.wlSlots.find((slot) => slot.id === snap.id);
        if (s) {
          s.status = snap.status;
          s.notes = snap.notes;
        }
      }
      for (const snap of programSnapshots) {
        const p = store.wlPrograms.find((prog) => prog.id === snap.id);
        if (p) p.allocatedSlotsCount = snap.allocatedSlotsCount;
      }
      for (const snap of qualSnapshots) {
        const q = store.wlQualifications.find((qual) => qual.id === snap.id);
        if (q) {
          q.status = snap.status;
          q.disqualifiedAt = snap.disqualifiedAt;
          q.reason = snap.reason;
        }
      }
    };

    const tx: any = {
      wLSlot: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.id) {
            const slot = store.wlSlots.find((s) => s.id === where.id);
            if (!slot) return null;
            const program = store.wlPrograms.find((p) => p.id === slot.programId);
            return { ...slot, program };
          }
          if (where.programId_userId) {
            const slot = store.wlSlots.find(
              (s) =>
                s.programId === where.programId_userId.programId &&
                s.userId === where.programId_userId.userId,
            );
            if (!slot) return null;
            const program = store.wlPrograms.find((p) => p.id === slot.programId);
            return { ...slot, program };
          }
          if (where.programId_slotNumber) {
            const slot = store.wlSlots.find(
              (s) =>
                s.programId === where.programId_slotNumber.programId &&
                s.slotNumber === where.programId_slotNumber.slotNumber,
            );
            if (!slot) return null;
            const program = store.wlPrograms.find((p) => p.id === slot.programId);
            return { ...slot, program };
          }
          return null;
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.wlSlots.find((s) => {
              if (s.userId !== where.userId) return false;
              if (where.status?.in && !where.status.in.includes(s.status)) return false;
              return true;
            }) || null
          );
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const s of store.wlSlots) {
            if (s.id === where.id && (!where.status?.in || where.status.in.includes(s.status))) {
              slotSnapshots.push({ id: s.id, status: s.status, notes: s.notes });
              s.status = data.status;
              if (data.notes !== undefined) s.notes = data.notes;
              count++;
            }
          }
          return { count };
        }),
      },
      wLProgram: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.wlPrograms.find((p) => p.id === where.id) || null;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const p = store.wlPrograms.find((prog) => prog.id === where.id);
          if (p) {
            programSnapshots.push({ id: p.id, allocatedSlotsCount: p.allocatedSlotsCount });
            if (data.allocatedSlotsCount?.decrement) {
              p.allocatedSlotsCount = Math.max(
                0,
                p.allocatedSlotsCount - data.allocatedSlotsCount.decrement,
              );
            }
          }
          return p;
        }),
      },
      wLQualification: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.programId_userId) {
            return (
              store.wlQualifications.find(
                (q) =>
                  q.programId === where.programId_userId.programId &&
                  q.userId === where.programId_userId.userId,
              ) || null
            );
          }
          return store.wlQualifications.find((q) => q.id === where.id) || null;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const q = store.wlQualifications.find((qual) => qual.id === where.id);
          if (q) {
            qualSnapshots.push({
              id: q.id,
              status: q.status,
              disqualifiedAt: q.disqualifiedAt,
              reason: q.reason,
            });
            Object.assign(q, data);
          }
          return q;
        }),
      },
      wLStatusHistory: {
        create: vi.fn(async ({ data }: any) => {
          const record = { id: `hist-${store.wlStatusHistories.length + 1}`, ...data };
          store.wlStatusHistories.push(record);
          uncommittedStatusHistories.push(record);
          return record;
        }),
      },
      auditLog: {
        create: vi.fn(async ({ data }: any) => {
          if (hooks.onAuditCreate) {
            await hooks.onAuditCreate(data);
          }
          const record = { id: `audit-${store.auditLogs.length + 1}`, ...data };
          store.auditLogs.push(record);
          uncommittedAuditLogs.push(record);
          return record;
        }),
      },
      banRecord: {
        findFirst: vi.fn(async () => null),
      },
      // For claimDrop integration tests
      dropPeriod: {
        findUnique: vi.fn(async ({ where }: any) => {
          const period = store.periods.find((p) => p.id === where.id);
          if (!period) return null;
          const drop = store.drops.find((d) => d.id === period.dropId);
          return { ...period, drop };
        }),
      },
      dropPoolItem: {
        findMany: vi.fn(async ({ where }: any) => {
          return store.poolItems
            .filter((i) => i.periodId === where.periodId && i.remainingStock > 0)
            .map((item) => ({
              ...item,
              trait: store.traits.find((t) => t.id === item.traitId),
            }));
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          const item = store.poolItems.find(
            (i) => i.id === where.id && i.remainingStock >= (where.remainingStock?.gte ?? 0),
          );
          if (item) {
            if (data.claimedStock?.increment) item.claimedStock += data.claimedStock.increment;
            if (data.remainingStock?.decrement) item.remainingStock -= data.remainingStock.decrement;
            return { count: 1 };
          }
          return { count: 0 };
        }),
      },
      claim: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }: any) => {
          const record = { id: `claim-${store.claims.length + 1}`, ...data };
          store.claims.push(record);
          return record;
        }),
      },
      inventoryItem: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: any) => {
          const record = { id: `inv-${store.inventoryItems.length + 1}`, ...data };
          store.inventoryItems.push(record);
          return record;
        }),
        findMany: vi.fn(async ({ where }: any) => {
          return store.inventoryItems
            .filter((i) => i.ownerId === where.ownerId)
            .map((item) => ({
              ...item,
              trait: store.traits.find((t) => t.id === item.traitId),
            }));
        }),
      },
      user: {
        findUnique: vi.fn(async ({ where }: any) => {
          const u = store.users.find((user) => user.id === where.id);
          if (!u) return null;
          return { ...u, banRecords: [] };
        }),
      },
      promoCampaign: {
        findMany: vi.fn(async () => []),
      },
      wLQueueEntry: {
        findUnique: vi.fn(async () => null),
      },
    };

    return { tx, rollback };
  };

  const prisma: any = {
    _store: store,
    _hooks: hooks,
    $transaction: vi.fn(async (callback: any) => {
      const { tx, rollback } = createTxClient();
      try {
        return await callback(tx);
      } catch (err) {
        rollback();
        throw err;
      }
    }),
  };

  return prisma;
}

describe("Whitelist Slot Revoke Service (revokeWlSlot)", () => {
  let mockPrisma: any;
  const now = new Date("2026-10-17T12:00:00Z");

  beforeEach(() => {
    mockPrisma = createMockPrisma();

    // WL Program with capacity 10, 2 allocated
    mockPrisma._store.wlPrograms.push({
      id: "prog-1",
      slug: "main-wl",
      name: "ChimpHood Main Whitelist",
      totalSlots: 10,
      allocatedSlotsCount: 2,
      status: "OPEN",
    });

    // Users
    mockPrisma._store.users.push(
      { id: "admin-1", role: "ADMIN" },
      { id: "user-1", role: "USER", wallet: { address: "0xuser1" } },
      { id: "user-2", role: "USER", wallet: { address: "0xuser2" } },
    );

    // Slots
    mockPrisma._store.wlSlots.push(
      {
        id: "slot-1",
        programId: "prog-1",
        userId: "user-1",
        slotNumber: 1,
        status: "ALLOCATED",
        allocatedAt: new Date("2026-10-16T10:00:00Z"),
        allocatedBy: "QUALIFICATION_ENGINE",
        notes: null,
      },
      {
        id: "slot-2",
        programId: "prog-1",
        userId: "user-2",
        slotNumber: 2,
        status: "CONFIRMED",
        allocatedAt: new Date("2026-10-16T10:05:00Z"),
        confirmedAt: new Date("2026-10-16T11:00:00Z"),
        allocatedBy: "QUALIFICATION_ENGINE",
        notes: null,
      },
    );

    // Qualifications
    mockPrisma._store.wlQualifications.push(
      {
        id: "qual-1",
        programId: "prog-1",
        userId: "user-1",
        status: "QUALIFIED",
        qualifiedAt: new Date("2026-10-16T09:59:00Z"),
        disqualifiedAt: null,
        reason: null,
      },
      {
        id: "qual-2",
        programId: "prog-1",
        userId: "user-2",
        status: "QUALIFIED",
        qualifiedAt: new Date("2026-10-16T10:04:00Z"),
        disqualifiedAt: null,
        reason: null,
      },
    );
  });

  describe("Input Validation", () => {
    it("rejects missing or empty adminUserId with 401 UNAUTHORIZED", () => {
      expect(() =>
        validateRevokeWlSlotInput({
          slotId: "slot-1",
          adminUserId: "",
        }),
      ).toThrowError(WlSlotRevokeError);

      expect(() =>
        validateRevokeWlSlotInput({
          slotId: "slot-1",
          adminUserId: "   ",
        }),
      ).toThrowError(/Admin authentication is required/);
    });

    it("rejects input without any slot identifier with 400 INVALID_INPUT", () => {
      expect(() =>
        validateRevokeWlSlotInput({
          adminUserId: "admin-1",
        }),
      ).toThrowError(/valid slotId or \(programId with userId or slotNumber\) is required/);

      expect(() =>
        validateRevokeWlSlotInput({
          slotId: "",
          adminUserId: "admin-1",
        }),
      ).toThrowError(/valid slotId or \(programId with userId or slotNumber\) is required/);
    });

    it("rejects invalid non-string reason", () => {
      expect(() =>
        validateRevokeWlSlotInput({
          slotId: "slot-1",
          adminUserId: "admin-1",
          reason: 12345 as any,
        }),
      ).toThrowError(/Reason must be a string/);
    });

    it("normalizes and accepts valid slot identifiers and optional reason", () => {
      const res = validateRevokeWlSlotInput({
        slotId: "  slot-1  ",
        adminUserId: "  admin-1  ",
        reason: "  Sybil wallet identified  ",
      });
      expect(res.slotId).toBe("slot-1");
      expect(res.adminUserId).toBe("admin-1");
      expect(res.reason).toBe("Sybil wallet identified");
    });
  });

  describe("Successful Revocation by Different Identifiers", () => {
    it("successfully revokes an ALLOCATED slot by slotId", async () => {
      const result = await revokeWlSlot(mockPrisma, {
        slotId: "slot-1",
        adminUserId: "admin-1",
        reason: "Violated terms of service",
        now,
        ipAddress: "192.168.1.1",
        userAgent: "ChimpAdmin/1.0",
      });

      expect(result.success).toBe(true);
      expect(result.slotId).toBe("slot-1");
      expect(result.programId).toBe("prog-1");
      expect(result.userId).toBe("user-1");
      expect(result.slotNumber).toBe(1);
      expect(result.previousStatus).toBe("ALLOCATED");
      expect(result.status).toBe("REVOKED_MANUAL_ADMIN");
      expect(result.revokedAt).toEqual(now);
      expect(result.reason).toBe("Violated terms of service");
      expect(result.auditLogId).toBeDefined();

      // Verify slot in store
      const slot = mockPrisma._store.wlSlots.find((s: any) => s.id === "slot-1");
      expect(slot?.status).toBe("REVOKED_MANUAL_ADMIN");
      expect(slot?.notes).toBe("Violated terms of service");

      // Verify program allocatedSlotsCount decremented from 2 to 1
      const program = mockPrisma._store.wlPrograms.find((p: any) => p.id === "prog-1");
      expect(program?.allocatedSlotsCount).toBe(1);

      // Verify WLQualification updated to REVOKED
      const qual = mockPrisma._store.wlQualifications.find((q: any) => q.id === "qual-1");
      expect(qual?.status).toBe("REVOKED");
      expect(qual?.disqualifiedAt).toEqual(now);
      expect(qual?.reason).toBe("Violated terms of service");

      // Verify WLStatusHistory created
      const hist = mockPrisma._store.wlStatusHistories.find(
        (h: any) => h.action === "SLOT_REVOKED_MANUAL_ADMIN" && h.userId === "user-1",
      );
      expect(hist).toBeDefined();
      expect(hist.fromPhase).toBe("SLOT_ALLOCATED");
      expect(hist.toPhase).toBe("REVOKED");
      expect(hist.actorId).toBe("admin-1");
      expect(hist.metadata.slotId).toBe("slot-1");
      expect(hist.metadata.slotNumber).toBe(1);

      // Verify AuditLog persisted
      const audit = mockPrisma._store.auditLogs.find(
        (a: any) => a.action === "REVOKE_WL_SLOT" && a.entityId === "slot-1",
      );
      expect(audit).toBeDefined();
      expect(audit.actorId).toBe("admin-1");
      expect(audit.actorIp).toBe("192.168.1.1");
      expect(audit.userAgent).toBe("ChimpAdmin/1.0");
      expect(audit.entityType).toBe("WLSlot");
      expect(audit.oldValues.status).toBe("ALLOCATED");
      expect(audit.newValues.status).toBe("REVOKED_MANUAL_ADMIN");
      expect(audit.metadata.targetUserId).toBe("user-1");
    });

    it("successfully revokes a CONFIRMED slot by programId + userId", async () => {
      const result = await revokeWlSlot(mockPrisma, {
        programId: "prog-1",
        userId: "user-2",
        adminUserId: "admin-1",
        reason: "Multi-accounting evidence confirmed",
        now,
      });

      expect(result.success).toBe(true);
      expect(result.slotId).toBe("slot-2");
      expect(result.previousStatus).toBe("CONFIRMED");
      expect(result.status).toBe("REVOKED_MANUAL_ADMIN");

      const slot = mockPrisma._store.wlSlots.find((s: any) => s.id === "slot-2");
      expect(slot?.status).toBe("REVOKED_MANUAL_ADMIN");
    });

    it("successfully revokes a slot by programId + slotNumber", async () => {
      const result = await revokeWlSlot(mockPrisma, {
        programId: "prog-1",
        slotNumber: 1,
        adminUserId: "admin-1",
        now,
      });

      expect(result.success).toBe(true);
      expect(result.slotId).toBe("slot-1");
      expect(result.status).toBe("REVOKED_MANUAL_ADMIN");
    });
  });

  describe("Error Handling & Edge Cases", () => {
    it("returns 404 when target slot does not exist", async () => {
      await expect(
        revokeWlSlot(mockPrisma, {
          slotId: "non-existent-slot",
          adminUserId: "admin-1",
        }),
      ).rejects.toThrow("Whitelist slot was not found.");
    });

    it("returns 409 when attempting to revoke an already revoked slot", async () => {
      // First revocation
      await revokeWlSlot(mockPrisma, {
        slotId: "slot-1",
        adminUserId: "admin-1",
        reason: "First revoke",
        now,
      });

      // Second revocation attempt
      await expect(
        revokeWlSlot(mockPrisma, {
          slotId: "slot-1",
          adminUserId: "admin-1",
          reason: "Second revoke attempt",
          now: new Date(now.getTime() + 1000),
        }),
      ).rejects.toThrow("Whitelist slot is already revoked.");
    });

    it("returns 400 when slot status is invalid or unsupported", async () => {
      mockPrisma._store.wlSlots.push({
        id: "slot-unknown-status",
        programId: "prog-1",
        userId: "user-unknown",
        slotNumber: 99,
        status: "DRAFT_RESERVED" as any,
      });

      await expect(
        revokeWlSlot(mockPrisma, {
          slotId: "slot-unknown-status",
          adminUserId: "admin-1",
        }),
      ).rejects.toThrow(/Whitelist slot cannot be revoked from status/);
    });
  });

  describe("Transactional Consistency & Audit Rollback", () => {
    it("rolls back all mutations if audit log creation fails", async () => {
      // Hook audit create to throw
      mockPrisma._hooks.onAuditCreate = () => {
        throw new Error("Audit log disk write failed");
      };

      await expect(
        revokeWlSlot(mockPrisma, {
          slotId: "slot-1",
          adminUserId: "admin-1",
          reason: "Will fail",
          now,
        }),
      ).rejects.toThrow("Audit log disk write failed");

      // Verify complete rollback: slot still ALLOCATED, program count still 2, qual still QUALIFIED
      const slot = mockPrisma._store.wlSlots.find((s: any) => s.id === "slot-1");
      expect(slot?.status).toBe("ALLOCATED");

      const prog = mockPrisma._store.wlPrograms.find((p: any) => p.id === "prog-1");
      expect(prog?.allocatedSlotsCount).toBe(2);

      const qual = mockPrisma._store.wlQualifications.find((q: any) => q.id === "qual-1");
      expect(qual?.status).toBe("QUALIFIED");

      expect(mockPrisma._store.auditLogs).toHaveLength(0);
      expect(mockPrisma._store.wlStatusHistories).toHaveLength(0);
    });
  });

  describe("Data Consistency & Cross-Domain Integrity", () => {
    it("revoked slot holder is no longer treated as SLOT_ALLOCATED in qualification status checks", async () => {
      await revokeWlSlot(mockPrisma, {
        slotId: "slot-1",
        adminUserId: "admin-1",
        reason: "Sybil",
        now,
      });

      const status = await getUserQualificationStatus(mockPrisma, {
        userId: "user-1",
        programId: "prog-1",
        now,
      });

      // User phase must be REVOKED, not SLOT_ALLOCATED
      expect(status.phase).toBe("REVOKED");
      expect(status.slotNumber).toBeUndefined();
    });

    it("revoked slot holder is no longer blocked from claiming drops by WL_HOLDER_CLAIM_PROHIBITED", async () => {
      // Setup active drop period with available pool item
      mockPrisma._store.drops.push({ id: "drop-1", status: "ACTIVE" });
      mockPrisma._store.periods.push({
        id: "period-1",
        dropId: "drop-1",
        status: "ACTIVE",
        startsAt: new Date(now.getTime() - 5 * 60 * 1000),
      });
      mockPrisma._store.traits.push({ id: "trait-1", name: "Jungle BG" });
      mockPrisma._store.poolItems.push({
        id: "pool-item-1",
        periodId: "period-1",
        traitId: "trait-1",
        allocatedStock: 10,
        claimedStock: 0,
        remainingStock: 10,
        weight: 100,
      });

      // Before revoke: user-1 cannot claim drop
      await expect(
        claimDrop(mockPrisma, {
          userId: "user-1",
          dropId: "drop-1",
          periodId: "period-1",
          now,
        }),
      ).rejects.toThrow("Users holding an allocated Whitelist slot cannot claim drops.");

      // Admin revokes slot-1
      await revokeWlSlot(mockPrisma, {
        slotId: "slot-1",
        adminUserId: "admin-1",
        reason: "Slot revoked",
        now,
      });

      // After revoke: claim succeeds (no longer blocked by WL_HOLDER_CLAIM_PROHIBITED)
      const claimResult = await claimDrop(mockPrisma, {
        userId: "user-1",
        dropId: "drop-1",
        periodId: "period-1",
        now: new Date(now.getTime() + 1000),
      });

      expect(claimResult.claim).toBeDefined();
      expect(claimResult.claim.userId).toBe("user-1");
    });
  });
});
