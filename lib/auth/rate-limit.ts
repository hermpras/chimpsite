/**
 * Minimal in-memory per-IP rate limiter (fixed window).
 *
 * Scope: local development and single-instance deployments only.
 *
 * PRODUCTION REQUIREMENT — shared/distributed rate limiting is REQUIRED for
 * any multi-instance or serverless production deployment. This limiter lives
 * in the Node.js process memory, so it does NOT share state across
 * instances, serverless invocations, or process restarts. Each instance
 * enforces its own independent budget: with N instances the effective limit
 * is N x the configured budget, and an attacker rotating across instances
 * (or waiting out a restart) is not tracked. Before production launch,
 * replace this module's backend with a shared store (e.g. Redis / Upstash
 * rate limiting). The call sites (`app/api/auth/nonce/route.ts`,
 * `app/api/auth/verify/route.ts`) need no changes — only this module's
 * storage backend.
 *
 * Introduces no new dependencies by design.
 */

/** Default budget for the nonce endpoint: 10 requests / 60s per IP. */
export const NONCE_RATE_LIMIT_MAX = 10;
export const NONCE_RATE_LIMIT_WINDOW_MS = 60_000;

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the current window resets (for the Retry-After header). */
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Record one request for `key` against a fixed window.
 * `now` is injectable for deterministic tests.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number = NONCE_RATE_LIMIT_MAX,
  windowMs: number = NONCE_RATE_LIMIT_WINDOW_MS,
  now: number = Date.now(),
): RateLimitResult {
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
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

/**
 * Test-only hook: clear all buckets.
 * Never call in production code.
 */
export function __clearRateLimitBuckets(): void {
  buckets.clear();
}
