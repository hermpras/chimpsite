import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  createSession,
  validateSessionToken,
  revokeSessionToken,
  revokeUserSessions,
  authenticateRequest,
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
