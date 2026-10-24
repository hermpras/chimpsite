import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getXConfig,
  isXConfigured,
  buildXAuthUrl,
  linkXAccountWithCode,
  XOAuthError,
  sealXOAuthState,
  unsealXOAuthState,
  buildXOAuthCookie,
  buildClearXOAuthCookie,
  timingSafeEqualString,
  markStateConsumed,
  isStateConsumed,
  clearConsumedState,
  __clearConsumedOAuthStates,
  __setTestOAuthRedis,
  X_OAUTH_COOKIE_NAME,
  X_OAUTH_STATE_KEY_PREFIX,
  X_OAUTH_STATE_TTL_SECONDS,
  type XOAuthStatePayload,
} from "@/server/social/x";
import type { PrismaClient } from "@prisma/client";

// Mock @upstash/redis so tests run without real network I/O
const { mockSet, mockGet, mockDel } = vi.hoisted(() => ({
  mockSet: vi.fn(),
  mockGet: vi.fn(),
  mockDel: vi.fn(),
}));

vi.mock("@upstash/redis", () => {
  class MockRedis {
    set = mockSet;
    get = mockGet;
    del = mockDel;
    constructor(public opts: unknown) {}
  }
  return {
    Redis: MockRedis,
  };
});

describe("X (Twitter) OAuth 2.0 PKCE Service", () => {
  const originalEnv = process.env;
  let simulatedStore: Map<string, string>;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.X_CLIENT_ID;
    delete process.env.X_CLIENT_SECRET;
    delete process.env.X_REDIRECT_URI;
    process.env.SESSION_SECRET = "test-session-secret-0123456789abcdef";
    process.env.UPSTASH_REDIS_REST_URL = "https://mock-redis.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "mock-redis-token-12345";
    __clearConsumedOAuthStates();

    mockSet.mockReset();
    mockGet.mockReset();
    mockDel.mockReset();

    simulatedStore = new Map();
    mockSet.mockImplementation(
      async (key: string, value: string, opts?: { ex?: number; nx?: boolean }) => {
        if (opts?.nx && simulatedStore.has(key)) {
          return null;
        }
        simulatedStore.set(key, value);
        return "OK";
      },
    );
    mockGet.mockImplementation(async (key: string) => {
      return simulatedStore.get(key) ?? null;
    });
    mockDel.mockImplementation(async (key: string) => {
      return simulatedStore.delete(key) ? 1 : 0;
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    __clearConsumedOAuthStates();
  });

  it("fails closed when X credentials are not configured", () => {
    expect(isXConfigured()).toBe(false);
    expect(getXConfig()).toBeNull();

    expect(() => buildXAuthUrl("state123", "challenge123")).toThrow(
      "X OAuth 2.0 is not configured in this environment.",
    );
  });

  it("builds valid OAuth 2.0 PKCE authorization URL when configured", () => {
    process.env.X_CLIENT_ID = "mock-client-id";
    process.env.X_CLIENT_SECRET = "mock-client-secret";
    process.env.X_REDIRECT_URI = "https://chimphood.com/api/social/x/callback";

    expect(isXConfigured()).toBe(true);
    const urlString = buildXAuthUrl("mystate", "mychallenge");
    const url = new URL(urlString);

    expect(url.hostname).toBe("twitter.com");
    expect(url.pathname).toBe("/i/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("mock-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://chimphood.com/api/social/x/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge")).toBe("mychallenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("mystate");
  });

  it("never fakes linking when credentials are missing", async () => {
    const fakePrisma = {} as PrismaClient;
    await expect(
      linkXAccountWithCode(fakePrisma, {
        userId: "user-1",
        code: "test-code",
        codeVerifier: "verifier",
      }),
    ).rejects.toThrow(XOAuthError);
  });

  describe("PKCE State Sealing & Cookie Utilities", () => {
    const samplePayload: XOAuthStatePayload = {
      state: "state-abc-123",
      codeVerifier: "verifier-xyz-789",
      userId: "user-test-1",
      sessionId: "session-test-1",
      createdAt: Date.now(),
      expiresAt: Date.now() + 600000,
    };

    it("seals and unseals OAuth PKCE state payload reliably", async () => {
      const sealed = await sealXOAuthState(samplePayload);
      expect(typeof sealed).toBe("string");
      expect(sealed.length).toBeGreaterThan(20);

      const unsealed = await unsealXOAuthState(sealed);
      expect(unsealed).not.toBeNull();
      expect(unsealed?.state).toBe(samplePayload.state);
      expect(unsealed?.codeVerifier).toBe(samplePayload.codeVerifier);
      expect(unsealed?.userId).toBe(samplePayload.userId);
      expect(unsealed?.sessionId).toBe(samplePayload.sessionId);
    });

    it("returns null when unsealing corrupted or tampered data", async () => {
      const result = await unsealXOAuthState("corrupted-token-payload");
      expect(result).toBeNull();
    });

    it("builds secure, HttpOnly cookie header with narrow path /api/social/x and Lax SameSite", () => {
      const cookieHeader = buildXOAuthCookie("mock-sealed-val");
      expect(cookieHeader).toContain(`${X_OAUTH_COOKIE_NAME}=mock-sealed-val`);
      expect(cookieHeader).toContain("Path=/api/social/x");
      expect(cookieHeader).toContain("HttpOnly");
      expect(cookieHeader).toContain("SameSite=Lax");
      expect(cookieHeader).toContain("Max-Age=600");
    });

    it("builds clear cookie header with Max-Age=0 and expired date", () => {
      const clearHeader = buildClearXOAuthCookie();
      expect(clearHeader).toContain(`${X_OAUTH_COOKIE_NAME}=;`);
      expect(clearHeader).toContain("Path=/api/social/x");
      expect(clearHeader).toContain("Max-Age=0");
      expect(clearHeader).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
      expect(clearHeader).toContain("HttpOnly");
      expect(clearHeader).toContain("SameSite=Lax");
    });
  });

  describe("Timing-Safe Equality", () => {
    it("timingSafeEqualString returns true for identical strings and false for mismatched or unequal lengths", () => {
      expect(timingSafeEqualString("hello12345", "hello12345")).toBe(true);
      expect(timingSafeEqualString("hello12345", "hello12346")).toBe(false);
      expect(timingSafeEqualString("hello12345", "hello")).toBe(false);
      expect(timingSafeEqualString("", "")).toBe(true);
    });
  });

  describe("Redis OAuth State Replay Protection (Task 0-D)", () => {
    it("allows new state on first consumption and blocks replayed state", async () => {
      const state = "unique-state-12345";
      const firstResult = await markStateConsumed(state);
      expect(firstResult).toBe(true);

      // Immediate second attempt with same state must be rejected as replay
      const secondResult = await markStateConsumed(state);
      expect(secondResult).toBe(false);
    });

    it("handles multiple distinct states independently", async () => {
      expect(await markStateConsumed("state-alpha")).toBe(true);
      expect(await markStateConsumed("state-beta")).toBe(true);
      expect(await markStateConsumed("state-alpha")).toBe(false);
      expect(await markStateConsumed("state-beta")).toBe(false);
      expect(await markStateConsumed("state-gamma")).toBe(true);
    });

    it("passes TTL 600s and NX flag to Redis set with expected key prefix", async () => {
      const state = "ttl-test-state";
      await markStateConsumed(state);

      expect(mockSet).toHaveBeenCalledWith(`${X_OAUTH_STATE_KEY_PREFIX}${state}`, "1", {
        ex: X_OAUTH_STATE_TTL_SECONDS,
        nx: true,
      });
      expect(X_OAUTH_STATE_TTL_SECONDS).toBe(600);
    });

    it("correctly inspects consumption status with isStateConsumed", async () => {
      const state = "check-status-state";
      expect(await isStateConsumed(state)).toBe(false);

      await markStateConsumed(state);
      expect(await isStateConsumed(state)).toBe(true);
      expect(mockGet).toHaveBeenCalledWith(`${X_OAUTH_STATE_KEY_PREFIX}${state}`);
    });

    it("allows clearing consumed state with clearConsumedState", async () => {
      const state = "cleared-state";
      expect(await markStateConsumed(state)).toBe(true);
      expect(await isStateConsumed(state)).toBe(true);

      await clearConsumedState(state);
      expect(mockDel).toHaveBeenCalledWith(`${X_OAUTH_STATE_KEY_PREFIX}${state}`);
      expect(await isStateConsumed(state)).toBe(false);

      // Can be consumed again after deletion
      expect(await markStateConsumed(state)).toBe(true);
    });

    it("fails closed with 500 when UPSTASH_REDIS_REST_URL is missing", async () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      __clearConsumedOAuthStates();

      await expect(markStateConsumed("any-state")).rejects.toMatchObject({
        name: "XOAuthError",
        code: "OAUTH_STORAGE_NOT_CONFIGURED",
        status: 500,
      });

      await expect(isStateConsumed("any-state")).rejects.toMatchObject({
        name: "XOAuthError",
        code: "OAUTH_STORAGE_NOT_CONFIGURED",
        status: 500,
      });

      await expect(clearConsumedState("any-state")).rejects.toMatchObject({
        name: "XOAuthError",
        code: "OAUTH_STORAGE_NOT_CONFIGURED",
        status: 500,
      });
    });

    it("fails closed with 500 when UPSTASH_REDIS_REST_TOKEN is missing", async () => {
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      __clearConsumedOAuthStates();

      await expect(markStateConsumed("any-state")).rejects.toMatchObject({
        name: "XOAuthError",
        code: "OAUTH_STORAGE_NOT_CONFIGURED",
        status: 500,
      });
    });

    it("fails closed with 500 on Redis set failure without silent fallback", async () => {
      mockSet.mockRejectedValueOnce(new Error("Redis ECONNREFUSED"));

      await expect(markStateConsumed("failing-state")).rejects.toMatchObject({
        name: "XOAuthError",
        code: "OAUTH_STORAGE_ERROR",
        status: 500,
      });
    });

    it("fails closed with 500 on Redis get or del failure", async () => {
      mockGet.mockRejectedValueOnce(new Error("Redis read timeout"));
      await expect(isStateConsumed("timeout-state")).rejects.toMatchObject({
        name: "XOAuthError",
        code: "OAUTH_STORAGE_ERROR",
        status: 500,
      });

      mockDel.mockRejectedValueOnce(new Error("Redis write failure"));
      await expect(clearConsumedState("del-fail-state")).rejects.toMatchObject({
        name: "XOAuthError",
        code: "OAUTH_STORAGE_ERROR",
        status: 500,
      });
    });
  });

  describe("linkXAccountWithCode with mock Twitter API", () => {
    it("successfully exchanges code, fetches profile, and creates XIdentity", async () => {
      process.env.X_CLIENT_ID = "mock-client-id";
      process.env.X_CLIENT_SECRET = "mock-client-secret";
      process.env.X_REDIRECT_URI = "https://chimphood.com/api/social/x/callback";

      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      // 1. Mock token response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "mock-access-token" }),
      });

      // 2. Mock users/me response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: "x-123456",
            username: "chimphood_fan",
            name: "Chimp Fan",
            profile_image_url: "https://x.com/avatar.png",
          },
        }),
      });

      const mockAuditCreate = vi.fn().mockResolvedValue({ id: "audit-1" });
      const mockPrisma = {
        xIdentity: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue({
            id: "x-ident-1",
            userId: "user-1",
            xId: "x-123456",
            username: "chimphood_fan",
            name: "Chimp Fan",
            profileImageUrl: "https://x.com/avatar.png",
          }),
        },
        auditLog: {
          create: mockAuditCreate,
        },
      } as unknown as PrismaClient;

      const result = await linkXAccountWithCode(mockPrisma, {
        userId: "user-1",
        code: "test-auth-code",
        codeVerifier: "test-verifier",
      });

      expect(result.xId).toBe("x-123456");
      expect(result.username).toBe("chimphood_fan");
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockAuditCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: "user-1",
          action: "X_IDENTITY_LINKED",
          entityType: "XIdentity",
          entityId: "x-ident-1",
          newValues: {
            userId: "user-1",
            xId: "x-123456",
            username: "chimphood_fan",
          },
        }),
        select: { id: true },
      });
    });

    it("rolls back X identity linking when audit log creation fails", async () => {
      process.env.X_CLIENT_ID = "mock-client-id";
      process.env.X_CLIENT_SECRET = "mock-client-secret";
      process.env.X_REDIRECT_URI = "https://chimphood.com/api/social/x/callback";

      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "mock-access-token" }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: "x-rollback-123",
            username: "rollback_fan",
            name: "Rollback User",
            profile_image_url: "https://x.com/rollback.png",
          },
        }),
      });

      let storedIdentity: any = null;
      const txMock = {
        xIdentity: {
          upsert: vi.fn(async ({ create }: any) => {
            storedIdentity = { id: "ident-1", ...create };
            return storedIdentity;
          }),
        },
        auditLog: {
          create: vi.fn().mockRejectedValue(new Error("Audit log database failure")),
        },
      };

      const mockPrisma = {
        xIdentity: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        $transaction: vi.fn(async (cb: (tx: any) => any) => {
          try {
            return await cb(txMock);
          } catch (err) {
            storedIdentity = null;
            throw err;
          }
        }),
      } as unknown as PrismaClient;

      await expect(
        linkXAccountWithCode(mockPrisma, {
          userId: "user-rollback",
          code: "test-auth-code",
          codeVerifier: "test-verifier",
        }),
      ).rejects.toThrow("Audit log database failure");

      expect(storedIdentity).toBeNull();
    });

    it("rejects linking if X account is already linked to another profile (409)", async () => {
      process.env.X_CLIENT_ID = "mock-client-id";
      process.env.X_CLIENT_SECRET = "mock-client-secret";
      process.env.X_REDIRECT_URI = "https://chimphood.com/api/social/x/callback";

      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "mock-access-token" }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: "x-already-linked",
            username: "another_user",
          },
        }),
      });

      const mockPrisma = {
        xIdentity: {
          findUnique: vi.fn().mockResolvedValue({
            userId: "user-DIFFERENT",
            xId: "x-already-linked",
          }),
        },
      } as unknown as PrismaClient;

      await expect(
        linkXAccountWithCode(mockPrisma, {
          userId: "user-1",
          code: "test-auth-code",
          codeVerifier: "test-verifier",
        }),
      ).rejects.toMatchObject({
        code: "X_ACCOUNT_ALREADY_LINKED",
        status: 409,
      });
    });

    it("Task 5-C: returns generic message and does not expose raw upstream error body when token exchange fails", async () => {
      process.env.X_CLIENT_ID = "mock-client-id";
      process.env.X_CLIENT_SECRET = "mock-client-secret";
      process.env.X_REDIRECT_URI = "https://chimphood.com/api/social/x/callback";

      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: "invalid_grant",
            error_description: "Raw provider detail",
          }),
      });

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const mockPrisma = {} as unknown as PrismaClient;

      try {
        await expect(
          linkXAccountWithCode(mockPrisma, {
            userId: "user-1",
            code: "bad-code",
            codeVerifier: "test-verifier",
          }),
        ).rejects.toMatchObject({
          code: "X_TOKEN_EXCHANGE_FAILED",
          message: "Failed to exchange authorization code with X.",
          status: 400,
        });

        // Ensure raw provider error detail was logged server-side
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("X OAuth token exchange failed"),
          400,
          expect.stringContaining("Raw provider detail"),
        );
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });
  });
});
