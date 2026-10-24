import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DROPS_CLAIM_RATE_LIMIT_MAX,
  DROPS_CLAIM_RATE_LIMIT_WINDOW_MS,
  GIFTS_SEND_RATE_LIMIT_MAX,
  GIFTS_SEND_RATE_LIMIT_WINDOW_MS,
  WHITELIST_QUALIFY_RATE_LIMIT_MAX,
  WHITELIST_QUALIFY_RATE_LIMIT_WINDOW_MS,
} from "@/lib/auth/rate-limit";

describe("Stage 3 Routes Rate Limiting Budgets & Constants (Task 3-B)", () => {
  it("defines the exact budgets specified in chimphood-implementation-plan.md v2", () => {
    // POST /api/drops/claim: 5 req / 120s
    expect(DROPS_CLAIM_RATE_LIMIT_MAX).toBe(5);
    expect(DROPS_CLAIM_RATE_LIMIT_WINDOW_MS).toBe(120_000);

    // POST /api/gifts: 10 req / 60s
    expect(GIFTS_SEND_RATE_LIMIT_MAX).toBe(10);
    expect(GIFTS_SEND_RATE_LIMIT_WINDOW_MS).toBe(60_000);

    // POST /api/whitelist/qualify: 3 req / 300s
    expect(WHITELIST_QUALIFY_RATE_LIMIT_MAX).toBe(3);
    expect(WHITELIST_QUALIFY_RATE_LIMIT_WINDOW_MS).toBe(300_000);
  });
});
