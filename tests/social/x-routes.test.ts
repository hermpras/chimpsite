import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET as connectGET } from "@/app/api/social/x/connect/route";
import { GET as callbackGET } from "@/app/api/social/x/callback/route";
import {
  sealXOAuthState,
  buildXOAuthCookie,
  __clearConsumedOAuthStates,
  XOAuthError,
  X_OAUTH_COOKIE_NAME,
  type XOAuthStatePayload,
} from "@/server/social/x";

const {
  mockAuthenticateRequest,
  mockLinkXAccountWithCode,
  mockRouteRedisStore,
  mockRouteRedisSet,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockLinkXAccountWithCode: vi.fn(),
  mockRouteRedisStore: new Map<string, string>(),
  mockRouteRedisSet: vi.fn(),
}));

vi.mock("@upstash/redis", () => {
  class MockRedis {
    set = mockRouteRedisSet;
    async get(key: string) {
      return mockRouteRedisStore.get(key) ?? null;
    }
    async del(key: string) {
      return mockRouteRedisStore.delete(key) ? 1 : 0;
    }
  }
  return {
    Redis: MockRedis,
  };
});

vi.mock("@/server/auth/session", () => ({
  authenticateRequest: mockAuthenticateRequest,
}));

vi.mock("@/server/db", () => ({
  prisma: { __fake: true },
}));

vi.mock("@/server/social/x", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/social/x")>();
  return {
    ...actual,
    linkXAccountWithCode: mockLinkXAccountWithCode,
  };
});

describe("X OAuth 2.0 API Routes", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.SESSION_SECRET = "test-session-secret-0123456789abcdef";
    process.env.X_CLIENT_ID = "mock-client-id";
    process.env.X_CLIENT_SECRET = "mock-client-secret";
    process.env.X_REDIRECT_URI = "https://chimphood.com/api/social/x/callback";
    process.env.UPSTASH_REDIS_REST_URL = "https://mock-redis.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "mock-redis-token";
    mockRouteRedisStore.clear();
    mockRouteRedisSet.mockReset();
    mockRouteRedisSet.mockImplementation(
      async (key: string, value: string, opts?: { ex?: number; nx?: boolean }) => {
        if (opts?.nx && mockRouteRedisStore.has(key)) {
          return null;
        }
        mockRouteRedisStore.set(key, value);
        return "OK";
      },
    );
    vi.clearAllMocks();
    __clearConsumedOAuthStates();
  });

  afterEach(() => {
    process.env = originalEnv;
    __clearConsumedOAuthStates();
  });

  describe("GET /api/social/x/connect", () => {
    it("returns 401 when user is not authenticated with wallet", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce(null);

      const res = await connectGET();
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("UNAUTHORIZED");
    });

    it("returns 503 when X credentials are not configured", async () => {
      delete process.env.X_CLIENT_ID;
      mockAuthenticateRequest.mockResolvedValueOnce({
        sessionId: "sess-1",
        userId: "user-1",
        address: "0x123",
      });

      const res = await connectGET();
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error).toBe("X_OAUTH_NOT_CONFIGURED");
    });

    it("returns authorization URL, state, and sets HttpOnly cookie with sealed PKCE state", async () => {
      mockAuthenticateRequest.mockResolvedValueOnce({
        sessionId: "sess-1",
        userId: "user-1",
        address: "0x123",
      });

      const res = await connectGET();
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.url).toContain("https://twitter.com/i/oauth2/authorize");
      expect(data.url).toContain("code_challenge=");
      expect(data.url).toContain(`state=${data.state}`);

      const setCookie = res.headers.get("Set-Cookie");
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain(`${X_OAUTH_COOKIE_NAME}=`);
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("Path=/api/social/x");
      expect(setCookie).toContain("SameSite=Lax");
    });
  });

  describe("GET /api/social/x/callback", () => {
    async function createValidCookieHeader(overrides?: Partial<XOAuthStatePayload>) {
      const now = Date.now();
      const payload: XOAuthStatePayload = {
        state: "valid-state-123",
        codeVerifier: "valid-verifier-456",
        userId: "user-1",
        sessionId: "sess-1",
        createdAt: now,
        expiresAt: now + 600000,
        ...overrides,
      };
      const sealed = await sealXOAuthState(payload);
      return {
        payload,
        cookieHeader: `${X_OAUTH_COOKIE_NAME}=${encodeURIComponent(sealed)}`,
      };
    }

    it("returns 503 when X credentials are not configured", async () => {
      delete process.env.X_CLIENT_ID;

      const req = new Request(
        "http://localhost:3000/api/social/x/callback?code=abc&state=xyz",
      );
      const res = await callbackGET(req);
      expect(res.status).toBe(503);
      expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
    });

    it("rejects provider errors (e.g. user denied access) and clears cookie", async () => {
      const req = new Request(
        "http://localhost:3000/api/social/x/callback?error=access_denied&error_description=The+user+denied+access",
      );
      const res = await callbackGET(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("X_OAUTH_PROVIDER_ERROR");
      expect(data.message).toBe("The user denied access");
      expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
    });

    it("rejects missing code or state parameter and clears cookie", async () => {
      const req = new Request(
        "http://localhost:3000/api/social/x/callback?code=onlycode",
      );
      const res = await callbackGET(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_CALLBACK");
      expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
    });

    it("rejects missing or invalid OAuth state cookie and does NOT accept codeVerifier from query parameter", async () => {
      // Query param has code_verifier, but no valid cookie exists
      const req = new Request(
        "http://localhost:3000/api/social/x/callback?code=abc&state=xyz&code_verifier=evil-verifier",
      );
      const res = await callbackGET(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_OAUTH_STATE");
      expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
    });

    it("rejects expired OAuth state and clears cookie", async () => {
      const { payload, cookieHeader } = await createValidCookieHeader({
        expiresAt: Date.now() - 1000, // expired 1s ago
      });

      const req = new Request(
        `http://localhost:3000/api/social/x/callback?code=abc&state=${payload.state}`,
        {
          headers: { Cookie: cookieHeader },
        },
      );
      const res = await callbackGET(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("OAUTH_STATE_EXPIRED");
      expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
    });

    it("rejects state mismatch using timing-safe comparison and clears cookie", async () => {
      const { cookieHeader } = await createValidCookieHeader();

      const req = new Request(
        "http://localhost:3000/api/social/x/callback?code=abc&state=wrong-state",
        {
          headers: { Cookie: cookieHeader },
        },
      );
      const res = await callbackGET(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_OAUTH_STATE");
      expect(data.message).toBe("OAuth state mismatch.");
      expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
    });

    it("rejects state replay attempts and clears cookie", async () => {
      const { payload, cookieHeader } = await createValidCookieHeader();

      mockAuthenticateRequest.mockResolvedValue({
        sessionId: "sess-1",
        userId: "user-1",
        address: "0x123",
      });
      mockLinkXAccountWithCode.mockResolvedValue({
        userId: "user-1",
        xId: "x-1",
        username: "user1",
      });

      const makeReq = () =>
        new Request(
          `http://localhost:3000/api/social/x/callback?code=abc&state=${payload.state}`,
          { headers: { Cookie: cookieHeader } },
        );

      // First call succeeds
      const res1 = await callbackGET(makeReq());
      expect(res1.status).toBe(302);
      expect(res1.headers.get("Location")).toBe(
        "http://localhost:3000/profile?x_linked=1",
      );

      // Second replayed call with same state is rejected
      const res2 = await callbackGET(makeReq());
      expect(res2.status).toBe(400);
      const data2 = await res2.json();
      expect(data2.error).toBe("OAUTH_STATE_REPLAYED");
      expect(res2.headers.get("Set-Cookie")).toContain("Max-Age=0");
    });

    it("returns 500 and clears cookie when Upstash Redis credentials are not configured", async () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      __clearConsumedOAuthStates();

      const { payload, cookieHeader } = await createValidCookieHeader();
      const req = new Request(
        `http://localhost:3000/api/social/x/callback?code=abc&state=${payload.state}`,
        { headers: { Cookie: cookieHeader } },
      );
      const res = await callbackGET(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe("OAUTH_STORAGE_NOT_CONFIGURED");
      expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
    });

    it("returns 500 and clears cookie when Redis operation throws an error", async () => {
      mockRouteRedisSet.mockRejectedValueOnce(new Error("Redis connection dropped"));

      const { payload, cookieHeader } = await createValidCookieHeader();
      const req = new Request(
        `http://localhost:3000/api/social/x/callback?code=abc&state=${payload.state}`,
        { headers: { Cookie: cookieHeader } },
      );
      const res = await callbackGET(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe("OAUTH_STORAGE_ERROR");
      expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
    });

    it("rejects unauthenticated requests (401) and clears cookie", async () => {
      const { payload, cookieHeader } = await createValidCookieHeader();
      mockAuthenticateRequest.mockResolvedValueOnce(null);

      const req = new Request(
        `http://localhost:3000/api/social/x/callback?code=abc&state=${payload.state}`,
        { headers: { Cookie: cookieHeader } },
      );
      const res = await callbackGET(req);
      expect(res.status).toBe(401);
      expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
    });

    it("rejects session mismatch when user attempting to link does not match initiating user (403)", async () => {
      const { payload, cookieHeader } = await createValidCookieHeader({
        userId: "user-ORIGINAL",
        sessionId: "sess-ORIGINAL",
      });

      // Different user logged in
      mockAuthenticateRequest.mockResolvedValueOnce({
        sessionId: "sess-DIFFERENT",
        userId: "user-DIFFERENT",
        address: "0xdifferent",
      });

      const req = new Request(
        `http://localhost:3000/api/social/x/callback?code=abc&state=${payload.state}`,
        { headers: { Cookie: cookieHeader } },
      );
      const res = await callbackGET(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("SESSION_MISMATCH");
      expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
    });

    it("successfully exchanges code, links X identity, and clears cookie", async () => {
      const { payload, cookieHeader } = await createValidCookieHeader({
        userId: "user-1",
        sessionId: "sess-1",
        codeVerifier: "my-pkce-verifier",
      });

      mockAuthenticateRequest.mockResolvedValueOnce({
        sessionId: "sess-1",
        userId: "user-1",
        address: "0x123",
      });

      mockLinkXAccountWithCode.mockResolvedValueOnce({
        userId: "user-1",
        xId: "x-987",
        username: "chimphood_user",
      });

      const req = new Request(
        `http://localhost:3000/api/social/x/callback?code=mock-auth-code&state=${payload.state}`,
        { headers: { Cookie: cookieHeader } },
      );

      const res = await callbackGET(req);
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe(
        "http://localhost:3000/profile?x_linked=1",
      );

      // Verify codeVerifier was passed strictly from cookie to linkXAccountWithCode
      expect(mockLinkXAccountWithCode).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: "user-1",
          code: "mock-auth-code",
          codeVerifier: "my-pkce-verifier",
        }),
      );

      // Verify cookie is cleared on success
      expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
    });

    it("handles XOAuthError (e.g. 409 already linked) and clears cookie", async () => {
      const { payload, cookieHeader } = await createValidCookieHeader();

      mockAuthenticateRequest.mockResolvedValueOnce({
        sessionId: "sess-1",
        userId: "user-1",
        address: "0x123",
      });

      mockLinkXAccountWithCode.mockRejectedValueOnce(
        new XOAuthError(
          "X_ACCOUNT_ALREADY_LINKED",
          "This X account is already linked to another profile.",
          409,
        ),
      );

      const req = new Request(
        `http://localhost:3000/api/social/x/callback?code=mock-code&state=${payload.state}`,
        { headers: { Cookie: cookieHeader } },
      );

      const res = await callbackGET(req);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe("X_ACCOUNT_ALREADY_LINKED");
      expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
    });
  });
});
