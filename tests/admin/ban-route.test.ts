import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, GET, PUT, DELETE, PATCH, HEAD, OPTIONS } from "@/app/api/admin/ban/route";
import {
  POST as USERS_BAN_POST,
  GET as USERS_BAN_GET,
  PUT as USERS_BAN_PUT,
  DELETE as USERS_BAN_DELETE,
  PATCH as USERS_BAN_PATCH,
  HEAD as USERS_BAN_HEAD,
  OPTIONS as USERS_BAN_OPTIONS,
} from "@/app/api/admin/users/ban/route";
import {
  POST as USER_ID_BAN_POST,
  GET as USER_ID_BAN_GET,
  PUT as USER_ID_BAN_PUT,
  DELETE as USER_ID_BAN_DELETE,
  PATCH as USER_ID_BAN_PATCH,
  HEAD as USER_ID_BAN_HEAD,
  OPTIONS as USER_ID_BAN_OPTIONS,
} from "@/app/api/admin/users/[id]/ban/route";

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
    banUser: vi.fn(),
    AdminBanError: MockAdminBanError,
  };
});

import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import { banUser, AdminBanError } from "@/server/admin/ban";

describe("Admin Ban Route Suite", () => {
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

  describe("HTTP Method Enforcement (405 Method Not Allowed)", () => {
    it("returns 405 on all unsupported HTTP methods with Allow: POST header", async () => {
      const endpoints = [
        {
          name: "ban/route",
          get: GET,
          put: PUT,
          del: DELETE,
          patch: PATCH,
          head: HEAD,
          opt: OPTIONS,
        },
        {
          name: "users/ban/route",
          get: USERS_BAN_GET,
          put: USERS_BAN_PUT,
          del: USERS_BAN_DELETE,
          patch: USERS_BAN_PATCH,
          head: USERS_BAN_HEAD,
          opt: USERS_BAN_OPTIONS,
        },
        {
          name: "users/[id]/ban/route",
          get: USER_ID_BAN_GET,
          put: USER_ID_BAN_PUT,
          del: USER_ID_BAN_DELETE,
          patch: USER_ID_BAN_PATCH,
          head: USER_ID_BAN_HEAD,
          opt: USER_ID_BAN_OPTIONS,
        },
      ];

      for (const ep of endpoints) {
        for (const fn of [ep.get, ep.put, ep.del, ep.patch, ep.head, ep.opt]) {
          const res = await fn();
          expect(res.status).toBe(405);
          expect(res.headers.get("Allow")).toBe("POST");
          const body = await res.json();
          expect(body.error).toContain("Method not allowed");
        }
      }
    });
  });

  describe("Authentication & Authorization Enforcement", () => {
    it("returns 401 when request is unauthenticated", async () => {
      vi.mocked(requireAdminSession).mockRejectedValue(
        new AdminAuthError(
          "UNAUTHORIZED",
          "Authentication required to access admin resources.",
          401,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/ban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "user-1", reason: "Test ban" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("UNAUTHORIZED");
      expect(requireAdminSession).toHaveBeenCalledWith(expect.anything(), "MANAGE_BANS");
      expect(banUser).not.toHaveBeenCalled();
    });

    it("returns 403 when authenticated user lacks MANAGE_BANS permission", async () => {
      vi.mocked(requireAdminSession).mockRejectedValue(
        new AdminAuthError(
          "FORBIDDEN",
          "Missing required admin permission: MANAGE_BANS.",
          403,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/ban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "user-1", reason: "Test ban" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("FORBIDDEN");
      expect(banUser).not.toHaveBeenCalled();
    });
  });

  describe("Request Parsing & Input Validation", () => {
    beforeEach(() => {
      vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);
    });

    it("returns 413 when request body exceeds size limit", async () => {
      const hugeString = "a".repeat(10 * 1024); // 10KB
      const req = new Request("http://localhost:3000/api/admin/ban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "user-1", reason: hugeString }),
      });

      const res = await POST(req);
      expect(res.status).toBe(413);
      const body = await res.json();
      expect(body.error).toBe("too_large");
      expect(banUser).not.toHaveBeenCalled();
    });

    it("returns 400 when body is malformed JSON", async () => {
      const req = new Request("http://localhost:3000/api/admin/ban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ malformed json",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("MALFORMED_JSON");
      expect(banUser).not.toHaveBeenCalled();
    });

    it("returns 400 when body is not a JSON object", async () => {
      const req = new Request("http://localhost:3000/api/admin/ban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(["not", "an", "object"]),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("INVALID_INPUT");
      expect(banUser).not.toHaveBeenCalled();
    });

    it("maps AdminBanError (e.g. 404 USER_NOT_FOUND) cleanly without internal leak", async () => {
      vi.mocked(banUser).mockRejectedValue(
        new AdminBanError("USER_NOT_FOUND", "Target user does not exist.", 404),
      );

      const req = new Request("http://localhost:3000/api/admin/ban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "ghost-user", reason: "Test ban" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("USER_NOT_FOUND");
      expect(body.message).toBe("Target user does not exist.");
    });

    it("maps AdminBanError (e.g. 400 CANNOT_BAN_SELF) cleanly", async () => {
      vi.mocked(banUser).mockRejectedValue(
        new AdminBanError(
          "CANNOT_BAN_SELF",
          "Administrators cannot ban their own account.",
          400,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/ban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "admin_user_1", reason: "Accidental self ban" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("CANNOT_BAN_SELF");
    });

    it("maps AdminBanError (e.g. 403 CANNOT_BAN_SUPER_ADMIN) cleanly", async () => {
      vi.mocked(banUser).mockRejectedValue(
        new AdminBanError(
          "CANNOT_BAN_SUPER_ADMIN",
          "Super administrators cannot be banned.",
          403,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/ban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "super_admin_user", reason: "Dispute" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("CANNOT_BAN_SUPER_ADMIN");
    });

    it("maps unexpected server error to 500 SERVER_ERROR without exposing internal traces", async () => {
      vi.mocked(banUser).mockRejectedValue(
        new Error("FATAL database corruption: details..."),
      );

      const req = new Request("http://localhost:3000/api/admin/ban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "user-1", reason: "Test ban" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("SERVER_ERROR");
      expect(body.message).not.toContain("FATAL database corruption");
    });
  });

  describe("Successful Execution & Alias Routes", () => {
    beforeEach(() => {
      vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);
      vi.mocked(banUser).mockResolvedValue({
        success: true,
        userId: "user-target-1",
        isBanned: true,
        alreadyBanned: false,
        banRecord: {
          id: "ban-123",
          userId: "user-target-1",
          banType: "PERMANENT",
          scope: "FULL_SYSTEM",
          reason: "Sybil wallet cluster",
          evidence: null,
          issuedById: "admin_user_1",
          issuedAt: new Date("2026-10-17T12:00:00Z"),
          expiresAt: null,
          isActive: true,
        },
        auditLogId: "audit-123",
      });
    });

    it("executes valid ban via /api/admin/ban and forwards adminUserId from session", async () => {
      const req = new Request("http://localhost:3000/api/admin/ban", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "198.51.100.1, 10.0.0.1",
          "user-agent": "ChimpModerator/1.0",
        },
        body: JSON.stringify({
          userId: "user-target-1",
          reason: "Sybil wallet cluster",
          scope: "FULL_SYSTEM",
          banType: "PERMANENT",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.banRecord.id).toBe("ban-123");

      expect(banUser).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: "user-target-1",
          adminUserId: "admin_user_1", // from session, never client input
          reason: "Sybil wallet cluster",
          scope: "FULL_SYSTEM",
          banType: "PERMANENT",
          ipAddress: "198.51.100.1",
          userAgent: "ChimpModerator/1.0",
        }),
      );
    });

    it("handles alias route /api/admin/users/ban identically", async () => {
      const req = new Request("http://localhost:3000/api/admin/users/ban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "user-target-1",
          reason: "Sybil wallet cluster",
        }),
      });

      const res = await USERS_BAN_POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(banUser).toHaveBeenCalled();
    });

    it("handles parameterized route /api/admin/users/[id]/ban extracting target userId from route params", async () => {
      const req = new Request("http://localhost:3000/api/admin/users/user-param-99/ban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "Banned via parameterized route",
        }),
      });

      const res = await USER_ID_BAN_POST(req, {
        params: Promise.resolve({ id: "user-param-99" }),
      });
      expect(res.status).toBe(200);
      expect(banUser).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: "user-param-99",
          reason: "Banned via parameterized route",
        }),
      );
    });

    it("handles repeated ban request idempotently returning alreadyBanned: true", async () => {
      vi.mocked(banUser).mockResolvedValue({
        success: true,
        userId: "user-target-1",
        isBanned: true,
        alreadyBanned: true,
        banRecord: {
          id: "ban-123",
          userId: "user-target-1",
          banType: "PERMANENT",
          scope: "FULL_SYSTEM",
          reason: "Sybil wallet cluster",
          evidence: null,
          issuedById: "admin_user_1",
          issuedAt: new Date("2026-10-17T12:00:00Z"),
          expiresAt: null,
          isActive: true,
        },
        auditLogId: null,
      });

      const req = new Request("http://localhost:3000/api/admin/ban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "user-target-1",
          reason: "Sybil wallet cluster",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.alreadyBanned).toBe(true);
    });
  });
});
