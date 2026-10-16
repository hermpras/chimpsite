export const CYCLE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours
export const CLAIM_WINDOW_DURATION_MS = 30 * 60 * 1000; // 30 minutes
export const MIN_CONFIG_LOCK_LEAD_MS = 15 * 60 * 1000; // 15 minutes

export interface CycleTimes {
  startsAt: Date;
  claimWindowEndsAt: Date;
  endsAt: Date;
  configLockAt: Date;
}

/**
 * Calculates current 2-hour UTC cycle boundaries aligned to midnight UTC:
 * [00:00-02:00, 02:00-04:00, 04:00-06:00, ...]
 */
export function getUtcCycleForTime(date: Date = new Date()): CycleTimes {
  const time = date.getTime();
  const dayStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  ).getTime();
  const msIntoDay = time - dayStart;
  const cycleIndex = Math.floor(msIntoDay / CYCLE_DURATION_MS);

  const cycleStartMs = dayStart + cycleIndex * CYCLE_DURATION_MS;
  const startsAt = new Date(cycleStartMs);
  const claimWindowEndsAt = new Date(cycleStartMs + CLAIM_WINDOW_DURATION_MS);
  const endsAt = new Date(cycleStartMs + CYCLE_DURATION_MS);
  const configLockAt = new Date(cycleStartMs - MIN_CONFIG_LOCK_LEAD_MS);

  return { startsAt, claimWindowEndsAt, endsAt, configLockAt };
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
