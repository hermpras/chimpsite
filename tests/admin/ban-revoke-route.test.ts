import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  POST,
  GET,
  PUT,
  DELETE,
  PATCH,
  HEAD,
  OPTIONS,
} from "@/app/api/admin/ban/revoke/route";
import {
  POST as ID_POST,
  GET as ID_GET,
  PUT as ID_PUT,
  DELETE as ID_DELETE,
  PATCH as ID_PATCH,
  HEAD as ID_HEAD,
  OPTIONS as ID_OPTIONS,
} from "@/app/api/admin/bans/[id]/revoke/route";

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

vi.mock("@/server/admin/ban", () => {
  class MockAdminBanError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number = 400) {
      super(message);
      this.name = "AdminBanError";
      this.code = code;
      this.status = status;
    }
  }

  return {
    revokeBan: vi.fn(),
    AdminBanError: MockAdminBanError,
  };
});

import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import { revokeBan, AdminBanError } from "@/server/admin/ban";

describe("Admin Ban Revoke Route Suite", () => {
  const validAdminSession = {
    sessionId: "sess_admin_1",
    userId: "admin_user_1",
    address: "0xadmin1",
    adminRole: {
      id: "role_1",
      userId: "admin_user_1",
      roleType: "ADMIN",
      permissions: ["MANAGE_BANS"],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Method enforcement
  // ---------------------------------------------------------------------------

  describe("HTTP Method Enforcement (405 Method Not Allowed)", () => {
    it("returns 405 on all unsupported HTTP methods with Allow: POST header", async () => {
      const endpoints = [
        { name: "ban/revoke/route", fns: [GET, PUT, DELETE, PATCH, HEAD, OPTIONS] },
        {
          name: "bans/[id]/revoke/route",
          fns: [ID_GET, ID_PUT, ID_DELETE, ID_PATCH, ID_HEAD, ID_OPTIONS],
        },
      ];

      for (const ep of endpoints) {
        for (const fn of ep.fns) {
          const res = await fn();
          expect(res.status, `${ep.name} should return 405`).toBe(405);
          expect(res.headers.get("Allow")).toBe("POST");
          const body = await res.json();
          expect(body.error).toContain("Method not allowed");
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Authentication & Authorization
  // ---------------------------------------------------------------------------

  describe("Authentication & Authorization Enforcement", () => {
    it("returns 401 when request is unauthenticated", async () => {
      vi.mocked(requireAdminSession).mockRejectedValue(
        new AdminAuthError(
          "UNAUTHORIZED",
          "Authentication required to access admin resources.",
          401,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/ban/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banId: "ban-1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("UNAUTHORIZED");
      expect(requireAdminSession).toHaveBeenCalledWith(expect.anything(), "MANAGE_BANS");
      expect(revokeBan).not.toHaveBeenCalled();
    });

    it("returns 403 when authenticated user lacks MANAGE_BANS permission", async () => {
      vi.mocked(requireAdminSession).mockRejectedValue(
        new AdminAuthError(
          "FORBIDDEN",
          "Missing required admin permission: MANAGE_BANS.",
          403,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/ban/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banId: "ban-1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("FORBIDDEN");
      expect(revokeBan).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Request Parsing & Input Validation
  // ---------------------------------------------------------------------------

  describe("Request Parsing & Input Validation", () => {
    beforeEach(() => {
      vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);
    });

    it("returns 413 when request body exceeds size limit", async () => {
      const hugeString = "a".repeat(10 * 1024); // 10KB
      const req = new Request("http://localhost:3000/api/admin/ban/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banId: "ban-1", reason: hugeString }),
      });

      const res = await POST(req);
      expect(res.status).toBe(413);
      const body = await res.json();
      expect(body.error).toBe("too_large");
      expect(revokeBan).not.toHaveBeenCalled();
    });

    it("returns 400 when body is malformed JSON", async () => {
      const req = new Request("http://localhost:3000/api/admin/ban/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ malformed json",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("MALFORMED_JSON");
      expect(revokeBan).not.toHaveBeenCalled();
    });

    it("returns 400 when body is not a JSON object", async () => {
      const req = new Request("http://localhost:3000/api/admin/ban/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(["not", "an", "object"]),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("INVALID_INPUT");
      expect(revokeBan).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Error Mapping
  // ---------------------------------------------------------------------------

  describe("Error Mapping", () => {
    beforeEach(() => {
      vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);
    });

    it("maps AdminBanError BAN_NOT_FOUND (404) cleanly without internal leak", async () => {
      vi.mocked(revokeBan).mockRejectedValue(
        new AdminBanError("BAN_NOT_FOUND", "Ban record not found.", 404),
      );

      const req = new Request("http://localhost:3000/api/admin/ban/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banId: "ghost-ban" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("BAN_NOT_FOUND");
      expect(body.message).toBe("Ban record not found.");
    });

    it("maps AdminBanError BAN_ALREADY_INACTIVE (409) cleanly", async () => {
      vi.mocked(revokeBan).mockRejectedValue(
        new AdminBanError("BAN_ALREADY_INACTIVE", "This ban is already inactive.", 409),
      );

      const req = new Request("http://localhost:3000/api/admin/ban/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banId: "ban-already-revoked" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe("BAN_ALREADY_INACTIVE");
    });

    it("maps AdminBanError UNAUTHORIZED (401) cleanly", async () => {
      vi.mocked(revokeBan).mockRejectedValue(
        new AdminBanError("UNAUTHORIZED", "Admin authentication is required.", 401),
      );

      const req = new Request("http://localhost:3000/api/admin/ban/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banId: "ban-1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("UNAUTHORIZED");
    });

    it("maps AdminBanError INSUFFICIENT_PRIVILEGE (403) cleanly when non-SUPER_ADMIN attempts to revoke permanent ban (DEC-012)", async () => {
      vi.mocked(revokeBan).mockRejectedValue(
        new AdminBanError(
          "INSUFFICIENT_PRIVILEGE",
          "Only super administrators can revoke permanent bans.",
          403,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/ban/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banId: "ban-perm-1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("INSUFFICIENT_PRIVILEGE");
      expect(body.message).toBe("Only super administrators can revoke permanent bans.");
    });

    it("maps unexpected server error to 500 SERVER_ERROR without exposing internal traces", async () => {
      vi.mocked(revokeBan).mockRejectedValue(
        new Error("FATAL database corruption: details..."),
      );

      const req = new Request("http://localhost:3000/api/admin/ban/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banId: "ban-1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("SERVER_ERROR");
      expect(body.message).not.toContain("FATAL database corruption");
    });
  });

  // ---------------------------------------------------------------------------
  // Successful Execution
  // ---------------------------------------------------------------------------

  describe("Successful Execution", () => {
    beforeEach(() => {
      vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);
      vi.mocked(revokeBan).mockResolvedValue({
        success: true,
        banId: "ban-123",
        userId: "user-target-1",
        isActive: false,
        revokedAt: new Date("2026-10-17T12:00:00Z"),
        auditLogId: "audit-123",
      });
    });

    it("returns 200 with revoke result and forwards adminUserId from session", async () => {
      const req = new Request("http://localhost:3000/api/admin/ban/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "198.51.100.1, 10.0.0.1",
          "user-agent": "ChimpModerator/1.0",
        },
        body: JSON.stringify({
          banId: "ban-123",
          reason: "Appeal accepted — identity verified.",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.banId).toBe("ban-123");
      expect(body.isActive).toBe(false);

      expect(revokeBan).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          banId: "ban-123",
          adminUserId: "admin_user_1", // from session, never client input
          reason: "Appeal accepted — identity verified.",
          ipAddress: "198.51.100.1",
          userAgent: "ChimpModerator/1.0",
        }),
      );
    });

    it("returns 200 with no reason when reason is omitted", async () => {
      const req = new Request("http://localhost:3000/api/admin/ban/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banId: "ban-123" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(revokeBan).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ banId: "ban-123", reason: undefined }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Parameterized Route: POST /api/admin/bans/[id]/revoke
  // ---------------------------------------------------------------------------

  describe("Parameterized Route: POST /api/admin/bans/[id]/revoke", () => {
    beforeEach(() => {
      vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);
      vi.mocked(revokeBan).mockResolvedValue({
        success: true,
        banId: "ban-param-99",
        userId: "user-target-1",
        isActive: false,
        revokedAt: new Date("2026-10-17T12:00:00Z"),
        auditLogId: "audit-param-1",
      });
    });

    it("extracts banId from route params and executes revocation", async () => {
      const req = new Request(
        "http://localhost:3000/api/admin/bans/ban-param-99/revoke",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Revoked via parameterized route" }),
        },
      );

      const res = await ID_POST(req, {
        params: Promise.resolve({ id: "ban-param-99" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.banId).toBe("ban-param-99");

      expect(revokeBan).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          banId: "ban-param-99",
          reason: "Revoked via parameterized route",
          adminUserId: "admin_user_1",
        }),
      );
    });

    it("returns 404 when ban record is not found via parameterized route", async () => {
      vi.mocked(revokeBan).mockRejectedValue(
        new AdminBanError("BAN_NOT_FOUND", "Ban record not found.", 404),
      );

      const req = new Request("http://localhost:3000/api/admin/bans/ghost-ban/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await ID_POST(req, {
        params: Promise.resolve({ id: "ghost-ban" }),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("BAN_NOT_FOUND");
    });

    it("returns 403 INSUFFICIENT_PRIVILEGE when non-SUPER_ADMIN attempts to revoke permanent ban via parameterized route (DEC-012)", async () => {
      vi.mocked(revokeBan).mockRejectedValue(
        new AdminBanError(
          "INSUFFICIENT_PRIVILEGE",
          "Only super administrators can revoke permanent bans.",
          403,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/bans/ban-perm-1/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await ID_POST(req, {
        params: Promise.resolve({ id: "ban-perm-1" }),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("INSUFFICIENT_PRIVILEGE");
      expect(body.message).toBe("Only super administrators can revoke permanent bans.");
    });
  });
});
