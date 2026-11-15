export const JITTER_CONFIG = {
  ROLLOVER_BASE_MS: 1000,
  ROLLOVER_WINDOW_MS: 2500,
  STANDBY_BASE_MS: 2000,
  STANDBY_WINDOW_MS: 2000,
  MAX_STANDBY_RETRIES: 5,
} as const;

/**
 * Calculates a jittered delay in milliseconds:
 * baseDelayMs + Math.floor(Math.random() * jitterWindowMs)
 *
 * Guaranteed to return a non-negative integer.
 * Validates inputs against negative, non-finite, or invalid numbers.
 */
export function calculateJitterDelay(
  baseDelayMs: number,
  jitterWindowMs: number,
): number {
  const safeBase = Number.isFinite(baseDelayMs) ? Math.max(0, Math.floor(baseDelayMs)) : 0;
  const safeWindow = Number.isFinite(jitterWindowMs) ? Math.max(0, Math.floor(jitterWindowMs)) : 0;

  if (safeWindow === 0) {
    return safeBase;
  }

  const randomFraction = Math.random();
  // Math.random() returns [0, 1). Clamping prevents overflow if a mock returns 1.0 or non-finite.
  const clampedFraction = Number.isFinite(randomFraction)
    ? Math.max(0, Math.min(randomFraction, 0.9999999999999999))
    : 0;

  return safeBase + Math.floor(clampedFraction * safeWindow);
}

/**
 * Returns a randomized rollover jitter delay (1000ms – 3499ms).
 */
export function getRolloverJitterDelay(): number {
  return calculateJitterDelay(
    JITTER_CONFIG.ROLLOVER_BASE_MS,
    JITTER_CONFIG.ROLLOVER_WINDOW_MS,
  );
}

/**
 * Returns a randomized standby retry jitter delay (2000ms – 3999ms).
 */
export function getStandbyJitterDelay(): number {
  return calculateJitterDelay(
    JITTER_CONFIG.STANDBY_BASE_MS,
    JITTER_CONFIG.STANDBY_WINDOW_MS,
  );
}
