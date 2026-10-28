import { describe, it, expect } from "vitest";
import {
  getUtcCycleForTime,
  isWithinClaimWindow,
  canConfigureStock,
  CYCLE_DURATION_MS,
  CLAIM_WINDOW_DURATION_MS,
  MIN_CONFIG_LOCK_LEAD_MS,
} from "@/server/drops/schedule";

describe("Drop Schedule & Claim Window Boundaries", () => {
  it("aligns to 2.5-hour cycles (30m claim + 2h cooldown)", () => {
    // 2026-10-16 03:15:00 UTC -> should fall into 02:30 to 05:00 UTC cycle
    const date = new Date(Date.UTC(2026, 9, 16, 3, 15, 0));
    const cycle = getUtcCycleForTime(date);

    expect(cycle.startsAt.toISOString()).toBe("2026-10-16T02:30:00.000Z");
    expect(cycle.endsAt.toISOString()).toBe("2026-10-16T05:00:00.000Z");
    expect(cycle.claimWindowEndsAt.toISOString()).toBe("2026-10-16T03:00:00.000Z");
    expect(cycle.configLockAt.toISOString()).toBe("2026-10-16T02:15:00.000Z");
  });

  it("supports explicit 2-hour cycles when passed", () => {
    const date = new Date(Date.UTC(2026, 9, 16, 3, 15, 0));
    const cycle = getUtcCycleForTime(date, 2);

    expect(cycle.startsAt.toISOString()).toBe("2026-10-16T02:00:00.000Z");
    expect(cycle.endsAt.toISOString()).toBe("2026-10-16T04:00:00.000Z");
    expect(cycle.claimWindowEndsAt.toISOString()).toBe("2026-10-16T02:30:00.000Z");
    expect(cycle.configLockAt.toISOString()).toBe("2026-10-16T01:45:00.000Z");
  });

  it("identifies timestamps within and outside the 30-minute claim window", () => {
    const startsAt = new Date("2026-10-16T02:00:00.000Z");

    // Exactly at start
    expect(isWithinClaimWindow(startsAt, new Date("2026-10-16T02:00:00.000Z"))).toBe(
      true,
    );

    // Mid-window
    expect(isWithinClaimWindow(startsAt, new Date("2026-10-16T02:15:00.000Z"))).toBe(
      true,
    );

    // Exactly at 30 minutes boundary
    expect(isWithinClaimWindow(startsAt, new Date("2026-10-16T02:30:00.000Z"))).toBe(
      true,
    );

    // 1 millisecond before start
    expect(isWithinClaimWindow(startsAt, new Date("2026-10-16T01:59:59.999Z"))).toBe(
      false,
    );

    // 1 millisecond after window closes
    expect(isWithinClaimWindow(startsAt, new Date("2026-10-16T02:30:00.001Z"))).toBe(
      false,
    );

    // Late in the 2-hour cycle
    expect(isWithinClaimWindow(startsAt, new Date("2026-10-16T03:00:00.000Z"))).toBe(
      false,
    );
  });

  it("enforces 15-minute stock configuration lock before period start", () => {
    const startsAt = new Date("2026-10-16T02:00:00.000Z");
    const configLockAt = new Date("2026-10-16T01:45:00.000Z");

    // 20 minutes before start (allowed)
    const early = canConfigureStock(
      startsAt,
      configLockAt,
      new Date("2026-10-16T01:40:00.000Z"),
    );
    expect(early.allowed).toBe(true);

    // 10 minutes before start (within 15-min freeze window -> locked)
    const locked = canConfigureStock(
      startsAt,
      configLockAt,
      new Date("2026-10-16T01:50:00.000Z"),
    );
    expect(locked.allowed).toBe(false);
    expect(locked.reason).toContain("freeze window");

    // After period started -> strictly disallowed
    const afterStart = canConfigureStock(
      startsAt,
      configLockAt,
      new Date("2026-10-16T02:05:00.000Z"),
    );
    expect(afterStart.allowed).toBe(false);
    expect(afterStart.reason).toContain("after the period has started");
  });
});
