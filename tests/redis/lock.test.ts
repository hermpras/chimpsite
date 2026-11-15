import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  acquireDistributedLock,
  releaseDistributedLock,
  getDropReplenishLockKey,
  __clearTestDistributedLocks,
  __setTestRedis,
} from "@/lib/redis/lock";

describe("Redis Distributed Lock (lib/redis/lock.ts)", () => {
  beforeEach(() => {
    __clearTestDistributedLocks();
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    __clearTestDistributedLocks();
  });

  describe("In-Memory Mode (Test & Local Development)", () => {
    it("successfully acquires lock on first invocation", async () => {
      const key = "lock:test-key-1";
      const result = await acquireDistributedLock(key, 15);

      expect(result.status).toBe("ACQUIRED");
      if (result.status === "ACQUIRED") {
        expect(result.token).toBeDefined();
        expect(typeof result.token).toBe("string");
        expect(result.token.length).toBeGreaterThan(10);
      }
    });

    it("rejects second acquisition on the exact same key as contention", async () => {
      const key = "lock:test-key-contention";
      const res1 = await acquireDistributedLock(key, 15);
      expect(res1.status).toBe("ACQUIRED");

      const res2 = await acquireDistributedLock(key, 15);
      expect(res2.status).toBe("CONTENTION");
    });

    it("allows acquiring lock on a different key concurrently", async () => {
      const key1 = "lock:test-key-a";
      const key2 = "lock:test-key-b";

      const res1 = await acquireDistributedLock(key1, 15);
      const res2 = await acquireDistributedLock(key2, 15);

      expect(res1.status).toBe("ACQUIRED");
      expect(res2.status).toBe("ACQUIRED");
      if (res1.status === "ACQUIRED" && res2.status === "ACQUIRED") {
        expect(res1.token).not.toBe(res2.token);
      }
    });

    it("does not release lock if token does not match", async () => {
      const key = "lock:test-key-token-mismatch";
      const res = await acquireDistributedLock(key, 15);
      expect(res.status).toBe("ACQUIRED");

      const released = await releaseDistributedLock(key, "invalid-token-1234");
      expect(released).toBe(false);

      // Lock must still be held
      const retry = await acquireDistributedLock(key, 15);
      expect(retry.status).toBe("CONTENTION");
    });

    it("releases lock when matching token is provided and allows re-acquisition", async () => {
      const key = "lock:test-key-release";
      const res = await acquireDistributedLock(key, 15);
      expect(res.status).toBe("ACQUIRED");
      const token = (res as any).token;

      const released = await releaseDistributedLock(key, token);
      expect(released).toBe(true);

      // Key should now be available for acquisition
      const reacquired = await acquireDistributedLock(key, 15);
      expect(reacquired.status).toBe("ACQUIRED");
    });

    it("clears locks via __clearTestDistributedLocks", async () => {
      const key = "lock:test-clear";
      const res1 = await acquireDistributedLock(key, 15);
      expect(res1.status).toBe("ACQUIRED");

      __clearTestDistributedLocks();

      const res2 = await acquireDistributedLock(key, 15);
      expect(res2.status).toBe("ACQUIRED");
    });

    it("expires in-memory lock after TTL has elapsed", async () => {
      vi.useFakeTimers();
      try {
        const key = "lock:test-ttl-expiry";
        const res1 = await acquireDistributedLock(key, 15);
        expect(res1.status).toBe("ACQUIRED");

        // Advance time by 16 seconds (past 15s TTL)
        vi.advanceTimersByTime(16_000);

        const res2 = await acquireDistributedLock(key, 15);
        expect(res2.status).toBe("ACQUIRED");
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("Mocked Upstash Redis Protocol & Edge Cases", () => {
    it("interacts with Upstash Redis client using SET NX EX 15", async () => {
      const mockSet = vi.fn().mockResolvedValue("OK");
      const mockRedis = {
        set: mockSet,
      } as any;

      __setTestRedis(mockRedis);

      const key = "lock:drop-replenish:drop-1:1794744000000";
      const result = await acquireDistributedLock(key, 15);

      expect(result.status).toBe("ACQUIRED");
      expect(mockSet).toHaveBeenCalledWith(
        key,
        expect.any(String),
        { nx: true, ex: 15 },
      );
    });

    it("identifies contention when Redis set returns null", async () => {
      const mockSet = vi.fn().mockResolvedValue(null);
      const mockRedis = {
        set: mockSet,
      } as any;

      __setTestRedis(mockRedis);

      const key = "lock:contended";
      const result = await acquireDistributedLock(key, 15);

      expect(result.status).toBe("CONTENTION");
      expect(mockSet).toHaveBeenCalledTimes(1);
    });

    it("distinguishes Redis network failure from contention", async () => {
      const mockSet = vi.fn().mockRejectedValue(new Error("Upstash REST Connection Refused"));
      const mockRedis = {
        set: mockSet,
      } as any;

      __setTestRedis(mockRedis);

      const key = "lock:failure";
      const result = await acquireDistributedLock(key, 15);

      expect(result.status).toBe("REDIS_FAILURE");
      if (result.status === "REDIS_FAILURE") {
        expect((result.error as Error).message).toContain("Connection Refused");
      }
    });

    it("distinguishes Redis operation timeout (>2000ms) as REDIS_FAILURE", async () => {
      const hangingSet = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 3000)),
      );
      const mockRedis = {
        set: hangingSet,
      } as any;

      __setTestRedis(mockRedis);

      const key = "lock:timeout";
      const result = await acquireDistributedLock(key, 15);

      expect(result.status).toBe("REDIS_FAILURE");
      if (result.status === "REDIS_FAILURE") {
        expect((result.error as Error).message).toContain("timed out after 2000ms");
      }
    });

    it("executes safe release via Lua script and verifies token", async () => {
      const mockEval = vi.fn().mockResolvedValue(1);
      const mockRedis = {
        eval: mockEval,
      } as any;

      __setTestRedis(mockRedis);

      const key = "lock:lua-key";
      const token = "my-secret-token";
      const success = await releaseDistributedLock(key, token);

      expect(success).toBe(true);
      expect(mockEval).toHaveBeenCalledWith(
        expect.stringContaining("redis.call(\"get\", KEYS[1]) == ARGV[1]"),
        [key],
        [token],
      );
    });

    it("returns false if Lua script returns 0 (token mismatch or expired in Redis)", async () => {
      const mockEval = vi.fn().mockResolvedValue(0);
      const mockRedis = {
        eval: mockEval,
      } as any;

      __setTestRedis(mockRedis);

      const key = "lock:lua-key";
      const token = "stale-token";
      const success = await releaseDistributedLock(key, token);

      expect(success).toBe(false);
    });

    it("handles Lua script execution errors gracefully without throwing", async () => {
      const mockEval = vi.fn().mockRejectedValue(new Error("Upstash 503 Service Unavailable"));
      const mockRedis = {
        eval: mockEval,
      } as any;

      __setTestRedis(mockRedis);

      const key = "lock:lua-key";
      const success = await releaseDistributedLock(key, "token");

      expect(success).toBe(false);
    });
  });

  describe("Production Environment In-Memory Prevention", () => {
    it("strictly refuses in-memory lock in production if Redis credentials are missing", async () => {
      const prevEnv = process.env.NODE_ENV;
      const prevUrl = process.env.UPSTASH_REDIS_REST_URL;
      const prevToken = process.env.UPSTASH_REDIS_REST_TOKEN;

      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = "production";
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;

        const result = await acquireDistributedLock("prod-key", 15);

        expect(result.status).toBe("REDIS_FAILURE");
        if (result.status === "REDIS_FAILURE") {
          expect((result.error as Error).message).toContain("production environment");
        }
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = prevEnv;
        if (prevUrl) process.env.UPSTASH_REDIS_REST_URL = prevUrl;
        if (prevToken) process.env.UPSTASH_REDIS_REST_TOKEN = prevToken;
      }
    });
  });

  describe("Lock Key Determinism", () => {
    it("generates deterministic key format lock:drop-replenish:<dropId>:<cycleStartsAtMs>", () => {
      const dropId = "drop-genesis-1";
      const cycleMs = 1794744000000;
      const key = getDropReplenishLockKey(dropId, cycleMs);

      expect(key).toBe("lock:drop-replenish:drop-genesis-1:1794744000000");
    });
  });
});
