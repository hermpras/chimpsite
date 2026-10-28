import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  GET,
  POST,
  PUT,
  DELETE,
  PATCH,
  HEAD,
  OPTIONS,
} from "@/app/api/admin/users/route";

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

vi.mock("@/server/admin/users", () => {
  class MockAdminUsersError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number = 400) {
      super(message);
      this.name = "AdminUsersError";
      this.code = code;
      this.status = status;
    }
  }

  return {
    listAdminUsers: vi.fn(),
    AdminUsersError: MockAdminUsersError,
  };
});

import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import { listAdminUsers, AdminUsersError } from "@/server/admin/users";

describe("Admin Users API Route (GET /api/admin/users)", () => {
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

  describe("1. Authorization & Authentication", () => {
    it("returns 401 UNAUTHORIZED when session is missing or unauthenticated", async () => {
      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AdminAuthError(
          "UNAUTHORIZED",
          "Authentication required to access admin resources.",
          401,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/users");
      const res = await GET(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toEqual({
        error: "UNAUTHORIZED",
        message: "Authentication required to access admin resources.",
      });
      expect(requireAdminSession).toHaveBeenCalledWith(expect.anything(), "MANAGE_BANS");
    });

    it("returns 403 FORBIDDEN when user lacks MANAGE_BANS permission", async () => {
      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AdminAuthError(
          "FORBIDDEN",
          "Missing required admin permission: MANAGE_BANS.",
          403,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/users");
      const res = await GET(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data).toEqual({
        error: "FORBIDDEN",
        message: "Missing required admin permission: MANAGE_BANS.",
      });
    });

    it("succeeds with 200 when admin has MANAGE_BANS permission", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(listAdminUsers).mockResolvedValueOnce({
        users: [
          {
            id: "user-1",
            role: "USER",
            isBanned: false,
            createdAt: "2026-10-24T00:00:00.000Z",
            updatedAt: "2026-10-24T00:00:00.000Z",
            wallet: {
              address: "0x1111111111111111111111111111111111111111",
              chainId: 1,
              verifiedAt: "2026-10-24T00:00:00.000Z",
            },
            xIdentity: { username: "chimp_user", name: "Chimp User" },
            activeBan: null,
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      });

      const req = new Request("http://localhost:3000/api/admin/users");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.total).toBe(1);
      expect(data.users[0].id).toBe("user-1");
      expect(data.users[0].wallet.address).toBe(
        "0x1111111111111111111111111111111111111111",
      );
      expect(data.users[0].avatarPng).toBeUndefined();
    });
  });

  describe("2. Search & Filtering", () => {
    it("passes search query parameter to listAdminUsers", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(listAdminUsers).mockResolvedValueOnce({
        users: [],
        total: 0,
        limit: 20,
        offset: 0,
      });

      const req = new Request("http://localhost:3000/api/admin/users?search=0xabc");
      await GET(req);

      expect(listAdminUsers).toHaveBeenCalledWith(expect.anything(), {
        search: "0xabc",
        address: undefined,
        userId: undefined,
        role: undefined,
        isBanned: undefined,
        limit: undefined,
        offset: undefined,
      });
    });

    it("supports q and query as alternative search parameters", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(listAdminUsers).mockResolvedValueOnce({
        users: [],
        total: 0,
        limit: 20,
        offset: 0,
      });

      const req = new Request("http://localhost:3000/api/admin/users?q=chimp");
      await GET(req);

      expect(listAdminUsers).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ search: "chimp" }),
      );
    });

    it("parses address, userId, role, and isBanned filters", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(listAdminUsers).mockResolvedValueOnce({
        users: [],
        total: 0,
        limit: 20,
        offset: 0,
      });

      const req = new Request(
        "http://localhost:3000/api/admin/users?address=0x123&userId=u1&role=ADMIN&isBanned=true",
      );
      await GET(req);

      expect(listAdminUsers).toHaveBeenCalledWith(expect.anything(), {
        search: undefined,
        address: "0x123",
        userId: "u1",
        role: "ADMIN",
        isBanned: "true",
        limit: undefined,
        offset: undefined,
      });
    });
  });

  describe("3. Pagination & Limits", () => {
    it("parses valid integer limit and offset parameters", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(listAdminUsers).mockResolvedValueOnce({
        users: [],
        total: 100,
        limit: 50,
        offset: 25,
      });

      const req = new Request("http://localhost:3000/api/admin/users?limit=50&offset=25");
      await GET(req);

      expect(listAdminUsers).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          limit: 50,
          offset: 25,
        }),
      );
    });

    it("handles invalid or non-numeric limit and offset gracefully", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(listAdminUsers).mockResolvedValueOnce({
        users: [],
        total: 0,
        limit: 20,
        offset: 0,
      });

      const req = new Request(
        "http://localhost:3000/api/admin/users?limit=abc&offset=xyz",
      );
      await GET(req);

      expect(listAdminUsers).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          limit: undefined,
          offset: undefined,
        }),
      );
    });
  });

  describe("4. Error Handling", () => {
    it("maps AdminUsersError to corresponding status code and response payload", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(listAdminUsers).mockRejectedValueOnce(
        new AdminUsersError("INVALID_FILTER", "Invalid filter parameter", 422),
      );

      const req = new Request("http://localhost:3000/api/admin/users");
      const res = await GET(req);

      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data).toEqual({
        error: "INVALID_FILTER",
        message: "Invalid filter parameter",
      });
    });

    it("maps unexpected database errors to 500 SERVER_ERROR without exposing stack traces", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(listAdminUsers).mockRejectedValueOnce(
        new Error("Fatal database pool disconnect"),
      );

      const req = new Request("http://localhost:3000/api/admin/users");
      const res = await GET(req);

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data).toEqual({
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while listing users.",
      });
      consoleErrorSpy.mockRestore();
    });
  });

  describe("5. HTTP Method Guards", () => {
    const invalidMethods = [
      { name: "POST", handler: POST },
      { name: "PUT", handler: PUT },
      { name: "DELETE", handler: DELETE },
      { name: "PATCH", handler: PATCH },
      { name: "HEAD", handler: HEAD },
      { name: "OPTIONS", handler: OPTIONS },
    ];

    for (const { name, handler } of invalidMethods) {
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
