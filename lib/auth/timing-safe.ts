import crypto from "node:crypto";

/**
 * Constant-time string comparison that safely handles arbitrary lengths
 * by hashing both inputs with SHA-256 before invoking crypto.timingSafeEqual.
 *
 * This mitigates timing attacks on secrets and prevents RangeError when
 * string lengths differ.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}
