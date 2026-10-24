import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  GET,
  POST,
  PUT,
  DELETE,
  PATCH,
  HEAD,
  OPTIONS,
} from "@/app/api/admin/whitelist/slots/route";
import { GET as ALIAS_GET } from "@/app/api/admin/slots/route";

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

vi.mock("@/server/admin/slot", () => {
  class MockAdminSlotError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number = 400) {
      super(message);
      this.name = "AdminSlotError";
      this.code = code;
      this.status = status;
    }
  }

  return {
    listAdminWlSlots: vi.fn(),
    AdminSlotError: MockAdminSlotError,
  };
});

import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import { listAdminWlSlots, AdminSlotError } from "@/server/admin/slot";

describe("Admin Whitelist Slots API Route (GET /api/admin/whitelist/slots)", () => {
  const validAdminSession = {
    sessionId: "sess_admin_1",
    userId: "admin_user_1",
    address: "0xadmin1",
    adminRole: {
      id: "role_1",
      userId: "admin_user_1",
      roleType: "ADMIN",
      permissions: ["MANAGE_WL"],
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

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots");
      const res = await GET(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toEqual({
        error: "UNAUTHORIZED",
        message: "Authentication required to access admin resources.",
      });
      expect(requireAdminSession).toHaveBeenCalledWith(expect.anything(), "MANAGE_WL");
    });

    it("returns 403 FORBIDDEN when user lacks MANAGE_WL permission", async () => {
      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AdminAuthError(
          "FORBIDDEN",
          "Missing required admin permission: MANAGE_WL.",
          403,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots");
      const res = await GET(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data).toEqual({
        error: "FORBIDDEN",
        message: "Missing required admin permission: MANAGE_WL.",
      });
    });

    it("succeeds with 200 when admin has MANAGE_WL permission", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(listAdminWlSlots).mockResolvedValueOnce({
        slots: [
          {
            id: "slot-1",
            slotNumber: 1,
            programId: "prog-1",
            programName: "Genesis WL",
            programSlug: "genesis-wl",
            userId: "user-1",
            walletAddress: "0x1111111111111111111111111111111111111111",
            status: "ALLOCATED",
            allocatedAt: "2026-10-24T00:00:00.000Z",
            confirmedAt: null,
            allocatedBy: "QUEUE_WORKER",
            notes: null,
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      });

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.total).toBe(1);
      expect(data.slots[0].id).toBe("slot-1");
      expect(data.slots[0].slotNumber).toBe(1);
      expect(data.slots[0].walletAddress).toBe(
        "0x1111111111111111111111111111111111111111",
      );
    });
  });

  describe("2. Filtering & Search Parameters", () => {
    it("passes programId, status, search, userId, and address filters to listAdminWlSlots", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(listAdminWlSlots).mockResolvedValueOnce({
        slots: [],
        total: 0,
        limit: 20,
        offset: 0,
      });

      const req = new Request(
        "http://localhost:3000/api/admin/whitelist/slots?programId=prog-gen&status=ALLOCATED&search=0xabc&userId=u123&address=0xabc",
      );
      await GET(req);

      expect(listAdminWlSlots).toHaveBeenCalledWith(expect.anything(), {
        programId: "prog-gen",
        status: "ALLOCATED",
        search: "0xabc",
        userId: "u123",
        address: "0xabc",
        limit: undefined,
        offset: undefined,
      });
    });
  });

  describe("3. Pagination & Limits", () => {
    it("parses valid integer limit and offset parameters", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(listAdminWlSlots).mockResolvedValueOnce({
        slots: [],
        total: 50,
        limit: 10,
        offset: 20,
      });

      const req = new Request(
        "http://localhost:3000/api/admin/whitelist/slots?limit=10&offset=20",
      );
      await GET(req);

      expect(listAdminWlSlots).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          limit: 10,
          offset: 20,
        }),
      );
    });
  });

  describe("4. Alias Route Re-export (/api/admin/slots)", () => {
    it("serves identical handler under alias route /api/admin/slots", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(listAdminWlSlots).mockResolvedValueOnce({
        slots: [],
        total: 0,
        limit: 20,
        offset: 0,
      });

      const req = new Request("http://localhost:3000/api/admin/slots?limit=5");
      const res = await ALIAS_GET(req);

      expect(res.status).toBe(200);
      expect(listAdminWlSlots).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ limit: 5 }),
      );
    });
  });

  describe("5. Error Handling", () => {
    it("maps AdminSlotError to proper status code", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(listAdminWlSlots).mockRejectedValueOnce(
        new AdminSlotError("INVALID_STATUS", "Invalid status value", 422),
      );

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots");
      const res = await GET(req);

      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data).toEqual({
        error: "INVALID_STATUS",
        message: "Invalid status value",
      });
    });

    it("maps unexpected server error to 500 SERVER_ERROR", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(listAdminWlSlots).mockRejectedValueOnce(new Error("Database offline"));

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots");
      const res = await GET(req);

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data).toEqual({
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while listing whitelist slots.",
      });
      consoleErrorSpy.mockRestore();
    });
  });

  describe("6. HTTP Method Guards", () => {
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
      });
    }
  });
});
