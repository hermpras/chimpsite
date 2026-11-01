import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  evaluateUserQualification,
  getUserQualificationStatus,
  REQUIRED_TRAIT_CATEGORIES,
} from "@/server/whitelist/qualification";
import type { PrismaClient } from "@prisma/client";

function createMockPrisma() {
  const store = {
    users: [] as any[],
    programs: [] as any[],
    campaigns: [] as any[],
    campaignVersions: [] as any[],
    campaignTasks: [] as any[],
    taskProgresses: [] as any[],
    evidenceSubmissions: [] as any[],
    inventoryItems: [] as any[],
    traits: [] as any[],
    qualifications: [] as any[],
    queueEntries: [] as any[],
    slots: [] as any[],
    statusHistories: [] as any[],
    auditLogs: [] as any[],
  };

  const hooks = {
    onAuditCreate: null as ((data: any) => Promise<void> | void) | null,
  };

  const tx = {
    user: {
      findUnique: vi.fn(async ({ where }: any) => {
        return store.users.find((u) => u.id === where.id) || null;
      }),
    },
    wLProgram: {
      findUnique: vi.fn(async ({ where }: any) => {
        return store.programs.find((p) => p.id === where.id) || null;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const p = store.programs.find((prog) => prog.id === where.id);
        if (p && data.allocatedSlotsCount?.increment) {
          p.allocatedSlotsCount += data.allocatedSlotsCount.increment;
        }
        return p;
      }),
    },
    inventoryItem: {
      findMany: vi.fn(async ({ where }: any) => {
        return store.inventoryItems
          .filter((i) => i.ownerId === where.ownerId)
          .map((i) => ({
            ...i,
            trait: store.traits.find((t) => t.id === i.traitId),
          }));
      }),
    },
    promoCampaign: {
      findMany: vi.fn(async ({ where }: any) => {
        return store.campaigns
          .filter((c) => {
            if (c.wlProgramId !== where.wlProgramId) return false;
            if (where.status && c.status !== where.status) return false;
            return true;
          })
          .map((c) => ({
            ...c,
            versions: store.campaignVersions
              .filter((v) => v.campaignId === c.id && v.isCurrent)
              .map((v) => ({
                ...v,
                tasks: store.campaignTasks.filter(
                  (t) => t.versionId === v.id && t.isRequired,
                ),
              })),
          }));
      }),
    },
    taskProgress: {
      findUnique: vi.fn(async ({ where }: any) => {
        const key = where.userId_versionId_taskId;
        const progress = store.taskProgresses.find(
          (tp) =>
            tp.userId === key.userId &&
            tp.versionId === key.versionId &&
            tp.taskId === key.taskId,
        );
        if (!progress) return null;
        const evidenceSubmissions = store.evidenceSubmissions.filter(
          (e) => e.taskProgressId === progress.id && e.status === "APPROVED",
        );
        return { ...progress, evidenceSubmissions };
      }),
    },
    wLSlot: {
      findFirst: vi.fn(async ({ where }: any) => {
        return (
          store.slots.find((s) => {
            if (where?.programId && s.programId !== where.programId) return false;
            if (where?.userId && s.userId !== where.userId) return false;
            if (where?.status?.in && !where.status.in.includes(s.status)) return false;
            if (where?.status && typeof where.status === "string" && s.status !== where.status) return false;
            return true;
          }) || null
        );
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const key = where.programId_userId;
        return (
          store.slots.find(
            (s) => s.programId === key.programId && s.userId === key.userId,
          ) || null
        );
      }),
      findMany: vi.fn(async ({ where }: any) => {
        return store.slots.filter(
          (s) =>
            s.programId === where.programId &&
            (!where.status?.in || where.status.in.includes(s.status)),
        );
      }),
      count: vi.fn(async ({ where }: any) => {
        return store.slots.filter(
          (s) =>
            s.programId === where.programId &&
            (!where.status?.in || where.status.in.includes(s.status)),
        ).length;
      }),
      create: vi.fn(async ({ data }: any) => {
        if (
          store.slots.some(
            (s) => s.programId === data.programId && s.slotNumber === data.slotNumber,
          )
        ) {
          const err: any = new Error(
            "Unique constraint failed on the fields: (programId, slotNumber)",
          );
          err.code = "P2002";
          err.meta = { target: ["programId", "slotNumber"], modelName: "WLSlot" };
          throw err;
        }
        if (
          store.slots.some(
            (s) => s.programId === data.programId && s.userId === data.userId,
          )
        ) {
          const err: any = new Error(
            "Unique constraint failed on the fields: (programId, userId)",
          );
          err.code = "P2002";
          err.meta = { target: ["programId", "userId"], modelName: "WLSlot" };
          throw err;
        }
        const slot = { id: `slot-${store.slots.length + 1}`, ...data };
        store.slots.push(slot);
        return slot;
      }),
    },
    wLQualification: {
      findUnique: vi.fn(async ({ where }: any) => {
        const key = where.programId_userId;
        return (
          store.qualifications.find(
            (q) => q.programId === key.programId && q.userId === key.userId,
          ) || null
        );
      }),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const key = where.programId_userId;
        let record = store.qualifications.find(
          (q) => q.programId === key.programId && q.userId === key.userId,
        );
        if (record) {
          Object.assign(record, update);
        } else {
          record = { id: `qual-${store.qualifications.length + 1}`, ...create };
          store.qualifications.push(record);
        }
        return record;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const record = store.qualifications.find((q) => q.id === where.id);
        if (record) Object.assign(record, data);
        return record;
      }),
    },
    wLQueueEntry: {
      findUnique: vi.fn(async ({ where }: any) => {
        const key = where.programId_userId;
        return (
          store.queueEntries.find(
            (qe) => qe.programId === key.programId && qe.userId === key.userId,
          ) || null
        );
      }),
      findFirst: vi.fn(async ({ where, orderBy }: any) => {
        let entries = store.queueEntries.filter((qe) => {
          if (where.programId && qe.programId !== where.programId) return false;
          if (where.status && qe.status !== where.status) return false;
          return true;
        });
        if (orderBy) {
          const orderRules = Array.isArray(orderBy) ? orderBy : [orderBy];
          entries.sort((a, b) => {
            for (const rule of orderRules) {
              if (rule.queueNumber) {
                const diff =
                  rule.queueNumber === "desc"
                    ? b.queueNumber - a.queueNumber
                    : a.queueNumber - b.queueNumber;
                if (diff !== 0) return diff;
              }
              if (rule.joinedAt) {
                const diff =
                  rule.joinedAt === "desc"
                    ? b.joinedAt.getTime() - a.joinedAt.getTime()
                    : a.joinedAt.getTime() - b.joinedAt.getTime();
                if (diff !== 0) return diff;
              }
            }
            return 0;
          });
        }
        return entries[0] || null;
      }),
      findMany: vi.fn(async ({ where, orderBy, take }: any) => {
        let entries = store.queueEntries.filter(
          (qe) => qe.programId === where.programId && qe.status === where.status,
        );
        if (orderBy) {
          entries.sort((a, b) => {
            if (a.joinedAt.getTime() !== b.joinedAt.getTime()) {
              return a.joinedAt.getTime() - b.joinedAt.getTime();
            }
            return a.queueNumber - b.queueNumber;
          });
        }
        if (take) {
          entries = entries.slice(0, take);
        }
        return entries;
      }),
      count: vi.fn(async ({ where }: any) => {
        return store.queueEntries.filter((qe) => {
          if (qe.programId !== where.programId || qe.status !== where.status)
            return false;
          if (where.OR) {
            const cond1 =
              where.OR[0]?.joinedAt?.lt && qe.joinedAt < where.OR[0].joinedAt.lt;
            const cond2 =
              where.OR[1]?.AND &&
              qe.joinedAt.getTime() === where.OR[1].AND[0].joinedAt.getTime() &&
              qe.queueNumber < where.OR[1].AND[1].queueNumber.lt;
            return cond1 || cond2;
          }
          return true;
        }).length;
      }),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const key = where.programId_userId;
        let record = store.queueEntries.find(
          (qe) => qe.programId === key.programId && qe.userId === key.userId,
        );
        if (record) {
          if (
            update.queueNumber &&
            store.queueEntries.some(
              (qe) =>
                qe.id !== record.id &&
                qe.programId === key.programId &&
                qe.queueNumber === update.queueNumber,
            )
          ) {
            const err: any = new Error(
              "Unique constraint failed on the fields: (programId, queueNumber)",
            );
            err.code = "P2002";
            err.meta = {
              target: ["programId", "queueNumber"],
              modelName: "WLQueueEntry",
            };
            throw err;
          }
          Object.assign(record, update);
        } else {
          if (
            store.queueEntries.some(
              (qe) =>
                qe.programId === create.programId &&
                qe.queueNumber === create.queueNumber,
            )
          ) {
            const err: any = new Error(
              "Unique constraint failed on the fields: (programId, queueNumber)",
            );
            err.code = "P2002";
            err.meta = {
              target: ["programId", "queueNumber"],
              modelName: "WLQueueEntry",
            };
            throw err;
          }
          record = { id: `qe-${store.queueEntries.length + 1}`, ...create };
          store.queueEntries.push(record);
        }
        return record;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const qe = store.queueEntries.find((e) => e.id === where.id);
        if (qe) Object.assign(qe, data);
        return qe;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = store.queueEntries.filter(
          (qe) =>
            (!where.id || qe.id === where.id) &&
            (!where.programId || qe.programId === where.programId) &&
            (!where.userId || qe.userId === where.userId) &&
            (!where.status || qe.status === where.status),
        );
        for (const m of matches) {
          Object.assign(m, data);
        }
        return { count: matches.length };
      }),
    },
    wLStatusHistory: {
      create: vi.fn(async ({ data }: any) => {
        const record = { id: `hist-${store.statusHistories.length + 1}`, ...data };
        store.statusHistories.push(record);
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
        return record;
      }),
    },
  };

  const prisma = {
    $transaction: vi.fn(async (cb: (txClient: typeof tx) => any) => {
      const createdSlots: any[] = [];
      const createdHistories: any[] = [];
      const createdAudits: any[] = [];
      const updatedQuals: Array<{ qual: any; prev: any }> = [];
      const updatedQueueEntries: Array<{ qe: any; prev: any }> = [];
      const programDeltas: Array<{ prog: any; delta: number }> = [];

      const txWithTracking: any = {
        ...tx,
        wLSlot: {
          ...tx.wLSlot,
          create: vi.fn(async (args: any) => {
            const res = await tx.wLSlot.create(args);
            createdSlots.push(res);
            return res;
          }),
        },
        wLStatusHistory: {
          ...tx.wLStatusHistory,
          create: vi.fn(async (args: any) => {
            const res = await tx.wLStatusHistory.create(args);
            createdHistories.push(res);
            return res;
          }),
        },
        auditLog: {
          ...tx.auditLog,
          create: vi.fn(async (args: any) => {
            const res = await tx.auditLog.create(args);
            createdAudits.push(res);
            return res;
          }),
        },
        wLProgram: {
          ...tx.wLProgram,
          update: vi.fn(async (args: any) => {
            const p = store.programs.find((prog) => prog.id === args.where.id);
            if (p && args.data.allocatedSlotsCount?.increment) {
              programDeltas.push({
                prog: p,
                delta: args.data.allocatedSlotsCount.increment,
              });
            }
            return tx.wLProgram.update(args);
          }),
        },
        wLQualification: {
          ...tx.wLQualification,
          update: vi.fn(async (args: any) => {
            const q = store.qualifications.find((qual) => qual.id === args.where.id);
            if (q) {
              updatedQuals.push({ qual: q, prev: { ...q } });
            }
            return tx.wLQualification.update(args);
          }),
        },
        wLQueueEntry: {
          ...tx.wLQueueEntry,
          updateMany: vi.fn(async (args: any) => {
            const matches = store.queueEntries.filter(
              (qe) =>
                (!args.where.id || qe.id === args.where.id) &&
                (!args.where.programId || qe.programId === args.where.programId) &&
                (!args.where.userId || qe.userId === args.where.userId) &&
                (!args.where.status || qe.status === args.where.status),
            );
            for (const m of matches) {
              updatedQueueEntries.push({ qe: m, prev: { ...m } });
            }
            return tx.wLQueueEntry.updateMany(args);
          }),
        },
      };

      try {
        return await cb(txWithTracking);
      } catch (err) {
        for (const s of createdSlots) {
          const idx = store.slots.indexOf(s);
          if (idx !== -1) store.slots.splice(idx, 1);
        }
        for (const h of createdHistories) {
          const idx = store.statusHistories.indexOf(h);
          if (idx !== -1) store.statusHistories.splice(idx, 1);
        }
        for (const a of createdAudits) {
          const idx = store.auditLogs.indexOf(a);
          if (idx !== -1) store.auditLogs.splice(idx, 1);
        }
        for (const { qual, prev } of updatedQuals) {
          Object.assign(qual, prev);
        }
        for (const { qe, prev } of updatedQueueEntries) {
          Object.assign(qe, prev);
        }
        for (const { prog, delta } of programDeltas) {
          prog.allocatedSlotsCount -= delta;
        }
        throw err;
      }
    }),
    ...tx,
  } as unknown as PrismaClient & { _store: typeof store; _hooks: typeof hooks };

  (prisma as any)._store = store;
  (prisma as any)._hooks = hooks;
  return prisma as unknown as PrismaClient & {
    _store: typeof store;
    _hooks: typeof hooks;
  };
}

describe("Whitelist Lifecycle & Qualification Engine", () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  const baseTime = new Date("2026-10-16T10:00:00.000Z");

  beforeEach(() => {
    mockPrisma = createMockPrisma();

    // WL Program with capacity of 2 slots
    mockPrisma._store.programs.push({
      id: "program-1",
      slug: "genesis-wl",
      name: "ChimpHood Genesis Whitelist",
      totalSlots: 2,
      allocatedSlotsCount: 0,
      status: "OPEN",
    });

    // Mandatory Campaign and Task
    mockPrisma._store.campaigns.push({
      id: "camp-1",
      slug: "social-quest",
      wlProgramId: "program-1",
      status: "ACTIVE",
    });

    mockPrisma._store.campaignVersions.push({
      id: "cv-1",
      campaignId: "camp-1",
      versionNumber: 1,
      isCurrent: true,
    });

    mockPrisma._store.campaignTasks.push({
      id: "task-follow",
      versionId: "cv-1",
      taskCode: "FOLLOW_X",
      title: "Follow @ChimpHood on X",
      isRequired: true,
    });

    // Traits for 5 categories
    mockPrisma._store.traits.push(
      { id: "t-bg", category: "BG", name: "Jungle" },
      { id: "t-fur", category: "FUR", name: "Gold" },
      { id: "t-clothing", category: "CLOTHING", name: "Hoodie" },
      { id: "t-headwear", category: "HEADWEAR", name: "Cap" },
      { id: "t-eyewear", category: "EYEWEAR", name: "Goggles" },
    );
  });

  function setupFullQualifiedUser(userId: string) {
    mockPrisma._store.users.push({
      id: userId,
      wallet: { address: `0x${userId}00000000000000000000000000000000` },
      xIdentity: { xId: `xid-${userId}`, username: `user_${userId}` },
      banRecords: [],
    });

    // Give user all 5 trait categories
    for (const trait of mockPrisma._store.traits) {
      mockPrisma._store.inventoryItems.push({
        id: `inv-${userId}-${trait.id}`,
        ownerId: userId,
        traitId: trait.id,
        edition: 1,
        isLocked: false,
      });
    }

    // Complete mandatory task
    mockPrisma._store.taskProgresses.push({
      id: `tp-${userId}`,
      userId,
      versionId: "cv-1",
      taskId: "task-follow",
      status: "VERIFIED",
    });
  }

  it("rejects qualification when any of the 5 trait categories is missing", async () => {
    mockPrisma._store.users.push({
      id: "user-partial",
      wallet: { address: "0x1234..." },
      xIdentity: { xId: "x123", username: "partial" },
      banRecords: [],
    });

    // Has only 3 categories: BG, FUR, CLOTHING (missing HEADWEAR, EYEWEAR)
    mockPrisma._store.inventoryItems.push(
      { id: "i1", ownerId: "user-partial", traitId: "t-bg", edition: 1 },
      { id: "i2", ownerId: "user-partial", traitId: "t-fur", edition: 1 },
      { id: "i3", ownerId: "user-partial", traitId: "t-clothing", edition: 1 },
    );

    const result = await evaluateUserQualification(mockPrisma, {
      userId: "user-partial",
      programId: "program-1",
      now: baseTime,
    });

    expect(result.qualified).toBe(false);
    expect(result.phase).toBe("NONE");
    expect(result.details.missingCategories).toEqual(["HEADWEAR", "EYEWEAR"]);
    expect(result.missingRequirements.some((r) => r.includes("HEADWEAR, EYEWEAR"))).toBe(
      true,
    );
  });

  it("rejects qualification when user has no linked X account", async () => {
    mockPrisma._store.users.push({
      id: "user-no-x",
      wallet: { address: "0x9999..." },
      xIdentity: null, // Missing X
      banRecords: [],
    });

    const result = await evaluateUserQualification(mockPrisma, {
      userId: "user-no-x",
      programId: "program-1",
      now: baseTime,
    });

    expect(result.qualified).toBe(false);
    expect(result.details.hasLinkedX).toBe(false);
    expect(result.missingRequirements).toContain("Linked X (Twitter) account required.");
  });

  it("prevents draft campaigns from receiving qualifications or imposing requirements", async () => {
    // Add a second campaign in DRAFT status with an incomplete mandatory task
    mockPrisma._store.campaigns.push({
      id: "camp-draft",
      slug: "draft-quest",
      wlProgramId: "program-1",
      status: "DRAFT",
    });

    mockPrisma._store.campaignVersions.push({
      id: "cv-draft",
      campaignId: "camp-draft",
      versionNumber: 1,
      isCurrent: true,
    });

    mockPrisma._store.campaignTasks.push({
      id: "task-draft-incomplete",
      versionId: "cv-draft",
      taskCode: "DRAFT_TASK",
      title: "Draft Unreleased Task",
      isRequired: true,
    });

    // Alice meets all requirements for the ACTIVE campaign, but has not done the DRAFT task
    setupFullQualifiedUser("alice-draft-test");

    const result = await evaluateUserQualification(mockPrisma, {
      userId: "alice-draft-test",
      programId: "program-1",
      now: baseTime,
    });

    // DRAFT campaign tasks must be ignored; user qualifies based solely on ACTIVE campaigns
    expect(result.qualified).toBe(true);
    expect(result.phase).toBe("SLOT_ALLOCATED");
    expect(
      result.missingRequirements.some((r) => r.includes("Draft Unreleased Task")),
    ).toBe(false);
  });

  it("rejects evaluation when whitelist program is not in OPEN status", async () => {
    setupFullQualifiedUser("user-prog-status");

    // Program in UPCOMING status
    mockPrisma._store.programs[0].status = "UPCOMING";

    await expect(
      evaluateUserQualification(mockPrisma, {
        userId: "user-prog-status",
        programId: "program-1",
        now: baseTime,
      }),
    ).rejects.toThrow("Whitelist program is not open (current status: UPCOMING).");

    // Program in PAUSED status
    mockPrisma._store.programs[0].status = "PAUSED";

    await expect(
      evaluateUserQualification(mockPrisma, {
        userId: "user-prog-status",
        programId: "program-1",
        now: baseTime,
      }),
    ).rejects.toThrow("Whitelist program is not open (current status: PAUSED).");

    // Restore to OPEN
    mockPrisma._store.programs[0].status = "OPEN";
  });

  it("getUserQualificationStatus performs read-only status checks without mutating slots, queue, qualifications, or histories", async () => {
    setupFullQualifiedUser("read-only-user");

    const initialSlotsCount = mockPrisma._store.slots.length;
    const initialQueueCount = mockPrisma._store.queueEntries.length;
    const initialQualCount = mockPrisma._store.qualifications.length;
    const initialHistoryCount = mockPrisma._store.statusHistories.length;

    const status = await getUserQualificationStatus(mockPrisma, {
      userId: "read-only-user",
      programId: "program-1",
      now: baseTime,
    });

    expect(status.qualified).toBe(true);
    expect(status.details.hasVerifiedWallet).toBe(true);
    expect(status.details.hasLinkedX).toBe(true);
    expect(status.details.heldCategories).toHaveLength(5);

    // Assert that absolutely NO writes / mutations occurred
    expect(mockPrisma._store.slots.length).toBe(initialSlotsCount);
    expect(mockPrisma._store.queueEntries.length).toBe(initialQueueCount);
    expect(mockPrisma._store.qualifications.length).toBe(initialQualCount);
    expect(mockPrisma._store.statusHistories.length).toBe(initialHistoryCount);
  });

  it("allocates slot directly when program capacity is available (first-qualified-first-allocated)", async () => {
    setupFullQualifiedUser("alice");

    const result = await evaluateUserQualification(mockPrisma, {
      userId: "alice",
      programId: "program-1",
      now: baseTime,
    });

    expect(result.qualified).toBe(true);
    expect(result.phase).toBe("SLOT_ALLOCATED");
    expect(result.slotNumber).toBe(1);

    const prog = mockPrisma._store.programs.find((p) => p.id === "program-1");
    expect(prog?.allocatedSlotsCount).toBe(1);

    // Second qualified user gets slot #2
    setupFullQualifiedUser("bob");
    const result2 = await evaluateUserQualification(mockPrisma, {
      userId: "bob",
      programId: "program-1",
      now: new Date("2026-10-16T10:05:00.000Z"),
    });

    expect(result2.phase).toBe("SLOT_ALLOCATED");
    expect(result2.slotNumber).toBe(2);
    expect(prog?.allocatedSlotsCount).toBe(2);
  });

  it("places qualified user into queue when capacity is fully exhausted", async () => {
    // Fill both slots with Alice and Bob
    setupFullQualifiedUser("alice");
    await evaluateUserQualification(mockPrisma, {
      userId: "alice",
      programId: "program-1",
      now: baseTime,
    });

    setupFullQualifiedUser("bob");
    await evaluateUserQualification(mockPrisma, {
      userId: "bob",
      programId: "program-1",
      now: new Date("2026-10-16T10:05:00.000Z"),
    });

    // Third qualified user (Charlie) arrives when capacity is full (2/2)
    setupFullQualifiedUser("charlie");
    const charlieTime = new Date("2026-10-16T10:10:00.000Z");
    const result3 = await evaluateUserQualification(mockPrisma, {
      userId: "charlie",
      programId: "program-1",
      now: charlieTime,
    });

    expect(result3.qualified).toBe(true);
    expect(result3.phase).toBe("IN_QUEUE");
    expect(result3.queueNumber).toBe(1);
    expect(result3.queueRank).toBe(1);
    expect(result3.qualifiedAt?.toISOString()).toBe(charlieTime.toISOString());

    // Fourth user (David) gets queueNumber 2, queueRank 2
    setupFullQualifiedUser("david");
    const result4 = await evaluateUserQualification(mockPrisma, {
      userId: "david",
      programId: "program-1",
      now: new Date("2026-10-16T10:15:00.000Z"),
    });

    expect(result4.phase).toBe("IN_QUEUE");
    expect(result4.queueNumber).toBe(2);
    expect(result4.queueRank).toBe(2);
  });

  it("updates qualification timestamp to new time if user re-qualifies after previous rejection", async () => {
    setupFullQualifiedUser("eve");
    // Initially disqualified
    mockPrisma._store.qualifications.push({
      programId: "program-1",
      userId: "eve",
      status: "DISQUALIFIED",
      qualifiedAt: new Date("2026-10-10T00:00:00.000Z"),
    });

    const newQualTime = new Date("2026-10-16T12:00:00.000Z");
    const result = await evaluateUserQualification(mockPrisma, {
      userId: "eve",
      programId: "program-1",
      now: newQualTime,
    });

    expect(result.qualified).toBe(true);
    expect(result.qualifiedAt?.toISOString()).toBe(newQualTime.toISOString());
  });


  it("handles concurrent qualification: two users competing for the last slot safely allocates one slot and queues the other", async () => {
    // 1 of 2 slots occupied by alice
    setupFullQualifiedUser("alice");
    await evaluateUserQualification(mockPrisma, {
      userId: "alice",
      programId: "program-1",
      now: baseTime,
    });

    // Bob and Charlie both qualify concurrently for the remaining 1 slot
    setupFullQualifiedUser("bob");
    setupFullQualifiedUser("charlie");

    const [resBob, resCharlie] = await Promise.all([
      evaluateUserQualification(mockPrisma, {
        userId: "bob",
        programId: "program-1",
        now: new Date("2026-10-16T10:05:00.000Z"),
      }),
      evaluateUserQualification(mockPrisma, {
        userId: "charlie",
        programId: "program-1",
        now: new Date("2026-10-16T10:05:00.000Z"),
      }),
    ]);

    const results = [resBob, resCharlie];
    const allocated = results.filter((r) => r.phase === "SLOT_ALLOCATED");
    const queued = results.filter((r) => r.phase === "IN_QUEUE");

    // Exactly one user receives the slot, the other is placed in the queue
    expect(allocated).toHaveLength(1);
    expect(allocated[0].slotNumber).toBe(2);

    expect(queued).toHaveLength(1);
    expect(queued[0].queueNumber).toBe(1);
    expect(queued[0].queueRank).toBe(1);

    // Total slots in program exactly equal to capacity 2 (no over-allocation)
    const activeSlots = mockPrisma._store.slots.filter(
      (s) => s.programId === "program-1" && ["ALLOCATED", "CONFIRMED"].includes(s.status),
    );
    expect(activeSlots).toHaveLength(2);

    const prog = mockPrisma._store.programs.find((p) => p.id === "program-1");
    expect(prog?.allocatedSlotsCount).toBe(2);
  });

  it("handles concurrent qualification: multiple users entering queue concurrently receive strictly unique, sequential queue numbers", async () => {
    // Fill capacity completely (2 of 2)
    setupFullQualifiedUser("alice");
    await evaluateUserQualification(mockPrisma, {
      userId: "alice",
      programId: "program-1",
      now: baseTime,
    });

    setupFullQualifiedUser("bob");
    await evaluateUserQualification(mockPrisma, {
      userId: "bob",
      programId: "program-1",
      now: new Date("2026-10-16T10:01:00.000Z"),
    });

    // Charlie, David, and Eve qualify concurrently when queue is empty
    setupFullQualifiedUser("charlie");
    setupFullQualifiedUser("david");
    setupFullQualifiedUser("eve");

    const compTime = new Date("2026-10-16T10:10:00.000Z");
    const [resC, resD, resE] = await Promise.all([
      evaluateUserQualification(mockPrisma, {
        userId: "charlie",
        programId: "program-1",
        now: compTime,
      }),
      evaluateUserQualification(mockPrisma, {
        userId: "david",
        programId: "program-1",
        now: compTime,
      }),
      evaluateUserQualification(mockPrisma, {
        userId: "eve",
        programId: "program-1",
        now: compTime,
      }),
    ]);

    expect(resC.phase).toBe("IN_QUEUE");
    expect(resD.phase).toBe("IN_QUEUE");
    expect(resE.phase).toBe("IN_QUEUE");

    const assignedQueueNumbers = [
      resC.queueNumber,
      resD.queueNumber,
      resE.queueNumber,
    ].sort((a, b) => (a ?? 0) - (b ?? 0));

    // Queue numbers must be strictly unique and sequential: 1, 2, 3
    expect(assignedQueueNumbers).toEqual([1, 2, 3]);

    const queueEntries = mockPrisma._store.queueEntries.filter(
      (qe) => qe.programId === "program-1" && qe.status === "WAITING",
    );
    expect(queueEntries).toHaveLength(3);
    const storedQueueNumbers = queueEntries
      .map((qe) => qe.queueNumber)
      .sort((a, b) => a - b);
    expect(storedQueueNumbers).toEqual([1, 2, 3]);
  });


  it("does not retry unrelated unique constraint violations", async () => {
    setupFullQualifiedUser("unrelated-user");

    let createCallCount = 0;
    (mockPrisma.wLSlot as any).create = vi.fn(async () => {
      createCallCount++;
      const err: any = new Error("Unique constraint failed on field: (email)");
      err.code = "P2002";
      err.meta = { target: ["email"], modelName: "User" };
      throw err;
    });

    await expect(
      evaluateUserQualification(mockPrisma, {
        userId: "unrelated-user",
        programId: "program-1",
        now: baseTime,
      }),
    ).rejects.toThrow("Unique constraint failed on field: (email)");

    // Must fail immediately on first attempt without retrying
    expect(createCallCount).toBe(1);
  });

  it("preserves existing behavior for users who hold an ALLOCATED or CONFIRMED slot even if they later fail requirements", async () => {
    // User was previously allocated slot 1
    mockPrisma._store.users.push({
      id: "dave",
      wallet: { address: "0xdave..." },
      xIdentity: { xId: "xdave", username: "dave" },
      banRecords: [
        {
          id: "ban-1",
          userId: "dave",
          isActive: true,
          scope: "FULL_SYSTEM",
        },
      ],
    });

    mockPrisma._store.slots.push({
      id: "slot-dave",
      programId: "program-1",
      userId: "dave",
      slotNumber: 1,
      status: "ALLOCATED",
      allocatedAt: new Date("2026-10-15T00:00:00.000Z"),
    });

    // Dave now has 0 inventory items and an active ban
    const result = await evaluateUserQualification(mockPrisma, {
      userId: "dave",
      programId: "program-1",
      now: baseTime,
    });

    // Established product rule: allocated slots are not auto-revoked by the qualification engine
    expect(result.qualified).toBe(true);
    expect(result.phase).toBe("SLOT_ALLOCATED");
    expect(result.slotNumber).toBe(1);
    expect(result.missingRequirements).toEqual([]);
    expect(result.details.isBanned).toBe(true);

    // Slot record in store remains ALLOCATED
    const storedSlot = mockPrisma._store.slots.find((s) => s.userId === "dave");
    expect(storedSlot?.status).toBe("ALLOCATED");
  });

  describe("Audit Log Verification", () => {
    it("records WL_SLOT_ALLOCATED when user qualifies directly into a slot", async () => {
      setupFullQualifiedUser("audit-user-1");

      const res = await evaluateUserQualification(mockPrisma, {
        userId: "audit-user-1",
        programId: "program-1",
        now: baseTime,
      });

      expect(res.phase).toBe("SLOT_ALLOCATED");
      const log = mockPrisma._store.auditLogs.find(
        (l: any) => l.action === "WL_SLOT_ALLOCATED" && l.actorId === "audit-user-1",
      );
      expect(log).toBeDefined();
      expect(log.entityType).toBe("WLSlot");
      expect(log.newValues.slotNumber).toBe(res.slotNumber);
    });

    it("records WL_DISQUALIFIED when previously qualified user fails requirements", async () => {
      // User is currently QUALIFIED
      mockPrisma._store.users.push({
        id: "audit-user-2",
        wallet: { address: "0xqual..." },
        xIdentity: null, // missing X
        banRecords: [],
      });
      mockPrisma._store.qualifications.push({
        id: "qual-audit-2",
        programId: "program-1",
        userId: "audit-user-2",
        status: "QUALIFIED",
        qualifiedAt: baseTime,
      });

      await evaluateUserQualification(mockPrisma, {
        userId: "audit-user-2",
        programId: "program-1",
        now: new Date(baseTime.getTime() + 1000),
      });

      const log = mockPrisma._store.auditLogs.find(
        (l: any) => l.action === "WL_DISQUALIFIED" && l.actorId === "audit-user-2",
      );
      expect(log).toBeDefined();
      expect(log.entityType).toBe("WLQualification");
      expect(log.entityId).toBe("qual-audit-2");
      expect(log.newValues.status).toBe("DISQUALIFIED");
    });

    it("rolls back slot allocation and status history when audit log creation fails during direct qualification", async () => {
      setupFullQualifiedUser("audit-rollback-user");

      mockPrisma._hooks.onAuditCreate = (data: any) => {
        if (data.action === "WL_SLOT_ALLOCATED") {
          throw new Error("Audit log database failure");
        }
      };

      await expect(
        evaluateUserQualification(mockPrisma, {
          userId: "audit-rollback-user",
          programId: "program-1",
          now: baseTime,
          maxRetries: 0,
        }),
      ).rejects.toThrow("Audit log database failure");

      const slot = mockPrisma._store.slots.find(
        (s) => s.userId === "audit-rollback-user",
      );
      expect(slot).toBeUndefined();
      const prog = mockPrisma._store.programs.find((p) => p.id === "program-1")!;
      expect(prog.allocatedSlotsCount).toBe(0);
      expect(
        mockPrisma._store.statusHistories.find((h) => h.userId === "audit-rollback-user"),
      ).toBeUndefined();
      expect(
        mockPrisma._store.auditLogs.find((l) => l.actorId === "audit-rollback-user"),
      ).toBeUndefined();

      mockPrisma._hooks.onAuditCreate = null;
    });

    it("rolls back disqualification when audit log creation fails", async () => {
      mockPrisma._store.users.push({
        id: "audit-user-disqual-fail",
        wallet: { address: "0xdisqual..." },
        xIdentity: null,
        banRecords: [],
      });
      mockPrisma._store.qualifications.push({
        id: "qual-disqual-fail",
        programId: "program-1",
        userId: "audit-user-disqual-fail",
        status: "QUALIFIED",
        qualifiedAt: baseTime,
      });

      mockPrisma._hooks.onAuditCreate = (data: any) => {
        if (data.action === "WL_DISQUALIFIED") {
          throw new Error("Audit log database failure");
        }
      };

      await expect(
        evaluateUserQualification(mockPrisma, {
          userId: "audit-user-disqual-fail",
          programId: "program-1",
          now: new Date(baseTime.getTime() + 1000),
          maxRetries: 0,
        }),
      ).rejects.toThrow("Audit log database failure");

      const qual = mockPrisma._store.qualifications.find(
        (q) => q.id === "qual-disqual-fail",
      );
      expect(qual?.status).toBe("QUALIFIED");

      mockPrisma._hooks.onAuditCreate = null;
    });

    it("enforces DEC-022 full disqualification and prevents auto-restoration for revoked participants", async () => {
      // Setup fully qualified user (wallet, X, 5 traits, mandatory tasks)
      setupFullQualifiedUser("revoked-user-charlie");

      // Mark qualification as REVOKED
      mockPrisma._store.qualifications.push({
        id: "qual-revoked-charlie",
        programId: "program-1",
        userId: "revoked-user-charlie",
        status: "REVOKED",
        reason: "Sybil detection multi-accounting",
        disqualifiedAt: baseTime,
      });

      // 1. Read-only evaluation must return qualified: false and phase: REVOKED
      const roResult = await evaluateUserQualification(mockPrisma, {
        userId: "revoked-user-charlie",
        programId: "program-1",
        readOnly: true,
        now: baseTime,
      });

      expect(roResult.qualified).toBe(false);
      expect(roResult.phase).toBe("REVOKED");
      expect(roResult.missingRequirements).toContain(
        "Whitelist qualification revoked: Sybil detection multi-accounting",
      );

      // 2. Write evaluation (attempting to qualify/claim) must NOT auto-restore
      const writeResult = await evaluateUserQualification(mockPrisma, {
        userId: "revoked-user-charlie",
        programId: "program-1",
        now: new Date(baseTime.getTime() + 5000),
      });

      expect(writeResult.qualified).toBe(false);
      expect(writeResult.phase).toBe("REVOKED");

      // Verify no slot was allocated
      const slot = mockPrisma._store.slots.find(
        (s) => s.userId === "revoked-user-charlie",
      );
      expect(slot).toBeUndefined();

      // Verify status remains REVOKED and was not auto-restored to QUALIFIED
      const qual = mockPrisma._store.qualifications.find(
        (q) => q.userId === "revoked-user-charlie",
      );
      expect(qual?.status).toBe("REVOKED");
    });
  });
});
