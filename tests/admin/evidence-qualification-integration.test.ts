import { describe, it, expect, vi, beforeEach } from "vitest";
import { submitTaskEvidence } from "@/server/tasks/evidence";
import { reviewEvidence } from "@/server/admin/evidence";
import {
  evaluateUserQualification,
  REQUIRED_TRAIT_CATEGORIES,
} from "@/server/whitelist/qualification";
import type { PrismaClient } from "@prisma/client";

function createIntegrationMockPrisma() {
  const store = {
    users: [] as any[],
    wallets: [] as any[],
    xIdentities: [] as any[],
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

  const createTx = () => {
    return {
      user: {
        findUnique: vi.fn(async ({ where }: any) => {
          const user = store.users.find((u) => u.id === where.id);
          if (!user) return null;
          const wallet = store.wallets.find((w) => w.userId === user.id);
          const xIdentity = store.xIdentities.find((x) => x.userId === user.id);
          return {
            ...user,
            wallet,
            xIdentity,
            banRecords: user.banRecords ?? [],
          };
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
      campaignTask: {
        findUnique: vi.fn(async ({ where }: any) => {
          const task = store.campaignTasks.find((t) => t.id === where.id);
          if (!task) return null;
          const version = store.campaignVersions.find((v) => v.id === task.versionId);
          const campaign = version
            ? store.campaigns.find((c) => c.id === version.campaignId)
            : null;
          return {
            ...task,
            version: version
              ? {
                  ...version,
                  campaign,
                }
              : null,
          };
        }),
      },
      taskProgress: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.userId_versionId_taskId) {
            const { userId, versionId, taskId } = where.userId_versionId_taskId;
            const progress = store.taskProgresses.find(
              (tp) =>
                tp.userId === userId &&
                tp.versionId === versionId &&
                tp.taskId === taskId,
            );
            if (!progress) return null;
            const evidenceSubmissions = store.evidenceSubmissions.filter(
              (e) => e.taskProgressId === progress.id && e.status === "APPROVED",
            );
            return { ...progress, evidenceSubmissions };
          }
          if (where.id) {
            const progress = store.taskProgresses.find((tp) => tp.id === where.id);
            if (!progress) return null;
            const evidenceSubmissions = store.evidenceSubmissions.filter(
              (e) => e.taskProgressId === progress.id && e.status === "APPROVED",
            );
            return { ...progress, evidenceSubmissions };
          }
          return null;
        }),
        create: vi.fn(async ({ data }: any) => {
          const newProgress = {
            id: `tp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          store.taskProgresses.push(newProgress);
          return newProgress;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const progress = store.taskProgresses.find((p) => p.id === where.id);
          if (!progress) throw new Error("Progress not found");
          Object.assign(progress, data, { updatedAt: new Date() });
          return progress;
        }),
      },
      evidenceSubmission: {
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.evidenceSubmissions.find((e) => {
              if (where.userId && e.userId !== where.userId) return false;
              if (where.taskId && e.taskId !== where.taskId) return false;
              if (where.status && e.status !== where.status) return false;
              return true;
            }) ?? null
          );
        }),
        findUnique: vi.fn(async ({ where }: any) => {
          const sub = store.evidenceSubmissions.find((e) => e.id === where.id);
          if (!sub) return null;
          const taskProgress = store.taskProgresses.find(
            (p) => p.id === sub.taskProgressId,
          );
          const task = store.campaignTasks.find((t) => t.id === sub.taskId);
          return {
            ...sub,
            taskProgress,
            task,
          };
        }),
        create: vi.fn(async ({ data }: any) => {
          const newEvidence = {
            id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            reviewerId: null,
            reviewerNotes: null,
            reviewedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          store.evidenceSubmissions.push(newEvidence);
          return newEvidence;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const sub = store.evidenceSubmissions.find((e) => e.id === where.id);
          if (!sub) throw new Error("Evidence submission not found");
          Object.assign(sub, data, { updatedAt: new Date() });
          return sub;
        }),
      },
      wLSlot: {
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
          const slot = {
            id: `slot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            allocatedAt: new Date(),
          };
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
        create: vi.fn(async ({ data }: any) => {
          const q = {
            id: `qual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            qualifiedAt: new Date(),
          };
          store.qualifications.push(q);
          return q;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const q = store.qualifications.find((item) => item.id === where.id);
          if (q) Object.assign(q, data);
          return q;
        }),
        upsert: vi.fn(async ({ where, create, update }: any) => {
          let q = store.qualifications.find(
            (item) =>
              item.programId === where.programId_userId.programId &&
              item.userId === where.programId_userId.userId,
          );
          if (q) {
            Object.assign(q, update);
          } else {
            q = {
              id: `qual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              ...create,
            };
            store.qualifications.push(q);
          }
          return q;
        }),
      },
      wLQueueEntry: {
        findUnique: vi.fn(async ({ where }: any) => {
          const key = where.programId_userId;
          return (
            store.queueEntries.find(
              (q) => q.programId === key.programId && q.userId === key.userId,
            ) || null
          );
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.queueEntries.find(
              (q) =>
                (!where.programId || q.programId === where.programId) &&
                (!where.status || q.status === where.status),
            ) || null
          );
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const q of store.queueEntries) {
            if (
              (!where.programId || q.programId === where.programId) &&
              (!where.userId || q.userId === where.userId) &&
              (!where.status || q.status === where.status)
            ) {
              Object.assign(q, data);
              count++;
            }
          }
          return { count };
        }),
        create: vi.fn(async ({ data }: any) => {
          const entry = {
            id: `queue_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            joinedAt: new Date(),
          };
          store.queueEntries.push(entry);
          return entry;
        }),
      },
      wLStatusHistory: {
        create: vi.fn(async ({ data }: any) => {
          const hist = { id: `hist_${Date.now()}`, ...data, createdAt: new Date() };
          store.statusHistories.push(hist);
          return hist;
        }),
      },
      auditLog: {
        create: vi.fn(async ({ data }: any) => {
          const log = { id: `audit_${Date.now()}`, ...data, createdAt: new Date() };
          store.auditLogs.push(log);
          return log;
        }),
      },
    };
  };

  const client: any = {
    $transaction: vi.fn(async (cb: any) => {
      const tx = createTx();
      return await cb(tx);
    }),
  };

  return { store, client };
}

describe("Task 4-D Evidence Review Integration with Whitelist Qualification", () => {
  let mock: ReturnType<typeof createIntegrationMockPrisma>;

  const userId = "candidate_user_1";
  const adminId = "admin_user_1";
  const programId = "wl_genesis_prog";
  const campaignId = "promo_genesis_camp";
  const versionId = "camp_v1";
  const taskId = "mandatory_task_x";

  beforeEach(() => {
    mock = createIntegrationMockPrisma();

    // 1. User with verified wallet and X account
    mock.store.users.push(
      { id: userId, isBanned: false, banRecords: [] },
      { id: adminId, isBanned: false, banRecords: [] },
    );

    mock.store.wallets.push({
      id: "w_1",
      userId,
      address: "0xabcdef1234567890abcdef1234567890abcdef12",
    });

    mock.store.xIdentities.push({
      id: "x_1",
      userId,
      xId: "123456789",
      xHandle: "chimp_enthusiast",
    });

    // 2. All 5 required trait categories held by user
    REQUIRED_TRAIT_CATEGORIES.forEach((cat, index) => {
      const traitId = `trait_${cat.toLowerCase()}`;
      mock.store.traits.push({
        id: traitId,
        category: cat,
        name: `Trait ${cat}`,
      });
      mock.store.inventoryItems.push({
        id: `item_${index}`,
        ownerId: userId,
        traitId,
        isLocked: false,
      });
    });

    // 3. Whitelist program with available slots
    mock.store.programs.push({
      id: programId,
      slug: "genesis",
      name: "Genesis Whitelist",
      status: "OPEN",
      totalSlots: 100,
      allocatedSlotsCount: 0,
    });

    // 4. PromoCampaign with current active version and 1 required task
    mock.store.campaigns.push({
      id: campaignId,
      wlProgramId: programId,
      slug: "genesis-campaign",
      title: "Genesis Campaign",
      status: "ACTIVE",
    });

    mock.store.campaignVersions.push({
      id: versionId,
      campaignId,
      versionNumber: 1,
      isCurrent: true,
      startsAt: new Date("2026-10-01T00:00:00Z"),
      endsAt: new Date("2026-12-31T23:59:59Z"),
    });

    mock.store.campaignTasks.push({
      id: taskId,
      versionId,
      taskCode: "FOLLOW_RETWEET_X",
      title: "Follow & Retweet ChimpHood Announcement",
      taskType: "MANUAL_EVIDENCE",
      points: 50,
      isRequired: true,
      sortOrder: 1,
    });
  });

  it("progresses through evidence submission -> rejection -> resubmission -> approval -> WL qualification", async () => {
    const prisma = mock.client as unknown as PrismaClient;

    // STEP 1: Before any submission, qualification check fails due to incomplete task
    const initialQual = await evaluateUserQualification(prisma, {
      programId,
      userId,
    });
    expect(initialQual.qualified).toBe(false);
    expect(initialQual.missingRequirements).toContain(
      'Incomplete task: "Follow & Retweet ChimpHood Announcement".',
    );

    // STEP 2: Candidate submits evidence for the task (Task 4-C)
    const submitResult = await submitTaskEvidence(prisma, {
      taskId,
      userId,
      submissionType: "URL",
      payload: "https://x.com/chimp_enthusiast/status/9876543210",
    });
    expect(submitResult.success).toBe(true);
    expect(submitResult.submission.status).toBe("PENDING_REVIEW");
    expect(submitResult.taskProgress.status).toBe("SUBMITTED");

    // STEP 3: Qualification check still fails while evidence is PENDING_REVIEW
    const pendingQual = await evaluateUserQualification(prisma, {
      programId,
      userId,
    });
    expect(pendingQual.qualified).toBe(false);
    expect(pendingQual.missingRequirements).toContain(
      'Incomplete task: "Follow & Retweet ChimpHood Announcement".',
    );

    // STEP 4: Admin reviews evidence and REJECTS it (e.g. wrong link) (Task 4-D)
    const rejectResult = await reviewEvidence(prisma, {
      submissionId: submitResult.submission.id,
      adminUserId: adminId,
      status: "REJECTED",
      reviewerNotes: "The link provided does not contain the retweet proof.",
    });
    expect(rejectResult.success).toBe(true);
    expect(rejectResult.submission.status).toBe("REJECTED");
    expect(rejectResult.taskProgress.status).toBe("REJECTED");

    // STEP 5: Qualification check still fails after rejection
    const rejectedQual = await evaluateUserQualification(prisma, {
      programId,
      userId,
    });
    expect(rejectedQual.qualified).toBe(false);
    expect(rejectedQual.missingRequirements).toContain(
      'Incomplete task: "Follow & Retweet ChimpHood Announcement".',
    );

    // STEP 6: User re-submits corrected evidence (Task 4-C allows resubmission when no pending submission)
    const resubmitResult = await submitTaskEvidence(prisma, {
      taskId,
      userId,
      submissionType: "URL",
      payload: "https://x.com/chimp_enthusiast/status/9999999999",
    });
    expect(resubmitResult.success).toBe(true);
    expect(resubmitResult.submission.status).toBe("PENDING_REVIEW");
    expect(resubmitResult.taskProgress.status).toBe("SUBMITTED");

    // STEP 7: Admin reviews and APPROVES the corrected evidence (Task 4-D)
    const approveResult = await reviewEvidence(prisma, {
      submissionId: resubmitResult.submission.id,
      adminUserId: adminId,
      status: "APPROVED",
      reviewerNotes: "Verified retweet and follow on X.",
    });
    expect(approveResult.success).toBe(true);
    expect(approveResult.submission.status).toBe("APPROVED");
    expect(approveResult.taskProgress.status).toBe("VERIFIED");

    // STEP 8: Qualification check now SUCCEEDS! All mandatory requirements satisfied.
    const qualifiedResult = await evaluateUserQualification(prisma, {
      programId,
      userId,
    });
    expect(qualifiedResult.qualified).toBe(true);
    expect(qualifiedResult.phase).toBe("SLOT_ALLOCATED");
    expect(qualifiedResult.slotNumber).toBe(1);
    expect(qualifiedResult.missingRequirements).toEqual([]);

    // Verify program allocated slots incremented to 1
    const program = mock.store.programs.find((p) => p.id === programId);
    expect(program.allocatedSlotsCount).toBe(1);
  });
});
