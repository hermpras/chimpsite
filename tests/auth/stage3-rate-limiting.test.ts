import { describe, it, expect } from "vitest";
import {
  DROPS_CLAIM_RATE_LIMIT_MAX,
  DROPS_CLAIM_RATE_LIMIT_WINDOW_MS,
  DROPS_CLAIM_IP_RATE_LIMIT_MAX,
  DROPS_CLAIM_IP_RATE_LIMIT_WINDOW_MS,
  GIFTS_SEND_RATE_LIMIT_MAX,
  GIFTS_SEND_RATE_LIMIT_WINDOW_MS,
  WHITELIST_QUALIFY_RATE_LIMIT_MAX,
  WHITELIST_QUALIFY_RATE_LIMIT_WINDOW_MS,
  isValidClientIp,
} from "@/lib/auth/rate-limit";

describe("Stage 3 Routes Rate Limiting Budgets & Constants (Task 3-B & DEC-012)", () => {
  it("defines the exact budgets specified in chimphood-implementation-plan.md v2", () => {
    // POST /api/drops/claim (wallet): 5 req / 120s
    expect(DROPS_CLAIM_RATE_LIMIT_MAX).toBe(5);
    expect(DROPS_CLAIM_RATE_LIMIT_WINDOW_MS).toBe(120_000);

    // POST /api/drops/claim (IP per DEC-012): 10 req / 60s
    expect(DROPS_CLAIM_IP_RATE_LIMIT_MAX).toBe(10);
    expect(DROPS_CLAIM_IP_RATE_LIMIT_WINDOW_MS).toBe(60_000);

    // POST /api/gifts: 10 req / 60s
    expect(GIFTS_SEND_RATE_LIMIT_MAX).toBe(10);
    expect(GIFTS_SEND_RATE_LIMIT_WINDOW_MS).toBe(60_000);

    // POST /api/whitelist/qualify: 3 req / 300s
    expect(WHITELIST_QUALIFY_RATE_LIMIT_MAX).toBe(3);
    expect(WHITELIST_QUALIFY_RATE_LIMIT_WINDOW_MS).toBe(300_000);
  });

  describe("isValidClientIp helper", () => {
    it("accepts valid IPv4 addresses", () => {
      expect(isValidClientIp("198.51.100.1")).toBe(true);
      expect(isValidClientIp("127.0.0.1")).toBe(true);
      expect(isValidClientIp("10.0.0.255")).toBe(true);
      expect(isValidClientIp("0.0.0.0")).toBe(true);
      expect(isValidClientIp(" 192.168.1.1 ")).toBe(true);
    });

    it("accepts valid IPv6 addresses", () => {
      expect(isValidClientIp("::1")).toBe(true);
      expect(isValidClientIp("2001:db8::1")).toBe(true);
      expect(isValidClientIp("fe80::1ff:fe23:4567:890a")).toBe(true);
    });

    it("rejects invalid, unknown, empty, or malformed IP values", () => {
      expect(isValidClientIp("unknown")).toBe(false);
      expect(isValidClientIp("UNKNOWN")).toBe(false);
      expect(isValidClientIp("")).toBe(false);
      expect(isValidClientIp("   ")).toBe(false);
      expect(isValidClientIp(null)).toBe(false);
      expect(isValidClientIp(undefined)).toBe(false);
      expect(isValidClientIp("256.0.0.1")).toBe(false);
      expect(isValidClientIp("192.168.1")).toBe(false);
      expect(isValidClientIp("192.168.1.1.1")).toBe(false);
      expect(isValidClientIp("not-an-ip")).toBe(false);
      expect(isValidClientIp("192.168.1.1; rm -rf /")).toBe(false);
    });
  });
});
