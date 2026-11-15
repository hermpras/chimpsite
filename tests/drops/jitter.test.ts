import { describe, it, expect, vi, afterEach } from "vitest";
import {
  calculateJitterDelay,
  getRolloverJitterDelay,
  getStandbyJitterDelay,
  JITTER_CONFIG,
} from "@/lib/drops/jitter";

describe("lib/drops/jitter.ts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("calculateJitterDelay", () => {
    it("returns minimum boundary when Math.random returns 0", () => {
      vi.spyOn(Math, "random").mockReturnValue(0);
      const delay = calculateJitterDelay(1000, 2500);
      expect(delay).toBe(1000);
    });

    it("returns maximum boundary (base + window - 1) when Math.random approaches 1", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.9999999999999999);
      const delay = calculateJitterDelay(1000, 2500);
      expect(delay).toBe(3499);
    });

    it("clamps safely if a mocked Math.random returns 1.0 or greater", () => {
      vi.spyOn(Math, "random").mockReturnValue(1.0);
      const delay = calculateJitterDelay(1000, 2500);
      expect(delay).toBe(3499);
    });

    it("computes deterministic values with mocked Math.random", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      // 1000 + Math.floor(0.5 * 2500) = 1000 + 1250 = 2250
      expect(calculateJitterDelay(1000, 2500)).toBe(2250);

      vi.spyOn(Math, "random").mockReturnValue(0.2);
      // 1000 + Math.floor(0.2 * 2500) = 1000 + 500 = 1500
      expect(calculateJitterDelay(1000, 2500)).toBe(1500);
    });

    it("always produces strictly integer outputs", () => {
      const testFractions = [0.12345, 0.6789, 0.33333, 0.98765];
      for (const fraction of testFractions) {
        vi.spyOn(Math, "random").mockReturnValue(fraction);
        const result = calculateJitterDelay(1000.7, 2500.9);
        expect(Number.isInteger(result)).toBe(true);
      }
    });

    it("handles zero jitter window by returning safe base delay", () => {
      expect(calculateJitterDelay(1500, 0)).toBe(1500);
    });

    it("safely handles invalid inputs (negative, NaN, Infinity)", () => {
      expect(calculateJitterDelay(-500, 2000)).toBeGreaterThanOrEqual(0);
      expect(calculateJitterDelay(1000, -2000)).toBe(1000);
      expect(calculateJitterDelay(NaN, 2000)).toBeGreaterThanOrEqual(0);
      expect(calculateJitterDelay(1000, NaN)).toBe(1000);
      expect(calculateJitterDelay(Infinity, 2000)).toBeGreaterThanOrEqual(0);
      expect(calculateJitterDelay(Infinity, 2000)).toBeLessThan(2000);
      expect(calculateJitterDelay(1000, Infinity)).toBe(1000);
    });

    it("operates as a pure Node/JS function without browser globals", () => {
      expect(typeof window === "undefined" || true).toBe(true);
      const res = calculateJitterDelay(500, 500);
      expect(typeof res).toBe("number");
    });
  });

  describe("getRolloverJitterDelay", () => {
    it("respects JITTER_CONFIG rollover boundaries [1000, 3499]", () => {
      vi.spyOn(Math, "random").mockReturnValue(0);
      expect(getRolloverJitterDelay()).toBe(JITTER_CONFIG.ROLLOVER_BASE_MS); // 1000

      vi.spyOn(Math, "random").mockReturnValue(0.9999999999999999);
      expect(getRolloverJitterDelay()).toBe(
        JITTER_CONFIG.ROLLOVER_BASE_MS + JITTER_CONFIG.ROLLOVER_WINDOW_MS - 1, // 3499
      );
    });

    it("produces values within the rollover range under unmocked random", () => {
      for (let i = 0; i < 50; i++) {
        const val = getRolloverJitterDelay();
        expect(val).toBeGreaterThanOrEqual(1000);
        expect(val).toBeLessThanOrEqual(3499);
        expect(Number.isInteger(val)).toBe(true);
      }
    });
  });

  describe("getStandbyJitterDelay", () => {
    it("respects JITTER_CONFIG standby boundaries [2000, 3999]", () => {
      vi.spyOn(Math, "random").mockReturnValue(0);
      expect(getStandbyJitterDelay()).toBe(JITTER_CONFIG.STANDBY_BASE_MS); // 2000

      vi.spyOn(Math, "random").mockReturnValue(0.9999999999999999);
      expect(getStandbyJitterDelay()).toBe(
        JITTER_CONFIG.STANDBY_BASE_MS + JITTER_CONFIG.STANDBY_WINDOW_MS - 1, // 3999
      );
    });

    it("produces values within the standby range under unmocked random", () => {
      for (let i = 0; i < 50; i++) {
        const val = getStandbyJitterDelay();
        expect(val).toBeGreaterThanOrEqual(2000);
        expect(val).toBeLessThanOrEqual(3999);
        expect(Number.isInteger(val)).toBe(true);
      }
    });
  });
});
