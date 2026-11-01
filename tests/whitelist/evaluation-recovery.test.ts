import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  evaluateUserQualification,
  triggerAutomaticEligibilityEvaluation,
  retryEvaluationForUser,
  processEvaluationRecoveryQueue,
  getEvaluationRecoveryQueue,
  clearEvaluationRecoveryQueue,
  enqueueEvaluationRetry,
} from "@/server/whitelist/qualification";
import { reviewEvidence } from "@/server/admin/evidence";
import { GET as getCronReconcile } from "@/app/api/cron/reconcile-queue/route";
import type { PrismaClient } from "@prisma/client";

function createMockPrisma() {
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
    banRecords: [] as any[],
    drops: [] as any[],
    periods: [] as any[],
    poolItems: [] as any[],
    claims: [] as any[],
    abuseFlags: [] as any[],
    gifts: [] as any[],
  };

  const createTx = () => {
    return {
      user: {
        findUnique: vi.fn(async ({ where }: any) => {
          const user = store.users.find((u) => u.id === where.id);
          if (!user) return null;
          const wallet = store.wallets.find((w) => w.userId === user.id);
          const xIdentity = store.xIdentities.find((x) => x.userId === user.id);
          const banRecords = store.banRecords.filter((b) => b.userId === user.id);
          return {
            ...user,
            wallet,
            xIdentity,
            banRecords,
          };
        }),
      },
      wLProgram: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.programs.find((p) => p.id === where.id) || null;
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.programs.find((p) => {
              if (where?.status && p.status !== where.status) return false;
              return true;
            }) || null
          );
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
        findUnique: vi.fn(async ({ where }: any) => {
          const item = store.inventoryItems.find((i) => i.id === where.id);
          if (!item) return null;
          const trait = store.traits.find((t) => t.id === item.traitId);
          return { ...item, trait };
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.inventoryItems
              .filter((i) => !where?.traitId || i.traitId === where.traitId)
              .sort((a, b) => (b.edition ?? 0) - (a.edition ?? 0))[0] || null
          );
        }),
        findMany: vi.fn(async ({ where }: any) => {
          return store.inventoryItems
            .filter((i) => {
              if (where?.ownerId && i.ownerId !== where.ownerId) return false;
              if (where?.isLocked !== undefined && Boolean(i.isLocked) !== Boolean(where.isLocked)) return false;
              return true;
            })
            .map((i) => ({
              ...i,
              trait: store.traits.find((t) => t.id === i.traitId),
            }));
        }),
        count: vi.fn(async ({ where }: any) => {
          return store.inventoryItems.filter((i) => {
            if (where?.ownerId && i.ownerId !== where.ownerId) return false;
            if (where?.traitId && i.traitId !== where.traitId) return false;
            return true;
          }).length;
        }),
        create: vi.fn(async ({ data }: any) => {
          const item = { id: `item-${store.inventoryItems.length + 1}`, ...data };
          store.inventoryItems.push(item);
          return {
            ...item,
            trait: store.traits.find((t) => t.id === item.traitId),
          };
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const item = store.inventoryItems.find((i) => i.id === where.id);
          if (item) Object.assign(item, data);
          return {
            ...item,
            trait: store.traits.find((t) => t.id === item.traitId),
          };
        }),
      },
      promoCampaign: {
        findMany: vi.fn(async ({ where }: any) => {
          return store.campaigns
            .filter((c) => {
              if (where?.wlProgramId && c.wlProgramId !== where.wlProgramId) return false;
              if (where?.status && c.status !== where.status) return false;
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
            (es) => es.taskProgressId === progress.id && es.status === "APPROVED",
          );
          return { ...progress, evidenceSubmissions };
        }),
        findMany: vi.fn(async ({ where }: any) => {
          return store.taskProgresses.filter((tp) => {
            if (where?.userId && tp.userId !== where.userId) return false;
            return true;
          });
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const tp = store.taskProgresses.find((p) => p.id === where.id);
          if (tp) Object.assign(tp, data);
          return tp;
        }),
      },
      evidenceSubmission: {
        findUnique: vi.fn(async ({ where }: any) => {
          const es = store.evidenceSubmissions.find((e) => e.id === where.id);
          if (!es) return null;
          const tp = store.taskProgresses.find((p) => p.id === es.taskProgressId);
          const task = store.campaignTasks.find((t) => t.id === es.taskId);
          return {
            ...es,
            taskProgress: tp ? { ...tp, completedAt: tp.completedAt ?? new Date() } : null,
            task,
          };
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const es = store.evidenceSubmissions.find((e) => e.id === where.id);
          if (es) Object.assign(es, data);
          return es;
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
          let qual = store.qualifications.find(
            (q) => q.programId === key.programId && q.userId === key.userId,
          );
          if (qual) {
            Object.assign(qual, update);
          } else {
            qual = { id: `qual-${store.qualifications.length + 1}`, ...create };
            store.qualifications.push(qual);
          }
          return qual;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const qual = store.qualifications.find((q) => q.id === where.id);
          if (qual) Object.assign(qual, data);
          return qual;
        }),
      },
      wLSlot: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.programId_userId) {
            const key = where.programId_userId;
            return (
              store.slots.find(
                (s) => s.programId === key.programId && s.userId === key.userId,
              ) || null
            );
          }
          return store.slots.find((s) => s.id === where.id) || null;
        }),
        findMany: vi.fn(async ({ where }: any) => {
          return store.slots.filter((s) => {
            if (where?.programId && s.programId !== where.programId) return false;
            if (where?.status?.in && !where.status.in.includes(s.status)) return false;
            return true;
          });
        }),
        count: vi.fn(async ({ where }: any) => {
          return store.slots.filter((s) => {
            if (where?.programId && s.programId !== where.programId) return false;
            if (where?.status?.in && !where.status.in.includes(s.status)) return false;
            return true;
          }).length;
        }),
        create: vi.fn(async ({ data }: any) => {
          const slot = { id: `slot-${store.slots.length + 1}`, ...data };
          store.slots.push(slot);
          return slot;
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
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.queueEntries
              .filter((qe) => qe.programId === where.programId)
              .sort((a, b) => b.queueNumber - a.queueNumber)[0] || null
          );
        }),
        create: vi.fn(async ({ data }: any) => {
          const entry = { id: `qe-${store.queueEntries.length + 1}`, ...data };
          store.queueEntries.push(entry);
          return entry;
        }),
        upsert: vi.fn(async ({ where, create, update }: any) => {
          const key = where.programId_userId;
          let qe = store.queueEntries.find(
            (item) => item.programId === key.programId && item.userId === key.userId,
          );
          if (qe) {
            Object.assign(qe, update);
          } else {
            qe = { id: `qe-${store.queueEntries.length + 1}`, ...create };
            store.queueEntries.push(qe);
          }
          return qe;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const qe of store.queueEntries) {
            if (qe.programId === where.programId && qe.userId === where.userId) {
              Object.assign(qe, data);
              count++;
            }
          }
          return { count };
        }),
        count: vi.fn(async () => store.queueEntries.length),
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
      trait: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.traits.find((t) => t.id === where.id) || null;
        }),
      },
      banRecord: {
        findFirst: vi.fn(async () => null),
      },
    };
  };

  const client = {
    ...createTx(),
    $transaction: vi.fn(async (cb: any) => {
      if (typeof cb === "function") {
        const tx = createTx();
        return await cb(tx);
      }
      return cb;
    }),
  };

  return { client, store };
}

describe("Automatic Eligibility Evaluation Failure Recovery & Integrity", () => {
  let mock: ReturnType<typeof createMockPrisma>;
  const programId = "prog-chimphood-main";
  const userId = "user-alice";

  beforeEach(() => {
    vi.clearAllMocks();
    clearEvaluationRecoveryQueue();
    mock = createMockPrisma();

    // Setup active open program with 10 max slots
    mock.store.programs.push({
      id: programId,
      slug: "chimphood-wl-main",
      name: "ChimpHood Genesis",
      maxSlots: 10,
      totalSlots: 10,
      allocatedSlotsCount: 0,
      status: "OPEN",
      createdAt: new Date(),
    });

    // Setup user with wallet and X identity
    mock.store.users.push({
      id: userId,
      isBanned: false,
    });
    mock.store.wallets.push({
      id: "w-1",
      userId,
      address: "0x1111111111111111111111111111111111111111",
    });
    mock.store.xIdentities.push({
      id: "x-1",
      userId,
      xId: "x-12345",
      username: "alice_chimp",
    });

    // 5 Trait definitions
    const categories = ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"];
    categories.forEach((cat) => {
      mock.store.traits.push({
        id: `trait-${cat}`,
        name: `Trait ${cat}`,
        category: cat,
      });
    });

    // Setup 4 initial traits in inventory
    ["BG", "FUR", "CLOTHING", "HEADWEAR"].forEach((cat, idx) => {
      mock.store.inventoryItems.push({
        id: `item-${idx + 1}`,
        ownerId: userId,
        traitId: `trait-${cat}`,
        edition: 1,
        acquiredVia: "CLAIM",
        isLocked: false,
      });
    });

    // Setup mandatory campaign task and progress
    mock.store.campaigns.push({ id: "camp-1", wlProgramId: programId, status: "ACTIVE" });
    mock.store.campaignVersions.push({ id: "ver-1", campaignId: "camp-1", isCurrent: true });
    mock.store.campaignTasks.push({ id: "task-1", versionId: "ver-1", isRequired: true, title: "Mandatory Task" });
    mock.store.taskProgresses.push({
      id: "tp-1",
      userId,
      versionId: "ver-1",
      taskId: "task-1",
      status: "VERIFIED",
    });
  });

  // 1. Evaluasi berhasil setelah transaksi bisnis.
  it("Scenario 1: Evaluation succeeds automatically after business transaction commits", async () => {
    const prisma = mock.client as unknown as PrismaClient;

    // User gets 5th trait (EYEWEAR)
    mock.store.inventoryItems.push({
      id: "item-5-eyewear",
      ownerId: userId,
      traitId: "trait-EYEWEAR",
      edition: 1,
      acquiredVia: "CLAIM",
      isLocked: false,
    });

    // Trigger evaluation post-commit
    const result = await triggerAutomaticEligibilityEvaluation(prisma, {
      userId,
      programId,
    });

    expect(result).toBeDefined();
    expect(result?.qualified).toBe(true);
    expect(result?.phase).toBe("SLOT_ALLOCATED");
    expect(result?.slotNumber).toBe(1);

    // Verifies GTD slot is created in database
    const slot = mock.store.slots.find((s) => s.userId === userId);
    expect(slot).toBeDefined();
    expect(slot.status).toBe("ALLOCATED");
  });

  // 2. Evaluasi gagal setelah transaksi bisnis commit (transaksi bisnis tidak rollback, error ditangkap).
  it("Scenario 2: Evaluation failure does not roll back committed business transaction and enqueues retry", async () => {
    const prisma = mock.client as unknown as PrismaClient;

    // User owns 5 traits
    mock.store.inventoryItems.push({
      id: "item-5-eyewear",
      ownerId: userId,
      traitId: "trait-EYEWEAR",
      edition: 1,
      acquiredVia: "CLAIM",
      isLocked: false,
    });

    // Prepare evidence submission that completes the last mandatory requirement
    const tp = mock.store.taskProgresses.find((p) => p.userId === userId);
    tp.status = "SUBMITTED";
    const submissionId = "es-failure-test";
    mock.store.evidenceSubmissions.push({
      id: submissionId,
      taskProgressId: tp.id,
      taskId: "task-1",
      userId,
      submissionType: "URL",
      payload: "https://proof.example.com",
      status: "PENDING_REVIEW",
    });

    // Mock transient failure specifically on the post-commit evaluation transaction
    const originalTx = mock.client.$transaction;
    let txCount = 0;
    mock.client.$transaction = vi.fn(async (cb: any) => {
      txCount++;
      // Call 1: reviewEvidence business transaction -> succeeds
      if (txCount === 1) {
        return originalTx(cb);
      }
      // Call 2+: triggerAutomaticEligibilityEvaluation -> simulate DB transient outage
      throw new Error("TRANSIENT_DB_NETWORK_TIMEOUT");
    });

    const reviewRes = await reviewEvidence(prisma, {
      submissionId,
      adminUserId: "admin-1",
      status: "APPROVED",
      reviewerNotes: "Verified evidence.",
    });

    // 1) Business transaction committed successfully
    expect(reviewRes.success).toBe(true);
    expect(reviewRes.submission.status).toBe("APPROVED");
    expect(mock.store.evidenceSubmissions.find((e) => e.id === submissionId)?.status).toBe("APPROVED");

    // 2) Evaluation failure was non-fatal and didn't crash reviewEvidence
    const slot = mock.store.slots.find((s) => s.userId === userId);
    expect(slot).toBeUndefined();

    // 3) User is safely captured in the recovery queue
    const queue = getEvaluationRecoveryQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].userId).toBe(userId);
  });

  // 3. Kegagalan evaluasi dapat dipulihkan melalui mekanisme retry.
  it("Scenario 3: Evaluation failure can be recovered via retry mechanism", async () => {
    const prisma = mock.client as unknown as PrismaClient;

    // User owns all 5 traits
    mock.store.inventoryItems.push({
      id: "item-5-eyewear",
      ownerId: userId,
      traitId: "trait-EYEWEAR",
      edition: 1,
      acquiredVia: "CLAIM",
      isLocked: false,
    });

    // Enqueue failure in recovery queue
    enqueueEvaluationRetry({
      userId,
      programId,
      error: new Error("NETWORK_TIMEOUT"),
      now: new Date(Date.now() - 5000),
    });

    expect(getEvaluationRecoveryQueue().length).toBe(1);
    expect(getEvaluationRecoveryQueue()[0].userId).toBe(userId);

    // Process recovery queue now that network is back
    const recoveryResult = await processEvaluationRecoveryQueue(prisma, {
      now: new Date(),
    });

    expect(recoveryResult.processed).toBe(1);
    expect(recoveryResult.succeeded).toBe(1);
    expect(recoveryResult.failed).toBe(0);

    // Slot is now securely allocated
    const slot = mock.store.slots.find((s) => s.userId === userId);
    expect(slot).toBeDefined();
    expect(slot.status).toBe("ALLOCATED");

    // Queue is drained
    expect(getEvaluationRecoveryQueue().length).toBe(0);
  });

  // 4. Retry berulang tidak menghasilkan GTD slot ganda (idempotency).
  it("Scenario 4: Repeated retries do not produce duplicate GTD slots", async () => {
    const prisma = mock.client as unknown as PrismaClient;

    mock.store.inventoryItems.push({
      id: "item-5-eyewear",
      ownerId: userId,
      traitId: "trait-EYEWEAR",
      edition: 1,
      acquiredVia: "CLAIM",
      isLocked: false,
    });

    // First retry
    const res1 = await retryEvaluationForUser(prisma, userId, programId);
    expect(res1?.phase).toBe("SLOT_ALLOCATED");
    expect(mock.store.slots.filter((s) => s.userId === userId).length).toBe(1);

    // Second retry
    const res2 = await retryEvaluationForUser(prisma, userId, programId);
    expect(res2?.phase).toBe("SLOT_ALLOCATED");
    expect(mock.store.slots.filter((s) => s.userId === userId).length).toBe(1);

    // Third retry
    const res3 = await retryEvaluationForUser(prisma, userId, programId);
    expect(res3?.phase).toBe("SLOT_ALLOCATED");
    expect(mock.store.slots.filter((s) => s.userId === userId).length).toBe(1);
  });

  // 5. Kapasitas GTD tidak pernah terlampaui.
  it("Scenario 5: GTD capacity is never exceeded when capacity is reached", async () => {
    const prisma = mock.client as unknown as PrismaClient;

    // Fill all 2 slots
    const prog = mock.store.programs[0];
    prog.maxSlots = 2;
    prog.totalSlots = 2;
    for (let i = 1; i <= 2; i++) {
      mock.store.slots.push({
        id: `slot-${i}`,
        programId,
        userId: `other-user-${i}`,
        slotNumber: i,
        status: "ALLOCATED",
      });
      prog.allocatedSlotsCount += 1;
    }

    mock.store.inventoryItems.push({
      id: "item-5-eyewear",
      ownerId: userId,
      traitId: "trait-EYEWEAR",
      edition: 1,
      acquiredVia: "CLAIM",
      isLocked: false,
    });

    // Try evaluation and retry
    const result = await retryEvaluationForUser(prisma, userId, programId);

    // Must not allocate slot 3, registers in FCFS queue/directory instead
    expect(result?.qualified).toBe(true);
    expect(result?.phase).toBe("IN_QUEUE");
    expect(mock.store.slots.length).toBe(2);
    expect(mock.store.slots.find((s) => s.userId === userId)).toBeUndefined();
  });

  // 6. User yang sudah REVOKED tetap tidak memenuhi syarat.
  it("Scenario 6: REVOKED users remain terminal and cannot qualify via retry", async () => {
    const prisma = mock.client as unknown as PrismaClient;

    mock.store.inventoryItems.push({
      id: "item-5-eyewear",
      ownerId: userId,
      traitId: "trait-EYEWEAR",
      edition: 1,
      acquiredVia: "CLAIM",
      isLocked: false,
    });

    // User was revoked
    mock.store.qualifications.push({
      id: "qual-revoked",
      programId,
      userId,
      status: "REVOKED",
      reason: "Disqualified per admin review",
    });

    const result = await retryEvaluationForUser(prisma, userId, programId);

    expect(result?.phase).toBe("REVOKED");
    expect(result?.qualified).toBe(false);
    expect(mock.store.slots.find((s) => s.userId === userId)).toBeUndefined();
  });

  // 7. GET /api/whitelist/status tidak melakukan mutasi database.
  it("Scenario 7: GET /api/whitelist/status & readOnly evaluation perform zero database mutations", async () => {
    const prisma = mock.client as unknown as PrismaClient;

    // User owns 5 traits
    mock.store.inventoryItems.push({
      id: "item-5-eyewear",
      ownerId: userId,
      traitId: "trait-EYEWEAR",
      edition: 1,
      acquiredVia: "CLAIM",
      isLocked: false,
    });

    const initialSlotCount = mock.store.slots.length;
    const initialQualCount = mock.store.qualifications.length;
    const initialItemCount = mock.store.inventoryItems.length;
    const initialHistoryCount = mock.store.statusHistories.length;

    // Evaluates with readOnly: true (which is the exact contract used by GET /api/whitelist/status)
    const result = await evaluateUserQualification(prisma, {
      userId,
      programId,
      readOnly: true,
    });

    expect(result.qualified).toBe(true);

    // Verify ZERO mutations occurred
    expect(mock.store.slots.length).toBe(initialSlotCount);
    expect(mock.store.qualifications.length).toBe(initialQualCount);
    expect(mock.store.inventoryItems.length).toBe(initialItemCount);
    expect(mock.store.statusHistories.length).toBe(initialHistoryCount);
  });

  // 8. Tidak ada auto-promotion atau reconciliation yang melanggar DEC-018.
  it("Scenario 8: Queue reconciliation route is decommissioned and performs no auto-promotion per DEC-018", async () => {
    process.env.CRON_SECRET = "secret-token";

    const req = new Request("http://localhost:3000/api/cron/reconcile-queue", {
      method: "POST",
      headers: {
        authorization: "Bearer secret-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ programId }),
    });

    const res = await getCronReconcile(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.deprecated).toBe(true);
    expect(body.slotsFilled).toBe(0);
    expect(body.openSlotsRemaining).toBe(0);
    expect(body.message).toContain("decommissioned per DEC-018");
  });
});
