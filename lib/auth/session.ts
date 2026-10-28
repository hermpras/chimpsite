/**
 * Server-managed session utilities.
 *
 * Design:
 *  - A 256-bit CSPRNG raw token is generated at login.
 *  - The raw token is sealed inside an HttpOnly iron-session cookie.
 *  - Only the SHA-256 hash of the raw token is stored in the database.
 *    This means a DB breach does not expose usable session tokens.
 *  - Session validity is always verified server-side (DB lookup).
 *
 * SECURITY NOTES:
 *  - Never log, expose in URLs, or send to the client the raw token.
 *  - SESSION_SECRET must be at least 32 characters and kept private.
 *  - Secure flag is enabled in production; SameSite=Lax prevents CSRF for
 *    same-site navigations while allowing OAuth redirects.
 */
import crypto from "node:crypto";
import type { SessionOptions } from "iron-session";

/** Cookie name for the sealed session. */
export const SESSION_COOKIE_NAME = "chimphood_session";

/** Session time-to-live: 7 days. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Generate a cryptographically secure random session token.
 * 32 bytes → 64-char hex string.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Derive the DB-storable hash of a raw session token.
 * Only the hash is persisted; the raw token lives solely in the cookie.
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Compute the expiry Date for a new session. */
export function sessionExpiresAt(): Date {
  return new Date(Date.now() + SESSION_TTL_MS);
}

/** Shape of data stored inside the iron-session seal. */
export interface SessionData {
  /** ChimpHood User.id (cuid). */
  userId: string;
  /** Normalized (lowercase) EVM address that authenticated. */
  address: string;
  /** Raw session token. Hash is what lives in DB. NEVER expose outside server. */
  token: string;
}

/**
 * Build iron-session options from the environment.
 * Throws at startup if SESSION_SECRET is absent or too short — this is
 * intentional; a missing secret is a misconfiguration, not a runtime error
 * to swallow.
 */
export function getSessionOptions(): SessionOptions {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET environment variable must be set and be at least 32 characters long. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return {
    password: secret,
    cookieName: SESSION_COOKIE_NAME,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: SESSION_TTL_MS / 1000,
      path: "/",
    },
  };
}
