import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  checkRateLimit,
  __clearRateLimitBuckets,
  RateLimitConfigError,
  RateLimitError,
} from "@/lib/auth/rate-limit";

// Mock @upstash/redis so tests run without real network I/O
vi.mock("@upstash/redis", () => {
  class MockRedis {}
  return {
    Redis: MockRedis,
  };
});

// Mock @upstash/ratelimit with controllable sliding window and failure simulation
const { mockLimit, mockSlidingWindow } = vi.hoisted(() => ({
  mockLimit: vi.fn(),
  mockSlidingWindow: vi.fn().mockReturnValue("sliding-window-algorithm"),
}));

vi.mock("@upstash/ratelimit", () => {
  class MockRatelimit {
    static slidingWindow = mockSlidingWindow;
    static fixedWindow = vi.fn();
    limit = mockLimit;
    constructor(public options: unknown) {}
  }

  return {
    Ratelimit: MockRatelimit,
  };
});

describe("shared distributed rate limiter (Upstash Redis — Task 0-C)", () => {
  const originalEnv = { ...process.env };
  let simulatedBuckets: Record<string, { count: number; windowStart: number }>;

  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://mock-redis.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "mock-redis-token-12345";
    __clearRateLimitBuckets();
    mockLimit.mockReset();

    // Default stateful sliding-window simulation (10 req / 60s per key)
    simulatedBuckets = {};
    mockLimit.mockImplementation(async (key: string) => {
      const now = Date.now();
      const current = simulatedBuckets[key] ?? { count: 0, windowStart: now };
      if (now - current.windowStart >= 60_000) {
        current.count = 1;
        current.windowStart = now;
        simulatedBuckets[key] = current;
        return { success: true, reset: current.windowStart + 60_000 };
      }
      if (current.count < 10) {
        current.count += 1;
        simulatedBuckets[key] = current;
        return { success: true, reset: current.windowStart + 60_000 };
      }
      return { success: false, reset: current.windowStart + 60_000 };
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("1. Allowed Requests", () => {
    it("allows requests up to the budget within one window", async () => {
      const now = 1_000_000;
      for (let i = 0; i < 10; i++) {
        mockLimit.mockResolvedValueOnce({ success: true, reset: now + 60_000 });
        const result = await checkRateLimit("ip:1", 10, 60_000, now + i);
        expect(result.allowed).toBe(true);
        expect(result.retryAfterSeconds).toBe(0);
      }
    });
  });

  describe("2. Blocked Requests", () => {
    it("blocks requests that exceed the budget and calculates Retry-After", async () => {
      const windowStart = 1_000_000;
      const resetTime = windowStart + 60_000;
      mockLimit.mockResolvedValueOnce({ success: false, reset: resetTime });

      const now = windowStart + 5_000;
      const result = await checkRateLimit("ip:1", 10, 60_000, now);

      expect(result.allowed).toBe(false);
      expect(result.retryAfterSeconds).toBe(55);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
    });

    it("ensures minimum Retry-After of 1 second when close to reset", async () => {
      const now = 1_060_000;
      mockLimit.mockResolvedValueOnce({ success: false, reset: now + 200 });

      const result = await checkRateLimit("ip:1", 10, 60_000, now);

      expect(result.allowed).toBe(false);
      expect(result.retryAfterSeconds).toBe(1);
    });
  });

  describe("3. Window Reset & Independent Keys", () => {
    it("resets the budget when the window elapses", async () => {
      const window1Reset = 1_060_000;
      mockLimit.mockResolvedValueOnce({ success: false, reset: window1Reset });
      const blocked = await checkRateLimit("ip:1", 10, 60_000, 1_001_000);
      expect(blocked.allowed).toBe(false);

      // Window elapses
      const window2Reset = 1_120_000;
      mockLimit.mockResolvedValueOnce({ success: true, reset: window2Reset });
      const allowed = await checkRateLimit("ip:1", 10, 60_000, 1_060_001);
      expect(allowed.allowed).toBe(true);
      expect(allowed.retryAfterSeconds).toBe(0);
    });

    it("tracks different keys independently", async () => {
      // Key 1 is blocked
      mockLimit.mockImplementation(async (key: string) => {
        if (key === "ip:1") {
          return { success: false, reset: 1_060_000 };
        }
        return { success: true, reset: 1_060_000 };
      });

      const res1 = await checkRateLimit("ip:1", 10, 60_000, 1_000_000);
      const res2 = await checkRateLimit("ip:2", 10, 60_000, 1_000_000);

      expect(res1.allowed).toBe(false);
      expect(res2.allowed).toBe(true);
    });
  });

  describe("4. Missing Configuration (Fail-Closed Policy)", () => {
    it("throws RateLimitConfigError when UPSTASH_REDIS_REST_URL is missing", async () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      __clearRateLimitBuckets();

      await expect(checkRateLimit("ip:1")).rejects.toThrow(RateLimitConfigError);
      await expect(checkRateLimit("ip:1")).rejects.toThrow(
        /Missing Upstash Redis credentials.*UPSTASH_REDIS_REST_URL/,
      );
    });

    it("throws RateLimitConfigError when UPSTASH_REDIS_REST_TOKEN is missing", async () => {
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      __clearRateLimitBuckets();

      await expect(checkRateLimit("ip:1")).rejects.toThrow(RateLimitConfigError);
      await expect(checkRateLimit("ip:1")).rejects.toThrow(
        /Missing Upstash Redis credentials.*UPSTASH_REDIS_REST_TOKEN/,
      );
    });

    it("does not silently fall back to an in-memory limiter when credentials are unset", async () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      __clearRateLimitBuckets();

      // Must reject, NEVER return { allowed: true } or { allowed: false }
      let thrown: unknown = null;
      try {
        await checkRateLimit("ip:1");
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(RateLimitConfigError);
    });
  });

  describe("5. Redis Errors & Failure Handling (Fail-Closed Policy)", () => {
    it("throws RateLimitError when Redis connection is refused", async () => {
      const redisErr = new Error("connect ECONNREFUSED 127.0.0.1:6379");
      mockLimit.mockRejectedValueOnce(redisErr);

      await expect(checkRateLimit("ip:1")).rejects.toThrow(RateLimitError);
    });

    it("preserves the underlying error as cause and does not invent false 429", async () => {
      const redisErr = new Error("Upstash REST API HTTP 500: Internal Server Error");
      mockLimit.mockRejectedValueOnce(redisErr);

      let thrown: any = null;
      try {
        await checkRateLimit("ip:1");
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(RateLimitError);
      expect(thrown.message).toMatch(/Rate limiter unavailable due to Redis failure/);
      expect(thrown.cause).toBe(redisErr);
      // Confirms it did not return an allowed/blocked RateLimitResult
      expect(thrown.allowed).toBeUndefined();
    });
  });
});
