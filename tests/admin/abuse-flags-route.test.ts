import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  GET as LIST_GET,
  POST as LIST_POST,
  PUT as LIST_PUT,
  DELETE as LIST_DELETE,
  PATCH as LIST_PATCH,
  HEAD as LIST_HEAD,
  OPTIONS as LIST_OPTIONS,
} from "@/app/api/admin/abuse-flags/route";
import {
  GET as DETAIL_GET,
  PATCH as DETAIL_PATCH,
  POST as DETAIL_POST,
  PUT as DETAIL_PUT,
  DELETE as DETAIL_DELETE,
  HEAD as DETAIL_HEAD,
  OPTIONS as DETAIL_OPTIONS,
} from "@/app/api/admin/abuse-flags/[id]/route";

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

vi.mock("@/server/admin/abuse-flags", () => {
  class MockAdminAbuseFlagError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number = 400) {
      super(message);
      this.name = "AdminAbuseFlagError";
      this.code = code;
      this.status = status;
    }
  }

  return {
    listAbuseFlags: vi.fn(),
    getAbuseFlagById: vi.fn(),
    updateAbuseFlag: vi.fn(),
    AdminAbuseFlagError: MockAdminAbuseFlagError,
  };
});

import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import {
  listAbuseFlags,
  getAbuseFlagById,
  updateAbuseFlag,
  AdminAbuseFlagError,
} from "@/server/admin/abuse-flags";
import {
  adminListAbuseFlags,
  adminGetAbuseFlag,
  adminUpdateAbuseFlag,
} from "@/lib/admin/client";

describe("DEC-012 Stage 4: Admin Abuse Flags API & Authorization", () => {
  const moderatorSession = {
    sessionId: "sess_mod_1",
    userId: "mod_user_1",
    address: "0x2222222222222222222222222222222222222222",
    adminRole: {
      id: "role_mod_1",
      userId: "mod_user_1",
      roleType: "MODERATOR",
      permissions: ["REVIEW_FLAGS"],
    },
  };

  const superAdminSession = {
    sessionId: "sess_super_1",
    userId: "super_user_1",
    address: "0x3333333333333333333333333333333333333333",
    adminRole: {
      id: "role_super_1",
      userId: "super_user_1",
      roleType: "SUPER_ADMIN",
      permissions: ["*"],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/admin/abuse-flags (List Endpoint)", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AdminAuthError("UNAUTHORIZED", "Authentication required.", 401),
      );

      const req = new Request("http://localhost/api/admin/abuse-flags");
      const res = await LIST_GET(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("UNAUTHORIZED");
    });

    it("returns 403 when role lacks REVIEW_FLAGS permission", async () => {
      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AdminAuthError(
          "FORBIDDEN",
          "Missing required admin permission: REVIEW_FLAGS.",
          403,
        ),
      );

      const req = new Request("http://localhost/api/admin/abuse-flags");
      const res = await LIST_GET(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("FORBIDDEN");
    });

    it("returns 200 with flags when user is MODERATOR with REVIEW_FLAGS", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(moderatorSession as any);
      vi.mocked(listAbuseFlags).mockResolvedValueOnce({
        flags: [
          {
            id: "flag-1",
            userId: "u-1",
            flagType: "SYBIL_WALLET_CLUSTER" as any,
            severity: "HIGH" as any,
            details: { clusterSize: 5 },
            status: "OPEN" as any,
            reviewedById: null,
            reviewedAt: null,
            resolutionNotes: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      });

      const req = new Request(
        "http://localhost/api/admin/abuse-flags?status=OPEN&flagType=SYBIL_WALLET_CLUSTER&limit=10&offset=0",
      );
      const res = await LIST_GET(req);
      expect(res.status).toBe(200);

      expect(requireAdminSession).toHaveBeenCalledWith(expect.anything(), "REVIEW_FLAGS");
      expect(listAbuseFlags).toHaveBeenCalledWith(expect.anything(), {
        status: "OPEN",
        flagType: "SYBIL_WALLET_CLUSTER",
        severity: undefined,
        userId: undefined,
        limit: 10,
        offset: 0,
      });

      const json = await res.json();
      expect(json.total).toBe(1);
      expect(json.flags).toHaveLength(1);
      expect(json.flags[0].id).toBe("flag-1");
    });

    it("returns 200 for SUPER_ADMIN", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(superAdminSession as any);
      vi.mocked(listAbuseFlags).mockResolvedValueOnce({
        flags: [],
        total: 0,
        limit: 50,
        offset: 0,
      });

      const req = new Request("http://localhost/api/admin/abuse-flags");
      const res = await LIST_GET(req);
      expect(res.status).toBe(200);
    });

    it("returns 400 when invalid filter parameter is supplied", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(moderatorSession as any);
      vi.mocked(listAbuseFlags).mockRejectedValueOnce(
        new AdminAbuseFlagError("INVALID_FILTER", "Invalid flagType.", 400),
      );

      const req = new Request("http://localhost/api/admin/abuse-flags?flagType=INVALID");
      const res = await LIST_GET(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_FILTER");
    });

    it("returns 405 Method Not Allowed for non-GET methods", async () => {
      for (const handler of [
        LIST_POST,
        LIST_PUT,
        LIST_DELETE,
        LIST_PATCH,
        LIST_HEAD,
        LIST_OPTIONS,
      ]) {
        const res = await handler();
        expect(res.status).toBe(405);
        expect(res.headers.get("Allow")).toBe("GET");
      }
    });
  });

  describe("GET /api/admin/abuse-flags/[id]", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AdminAuthError("UNAUTHORIZED", "Authentication required.", 401),
      );

      const req = new Request("http://localhost/api/admin/abuse-flags/flag-1");
      const res = await DETAIL_GET(req, { params: Promise.resolve({ id: "flag-1" }) });
      expect(res.status).toBe(401);
    });

    it("returns 404 when flag is not found", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(moderatorSession as any);
      vi.mocked(getAbuseFlagById).mockRejectedValueOnce(
        new AdminAbuseFlagError("FLAG_NOT_FOUND", "Abuse flag not found.", 404),
      );

      const req = new Request("http://localhost/api/admin/abuse-flags/flag-not-found");
      const res = await DETAIL_GET(req, {
        params: Promise.resolve({ id: "flag-not-found" }),
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("FLAG_NOT_FOUND");
    });

    it("returns 200 with flag details when found", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(moderatorSession as any);
      vi.mocked(getAbuseFlagById).mockResolvedValueOnce({
        id: "flag-1",
        userId: "target-user-1",
        flagType: "SYBIL_WALLET_CLUSTER" as any,
        severity: "HIGH" as any,
        details: { clusterSize: 5 },
        status: "OPEN" as any,
        reviewedById: null,
        reviewedAt: null,
        resolutionNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new Request("http://localhost/api/admin/abuse-flags/flag-1");
      const res = await DETAIL_GET(req, { params: Promise.resolve({ id: "flag-1" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.flag.id).toBe("flag-1");
    });
  });

  describe("PATCH /api/admin/abuse-flags/[id] (Status Update Endpoint)", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AdminAuthError("UNAUTHORIZED", "Authentication required.", 401),
      );

      const req = new Request("http://localhost/api/admin/abuse-flags/flag-1", {
        method: "PATCH",
        body: JSON.stringify({ status: "UNDER_REVIEW" }),
      });
      const res = await DETAIL_PATCH(req, {
        params: Promise.resolve({ id: "flag-1" }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 403 when user lacks REVIEW_FLAGS permission", async () => {
      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AdminAuthError(
          "FORBIDDEN",
          "Missing required admin permission: REVIEW_FLAGS.",
          403,
        ),
      );

      const req = new Request("http://localhost/api/admin/abuse-flags/flag-1", {
        method: "PATCH",
        body: JSON.stringify({ status: "UNDER_REVIEW" }),
      });
      const res = await DETAIL_PATCH(req, {
        params: Promise.resolve({ id: "flag-1" }),
      });
      expect(res.status).toBe(403);
    });

    it("returns 400 when body is malformed JSON", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(moderatorSession as any);

      const req = new Request("http://localhost/api/admin/abuse-flags/flag-1", {
        method: "PATCH",
        body: "invalid-json{",
      });
      const res = await DETAIL_PATCH(req, {
        params: Promise.resolve({ id: "flag-1" }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("MALFORMED_JSON");
    });

    it("returns 400 when status is missing in request body", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(moderatorSession as any);

      const req = new Request("http://localhost/api/admin/abuse-flags/flag-1", {
        method: "PATCH",
        body: JSON.stringify({ resolutionNotes: "Only notes without status" }),
      });
      const res = await DETAIL_PATCH(req, {
        params: Promise.resolve({ id: "flag-1" }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("MISSING_STATUS");
    });

    it("returns 400 when status has invalid enum value", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(moderatorSession as any);
      vi.mocked(updateAbuseFlag).mockRejectedValueOnce(
        new AdminAbuseFlagError("INVALID_STATUS", "Invalid status.", 400),
      );

      const req = new Request("http://localhost/api/admin/abuse-flags/flag-1", {
        method: "PATCH",
        body: JSON.stringify({ status: "BOGUS_STATUS" }),
      });
      const res = await DETAIL_PATCH(req, {
        params: Promise.resolve({ id: "flag-1" }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_STATUS");
    });

    it("returns 404 when flag ID is not found", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(moderatorSession as any);
      vi.mocked(updateAbuseFlag).mockRejectedValueOnce(
        new AdminAbuseFlagError("FLAG_NOT_FOUND", "Abuse flag not found.", 404),
      );

      const req = new Request("http://localhost/api/admin/abuse-flags/flag-999", {
        method: "PATCH",
        body: JSON.stringify({ status: "DISMISSED" }),
      });
      const res = await DETAIL_PATCH(req, {
        params: Promise.resolve({ id: "flag-999" }),
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("FLAG_NOT_FOUND");
    });

    it("returns 200 when MODERATOR successfully updates status", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(moderatorSession as any);
      vi.mocked(updateAbuseFlag).mockResolvedValueOnce({
        success: true,
        flag: {
          id: "flag-1",
          userId: "target-user-1",
          flagType: "SYBIL_WALLET_CLUSTER" as any,
          severity: "HIGH" as any,
          status: "CONFIRMED_ACTION_TAKEN" as any,
          details: null,
          resolutionNotes: "Sybil cluster verified. Manual ban issued separately.",
          reviewedById: "mod_user_1",
          reviewedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        auditLogId: "audit-123",
      });

      const req = new Request("http://localhost/api/admin/abuse-flags/flag-1", {
        method: "PATCH",
        headers: {
          "x-real-ip": "203.0.113.195",
          "user-agent": "ModPortal/2.0",
        },
        body: JSON.stringify({
          status: "CONFIRMED_ACTION_TAKEN",
          resolutionNotes: "Sybil cluster verified. Manual ban issued separately.",
        }),
      });

      const res = await DETAIL_PATCH(req, {
        params: Promise.resolve({ id: "flag-1" }),
      });
      expect(res.status).toBe(200);

      expect(updateAbuseFlag).toHaveBeenCalledWith(expect.anything(), {
        flagId: "flag-1",
        adminUserId: "mod_user_1",
        status: "CONFIRMED_ACTION_TAKEN",
        resolutionNotes: "Sybil cluster verified. Manual ban issued separately.",
        ipAddress: "203.0.113.195",
        userAgent: "ModPortal/2.0",
      });

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.flag.status).toBe("CONFIRMED_ACTION_TAKEN");
      expect(json.auditLogId).toBe("audit-123");
    });

    it("returns 405 Method Not Allowed on unsupported methods", async () => {
      for (const handler of [
        DETAIL_POST,
        DETAIL_PUT,
        DETAIL_DELETE,
        DETAIL_HEAD,
        DETAIL_OPTIONS,
      ]) {
        const res = await handler();
        expect(res.status).toBe(405);
        expect(res.headers.get("Allow")).toBe("GET, PATCH");
      }
    });
  });

  describe("lib/admin/client.ts helper functions", () => {
    it("adminListAbuseFlags calls fetch with correct query parameters", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ flags: [], total: 0, limit: 10, offset: 5 }),
      });
      globalThis.fetch = mockFetch;

      const result = await adminListAbuseFlags({
        status: "OPEN",
        severity: "HIGH",
        limit: 10,
        offset: 5,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/abuse-flags?status=OPEN&severity=HIGH&limit=10&offset=5",
        expect.objectContaining({ method: "GET" }),
      );
      expect(result.total).toBe(0);
    });

    it("adminGetAbuseFlag calls fetch with flagId in url", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ flag: { id: "flag-1" } }),
      });
      globalThis.fetch = mockFetch;

      const result = await adminGetAbuseFlag("flag-1");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/abuse-flags/flag-1",
        expect.objectContaining({ method: "GET" }),
      );
      expect(result.flag.id).toBe("flag-1");
    });

    it("adminUpdateAbuseFlag calls PATCH with body", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          flag: { id: "flag-1", status: "DISMISSED" },
        }),
      });
      globalThis.fetch = mockFetch;

      const result = await adminUpdateAbuseFlag({
        flagId: "flag-1",
        status: "DISMISSED",
        resolutionNotes: "False positive",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/abuse-flags/flag-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            status: "DISMISSED",
            resolutionNotes: "False positive",
          }),
        }),
      );
      expect(result.success).toBe(true);
    });
  });
});
