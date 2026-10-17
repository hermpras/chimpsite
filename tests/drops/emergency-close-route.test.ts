import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  POST,
  GET,
  PUT,
  DELETE,
  PATCH,
  HEAD,
  OPTIONS,
} from "@/app/api/drops/emergency-close/route";
import {
  POST as ADMIN_POST,
  GET as ADMIN_GET,
  PUT as ADMIN_PUT,
  DELETE as ADMIN_DELETE,
  PATCH as ADMIN_PATCH,
  HEAD as ADMIN_HEAD,
  OPTIONS as ADMIN_OPTIONS,
} from "@/app/api/admin/drops/emergency-close/route";

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

vi.mock("@/server/drops/claim", () => {
  class MockDropClaimError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number = 400) {
      super(message);
      this.name = "DropClaimError";
      this.code = code;
      this.status = status;
    }
  }

  return {
    emergencyCloseDropPeriod: vi.fn(),
    DropClaimError: MockDropClaimError,
  };
});

import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import { emergencyCloseDropPeriod, DropClaimError } from "@/server/drops/claim";

describe("POST /api/drops/emergency-close route", () => {
  const validAdminSession = {
    sessionId: "sess_admin_1",
    userId: "admin_user_1",
    address: "0xadmin1",
    adminRole: {
      id: "role_1",
      userId: "admin_user_1",
      roleType: "ADMIN",
      permissions: ["MANAGE_DROPS"],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 405 on all unsupported HTTP methods with Allow: POST header", async () => {
    const methods = [
      { name: "GET", fn: GET, adminFn: ADMIN_GET },
      { name: "PUT", fn: PUT, adminFn: ADMIN_PUT },
      { name: "DELETE", fn: DELETE, adminFn: ADMIN_DELETE },
      { name: "PATCH", fn: PATCH, adminFn: ADMIN_PATCH },
      { name: "HEAD", fn: HEAD, adminFn: ADMIN_HEAD },
      { name: "OPTIONS", fn: OPTIONS, adminFn: ADMIN_OPTIONS },
    ];

    for (const { fn, adminFn } of methods) {
      const res = await fn();
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("POST");

      const adminRes = await adminFn();
      expect(adminRes.status).toBe(405);
      expect(adminRes.headers.get("Allow")).toBe("POST");
    }
  });

  it("returns 401 when caller is unauthenticated", async () => {
    vi.mocked(requireAdminSession).mockRejectedValue(
      new AdminAuthError(
        "UNAUTHORIZED",
        "Authentication required to access admin resources.",
        401,
      ),
    );

    const req = new Request("http://localhost:3000/api/drops/emergency-close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId: "p1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("UNAUTHORIZED");
  });

  it("returns 403 when authenticated user lacks MANAGE_DROPS permission", async () => {
    vi.mocked(requireAdminSession).mockRejectedValue(
      new AdminAuthError(
        "FORBIDDEN",
        "Missing required admin permission: MANAGE_DROPS.",
        403,
      ),
    );

    const req = new Request("http://localhost:3000/api/drops/emergency-close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId: "p1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("FORBIDDEN");
  });

  it("returns 400 when periodId is missing from request body", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);

    const req = new Request("http://localhost:3000/api/drops/emergency-close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "No period id provided" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_INPUT");
    expect(body.message).toContain("periodId is required");
  });

  it("returns 400 on malformed JSON payload", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);

    const req = new Request("http://localhost:3000/api/drops/emergency-close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ broken json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("MALFORMED_JSON");
  });

  it("returns 200 on successful emergency close with optional reason", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);
    const now = new Date();
    vi.mocked(emergencyCloseDropPeriod).mockResolvedValue({
      success: true,
      periodId: "p1",
      dropId: "d1",
      status: "CANCELLED",
      closedAt: now,
      reason: "Suspected exploit in drop window",
      cancelledPendingClaimsCount: 2,
      auditLogId: "audit-123",
    });

    const req = new Request("http://localhost:3000/api/drops/emergency-close", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "203.0.113.195",
        "user-agent": "OpsBrowser/2.0",
      },
      body: JSON.stringify({
        dropId: "d1",
        periodId: "p1",
        reason: "Suspected exploit in drop window",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe("CANCELLED");
    expect(body.reason).toBe("Suspected exploit in drop window");
    expect(body.cancelledPendingClaimsCount).toBe(2);

    expect(emergencyCloseDropPeriod).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        dropId: "d1",
        periodId: "p1",
        reason: "Suspected exploit in drop window",
        adminUserId: "admin_user_1",
        ipAddress: "203.0.113.195",
        userAgent: "OpsBrowser/2.0",
      }),
    );
  });

  it("returns 200 on successful emergency close without reason", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);
    const now = new Date();
    vi.mocked(emergencyCloseDropPeriod).mockResolvedValue({
      success: true,
      periodId: "p1",
      dropId: "d1",
      status: "CANCELLED",
      closedAt: now,
      reason: null,
      cancelledPendingClaimsCount: 0,
      auditLogId: "audit-124",
    });

    const req = new Request("http://localhost:3000/api/drops/emergency-close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId: "p1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.reason).toBeNull();
  });

  it("maps repeated emergency close to 409 PERIOD_ALREADY_CLOSED", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);
    vi.mocked(emergencyCloseDropPeriod).mockRejectedValue(
      new DropClaimError(
        "PERIOD_ALREADY_CLOSED",
        "Drop period is already closed or cancelled.",
        409,
      ),
    );

    const req = new Request("http://localhost:3000/api/drops/emergency-close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId: "p1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("PERIOD_ALREADY_CLOSED");
  });

  it("handles admin alias route /api/admin/drops/emergency-close identically", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);
    vi.mocked(emergencyCloseDropPeriod).mockResolvedValue({
      success: true,
      periodId: "p1",
      dropId: "d1",
      status: "CANCELLED",
      closedAt: new Date(),
      reason: "Admin alias test",
      cancelledPendingClaimsCount: 0,
      auditLogId: "audit-125",
    });

    const req = new Request("http://localhost:3000/api/admin/drops/emergency-close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId: "p1", reason: "Admin alias test" }),
    });

    const res = await ADMIN_POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.reason).toBe("Admin alias test");
  });
});
