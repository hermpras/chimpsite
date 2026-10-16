import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, __clearRateLimitBuckets } from "@/lib/auth/rate-limit";

describe("in-memory per-IP rate limiter", () => {
  beforeEach(() => {
    __clearRateLimitBuckets();
  });

  it("allows requests up to the budget within one window", () => {
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) {
      const result = checkRateLimit("ip:1", 10, 60_000, now + i);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks the request that exceeds the budget and reports Retry-After", () => {
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) {
      checkRateLimit("ip:1", 10, 60_000, now);
    }
    const result = checkRateLimit("ip:1", 10, 60_000, now + 5_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("resets the budget when the window elapses", () => {
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) {
      checkRateLimit("ip:1", 10, 60_000, now);
    }
    expect(checkRateLimit("ip:1", 10, 60_000, now + 1_000).allowed).toBe(false);
    expect(checkRateLimit("ip:1", 10, 60_000, now + 60_001).allowed).toBe(true);
  });

  it("tracks different keys independently", () => {
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) {
      checkRateLimit("ip:1", 10, 60_000, now);
    }
    expect(checkRateLimit("ip:2", 10, 60_000, now).allowed).toBe(true);
  });
});
