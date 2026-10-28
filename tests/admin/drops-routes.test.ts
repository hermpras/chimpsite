import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getDrops, POST as postDrops } from "@/app/api/admin/drops/route";
import { GET as getDrop, PATCH as patchDrop } from "@/app/api/admin/drops/[id]/route";
import { POST as postPeriod } from "@/app/api/admin/drops/[id]/periods/route";
import { PUT as putStock } from "@/app/api/admin/drops/[id]/periods/[periodId]/stock/route";
import { POST as postActivate } from "@/app/api/admin/drops/[id]/periods/[periodId]/activate/route";
import { GET as getTraits } from "@/app/api/admin/traits/route";
import { AdminAuthError } from "@/server/auth/session";

const { mockRequireAdminSession, mockService } = vi.hoisted(() => ({
  mockRequireAdminSession: vi.fn(),
  mockService: {
    listAdminDrops: vi.fn(),
    createAdminDrop: vi.fn(),
    getAdminDrop: vi.fn(),
    updateAdminDrop: vi.fn(),
    createAdminDropPeriod: vi.fn(),
    configurePeriodStock: vi.fn(),
    activateDropPeriod: vi.fn(),
    listAdminTraits: vi.fn(),
  },
}));

vi.mock("@/server/db", () => ({
  prisma: {},
}));

vi.mock("@/server/auth/session", () => ({
  requireAdminSession: mockRequireAdminSession,
  AdminAuthError: class MockAdminAuthError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number = 403) {
      super(message);
      this.code = code;
      this.status = status;
    }
    toResponse() {
      return Response.json(
        { error: this.code, message: this.message },
        { status: this.status },
      );
    }
  },
}));

vi.mock("@/server/admin/drops", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    listAdminDrops: (...args: any[]) => mockService.listAdminDrops(...args),
    createAdminDrop: (...args: any[]) => mockService.createAdminDrop(...args),
    getAdminDrop: (...args: any[]) => mockService.getAdminDrop(...args),
    updateAdminDrop: (...args: any[]) => mockService.updateAdminDrop(...args),
    createAdminDropPeriod: (...args: any[]) => mockService.createAdminDropPeriod(...args),
    configurePeriodStock: (...args: any[]) => mockService.configurePeriodStock(...args),
    activateDropPeriod: (...args: any[]) => mockService.activateDropPeriod(...args),
    listAdminTraits: (...args: any[]) => mockService.listAdminTraits(...args),
  };
});

describe("Admin Drops API Routes - Permission & Endpoint Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validAdminSession = {
    sessionId: "sess-1",
    userId: "admin-1",
    address: "0x1234567890123456789012345678901234567890",
    adminRole: {
      id: "role-1",
      userId: "admin-1",
      roleType: "ADMIN",
      permissions: ["MANAGE_DROPS"],
    },
  };

  describe("1. Permission & Authorization Checks (MANAGE_DROPS)", () => {
    it("returns 401 UNAUTHORIZED when session is missing", async () => {
      mockRequireAdminSession.mockRejectedValue(
        new (AdminAuthError as any)("UNAUTHORIZED", "Missing session", 401),
      );

      const req = new Request("http://localhost:3000/api/admin/drops", { method: "GET" });
      const res = await getDrops(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("UNAUTHORIZED");
    });

    it("returns 403 FORBIDDEN when user lacks MANAGE_DROPS permission", async () => {
      mockRequireAdminSession.mockRejectedValue(
        new (AdminAuthError as any)(
          "FORBIDDEN",
          "Missing required admin permission: MANAGE_DROPS.",
          403,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/drops", { method: "GET" });
      const res = await getDrops(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("FORBIDDEN");
      expect(data.message).toContain("MANAGE_DROPS");
    });
  });

  describe("2. GET & POST /api/admin/drops", () => {
    it("GET /api/admin/drops lists drops with limit/offset params", async () => {
      mockRequireAdminSession.mockResolvedValue(validAdminSession);
      mockService.listAdminDrops.mockResolvedValue({
        drops: [{ id: "drop-1", title: "Genesis Drop" }],
        total: 1,
        limit: 20,
        offset: 0,
      });

      const req = new Request("http://localhost:3000/api/admin/drops?limit=10&offset=5", {
        method: "GET",
      });
      const res = await getDrops(req);
      expect(res.status).toBe(200);
      expect(mockRequireAdminSession).toHaveBeenCalledWith(
        expect.anything(),
        "MANAGE_DROPS",
      );
      expect(mockService.listAdminDrops).toHaveBeenCalledWith(expect.anything(), {
        limit: 10,
        offset: 5,
      });
    });

    it("POST /api/admin/drops creates drop with 201 status", async () => {
      mockRequireAdminSession.mockResolvedValue(validAdminSession);
      mockService.createAdminDrop.mockResolvedValue({
        drop: { id: "drop-1", slug: "genesis", title: "Genesis Drop" },
        auditLogId: "audit-1",
      });

      const req = new Request("http://localhost:3000/api/admin/drops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Genesis Drop",
          slug: "genesis",
          startsAt: "2026-10-25T02:00:00.000Z",
          endsAt: "2026-10-25T06:00:00.000Z",
          generatePeriods: true,
        }),
      });

      const res = await postDrops(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.drop.id).toBe("drop-1");
      expect(mockService.createAdminDrop).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          title: "Genesis Drop",
          slug: "genesis",
          adminUserId: "admin-1",
        }),
      );
    });
  });

  describe("3. GET & PATCH /api/admin/drops/[id]", () => {
    it("GET returns drop details", async () => {
      mockRequireAdminSession.mockResolvedValue(validAdminSession);
      mockService.getAdminDrop.mockResolvedValue({
        id: "drop-1",
        slug: "genesis",
        periods: [],
      });

      const req = new Request("http://localhost:3000/api/admin/drops/drop-1", {
        method: "GET",
      });
      const res = await getDrop(req, { params: Promise.resolve({ id: "drop-1" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.drop.id).toBe("drop-1");
    });

    it("PATCH updates drop metadata", async () => {
      mockRequireAdminSession.mockResolvedValue(validAdminSession);
      mockService.updateAdminDrop.mockResolvedValue({
        drop: { id: "drop-1", title: "Updated Title" },
        auditLogId: "audit-2",
      });

      const req = new Request("http://localhost:3000/api/admin/drops/drop-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated Title" }),
      });
      const res = await patchDrop(req, { params: Promise.resolve({ id: "drop-1" }) });
      expect(res.status).toBe(200);
      expect(mockService.updateAdminDrop).toHaveBeenCalledWith(
        expect.anything(),
        "drop-1",
        expect.objectContaining({
          title: "Updated Title",
          adminUserId: "admin-1",
        }),
      );
    });
  });

  describe("4. POST /api/admin/drops/[id]/periods", () => {
    it("adds a period to a drop", async () => {
      mockRequireAdminSession.mockResolvedValue(validAdminSession);
      mockService.createAdminDropPeriod.mockResolvedValue({
        period: { id: "period-1", periodIndex: 2 },
        auditLogId: "audit-3",
      });

      const req = new Request("http://localhost:3000/api/admin/drops/drop-1/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startsAt: "2026-10-25T04:00:00.000Z" }),
      });
      const res = await postPeriod(req, { params: Promise.resolve({ id: "drop-1" }) });
      expect(res.status).toBe(201);
      expect(mockService.createAdminDropPeriod).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          dropId: "drop-1",
          startsAt: "2026-10-25T04:00:00.000Z",
          adminUserId: "admin-1",
        }),
      );
    });
  });

  describe("5. PUT /api/admin/drops/[id]/periods/[periodId]/stock", () => {
    it("configures period stock allocation", async () => {
      mockRequireAdminSession.mockResolvedValue(validAdminSession);
      mockService.configurePeriodStock.mockResolvedValue({
        period: { id: "p1", isStockConfigured: true, status: "CONFIGURED" },
        auditLogId: "audit-4",
      });

      const req = new Request(
        "http://localhost:3000/api/admin/drops/drop-1/periods/p1/stock",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [
              { traitId: "t1", stock: 10, weight: 100 },
              { traitId: "t2", stock: 20, weight: 100 },
            ],
          }),
        },
      );
      const res = await putStock(req, {
        params: Promise.resolve({ id: "drop-1", periodId: "p1" }),
      });
      expect(res.status).toBe(200);
      expect(mockService.configurePeriodStock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          dropId: "drop-1",
          periodId: "p1",
          items: [
            { traitId: "t1", stock: 10, weight: 100 },
            { traitId: "t2", stock: 20, weight: 100 },
          ],
          adminUserId: "admin-1",
        }),
      );
    });
  });

  describe("6. POST /api/admin/drops/[id]/periods/[periodId]/activate", () => {
    it("activates drop period", async () => {
      mockRequireAdminSession.mockResolvedValue(validAdminSession);
      mockService.activateDropPeriod.mockResolvedValue({
        period: { id: "p1", status: "ACTIVE", isStockLocked: true },
        auditLogId: "audit-5",
      });

      const req = new Request(
        "http://localhost:3000/api/admin/drops/drop-1/periods/p1/activate",
        {
          method: "POST",
        },
      );
      const res = await postActivate(req, {
        params: Promise.resolve({ id: "drop-1", periodId: "p1" }),
      });
      expect(res.status).toBe(200);
      expect(mockService.activateDropPeriod).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          dropId: "drop-1",
          periodId: "p1",
          adminUserId: "admin-1",
        }),
      );
    });
  });

  describe("7. GET /api/admin/traits", () => {
    it("lists active traits for drop configuration", async () => {
      mockRequireAdminSession.mockResolvedValue(validAdminSession);
      mockService.listAdminTraits.mockResolvedValue([
        { id: "t1", name: "Jungle Green", category: "BG" },
      ]);

      const req = new Request("http://localhost:3000/api/admin/traits", {
        method: "GET",
      });
      const res = await getTraits(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.traits).toHaveLength(1);
      expect(mockService.listAdminTraits).toHaveBeenCalled();
    });
  });
});
