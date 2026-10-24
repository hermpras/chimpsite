import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as LIST_GET, POST as CREATE_POST } from "@/app/api/admin/wl-programs/route";
import {
  GET as DETAIL_GET,
  PATCH as UPDATE_PATCH,
} from "@/app/api/admin/wl-programs/[id]/route";
import * as wlProgramService from "@/server/admin/wl-program";
import { AdminWLProgramError } from "@/server/admin/wl-program";

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
    checkAdminSession: vi.fn(),
    AdminAuthError: MockAdminAuthError,
  };
});

import {
  requireAdminSession,
  checkAdminSession,
  AdminAuthError,
} from "@/server/auth/session";

describe("Admin WL Program API Routes - Permission & Endpoint Suite", () => {
  const fakeAdminSession = {
    userId: "admin_test_user",
    address: "0x1111111111111111111111111111111111111111",
    role: "ADMIN" as const,
    adminRole: {
      id: "ar_1",
      userId: "admin_test_user",
      roleType: "ADMIN" as const,
      permissions: ["MANAGE_WL"],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdminSession).mockResolvedValue(fakeAdminSession as any);
    vi.mocked(checkAdminSession).mockResolvedValue({
      ok: true,
      session: fakeAdminSession as any,
    });
  });

  describe("1. Permission & Authorization Checks", () => {
    it("rejects unauthenticated requests on POST with 401", async () => {
      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AdminAuthError("UNAUTHORIZED", "Authentication required.", 401),
      );

      const req = new Request("http://localhost/api/admin/wl-programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Genesis", slug: "genesis", totalSlots: 100 }),
      });

      const res = await CREATE_POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("UNAUTHORIZED");
    });

    it("rejects unauthorized requests lacking MANAGE_WL on POST with 403", async () => {
      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AdminAuthError(
          "FORBIDDEN",
          "Missing required admin permission: MANAGE_WL.",
          403,
        ),
      );

      const req = new Request("http://localhost/api/admin/wl-programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Genesis", slug: "genesis", totalSlots: 100 }),
      });

      const res = await CREATE_POST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("FORBIDDEN");
    });

    it("allows admins with MANAGE_CAMPAIGNS to GET programs list for campaign dropdown", async () => {
      // First check for MANAGE_WL fails, second check for MANAGE_CAMPAIGNS succeeds
      vi.mocked(checkAdminSession)
        .mockResolvedValueOnce({
          ok: false,
          error: "FORBIDDEN",
          status: 403,
          message: "Missing MANAGE_WL",
        })
        .mockResolvedValueOnce({
          ok: true,
          session: {
            ...fakeAdminSession,
            adminRole: {
              ...fakeAdminSession.adminRole,
              permissions: ["MANAGE_CAMPAIGNS"],
            },
          } as any,
        });

      vi.spyOn(wlProgramService, "listWLPrograms").mockResolvedValueOnce({
        programs: [],
        total: 0,
      });

      const req = new Request("http://localhost/api/admin/wl-programs", {
        method: "GET",
      });
      const res = await LIST_GET(req);
      expect(res.status).toBe(200);
    });

    it("rejects GET when caller has neither MANAGE_WL nor MANAGE_CAMPAIGNS", async () => {
      vi.mocked(checkAdminSession)
        .mockResolvedValueOnce({
          ok: false,
          error: "FORBIDDEN",
          status: 403,
          message: "Missing permission",
        })
        .mockResolvedValueOnce({
          ok: false,
          error: "FORBIDDEN",
          status: 403,
          message: "Missing permission",
        });

      const req = new Request("http://localhost/api/admin/wl-programs", {
        method: "GET",
      });
      const res = await LIST_GET(req);
      expect(res.status).toBe(403);
    });
  });

  describe("2. GET /api/admin/wl-programs", () => {
    it("lists programs with status filter and pagination parameters", async () => {
      const mockPrograms = [
        {
          id: "prog-1",
          slug: "genesis",
          name: "Genesis WL",
          description: null,
          totalSlots: 500,
          allocatedSlotsCount: 120,
          status: "OPEN" as const,
          startsAt: "2026-11-01T00:00:00.000Z",
          endsAt: null,
          createdAt: "2026-10-25T00:00:00.000Z",
          updatedAt: "2026-10-25T00:00:00.000Z",
          campaignsCount: 3,
        },
      ];

      vi.spyOn(wlProgramService, "listWLPrograms").mockResolvedValueOnce({
        programs: mockPrograms,
        total: 1,
      });

      const req = new Request(
        "http://localhost/api/admin/wl-programs?status=OPEN&search=genesis&limit=10&offset=0",
        { method: "GET" },
      );
      const res = await LIST_GET(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.total).toBe(1);
      expect(json.programs[0].slug).toBe("genesis");
      expect(wlProgramService.listWLPrograms).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: "OPEN",
          search: "genesis",
          limit: 10,
          offset: 0,
        }),
      );
    });
  });

  describe("3. POST /api/admin/wl-programs", () => {
    it("handles malformed JSON body with 400", async () => {
      const req = new Request("http://localhost/api/admin/wl-programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{malformed-json",
      });

      const res = await CREATE_POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("MALFORMED_JSON");
    });

    it("propagates explicit capacity validation error with 422", async () => {
      vi.spyOn(wlProgramService, "createWLProgram").mockRejectedValueOnce(
        new AdminWLProgramError(
          "INVALID_CAPACITY",
          "Capacity (totalSlots) must be explicitly specified as a positive integer (> 0).",
          422,
        ),
      );

      const req = new Request("http://localhost/api/admin/wl-programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Prog",
          slug: "test-prog",
          startsAt: "2026-11-01T00:00:00.000Z",
        }),
      });

      const res = await CREATE_POST(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error).toBe("INVALID_CAPACITY");
    });

    it("creates program successfully returning 201", async () => {
      vi.spyOn(wlProgramService, "createWLProgram").mockResolvedValueOnce({
        program: {
          id: "prog-new-1",
          slug: "genesis-s1",
          name: "Genesis Season 1",
          description: null,
          totalSlots: 1000,
          allocatedSlotsCount: 0,
          status: "UPCOMING",
          startsAt: "2026-11-01T00:00:00.000Z",
          endsAt: null,
          createdAt: "2026-10-25T00:00:00.000Z",
          updatedAt: "2026-10-25T00:00:00.000Z",
        },
        auditLogId: "audit-123",
      });

      const req = new Request("http://localhost/api/admin/wl-programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Genesis Season 1",
          slug: "genesis-s1",
          totalSlots: 1000,
          startsAt: "2026-11-01T00:00:00.000Z",
        }),
      });

      const res = await CREATE_POST(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.program.slug).toBe("genesis-s1");
      expect(json.program.totalSlots).toBe(1000);
      expect(json.auditLogId).toBe("audit-123");
    });
  });

  describe("4. GET /api/admin/wl-programs/[id]", () => {
    it("returns 404 when program does not exist", async () => {
      vi.spyOn(wlProgramService, "getWLProgram").mockRejectedValueOnce(
        new AdminWLProgramError("PROGRAM_NOT_FOUND", "Program not found.", 404),
      );

      const req = new Request("http://localhost/api/admin/wl-programs/unknown-id", {
        method: "GET",
      });
      const res = await DETAIL_GET(req, {
        params: Promise.resolve({ id: "unknown-id" }),
      });
      expect(res.status).toBe(404);
    });

    it("returns program details on success", async () => {
      vi.spyOn(wlProgramService, "getWLProgram").mockResolvedValueOnce({
        id: "prog-found-1",
        slug: "prog-slug",
        name: "Found Program",
        description: null,
        totalSlots: 200,
        allocatedSlotsCount: 50,
        status: "OPEN",
        startsAt: "2026-11-01T00:00:00.000Z",
        endsAt: null,
        createdAt: "2026-10-25T00:00:00.000Z",
        updatedAt: "2026-10-25T00:00:00.000Z",
      });

      const req = new Request("http://localhost/api/admin/wl-programs/prog-found-1", {
        method: "GET",
      });
      const res = await DETAIL_GET(req, {
        params: Promise.resolve({ id: "prog-found-1" }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.program.id).toBe("prog-found-1");
    });
  });

  describe("5. PATCH /api/admin/wl-programs/[id]", () => {
    it("enforces capacity invariant and returns 409 when capacity reduced below allocated", async () => {
      vi.spyOn(wlProgramService, "updateWLProgram").mockRejectedValueOnce(
        new AdminWLProgramError(
          "CAPACITY_EXCEEDED",
          "Cannot reduce capacity below current allocated slots.",
          409,
        ),
      );

      const req = new Request("http://localhost/api/admin/wl-programs/prog-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalSlots: 10 }),
      });

      const res = await UPDATE_PATCH(req, { params: Promise.resolve({ id: "prog-1" }) });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toBe("CAPACITY_EXCEEDED");
    });

    it("updates program successfully", async () => {
      vi.spyOn(wlProgramService, "updateWLProgram").mockResolvedValueOnce({
        program: {
          id: "prog-1",
          slug: "genesis",
          name: "Updated Name",
          description: null,
          totalSlots: 600,
          allocatedSlotsCount: 120,
          status: "OPEN",
          startsAt: "2026-11-01T00:00:00.000Z",
          endsAt: null,
          createdAt: "2026-10-25T00:00:00.000Z",
          updatedAt: "2026-10-25T00:00:00.000Z",
        },
        auditLogId: "audit-upd-1",
      });

      const req = new Request("http://localhost/api/admin/wl-programs/prog-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Name", totalSlots: 600 }),
      });

      const res = await UPDATE_PATCH(req, { params: Promise.resolve({ id: "prog-1" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.program.name).toBe("Updated Name");
      expect(json.program.totalSlots).toBe(600);
    });
  });
});
