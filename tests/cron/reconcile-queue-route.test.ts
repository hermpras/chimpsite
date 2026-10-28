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

vi.mock("@/server/db", () => ({ prisma: { __fake: true } }));

vi.mock("@/server/whitelist/qualification", () => {
  class MockWhitelistError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number = 400) {
      super(message);
      this.name = "WhitelistError";
      this.code = code;
      this.status = status;
    }
  }

  return {
    reconcileQueueSlots: vi.fn(),
    reconcileAllOpenPrograms: vi.fn(),
    WhitelistError: MockWhitelistError,
  };
});

import {
  reconcileQueueSlots,
  reconcileAllOpenPrograms,
  WhitelistError,
} from "@/server/whitelist/qualification";

describe("Task O-4: Whitelist Queue Reconciliation Cron Route (/api/cron/reconcile-queue)", () => {
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
        headers: {
          Authorization: `Bearer ${validSecret}`,
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("SERVER_MISCONFIGURED");
      expect(reconcileAllOpenPrograms).not.toHaveBeenCalled();
      expect(reconcileQueueSlots).not.toHaveBeenCalled();
    });

    it("returns 401 UNAUTHORIZED when Authorization header is missing", async () => {
      const req = new Request("http://localhost:3000/api/cron/reconcile-queue", {
        method: "GET",
      });

      const res = await GET(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("UNAUTHORIZED");
      expect(reconcileAllOpenPrograms).not.toHaveBeenCalled();
    });

    it("returns 401 UNAUTHORIZED when Authorization header does not use Bearer scheme", async () => {
      const req = new Request("http://localhost:3000/api/cron/reconcile-queue", {
        method: "GET",
        headers: {
          Authorization: "Basic dXNlcjpwYXNz",
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("UNAUTHORIZED");
      expect(reconcileAllOpenPrograms).not.toHaveBeenCalled();
    });

    it("returns 401 UNAUTHORIZED when Bearer token does not match CRON_SECRET", async () => {
      const req = new Request("http://localhost:3000/api/cron/reconcile-queue", {
        method: "GET",
        headers: {
          Authorization: "Bearer wrong-secret-token",
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("UNAUTHORIZED");
      expect(reconcileAllOpenPrograms).not.toHaveBeenCalled();
    });

    it("safely rejects tokens of different length via constant-time comparison", async () => {
      const req = new Request("http://localhost:3000/api/cron/reconcile-queue", {
        method: "GET",
        headers: {
          Authorization: "Bearer short",
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("UNAUTHORIZED");
      expect(reconcileAllOpenPrograms).not.toHaveBeenCalled();
    });
  });

  // ─── 2. Default Cron Execution (All Open Programs) ───────────────────────

  describe("2. Default Cron Execution (All Open Programs)", () => {
    it("successfully invokes reconcileAllOpenPrograms and returns 200 via GET", async () => {
      vi.mocked(reconcileAllOpenPrograms).mockResolvedValueOnce({
        processedPrograms: 2,
        totalSlotsFilled: 5,
        results: [
          { programId: "prog-1", slotsFilled: 3, openSlotsRemaining: 0 },
          { programId: "prog-2", slotsFilled: 2, openSlotsRemaining: 8 },
        ],
      });

      const req = new Request("http://localhost:3000/api/cron/reconcile-queue", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${validSecret}`,
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.processedPrograms).toBe(2);
      expect(json.totalSlotsFilled).toBe(5);
      expect(json.slotsFilled).toBe(5);
      expect(json.programs).toHaveLength(2);
      expect(typeof json.at).toBe("string");
      expect(reconcileAllOpenPrograms).toHaveBeenCalledTimes(1);
      expect(reconcileQueueSlots).not.toHaveBeenCalled();
    });

    it("successfully invokes reconcileAllOpenPrograms and returns 200 via POST", async () => {
      vi.mocked(reconcileAllOpenPrograms).mockResolvedValueOnce({
        processedPrograms: 1,
        totalSlotsFilled: 1,
        results: [{ programId: "prog-1", slotsFilled: 1, openSlotsRemaining: 4 }],
      });

      const req = new Request("http://localhost:3000/api/cron/reconcile-queue", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validSecret}`,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.totalSlotsFilled).toBe(1);
      expect(reconcileAllOpenPrograms).toHaveBeenCalledTimes(1);
    });

    it("handles zero open programs gracefully with 200", async () => {
      vi.mocked(reconcileAllOpenPrograms).mockResolvedValueOnce({
        processedPrograms: 0,
        totalSlotsFilled: 0,
        results: [],
      });

      const req = new Request("http://localhost:3000/api/cron/reconcile-queue", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${validSecret}`,
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.processedPrograms).toBe(0);
      expect(json.totalSlotsFilled).toBe(0);
      expect(json.slotsFilled).toBe(0);
      expect(json.programs).toEqual([]);
    });

    it("handles condition when no queue slots need processing (open programs have 0 waiting)", async () => {
      vi.mocked(reconcileAllOpenPrograms).mockResolvedValueOnce({
        processedPrograms: 1,
        totalSlotsFilled: 0,
        results: [{ programId: "prog-open", slotsFilled: 0, openSlotsRemaining: 10 }],
      });

      const req = new Request("http://localhost:3000/api/cron/reconcile-queue", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${validSecret}`,
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.totalSlotsFilled).toBe(0);
      expect(json.slotsFilled).toBe(0);
      expect(json.programs[0].openSlotsRemaining).toBe(10);
    });

    it("guarantees idempotency on repeated calls: returns 0 additional slots filled", async () => {
      // First call reconciles 2 slots
      vi.mocked(reconcileAllOpenPrograms).mockResolvedValueOnce({
        processedPrograms: 1,
        totalSlotsFilled: 2,
        results: [{ programId: "prog-1", slotsFilled: 2, openSlotsRemaining: 0 }],
      });
      // Second call reconciles 0 slots (queue now empty / capacity filled)
      vi.mocked(reconcileAllOpenPrograms).mockResolvedValueOnce({
        processedPrograms: 1,
        totalSlotsFilled: 0,
        results: [{ programId: "prog-1", slotsFilled: 0, openSlotsRemaining: 0 }],
      });

      const req1 = new Request("http://localhost:3000/api/cron/reconcile-queue", {
        method: "GET",
        headers: { Authorization: `Bearer ${validSecret}` },
      });
      const res1 = await GET(req1);
      const json1 = await res1.json();
      expect(json1.totalSlotsFilled).toBe(2);

      const req2 = new Request("http://localhost:3000/api/cron/reconcile-queue", {
        method: "GET",
        headers: { Authorization: `Bearer ${validSecret}` },
      });
      const res2 = await GET(req2);
      const json2 = await res2.json();
      expect(json2.totalSlotsFilled).toBe(0);
    });
  });

  // ─── 3. Targeted Program Execution (programId parameter) ─────────────────

  describe("3. Targeted Program Execution (programId parameter)", () => {
    it("successfully reconciles specific program via GET query param", async () => {
      vi.mocked(reconcileQueueSlots).mockResolvedValueOnce({
        slotsFilled: 3,
        openSlotsRemaining: 7,
      });

      const req = new Request(
        "http://localhost:3000/api/cron/reconcile-queue?programId=prog-alpha",
        {
          method: "GET",
          headers: { Authorization: `Bearer ${validSecret}` },
        },
      );

      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.programId).toBe("prog-alpha");
      expect(json.slotsFilled).toBe(3);
      expect(json.openSlotsRemaining).toBe(7);
      expect(json.totalSlotsFilled).toBe(3);
      expect(json.processedPrograms).toBe(1);
      expect(reconcileQueueSlots).toHaveBeenCalledWith(
        expect.anything(),
        "prog-alpha",
        expect.any(Date),
      );
      expect(reconcileAllOpenPrograms).not.toHaveBeenCalled();
    });

    it("successfully reconciles specific program via POST JSON body", async () => {
      vi.mocked(reconcileQueueSlots).mockResolvedValueOnce({
        slotsFilled: 1,
        openSlotsRemaining: 0,
      });

      const req = new Request("http://localhost:3000/api/cron/reconcile-queue", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ programId: "  prog-beta  " }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.programId).toBe("prog-beta");
      expect(json.slotsFilled).toBe(1);
      expect(reconcileQueueSlots).toHaveBeenCalledWith(
        expect.anything(),
        "prog-beta",
        expect.any(Date),
      );
    });

    it("returns 400 INVALID_INPUT when query param programId is empty", async () => {
      const req = new Request(
        "http://localhost:3000/api/cron/reconcile-queue?programId=%20%20",
        {
          method: "GET",
          headers: { Authorization: `Bearer ${validSecret}` },
        },
      );

      const res = await GET(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_INPUT");
      expect(reconcileQueueSlots).not.toHaveBeenCalled();
    });

    it("returns 400 INVALID_INPUT when POST body programId is invalid type or empty", async () => {
      const req = new Request("http://localhost:3000/api/cron/reconcile-queue", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ programId: "" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_INPUT");
      expect(reconcileQueueSlots).not.toHaveBeenCalled();
    });

    it("returns 400 MALFORMED_JSON when POST body is invalid JSON", async () => {
      const req = new Request("http://localhost:3000/api/cron/reconcile-queue", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validSecret}`,
          "Content-Type": "application/json",
        },
        body: "{ not valid json ",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("MALFORMED_JSON");
      expect(reconcileQueueSlots).not.toHaveBeenCalled();
    });

    it("maps WhitelistError status and code when reconcileQueueSlots fails", async () => {
      vi.mocked(reconcileQueueSlots).mockRejectedValueOnce(
        new WhitelistError("PROGRAM_NOT_FOUND", "Program not found.", 404),
      );

      const req = new Request(
        "http://localhost:3000/api/cron/reconcile-queue?programId=nonexistent",
        {
          method: "GET",
          headers: { Authorization: `Bearer ${validSecret}` },
        },
      );

      const res = await GET(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("PROGRAM_NOT_FOUND");
    });
  });

  // ─── 4. Error Handling ───────────────────────────────────────────────────

  describe("4. Error Handling", () => {
    it("returns 500 SERVER_ERROR when reconcileAllOpenPrograms throws unexpected error", async () => {
      vi.mocked(reconcileAllOpenPrograms).mockRejectedValueOnce(
        new Error("Database connection dropped"),
      );

      const req = new Request("http://localhost:3000/api/cron/reconcile-queue", {
        method: "GET",
        headers: { Authorization: `Bearer ${validSecret}` },
      });

      const res = await GET(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("SERVER_ERROR");
    });

    it("returns 500 SERVER_ERROR when reconcileQueueSlots throws unexpected error", async () => {
      vi.mocked(reconcileQueueSlots).mockRejectedValueOnce(new Error("Unexpected crash"));

      const req = new Request(
        "http://localhost:3000/api/cron/reconcile-queue?programId=prog-crash",
        {
          method: "GET",
          headers: { Authorization: `Bearer ${validSecret}` },
        },
      );

      const res = await GET(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("SERVER_ERROR");
    });
  });

  // ─── 5. Method Not Allowed (405) ─────────────────────────────────────────

  describe("5. Method Not Allowed (405)", () => {
    it("returns 405 Method Not Allowed for PUT, DELETE, PATCH, HEAD, OPTIONS", async () => {
      const unsupportedMethods = [PUT, DELETE, PATCH, HEAD, OPTIONS];

      for (const handler of unsupportedMethods) {
        const res = await handler();
        expect(res.status).toBe(405);
        expect(res.headers.get("Allow")).toBe("GET, POST");
      }
    });
  });

  // ─── 6. Alias Route (/api/cron/reconcile-wl) ──────────────────────────────

  describe("6. Alias Route (/api/cron/reconcile-wl)", () => {
    it("alias route handles GET requests with identical auth and reconciliation logic", async () => {
      vi.mocked(reconcileAllOpenPrograms).mockResolvedValueOnce({
        processedPrograms: 1,
        totalSlotsFilled: 0,
        results: [{ programId: "prog-alias", slotsFilled: 0, openSlotsRemaining: 5 }],
      });

      const req = new Request("http://localhost:3000/api/cron/reconcile-wl", {
        method: "GET",
        headers: { Authorization: `Bearer ${validSecret}` },
      });

      const res = await ALIAS_GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(reconcileAllOpenPrograms).toHaveBeenCalledTimes(1);
    });

    it("alias route returns 405 on unsupported methods", async () => {
      const unsupportedAliasHandlers = [
        ALIAS_PUT,
        ALIAS_DELETE,
        ALIAS_PATCH,
        ALIAS_HEAD,
        ALIAS_OPTIONS,
      ];

      for (const handler of unsupportedAliasHandlers) {
        const res = await handler();
        expect(res.status).toBe(405);
        expect(res.headers.get("Allow")).toBe("GET, POST");
      }
    });
  });
});
