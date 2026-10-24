import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  GET,
  POST,
  PUT,
  DELETE,
  PATCH,
  HEAD,
  OPTIONS,
} from "@/app/api/cron/cleanup-auth/route";

vi.mock("@/server/db", () => ({ prisma: { __fake: true } }));

vi.mock("@/server/auth/cleanup", () => ({
  cleanupExpiredAuth: vi.fn(),
}));

import { cleanupExpiredAuth } from "@/server/auth/cleanup";

describe("Task 2-C: Auth Session & Nonce Cleanup Cron (/api/cron/cleanup-auth)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: "test-cron-secret-key-99999" };
  });

  // ─── Authorization guard — unconfigured server secret ────────────────────────

  it("returns 500 SERVER_MISCONFIGURED when CRON_SECRET is not set on server", async () => {
    delete process.env.CRON_SECRET;

    const req = new Request("http://localhost:3000/api/cron/cleanup-auth", {
      method: "GET",
      headers: {
        Authorization: "Bearer test-cron-secret-key-99999",
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("SERVER_MISCONFIGURED");
    expect(cleanupExpiredAuth).not.toHaveBeenCalled();
  });

  // ─── Authorization guard — missing / invalid bearer ──────────────────────────

  it("returns 401 UNAUTHORIZED when Authorization header is missing", async () => {
    const req = new Request("http://localhost:3000/api/cron/cleanup-auth", {
      method: "GET",
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("UNAUTHORIZED");
    expect(cleanupExpiredAuth).not.toHaveBeenCalled();
  });

  it("returns 401 UNAUTHORIZED when Authorization header does not use Bearer scheme", async () => {
    const req = new Request("http://localhost:3000/api/cron/cleanup-auth", {
      method: "GET",
      headers: {
        Authorization: "Basic dXNlcjpwYXNz",
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("UNAUTHORIZED");
    expect(cleanupExpiredAuth).not.toHaveBeenCalled();
  });

  it("returns 401 UNAUTHORIZED when Bearer token does not match CRON_SECRET", async () => {
    const req = new Request("http://localhost:3000/api/cron/cleanup-auth", {
      method: "GET",
      headers: {
        Authorization: "Bearer wrong-token",
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("UNAUTHORIZED");
    expect(cleanupExpiredAuth).not.toHaveBeenCalled();
  });

  // ─── Successful cleanup ───────────────────────────────────────────────────────

  it("invokes cleanupExpiredAuth and returns 200 with counts via GET", async () => {
    vi.mocked(cleanupExpiredAuth).mockResolvedValueOnce({
      deletedNonces: 12,
      deletedSessions: 5,
    });

    const req = new Request("http://localhost:3000/api/cron/cleanup-auth", {
      method: "GET",
      headers: {
        Authorization: "Bearer test-cron-secret-key-99999",
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.deletedNonces).toBe(12);
    expect(json.deletedSessions).toBe(5);
    expect(typeof json.at).toBe("string");
    expect(cleanupExpiredAuth).toHaveBeenCalledTimes(1);
  });

  it("invokes cleanupExpiredAuth and returns 200 with counts via POST", async () => {
    vi.mocked(cleanupExpiredAuth).mockResolvedValueOnce({
      deletedNonces: 0,
      deletedSessions: 0,
    });

    const req = new Request("http://localhost:3000/api/cron/cleanup-auth", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-cron-secret-key-99999",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.deletedNonces).toBe(0);
    expect(json.deletedSessions).toBe(0);
    expect(cleanupExpiredAuth).toHaveBeenCalledTimes(1);
  });

  // ─── Preservation of unexpired records ───────────────────────────────────────

  it("passes a 'now' timestamp so only records with expiresAt < now are deleted, not future ones", async () => {
    // The service is called with a Date — unexpired records (expiresAt >= now)
    // are NOT touched. This test verifies cleanupExpiredAuth receives the
    // correct 'now' argument so the Prisma filter is scoped correctly.
    vi.mocked(cleanupExpiredAuth).mockResolvedValueOnce({
      deletedNonces: 3,
      deletedSessions: 1,
    });

    const before = new Date();

    const req = new Request("http://localhost:3000/api/cron/cleanup-auth", {
      method: "GET",
      headers: {
        Authorization: "Bearer test-cron-secret-key-99999",
      },
    });

    const res = await GET(req);
    const after = new Date();

    expect(res.status).toBe(200);

    const [, calledNow] = vi.mocked(cleanupExpiredAuth).mock.calls[0] as [unknown, Date];
    expect(calledNow.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(calledNow.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  // ─── Server error handling ────────────────────────────────────────────────────

  it("returns 500 SERVER_ERROR when cleanupExpiredAuth throws", async () => {
    vi.mocked(cleanupExpiredAuth).mockRejectedValueOnce(new Error("DB unreachable"));

    const req = new Request("http://localhost:3000/api/cron/cleanup-auth", {
      method: "GET",
      headers: {
        Authorization: "Bearer test-cron-secret-key-99999",
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("SERVER_ERROR");
  });

  // ─── Method not allowed ───────────────────────────────────────────────────────

  it("returns 405 Method Not Allowed for unsupported HTTP methods", async () => {
    const unsupportedHandlers = [PUT, DELETE, PATCH, HEAD, OPTIONS];

    for (const handler of unsupportedHandlers) {
      const res = await handler();
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("GET, POST");
    }
  });
});
