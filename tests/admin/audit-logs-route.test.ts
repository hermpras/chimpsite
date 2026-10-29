import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  GET,
  POST,
  PUT,
  DELETE,
  PATCH,
  HEAD,
  OPTIONS,
} from "@/app/api/admin/audit-logs/route";

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

vi.mock("@/server/admin/audit-logs", () => {
  class MockAdminAuditLogError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number = 400) {
      super(message);
      this.name = "AdminAuditLogError";
      this.code = code;
      this.status = status;
    }
  }

  return {
    listAuditLogs: vi.fn(),
    AdminAuditLogError: MockAdminAuditLogError,
  };
});

import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import { listAuditLogs, AdminAuditLogError } from "@/server/admin/audit-logs";

describe("Admin Audit Logs API Route (GET /api/admin/audit-logs)", () => {
  const superAdminSession = {
    sessionId: "sess_super_1",
    userId: "super_admin_user_1",
    address: "0xsuperadmin1",
    adminRole: {
      id: "role_super_1",
      userId: "super_admin_user_1",
      roleType: "SUPER_ADMIN",
      permissions: ["*"],
    },
  };

  const adminSession = {
    sessionId: "sess_admin_1",
    userId: "admin_user_1",
    address: "0xadmin1",
    adminRole: {
      id: "role_admin_1",
      userId: "admin_user_1",
      roleType: "ADMIN",
      permissions: ["MANAGE_WL", "MANAGE_DROPS"],
    },
  };

  const moderatorSession = {
    sessionId: "sess_mod_1",
    userId: "mod_user_1",
    address: "0xmod1",
    adminRole: {
      id: "role_mod_1",
      userId: "mod_user_1",
      roleType: "MODERATOR",
      permissions: ["REVIEW_EVIDENCE"],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Access Control & Authorization", () => {
    it("returns 401 UNAUTHORIZED when session is missing or unauthenticated", async () => {
      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AdminAuthError(
          "UNAUTHORIZED",
          "Authentication required to access admin resources.",
          401,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/audit-logs");
      const res = await GET(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toEqual({
        error: "UNAUTHORIZED",
        message: "Authentication required to access admin resources.",
      });
      expect(requireAdminSession).toHaveBeenCalledWith(
        expect.anything(),
        { requiredRole: "SUPER_ADMIN" },
      );
    });

    it("returns 403 FORBIDDEN when user has role ADMIN", async () => {
      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AdminAuthError(
          "FORBIDDEN",
          "Insufficient role level: requires SUPER_ADMIN, account has ADMIN.",
          403,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/audit-logs");
      const res = await GET(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data).toEqual({
        error: "FORBIDDEN",
        message: "Insufficient role level: requires SUPER_ADMIN, account has ADMIN.",
      });
    });

    it("returns 403 FORBIDDEN when user has role MODERATOR", async () => {
      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AdminAuthError(
          "FORBIDDEN",
          "Insufficient role level: requires SUPER_ADMIN, account has MODERATOR.",
          403,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/audit-logs");
      const res = await GET(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data).toEqual({
        error: "FORBIDDEN",
        message: "Insufficient role level: requires SUPER_ADMIN, account has MODERATOR.",
      });
    });

    it("returns 403 FORBIDDEN if session roleType is not SUPER_ADMIN", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(adminSession as any);

      const req = new Request("http://localhost:3000/api/admin/audit-logs");
      const res = await GET(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("FORBIDDEN");
      expect(data.message).toContain("Super admin role required");
    });

    it("succeeds with 200 OK when user is authenticated SUPER_ADMIN", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(superAdminSession as any);
      vi.mocked(listAuditLogs).mockResolvedValueOnce({
        logs: [
          {
            id: "log-1",
            actorId: "super_admin_user_1",
            action: "ASSIGN_WL_SLOT",
            entityType: "WLSlot",
            entityId: "slot-123",
            oldValues: null,
            newValues: { status: "ALLOCATED" },
            metadata: null,
            createdAt: new Date("2026-10-25T12:00:00.000Z"),
            actor: {
              id: "super_admin_user_1",
              role: "SUPER_ADMIN",
              wallet: { address: "0xsuperadmin1" },
              xIdentity: null,
            },
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      });

      const req = new Request("http://localhost:3000/api/admin/audit-logs");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.total).toBe(1);
      expect(data.logs[0].id).toBe("log-1");
      expect(data.logs[0].action).toBe("ASSIGN_WL_SLOT");
    });
  });

  describe("2. Query Filtering", () => {
    it("passes action, entityType, actorId, from, and to filters to listAuditLogs", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(superAdminSession as any);
      vi.mocked(listAuditLogs).mockResolvedValueOnce({
        logs: [],
        total: 0,
        limit: 50,
        offset: 0,
      });

      const req = new Request(
        "http://localhost:3000/api/admin/audit-logs?action=BAN_USER&entityType=User&actorId=actor-42&from=2026-10-01&to=2026-10-31",
      );
      await GET(req);

      expect(listAuditLogs).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: "BAN_USER",
          entityType: "User",
          actorId: "actor-42",
          from: "2026-10-01",
          to: "2026-10-31",
        }),
      );
    });
  });

  describe("3. Pagination & Limits", () => {
    it("parses valid integer limit and offset parameters", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(superAdminSession as any);
      vi.mocked(listAuditLogs).mockResolvedValueOnce({
        logs: [],
        total: 100,
        limit: 25,
        offset: 10,
      });

      const req = new Request("http://localhost:3000/api/admin/audit-logs?limit=25&offset=10");
      await GET(req);

      expect(listAuditLogs).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          limit: 25,
          offset: 10,
        }),
      );
    });

    it("clamps limit to maximum 100", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(superAdminSession as any);
      vi.mocked(listAuditLogs).mockResolvedValueOnce({
        logs: [],
        total: 0,
        limit: 100,
        offset: 0,
      });

      const req = new Request("http://localhost:3000/api/admin/audit-logs?limit=500");
      await GET(req);

      expect(listAuditLogs).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          limit: 100,
        }),
      );
    });

    it("returns 400 when limit is negative or non-numeric", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(superAdminSession as any);

      const req1 = new Request("http://localhost:3000/api/admin/audit-logs?limit=-5");
      const res1 = await GET(req1);
      expect(res1.status).toBe(400);
      const data1 = await res1.json();
      expect(data1.error).toBe("INVALID_LIMIT");

      vi.mocked(requireAdminSession).mockResolvedValueOnce(superAdminSession as any);
      const req2 = new Request("http://localhost:3000/api/admin/audit-logs?limit=abc");
      const res2 = await GET(req2);
      expect(res2.status).toBe(400);
      const data2 = await res2.json();
      expect(data2.error).toBe("INVALID_LIMIT");
    });

    it("returns 400 when offset is negative or non-numeric", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(superAdminSession as any);

      const req1 = new Request("http://localhost:3000/api/admin/audit-logs?offset=-2");
      const res1 = await GET(req1);
      expect(res1.status).toBe(400);
      const data1 = await res1.json();
      expect(data1.error).toBe("INVALID_OFFSET");

      vi.mocked(requireAdminSession).mockResolvedValueOnce(superAdminSession as any);
      const req2 = new Request("http://localhost:3000/api/admin/audit-logs?offset=xyz");
      const res2 = await GET(req2);
      expect(res2.status).toBe(400);
      const data2 = await res2.json();
      expect(data2.error).toBe("INVALID_OFFSET");
    });
  });

  describe("4. Error Handling", () => {
    it("maps AdminAuditLogError to its specific status code and response body", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(superAdminSession as any);
      vi.mocked(listAuditLogs).mockRejectedValueOnce(
        new AdminAuditLogError("INVALID_DATE_RANGE", "Invalid 'from' date format.", 400),
      );

      const req = new Request("http://localhost:3000/api/admin/audit-logs?from=not-a-date");
      const res = await GET(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({
        error: "INVALID_DATE_RANGE",
        message: "Invalid 'from' date format.",
      });
    });

    it("maps unexpected errors to 500 SERVER_ERROR without leaking internals", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(requireAdminSession).mockResolvedValueOnce(superAdminSession as any);
      vi.mocked(listAuditLogs).mockRejectedValueOnce(new Error("Database disconnected"));

      const req = new Request("http://localhost:3000/api/admin/audit-logs");
      const res = await GET(req);

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data).toEqual({
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while listing audit logs.",
      });
      consoleErrorSpy.mockRestore();
    });
  });

  describe("5. HTTP Method Guards (Read-Only Enforcement)", () => {
    const methods = [
      { name: "POST", handler: POST },
      { name: "PUT", handler: PUT },
      { name: "DELETE", handler: DELETE },
      { name: "PATCH", handler: PATCH },
      { name: "HEAD", handler: HEAD },
      { name: "OPTIONS", handler: OPTIONS },
    ];

    for (const { name, handler } of methods) {
      it(`rejects ${name} with 405 Method Not Allowed`, async () => {
        const res = await handler();
        expect(res.status).toBe(405);
        expect(res.headers.get("Allow")).toBe("GET");
        const data = await res.json();
        expect(data.error).toContain("Method not allowed");
      });
    }
  });
});
