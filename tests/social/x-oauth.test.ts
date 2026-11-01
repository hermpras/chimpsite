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
  normalizeXAvatarUrl,
  DEFAULT_X_API_BASE_URL,
  getXApiBaseUrl,
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
    delete process.env.X_API_BASE_URL;
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
            profile_image_url: "https://pbs.twimg.com/profile_images/999/avatar_normal.jpg",
          },
        }),
      });

      const mockAuditCreate = vi.fn().mockResolvedValue({ id: "audit-1" });
      const mockUpsert = vi.fn().mockResolvedValue({
        id: "x-ident-1",
        userId: "user-1",
        xId: "x-123456",
        username: "chimphood_fan",
        name: "Chimp Fan",
        profileImageUrl: "https://pbs.twimg.com/profile_images/999/avatar_400x400.jpg",
      });
      const mockPrisma = {
        xIdentity: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: mockUpsert,
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

      // Verify the upsert received the _400x400 URL (normalisation applied)
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            profileImageUrl: "https://pbs.twimg.com/profile_images/999/avatar_400x400.jpg",
          }),
          update: expect.objectContaining({
            profileImageUrl: "https://pbs.twimg.com/profile_images/999/avatar_400x400.jpg",
          }),
        }),
      );

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

  // ─── normalizeXAvatarUrl — avatar URL normalisation (bug-fix coverage) ────
  describe("normalizeXAvatarUrl — X CDN profile image URL normalisation", () => {
    it("upgrades _normal.jpg to _400x400.jpg for pbs.twimg.com URLs", () => {
      expect(
        normalizeXAvatarUrl(
          "https://pbs.twimg.com/profile_images/123456789/abc_normal.jpg",
        ),
      ).toBe("https://pbs.twimg.com/profile_images/123456789/abc_400x400.jpg");
    });

    it("upgrades _normal.png to _400x400.png", () => {
      expect(
        normalizeXAvatarUrl(
          "https://pbs.twimg.com/profile_images/123456789/abc_normal.png",
        ),
      ).toBe("https://pbs.twimg.com/profile_images/123456789/abc_400x400.png");
    });

    it("upgrades _normal.jpeg to _400x400.jpeg", () => {
      expect(
        normalizeXAvatarUrl(
          "https://pbs.twimg.com/profile_images/123456789/abc_normal.jpeg",
        ),
      ).toBe("https://pbs.twimg.com/profile_images/123456789/abc_400x400.jpeg");
    });

    it("upgrades _bigger variant to _400x400", () => {
      expect(
        normalizeXAvatarUrl(
          "https://pbs.twimg.com/profile_images/123456789/abc_bigger.jpg",
        ),
      ).toBe("https://pbs.twimg.com/profile_images/123456789/abc_400x400.jpg");
    });

    it("upgrades _mini variant to _400x400", () => {
      expect(
        normalizeXAvatarUrl(
          "https://pbs.twimg.com/profile_images/123456789/abc_mini.jpg",
        ),
      ).toBe("https://pbs.twimg.com/profile_images/123456789/abc_400x400.jpg");
    });

    it("is idempotent — does not double-mangle an already-upgraded URL", () => {
      const already =
        "https://pbs.twimg.com/profile_images/123456789/abc_400x400.jpg";
      expect(normalizeXAvatarUrl(already)).toBe(already);
    });

    it("passes through pbs.twimg.com URLs with no size suffix unchanged", () => {
      const noSuffix =
        "https://pbs.twimg.com/profile_images/123456789/abc.jpg";
      expect(normalizeXAvatarUrl(noSuffix)).toBe(noSuffix);
    });

    it("does NOT mutate non-pbs.twimg.com URLs that happen to end with _normal", () => {
      const externalUrl = "https://example.com/user/avatar_normal.jpg";
      expect(normalizeXAvatarUrl(externalUrl)).toBe(externalUrl);
    });

    it("does NOT mutate plain http:// pbs.twimg.com URLs (only https)", () => {
      const httpUrl =
        "http://pbs.twimg.com/profile_images/123456789/abc_normal.jpg";
      expect(normalizeXAvatarUrl(httpUrl)).toBe(httpUrl);
    });

    it("returns null for null input", () => {
      expect(normalizeXAvatarUrl(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(normalizeXAvatarUrl(undefined)).toBeNull();
    });

    it("returns null for empty string input", () => {
      expect(normalizeXAvatarUrl("")).toBeNull();
    });
  });

  describe("X API Base URL Configuration & Mock Routing (Item 6 E2E Prep)", () => {
    it("defaults to official X API base URL when X_API_BASE_URL is not set", () => {
      delete process.env.X_API_BASE_URL;
      expect(DEFAULT_X_API_BASE_URL).toBe("https://api.twitter.com");
      expect(getXApiBaseUrl()).toBe("https://api.twitter.com");
    });

    it("defaults to official X API base URL when X_API_BASE_URL is empty or whitespace", () => {
      process.env.X_API_BASE_URL = "   ";
      expect(getXApiBaseUrl()).toBe("https://api.twitter.com");
    });

    it("uses X_API_BASE_URL override and strips trailing slashes", () => {
      process.env.X_API_BASE_URL = "http://127.0.0.1:9999///";
      expect(getXApiBaseUrl()).toBe("http://127.0.0.1:9999");
    });

    it("populates apiBaseUrl in getXConfig()", () => {
      process.env.X_CLIENT_ID = "mock-client-id";
      process.env.X_CLIENT_SECRET = "mock-client-secret";
      process.env.X_REDIRECT_URI = "https://chimphood.com/api/social/x/callback";

      // Default
      delete process.env.X_API_BASE_URL;
      const defaultConfig = getXConfig();
      expect(defaultConfig?.apiBaseUrl).toBe("https://api.twitter.com");

      // With override
      process.env.X_API_BASE_URL = "http://localhost:8080";
      const customConfig = getXConfig();
      expect(customConfig?.apiBaseUrl).toBe("http://localhost:8080");
    });

    it("always keeps browser authorization URL pointing strictly to official twitter.com regardless of X_API_BASE_URL", () => {
      process.env.X_CLIENT_ID = "mock-client-id";
      process.env.X_CLIENT_SECRET = "mock-client-secret";
      process.env.X_REDIRECT_URI = "https://chimphood.com/api/social/x/callback";
      process.env.X_API_BASE_URL = "http://127.0.0.1:9999";

      const authUrl = buildXAuthUrl("state-123", "challenge-456");
      expect(authUrl.startsWith("https://twitter.com/i/oauth2/authorize?")).toBe(true);
      expect(authUrl).not.toContain("127.0.0.1");
    });

    it("dispatches token exchange and users/me to official URL when X_API_BASE_URL is unset", async () => {
      process.env.X_CLIENT_ID = "mock-client-id";
      process.env.X_CLIENT_SECRET = "mock-client-secret";
      process.env.X_REDIRECT_URI = "https://chimphood.com/api/social/x/callback";
      delete process.env.X_API_BASE_URL;

      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "tok-official" }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { id: "x-official-1", username: "official_user" },
        }),
      });

      const mockUpsert = vi.fn().mockResolvedValue({
        id: "xid-1",
        userId: "u-1",
        xId: "x-official-1",
        username: "official_user",
      });
      const mockAudit = vi.fn().mockResolvedValue({ id: "audit-1" });
      const mockPrisma = {
        xIdentity: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: mockUpsert,
        },
        auditLog: { create: mockAudit },
      } as unknown as PrismaClient;

      await linkXAccountWithCode(mockPrisma, {
        userId: "u-1",
        code: "code-123",
        codeVerifier: "verifier-123",
      });

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        "https://api.twitter.com/2/oauth2/token",
        expect.objectContaining({ method: "POST" }),
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        "https://api.twitter.com/2/users/me?user.fields=profile_image_url",
        expect.objectContaining({
          headers: { Authorization: "Bearer tok-official" },
        }),
      );
    });

    it("dispatches token exchange and users/me to mock server when X_API_BASE_URL is set, while preserving all validation and persistence", async () => {
      process.env.X_CLIENT_ID = "mock-client-id";
      process.env.X_CLIENT_SECRET = "mock-client-secret";
      process.env.X_REDIRECT_URI = "https://chimphood.com/api/social/x/callback";
      process.env.X_API_BASE_URL = "http://127.0.0.1:9999";

      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      // Mock response from local mock server
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "tok-mock-server" }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: "x-mock-42",
            username: "e2e_mock_tester",
            name: "Mock Tester",
            profile_image_url: "https://pbs.twimg.com/profile_images/1/avatar_normal.jpg",
          },
        }),
      });

      const mockUpsert = vi.fn().mockResolvedValue({
        id: "xid-mock-42",
        userId: "user-e2e-1",
        xId: "x-mock-42",
        username: "e2e_mock_tester",
        name: "Mock Tester",
        profileImageUrl: "https://pbs.twimg.com/profile_images/1/avatar_400x400.jpg",
      });
      const mockAudit = vi.fn().mockResolvedValue({ id: "audit-mock-1" });
      const mockPrisma = {
        xIdentity: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: mockUpsert,
        },
        auditLog: { create: mockAudit },
      } as unknown as PrismaClient;

      const linked = await linkXAccountWithCode(mockPrisma, {
        userId: "user-e2e-1",
        code: "mock-auth-code",
        codeVerifier: "mock-code-verifier-base64url",
      });

      // Assert target mock server endpoints were invoked
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        "http://127.0.0.1:9999/2/oauth2/token",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: expect.stringMatching(/^Basic /),
          }),
          body: expect.stringContaining("code_verifier=mock-code-verifier-base64url"),
        }),
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        "http://127.0.0.1:9999/2/users/me?user.fields=profile_image_url",
        expect.objectContaining({
          headers: { Authorization: "Bearer tok-mock-server" },
        }),
      );

      // Verify returned identity and DB upsert
      expect(linked.xId).toBe("x-mock-42");
      expect(linked.username).toBe("e2e_mock_tester");
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-e2e-1" },
          create: expect.objectContaining({
            userId: "user-e2e-1",
            xId: "x-mock-42",
            username: "e2e_mock_tester",
            profileImageUrl: "https://pbs.twimg.com/profile_images/1/avatar_400x400.jpg",
          }),
        }),
      );
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: "user-e2e-1",
            action: "X_IDENTITY_LINKED",
            entityId: "xid-mock-42",
          }),
        }),
      );
    });
  });

  describe("E2E Database Isolation Security Guard", () => {
    it("assertSafeLocalTestDatabase blocks remote URLs, wrong databases, and non-local hosts", async () => {
      const { assertSafeLocalTestDatabase } = await import("../../playwright.config");

      // Remote Supabase or cloud databases must throw
      expect(() =>
        assertSafeLocalTestDatabase("postgresql://postgres:secret@db.supabase.co:5432/postgres"),
      ).toThrow(/Playwright E2E execution is strictly restricted to local database "chimphood_test"/);

      // Localhost with production/wrong DB name must throw
      expect(() =>
        assertSafeLocalTestDatabase("postgresql://postgres@localhost:5432/chimphood_production"),
      ).toThrow(/Playwright E2E execution is strictly restricted to local database "chimphood_test"/);

      // Non-localhost IP must throw
      expect(() =>
        assertSafeLocalTestDatabase("postgresql://postgres@192.168.1.100:5432/chimphood_test"),
      ).toThrow(/Playwright E2E execution is strictly restricted to local database "chimphood_test"/);

      // Malformed URL must throw
      expect(() =>
        assertSafeLocalTestDatabase("invalid-connection-string"),
      ).toThrow(/Invalid or malformed database URL for E2E testing/);

      // Safe local URLs must be accepted
      expect(
        assertSafeLocalTestDatabase("postgresql://hermawanprastiyanto@localhost:5432/chimphood_test"),
      ).toBe("postgresql://hermawanprastiyanto@localhost:5432/chimphood_test");

      expect(
        assertSafeLocalTestDatabase("postgresql://hermawanprastiyanto@127.0.0.1:5432/chimphood_test?schema=public"),
      ).toBe("postgresql://hermawanprastiyanto@127.0.0.1:5432/chimphood_test?schema=public");
    });

    it("cleanupXOAuthTestData executes targeted parameterized queries and preserves other users data", async () => {
      // Mock pg.Pool to inspect SQL queries and parameters executed by cleanup
      const querySpy = vi.fn().mockImplementation((queryText: string, params: any[]) => {
        if (queryText.includes('SELECT id, "userId" FROM "XIdentity"')) {
          return Promise.resolve({
            rows: [
              { id: "e2e-identity-id-1", userId: "e2e-user-id-1" },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const endSpy = vi.fn().mockResolvedValue(undefined);

      vi.doMock("pg", () => {
        class MockPool {
          query = querySpy;
          end = endSpy;
          constructor(public opts: any) {}
        }
        return {
          Pool: MockPool,
        };
      });

      const { cleanupXOAuthTestData } = await import("../../e2e/helpers/mock-x-server");
      await cleanupXOAuthTestData("custom_e2e_tester", "custom_e2e_xid");

      // Verify targeted queries executed with explicit parameters
      expect(querySpy).toHaveBeenCalledWith(
        'SELECT id, "userId" FROM "XIdentity" WHERE "username" = $1 OR "xId" = $2',
        ["custom_e2e_tester", "custom_e2e_xid"],
      );

      // Verify derivative WLQueueEntry deletion is scoped strictly to test userId
      expect(querySpy).toHaveBeenCalledWith(
        'DELETE FROM "WLQueueEntry" WHERE "userId" = ANY($1::text[])',
        [["e2e-user-id-1"]],
      );

      // Verify AuditLog deletion is strictly parameterized to test identity and parameters without touching other user actions
      const auditLogCall = querySpy.mock.calls.find((call) =>
        call[0].includes('DELETE FROM "AuditLog"'),
      );
      expect(auditLogCall).toBeDefined();
      expect(auditLogCall?.[1]).toEqual([
        "custom_e2e_tester",
        "custom_e2e_xid",
        ["e2e-identity-id-1"],
      ]);

      // Verify no blanket DELETE query without parameters was ever executed
      for (const call of querySpy.mock.calls) {
        const sql = call[0] as string;
        if (sql.startsWith("DELETE FROM")) {
          expect(call[1]).toBeDefined();
          expect(Array.isArray(call[1])).toBe(true);
          expect(call[1].length).toBeGreaterThan(0);
        }
      }

      vi.doUnmock("pg");
    });
  });
});
