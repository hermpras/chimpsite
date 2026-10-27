export const DEFAULT_CYCLE_DURATION_HOURS = 2.5; // 2.5 hours total (30 min claim + 120 min cooldown)
export const HYPE_CONTROL_CYCLE_DURATION_HOURS = 5;

export const CLAIM_WINDOW_DURATION_MS = 30 * 60 * 1000; // 30 minutes
export const COOLDOWN_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours (120 minutes) cooldown after claim window
export const CYCLE_DURATION_MS = CLAIM_WINDOW_DURATION_MS + COOLDOWN_DURATION_MS; // 2.5 hours (9,000,000 ms)
export const MIN_CONFIG_LOCK_LEAD_MS = 15 * 60 * 1000; // 15 minutes

export interface CycleTimes {
  startsAt: Date;
  claimWindowEndsAt: Date;
  endsAt: Date;
  configLockAt: Date;
  cycleDurationHours: number;
}

/**
 * Calculates current cycle boundaries.
 * Supports:
 * - 2-hour Standard Mode: aligned to midnight UTC [00:00, 02:00, 04:00, ...]
 * - 5-hour Hype Control Mode: aligned to anchor start time or midnight UTC
 */
export function getUtcCycleForTime(
  date: Date = new Date(),
  cycleDurationHours: number = DEFAULT_CYCLE_DURATION_HOURS,
  anchorTime?: Date,
): CycleTimes {
  const durationMs = cycleDurationHours * 60 * 60 * 1000;
  const time = date.getTime();

  let cycleStartMs: number;

  if (anchorTime) {
    const anchorMs = anchorTime.getTime();
    const msSinceAnchor = time - anchorMs;
    const cycleIndex = Math.floor(msSinceAnchor / durationMs);
    cycleStartMs = anchorMs + cycleIndex * durationMs;
  } else {
    const dayStart = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
    ).getTime();
    const msIntoDay = time - dayStart;
    const cycleIndex = Math.floor(msIntoDay / durationMs);
    cycleStartMs = dayStart + cycleIndex * durationMs;
  }

  const startsAt = new Date(cycleStartMs);
  const claimWindowEndsAt = new Date(cycleStartMs + CLAIM_WINDOW_DURATION_MS);
  const endsAt = new Date(cycleStartMs + durationMs);
  const configLockAt = new Date(cycleStartMs - MIN_CONFIG_LOCK_LEAD_MS);

  return { startsAt, claimWindowEndsAt, endsAt, configLockAt, cycleDurationHours };
}

/**
 * Validates whether `now` is strictly within the 30-minute claim window from `startsAt`.
 */
export function isWithinClaimWindow(startsAt: Date, now: Date = new Date()): boolean {
  const nowMs = now.getTime();
  const startMs = startsAt.getTime();
  const windowEndMs = startMs + CLAIM_WINDOW_DURATION_MS;
  return nowMs >= startMs && nowMs <= windowEndMs;
}

/**
 * Validates whether stock configuration/edits are permitted for a period.
 * Must be at least 15 minutes before startsAt, and strictly before startsAt.
 */
export function canConfigureStock(
  startsAt: Date,
  configLockAt: Date,
  now: Date = new Date(),
): { allowed: boolean; reason?: string } {
  const nowMs = now.getTime();
  const startMs = startsAt.getTime();
  const lockMs = configLockAt.getTime();

  if (nowMs >= startMs) {
    return {
      allowed: false,
      reason: "Cannot configure stock after the period has started.",
    };
  }

  if (nowMs >= lockMs) {
    return {
      allowed: false,
      reason: "Stock configuration is locked (15-minute freeze window before start).",
    };
  }

  return { allowed: true };
}
