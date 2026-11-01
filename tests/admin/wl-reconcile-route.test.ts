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

import { requireAdminSession, AdminAuthError } from "@/server/auth/session";

describe("Admin WL Queue Reconcile API Route (POST /api/admin/wl/reconcile) — DEC-018", () => {
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

  describe("1. HTTP Method Not Allowed (405)", () => {
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

  describe("2. Authentication & Authorization Enforcement", () => {
    it("calls requireAdminSession with prisma and MANAGE_WL permission", async () => {
      vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);

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
    });
  });

  describe("3. DEC-018 Decommissioned Behavior", () => {
    beforeEach(() => {
      vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);
    });

    it("returns 200 with deprecated: true and 0 slots filled per DEC-018", async () => {
      const req = new Request("http://localhost:3000/api/admin/wl/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "prog-1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.deprecated).toBe(true);
      expect(body.slotsFilled).toBe(0);
      expect(body.openSlotsRemaining).toBe(0);
      expect(body.message).toContain("decommissioned per DEC-018");
    });

    it("alias route /api/admin/whitelist/reconcile returns identical decommissioned response", async () => {
      const req = new Request("http://localhost:3000/api/admin/whitelist/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "prog-2" }),
      });

      const res = await ALIAS_POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.deprecated).toBe(true);
      expect(body.slotsFilled).toBe(0);
      expect(body.openSlotsRemaining).toBe(0);
      expect(body.message).toContain("decommissioned per DEC-018");
    });
  });

  describe("4. Client Helper adminReconcileQueue", () => {
    it("receives decommissioned response successfully", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            deprecated: true,
            message: "Decommissioned per DEC-018.",
            slotsFilled: 0,
            openSlotsRemaining: 0,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const result = await adminReconcileQueue({ programId: "prog-1" });
      expect(result.success).toBe(true);
      expect(result.slotsFilled).toBe(0);

      fetchSpy.mockRestore();
    });

    it("throws error with API response message on non-200", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "UNAUTHORIZED",
            message: "Admin authorization failed.",
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      );

      await expect(adminReconcileQueue({ programId: "prog-1" })).rejects.toThrow(
        "Admin authorization failed.",
      );

      fetchSpy.mockRestore();
    });
  });
});
