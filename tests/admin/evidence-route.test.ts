import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  GET as EVIDENCE_LIST_GET,
  POST as EVIDENCE_LIST_POST,
  PUT as EVIDENCE_LIST_PUT,
  DELETE as EVIDENCE_LIST_DELETE,
  PATCH as EVIDENCE_LIST_PATCH,
  HEAD as EVIDENCE_LIST_HEAD,
  OPTIONS as EVIDENCE_LIST_OPTIONS,
} from "@/app/api/admin/evidence/route";
import {
  POST as REVIEW_POST,
  GET as REVIEW_GET,
  PUT as REVIEW_PUT,
  DELETE as REVIEW_DELETE,
  PATCH as REVIEW_PATCH,
  HEAD as REVIEW_HEAD,
  OPTIONS as REVIEW_OPTIONS,
} from "@/app/api/admin/evidence/[id]/review/route";
import {
  GET as EVIDENCE_DETAIL_GET,
  POST as EVIDENCE_DETAIL_POST,
  PUT as EVIDENCE_DETAIL_PUT,
  DELETE as EVIDENCE_DETAIL_DELETE,
  PATCH as EVIDENCE_DETAIL_PATCH,
  HEAD as EVIDENCE_DETAIL_HEAD,
  OPTIONS as EVIDENCE_DETAIL_OPTIONS,
} from "@/app/api/admin/evidence/[id]/route";

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

vi.mock("@/server/admin/evidence", () => {
  class MockAdminEvidenceError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number = 400) {
      super(message);
      this.name = "AdminEvidenceError";
      this.code = code;
      this.status = status;
    }
  }

  return {
    reviewEvidence: vi.fn(),
    listAdminEvidence: vi.fn(),
    getAdminEvidenceById: vi.fn(),
    AdminEvidenceError: MockAdminEvidenceError,
  };
});

import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import {
  reviewEvidence,
  listAdminEvidence,
  getAdminEvidenceById,
  AdminEvidenceError,
} from "@/server/admin/evidence";
import {
  adminListEvidence,
  adminGetEvidence,
  adminReviewEvidence,
} from "@/lib/admin/client";

describe("Task 4-D Evidence Review API Routes", () => {
  const validAdminSession = {
    sessionId: "sess_admin_1",
    userId: "admin_user_1",
    address: "0x1111111111111111111111111111111111111111",
    adminRole: {
      id: "role_1",
      userId: "admin_user_1",
      roleType: "ADMIN",
      permissions: ["REVIEW_EVIDENCE"],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. Method Not Allowed (405) Tests
  // ---------------------------------------------------------------------------
  describe("HTTP 405 Method Not Allowed Enforcement", () => {
    it("returns 405 with Allow: GET for non-GET methods on /api/admin/evidence", async () => {
      const methods = [
        EVIDENCE_LIST_POST,
        EVIDENCE_LIST_PUT,
        EVIDENCE_LIST_DELETE,
        EVIDENCE_LIST_PATCH,
        EVIDENCE_LIST_HEAD,
        EVIDENCE_LIST_OPTIONS,
      ];

      for (const handler of methods) {
        const res = await handler();
        expect(res.status).toBe(405);
        expect(res.headers.get("Allow")).toBe("GET");
        const body = await res.json();
        expect(body.error).toContain("Method not allowed. Use GET.");
      }
    });

    it("returns 405 with Allow: POST for non-POST methods on /api/admin/evidence/[id]/review", async () => {
      const methods = [
        REVIEW_GET,
        REVIEW_PUT,
        REVIEW_DELETE,
        REVIEW_PATCH,
        REVIEW_HEAD,
        REVIEW_OPTIONS,
      ];

      for (const handler of methods) {
        const res = await handler();
        expect(res.status).toBe(405);
        expect(res.headers.get("Allow")).toBe("POST");
        const body = await res.json();
        expect(body.error).toContain("Method not allowed. Use POST.");
      }
    });

    it("returns 405 with Allow: GET for non-GET methods on /api/admin/evidence/[id]", async () => {
      const methods = [
        EVIDENCE_DETAIL_POST,
        EVIDENCE_DETAIL_PUT,
        EVIDENCE_DETAIL_DELETE,
        EVIDENCE_DETAIL_PATCH,
        EVIDENCE_DETAIL_HEAD,
        EVIDENCE_DETAIL_OPTIONS,
      ];

      for (const handler of methods) {
        const res = await handler();
        expect(res.status).toBe(405);
        expect(res.headers.get("Allow")).toBe("GET");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Authentication & Authorization Enforcement
  // ---------------------------------------------------------------------------
  describe("Authentication & Authorization Enforcement", () => {
    it("calls requireAdminSession with prisma and REVIEW_EVIDENCE permission", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(listAdminEvidence).mockResolvedValueOnce({
        submissions: [],
        total: 0,
        limit: 50,
        offset: 0,
      });

      const req = new Request("http://localhost:3000/api/admin/evidence", {
        method: "GET",
      });

      const res = await EVIDENCE_LIST_GET(req);
      expect(res.status).toBe(200);
      expect(requireAdminSession).toHaveBeenCalledWith(
        expect.anything(),
        "REVIEW_EVIDENCE",
      );
    });

    it("returns 401 UNAUTHORIZED when no session exists", async () => {
      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AdminAuthError("UNAUTHORIZED", "Authentication required.", 401),
      );

      const req = new Request("http://localhost:3000/api/admin/evidence", {
        method: "GET",
      });

      const res = await EVIDENCE_LIST_GET(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("UNAUTHORIZED");
    });

    it("returns 403 FORBIDDEN when user lacks REVIEW_EVIDENCE permission", async () => {
      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AdminAuthError(
          "FORBIDDEN",
          "Missing required admin permission: REVIEW_EVIDENCE.",
          403,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/evidence", {
        method: "GET",
      });

      const res = await EVIDENCE_LIST_GET(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("FORBIDDEN");
      expect(body.message).toContain(
        "Missing required admin permission: REVIEW_EVIDENCE.",
      );
    });

    it("returns 401 when unexpected non-AdminAuthError occurs in requireAdminSession", async () => {
      vi.mocked(requireAdminSession).mockRejectedValueOnce(new Error("DB error"));

      const req = new Request("http://localhost:3000/api/admin/evidence", {
        method: "GET",
      });

      const res = await EVIDENCE_LIST_GET(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("UNAUTHORIZED");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. POST /api/admin/evidence/[id]/review Tests
  // ---------------------------------------------------------------------------
  describe("POST /api/admin/evidence/[id]/review", () => {
    it("returns 413 when request body exceeds maximum allowed size", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);

      // Create body > 8KB
      const hugeString = "X".repeat(9000);
      const req = new Request("http://localhost:3000/api/admin/evidence/ev_1/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: hugeString }),
      });

      const res = await REVIEW_POST(req, {
        params: Promise.resolve({ id: "ev_1" }),
      });

      expect(res.status).toBe(413);
      const body = await res.json();
      expect(body.error).toBe("too_large");
    });

    it("returns 400 MALFORMED_JSON when request body is invalid JSON", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);

      const req = new Request("http://localhost:3000/api/admin/evidence/ev_1/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ bad json",
      });

      const res = await REVIEW_POST(req, {
        params: Promise.resolve({ id: "ev_1" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("MALFORMED_JSON");
    });

    it("returns 400 INVALID_INPUT when request body is an array or primitive", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);

      const req = new Request("http://localhost:3000/api/admin/evidence/ev_1/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(["APPROVED"]),
      });

      const res = await REVIEW_POST(req, {
        params: Promise.resolve({ id: "ev_1" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("INVALID_INPUT");
    });

    it("returns 422 when reviewEvidence throws INVALID_STATUS", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(reviewEvidence).mockRejectedValueOnce(
        new AdminEvidenceError("INVALID_STATUS", "Invalid status 'MAYBE'.", 422),
      );

      const req = new Request("http://localhost:3000/api/admin/evidence/ev_1/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "MAYBE" }),
      });

      const res = await REVIEW_POST(req, {
        params: Promise.resolve({ id: "ev_1" }),
      });

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBe("INVALID_STATUS");
    });

    it("returns 404 when reviewEvidence throws SUBMISSION_NOT_FOUND", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(reviewEvidence).mockRejectedValueOnce(
        new AdminEvidenceError(
          "SUBMISSION_NOT_FOUND",
          "Evidence submission not found.",
          404,
        ),
      );

      const req = new Request(
        "http://localhost:3000/api/admin/evidence/missing_ev/review",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "APPROVED" }),
        },
      );

      const res = await REVIEW_POST(req, {
        params: Promise.resolve({ id: "missing_ev" }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("SUBMISSION_NOT_FOUND");
    });

    it("returns 409 when reviewEvidence throws SUBMISSION_ALREADY_REVIEWED", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(reviewEvidence).mockRejectedValueOnce(
        new AdminEvidenceError(
          "SUBMISSION_ALREADY_REVIEWED",
          "Evidence submission has already been reviewed.",
          409,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/evidence/ev_1/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REJECTED" }),
      });

      const res = await REVIEW_POST(req, {
        params: Promise.resolve({ id: "ev_1" }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe("SUBMISSION_ALREADY_REVIEWED");
    });

    it("returns 200 and passes reviewerNotes and client IP on successful review", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(reviewEvidence).mockResolvedValueOnce({
        success: true,
        submission: {
          id: "ev_1",
          userId: "user_user1",
          taskId: "task_1",
          taskProgressId: "tp_1",
          submissionType: "URL",
          payload: "https://x.com/tweet",
          status: "APPROVED",
          reviewerId: "admin_user_1",
          reviewerNotes: "Looks great",
          reviewedAt: "2026-10-23T15:00:00.000Z",
          createdAt: "2026-10-23T10:00:00.000Z",
          updatedAt: "2026-10-23T15:00:00.000Z",
        },
        taskProgress: {
          id: "tp_1",
          userId: "user_user1",
          versionId: "ver_1",
          taskId: "task_1",
          status: "VERIFIED",
          verifiedAt: "2026-10-23T15:00:00.000Z",
          completedAt: "2026-10-23T15:00:00.000Z",
          createdAt: "2026-10-23T10:00:00.000Z",
          updatedAt: "2026-10-23T15:00:00.000Z",
        },
        auditLogId: "audit_123",
      });

      const req = new Request("http://localhost:3000/api/admin/evidence/ev_1/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "198.51.100.42, 10.0.0.1",
          "user-agent": "AdminBrowser/1.0",
        },
        body: JSON.stringify({
          status: "APPROVED",
          reviewerNotes: "Looks great",
        }),
      });

      const res = await REVIEW_POST(req, {
        params: Promise.resolve({ id: "ev_1" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.submission.status).toBe("APPROVED");
      expect(data.taskProgress.status).toBe("VERIFIED");

      expect(reviewEvidence).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          submissionId: "ev_1",
          adminUserId: "admin_user_1",
          status: "APPROVED",
          reviewerNotes: "Looks great",
          ipAddress: "198.51.100.42",
          userAgent: "AdminBrowser/1.0",
        }),
      );
    });

    it("returns 500 when unexpected error occurs during review", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(reviewEvidence).mockRejectedValueOnce(new Error("Unexpected crash"));

      const req = new Request("http://localhost:3000/api/admin/evidence/ev_1/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "APPROVED" }),
      });

      const res = await REVIEW_POST(req, {
        params: Promise.resolve({ id: "ev_1" }),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("SERVER_ERROR");
    });
  });

  // ---------------------------------------------------------------------------
  // 4. GET /api/admin/evidence Tests
  // ---------------------------------------------------------------------------
  describe("GET /api/admin/evidence", () => {
    it("returns 200 with list and parsed query params", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(listAdminEvidence).mockResolvedValueOnce({
        submissions: [],
        total: 0,
        limit: 10,
        offset: 5,
      });

      const req = new Request(
        "http://localhost:3000/api/admin/evidence?status=PENDING_REVIEW&taskId=t_1&userId=u_1&limit=10&offset=5",
        { method: "GET" },
      );

      const res = await EVIDENCE_LIST_GET(req);
      expect(res.status).toBe(200);

      expect(listAdminEvidence).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: "PENDING_REVIEW",
          taskId: "t_1",
          userId: "u_1",
          limit: 10,
          offset: 5,
        }),
      );
    });

    it("returns 422 when listAdminEvidence throws INVALID_STATUS", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(listAdminEvidence).mockRejectedValueOnce(
        new AdminEvidenceError("INVALID_STATUS", "Invalid status filter", 422),
      );

      const req = new Request(
        "http://localhost:3000/api/admin/evidence?status=BAD_STATUS",
        { method: "GET" },
      );

      const res = await EVIDENCE_LIST_GET(req);
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBe("INVALID_STATUS");
    });

    it("returns 500 when unexpected error occurs during listing", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(listAdminEvidence).mockRejectedValueOnce(
        new Error("Database disconnected"),
      );

      const req = new Request("http://localhost:3000/api/admin/evidence", {
        method: "GET",
      });

      const res = await EVIDENCE_LIST_GET(req);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("SERVER_ERROR");
    });
  });

  // ---------------------------------------------------------------------------
  // 5. GET /api/admin/evidence/[id] Tests
  // ---------------------------------------------------------------------------
  describe("GET /api/admin/evidence/[id]", () => {
    it("returns 200 with submission detail", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(getAdminEvidenceById).mockResolvedValueOnce({
        id: "ev_1",
        userId: "user_1",
        taskId: "task_1",
        taskProgressId: "tp_1",
        submissionType: "URL",
        payload: "https://proof.example",
        status: "PENDING_REVIEW",
        reviewerId: null,
        reviewerNotes: null,
        reviewedAt: null,
        createdAt: "2026-10-23T10:00:00.000Z",
        updatedAt: "2026-10-23T10:00:00.000Z",
      });

      const req = new Request("http://localhost:3000/api/admin/evidence/ev_1", {
        method: "GET",
      });

      const res = await EVIDENCE_DETAIL_GET(req, {
        params: Promise.resolve({ id: "ev_1" }),
      });

      expect(res.status).toBe(200);
      expect(getAdminEvidenceById).toHaveBeenCalledWith(expect.anything(), "ev_1");
    });

    it("returns 404 when submission is not found", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce(validAdminSession as any);
      vi.mocked(getAdminEvidenceById).mockRejectedValueOnce(
        new AdminEvidenceError("SUBMISSION_NOT_FOUND", "Submission not found", 404),
      );

      const req = new Request("http://localhost:3000/api/admin/evidence/missing", {
        method: "GET",
      });

      const res = await EVIDENCE_DETAIL_GET(req, {
        params: Promise.resolve({ id: "missing" }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("SUBMISSION_NOT_FOUND");
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Client Helpers (lib/admin/client.ts) Tests
  // ---------------------------------------------------------------------------
  describe("Client Helpers (lib/admin/client.ts)", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      globalThis.fetch = vi.fn();
    });

    it("adminListEvidence formats query parameters and handles successful response", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ submissions: [], total: 0 }),
      } as Response);

      const result = await adminListEvidence({
        status: "PENDING_REVIEW",
        limit: 10,
        offset: 0,
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/admin/evidence?status=PENDING_REVIEW&limit=10&offset=0",
        expect.objectContaining({ method: "GET" }),
      );
      expect(result).toEqual({ submissions: [], total: 0 });
    });

    it("adminListEvidence throws error on non-200 response", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: "Unauthorized access" }),
      } as Response);

      await expect(adminListEvidence()).rejects.toThrow("Unauthorized access");
    });

    it("adminGetEvidence encodes id and fetches evidence detail", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "ev_123" }),
      } as Response);

      const result = await adminGetEvidence("ev/123");

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/admin/evidence/ev%2F123",
        expect.objectContaining({ method: "GET" }),
      );
      expect(result).toEqual({ id: "ev_123" });
    });

    it("adminReviewEvidence posts review payload to review endpoint", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      const result = await adminReviewEvidence("ev_123", {
        status: "APPROVED",
        reviewerNotes: "Valid evidence",
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/admin/evidence/ev_123/review",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            status: "APPROVED",
            reviewerNotes: "Valid evidence",
          }),
        }),
      );
      expect(result).toEqual({ success: true });
    });

    it("adminReviewEvidence throws error on rejection", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "SUBMISSION_ALREADY_REVIEWED" }),
      } as Response);

      await expect(adminReviewEvidence("ev_123", { status: "REJECTED" })).rejects.toThrow(
        "SUBMISSION_ALREADY_REVIEWED",
      );
    });
  });
});
