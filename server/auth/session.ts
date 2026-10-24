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
import type { PrismaClient, AdminRoleType } from "@prisma/client";
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

export class AdminAuthError extends Error {
  code: "UNAUTHORIZED" | "FORBIDDEN";
  status: 401 | 403;

  constructor(code: "UNAUTHORIZED" | "FORBIDDEN", message: string, status: 401 | 403) {
    super(message);
    this.name = "AdminAuthError";
    this.code = code;
    this.status = status;
  }

  toResponse(): Response {
    return Response.json(
      { error: this.code, message: this.message },
      { status: this.status },
    );
  }
}

export interface ValidatedAdminRole {
  id: string;
  userId: string;
  roleType: AdminRoleType;
  permissions: string[];
  assignedBy?: string | null;
}

export interface ValidatedAdminSession extends ValidatedSession {
  adminRole: ValidatedAdminRole;
}

export interface RequireAdminSessionOptions {
  /** Required specific permission, e.g. "MANAGE_DROPS", "MANAGE_WL", "MANAGE_BANS". */
  requiredPermission?: string;
  /** Required minimum role type, e.g. "SUPER_ADMIN", "ADMIN", "MODERATOR". */
  requiredRole?: AdminRoleType;
  /** Optional pre-validated session to avoid duplicate cookie / DB lookups. */
  session?: ValidatedSession | null;
}

export type RequireAdminSessionInput = string | RequireAdminSessionOptions;

export type AdminAuthCheckResult =
  | {
      ok: true;
      session: ValidatedAdminSession;
    }
  | {
      ok: false;
      error: "UNAUTHORIZED" | "FORBIDDEN";
      status: 401 | 403;
      message: string;
    };

export const ADMIN_ROLE_LEVELS: Record<AdminRoleType | string, number> = {
  SUPER_ADMIN: 3,
  ADMIN: 2,
  MODERATOR: 1,
  AUDITOR: 0,
};

/**
 * Validates request session and verifies that the authenticated user possesses
 * the required AdminRole and permissions in the database.
 * Returns a result object ({ ok: true, session } or { ok: false, error, status, message }).
 */
export async function checkAdminSession(
  prisma: PrismaClient,
  input?: RequireAdminSessionInput,
): Promise<AdminAuthCheckResult> {
  const options: RequireAdminSessionOptions =
    typeof input === "string" ? { requiredPermission: input } : (input ?? {});

  // 1. Authenticate session (use provided session or authenticate current request)
  let session: ValidatedSession | null;
  if (options.session !== undefined) {
    session = options.session;
  } else {
    session = await authenticateRequest(prisma);
  }

  if (!session) {
    return {
      ok: false,
      error: "UNAUTHORIZED",
      status: 401,
      message: "Authentication required to access admin resources.",
    };
  }

  // 2. Query database for AdminRole record (untrusted client data is never used)
  console.log(`[checkAdminSession] Current session userId: "${session.userId}"`);
  const roleRecord = await prisma.adminRole.findUnique({
    where: { userId: session.userId },
    select: {
      id: true,
      userId: true,
      roleType: true,
      permissions: true,
      assignedBy: true,
    },
  });
  console.log(`[checkAdminSession] Found roleRecord in DB:`, roleRecord);

  if (!roleRecord) {
    return {
      ok: false,
      error: "FORBIDDEN",
      status: 403,
      message: `Admin access required. No admin role assigned to account (User ID: ${session.userId}).`,
    };
  }

  const roleType = roleRecord.roleType as AdminRoleType;
  const permissions: string[] = Array.isArray(roleRecord.permissions)
    ? roleRecord.permissions
    : [];

  // 3. Verify required role level if specified
  if (options.requiredRole) {
    const userLevel = ADMIN_ROLE_LEVELS[roleType] ?? -1;
    const requiredLevel = ADMIN_ROLE_LEVELS[options.requiredRole] ?? 999;
    if (userLevel < requiredLevel) {
      return {
        ok: false,
        error: "FORBIDDEN",
        status: 403,
        message: `Insufficient role level: requires ${options.requiredRole}, account has ${roleType}.`,
      };
    }
  }

  // 4. Verify required permission if specified
  if (options.requiredPermission) {
    const isSuperAdmin = roleType === "SUPER_ADMIN";
    const hasWildcard = permissions.includes("*");
    const hasSpecificPermission = permissions.includes(options.requiredPermission);

    if (!isSuperAdmin && !hasWildcard && !hasSpecificPermission) {
      return {
        ok: false,
        error: "FORBIDDEN",
        status: 403,
        message: `Missing required admin permission: ${options.requiredPermission}.`,
      };
    }
  }

  const validatedAdminRole: ValidatedAdminRole = {
    id: roleRecord.id,
    userId: roleRecord.userId,
    roleType,
    permissions,
    assignedBy: roleRecord.assignedBy ?? null,
  };

  return {
    ok: true,
    session: {
      ...session,
      adminRole: validatedAdminRole,
    },
  };
}

/**
 * Requires a valid authenticated admin session with the specified permissions/role.
 * Throws AdminAuthError with status 401 (UNAUTHORIZED) or 403 (FORBIDDEN).
 */
export async function requireAdminSession(
  prisma: PrismaClient,
  input?: RequireAdminSessionInput,
): Promise<ValidatedAdminSession> {
  const result = await checkAdminSession(prisma, input);
  if (!result.ok) {
    throw new AdminAuthError(result.error, result.message, result.status);
  }
  return result.session;
}
