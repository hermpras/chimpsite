import { describe, it, expect } from "vitest";
import { timingSafeEqualString } from "@/lib/auth/timing-safe";

describe("lib/auth/timing-safe — timingSafeEqualString", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqualString("secret-token-12345", "secret-token-12345")).toBe(true);
    expect(timingSafeEqualString("", "")).toBe(true);
    expect(timingSafeEqualString("a", "a")).toBe(true);
  });

  it("returns false for different strings with same length", () => {
    expect(timingSafeEqualString("secret-token-12345", "secret-token-12349")).toBe(false);
    expect(timingSafeEqualString("a", "b")).toBe(false);
  });

  it("returns false safely without throwing RangeError for strings of different length", () => {
    expect(timingSafeEqualString("short", "much-longer-token-secret-value")).toBe(false);
    expect(timingSafeEqualString("much-longer-token-secret-value", "short")).toBe(false);
    expect(timingSafeEqualString("", "not-empty")).toBe(false);
    expect(timingSafeEqualString("not-empty", "")).toBe(false);
  });

  it("returns false safely for non-string inputs", () => {
    expect(timingSafeEqualString(null as any, "secret")).toBe(false);
    expect(timingSafeEqualString("secret", undefined as any)).toBe(false);
    expect(timingSafeEqualString(123 as any, "123")).toBe(false);
  });
});
