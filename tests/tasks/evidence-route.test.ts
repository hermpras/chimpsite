import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  POST,
  GET,
  PUT,
  DELETE,
  PATCH,
  HEAD,
  OPTIONS,
} from "@/app/api/tasks/[id]/evidence/route";
import * as evidenceService from "@/server/tasks/evidence";
import { TaskEvidenceError } from "@/server/tasks/evidence";

const { mockAdminRoleFindUnique } = vi.hoisted(() => ({
  mockAdminRoleFindUnique: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    adminRole: {
      findUnique: mockAdminRoleFindUnique,
    },
  },
}));

vi.mock("@/server/auth/session", () => ({
  authenticateRequest: vi.fn(),
}));

vi.mock("@/lib/auth/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
  };
});

import { authenticateRequest } from "@/server/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";

describe("Task 4-C Evidence Routes (/api/tasks/[id]/evidence)", () => {
  const defaultParams = Promise.resolve({ id: "task_42" });

  const fakeSession = {
    sessionId: "sess_1",
    userId: "user_123",
    address: "0x1234567890123456789012345678901234567890",
    role: "USER" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateRequest).mockResolvedValue(fakeSession as any);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mockAdminRoleFindUnique.mockResolvedValue(null);
  });

  describe("POST /api/tasks/[id]/evidence", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(authenticateRequest).mockResolvedValueOnce(null);

      const req = new Request("http://localhost:3000/api/tasks/task_42/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: "https://x.com/post/1" }),
      });

      const res = await POST(req, { params: defaultParams });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("UNAUTHORIZED");
    });

    it("returns 429 when rate limited", async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        allowed: false,
        retryAfterSeconds: 45,
      });

      const req = new Request("http://localhost:3000/api/tasks/task_42/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: "https://x.com/post/1" }),
      });

      const res = await POST(req, { params: defaultParams });
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("45");
      const data = await res.json();
      expect(data.error).toBe("RATE_LIMITED");
    });

    it("returns 500 when checkRateLimit throws", async () => {
      vi.mocked(checkRateLimit).mockRejectedValueOnce(new Error("Redis disconnected"));

      const req = new Request("http://localhost:3000/api/tasks/task_42/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: "https://x.com/post/1" }),
      });

      const res = await POST(req, { params: defaultParams });
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe("SERVER_ERROR");
    });

    it("returns 400 when body is malformed JSON", async () => {
      const req = new Request("http://localhost:3000/api/tasks/task_42/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ bad json",
      });

      const res = await POST(req, { params: defaultParams });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("MALFORMED_JSON");
    });

    it("returns 400 when body is not a JSON object", async () => {
      const req = new Request("http://localhost:3000/api/tasks/task_42/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(["an", "array"]),
      });

      const res = await POST(req, { params: defaultParams });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_INPUT");
    });

    it("returns 413 when body exceeds max size", async () => {
      const bigPayload = "a".repeat(10 * 1024);
      const req = new Request("http://localhost:3000/api/tasks/task_42/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: bigPayload }),
      });

      const res = await POST(req, { params: defaultParams });
      expect(res.status).toBe(413);
      const data = await res.json();
      expect(data.error).toBe("too_large");
    });

    it("maps TaskEvidenceError correctly (404, 409, 422, 403)", async () => {
      vi.spyOn(evidenceService, "submitTaskEvidence").mockRejectedValueOnce(
        new TaskEvidenceError("TASK_NOT_FOUND", "Task not found", 404),
      );

      const req = new Request("http://localhost:3000/api/tasks/task_42/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: "https://x.com/p" }),
      });

      const res = await POST(req, { params: defaultParams });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("TASK_NOT_FOUND");
    });

    it("returns 201 on valid evidence submission", async () => {
      vi.spyOn(evidenceService, "submitTaskEvidence").mockResolvedValueOnce({
        success: true,
        submission: {
          id: "ev_123",
          userId: "user_123",
          taskId: "task_42",
          taskProgressId: "tp_123",
          submissionType: "URL",
          payload: "https://x.com/chimphood/status/999",
          status: "PENDING_REVIEW",
          reviewerId: null,
          reviewerNotes: null,
          reviewedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        taskProgress: {
          id: "tp_123",
          userId: "user_123",
          versionId: "ver_1",
          taskId: "task_42",
          status: "SUBMITTED",
          verifiedAt: null,
          completedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        auditLogId: "audit_123",
      });

      const req = new Request("http://localhost:3000/api/tasks/task_42/evidence", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "203.0.113.1",
          "user-agent": "TestBrowser/1.0",
        },
        body: JSON.stringify({
          submissionType: "URL",
          payload: "https://x.com/chimphood/status/999",
        }),
      });

      const res = await POST(req, { params: defaultParams });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.submission.id).toBe("ev_123");
      expect(data.taskProgress.status).toBe("SUBMITTED");
    });

    it("returns 500 on unexpected errors", async () => {
      vi.spyOn(evidenceService, "submitTaskEvidence").mockRejectedValueOnce(
        new Error("Unexpected crash"),
      );

      const req = new Request("http://localhost:3000/api/tasks/task_42/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: "https://x.com/p" }),
      });

      const res = await POST(req, { params: defaultParams });
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe("SERVER_ERROR");
    });
  });

  describe("GET /api/tasks/[id]/evidence", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(authenticateRequest).mockResolvedValueOnce(null);

      const req = new Request("http://localhost:3000/api/tasks/task_42/evidence", {
        method: "GET",
      });

      const res = await GET(req, { params: defaultParams });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("UNAUTHORIZED");
    });

    it("returns 200 with user submissions", async () => {
      vi.spyOn(evidenceService, "getTaskEvidence").mockResolvedValueOnce({
        task: {
          id: "task_42",
          versionId: "ver_1",
          taskCode: "TEST",
          title: "Test Task",
          description: null,
          taskType: "CUSTOM",
          points: 10,
          isRequired: true,
        },
        progress: {
          id: "tp_1",
          userId: "user_123",
          versionId: "ver_1",
          taskId: "task_42",
          status: "SUBMITTED",
          verifiedAt: null,
          completedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        submissions: [],
      });

      const req = new Request("http://localhost:3000/api/tasks/task_42/evidence", {
        method: "GET",
      });

      const res = await GET(req, { params: defaultParams });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.task.id).toBe("task_42");
      expect(data.progress.status).toBe("SUBMITTED");
    });

    it("passes isAdmin: true when user holds MANAGE_CAMPAIGNS admin role", async () => {
      mockAdminRoleFindUnique.mockResolvedValueOnce({
        id: "ar_1",
        userId: "user_123",
        roleType: "MODERATOR",
        permissions: ["MANAGE_CAMPAIGNS"],
      });

      const getSpy = vi.spyOn(evidenceService, "getTaskEvidence").mockResolvedValueOnce({
        task: {
          id: "task_42",
          versionId: "ver_1",
          taskCode: "TEST",
          title: "Test Task",
          description: null,
          taskType: "CUSTOM",
          points: 10,
          isRequired: true,
        },
        progress: null,
        submissions: [],
      });

      const req = new Request(
        "http://localhost:3000/api/tasks/task_42/evidence?userId=other_user",
        { method: "GET" },
      );

      const res = await GET(req, { params: defaultParams });
      expect(res.status).toBe(200);
      expect(getSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          targetUserId: "other_user",
          isAdmin: true,
        }),
      );
    });

    it("maps TaskEvidenceError (403, 404)", async () => {
      vi.spyOn(evidenceService, "getTaskEvidence").mockRejectedValueOnce(
        new TaskEvidenceError("FORBIDDEN", "Forbidden", 403),
      );

      const req = new Request(
        "http://localhost:3000/api/tasks/task_42/evidence?userId=other",
        {
          method: "GET",
        },
      );

      const res = await GET(req, { params: defaultParams });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("FORBIDDEN");
    });
  });

  describe("Unsupported HTTP Methods", () => {
    it("returns 405 on PUT", async () => {
      const res = PUT();
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("GET, POST");
    });

    it("returns 405 on DELETE", async () => {
      const res = DELETE();
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("GET, POST");
    });

    it("returns 405 on PATCH", async () => {
      const res = PATCH();
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("GET, POST");
    });

    it("returns 405 on HEAD", async () => {
      const res = HEAD();
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("GET, POST");
    });

    it("returns 204 on OPTIONS", async () => {
      const res = OPTIONS();
      expect(res.status).toBe(204);
      expect(res.headers.get("Allow")).toBe("GET, POST, OPTIONS");
    });
  });
});
