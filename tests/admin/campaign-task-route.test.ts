import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  POST,
  GET,
  PUT,
  DELETE,
  PATCH,
  HEAD,
  OPTIONS,
} from "@/app/api/admin/campaigns/[id]/versions/[v]/tasks/route";
import {
  GET as DETAIL_GET,
  PUT as DETAIL_PUT,
  DELETE as DETAIL_DELETE,
  POST as DETAIL_POST,
  PATCH as DETAIL_PATCH,
  HEAD as DETAIL_HEAD,
  OPTIONS as DETAIL_OPTIONS,
} from "@/app/api/admin/campaigns/[id]/versions/[v]/tasks/[taskId]/route";
import * as campaignTaskService from "@/server/admin/campaign-task";
import { AdminCampaignTaskError } from "@/server/admin/campaign-task";

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

import { requireAdminSession } from "@/server/auth/session";

describe("Campaign Tasks Routes", () => {
  const fakeAdminSession = {
    userId: "admin_user_42",
    address: "0x1111111111111111111111111111111111111111",
    role: "ADMIN" as const,
    adminRole: {
      id: "ar_1",
      userId: "admin_user_42",
      roleType: "ADMIN" as const,
      permissions: ["MANAGE_CAMPAIGNS"],
      assignedById: "super_1",
      assignedAt: new Date(),
    },
    expiresAt: new Date(Date.now() + 3600000),
    ipAddress: "127.0.0.1",
    userAgent: "Vitest/1.0",
  };

  const defaultParams = Promise.resolve({ id: "camp_1", v: "1" });
  const detailParams = Promise.resolve({ id: "camp_1", v: "1", taskId: "task_99" });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdminSession).mockResolvedValue(fakeAdminSession as any);
  });

  describe("POST /api/admin/campaigns/[id]/versions/[v]/tasks", () => {
    it("returns 401 when requireAdminSession fails with UNAUTHORIZED", async () => {
      const { AdminAuthError } = await import("@/server/auth/session");
      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AdminAuthError("UNAUTHORIZED", "Not signed in", 401),
      );

      const req = new Request(
        "http://localhost:3000/api/admin/campaigns/camp_1/versions/1/tasks",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskCode: "TEST", title: "Test" }),
        },
      );

      const res = await POST(req, { params: defaultParams });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("UNAUTHORIZED");
    });

    it("returns 403 when requireAdminSession fails with FORBIDDEN", async () => {
      const { AdminAuthError } = await import("@/server/auth/session");
      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AdminAuthError("FORBIDDEN", "Missing MANAGE_CAMPAIGNS permission", 403),
      );

      const req = new Request(
        "http://localhost:3000/api/admin/campaigns/camp_1/versions/1/tasks",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskCode: "TEST", title: "Test" }),
        },
      );

      const res = await POST(req, { params: defaultParams });
      expect(res.status).toBe(403);
    });

    it("returns 400 for malformed JSON body", async () => {
      const req = new Request(
        "http://localhost:3000/api/admin/campaigns/camp_1/versions/1/tasks",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "invalid-json{",
        },
      );

      const res = await POST(req, { params: defaultParams });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("MALFORMED_JSON");
    });

    it("returns 201 on success", async () => {
      const createSpy = vi
        .spyOn(campaignTaskService, "createCampaignTask")
        .mockResolvedValueOnce({
          success: true,
          task: {
            id: "task_123",
            versionId: "ver_1",
            taskCode: "FOLLOW_X",
            title: "Follow on X",
            description: null,
            taskType: "SOCIAL_X_FOLLOW",
            requirementMetadata: null,
            points: 10,
            isRequired: true,
            sortOrder: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          auditLogId: "audit_123",
        });

      const req = new Request(
        "http://localhost:3000/api/admin/campaigns/camp_1/versions/1/tasks",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskCode: "FOLLOW_X",
            title: "Follow on X",
            taskType: "SOCIAL_X_FOLLOW",
          }),
        },
      );

      const res = await POST(req, { params: defaultParams });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.task.id).toBe("task_123");
      expect(createSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          campaignId: "camp_1",
          versionIdentifier: "1",
          adminUserId: "admin_user_42",
          taskCode: "FOLLOW_X",
        }),
      );
    });

    it("maps AdminCampaignTaskError status and code", async () => {
      vi.spyOn(campaignTaskService, "createCampaignTask").mockRejectedValueOnce(
        new AdminCampaignTaskError("TASK_CODE_CONFLICT", "Code already exists", 409),
      );

      const req = new Request(
        "http://localhost:3000/api/admin/campaigns/camp_1/versions/1/tasks",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskCode: "FOLLOW_X", title: "Follow on X" }),
        },
      );

      const res = await POST(req, { params: defaultParams });
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe("TASK_CODE_CONFLICT");
    });
  });

  describe("GET /api/admin/campaigns/[id]/versions/[v]/tasks", () => {
    it("returns list of tasks with status 200", async () => {
      vi.spyOn(campaignTaskService, "listCampaignTasks").mockResolvedValueOnce({
        tasks: [
          {
            id: "task_1",
            versionId: "ver_1",
            taskCode: "CODE_1",
            title: "Task 1",
            description: null,
            taskType: "CUSTOM",
            requirementMetadata: null,
            points: 10,
            isRequired: true,
            sortOrder: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        total: 1,
      });

      const req = new Request(
        "http://localhost:3000/api/admin/campaigns/camp_1/versions/1/tasks",
      );
      const res = await GET(req, { params: defaultParams });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.total).toBe(1);
    });
  });

  describe("PUT /api/admin/campaigns/[id]/versions/[v]/tasks", () => {
    it("returns 422 if taskId is missing from body and query param", async () => {
      const req = new Request(
        "http://localhost:3000/api/admin/campaigns/camp_1/versions/1/tasks",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        },
      );

      const res = await PUT(req, { params: defaultParams });
      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.error).toBe("MISSING_TASK_ID");
    });

    it("updates task successfully when taskId is in body", async () => {
      const updateSpy = vi
        .spyOn(campaignTaskService, "updateCampaignTask")
        .mockResolvedValueOnce({
          success: true,
          task: {
            id: "task_1",
            versionId: "ver_1",
            taskCode: "CODE_1",
            title: "New Title",
            description: null,
            taskType: "CUSTOM",
            requirementMetadata: null,
            points: 20,
            isRequired: true,
            sortOrder: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          auditLogId: "audit_u",
        });

      const req = new Request(
        "http://localhost:3000/api/admin/campaigns/camp_1/versions/1/tasks",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: "task_1", title: "New Title", points: 20 }),
        },
      );

      const res = await PUT(req, { params: defaultParams });
      expect(res.status).toBe(200);
      expect(updateSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          taskId: "task_1",
          title: "New Title",
          points: 20,
        }),
      );
    });
  });

  describe("DELETE /api/admin/campaigns/[id]/versions/[v]/tasks", () => {
    it("returns 422 when taskId is missing", async () => {
      const req = new Request(
        "http://localhost:3000/api/admin/campaigns/camp_1/versions/1/tasks",
        {
          method: "DELETE",
        },
      );

      const res = await DELETE(req, { params: defaultParams });
      expect(res.status).toBe(422);
    });

    it("deletes task successfully when taskId is passed in query param", async () => {
      vi.spyOn(campaignTaskService, "deleteCampaignTask").mockResolvedValueOnce({
        success: true,
        deletedTaskId: "task_del_1",
        auditLogId: "audit_d",
      });

      const req = new Request(
        "http://localhost:3000/api/admin/campaigns/camp_1/versions/1/tasks?taskId=task_del_1",
        {
          method: "DELETE",
        },
      );

      const res = await DELETE(req, { params: defaultParams });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.deletedTaskId).toBe("task_del_1");
    });
  });

  describe("Detail Route: /api/admin/campaigns/[id]/versions/[v]/tasks/[taskId]", () => {
    it("GET retrieves single task", async () => {
      vi.spyOn(campaignTaskService, "getCampaignTask").mockResolvedValueOnce({
        id: "task_99",
        versionId: "ver_1",
        taskCode: "SPECIAL_TASK",
        title: "Special Task",
        description: null,
        taskType: "CUSTOM",
        requirementMetadata: null,
        points: 10,
        isRequired: true,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const req = new Request(
        "http://localhost:3000/api/admin/campaigns/camp_1/versions/1/tasks/task_99",
      );
      const res = await DETAIL_GET(req, { params: detailParams });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe("task_99");
    });

    it("PUT updates single task from params", async () => {
      vi.spyOn(campaignTaskService, "updateCampaignTask").mockResolvedValueOnce({
        success: true,
        task: {
          id: "task_99",
          versionId: "ver_1",
          taskCode: "SPECIAL_TASK",
          title: "Updated Special",
          description: null,
          taskType: "CUSTOM",
          requirementMetadata: null,
          points: 10,
          isRequired: true,
          sortOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        auditLogId: "audit_upd",
      });

      const req = new Request(
        "http://localhost:3000/api/admin/campaigns/camp_1/versions/1/tasks/task_99",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated Special" }),
        },
      );

      const res = await DETAIL_PUT(req, { params: detailParams });
      expect(res.status).toBe(200);
    });

    it("DELETE removes task from params", async () => {
      vi.spyOn(campaignTaskService, "deleteCampaignTask").mockResolvedValueOnce({
        success: true,
        deletedTaskId: "task_99",
        auditLogId: "audit_del",
      });

      const req = new Request(
        "http://localhost:3000/api/admin/campaigns/camp_1/versions/1/tasks/task_99",
        {
          method: "DELETE",
        },
      );

      const res = await DETAIL_DELETE(req, { params: detailParams });
      expect(res.status).toBe(200);
    });

    it("disallows other HTTP methods with 405", async () => {
      const resPost = DETAIL_POST();
      expect(resPost.status).toBe(405);

      const resPatch = DETAIL_PATCH();
      expect(resPatch.status).toBe(405);

      const resHead = DETAIL_HEAD();
      expect(resHead.status).toBe(405);

      const resOptions = DETAIL_OPTIONS();
      expect(resOptions.status).toBe(405);
    });
  });

  describe("Method not allowed on list route", () => {
    it("returns 405 for PATCH, HEAD, OPTIONS", () => {
      expect(PATCH().status).toBe(405);
      expect(HEAD().status).toBe(405);
      expect(OPTIONS().status).toBe(405);
    });
  });
});
