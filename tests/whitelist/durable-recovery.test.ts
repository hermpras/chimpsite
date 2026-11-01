import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  enqueueDurableRecovery,
  claimDueRecoveryJobs,
  completeRecoveryJob,
  rescheduleRecoveryJob,
  processDurableRecoveryQueue,
  getDeadLetterQueue,
  __setTestRecoveryRedis,
  __resetRecoveryRedis,
  __setRecoveryRedisMockTime,
  REDIS_KEY_RECOVERY_DUE,
  REDIS_KEY_RECOVERY_JOB_PREFIX,
  REDIS_KEY_RECOVERY_LOCK_PREFIX,
  REDIS_KEY_RECOVERY_DLQ,
  type DurableRecoveryJob,
  type DurableRecoveryRedisTarget,
} from "@/server/whitelist/durable-recovery";
import {
  triggerAutomaticEligibilityEvaluation,
  getEvaluationRecoveryQueue,
  clearEvaluationRecoveryQueue,
} from "@/server/whitelist/qualification";
import { POST as postCronWlRecovery, GET as getCronWlRecovery } from "@/app/api/cron/wl-recovery/route";
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
        update: vi.fn(async ({ where, data }: any) => {
          const idx = store.slots.findIndex((s) => s.id === where.id);
          if (idx >= 0) {
            store.slots[idx] = { ...store.slots[idx], ...data };
            return store.slots[idx];
          }
          return null;
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
      $queryRaw: vi.fn(async () => {
        const p = store.programs[0];
        return p ? [p] : [];
      }),
    };
  };

  const client = {
    ...createTx(),
    $transaction: vi.fn(async (cb: any) => {
      if (typeof cb === "function") {
        return cb(createTx());
      }
      return cb;
    }),
  };

  return { store, client };
}

describe("Durable Whitelist Eligibility Evaluation Recovery Queue", () => {
  const originalEnv = { ...process.env };
  let mock: ReturnType<typeof createMockPrisma>;
  const userId = "user-alice";
  const programId = "prog-chimp-1";

  beforeEach(() => {
    vi.restoreAllMocks();
    clearEvaluationRecoveryQueue();
    __resetRecoveryRedis();
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

    // Setup 5 traits in inventory
    categories.forEach((cat, idx) => {
      mock.store.inventoryItems.push({
        id: `item-${idx + 1}`,
        ownerId: userId,
        traitId: `trait-${cat}`,
        edition: 1,
        acquiredVia: "CLAIM",
        isLocked: false,
      });
    });

    // Setup mandatory campaign task and verified progress
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

  afterEach(() => {
    process.env = { ...originalEnv };
    clearEvaluationRecoveryQueue();
    __resetRecoveryRedis();
  });

  // Scenario 1: Immediate retry success
  it("Scenario 1: Immediate retry success does not enqueue job into durable recovery queue", async () => {
    const prisma = mock.client as unknown as PrismaClient;

    const result = await triggerAutomaticEligibilityEvaluation(prisma, {
      userId,
      programId,
      maxRetries: 3,
    });

    expect(result).not.toBeNull();
    expect(result?.qualified).toBe(true);
    expect(result?.phase).toBe("SLOT_ALLOCATED");

    // Neither in-memory nor Redis recovery queues have any jobs
    expect(getEvaluationRecoveryQueue().length).toBe(0);
    const claimed = await claimDueRecoveryJobs(10);
    expect(claimed.length).toBe(0);
  });

  // Scenario 2: All immediate retries fail and job is persisted in Redis
  it("Scenario 2: All immediate retries fail and job is persisted into durable Redis queue", async () => {
    const prisma = mock.client as unknown as PrismaClient;

    // Simulate transient database failure during evaluation
    vi.spyOn(prisma, "$transaction").mockRejectedValue(new Error("DB_NETWORK_UNREACHABLE"));

    const result = await triggerAutomaticEligibilityEvaluation(prisma, {
      userId,
      programId,
      maxRetries: 3,
      retryDelayMs: 1,
    });

    expect(result).toBeNull();

    // Verify job persisted into durable queue
    const claimed = await claimDueRecoveryJobs(10, "worker-1", new Date(Date.now() + 1000));
    expect(claimed.length).toBe(1);
    expect(claimed[0].userId).toBe(userId);
    expect(claimed[0].programId).toBe(programId);
    expect(claimed[0].attempts).toBe(1);
    expect(claimed[0].maxAttempts).toBe(5);
    expect(claimed[0].lastError).toBe("DB_NETWORK_UNREACHABLE");
  });

  // Scenario 3: Redis enqueue failure falls back safely without crashing caller
  it("Scenario 3: Redis enqueue failure falls back to in-memory queue and emits critical log without rolling back caller", async () => {
    const prisma = mock.client as unknown as PrismaClient;

    // Mock Redis failing with network disconnect
    const brokenRedis: DurableRecoveryRedisTarget = {
      zadd: vi.fn().mockRejectedValue(new Error("UPSTASH_REDIS_SOCKET_CLOSED")),
      zrange: vi.fn().mockRejectedValue(new Error("UPSTASH_REDIS_SOCKET_CLOSED")),
      zrem: vi.fn().mockRejectedValue(new Error("UPSTASH_REDIS_SOCKET_CLOSED")),
      set: vi.fn().mockRejectedValue(new Error("UPSTASH_REDIS_SOCKET_CLOSED")),
      get: vi.fn().mockRejectedValue(new Error("UPSTASH_REDIS_SOCKET_CLOSED")),
      del: vi.fn().mockRejectedValue(new Error("UPSTASH_REDIS_SOCKET_CLOSED")),
      lpush: vi.fn().mockRejectedValue(new Error("UPSTASH_REDIS_SOCKET_CLOSED")),
      lrange: vi.fn().mockRejectedValue(new Error("UPSTASH_REDIS_SOCKET_CLOSED")),
    };
    __setTestRecoveryRedis(brokenRedis);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Caller evaluation fails
    vi.spyOn(prisma, "$transaction").mockRejectedValue(new Error("PG_CONNECTION_TIMEOUT"));

    // Call triggerAutomaticEligibilityEvaluation
    const evalResult = await triggerAutomaticEligibilityEvaluation(prisma, {
      userId,
      programId,
      maxRetries: 1,
    });

    // Must not crash or throw
    expect(evalResult).toBeNull();

    // Critical log must be emitted with standard tag [CRITICAL_WL_EVALUATION_ORPHAN]
    expect(consoleSpy).toHaveBeenCalledWith(
      "[CRITICAL_WL_EVALUATION_ORPHAN]",
      expect.stringContaining("UPSTASH_REDIS_SOCKET_CLOSED"),
    );

    // Fallback in-memory queue must capture the job
    expect(getEvaluationRecoveryQueue().length).toBe(1);
    expect(getEvaluationRecoveryQueue()[0].userId).toBe(userId);
  });

  // Scenario 4: Due job is processed successfully by worker
  it("Scenario 4: Due job in durable queue is processed successfully and removed from queue", async () => {
    const prisma = mock.client as unknown as PrismaClient;

    // Enqueue a job directly as if previously failed
    await enqueueDurableRecovery({
      userId,
      programId,
      error: "TEMPORARY_ERROR",
      now: new Date(Date.now() - 5000),
    });

    const recoveryResult = await processDurableRecoveryQueue(prisma, {
      now: new Date(),
      workerId: "worker-test",
    });

    expect(recoveryResult.processed).toBe(1);
    expect(recoveryResult.succeeded).toBe(1);
    expect(recoveryResult.failed).toBe(0);

    // GTD slot is allocated
    const slot = mock.store.slots.find((s) => s.userId === userId);
    expect(slot).toBeDefined();
    expect(slot.status).toBe("ALLOCATED");

    // Queue is cleared
    const afterClaim = await claimDueRecoveryJobs(10, "worker-check", new Date());
    expect(afterClaim.length).toBe(0);
  });

  // Scenario 5: Failed recovery is rescheduled with backoff
  it("Scenario 5: Failed recovery attempt is rescheduled with exponential backoff and updated attempts count", async () => {
    const prisma = mock.client as unknown as PrismaClient;

    await enqueueDurableRecovery({
      userId,
      programId,
      error: "TIMEOUT_1",
      now: new Date(Date.now() - 5000),
    });

    // Worker fails evaluation
    vi.spyOn(prisma, "$transaction").mockRejectedValue(new Error("REPEATED_DB_ERROR"));

    const recoveryResult = await processDurableRecoveryQueue(prisma, {
      now: new Date(),
      workerId: "worker-fail",
    });

    expect(recoveryResult.processed).toBe(1);
    expect(recoveryResult.succeeded).toBe(0);
    expect(recoveryResult.failed).toBe(1);
    expect(recoveryResult.movedToDlq).toBe(0);

    // Job is not due immediately due to backoff
    const immediateDue = await claimDueRecoveryJobs(10, "worker-check", new Date());
    expect(immediateDue.length).toBe(0);

    // But is due at future backoff time
    const futureDue = await claimDueRecoveryJobs(10, "worker-check", new Date(Date.now() + 10_000));
    expect(futureDue.length).toBe(1);
    expect(futureDue[0].attempts).toBe(2);
    expect(futureDue[0].lastError).toBe("REPEATED_DB_ERROR");
  });

  // Scenario 6: Maximum retry count moves job to dead-letter queue (DLQ)
  it("Scenario 6: Exceeding maximum retry count moves job to dead-letter queue (DLQ) with error context", async () => {
    // Enqueue job with attempts = 4 and maxAttempts = 5
    const job: DurableRecoveryJob = {
      userId,
      programId,
      attempts: 4,
      maxAttempts: 5,
      nextRetryAt: Date.now() - 1000,
      createdAt: Date.now() - 10000,
    };

    // Simulate 5th failed attempt
    const res = await rescheduleRecoveryJob(job, "PERMANENT_INTEGRATION_ERROR", new Date());
    expect(res.movedToDlq).toBe(true);

    // DLQ contains the failed job with context
    const dlq = await getDeadLetterQueue(10);
    expect(dlq.length).toBe(1);
    expect(dlq[0].job.userId).toBe(userId);
    expect(dlq[0].job.attempts).toBe(5);
    expect(dlq[0].finalError).toBe("PERMANENT_INTEGRATION_ERROR");

    // Active due queue is drained
    const activeJobs = await claimDueRecoveryJobs(10, "worker-check", new Date(Date.now() + 100000));
    expect(activeJobs.length).toBe(0);
  });

  // Scenario 7: Concurrent workers cannot process the same job simultaneously (lease lock)
  it("Scenario 7: Concurrent workers cannot process the same job simultaneously due to atomic lease lock", async () => {
    await enqueueDurableRecovery({
      userId,
      programId,
      error: "CONCURRENCY_TEST",
      now: new Date(Date.now() - 5000),
    });

    const now = new Date();

    // Worker 1 claims the job
    const worker1Claims = await claimDueRecoveryJobs(10, "worker-instance-1", now, 60_000);
    expect(worker1Claims.length).toBe(1);
    expect(worker1Claims[0].claimedBy).toBe("worker-instance-1");

    // Worker 2 attempts to claim at the same time
    const worker2Claims = await claimDueRecoveryJobs(10, "worker-instance-2", now, 60_000);
    expect(worker2Claims.length).toBe(0); // Locked out!
  });

  // Scenario 8: Expired processing lease can be recovered and processed
  it("Scenario 8: Expired processing lease allows another worker to reclaim and process the job", async () => {
    await enqueueDurableRecovery({
      userId,
      programId,
      error: "LEASE_TEST",
      now: new Date(Date.now() - 10_000),
    });

    const startTime = new Date();
    // Worker 1 claims with short lease (2 seconds)
    const worker1Claims = await claimDueRecoveryJobs(10, "worker-crashed", startTime, 2000);
    expect(worker1Claims.length).toBe(1);

    // Advance mock time past the 2s lease expiration (5 seconds later)
    __setRecoveryRedisMockTime(startTime.getTime() + 5000);

    // Worker 2 should now be able to reclaim and successfully process the job
    const worker2Claims = await claimDueRecoveryJobs(
      10,
      "worker-healthy",
      new Date(startTime.getTime() + 5000),
      60_000,
    );
    expect(worker2Claims.length).toBe(1);
    expect(worker2Claims[0].claimedBy).toBe("worker-healthy");

    // Complete the job
    await completeRecoveryJob(`${userId}:${programId}`);
  });

  // Scenario 9: Duplicate jobs do not cause duplicate WL allocation (idempotent)
  it("Scenario 9: Repeated recovery processing for qualified user is strictly idempotent without duplicate slots", async () => {
    const prisma = mock.client as unknown as PrismaClient;

    await enqueueDurableRecovery({
      userId,
      programId,
      error: "IDEMPOTENT_TEST",
      now: new Date(Date.now() - 5000),
    });

    // First recovery run
    const res1 = await processDurableRecoveryQueue(prisma, { now: new Date(), workerId: "worker-1" });
    expect(res1.succeeded).toBe(1);

    // Only 1 slot created
    const slotsUser = mock.store.slots.filter((s) => s.userId === userId);
    expect(slotsUser.length).toBe(1);

    // Enqueue duplicate recovery
    await enqueueDurableRecovery({
      userId,
      programId,
      error: "DUPLICATE_JOB",
      now: new Date(Date.now() - 5000),
    });

    // Second recovery run
    const res2 = await processDurableRecoveryQueue(prisma, { now: new Date(), workerId: "worker-2" });
    expect(res2.succeeded).toBe(1);

    // Still exactly 1 slot created!
    const slotsUserAfter = mock.store.slots.filter((s) => s.userId === userId);
    expect(slotsUserAfter.length).toBe(1);
  });

  // Scenario 10: Recovery does not trigger FCFS auto-promotion or queue reconciliation (DEC-018)
  it("Scenario 10: Recovery does not perform auto-promotion or queue reconciliation per DEC-018", async () => {
    const prisma = mock.client as unknown as PrismaClient;

    // Seed existing FCFS participant Bob
    mock.store.users.push({ id: "user-bob", name: "Bob" });
    mock.store.queueEntries.push({
      id: "queue-bob",
      userId: "user-bob",
      programId,
      queueNumber: 1,
      status: "WAITING",
    });

    // Enqueue recovery for Alice
    await enqueueDurableRecovery({
      userId,
      programId,
      error: "ALICE_EVAL_ERROR",
      now: new Date(Date.now() - 5000),
    });

    await processDurableRecoveryQueue(prisma, { now: new Date() });

    // Bob must remain in WAITING and NOT promoted to GTD slot
    const bobQueue = mock.store.queueEntries.find((q) => q.userId === "user-bob");
    expect(bobQueue?.status).toBe("WAITING");

    const bobSlot = mock.store.slots.find((s) => s.userId === "user-bob");
    expect(bobSlot).toBeUndefined();
  });

  // Scenario 11: Existing capacity and qualification invariants remain intact
  it("Scenario 11: Respects capacity limits (overflow goes to FCFS) and DEC-022 terminal revocation", async () => {
    const prisma = mock.client as unknown as PrismaClient;

    // Part A: Program capacity full (capacity = 1, allocated = 1)
    const fullProgram = mock.store.programs[0];
    fullProgram.maxSlots = 1;
    fullProgram.totalSlots = 1;
    fullProgram.allocatedSlotsCount = 1;
    mock.store.slots.push({
      id: "slot-other",
      userId: "user-other",
      programId,
      slotNumber: 1,
      status: "ALLOCATED",
    });

    await enqueueDurableRecovery({
      userId,
      programId,
      error: "CAPACITY_TEST",
      now: new Date(Date.now() - 5000),
    });

    await processDurableRecoveryQueue(prisma, { now: new Date() });

    // Alice is qualified but capacity is full -> registered as FCFS, NOT given a GTD slot exceeding capacity!
    const aliceSlot = mock.store.slots.find((s) => s.userId === userId);
    expect(aliceSlot).toBeUndefined();
    const aliceQueue = mock.store.queueEntries.find((q) => q.userId === userId);
    expect(aliceQueue).toBeDefined();

    // Part B: User is REVOKED (DEC-022)
    const revokedUser = "user-revoked";
    mock.store.users.push({ id: revokedUser, name: "Revoked" });
    mock.store.qualifications.push({
      userId: revokedUser,
      programId,
      status: "REVOKED",
    });

    await enqueueDurableRecovery({
      userId,
      programId,
      error: "REVOKED_TEST",
      now: new Date(Date.now() - 5000),
    });

    await processDurableRecoveryQueue(prisma, { now: new Date() });

    // Revoked user remains terminal and cannot receive a slot
    const revokedSlot = mock.store.slots.find((s) => s.userId === revokedUser);
    expect(revokedSlot).toBeUndefined();
  });

  // Cron API route security and invocation tests
  describe("Cron Route POST/GET /api/cron/wl-recovery", () => {
    beforeEach(() => {
      process.env.CRON_SECRET = "super-secret-cron-token-123";
    });

    it("rejects unauthorized requests with 401", async () => {
      const req = new Request("http://localhost/api/cron/wl-recovery", {
        method: "POST",
        headers: { Authorization: "Bearer wrong-token" },
      });

      const res = await postCronWlRecovery(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("UNAUTHORIZED");
    });

    it("rejects when CRON_SECRET is not configured on server", async () => {
      delete process.env.CRON_SECRET;
      const req = new Request("http://localhost/api/cron/wl-recovery", {
        method: "POST",
        headers: { Authorization: "Bearer super-secret-cron-token-123" },
      });

      const res = await postCronWlRecovery(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe("SERVER_MISCONFIGURED");
    });

    it("processes due recovery jobs when properly authorized via POST and GET", async () => {
      const postReq = new Request("http://localhost/api/cron/wl-recovery", {
        method: "POST",
        headers: { Authorization: "Bearer super-secret-cron-token-123" },
      });

      const postRes = await postCronWlRecovery(postReq);
      expect(postRes.status).toBe(200);
      const postData = await postRes.json();
      expect(postData.success).toBe(true);
      expect(postData).toHaveProperty("processed");
      expect(postData).toHaveProperty("succeeded");
      expect(postData).toHaveProperty("failed");
      expect(postData).toHaveProperty("movedToDlq");

      const getReq = new Request("http://localhost/api/cron/wl-recovery", {
        method: "GET",
        headers: { Authorization: "Bearer super-secret-cron-token-123" },
      });

      const getRes = await getCronWlRecovery(getReq);
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(getData.success).toBe(true);
    });
  });
});
