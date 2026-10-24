import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GET,
  PUT,
  DELETE,
  PATCH,
  HEAD,
  OPTIONS,
  POST,
} from "@/app/api/auth/verify/route";
import { SiweAuthError } from "@/server/auth/verify";
import { __clearRateLimitBuckets } from "@/lib/auth/rate-limit";

// NOTE: these tests mock the DB client, the login orchestration, and the
// cookie sealing, so no database, request scope, or iron-session is touched.
// What IS real: body parsing + size limiting, rate limiting, env config
// resolution, error mapping, and the 405 handlers.

// vi.mock factories are hoisted above top-level statements, so the mocks
// must be created via vi.hoisted().
const { mockVerifySiweLogin, mockSealSessionCookie, mockCheckRateLimit } = vi.hoisted(
  () => ({
    mockVerifySiweLogin: vi.fn(),
    mockSealSessionCookie: vi.fn(),
    mockCheckRateLimit: vi.fn(),
  }),
);

vi.mock("@/server/auth/verify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/verify")>();
  return { ...actual, verifySiweLogin: mockVerifySiweLogin };
});
vi.mock("@/server/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/session")>();
  return { ...actual, sealSessionCookie: mockSealSessionCookie };
});
vi.mock("@/lib/auth/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: mockCheckRateLimit,
    __clearRateLimitBuckets: vi.fn(),
  };
});
// The route dynamically imports the DB client inside POST — stub it so the
// module can never touch a real database.
vi.mock("@/server/db", () => ({ prisma: { __fake: true } }));

const ENV_KEYS = [
  "SIWE_DOMAIN",
  "SIWE_URI",
  "ALLOWED_CHAIN_IDS",
  "SESSION_SECRET",
] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.SIWE_DOMAIN = "localhost:3000";
  process.env.SIWE_URI = "http://localhost:3000";
  process.env.ALLOWED_CHAIN_IDS = "1";
  process.env.SESSION_SECRET = "test-session-secret-0123456789abcdef";
  mockVerifySiweLogin.mockReset();
  mockSealSessionCookie.mockReset();
  mockCheckRateLimit.mockReset();
  mockCheckRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  __clearRateLimitBuckets();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

function postJson(body: unknown, ip = "10.0.0.1"): Request {
  return new Request("http://localhost/api/auth/verify", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/auth/verify — unsupported methods", () => {
  const handlers = { GET, PUT, DELETE, PATCH, HEAD, OPTIONS } as const;

  for (const [name, handler] of Object.entries(handlers)) {
    it(`rejects ${name} with 405 and an Allow header`, async () => {
      const respond = handler as () => Response | Promise<Response>;
      const res = await respond();
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("POST");
      const body = (await res.json()) as { error?: string };
      expect(body.error).toMatch(/method not allowed/i);
    });
  }
});

describe("POST /api/auth/verify", () => {
  it("returns 200 and seals the session cookie on success", async () => {
    mockVerifySiweLogin.mockResolvedValue({
      userId: "user_1",
      address: "0xabc",
      rawToken: "raw-token-123",
    });

    const res = await POST(postJson({ message: "msg", signature: "sig" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { address?: string; userId?: string };
    expect(body).toEqual({ address: "0xabc", userId: "user_1" });
    expect(mockVerifySiweLogin).toHaveBeenCalledTimes(1);
    // The raw token is sealed into the cookie — never echoed in the body.
    expect(mockSealSessionCookie).toHaveBeenCalledTimes(1);
    expect(mockSealSessionCookie).toHaveBeenCalledWith({
      userId: "user_1",
      address: "0xabc",
      token: "raw-token-123",
    });
  });

  it.each<[string, number, string]>([
    ["AUTH_FAILED", 401, "Authentication failed."],
    ["NONCE_INVALID", 401, "Authentication failed."],
    ["INVALID_REQUEST", 400, "Invalid request."],
    ["ACCOUNT_SUSPENDED", 403, "Account suspended."],
  ])(
    "maps %s to %i with a generic message (no internal details)",
    async (code, status, message) => {
      mockVerifySiweLogin.mockRejectedValue(new SiweAuthError(code, status));

      const res = await POST(postJson({ message: "m", signature: "s" }));

      expect(res.status).toBe(status);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe(message);
      expect(body.error).not.toContain(code);
      expect(mockSealSessionCookie).not.toHaveBeenCalled();
    },
  );

  it("returns 500 for unexpected errors with a generic message", async () => {
    mockVerifySiweLogin.mockRejectedValue(new Error("db connection lost"));

    const res = await POST(postJson({ message: "m", signature: "s" }));

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Authentication failed.");
    expect(body.error).not.toContain("db connection lost");
  });

  it("returns 500 without touching login logic when SESSION_SECRET is misconfigured", async () => {
    delete process.env.SESSION_SECRET;

    const res = await POST(postJson({ message: "m", signature: "s" }));

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Authentication unavailable.");
    // Session config is validated BEFORE the nonce is consumed or any
    // database record is created.
    expect(mockVerifySiweLogin).not.toHaveBeenCalled();
    expect(mockSealSessionCookie).not.toHaveBeenCalled();
  });

  it("returns 500 when SIWE_DOMAIN is unset", async () => {
    delete process.env.SIWE_DOMAIN;

    const res = await POST(postJson({ message: "m", signature: "s" }));

    expect(res.status).toBe(500);
    expect(mockVerifySiweLogin).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies with 413 before touching login logic", async () => {
    const big = "x".repeat(16 * 1024);

    const res = await POST(postJson({ message: big, signature: "s" }));

    expect(res.status).toBe(413);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Request too large.");
    expect(mockVerifySiweLogin).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await POST(postJson("{not json"));

    expect(res.status).toBe(400);
    expect(mockVerifySiweLogin).not.toHaveBeenCalled();
  });

  it("rejects a body missing message/signature with 400", async () => {
    const res = await POST(postJson({}));

    expect(res.status).toBe(400);
    expect(mockVerifySiweLogin).not.toHaveBeenCalled();
  });

  it("rejects with 429 when rate limit is exceeded", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 45 });

    const res = await POST(postJson({ message: "m", signature: "s" }));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("45");
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Too many requests. Please try again later.");
    expect(mockVerifySiweLogin).not.toHaveBeenCalled();
  });

  it("fails closed with 500 when rate limiter fails", async () => {
    mockCheckRateLimit.mockRejectedValueOnce(new Error("Redis connection timed out"));

    const res = await POST(postJson({ message: "m", signature: "s" }));

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Authentication unavailable.");
    expect(mockVerifySiweLogin).not.toHaveBeenCalled();
  });
});
