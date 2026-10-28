import { describe, it, expect, vi } from "vitest";
import { GET, PUT, DELETE, PATCH, HEAD, OPTIONS, POST } from "@/app/api/auth/nonce/route";

vi.mock("@/lib/auth/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    __clearRateLimitBuckets: vi.fn(),
  };
});

// NOTE: the happy-path POST requires a live database and is not tested here.
// The issuance logic is covered by tests/auth/nonce-service.test.ts with a
// fake store. The validation tests below do not touch the database: an
// invalid address is rejected before the Prisma client is imported.

describe("POST /api/auth/nonce — unsupported methods", () => {
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

describe("POST /api/auth/nonce — request validation (no database)", () => {
  function postJson(body: unknown): Request {
    return new Request("http://localhost/api/auth/nonce", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("rejects a present-but-invalid address with 400 before touching the database", async () => {
    const res = await POST(postJson({ address: "not-an-address" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/invalid wallet address/i);
  });

  it("rejects a non-string address with 400", async () => {
    const res = await POST(postJson({ address: 12345 }));
    expect(res.status).toBe(400);
  });
});
