import { Redis } from "@upstash/redis";
import type { RecentDropPull } from "@/lib/drops/client";

export type { RecentDropPull };

let redisClient: Redis | null = null;
let customRedis: Redis | null = null;

// In-memory store for test & local development environments when Upstash Redis credentials are unset
const inMemoryRecentPulls = new Map<string, RecentDropPull[]>();

const MAX_RECENT_PULLS = 20;
const RECENT_PULLS_KEY_PREFIX = "drops:recent_pulls";

export function getRecentPullsKey(dropId: string): string {
  return `${RECENT_PULLS_KEY_PREFIX}:${dropId}`;
}

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
      reject(new Error(`[RecentPulls] Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Pushes a newly claimed drop pull onto the Upstash Redis List for the drop.
 * Atomically trims the list to retain only the latest 20 items.
 */
export async function pushRecentDropPull(
  dropId: string,
  pull: RecentDropPull,
): Promise<boolean> {
  const key = getRecentPullsKey(dropId);
  const redis = getRedisClient();

  if (!redis) {
    // In-memory fallback for local dev / tests
    const existing = inMemoryRecentPulls.get(key) || [];
    existing.unshift(pull);
    if (existing.length > MAX_RECENT_PULLS) {
      existing.length = MAX_RECENT_PULLS;
    }
    inMemoryRecentPulls.set(key, existing);
    return true;
  }

  try {
    const serialized = JSON.stringify(pull);
    await withTimeout(
      Promise.all([
        redis.lpush(key, serialized),
        redis.ltrim(key, 0, MAX_RECENT_PULLS - 1),
      ]),
      2000,
    );
    return true;
  } catch (error) {
    console.warn(`[RecentPulls] Failed to push pull to Redis (${key}):`, error);
    return false;
  }
}

/**
 * Retrieves the most recent drop pulls from the Upstash Redis List.
 * Returns null if Redis is unavailable, timed out, or unconfigured in production,
 * prompting the caller to fall back gracefully to PostgreSQL.
 */
export async function getRecentDropPullsFromRedis(
  dropId: string,
  limit: number = 8,
): Promise<RecentDropPull[] | null> {
  const key = getRecentPullsKey(dropId);
  const redis = getRedisClient();

  if (!redis) {
    if (process.env.NODE_ENV === "production") {
      return null;
    }
    const mem = inMemoryRecentPulls.get(key);
    return mem && mem.length > 0 ? mem.slice(0, limit) : null;
  }

  try {
    const rawItems = await withTimeout(
      redis.lrange<string>(key, 0, limit - 1),
      2000,
    );

    if (!rawItems || rawItems.length === 0) {
      return null;
    }

    const pulls: RecentDropPull[] = [];
    for (const item of rawItems) {
      try {
        const parsed = typeof item === "string" ? JSON.parse(item) : (item as RecentDropPull);
        if (parsed && typeof parsed === "object" && parsed.id && parsed.traitName) {
          pulls.push(parsed);
        }
      } catch {
        // Skip corrupted individual item
      }
    }

    return pulls.length > 0 ? pulls : null;
  } catch (error) {
    console.warn(`[RecentPulls] Failed to read recent pulls from Redis (${key}):`, error);
    return null;
  }
}

/**
 * Seeds or warms up the Redis List with recent claims retrieved from PostgreSQL.
 */
export async function seedRecentDropPullsToRedis(
  dropId: string,
  pulls: RecentDropPull[],
): Promise<boolean> {
  if (!pulls || pulls.length === 0) return false;
  const key = getRecentPullsKey(dropId);
  const redis = getRedisClient();

  if (!redis) {
    inMemoryRecentPulls.set(key, pulls.slice(0, MAX_RECENT_PULLS));
    return true;
  }

  try {
    // Reverse because LPUSH inserts at head; pushing oldest first leaves newest at index 0
    const serialized = [...pulls].reverse().map((p) => JSON.stringify(p));
    await withTimeout(
      Promise.all([
        redis.del(key),
        redis.lpush(key, ...serialized),
        redis.ltrim(key, 0, MAX_RECENT_PULLS - 1),
      ]),
      2000,
    );
    return true;
  } catch (error) {
    console.warn(`[RecentPulls] Failed to seed recent pulls to Redis (${key}):`, error);
    return false;
  }
}

/**
 * Test helpers for Vitest isolation
 */
export function __clearTestRecentPulls(): void {
  inMemoryRecentPulls.clear();
  redisClient = null;
  customRedis = null;
}

export function __setTestRecentPullsRedis(client: Redis | null): void {
  customRedis = client;
}
