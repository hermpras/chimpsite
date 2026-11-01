/**
 * Durable Recovery Queue for Automatic Whitelist Eligibility Evaluation
 *
 * Backed by Upstash Redis to survive serverless instance teardown, cold starts,
 * restarts, and multi-instance concurrent environments.
 *
 * Architecture:
 * - Due Queue: Redis Sorted Set `chimphood:wl:recovery:due` (member: jobKey, score: nextRetryAt epoch ms)
 * - Job Data: Redis String/JSON `chimphood:wl:recovery:job:${jobKey}`
 * - Distributed Lease Lock: Redis String `chimphood:wl:recovery:lock:${jobKey}` with TTL
 * - Dead-Letter Queue (DLQ): Redis List `chimphood:wl:recovery:dlq`
 * - Fallback: In-memory queue + structured critical audit logging if Redis is unreachable.
 *
 * Invariants:
 * - This is an internal system job recovery queue, NOT a participant-facing FCFS queue.
 * - Idempotent evaluation using existing qualification engine and pessimistic row locks.
 * - Strictly respects DEC-018 (no auto-promotion from FCFS to GTD).
 * - Strictly respects DEC-022 (REVOKED users remain terminal).
 * - Never rolls back or blocks committed business transactions.
 */

import { Redis } from "@upstash/redis";
import type { PrismaClient } from "@prisma/client";
import {
  evaluateUserQualification,
  enqueueEvaluationRetry,
  getEvaluationRecoveryQueue,
  clearEvaluationRecoveryQueue,
  evaluationRecoveryQueue,
  type EvaluationRecoveryItem,
} from "./qualification";

export interface DurableRecoveryJob {
  userId: string;
  programId?: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: number; // epoch ms
  createdAt: number; // epoch ms
  lastError?: string;
  leaseExpiresAt?: number;
  claimedBy?: string;
}

export interface DeadLetterItem {
  job: DurableRecoveryJob;
  failedAt: number; // epoch ms
  finalError: string;
}

export interface DurableRecoveryRedisTarget {
  zadd(key: string, scoreMember: { score: number; member: string }): Promise<number | null>;
  zrange(
    key: string,
    min: number | string,
    max: number | string,
    opts?: { byScore?: boolean; offset?: number; count?: number },
  ): Promise<string[]>;
  zrem(key: string, member: string): Promise<number>;
  set(
    key: string,
    value: string,
    opts?: { ex?: number; nx?: boolean },
  ): Promise<string | null>;
  get(key: string): Promise<string | object | null>;
  del(...keys: string[]): Promise<number>;
  lpush(key: string, ...values: string[]): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
}

export const REDIS_KEY_RECOVERY_DUE = "chimphood:wl:recovery:due";
export const REDIS_KEY_RECOVERY_JOB_PREFIX = "chimphood:wl:recovery:job:";
export const REDIS_KEY_RECOVERY_LOCK_PREFIX = "chimphood:wl:recovery:lock:";
export const REDIS_KEY_RECOVERY_DLQ = "chimphood:wl:recovery:dlq";

export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_LEASE_DURATION_MS = 60_000; // 60 seconds
export const DEFAULT_MAX_BATCH_SIZE = 25;

let redisClient: Redis | null = null;
let customRecoveryRedis: DurableRecoveryRedisTarget | null = null;
let mockTimeMs: number | null = null;

export function __setRecoveryRedisMockTime(timeMs: number | null): void {
  mockTimeMs = timeMs;
}

// Lightweight in-memory fallback for development/test environments
class InMemoryRecoveryRedis implements DurableRecoveryRedisTarget {
  private sortedSets = new Map<string, Map<string, number>>();
  private strings = new Map<string, { value: string; expiresAt?: number }>();
  private lists = new Map<string, string[]>();

  private getNow(): number {
    return mockTimeMs !== null ? mockTimeMs : Date.now();
  }

  private cleanExpired(key: string): void {
    const entry = this.strings.get(key);
    if (entry && entry.expiresAt && this.getNow() > entry.expiresAt) {
      this.strings.delete(key);
    }
  }

  async zadd(key: string, scoreMember: { score: number; member: string }): Promise<number | null> {
    let set = this.sortedSets.get(key);
    if (!set) {
      set = new Map<string, number>();
      this.sortedSets.set(key, set);
    }
    const isNew = !set.has(scoreMember.member);
    set.set(scoreMember.member, scoreMember.score);
    return isNew ? 1 : 0;
  }

  async zrange(
    key: string,
    min: number | string,
    max: number | string,
    opts?: { byScore?: boolean; offset?: number; count?: number },
  ): Promise<string[]> {
    const set = this.sortedSets.get(key);
    if (!set) return [];

    let entries = Array.from(set.entries());

    if (opts?.byScore) {
      const minScore = typeof min === "number" ? min : -Infinity;
      const maxScore = typeof max === "number" ? max : Infinity;
      entries = entries.filter(([_, score]) => score >= minScore && score <= maxScore);
      entries.sort((a, b) => a[1] - b[1]);
    } else {
      entries.sort((a, b) => a[1] - b[1]);
    }

    let members = entries.map(([m]) => m);
    if (opts?.offset !== undefined || opts?.count !== undefined) {
      const offset = opts.offset ?? 0;
      const count = opts.count ?? members.length;
      members = members.slice(offset, offset + count);
    }
    return members;
  }

  async zrem(key: string, member: string): Promise<number> {
    const set = this.sortedSets.get(key);
    if (!set) return 0;
    return set.delete(member) ? 1 : 0;
  }

  async set(
    key: string,
    value: string,
    opts?: { ex?: number; nx?: boolean },
  ): Promise<string | null> {
    this.cleanExpired(key);
    if (opts?.nx && this.strings.has(key)) {
      return null;
    }
    const expiresAt = opts?.ex ? this.getNow() + opts.ex * 1000 : undefined;
    this.strings.set(key, { value, expiresAt });
    return "OK";
  }

  async get(key: string): Promise<string | null> {
    this.cleanExpired(key);
    const entry = this.strings.get(key);
    return entry ? entry.value : null;
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.strings.delete(key)) deleted++;
      if (this.sortedSets.delete(key)) deleted++;
      if (this.lists.delete(key)) deleted++;
    }
    return deleted;
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    let list = this.lists.get(key);
    if (!list) {
      list = [];
      this.lists.set(key, list);
    }
    list.unshift(...values);
    return list.length;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.lists.get(key);
    if (!list) return [];
    if (stop === -1) {
      return list.slice(start);
    }
    return list.slice(start, stop + 1);
  }

  clear(): void {
    this.sortedSets.clear();
    this.strings.clear();
    this.lists.clear();
  }
}

const devMemoryRedis = new InMemoryRecoveryRedis();

export function getRecoveryRedisClient(): DurableRecoveryRedisTarget {
  if (customRecoveryRedis) {
    return customRecoveryRedis;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    // In dev / test or unconfigured environments, fall back to in-memory store
    return devMemoryRedis;
  }

  if (!redisClient) {
    redisClient = new Redis({ url, token });
  }

  return redisClient as unknown as DurableRecoveryRedisTarget;
}

export function __setTestRecoveryRedis(client: DurableRecoveryRedisTarget | null): void {
  customRecoveryRedis = client;
}

export function __resetRecoveryRedis(): void {
  redisClient = null;
  customRecoveryRedis = null;
  mockTimeMs = null;
  devMemoryRedis.clear();
}

export function getJobKey(userId: string, programId?: string): string {
  return `${userId}:${programId || "default"}`;
}

export function calculateBackoffMs(attempts: number): number {
  return Math.min(100 * Math.pow(2, Math.max(0, attempts - 1)), 300_000);
}

/**
 * Persists a failed evaluation job into the durable Redis recovery queue.
 *
 * Reliable Failure Boundary:
 * If Redis operation fails, logs a critical structured error tag [CRITICAL_WL_EVALUATION_ORPHAN]
 * and enqueues to the process memory queue as secondary failover without throwing,
 * protecting the caller transaction.
 */
export async function enqueueDurableRecovery(item: {
  userId: string;
  programId?: string;
  error?: unknown;
  maxAttempts?: number;
  now?: Date;
}): Promise<DurableRecoveryJob | null> {
  const now = item.now ?? new Date();
  const jobKey = getJobKey(item.userId, item.programId);
  const maxAttempts = item.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const lastError =
    item.error instanceof Error
      ? item.error.message
      : typeof item.error === "string"
        ? item.error
        : "Unknown evaluation failure";

  try {
    const redis = getRecoveryRedisClient();
    const existingRaw = await redis.get(`${REDIS_KEY_RECOVERY_JOB_PREFIX}${jobKey}`);
    let existing: DurableRecoveryJob | null = null;
    if (existingRaw) {
      existing = typeof existingRaw === "string" ? JSON.parse(existingRaw) : (existingRaw as DurableRecoveryJob);
    }

    const attempts = (existing?.attempts ?? 0) + 1;
    const backoffMs = calculateBackoffMs(attempts);
    const nextRetryAt = now.getTime() + backoffMs;

    const job: DurableRecoveryJob = {
      userId: item.userId,
      programId: item.programId,
      attempts,
      maxAttempts,
      nextRetryAt,
      createdAt: existing?.createdAt ?? now.getTime(),
      lastError,
    };

    // 1. Save job payload
    await redis.set(`${REDIS_KEY_RECOVERY_JOB_PREFIX}${jobKey}`, JSON.stringify(job));

    // 2. Add to due queue with nextRetryAt score
    await redis.zadd(REDIS_KEY_RECOVERY_DUE, {
      score: nextRetryAt,
      member: jobKey,
    });

    return job;
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    console.error(
      "[CRITICAL_WL_EVALUATION_ORPHAN]",
      JSON.stringify({
        userId: item.userId,
        programId: item.programId,
        error: errMessage,
        timestamp: now.toISOString(),
        code: "REDIS_ENQUEUE_FAILURE",
      }),
    );

    // Fall back to secondary in-memory queue to ensure this instance still retries
    enqueueEvaluationRetry({
      userId: item.userId,
      programId: item.programId,
      error: item.error,
      now,
    });

    return null;
  }
}

/**
 * Claims due jobs from Redis with atomic lease locking.
 * Safe for multi-instance serverless deployments.
 */
export async function claimDueRecoveryJobs(
  limit: number = DEFAULT_MAX_BATCH_SIZE,
  workerId: string = `worker-${Math.random().toString(36).slice(2, 8)}`,
  now: Date = new Date(),
  leaseDurationMs: number = DEFAULT_LEASE_DURATION_MS,
): Promise<DurableRecoveryJob[]> {
  const redis = getRecoveryRedisClient();
  const dueJobKeys = await redis.zrange(REDIS_KEY_RECOVERY_DUE, 0, now.getTime(), {
    byScore: true,
    count: limit,
  });

  const claimedJobs: DurableRecoveryJob[] = [];
  const leaseSeconds = Math.max(1, Math.ceil(leaseDurationMs / 1000));

  for (const jobKey of dueJobKeys) {
    const lockKey = `${REDIS_KEY_RECOVERY_LOCK_PREFIX}${jobKey}`;

    // Atomic claim via SET NX with lease TTL
    const lockResult = await redis.set(lockKey, workerId, {
      nx: true,
      ex: leaseSeconds,
    });

    if (lockResult !== "OK") {
      // Job is currently claimed and active by another worker
      continue;
    }

    // Acquired lease lock, retrieve job data
    const rawJob = await redis.get(`${REDIS_KEY_RECOVERY_JOB_PREFIX}${jobKey}`);
    if (!rawJob) {
      // Stale index entry; clean up
      await redis.zrem(REDIS_KEY_RECOVERY_DUE, jobKey);
      await redis.del(lockKey);
      continue;
    }

    const job: DurableRecoveryJob =
      typeof rawJob === "string" ? JSON.parse(rawJob) : (rawJob as DurableRecoveryJob);

    job.leaseExpiresAt = now.getTime() + leaseDurationMs;
    job.claimedBy = workerId;

    await redis.set(`${REDIS_KEY_RECOVERY_JOB_PREFIX}${jobKey}`, JSON.stringify(job));
    claimedJobs.push(job);
  }

  return claimedJobs;
}

/**
 * Completes a job upon successful qualification evaluation and removes it from all active structures.
 */
export async function completeRecoveryJob(jobKey: string): Promise<void> {
  const redis = getRecoveryRedisClient();
  const lockKey = `${REDIS_KEY_RECOVERY_LOCK_PREFIX}${jobKey}`;
  const jobPayloadKey = `${REDIS_KEY_RECOVERY_JOB_PREFIX}${jobKey}`;

  await redis.zrem(REDIS_KEY_RECOVERY_DUE, jobKey);
  await redis.del(jobPayloadKey, lockKey);
}

/**
 * Reschedules a failed recovery job with exponential backoff or routes to DLQ if max attempts reached.
 */
export async function rescheduleRecoveryJob(
  job: DurableRecoveryJob,
  error: unknown,
  now: Date = new Date(),
): Promise<{ movedToDlq: boolean; nextRetryAt?: number }> {
  const redis = getRecoveryRedisClient();
  const jobKey = getJobKey(job.userId, job.programId);
  const lockKey = `${REDIS_KEY_RECOVERY_LOCK_PREFIX}${jobKey}`;
  const jobPayloadKey = `${REDIS_KEY_RECOVERY_JOB_PREFIX}${jobKey}`;

  const attempts = job.attempts + 1;
  const lastError =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Evaluation failure";

  if (attempts >= job.maxAttempts) {
    // Exceeded maximum retry attempts: move to Dead-Letter Queue (DLQ)
    const deadLetterItem: DeadLetterItem = {
      job: {
        ...job,
        attempts,
        lastError,
      },
      failedAt: now.getTime(),
      finalError: lastError,
    };

    await redis.lpush(REDIS_KEY_RECOVERY_DLQ, JSON.stringify(deadLetterItem));
    await redis.zrem(REDIS_KEY_RECOVERY_DUE, jobKey);
    await redis.del(jobPayloadKey, lockKey);

    console.error(
      `[WL Recovery] Maximum retry attempts (${job.maxAttempts}) exceeded for user ${job.userId}. Moved to dead-letter queue (DLQ).`,
    );

    return { movedToDlq: true };
  }

  // Reschedule with exponential backoff
  const backoffMs = calculateBackoffMs(attempts);
  const nextRetryAt = now.getTime() + backoffMs;

  const updatedJob: DurableRecoveryJob = {
    ...job,
    attempts,
    nextRetryAt,
    lastError,
    leaseExpiresAt: undefined,
    claimedBy: undefined,
  };

  await redis.set(jobPayloadKey, JSON.stringify(updatedJob));
  await redis.zadd(REDIS_KEY_RECOVERY_DUE, {
    score: nextRetryAt,
    member: jobKey,
  });
  await redis.del(lockKey); // Release lock for next schedule

  return { movedToDlq: false, nextRetryAt };
}

/**
 * Retrieves dead-letter items for inspection / troubleshooting.
 */
export async function getDeadLetterQueue(limit: number = 50): Promise<DeadLetterItem[]> {
  const redis = getRecoveryRedisClient();
  const items = await redis.lrange(REDIS_KEY_RECOVERY_DLQ, 0, limit - 1);
  return items.map((raw) => (typeof raw === "string" ? JSON.parse(raw) : (raw as DeadLetterItem)));
}

/**
 * Resolves the active Whitelist program ID if omitted in recovery job.
 */
async function resolveTargetProgramId(prismaOrTx: any): Promise<string> {
  const openProgram = await prismaOrTx.wLProgram.findFirst({
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!openProgram?.id) {
    throw new Error("No open Whitelist program found.");
  }
  return openProgram.id;
}

/**
 * Main worker execution function: processes due durable recovery jobs and in-memory fallback.
 * Strictly respects DEC-018 and DEC-022 invariants:
 * - Uses evaluateUserQualification with atomic capacity guard (lockWlProgramForUpdate).
 * - Never auto-promotes FCFS queue entries.
 * - REVOKED users remain terminal.
 */
export async function processDurableRecoveryQueue(
  prisma: PrismaClient | any,
  options?: {
    now?: Date;
    maxBatchSize?: number;
    workerId?: string;
  },
): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  movedToDlq: number;
}> {
  const now = options?.now ?? new Date();
  const maxBatchSize = options?.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE;
  const workerId = options?.workerId ?? `worker-${Math.random().toString(36).slice(2, 8)}`;

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let movedToDlq = 0;

  // 1. Claim due durable jobs
  const claimedJobs = await claimDueRecoveryJobs(maxBatchSize, workerId, now);

  for (const job of claimedJobs) {
    processed++;
    const jobKey = getJobKey(job.userId, job.programId);
    try {
      const targetProgramId = job.programId || (await resolveTargetProgramId(prisma));
      const result = await evaluateUserQualification(prisma, {
        userId: job.userId,
        programId: targetProgramId,
        now,
      });

      if (result) {
        await completeRecoveryJob(jobKey);
        succeeded++;
      } else {
        throw new Error("Evaluation returned no result");
      }
    } catch (err: unknown) {
      failed++;
      const res = await rescheduleRecoveryJob(job, err, now);
      if (res.movedToDlq) {
        movedToDlq++;
      }
    }
  }

  // 2. Process secondary in-memory fallback queue if any items are due
  const dueMemoryItems = getEvaluationRecoveryQueue().filter((item) => item.nextRetryAt <= now);
  for (const item of dueMemoryItems.slice(0, Math.max(0, maxBatchSize - claimedJobs.length))) {
    processed++;
    const memoryKey = `${item.userId}:${item.programId || "default"}`;
    try {
      const targetProgramId = item.programId || (await resolveTargetProgramId(prisma));
      const result = await evaluateUserQualification(prisma, {
        userId: item.userId,
        programId: targetProgramId,
        now,
      });

      if (result) {
        await completeRecoveryJob(memoryKey).catch(() => {});
        evaluationRecoveryQueue.delete(memoryKey);
        succeeded++;
      } else {
        throw new Error("In-memory evaluation returned no result");
      }
    } catch (err: unknown) {
      failed++;
    }
  }

  return {
    processed,
    succeeded,
    failed,
    movedToDlq,
  };
}
