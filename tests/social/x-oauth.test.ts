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
  __clearConsumedOAuthStates,
  X_OAUTH_COOKIE_NAME,
  type XOAuthStatePayload,
} from "@/server/social/x";
import type { PrismaClient } from "@prisma/client";

describe("X (Twitter) OAuth 2.0 PKCE Service", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.X_CLIENT_ID;
    delete process.env.X_CLIENT_SECRET;
    delete process.env.X_REDIRECT_URI;
    process.env.SESSION_SECRET = "test-session-secret-0123456789abcdef";
    __clearConsumedOAuthStates();
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

  describe("Timing-Safe Equality & Replay Prevention", () => {
    it("timingSafeEqualString returns true for identical strings and false for mismatched or unequal lengths", () => {
      expect(timingSafeEqualString("hello12345", "hello12345")).toBe(true);
      expect(timingSafeEqualString("hello12345", "hello12346")).toBe(false);
      expect(timingSafeEqualString("hello12345", "hello")).toBe(false);
      expect(timingSafeEqualString("", "")).toBe(true);
    });

    it("markStateConsumed rejects replay attempts of the exact same state", () => {
      const state = "unique-state-12345";
      expect(markStateConsumed(state)).toBe(true);
      // Immediate second attempt with same state must be rejected as replay
      expect(markStateConsumed(state)).toBe(false);
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
  });
});
