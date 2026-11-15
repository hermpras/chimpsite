import { Redis } from "@upstash/redis";

let redisClient: Redis | null = null;
let customRedis: Redis | null = null;

// In-memory locks map used exclusively for unit testing and local development
// when Upstash Redis credentials are not configured.
const inMemoryLocks = new Map<string, { token: string; expiresAt: number }>();

export type AcquireLockResult =
  | { status: "ACQUIRED"; token: string }
  | { status: "CONTENTION" }
  | { status: "REDIS_FAILURE"; error: unknown };

const RELEASE_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

function getRedisClient(): Redis | null {
  if (customRedis) {
    return customRedis;
  }
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    return null;
  }

  if (!redisClient) {
    redisClient = new Redis({ url, token });
  }
  return redisClient;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 2000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`[RedisLock] Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Returns deterministic lock key for auto-replenishment of a specific drop cycle.
 */
export function getDropReplenishLockKey(dropId: string, cycleStartsAtMs: number): string {
  return `lock:drop-replenish:${dropId}:${cycleStartsAtMs}`;
}

/**
 * Atomically acquires a distributed lock via Upstash Redis (`SET key token NX EX 15`).
 *
 * Distinguishes three states:
 * 1. ACQUIRED: Lock was successfully acquired by this instance. Token is returned.
 * 2. CONTENTION: Lock is currently held by another instance.
 * 3. REDIS_FAILURE: Redis is unavailable, timed out, or unauthenticated.
 */
export async function acquireDistributedLock(
  key: string,
  ttlSeconds: number = 15,
): Promise<AcquireLockResult> {
  const token = crypto.randomUUID();
  const redis = getRedisClient();

  if (!redis) {
    // In production, missing credentials must be treated as a Redis failure,
    // prompting graceful fallback to PostgreSQL advisory locks without in-memory substitution.
    if (process.env.NODE_ENV === "production") {
      const err = new Error("[RedisLock] Missing Upstash Redis credentials in production environment.");
      console.warn(err.message);
      return { status: "REDIS_FAILURE", error: err };
    }

    // In-memory fallback allowed only in test and local development environments
    const now = Date.now();
    const existing = inMemoryLocks.get(key);
    if (existing && existing.expiresAt > now) {
      return { status: "CONTENTION" };
    }

    inMemoryLocks.set(key, {
      token,
      expiresAt: now + ttlSeconds * 1000,
    });
    return { status: "ACQUIRED", token };
  }

  try {
    const response = await withTimeout(
      redis.set(key, token, { nx: true, ex: ttlSeconds }),
      2000,
    );

    if (response === "OK") {
      return { status: "ACQUIRED", token };
    }

    return { status: "CONTENTION" };
  } catch (error) {
    console.warn("[RedisLock] Redis lock acquisition failed:", error);
    return { status: "REDIS_FAILURE", error };
  }
}

/**
 * Atomically releases the distributed lock using a Lua script to ensure
 * the key is deleted ONLY if the current value matches the caller's token.
 */
export async function releaseDistributedLock(
  key: string,
  token: string,
): Promise<boolean> {
  const redis = getRedisClient();

  if (!redis) {
    if (process.env.NODE_ENV === "production") {
      return false;
    }
    const existing = inMemoryLocks.get(key);
    if (existing && existing.token === token) {
      inMemoryLocks.delete(key);
      return true;
    }
    return false;
  }

  try {
    const result = await withTimeout(
      redis.eval<[string], number>(RELEASE_LOCK_LUA, [key], [token]),
      2000,
    );
    return Number(result) === 1;
  } catch (error) {
    console.warn(`[RedisLock] Failed to release lock for key ${key}:`, error);
    return false;
  }
}

/**
 * Test helper to clear in-memory state and custom clients between unit tests.
 */
export function __clearTestDistributedLocks(): void {
  inMemoryLocks.clear();
  redisClient = null;
  customRedis = null;
}

/**
 * Test helper to inject a mock Redis client for isolated test assertions.
 */
export function __setTestRedis(client: Redis | null): void {
  customRedis = client;
}
