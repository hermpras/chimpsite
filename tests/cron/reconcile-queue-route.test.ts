import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  GET,
  POST,
  PUT,
  DELETE,
  PATCH,
  HEAD,
  OPTIONS,
} from "@/app/api/cron/reconcile-queue/route";
import {
  GET as ALIAS_GET,
  POST as ALIAS_POST,
  PUT as ALIAS_PUT,
  DELETE as ALIAS_DELETE,
  PATCH as ALIAS_PATCH,
  HEAD as ALIAS_HEAD,
  OPTIONS as ALIAS_OPTIONS,
} from "@/app/api/cron/reconcile-wl/route";

describe("Decommissioned Whitelist Queue Reconciliation Cron Route (/api/cron/reconcile-queue)", () => {
  const originalEnv = process.env;
  const validSecret = "test-cron-secret-key-reconcile-88888";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: validSecret };
  });

  // ─── 1. Authorization Guard ──────────────────────────────────────────────
  describe("1. Authorization Guard", () => {
    it("returns 500 SERVER_MISCONFIGURED when CRON_SECRET is not configured on server", async () => {
      delete process.env.CRON_SECRET;
      const req = new Request("http://localhost:3000/api/cron/reconcile-queue", {
        method: "GET",
        headers: { authorization: `Bearer ${validSecret}` },
      });
      const res = await GET(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("SERVER_MISCONFIGURED");
    });

    it("returns 401 UNAUTHORIZED when Authorization header is missing", async () => {
      const req = new Request("http://localhost:3000/api/cron/reconcile-queue", {
        method: "GET",
      });
      const res = await GET(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("UNAUTHORIZED");
    });

    it("returns 401 UNAUTHORIZED when Authorization header does not use Bearer scheme", async () => {
      const req = new Request("http://localhost:3000/api/cron/reconcile-queue", {
        method: "GET",
        headers: { authorization: `Basic ${validSecret}` },
      });
      const res = await GET(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("UNAUTHORIZED");
    });

    it("returns 401 UNAUTHORIZED when Bearer token does not match CRON_SECRET", async () => {
      const req = new Request("http://localhost:3000/api/cron/reconcile-queue", {
        method: "GET",
        headers: { authorization: "Bearer invalid-wrong-secret-token" },
      });
      const res = await GET(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("UNAUTHORIZED");
    });
  });

  // ─── 2. Decommissioned Behavior (DEC-018) ────────────────────────────────
  describe("2. Decommissioned Execution per DEC-018", () => {
    it("returns 200 with deprecated status and 0 slots filled via GET", async () => {
      const req = new Request("http://localhost:3000/api/cron/reconcile-queue", {
        method: "GET",
        headers: { authorization: `Bearer ${validSecret}` },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.deprecated).toBe(true);
      expect(json.slotsFilled).toBe(0);
      expect(json.totalSlotsFilled).toBe(0);
    });

    it("returns 200 with deprecated status and 0 slots filled via POST", async () => {
      const req = new Request("http://localhost:3000/api/cron/reconcile-queue", {
        method: "POST",
        headers: {
          authorization: `Bearer ${validSecret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ programId: "prog-1" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.deprecated).toBe(true);
      expect(json.slotsFilled).toBe(0);
    });

    it("returns 400 INVALID_INPUT when query param programId is empty", async () => {
      const req = new Request("http://localhost:3000/api/cron/reconcile-queue?programId=", {
        method: "GET",
        headers: { authorization: `Bearer ${validSecret}` },
      });
      const res = await GET(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_INPUT");
    });
  });

  // ─── 3. Method Not Allowed (405) ─────────────────────────────────────────
  describe("3. Method Not Allowed (405)", () => {
    it("returns 405 Method Not Allowed for PUT, DELETE, PATCH, HEAD, OPTIONS", async () => {
      const putRes = await PUT();
      expect(putRes.status).toBe(405);
      expect(putRes.headers.get("Allow")).toBe("GET, POST");

      const delRes = await DELETE();
      expect(delRes.status).toBe(405);

      const patchRes = await PATCH();
      expect(patchRes.status).toBe(405);

      const headRes = await HEAD();
      expect(headRes.status).toBe(405);

      const optRes = await OPTIONS();
      expect(optRes.status).toBe(405);
    });
  });

  // ─── 4. Alias Route (/api/cron/reconcile-wl) ──────────────────────────────
  describe("4. Alias Route (/api/cron/reconcile-wl)", () => {
    it("alias route handles GET requests with identical auth and logic", async () => {
      const req = new Request("http://localhost:3000/api/cron/reconcile-wl", {
        method: "GET",
        headers: { authorization: `Bearer ${validSecret}` },
      });
      const res = await ALIAS_GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.deprecated).toBe(true);
    });

    it("alias route returns 405 on unsupported methods", async () => {
      const res = await ALIAS_PUT();
      expect(res.status).toBe(405);
    });
  });
});
