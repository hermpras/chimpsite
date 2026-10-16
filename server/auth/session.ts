/**
 * Server-side session store: creation, validation, and revocation backed by
 * the AuthSession model, plus iron-session cookie helpers.
 *
 * Security model (see lib/auth/session.ts): the sealed HttpOnly cookie holds
 * the RAW token; the database holds only its SHA-256 hash. The cookie alone
 * is never trusted — every privileged read must go through
 * validateSessionToken() / authenticateRequest().
 *
 * The Prisma client is taken as a parameter (dependency injection) so the
 * database logic unit-tests with a fake store. The PrismaClient import is
 * type-only and erased at runtime. next/headers and iron-session are
 * imported dynamically so loading this module never touches the request
 * scope (mirrors the route testability convention).
 */
import type { PrismaClient } from "@prisma/client";
import {
  generateSessionToken,
  hashSessionToken,
  sessionExpiresAt,
  getSessionOptions,
  type SessionData,
} from "@/lib/auth/session";

export interface CreatedSession {
  sessionId: string;
  /** Raw token — seal into the cookie, never persist or log. */
  rawToken: string;
  expiresAt: Date;
}

export interface ValidatedSession {
  sessionId: string;
  userId: string;
  /** Normalized wallet address, or "" when the user has no wallet identity. */
  address: string;
}

/**
 * Create a session: persist ONLY the token hash, return the raw token for
 * the cookie. Throws on database errors.
 */
export async function createSession(
  prisma: PrismaClient,
  opts: { userId: string; address: string; ipAddress?: string; userAgent?: string },
): Promise<CreatedSession> {
  const rawToken = generateSessionToken();
  const record = await prisma.authSession.create({
    data: {
      userId: opts.userId,
      token: hashSessionToken(rawToken),
      expiresAt: sessionExpiresAt(),
      ipAddress: opts.ipAddress,
      userAgent: opts.userAgent,
    },
    select: { id: true, expiresAt: true },
  });
  return { sessionId: record.id, rawToken, expiresAt: record.expiresAt };
}

/**
 * Validate a raw session token against the database.
 * Returns null when the token is unknown, expired, revoked, or the user is banned.
 */
export async function validateSessionToken(
  prisma: PrismaClient,
  rawToken: string,
): Promise<ValidatedSession | null> {
  if (!rawToken || typeof rawToken !== "string") return null;
  const record = await prisma.authSession.findUnique({
    where: { token: hashSessionToken(rawToken) },
    select: {
      id: true,
      userId: true,
      revokedAt: true,
      expiresAt: true,
      user: {
        select: {
          isBanned: true,
          wallet: { select: { address: true } },
        },
      },
    },
  });
  if (!record) return null;
  if (record.revokedAt) return null;
  if (record.expiresAt <= new Date()) return null;
  if (record.user.isBanned) return null;
  return {
    sessionId: record.id,
    userId: record.userId,
    address: record.user.wallet?.address ?? "",
  };
}

/**
 * Read the sealed session cookie. Returns null when absent or invalid.
 * Throws when SESSION_SECRET is misconfigured (fail closed and loud).
 */
export async function getSessionData(): Promise<SessionData | null> {
  const { cookies } = await import("next/headers");
  const { getIronSession } = await import("iron-session");
  const session = await getIronSession<SessionData>(await cookies(), getSessionOptions());
  if (!session.userId || !session.token) return null;
  return { userId: session.userId, address: session.address, token: session.token };
}

/**
 * Full request authentication: sealed cookie -> database validation.
 * Defense in depth: the cookie's userId must match the DB session's userId.
 */
export async function authenticateRequest(
  prisma: PrismaClient,
): Promise<ValidatedSession | null> {
  const data = await getSessionData();
  if (!data) return null;
  const validated = await validateSessionToken(prisma, data.token);
  if (!validated || validated.userId !== data.userId) return null;
  return validated;
}

/**
 * Revoke one session by raw token. Returns true when a session was revoked.
 */
export async function revokeSessionToken(
  prisma: PrismaClient,
  rawToken: string,
): Promise<boolean> {
  if (!rawToken || typeof rawToken !== "string") return false;
  const res = await prisma.authSession.updateMany({
    where: { token: hashSessionToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return res.count > 0;
}

/**
 * Revoke all active sessions for a user ("log out everywhere").
 * Returns the number of sessions revoked.
 */
export async function revokeUserSessions(
  prisma: PrismaClient,
  userId: string,
): Promise<number> {
  const res = await prisma.authSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return res.count;
}

/** Seal { userId, address, token } into the iron-session cookie. */
export async function sealSessionCookie(data: SessionData): Promise<void> {
  const { cookies } = await import("next/headers");
  const { getIronSession } = await import("iron-session");
  const session = await getIronSession<SessionData>(await cookies(), getSessionOptions());
  session.userId = data.userId;
  session.address = data.address;
  session.token = data.token;
  await session.save();
}

/**
 * Destroy the iron-session cookie (logout). Pair with revokeSessionToken()
 * for server-side invalidation.
 */
export async function destroySessionCookie(): Promise<void> {
  const { cookies } = await import("next/headers");
  const { getIronSession } = await import("iron-session");
  const session = await getIronSession<SessionData>(await cookies(), getSessionOptions());
  session.destroy();
}
