/**
 * SIWE nonce generation utilities.
 *
 * Nonces must be:
 *  - Cryptographically unpredictable (256-bit CSPRNG)
 *  - Short-lived (NONCE_TTL_MS)
 *  - Consumable only once (enforced by the API route + DB)
 */
import crypto from "node:crypto";

/** Nonce time-to-live: 10 minutes. */
export const NONCE_TTL_MS = 10 * 60 * 1000;

/**
 * EIP-4361 requires the nonce to be alphanumeric. Base64url is NOT safe
 * here (`-` and `_` make the SIWE parser reject the message), so we map
 * CSPRNG bytes onto an alphanumeric alphabet instead.
 */
const NONCE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
/** 62^43 > 2^256, so 43 characters carry the full 256 bits of entropy. */
const NONCE_LENGTH = 43;

/**
 * Generate a cryptographically random nonce string.
 * 43 alphanumeric characters, 256-bit entropy (rejection sampling keeps the
 * per-character distribution unbiased: 248 is the largest multiple of 62
 * below 256).
 */
export function generateNonce(): string {
  const chars: string[] = [];
  while (chars.length < NONCE_LENGTH) {
    for (const byte of crypto.randomBytes(NONCE_LENGTH)) {
      if (byte < 248) {
        chars.push(NONCE_ALPHABET[byte % 62]);
        if (chars.length === NONCE_LENGTH) break;
      }
    }
  }
  return chars.join("");
}

/** Compute the expiry Date for a freshly issued nonce. */
export function nonceExpiresAt(): Date {
  return new Date(Date.now() + NONCE_TTL_MS);
}
