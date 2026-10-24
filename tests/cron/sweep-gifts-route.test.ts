import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  GET,
  POST,
  PUT,
  DELETE,
  PATCH,
  HEAD,
  OPTIONS,
} from "@/app/api/cron/sweep-gifts/route";

vi.mock("@/server/db", () => ({ prisma: { __fake: true } }));

vi.mock("@/server/inventory/gift", () => ({
  sweepExpiredGifts: vi.fn(),
}));

import { sweepExpiredGifts } from "@/server/inventory/gift";

describe("Task 2-A: Gift Expiry Sweep Cron Route (/api/cron/sweep-gifts)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: "test-cron-secret-key-12345" };
  });

  it("returns 500 SERVER_MISCONFIGURED when CRON_SECRET is not configured on server", async () => {
    delete process.env.CRON_SECRET;

    const req = new Request("http://localhost:3000/api/cron/sweep-gifts", {
      method: "GET",
      headers: {
        Authorization: "Bearer test-cron-secret-key-12345",
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("SERVER_MISCONFIGURED");
    expect(sweepExpiredGifts).not.toHaveBeenCalled();
  });

  it("returns 401 UNAUTHORIZED when Authorization header is missing", async () => {
    const req = new Request("http://localhost:3000/api/cron/sweep-gifts", {
      method: "GET",
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("UNAUTHORIZED");
    expect(sweepExpiredGifts).not.toHaveBeenCalled();
  });

  it("returns 401 UNAUTHORIZED when Authorization header does not use Bearer scheme", async () => {
    const req = new Request("http://localhost:3000/api/cron/sweep-gifts", {
      method: "GET",
      headers: {
        Authorization: "Basic dXNlcjpwYXNz",
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("UNAUTHORIZED");
    expect(sweepExpiredGifts).not.toHaveBeenCalled();
  });

  it("returns 401 UNAUTHORIZED when Bearer token does not match CRON_SECRET", async () => {
    const req = new Request("http://localhost:3000/api/cron/sweep-gifts", {
      method: "GET",
      headers: {
        Authorization: "Bearer wrong-token-value",
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("UNAUTHORIZED");
    expect(sweepExpiredGifts).not.toHaveBeenCalled();
  });

  it("Task 5-C: safely rejects tokens with different length via constant-time comparison", async () => {
    const req = new Request("http://localhost:3000/api/cron/sweep-gifts", {
      method: "GET",
      headers: {
        Authorization: "Bearer short",
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("UNAUTHORIZED");
    expect(sweepExpiredGifts).not.toHaveBeenCalled();
  });

  it("successfully invokes sweepExpiredGifts and returns 200 with GET when authorized", async () => {
    vi.mocked(sweepExpiredGifts).mockResolvedValueOnce({
      processedCount: 3,
      giftIds: ["gift-1", "gift-2", "gift-3"],
    });

    const req = new Request("http://localhost:3000/api/cron/sweep-gifts", {
      method: "GET",
      headers: {
        Authorization: "Bearer test-cron-secret-key-12345",
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.swept).toBe(3);
    expect(json.giftIds).toEqual(["gift-1", "gift-2", "gift-3"]);
    expect(typeof json.at).toBe("string");
    expect(sweepExpiredGifts).toHaveBeenCalledTimes(1);
  });

  it("successfully invokes sweepExpiredGifts and returns 200 with POST when authorized", async () => {
    vi.mocked(sweepExpiredGifts).mockResolvedValueOnce({
      processedCount: 0,
      giftIds: [],
    });

    const req = new Request("http://localhost:3000/api/cron/sweep-gifts", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-cron-secret-key-12345",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.swept).toBe(0);
    expect(json.giftIds).toEqual([]);
    expect(sweepExpiredGifts).toHaveBeenCalledTimes(1);
  });

  it("returns 405 Method Not Allowed for unsupported HTTP methods", async () => {
    const unsupportedMethods = [PUT, DELETE, PATCH, HEAD, OPTIONS];

    for (const handler of unsupportedMethods) {
      const res = await handler();
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("GET, POST");
    }
  });
});
