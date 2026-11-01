import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  GET,
  POST,
  PUT,
  DELETE,
  PATCH,
  HEAD,
  OPTIONS,
} from "@/app/api/admin/whitelist/export/summary/route";

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

vi.mock("@/server/admin/opensea-export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/admin/opensea-export")>();
  return {
    ...actual,
    getPreExportAuditSummary: vi.fn(),
  };
});

import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import {
  getPreExportAuditSummary,
  OpenSeaExportError,
} from "@/server/admin/opensea-export";

describe("Pre-Export Audit Summary API Route (GET /api/admin/whitelist/export/summary)", () => {
  const validAdminSession = {
    sessionId: "sess_admin_1",
    userId: "admin_user_1",
    address: "0xadmin1",
    adminRole: {
      id: "role_1",
      userId: "admin_user_1",
      roleType: "SUPER_ADMIN",
      permissions: ["MANAGE_WL"],
    },
  };

  const sampleSummary = {
    program: {
      id: "prog_genesis",
      slug: "chimphood-genesis",
      name: "ChimpHood Genesis",
      status: "FINALIZED",
      totalSlots: 500,
      allocatedSlotsCount: 450,
    },
    gtd: {
      totalSlots: 500,
      allocatedCount: 450,
      vacantCount: 50,
      flaggedCount: 10,
      walletsCount: 450,
    },
    fcfs: {
      totalDirectoryEntries: 1200,
      bannedOrDisqualifiedCount: 15,
      inactiveDirectoryEntriesCount: 30,
      underQualifiedCount: 1000,
      alreadyGtdCount: 27,
      qualifiedReadyCount: 128,
      accountingBalanceCheck: true,
    },
    disjointVerification: {
      disjointSetVerified: true,
      overlappingWalletsCount: 0,
      overlappingWallets: [],
    },
    timestamp: "2026-11-01T03:00:00.000Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication & RBAC Enforcement", () => {
    it("returns 401 UNAUTHORIZED when no valid admin session exists", async () => {
      (requireAdminSession as any).mockRejectedValueOnce(
        new AdminAuthError("UNAUTHORIZED", "Authentication required.", 401),
      );

      const request = new Request("http://localhost/api/admin/whitelist/export/summary");
      const res = await GET(request);
      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error).toBe("UNAUTHORIZED");
    });

    it("returns 403 FORBIDDEN when user lacks MANAGE_WL permission", async () => {
      (requireAdminSession as any).mockRejectedValueOnce(
        new AdminAuthError("FORBIDDEN", "Missing required permission: MANAGE_WL.", 403),
      );

      const request = new Request("http://localhost/api/admin/whitelist/export/summary");
      const res = await GET(request);
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body.error).toBe("FORBIDDEN");
    });

    it("verifies requireAdminSession is called with MANAGE_WL permission", async () => {
      (requireAdminSession as any).mockResolvedValueOnce(validAdminSession);
      (getPreExportAuditSummary as any).mockResolvedValueOnce(sampleSummary);

      const request = new Request("http://localhost/api/admin/whitelist/export/summary");
      await GET(request);

      expect(requireAdminSession).toHaveBeenCalledWith(expect.anything(), "MANAGE_WL");
    });
  });

  describe("Summary Retrieval & Parameter Forwarding", () => {
    it("returns 200 OK with audit summary data and no-store cache header", async () => {
      (requireAdminSession as any).mockResolvedValueOnce(validAdminSession);
      (getPreExportAuditSummary as any).mockResolvedValueOnce(sampleSummary);

      const request = new Request(
        "http://localhost/api/admin/whitelist/export/summary?programId=prog_genesis",
      );
      const res = await GET(request);

      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0");

      const body = await res.json();
      expect(body).toEqual(sampleSummary);
      expect(getPreExportAuditSummary).toHaveBeenCalledWith({
        prisma: expect.anything(),
        programIdOrSlug: "prog_genesis",
      });
    });

    it("forwards slug or program query param when programId is omitted", async () => {
      (requireAdminSession as any).mockResolvedValueOnce(validAdminSession);
      (getPreExportAuditSummary as any).mockResolvedValueOnce(sampleSummary);

      const request = new Request(
        "http://localhost/api/admin/whitelist/export/summary?slug=chimphood-genesis",
      );
      const res = await GET(request);

      expect(res.status).toBe(200);
      expect(getPreExportAuditSummary).toHaveBeenCalledWith({
        prisma: expect.anything(),
        programIdOrSlug: "chimphood-genesis",
      });
    });

    it("maps OpenSeaExportError properly to HTTP status and error code", async () => {
      (requireAdminSession as any).mockResolvedValueOnce(validAdminSession);
      (getPreExportAuditSummary as any).mockRejectedValueOnce(
        new OpenSeaExportError(
          "AMBIGUOUS_PROGRAM_SELECTION",
          "Multiple whitelist programs exist. Please specify 'programId' or 'slug'.",
          400,
        ),
      );

      const request = new Request("http://localhost/api/admin/whitelist/export/summary");
      const res = await GET(request);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("AMBIGUOUS_PROGRAM_SELECTION");
      expect(body.message).toContain("Multiple whitelist programs exist");
    });

    it("maps 404 PROGRAM_NOT_FOUND error", async () => {
      (requireAdminSession as any).mockResolvedValueOnce(validAdminSession);
      (getPreExportAuditSummary as any).mockRejectedValueOnce(
        new OpenSeaExportError("PROGRAM_NOT_FOUND", "Program not found.", 404),
      );

      const request = new Request(
        "http://localhost/api/admin/whitelist/export/summary?programId=nonexistent",
      );
      const res = await GET(request);

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("PROGRAM_NOT_FOUND");
    });

    it("returns 500 on unexpected exceptions", async () => {
      (requireAdminSession as any).mockResolvedValueOnce(validAdminSession);
      (getPreExportAuditSummary as any).mockRejectedValueOnce(new Error("Database crash"));

      const request = new Request("http://localhost/api/admin/whitelist/export/summary");
      const res = await GET(request);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("SERVER_ERROR");
    });
  });

  describe("HTTP Method Not Allowed Guards", () => {
    it("rejects non-GET methods with 405 Method Not Allowed and Allow: GET header", async () => {
      const methods = [
        { handler: POST, name: "POST" },
        { handler: PUT, name: "PUT" },
        { handler: DELETE, name: "DELETE" },
        { handler: PATCH, name: "PATCH" },
        { handler: HEAD, name: "HEAD" },
        { handler: OPTIONS, name: "OPTIONS" },
      ];

      for (const { handler, name } of methods) {
        const res = await handler();
        expect(res.status).toBe(405);
        expect(res.headers.get("Allow")).toBe("GET");
        const body = await res.json();
        expect(body.error).toBe("Method not allowed. Use GET.");
      }
    });
  });
});
