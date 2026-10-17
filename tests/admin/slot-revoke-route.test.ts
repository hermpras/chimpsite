import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  POST,
  GET,
  PUT,
  DELETE,
  PATCH,
  HEAD,
  OPTIONS,
} from "@/app/api/admin/whitelist/slots/revoke/route";
import {
  POST as ID_POST,
  GET as ID_GET,
  PUT as ID_PUT,
  DELETE as ID_DELETE,
  PATCH as ID_PATCH,
  HEAD as ID_HEAD,
  OPTIONS as ID_OPTIONS,
} from "@/app/api/admin/whitelist/slots/[id]/revoke/route";
import {
  POST as WL_POST,
  GET as WL_GET,
} from "@/app/api/whitelist/slots/revoke/route";
import {
  POST as ALIAS_POST,
} from "@/app/api/admin/slots/revoke/route";

vi.mock("@/server/db", () => ({ prisma: { __fake: true } }));

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

vi.mock("@/server/whitelist/revoke", () => {
  class MockWlSlotRevokeError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number = 400) {
      super(message);
      this.name = "WlSlotRevokeError";
      this.code = code;
      this.status = status;
    }
  }

  return {
    revokeWlSlot: vi.fn(),
    WlSlotRevokeError: MockWlSlotRevokeError,
  };
});

import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import { revokeWlSlot, WlSlotRevokeError } from "@/server/whitelist/revoke";

describe("Admin Whitelist Slot Revoke API Routes", () => {
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

  describe("Method Not Allowed (405)", () => {
    it("returns 405 on all unsupported HTTP methods with Allow: POST header", async () => {
      const methods = [
        { name: "GET", fn: GET, idFn: ID_GET },
        { name: "PUT", fn: PUT, idFn: ID_PUT },
        { name: "DELETE", fn: DELETE, idFn: ID_DELETE },
        { name: "PATCH", fn: PATCH, idFn: ID_PATCH },
        { name: "HEAD", fn: HEAD, idFn: ID_HEAD },
        { name: "OPTIONS", fn: OPTIONS, idFn: ID_OPTIONS },
      ];

      for (const { fn, idFn } of methods) {
        const res = await fn();
        expect(res.status).toBe(405);
        expect(res.headers.get("Allow")).toBe("POST");

        const idRes = await idFn();
        expect(idRes.status).toBe(405);
        expect(idRes.headers.get("Allow")).toBe("POST");
      }
    });
  });

  describe("Authorization & Permissions", () => {
    it("returns 401 when caller is unauthenticated", async () => {
      vi.mocked(requireAdminSession).mockRejectedValue(
        new AdminAuthError(
          "UNAUTHORIZED",
          "Authentication required to access admin resources.",
          401,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: "slot-1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("UNAUTHORIZED");
    });

    it("returns 403 when authenticated user lacks MANAGE_WL permission", async () => {
      vi.mocked(requireAdminSession).mockRejectedValue(
        new AdminAuthError(
          "FORBIDDEN",
          "Missing required admin permission: MANAGE_WL.",
          403,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: "slot-1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("FORBIDDEN");
    });
  });

  describe("Payload Validation & Size Limits", () => {
    it("returns 400 on malformed JSON payload", async () => {
      vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ bad json",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("MALFORMED_JSON");
    });

    it("returns 413 when body exceeds 8KB limit", async () => {
      vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);

      const largeReason = "x".repeat(9000);
      const req = new Request("http://localhost:3000/api/admin/whitelist/slots/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: "slot-1", reason: largeReason }),
      });

      const res = await POST(req);
      expect(res.status).toBe(413);
      const body = await res.json();
      expect(body.error).toBe("too_large");
    });
  });

  describe("Successful Execution & Error Mapping", () => {
    it("returns 200 on successful slot revocation with reason", async () => {
      vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);
      const now = new Date();
      vi.mocked(revokeWlSlot).mockResolvedValue({
        success: true,
        slotId: "slot-1",
        programId: "prog-1",
        userId: "user-1",
        slotNumber: 1,
        previousStatus: "ALLOCATED",
        status: "REVOKED_MANUAL_ADMIN",
        revokedAt: now,
        reason: "Suspected multi-wallet sybil cluster",
        auditLogId: "audit-1",
      });

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "198.51.100.2",
          "user-agent": "AdminBrowser/1.0",
        },
        body: JSON.stringify({
          slotId: "slot-1",
          reason: "Suspected multi-wallet sybil cluster",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.status).toBe("REVOKED_MANUAL_ADMIN");
      expect(body.slotId).toBe("slot-1");
      expect(body.reason).toBe("Suspected multi-wallet sybil cluster");

      expect(revokeWlSlot).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          slotId: "slot-1",
          reason: "Suspected multi-wallet sybil cluster",
          adminUserId: "admin-user-1",
          ipAddress: "198.51.100.2",
          userAgent: "AdminBrowser/1.0",
        }),
      );
    });

    it("returns 404 when target slot is not found", async () => {
      vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);
      vi.mocked(revokeWlSlot).mockRejectedValue(
        new WlSlotRevokeError("SLOT_NOT_FOUND", "Whitelist slot was not found.", 404),
      );

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: "nonexistent" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("SLOT_NOT_FOUND");
    });

    it("returns 409 when slot is already revoked", async () => {
      vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);
      vi.mocked(revokeWlSlot).mockRejectedValue(
        new WlSlotRevokeError("SLOT_ALREADY_REVOKED", "Whitelist slot is already revoked.", 409),
      );

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: "slot-already-revoked" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe("SLOT_ALREADY_REVOKED");
    });
  });

  describe("Parameterized Route: POST /api/admin/whitelist/slots/[id]/revoke", () => {
    it("extracts slotId from route params and executes revocation", async () => {
      vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);
      vi.mocked(revokeWlSlot).mockResolvedValue({
        success: true,
        slotId: "slot-param-123",
        programId: "prog-1",
        userId: "user-1",
        slotNumber: 5,
        previousStatus: "ALLOCATED",
        status: "REVOKED_MANUAL_ADMIN",
        revokedAt: new Date(),
        reason: "Param route revocation",
        auditLogId: "audit-param-1",
      });

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots/slot-param-123/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Param route revocation" }),
      });

      const res = await ID_POST(req, { params: Promise.resolve({ id: "slot-param-123" }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.slotId).toBe("slot-param-123");

      expect(revokeWlSlot).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          slotId: "slot-param-123",
          reason: "Param route revocation",
          adminUserId: "admin-user-1",
        }),
      );
    });
  });

  describe("Alias Routes", () => {
    it("re-exports identical handler in /api/whitelist/slots/revoke", async () => {
      vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);
      vi.mocked(revokeWlSlot).mockResolvedValue({
        success: true,
        slotId: "slot-alias-1",
        programId: "prog-1",
        userId: "user-1",
        slotNumber: 1,
        previousStatus: "ALLOCATED",
        status: "REVOKED_MANUAL_ADMIN",
        revokedAt: new Date(),
        reason: "Alias test",
        auditLogId: "audit-alias-1",
      });

      const req = new Request("http://localhost:3000/api/whitelist/slots/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: "slot-alias-1", reason: "Alias test" }),
      });

      const res = await WL_POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.slotId).toBe("slot-alias-1");
    });

    it("re-exports identical handler in /api/admin/slots/revoke", async () => {
      vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);
      vi.mocked(revokeWlSlot).mockResolvedValue({
        success: true,
        slotId: "slot-alias-2",
        programId: "prog-1",
        userId: "user-1",
        slotNumber: 2,
        previousStatus: "ALLOCATED",
        status: "REVOKED_MANUAL_ADMIN",
        revokedAt: new Date(),
        reason: "Admin alias test",
        auditLogId: "audit-alias-2",
      });

      const req = new Request("http://localhost:3000/api/admin/slots/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: "slot-alias-2", reason: "Admin alias test" }),
      });

      const res = await ALIAS_POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.slotId).toBe("slot-alias-2");
    });
  });
});
