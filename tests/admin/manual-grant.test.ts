import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  manualGrantGtdSlot,
  validateManualGrantInput,
  AdminManualGrantError,
} from "@/server/admin/manual-grant";
import {
  POST,
  GET,
  PUT,
  DELETE,
  isRetryableManualGrantConflict,
  isUserIdCollision,
} from "@/app/api/admin/whitelist/slots/manual-grant/route";
import type { PrismaClient } from "@prisma/client";

function createMockPrisma() {
  const store = {
    users: [] as any[],
    adminRoles: [] as any[],
    wlPrograms: [] as any[],
    wlSlots: [] as any[],
    wlQueueEntries: [] as any[],
    wlStatusHistories: [] as any[],
    auditLogs: [] as any[],
    inventoryItems: [] as any[],
    promoCampaigns: [] as any[],
    taskProgresses: [] as any[],
    evidenceSubmissions: [] as any[],
    banRecords: [] as any[],
  };

  const prisma: any = {
    _store: store,
    user: {
      findUnique: vi.fn(async ({ where }: any) => {
        const u = store.users.find((x) => x.id === where.id);
        if (!u) return null;
        return {
          ...u,
          wallet: u.wallet ?? null,
          xIdentity: u.xIdentity ?? null,
          banRecords: store.banRecords.filter((b) => b.userId === u.id),
        };
      }),
    },
    adminRole: {
      findUnique: vi.fn(async ({ where }: any) => {
        return store.adminRoles.find((ar) => ar.userId === where.userId) || null;
      }),
    },
    wLProgram: {
      findUnique: vi.fn(async ({ where }: any) => {
        return store.wlPrograms.find((p) => p.id === where.id) || null;
      }),
      findFirst: vi.fn(async ({ where }: any) => {
        return store.wlPrograms.find((p) => !where?.status || p.status === where.status) || null;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const p = store.wlPrograms.find((x) => x.id === where.id);
        if (!p) throw new Error("Program not found");
        if (data.allocatedSlotsCount?.increment) {
          p.allocatedSlotsCount += data.allocatedSlotsCount.increment;
        }
        if (data.allocatedSlotsCount?.decrement) {
          p.allocatedSlotsCount -= data.allocatedSlotsCount.decrement;
        }
        return p;
      }),
    },
    wLSlot: {
      findFirst: vi.fn(async ({ where, orderBy }: any) => {
        const matches = store.wlSlots.filter((s) => {
          if (where.programId && s.programId !== where.programId) return false;
          if (where.userId && s.userId !== where.userId) return false;
          if (where.slotNumber !== undefined && s.slotNumber !== where.slotNumber) return false;
          if (typeof where.status === "string" && s.status !== where.status) return false;
          if (where.status?.in && !where.status.in.includes(s.status)) return false;
          return true;
        });
        if (orderBy?.slotNumber === "asc") {
          matches.sort((a, b) => a.slotNumber - b.slotNumber);
        }
        return matches[0] || null;
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        return store.wlSlots.find((s) => s.id === where.id) || null;
      }),
      count: vi.fn(async ({ where }: any) => {
        return store.wlSlots.filter((s) => {
          if (where.programId && s.programId !== where.programId) return false;
          if (typeof where.status === "string" && s.status !== where.status) return false;
          if (where.status?.in && !where.status.in.includes(s.status)) return false;
          return true;
        }).length;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const slot = store.wlSlots.find(
          (s) =>
            s.id === where.id &&
            (!where.status ||
              (typeof where.status === "string" && s.status === where.status) ||
              (where.status?.in && where.status.in.includes(s.status))),
        );
        if (slot) {
          Object.assign(slot, data);
          return { count: 1 };
        }
        return { count: 0 };
      }),
    },
    wLQueueEntry: {
      findUnique: vi.fn(async ({ where }: any) => {
        return (
          store.wlQueueEntries.find(
            (qe) =>
              qe.programId === where.programId_userId?.programId &&
              qe.userId === where.programId_userId?.userId,
          ) || null
        );
      }),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => store.wlQueueEntries),
      count: vi.fn(async () => 0),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const qe of store.wlQueueEntries) {
          if (qe.programId === where.programId && qe.userId === where.userId) {
            Object.assign(qe, data);
            count++;
          }
        }
        return { count };
      }),
    },
    wLQualification: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
    taskProgress: {
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
    evidenceSubmission: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
    wLStatusHistory: {
      create: vi.fn(async ({ data }: any) => {
        store.wlStatusHistories.push(data);
        return data;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => {
        const log = { id: `audit_${Date.now()}_${Math.random()}`, ...data };
        store.auditLogs.push(log);
        return log;
      }),
    },
    inventoryItem: {
      findMany: vi.fn(async ({ where }: any) => {
        return store.inventoryItems.filter((i) => i.ownerId === where.ownerId);
      }),
    },
    promoCampaign: {
      findMany: vi.fn(async () => []),
    },
    $transaction: vi.fn(async (cb: any) => {
      const snapshot = JSON.stringify(store);
      try {
        return await cb(prisma);
      } catch (err) {
        const restored = JSON.parse(snapshot);
        store.users = restored.users;
        store.adminRoles = restored.adminRoles;
        store.wlPrograms = restored.wlPrograms;
        store.wlSlots = restored.wlSlots;
        store.wlQueueEntries = restored.wlQueueEntries;
        store.wlStatusHistories = restored.wlStatusHistories;
        store.auditLogs = restored.auditLogs;
        throw err;
      }
    }),
  };

  return prisma;
}

function setupQualifiedCandidate(store: any, userId: string) {
  store.users.push({
    id: userId,
    role: "USER",
    wallet: { address: `0x${userId}1111111111111111111111111111111111` },
    xIdentity: { xId: `x_${userId}`, username: `user_${userId}` },
  });

  const categories = ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"];
  for (const cat of categories) {
    store.inventoryItems.push({
      id: `item_${userId}_${cat}`,
      ownerId: userId,
      trait: { category: cat },
    });
  }

  store.wlQueueEntries.push({
    id: `qe_${userId}`,
    programId: "prog-genesis",
    userId,
    queueNumber: 1,
    status: "WAITING",
    joinedAt: new Date(),
  });
}

describe("Manual GTD Slot Grant Service (server/admin/manual-grant.ts)", () => {
  let mockPrisma: any;
  const now = new Date("2026-10-31T12:00:00Z");

  beforeEach(() => {
    mockPrisma = createMockPrisma();

    // Setup active program with capacity 2, allocated 1 (so 1 available)
    mockPrisma._store.wlPrograms.push({
      id: "prog-genesis",
      slug: "genesis",
      status: "OPEN",
      totalSlots: 2,
      allocatedSlotsCount: 1,
    });

    // Setup 1 active slot (#1) and 1 revoked vacant slot (#2)
    mockPrisma._store.wlSlots.push(
      {
        id: "slot-active-1",
        programId: "prog-genesis",
        slotNumber: 1,
        userId: "user-active-1",
        status: "ALLOCATED",
        reviewStatus: "NOT_REVIEWED",
        notes: null,
      },
      {
        id: "slot-revoked-2",
        programId: "prog-genesis",
        slotNumber: 2,
        userId: "prev-owner-2",
        status: "REVOKED_MANUAL_ADMIN",
        reviewStatus: "NOT_REVIEWED",
        notes: "Previously revoked for policy breach",
      },
    );

    // Setup Admin user
    mockPrisma._store.users.push({
      id: "admin-super",
      role: "SUPER_ADMIN",
    });
    mockPrisma._store.adminRoles.push({
      userId: "admin-super",
      roleType: "SUPER_ADMIN",
      permissions: ["*"],
    });

    // Setup qualified candidate user
    setupQualifiedCandidate(mockPrisma._store, "candidate-1");
  });

  describe("Input Validation", () => {
    it("rejects missing adminUserId with 401 UNAUTHORIZED", async () => {
      await expect(
        manualGrantGtdSlot(mockPrisma, {
          programId: "prog-genesis",
          candidateUserId: "candidate-1",
          adminUserId: "",
        }),
      ).rejects.toMatchObject({
        code: "UNAUTHORIZED",
        status: 401,
      });
    });

    it("rejects missing programId with 400 PROGRAM_ID_REQUIRED", async () => {
      await expect(
        manualGrantGtdSlot(mockPrisma, {
          programId: "",
          candidateUserId: "candidate-1",
          adminUserId: "admin-super",
        }),
      ).rejects.toMatchObject({
        code: "PROGRAM_ID_REQUIRED",
        status: 400,
      });
    });

    it("rejects invalid slotNumber with 400 INVALID_SLOT_NUMBER", async () => {
      await expect(
        manualGrantGtdSlot(mockPrisma, {
          programId: "prog-genesis",
          candidateUserId: "candidate-1",
          adminUserId: "admin-super",
          slotNumber: -5,
        }),
      ).rejects.toMatchObject({
        code: "INVALID_SLOT_NUMBER",
        status: 400,
      });
    });

    it("rejects notes exceeding 2048 characters with 400 NOTES_TOO_LONG", async () => {
      await expect(
        manualGrantGtdSlot(mockPrisma, {
          programId: "prog-genesis",
          candidateUserId: "candidate-1",
          adminUserId: "admin-super",
          notes: "A".repeat(2049),
        }),
      ).rejects.toMatchObject({
        code: "NOTES_TOO_LONG",
        status: 400,
      });
    });
  });

  describe("RBAC & Role Verification", () => {
    it("rejects callers with MODERATOR or USER role with 403 FORBIDDEN", async () => {
      mockPrisma._store.users.push({ id: "mod-user", role: "MODERATOR" });
      mockPrisma._store.adminRoles.push({ userId: "mod-user", roleType: "MODERATOR" });

      await expect(
        manualGrantGtdSlot(mockPrisma, {
          programId: "prog-genesis",
          candidateUserId: "candidate-1",
          adminUserId: "mod-user",
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        status: 403,
      });
    });
  });

  describe("Candidate Eligibility & Capacity Verification", () => {
    it("rejects candidate who already holds an active slot with 409 ALREADY_HOLDS_ACTIVE_SLOT", async () => {
      await expect(
        manualGrantGtdSlot(mockPrisma, {
          programId: "prog-genesis",
          candidateUserId: "user-active-1", // already holds slot #1
          adminUserId: "admin-super",
        }),
      ).rejects.toMatchObject({
        code: "ALREADY_HOLDS_ACTIVE_SLOT",
        status: 409,
      });
    });

    it("rejects under-qualified candidate with 400 CANDIDATE_NOT_QUALIFIED", async () => {
      // Remove clothing trait from candidate
      mockPrisma._store.inventoryItems = mockPrisma._store.inventoryItems.filter(
        (i: any) => i.id !== "item_candidate-1_CLOTHING",
      );

      await expect(
        manualGrantGtdSlot(mockPrisma, {
          programId: "prog-genesis",
          candidateUserId: "candidate-1",
          adminUserId: "admin-super",
        }),
      ).rejects.toMatchObject({
        code: "CANDIDATE_NOT_QUALIFIED",
        status: 400,
      });
    });

    it("rejects if no vacant slots are available (program capacity full)", async () => {
      // Set allocatedSlotsCount to totalSlots (2 of 2 occupied)
      mockPrisma._store.wlPrograms[0].allocatedSlotsCount = 2;

      await expect(
        manualGrantGtdSlot(mockPrisma, {
          programId: "prog-genesis",
          candidateUserId: "candidate-1",
          adminUserId: "admin-super",
        }),
      ).rejects.toMatchObject({
        code: "NO_VACANT_SLOTS_AVAILABLE",
        status: 409,
      });
    });

    it("rejects if specific slotNumber is not revoked or not found", async () => {
      await expect(
        manualGrantGtdSlot(mockPrisma, {
          programId: "prog-genesis",
          candidateUserId: "candidate-1",
          adminUserId: "admin-super",
          slotNumber: 1, // slot #1 is active, not revoked
        }),
      ).rejects.toMatchObject({
        code: "NO_VACANT_SLOTS_AVAILABLE",
        status: 409,
      });
    });
  });

  describe("Successful Execution & Historical Preservation", () => {
    it("successfully reuses revoked vacant slot record and updates state atomically", async () => {
      const result = await manualGrantGtdSlot(mockPrisma, {
        programId: "prog-genesis",
        candidateUserId: "candidate-1",
        adminUserId: "admin-super",
        notes: "Approved by committee",
        now,
      });

      expect(result.success).toBe(true);
      expect(result.slot.slotNumber).toBe(2);
      expect(result.slot.userId).toBe("candidate-1");
      expect(result.slot.status).toBe("ALLOCATED");
      expect(result.slot.reviewStatus).toBe("NOT_REVIEWED");
      expect(result.previousUserId).toBe("prev-owner-2");

      // Verify slot record in store
      const slot = mockPrisma._store.wlSlots.find((s: any) => s.slotNumber === 2);
      expect(slot.userId).toBe("candidate-1");
      expect(slot.status).toBe("ALLOCATED");
      expect(slot.reviewStatus).toBe("NOT_REVIEWED");

      // Verify program counter incremented by 1 (from 1 to 2)
      expect(mockPrisma._store.wlPrograms[0].allocatedSlotsCount).toBe(2);

      // Verify candidate's WLQueueEntry is marked PROCESSED
      const qe = mockPrisma._store.wlQueueEntries.find(
        (q: any) => q.userId === "candidate-1",
      );
      expect(qe.status).toBe("PROCESSED");

      // Verify WLStatusHistory created
      const history = mockPrisma._store.wlStatusHistories.find(
        (h: any) => h.userId === "candidate-1",
      );
      expect(history).toBeDefined();
      expect(history.action).toBe("SLOT_MANUALLY_GRANTED");
      expect(history.metadata.previousUserId).toBe("prev-owner-2");

      // Verify AuditLog created EXACTLY ONCE
      expect(mockPrisma._store.auditLogs).toHaveLength(1);
      const audit = mockPrisma._store.auditLogs[0];
      expect(audit.action).toBe("WL_SLOT_MANUALLY_GRANTED");
      expect(audit.metadata.targetUserId).toBe("candidate-1");
      expect(audit.metadata.previousUserId).toBe("prev-owner-2");
    });

    it("successfully reuses REVOKED_SYSTEM slot record as vacant slot", async () => {
      // Change slot 2 to REVOKED_SYSTEM
      mockPrisma._store.wlSlots[1].status = "REVOKED_SYSTEM";
      mockPrisma._store.wlSlots[1].userId = "system-revoked-user";

      const result = await manualGrantGtdSlot(mockPrisma, {
        programId: "prog-genesis",
        candidateUserId: "candidate-1",
        adminUserId: "admin-super",
        now,
      });

      expect(result.success).toBe(true);
      expect(result.slot.slotNumber).toBe(2);
      expect(result.slot.userId).toBe("candidate-1");
      expect(result.slot.status).toBe("ALLOCATED");
      expect(result.previousUserId).toBe("system-revoked-user");
    });
  });

  describe("Atomicity & Rollback Guarantee", () => {
    it("rolls back all changes if AuditLog creation throws an error", async () => {
      mockPrisma.auditLog.create = vi.fn(async () => {
        throw new Error("Audit log database failure");
      });

      await expect(
        manualGrantGtdSlot(mockPrisma, {
          programId: "prog-genesis",
          candidateUserId: "candidate-1",
          adminUserId: "admin-super",
          now,
        }),
      ).rejects.toThrow("Audit log database failure");

      // Slot remains REVOKED
      const slot = mockPrisma._store.wlSlots.find((s: any) => s.slotNumber === 2);
      expect(slot.status).toBe("REVOKED_MANUAL_ADMIN");
      expect(slot.userId).toBe("prev-owner-2");

      // Counter remains 1 (not incremented)
      expect(mockPrisma._store.wlPrograms[0].allocatedSlotsCount).toBe(1);

      // Queue entry remains WAITING
      const qe = mockPrisma._store.wlQueueEntries.find(
        (q: any) => q.userId === "candidate-1",
      );
      expect(qe.status).toBe("WAITING");

      // No status history created
      expect(mockPrisma._store.wlStatusHistories).toHaveLength(0);
    });
  });

  describe("API Conflict Classification Helpers", () => {
    it("isUserIdCollision returns true for P2002 on userId and false for slotNumber", () => {
      expect(
        isUserIdCollision({ code: "P2002", meta: { target: ["programId", "userId"] } }),
      ).toBe(true);

      expect(
        isUserIdCollision({ code: "P2002", meta: { target: ["programId", "slotNumber"] } }),
      ).toBe(false);
    });

    it("isRetryableManualGrantConflict identifies P2034 and slotNumber collisions as retryable", () => {
      expect(isRetryableManualGrantConflict({ code: "P2034" })).toBe(true);
      expect(isRetryableManualGrantConflict({ code: "40001" })).toBe(true);
      expect(isRetryableManualGrantConflict({ code: "40P01" })).toBe(true);
      expect(
        isRetryableManualGrantConflict({
          code: "P2002",
          meta: { target: ["slotNumber"], modelName: "WLSlot" },
        }),
      ).toBe(true);
      expect(
        isRetryableManualGrantConflict({
          code: "P2002",
          meta: { target: ["queueNumber"], modelName: "WLQueueEntry" },
        }),
      ).toBe(true);
      expect(
        isRetryableManualGrantConflict({
          code: "P2002",
          meta: { target: ["userId"], modelName: "WLSlot" },
        }),
      ).toBe(false); // terminal business conflict
      expect(
        isRetryableManualGrantConflict({
          code: "P2002",
          meta: { target: ["unknown_constraint"] },
        }),
      ).toBe(false); // ambiguous/unknown constraint fails closed
      expect(isRetryableManualGrantConflict(null)).toBe(false);
      expect(isRetryableManualGrantConflict(new Error("generic"))).toBe(false);
    });
  });
});
