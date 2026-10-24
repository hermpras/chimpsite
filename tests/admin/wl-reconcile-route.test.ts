import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  POST,
  GET,
  PUT,
  DELETE,
  PATCH,
  HEAD,
  OPTIONS,
} from "@/app/api/admin/wl/reconcile/route";
import {
  POST as ALIAS_POST,
  GET as ALIAS_GET,
  PUT as ALIAS_PUT,
  DELETE as ALIAS_DELETE,
  PATCH as ALIAS_PATCH,
  HEAD as ALIAS_HEAD,
  OPTIONS as ALIAS_OPTIONS,
} from "@/app/api/admin/whitelist/reconcile/route";
import { adminReconcileQueue } from "@/lib/admin/client";

vi.mock("@/server/db", () => ({ prisma: { __fakePrisma: true } }));

vi.mock("@/server/auth/session", () => {
  class MockAdminAuthError extends Error {
    code: "UNAUTHORIZED" | "FORBIDDEN";
    status: 401 | 403;
    constructor(code: "UNAUTHORIZED" | "FORBIDDEN", message: string, status: 401 | 403) {
      super(message);
      this.name = "AdminAuthError";
      this.code = code;
      this.status = status;
    }
    toResponse(): Response {
      return Response.json(
        { error: this.code, message: this.message },
        { status: this.status },
      );
    }
  }

  return {
    requireAdminSession: vi.fn(),
    AdminAuthError: MockAdminAuthError,
  };
});

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
    WhitelistError: MockWhitelistError,
  };
});

import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import { reconcileQueueSlots, WhitelistError } from "@/server/whitelist/qualification";

describe("Admin WL Queue Reconcile API Route (POST /api/admin/wl/reconcile)", () => {
  const validAdminSession = {
    sessionId: "sess-admin-1",
    userId: "admin-user-1",
    address: "0xadmin1",
    adminRole: {
      id: "role-1",
      userId: "admin-user-1",
      roleType: "ADMIN",
      permissions: ["MANAGE_WL"],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("HTTP Method Not Allowed (405)", () => {
    it("returns 405 on all non-POST methods with Allow: POST header", async () => {
      const methods = [
        { name: "GET", fn: GET, aliasFn: ALIAS_GET },
        { name: "PUT", fn: PUT, aliasFn: ALIAS_PUT },
        { name: "DELETE", fn: DELETE, aliasFn: ALIAS_DELETE },
        { name: "PATCH", fn: PATCH, aliasFn: ALIAS_PATCH },
        { name: "HEAD", fn: HEAD, aliasFn: ALIAS_HEAD },
        { name: "OPTIONS", fn: OPTIONS, aliasFn: ALIAS_OPTIONS },
      ];

      for (const { fn, aliasFn } of methods) {
        const res = await fn();
        expect(res.status).toBe(405);
        expect(res.headers.get("Allow")).toBe("POST");

        const aliasRes = await aliasFn();
        expect(aliasRes.status).toBe(405);
        expect(aliasRes.headers.get("Allow")).toBe("POST");
      }
    });
  });

  describe("Authentication & Authorization Enforcement", () => {
    it("calls requireAdminSession with prisma and MANAGE_WL permission", async () => {
      vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);
      vi.mocked(reconcileQueueSlots).mockResolvedValue({
        slotsFilled: 2,
        openSlotsRemaining: 3,
      });

      const req = new Request("http://localhost:3000/api/admin/wl/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "prog-1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(requireAdminSession).toHaveBeenCalledWith(
        expect.objectContaining({ __fakePrisma: true }),
        "MANAGE_WL",
      );
    });

    it("returns 401 when caller is unauthenticated", async () => {
      vi.mocked(requireAdminSession).mockRejectedValue(
        new AdminAuthError(
          "UNAUTHORIZED",
          "Authentication required to access admin resources.",
          401,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/wl/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "prog-1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("UNAUTHORIZED");
      expect(body.message).toBe("Authentication required to access admin resources.");
      expect(reconcileQueueSlots).not.toHaveBeenCalled();
    });

    it("returns 403 when authenticated user lacks MANAGE_WL permission", async () => {
      vi.mocked(requireAdminSession).mockRejectedValue(
        new AdminAuthError(
          "FORBIDDEN",
          "Missing required admin permission: MANAGE_WL.",
          403,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/wl/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "prog-1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("FORBIDDEN");
      expect(body.message).toBe("Missing required admin permission: MANAGE_WL.");
      expect(reconcileQueueSlots).not.toHaveBeenCalled();
    });

    it("returns 401 if requireAdminSession throws an unexpected non-AdminAuthError", async () => {
      vi.mocked(requireAdminSession).mockRejectedValue(new Error("Unexpected DB crash"));

      const req = new Request("http://localhost:3000/api/admin/wl/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "prog-1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("UNAUTHORIZED");
      expect(body.message).toBe("Admin authorization failed.");
      expect(reconcileQueueSlots).not.toHaveBeenCalled();
    });
  });

  describe("Request Payload & Input Validation", () => {
    beforeEach(() => {
      vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);
    });

    it("returns 413 when body exceeds 8KB limit", async () => {
      const hugePayload = JSON.stringify({
        programId: "prog-1",
        padding: "x".repeat(9000),
      });

      const req = new Request("http://localhost:3000/api/admin/wl/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: hugePayload,
      });

      const res = await POST(req);
      expect(res.status).toBe(413);
      const body = await res.json();
      expect(body.error).toBe("too_large");
      expect(reconcileQueueSlots).not.toHaveBeenCalled();
    });

    it("returns 400 on malformed JSON payload", async () => {
      const req = new Request("http://localhost:3000/api/admin/wl/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ bad json",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("MALFORMED_JSON");
      expect(reconcileQueueSlots).not.toHaveBeenCalled();
    });

    it("returns 400 when body is not a JSON object", async () => {
      const req = new Request("http://localhost:3000/api/admin/wl/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(["not", "an", "object"]),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("INVALID_INPUT");
      expect(reconcileQueueSlots).not.toHaveBeenCalled();
    });

    it("returns 400 when programId is missing", async () => {
      const req = new Request("http://localhost:3000/api/admin/wl/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("INVALID_INPUT");
      expect(body.message).toContain("programId is required");
      expect(reconcileQueueSlots).not.toHaveBeenCalled();
    });

    it("returns 400 when programId is not a string", async () => {
      const invalidTypes = [123, true, null, {}, ["prog-1"]];

      for (const val of invalidTypes) {
        const req = new Request("http://localhost:3000/api/admin/wl/reconcile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ programId: val }),
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe("INVALID_INPUT");
        expect(reconcileQueueSlots).not.toHaveBeenCalled();
      }
    });

    it("returns 400 when programId is empty or whitespace only", async () => {
      const emptyStrings = ["", "   ", "\t\n"];

      for (const val of emptyStrings) {
        const req = new Request("http://localhost:3000/api/admin/wl/reconcile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ programId: val }),
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe("INVALID_INPUT");
        expect(reconcileQueueSlots).not.toHaveBeenCalled();
      }
    });
  });

  describe("Reconciliation Results & Error Handling", () => {
    beforeEach(() => {
      vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);
    });

    it("successfully reconciles open slots and returns 200 with result payload", async () => {
      vi.mocked(reconcileQueueSlots).mockResolvedValue({
        slotsFilled: 5,
        openSlotsRemaining: 0,
      });

      const req = new Request("http://localhost:3000/api/admin/wl/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "program-100" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.programId).toBe("program-100");
      expect(body.slotsFilled).toBe(5);
      expect(body.openSlotsRemaining).toBe(0);

      expect(reconcileQueueSlots).toHaveBeenCalledWith(
        expect.objectContaining({ __fakePrisma: true }),
        "program-100",
      );
    });

    it("returns 200 with 0 slotsFilled when queue is empty or no slots need filling", async () => {
      vi.mocked(reconcileQueueSlots).mockResolvedValue({
        slotsFilled: 0,
        openSlotsRemaining: 10,
      });

      const req = new Request("http://localhost:3000/api/admin/wl/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "program-empty-queue" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.slotsFilled).toBe(0);
      expect(body.openSlotsRemaining).toBe(10);
    });

    it("trims whitespace from programId before calling reconcileQueueSlots", async () => {
      vi.mocked(reconcileQueueSlots).mockResolvedValue({
        slotsFilled: 1,
        openSlotsRemaining: 0,
      });

      const req = new Request("http://localhost:3000/api/admin/wl/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "   prog-trimmed   " }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.programId).toBe("prog-trimmed");
      expect(reconcileQueueSlots).toHaveBeenCalledWith(expect.anything(), "prog-trimmed");
    });

    it("maps 404 PROGRAM_NOT_FOUND from WhitelistError", async () => {
      vi.mocked(reconcileQueueSlots).mockRejectedValue(
        new WhitelistError("PROGRAM_NOT_FOUND", "Program not found.", 404),
      );

      const req = new Request("http://localhost:3000/api/admin/wl/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "missing-program" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("PROGRAM_NOT_FOUND");
      expect(body.message).toBe("Program not found.");
    });

    it("maps 400 PROGRAM_NOT_ACTIVE from WhitelistError", async () => {
      vi.mocked(reconcileQueueSlots).mockRejectedValue(
        new WhitelistError(
          "PROGRAM_NOT_ACTIVE",
          "Whitelist program is not open (current status: CLOSED).",
          400,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/wl/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "closed-program" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("PROGRAM_NOT_ACTIVE");
      expect(body.message).toContain("Whitelist program is not open");
    });

    it("maps 409 CONCURRENCY_COLLISION_RETRYABLE from WhitelistError", async () => {
      vi.mocked(reconcileQueueSlots).mockRejectedValue(
        new WhitelistError(
          "CONCURRENCY_COLLISION_RETRYABLE",
          "A concurrency collision occurred during queue reconciliation. Please retry.",
          409,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/wl/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "busy-program" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe("CONCURRENCY_COLLISION_RETRYABLE");
      expect(body.message).toContain("concurrency collision");
    });

    it("returns 500 SERVER_ERROR on unexpected errors during reconciliation", async () => {
      vi.mocked(reconcileQueueSlots).mockRejectedValue(
        new Error("Database connection dropped"),
      );

      const req = new Request("http://localhost:3000/api/admin/wl/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "prog-db-crash" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("SERVER_ERROR");
      expect(body.message).toContain("unexpected error occurred");
    });
  });

  describe("Alias Route (POST /api/admin/whitelist/reconcile)", () => {
    it("successfully forwards to identical handler", async () => {
      vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);
      vi.mocked(reconcileQueueSlots).mockResolvedValue({
        slotsFilled: 3,
        openSlotsRemaining: 1,
      });

      const req = new Request("http://localhost:3000/api/admin/whitelist/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "prog-alias-1" }),
      });

      const res = await ALIAS_POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.slotsFilled).toBe(3);
      expect(body.openSlotsRemaining).toBe(1);
    });
  });

  describe("Client Helper (adminReconcileQueue)", () => {
    it("calls POST /api/admin/wl/reconcile and returns parsed JSON on 200", async () => {
      const originalFetch = global.fetch;
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          programId: "prog-client",
          slotsFilled: 2,
          openSlotsRemaining: 0,
        }),
      });
      global.fetch = mockFetch as any;

      try {
        const result = await adminReconcileQueue({ programId: "prog-client" });
        expect(result.success).toBe(true);
        expect(result.slotsFilled).toBe(2);
        expect(mockFetch).toHaveBeenCalledWith("/api/admin/wl/reconcile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ programId: "prog-client" }),
        });
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("throws error with API response message on non-200", async () => {
      const originalFetch = global.fetch;
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: "FORBIDDEN",
          message: "Missing required admin permission: MANAGE_WL.",
        }),
      });
      global.fetch = mockFetch as any;

      try {
        await expect(
          adminReconcileQueue({ programId: "prog-forbidden" }),
        ).rejects.toThrow("Missing required admin permission: MANAGE_WL.");
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
