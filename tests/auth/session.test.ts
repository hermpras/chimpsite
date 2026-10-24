import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  createSession,
  validateSessionToken,
  revokeSessionToken,
  revokeUserSessions,
  authenticateRequest,
  requireAdminSession,
  checkAdminSession,
  AdminAuthError,
} from "@/server/auth/session";

// Mock the request-scoped modules: only authenticateRequest touches them,
// and only via dynamic imports (keeps the rest of this file DB-pure).
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({})) }));
const mockGetIronSession = vi.fn();
vi.mock("iron-session", () => ({ getIronSession: mockGetIronSession }));

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
const OLD_SESSION_SECRET = process.env.SESSION_SECRET;

beforeEach(() => {
  process.env.SESSION_SECRET = "test-session-secret-0123456789abcdef";
  mockGetIronSession.mockReset();
});
afterEach(() => {
  if (OLD_SESSION_SECRET === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = OLD_SESSION_SECRET;
});

interface SessionRecord {
  id: string;
  userId: string;
  revokedAt: Date | null;
  expiresAt: Date;
  user: { isBanned: boolean; wallet: { address: string } | null };
}

function validRecord(): SessionRecord {
  return {
    id: "sess_1",
    userId: "user_1",
    revokedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    user: { isBanned: false, wallet: { address: "0xabc" } },
  };
}

describe("createSession", () => {
  it("persists only the token hash and returns the raw token", async () => {
    const create = vi.fn(
      async (args: {
        data: { userId: string; token: string; expiresAt: Date };
        select: { id: true; expiresAt: true };
      }) => ({ id: "sess_1", expiresAt: args.data.expiresAt }),
    );
    const prisma = { authSession: { create } } as unknown as PrismaClient;

    const { rawToken, sessionId, expiresAt } = await createSession(prisma, {
      userId: "user_1",
      address: "0xabc",
    });

    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
    expect(sessionId).toBe("sess_1");
    expect(expiresAt).toBeInstanceOf(Date);
    const stored = create.mock.calls[0][0].data;
    expect(stored.userId).toBe("user_1");
    expect(stored.token).toBe(sha256(rawToken));
    expect(stored.token).not.toBe(rawToken);
  });
});

describe("validateSessionToken", () => {
  function fakeWith(record: SessionRecord | null) {
    const findUnique = vi.fn(async (_args: { where: { token: string } }) => record);
    const prisma = { authSession: { findUnique } } as unknown as PrismaClient;
    return { findUnique, prisma };
  }

  it("accepts a valid session and returns the user", async () => {
    const { findUnique, prisma } = fakeWith(validRecord());
    const result = await validateSessionToken(prisma, "a".repeat(64));
    expect(findUnique).toHaveBeenCalledTimes(1);
    // The lookup key is the SHA-256 hash, never the raw token.
    expect(findUnique.mock.calls[0][0].where.token).toBe(sha256("a".repeat(64)));
    expect(result).toEqual({ sessionId: "sess_1", userId: "user_1", address: "0xabc" });
  });

  it("rejects expired sessions", async () => {
    const record = validRecord();
    record.expiresAt = new Date(Date.now() - 1000);
    const { prisma } = fakeWith(record);
    expect(await validateSessionToken(prisma, "a".repeat(64))).toBeNull();
  });

  it("rejects revoked sessions", async () => {
    const record = validRecord();
    record.revokedAt = new Date();
    const { prisma } = fakeWith(record);
    expect(await validateSessionToken(prisma, "a".repeat(64))).toBeNull();
  });

  it("rejects unknown tokens", async () => {
    const { prisma } = fakeWith(null);
    expect(await validateSessionToken(prisma, "a".repeat(64))).toBeNull();
  });

  it("rejects sessions of banned users", async () => {
    const record = validRecord();
    record.user.isBanned = true;
    const { prisma } = fakeWith(record);
    expect(await validateSessionToken(prisma, "a".repeat(64))).toBeNull();
  });

  it("rejects empty input without touching the database", async () => {
    const { findUnique, prisma } = fakeWith(validRecord());
    expect(await validateSessionToken(prisma, "")).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("revokeSessionToken", () => {
  function fakeWith(count: number) {
    const updateMany = vi.fn(
      async (_args: {
        where: { token: string; revokedAt: null };
        data: { revokedAt: Date };
      }) => ({
        count,
      }),
    );
    const prisma = { authSession: { updateMany } } as unknown as PrismaClient;
    return { updateMany, prisma };
  }

  it("returns true when a session was revoked", async () => {
    const { updateMany, prisma } = fakeWith(1);
    expect(await revokeSessionToken(prisma, "a".repeat(64))).toBe(true);
    const args = updateMany.mock.calls[0][0];
    expect(args.where.token).toBe(sha256("a".repeat(64)));
    expect(args.where.revokedAt).toBeNull();
  });

  it("returns false when nothing matched", async () => {
    const { prisma } = fakeWith(0);
    expect(await revokeSessionToken(prisma, "a".repeat(64))).toBe(false);
  });

  it("returns false for empty input without touching the database", async () => {
    const { updateMany, prisma } = fakeWith(1);
    expect(await revokeSessionToken(prisma, "")).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("revokeUserSessions", () => {
  it("revokes all active sessions of the user and returns the count", async () => {
    const updateMany = vi.fn(
      async (_args: {
        where: { userId: string; revokedAt: null };
        data: { revokedAt: Date };
      }) => ({
        count: 3,
      }),
    );
    const prisma = { authSession: { updateMany } } as unknown as PrismaClient;
    expect(await revokeUserSessions(prisma, "user_1")).toBe(3);
    const args = updateMany.mock.calls[0][0];
    expect(args.where.userId).toBe("user_1");
    expect(args.where.revokedAt).toBeNull();
  });
});

describe("authenticateRequest", () => {
  const RAW = "ab".repeat(32);

  function fakePrismaFor(record: SessionRecord | null) {
    const findUnique = vi.fn(async () => record);
    return { authSession: { findUnique } } as unknown as PrismaClient;
  }

  it("authenticates when the cookie token validates in the database", async () => {
    mockGetIronSession.mockReturnValue({
      userId: "user_1",
      address: "0xabc",
      token: RAW,
    });
    const result = await authenticateRequest(fakePrismaFor(validRecord()));
    expect(result).toEqual({ sessionId: "sess_1", userId: "user_1", address: "0xabc" });
  });

  it("rejects when the cookie userId does not match the database session", async () => {
    mockGetIronSession.mockReturnValue({
      userId: "user_1",
      address: "0xabc",
      token: RAW,
    });
    const record = validRecord();
    record.userId = "user_2";
    expect(await authenticateRequest(fakePrismaFor(record))).toBeNull();
  });

  it("returns null when there is no session cookie", async () => {
    mockGetIronSession.mockReturnValue({});
    expect(await authenticateRequest(fakePrismaFor(validRecord()))).toBeNull();
  });
});

describe("requireAdminSession & checkAdminSession", () => {
  interface FakeAdminPrismaOptions {
    sessionRecord?: SessionRecord | null;
    adminRoleRecord?: {
      id: string;
      userId: string;
      roleType: string;
      permissions: string[];
      assignedBy?: string | null;
    } | null;
  }

  function fakeAdminPrisma(opts: FakeAdminPrismaOptions = {}) {
    const findUniqueSession = vi.fn(async () => opts.sessionRecord ?? null);
    const findUniqueAdminRole = vi.fn(async () => opts.adminRoleRecord ?? null);

    return {
      authSession: { findUnique: findUniqueSession },
      adminRole: { findUnique: findUniqueAdminRole },
    } as unknown as PrismaClient;
  }

  const validAdminSession = {
    sessionId: "sess_admin",
    userId: "user_admin",
    address: "0xadmin",
  };

  it("fails with 401 UNAUTHORIZED when there is no active session", async () => {
    mockGetIronSession.mockReturnValue({});
    const prisma = fakeAdminPrisma({ sessionRecord: null });

    const check = await checkAdminSession(prisma);
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.status).toBe(401);
      expect(check.error).toBe("UNAUTHORIZED");
    }

    await expect(requireAdminSession(prisma)).rejects.toThrow(AdminAuthError);
    await expect(requireAdminSession(prisma)).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
  });

  it("fails with 403 FORBIDDEN when user is authenticated but has no AdminRole", async () => {
    const prisma = fakeAdminPrisma({
      adminRoleRecord: null,
    });

    const check = await checkAdminSession(prisma, { session: validAdminSession });
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.status).toBe(403);
      expect(check.error).toBe("FORBIDDEN");
      expect(check.message).toContain("No admin role assigned");
    }

    await expect(
      requireAdminSession(prisma, { session: validAdminSession }),
    ).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
  });

  it("fails with 403 FORBIDDEN when user role level is insufficient", async () => {
    const prisma = fakeAdminPrisma({
      adminRoleRecord: {
        id: "role_1",
        userId: "user_admin",
        roleType: "MODERATOR",
        permissions: ["MANAGE_DROPS"],
      },
    });

    const check = await checkAdminSession(prisma, {
      session: validAdminSession,
      requiredRole: "SUPER_ADMIN",
    });
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.status).toBe(403);
      expect(check.error).toBe("FORBIDDEN");
      expect(check.message).toContain("Insufficient role level");
    }

    await expect(
      requireAdminSession(prisma, {
        session: validAdminSession,
        requiredRole: "SUPER_ADMIN",
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
  });

  it("fails with 403 FORBIDDEN when user lacks required permission", async () => {
    const prisma = fakeAdminPrisma({
      adminRoleRecord: {
        id: "role_1",
        userId: "user_admin",
        roleType: "ADMIN",
        permissions: ["REVIEW_EVIDENCE"],
      },
    });

    const check = await checkAdminSession(prisma, {
      session: validAdminSession,
      requiredPermission: "MANAGE_DROPS",
    });
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.status).toBe(403);
      expect(check.error).toBe("FORBIDDEN");
      expect(check.message).toContain("Missing required admin permission");
    }

    await expect(
      requireAdminSession(prisma, {
        session: validAdminSession,
        requiredPermission: "MANAGE_DROPS",
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
  });

  it("authorizes admin when exact permission is held", async () => {
    const prisma = fakeAdminPrisma({
      adminRoleRecord: {
        id: "role_1",
        userId: "user_admin",
        roleType: "ADMIN",
        permissions: ["MANAGE_DROPS", "MANAGE_WL"],
        assignedBy: "super_admin",
      },
    });

    const result = await requireAdminSession(prisma, {
      session: validAdminSession,
      requiredPermission: "MANAGE_DROPS",
    });

    expect(result.userId).toBe("user_admin");
    expect(result.address).toBe("0xadmin");
    expect(result.adminRole.roleType).toBe("ADMIN");
    expect(result.adminRole.permissions).toEqual(["MANAGE_DROPS", "MANAGE_WL"]);
    expect(result.adminRole.assignedBy).toBe("super_admin");
  });

  it("authorizes admin when wildcard '*' permission is held", async () => {
    const prisma = fakeAdminPrisma({
      adminRoleRecord: {
        id: "role_2",
        userId: "user_admin",
        roleType: "ADMIN",
        permissions: ["*"],
      },
    });

    const result = await requireAdminSession(prisma, {
      session: validAdminSession,
      requiredPermission: "MANAGE_BANS",
    });

    expect(result.adminRole.permissions).toContain("*");
  });

  it("super admin bypasses specific permission checks", async () => {
    const prisma = fakeAdminPrisma({
      adminRoleRecord: {
        id: "role_super",
        userId: "user_admin",
        roleType: "SUPER_ADMIN",
        permissions: [], // empty permissions list, but SUPER_ADMIN role
      },
    });

    const result = await requireAdminSession(prisma, {
      session: validAdminSession,
      requiredPermission: "ANY_RESTRICTED_ACTION",
    });

    expect(result.adminRole.roleType).toBe("SUPER_ADMIN");
  });

  it("supports string shorthand for requiredPermission", async () => {
    const prisma = fakeAdminPrisma({
      adminRoleRecord: {
        id: "role_3",
        userId: "user_admin",
        roleType: "ADMIN",
        permissions: ["MANAGE_WL"],
      },
    });

    const result = await requireAdminSession(prisma, {
      session: validAdminSession,
      requiredPermission: "MANAGE_WL",
    });
    expect(result.adminRole.roleType).toBe("ADMIN");
  });

  it("AdminAuthError provides toResponse() helper", () => {
    const err = new AdminAuthError("FORBIDDEN", "Forbidden access", 403);
    const resp = err.toResponse();
    expect(resp.status).toBe(403);
  });

  it("propagates unexpected database errors from adminRole lookup — does not convert them to a 403", async () => {
    // The adminRole.findUnique call must throw, not silently return undefined.
    // If the code swallowed DB errors (e.g. via optional chaining or try/catch),
    // it would incorrectly respond with 403 FORBIDDEN instead of surfacing the
    // infrastructure failure to the caller.
    const dbError = new Error("database connection timeout");
    const prisma = {
      authSession: { findUnique: vi.fn() },
      adminRole: {
        findUnique: vi.fn().mockRejectedValue(dbError),
      },
    } as unknown as PrismaClient;

    // checkAdminSession must reject — not return { ok: false }
    await expect(
      checkAdminSession(prisma, { session: validAdminSession }),
    ).rejects.toThrow("database connection timeout");

    // requireAdminSession must also reject with the original DB error,
    // not an AdminAuthError wrapping it as a 403.
    const thrown = await requireAdminSession(prisma, {
      session: validAdminSession,
    }).catch((e: unknown) => e);
    expect(thrown).toBe(dbError);
    expect(thrown).not.toBeInstanceOf(AdminAuthError);
  });

  it("returns 403 FORBIDDEN when adminRole record is null (user has no role)", async () => {
    // A definitively missing role (findUnique returns null) is an authorization
    // decision, not an infrastructure failure — 403 is correct here.
    const prisma = {
      authSession: { findUnique: vi.fn() },
      adminRole: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;

    const check = await checkAdminSession(prisma, { session: validAdminSession });
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.status).toBe(403);
      expect(check.error).toBe("FORBIDDEN");
    }
  });

  it("fails with 401 UNAUTHORIZED when session is explicitly passed as null", async () => {
    const prisma = fakeAdminPrisma();
    const check = await checkAdminSession(prisma, { session: null });
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.status).toBe(401);
      expect(check.error).toBe("UNAUTHORIZED");
      expect(check.message).toContain("Authentication required");
    }

    await expect(requireAdminSession(prisma, { session: null })).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
  });

  it("authorizes admin when no specific permission or role is required", async () => {
    const prisma = fakeAdminPrisma({
      adminRoleRecord: {
        id: "role_default",
        userId: "user_admin",
        roleType: "ADMIN",
        permissions: ["ANY_PERMISSION"],
      },
    });

    const check = await checkAdminSession(prisma, { session: validAdminSession });
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.session.userId).toBe("user_admin");
      expect(check.session.adminRole.roleType).toBe("ADMIN");
      expect(check.session.adminRole.assignedBy).toBeNull();
    }

    const result = await requireAdminSession(prisma, { session: validAdminSession });
    expect(result.userId).toBe("user_admin");
    expect(result.adminRole.id).toBe("role_default");
  });

  it("fails with 403 FORBIDDEN when using string shorthand for a permission the user lacks", async () => {
    const prisma = fakeAdminPrisma({
      adminRoleRecord: {
        id: "role_mod",
        userId: "user_admin",
        roleType: "MODERATOR",
        permissions: ["MANAGE_WL"],
      },
    });

    await expect(
      requireAdminSession(prisma, {
        session: validAdminSession,
        requiredPermission: "MANAGE_DROPS",
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
      message: expect.stringContaining("MANAGE_DROPS"),
    });
  });

  it("does not emit diagnostic debug logs to console during role verification", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const prisma = fakeAdminPrisma({
        adminRoleRecord: {
          id: "role_1",
          userId: "user_admin",
          roleType: "ADMIN",
          permissions: ["MANAGE_DROPS"],
        },
      });

      await checkAdminSession(prisma, { session: validAdminSession });
      expect(consoleSpy).not.toHaveBeenCalled();
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
