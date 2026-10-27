/**
 * Shared distributed rate limiter using Upstash Redis (@upstash/ratelimit).
 *
 * Scope: Multi-instance and serverless production deployments (Task 0-C).
 * Replaces the previous process-memory-only implementation.
 *
 * Production policy:
 * - Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
 * - Fails closed: Missing configuration or Redis failures throw RateLimitConfigError
 *   or RateLimitError. Never silently falls back to an in-memory store or invents
 *   false 429 rate limit responses on infrastructure failure.
 * - Call sites (app/api/auth/nonce/route.ts, app/api/auth/verify/route.ts) await
 *   checkRateLimit(key, maxRequests, windowMs).
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/** Default budget for the nonce endpoint: 10 requests / 60s per IP. */
export const NONCE_RATE_LIMIT_MAX = 10;
export const NONCE_RATE_LIMIT_WINDOW_MS = 60_000;

/** Stage 3 routes rate limit budgets (Task 3-B) */
export const DROPS_CLAIM_RATE_LIMIT_MAX = 5;
export const DROPS_CLAIM_RATE_LIMIT_WINDOW_MS = 120_000;

export const GIFTS_SEND_RATE_LIMIT_MAX = 10;
export const GIFTS_SEND_RATE_LIMIT_WINDOW_MS = 60_000;

export const WHITELIST_QUALIFY_RATE_LIMIT_MAX = 3;
export const WHITELIST_QUALIFY_RATE_LIMIT_WINDOW_MS = 300_000;

/** Task 4-C Evidence submission rate limit budget */
export const EVIDENCE_SUBMIT_RATE_LIMIT_MAX = 10;
export const EVIDENCE_SUBMIT_RATE_LIMIT_WINDOW_MS = 60_000;

/** Task 5-C Avatar render rate limit budget */
export const AVATAR_RENDER_RATE_LIMIT_MAX = 5;
export const AVATAR_RENDER_RATE_LIMIT_WINDOW_MS = 60_000;

/** Task 5-C Gift resolution (ACCEPT/REJECT/CANCEL) rate limit budget */
export const GIFTS_RESOLVE_RATE_LIMIT_MAX = 10;
export const GIFTS_RESOLVE_RATE_LIMIT_WINDOW_MS = 60_000;

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the current window resets (for the Retry-After header). */
  retryAfterSeconds: number;
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

export class RateLimitConfigError extends RateLimitError {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitConfigError";
  }
}

interface LimiterTarget {
  limit: (key: string) => Promise<{ success: boolean; reset: number }>;
}

let redisClient: Redis | null = null;
let customLimiter: LimiterTarget | null = null;
const limiters: Record<string, Ratelimit> = Object.create(null);

interface DevBucket {
  count: number;
  windowStart: number;
}
const devBuckets = new Map<string, DevBucket>();

function checkDevRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
  now: number,
): RateLimitResult {
  const bucket = devBuckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    devBuckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (bucket.count < maxRequests) {
    bucket.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }
  const retryAfterSeconds = Math.max(
    Math.ceil((bucket.windowStart + windowMs - now) / 1000),
    1,
  );
  return { allowed: false, retryAfterSeconds };
}

function getRedisClient(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    throw new RateLimitConfigError(
      "Missing Upstash Redis credentials. UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured.",
    );
  }

  if (!redisClient) {
    redisClient = new Redis({ url, token });
  }
  return redisClient;
}

function getLimiter(maxRequests: number, windowMs: number): LimiterTarget {
  // Validate credentials first — fail-closed if missing
  const redis = getRedisClient();

  if (customLimiter) {
    return customLimiter;
  }

  const cacheKey = `${maxRequests}:${windowMs}`;
  let limiter = limiters[cacheKey];
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(maxRequests, `${windowMs} ms`),
      prefix: "@chimphood/ratelimit",
    });
    limiters[cacheKey] = limiter;
  }
  return limiter;
}

/**
 * Record one request for `key` against a distributed sliding window.
 * `now` is injectable for deterministic tests.
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number = NONCE_RATE_LIMIT_MAX,
  windowMs: number = NONCE_RATE_LIMIT_WINDOW_MS,
  now: number = Date.now(),
): Promise<RateLimitResult> {
  // In local development, if Upstash credentials are not configured,
  // gracefully fall back to in-memory rate limiting to allow seamless local testing.
  const hasUpstashConfig = Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );

  if (!hasUpstashConfig && process.env.NODE_ENV === "development" && !customLimiter) {
    return checkDevRateLimit(key, maxRequests, windowMs, now);
  }

  const limiter = getLimiter(maxRequests, windowMs);

  try {
    const result = await limiter.limit(key);
    const retryAfterSeconds = result.success
      ? 0
      : Math.max(Math.ceil((result.reset - now) / 1000), 1);

    return {
      allowed: result.success,
      retryAfterSeconds,
    };
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw error;
    }
    console.error("Rate limiter Redis failure:", error);
    throw new RateLimitError("Rate limiter unavailable due to Redis failure.", error);
  }
}

/**
 * Test-only hook: clear all limiters and cached instances.
 * Preserves compatibility with existing test suites calling __clearRateLimitBuckets.
 */
export function __clearRateLimitBuckets(): void {
  devBuckets.clear();
  for (const k of Object.keys(limiters)) {
    delete limiters[k];
  }
  redisClient = null;
  customLimiter = null;
}

/**
 * Test-only hook: inject custom limiter instance for isolated testing.
 */
export function __setTestLimiter(limiter: LimiterTarget | null): void {
  customLimiter = limiter;
}
