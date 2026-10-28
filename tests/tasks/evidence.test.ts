import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  submitTaskEvidence,
  getTaskEvidence,
  validateEvidencePayload,
  TaskEvidenceError,
  VALID_EVIDENCE_TYPES,
} from "@/server/tasks/evidence";
import type { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Mock Prisma Store
// ---------------------------------------------------------------------------

function createMockPrisma() {
  const store = {
    users: [] as any[],
    campaigns: [] as any[],
    campaignVersions: [] as any[],
    campaignTasks: [] as any[],
    taskProgresses: [] as any[],
    evidenceSubmissions: [] as any[],
    auditLogs: [] as any[],
  };

  const createTxClient = () => {
    const uncommittedProgress: any[] = [];
    const uncommittedEvidence: any[] = [];
    const uncommittedAudit: any[] = [];
    const progressSnapshots: Array<{ id: string; data: any }> = [];

    const rollback = () => {
      for (const p of uncommittedProgress) {
        const idx = store.taskProgresses.indexOf(p);
        if (idx !== -1) store.taskProgresses.splice(idx, 1);
      }
      for (const e of uncommittedEvidence) {
        const idx = store.evidenceSubmissions.indexOf(e);
        if (idx !== -1) store.evidenceSubmissions.splice(idx, 1);
      }
      for (const a of uncommittedAudit) {
        const idx = store.auditLogs.indexOf(a);
        if (idx !== -1) store.auditLogs.splice(idx, 1);
      }
      for (const snap of progressSnapshots) {
        const p = store.taskProgresses.find((x) => x.id === snap.id);
        if (p) Object.assign(p, snap.data);
      }
    };

    const tx: any = {
      user: {
        findUnique: vi.fn(async ({ where }: any) => {
          const user = store.users.find((u) => u.id === where.id);
          if (!user) return null;
          return {
            ...user,
            banRecords: user.banRecords ?? [],
          };
        }),
      },
      campaignTask: {
        findUnique: vi.fn(async ({ where }: any) => {
          const task = store.campaignTasks.find((t) => t.id === where.id);
          if (!task) return null;
          const version = store.campaignVersions.find((v) => v.id === task.versionId);
          const campaign = version
            ? store.campaigns.find((c) => c.id === version.campaignId)
            : null;
          return {
            ...task,
            version: version
              ? {
                  ...version,
                  campaign,
                }
              : null,
          };
        }),
      },
      taskProgress: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.userId_versionId_taskId) {
            const { userId, versionId, taskId } = where.userId_versionId_taskId;
            return (
              store.taskProgresses.find(
                (tp) =>
                  tp.userId === userId &&
                  tp.versionId === versionId &&
                  tp.taskId === taskId,
              ) ?? null
            );
          }
          if (where.id) {
            return store.taskProgresses.find((tp) => tp.id === where.id) ?? null;
          }
          return null;
        }),
        create: vi.fn(async ({ data }: any) => {
          const newProgress = {
            id: `tp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            verifiedAt: data.verifiedAt ?? null,
            completedAt: data.completedAt ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          store.taskProgresses.push(newProgress);
          uncommittedProgress.push(newProgress);
          return newProgress;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const progress = store.taskProgresses.find((p) => p.id === where.id);
          if (!progress) throw new Error("Progress not found");
          progressSnapshots.push({ id: progress.id, data: { ...progress } });
          Object.assign(progress, data, { updatedAt: new Date() });
          return progress;
        }),
      },
      evidenceSubmission: {
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.evidenceSubmissions.find((e) => {
              if (where.userId && e.userId !== where.userId) return false;
              if (where.taskId && e.taskId !== where.taskId) return false;
              if (where.status && e.status !== where.status) return false;
              return true;
            }) ?? null
          );
        }),
        create: vi.fn(async ({ data }: any) => {
          const newEvidence = {
            id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            reviewerId: null,
            reviewerNotes: null,
            reviewedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          store.evidenceSubmissions.push(newEvidence);
          uncommittedEvidence.push(newEvidence);
          return newEvidence;
        }),
      },
      auditLog: {
        create: vi.fn(async ({ data }: any) => {
          const log = {
            id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            createdAt: new Date(),
          };
          store.auditLogs.push(log);
          uncommittedAudit.push(log);
          return log;
        }),
      },
    };

    return { tx, rollback };
  };

  const client: any = {
    $transaction: vi.fn(async (callback: any) => {
      const { tx, rollback } = createTxClient();
      try {
        return await callback(tx);
      } catch (err) {
        rollback();
        throw err;
      }
    }),
    campaignTask: {
      findUnique: vi.fn(async ({ where }: any) => {
        return store.campaignTasks.find((t) => t.id === where.id) ?? null;
      }),
    },
    evidenceSubmission: {
      findMany: vi.fn(async ({ where }: any) => {
        return store.evidenceSubmissions.filter((e) => {
          if (where.taskId && e.taskId !== where.taskId) return false;
          if (where.userId && e.userId !== where.userId) return false;
          return true;
        });
      }),
    },
    taskProgress: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.userId_versionId_taskId) {
          const { userId, versionId, taskId } = where.userId_versionId_taskId;
          return (
            store.taskProgresses.find(
              (tp) =>
                tp.userId === userId &&
                tp.versionId === versionId &&
                tp.taskId === taskId,
            ) ?? null
          );
        }
        return null;
      }),
    },
    adminRole: {
      findUnique: vi.fn(async () => null),
    },
  };

  return { store, client };
}

describe("Task 4-C Evidence Service (server/tasks/evidence.ts)", () => {
  let mock: ReturnType<typeof createMockPrisma>;

  const baseNow = new Date("2026-10-23T12:00:00Z");

  beforeEach(() => {
    mock = createMockPrisma();

    // Populate valid default entities
    mock.store.users.push({
      id: "user_1",
      isBanned: false,
      banRecords: [],
    });

    mock.store.campaigns.push({
      id: "camp_1",
      wlProgramId: "prog_1",
      title: "ChimpHood Genesis Campaign",
      status: "ACTIVE",
    });

    mock.store.campaignVersions.push({
      id: "ver_1",
      campaignId: "camp_1",
      versionNumber: 1,
      isCurrent: true,
      startsAt: new Date("2026-10-01T00:00:00Z"),
      endsAt: new Date("2026-12-31T23:59:59Z"),
    });

    mock.store.campaignTasks.push({
      id: "task_1",
      versionId: "ver_1",
      taskCode: "FOLLOW_X",
      title: "Follow ChimpHood on X",
      description: "Follow @ChimpHood on X and submit profile link",
      taskType: "SOCIAL_X_FOLLOW",
      points: 10,
      isRequired: true,
      sortOrder: 1,
      createdAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    });
  });

  describe("Validation Helpers", () => {
    it("validates payload correctly for URL types", () => {
      expect(validateEvidencePayload("https://x.com/chimphood/status/123", "URL")).toBe(
        "https://x.com/chimphood/status/123",
      );
      expect(
        validateEvidencePayload("http://localhost:3000/proof.png", "IMAGE_URL"),
      ).toBe("http://localhost:3000/proof.png");
    });

    it("throws on invalid URL protocol or format for URL types", () => {
      expect(() => validateEvidencePayload("not-a-url", "URL")).toThrow(
        TaskEvidenceError,
      );
      expect(() => validateEvidencePayload("ftp://invalid.com", "URL")).toThrow(
        TaskEvidenceError,
      );
      expect(() => validateEvidencePayload("javascript:alert(1)", "IMAGE_URL")).toThrow(
        TaskEvidenceError,
      );
    });

    it("accepts arbitrary non-URL text for TEXT_PROOF", () => {
      const proof = "I have engaged in discord with username Chimp#1234";
      expect(validateEvidencePayload(proof, "TEXT_PROOF")).toBe(proof);
    });

    it("throws on empty or whitespace-only payload", () => {
      expect(() => validateEvidencePayload("", "URL")).toThrow(TaskEvidenceError);
      expect(() => validateEvidencePayload("   ", "TEXT_PROOF")).toThrow(
        TaskEvidenceError,
      );
    });

    it("throws on payload exceeding 2048 characters", () => {
      const longPayload = "a".repeat(2049);
      expect(() => validateEvidencePayload(longPayload, "TEXT_PROOF")).toThrow(
        TaskEvidenceError,
      );
    });

    it("exports all valid evidence types", () => {
      expect(VALID_EVIDENCE_TYPES).toEqual([
        "URL",
        "IMAGE_URL",
        "TEXT_PROOF",
        "OAUTH_VERIFICATION",
      ]);
    });
  });

  describe("submitTaskEvidence()", () => {
    it("throws 422 if taskId is missing", async () => {
      await expect(
        submitTaskEvidence(mock.client as unknown as PrismaClient, {
          taskId: "",
          userId: "user_1",
          payload: "https://x.com/post/1",
        }),
      ).rejects.toMatchObject({
        code: "MISSING_TASK_ID",
        status: 422,
      });
    });

    it("throws 422 if userId is missing", async () => {
      await expect(
        submitTaskEvidence(mock.client as unknown as PrismaClient, {
          taskId: "task_1",
          userId: "  ",
          payload: "https://x.com/post/1",
        }),
      ).rejects.toMatchObject({
        code: "MISSING_USER_ID",
        status: 422,
      });
    });

    it("throws 422 if submissionType is invalid", async () => {
      await expect(
        submitTaskEvidence(mock.client as unknown as PrismaClient, {
          taskId: "task_1",
          userId: "user_1",
          submissionType: "INVALID_TYPE",
          payload: "https://x.com/post/1",
        }),
      ).rejects.toMatchObject({
        code: "INVALID_SUBMISSION_TYPE",
        status: 422,
      });
    });

    it("throws 404 if user does not exist", async () => {
      await expect(
        submitTaskEvidence(mock.client as unknown as PrismaClient, {
          taskId: "task_1",
          userId: "non_existent_user",
          payload: "https://x.com/post/1",
        }),
      ).rejects.toMatchObject({
        code: "USER_NOT_FOUND",
        status: 404,
      });
    });

    it("throws 403 if user is marked isBanned", async () => {
      mock.store.users[0].isBanned = true;

      await expect(
        submitTaskEvidence(mock.client as unknown as PrismaClient, {
          taskId: "task_1",
          userId: "user_1",
          payload: "https://x.com/post/1",
        }),
      ).rejects.toMatchObject({
        code: "USER_BANNED",
        status: 403,
      });
    });

    it("throws 403 if user has an active FULL_SYSTEM or WL_DISQUALIFIED ban record", async () => {
      mock.store.users[0].banRecords.push({
        id: "ban_1",
        isActive: true,
        scope: "WL_DISQUALIFIED",
        expiresAt: null,
      });

      await expect(
        submitTaskEvidence(mock.client as unknown as PrismaClient, {
          taskId: "task_1",
          userId: "user_1",
          payload: "https://x.com/post/1",
          now: baseNow,
        }),
      ).rejects.toMatchObject({
        code: "USER_BANNED",
        status: 403,
      });
    });

    it("throws 404 if task does not exist", async () => {
      await expect(
        submitTaskEvidence(mock.client as unknown as PrismaClient, {
          taskId: "unknown_task",
          userId: "user_1",
          payload: "https://x.com/post/1",
        }),
      ).rejects.toMatchObject({
        code: "TASK_NOT_FOUND",
        status: 404,
      });
    });

    it("throws 422 if campaign is not ACTIVE", async () => {
      mock.store.campaigns[0].status = "PAUSED";

      await expect(
        submitTaskEvidence(mock.client as unknown as PrismaClient, {
          taskId: "task_1",
          userId: "user_1",
          payload: "https://x.com/post/1",
        }),
      ).rejects.toMatchObject({
        code: "CAMPAIGN_NOT_ACTIVE",
        status: 422,
      });
    });

    it("throws 422 if campaign version has not started yet", async () => {
      mock.store.campaignVersions[0].startsAt = new Date("2026-11-01T00:00:00Z");

      await expect(
        submitTaskEvidence(mock.client as unknown as PrismaClient, {
          taskId: "task_1",
          userId: "user_1",
          payload: "https://x.com/post/1",
          now: baseNow,
        }),
      ).rejects.toMatchObject({
        code: "CAMPAIGN_NOT_STARTED",
        status: 422,
      });
    });

    it("throws 422 if campaign version has already ended", async () => {
      mock.store.campaignVersions[0].endsAt = new Date("2026-10-10T00:00:00Z");

      await expect(
        submitTaskEvidence(mock.client as unknown as PrismaClient, {
          taskId: "task_1",
          userId: "user_1",
          payload: "https://x.com/post/1",
          now: baseNow,
        }),
      ).rejects.toMatchObject({
        code: "CAMPAIGN_ENDED",
        status: 422,
      });
    });

    it("throws 409 if task is already completed & verified", async () => {
      mock.store.taskProgresses.push({
        id: "tp_1",
        userId: "user_1",
        versionId: "ver_1",
        taskId: "task_1",
        status: "VERIFIED",
        verifiedAt: new Date("2026-10-20T00:00:00Z"),
      });

      await expect(
        submitTaskEvidence(mock.client as unknown as PrismaClient, {
          taskId: "task_1",
          userId: "user_1",
          payload: "https://x.com/post/1",
          now: baseNow,
        }),
      ).rejects.toMatchObject({
        code: "TASK_ALREADY_COMPLETED",
        status: 409,
      });
    });

    it("throws 409 if an evidence submission is already pending review", async () => {
      mock.store.evidenceSubmissions.push({
        id: "ev_existing",
        userId: "user_1",
        taskId: "task_1",
        taskProgressId: "tp_old",
        submissionType: "URL",
        payload: "https://x.com/prev",
        status: "PENDING_REVIEW",
      });

      await expect(
        submitTaskEvidence(mock.client as unknown as PrismaClient, {
          taskId: "task_1",
          userId: "user_1",
          payload: "https://x.com/post/2",
          now: baseNow,
        }),
      ).rejects.toMatchObject({
        code: "EVIDENCE_PENDING_REVIEW",
        status: 409,
      });
    });

    it("successfully creates new TaskProgress (SUBMITTED), creates EvidenceSubmission (PENDING_REVIEW), and records audit log", async () => {
      const result = await submitTaskEvidence(mock.client as unknown as PrismaClient, {
        taskId: "task_1",
        userId: "user_1",
        submissionType: "URL",
        payload: "https://x.com/chimphood/status/999",
        ipAddress: "127.0.0.1",
        userAgent: "VitestAgent/1.0",
        now: baseNow,
      });

      expect(result.success).toBe(true);
      expect(result.submission.taskId).toBe("task_1");
      expect(result.submission.userId).toBe("user_1");
      expect(result.submission.submissionType).toBe("URL");
      expect(result.submission.payload).toBe("https://x.com/chimphood/status/999");
      expect(result.submission.status).toBe("PENDING_REVIEW");
      expect(result.taskProgress.status).toBe("SUBMITTED");
      expect(result.auditLogId).toBeDefined();

      // Check store state
      expect(mock.store.taskProgresses).toHaveLength(1);
      expect(mock.store.taskProgresses[0].status).toBe("SUBMITTED");

      expect(mock.store.evidenceSubmissions).toHaveLength(1);
      expect(mock.store.evidenceSubmissions[0].payload).toBe(
        "https://x.com/chimphood/status/999",
      );

      expect(mock.store.auditLogs).toHaveLength(1);
      const audit = mock.store.auditLogs[0];
      expect(audit.action).toBe("EVIDENCE_SUBMITTED");
      expect(audit.actorId).toBe("user_1");
      expect(audit.actorIp).toBe("127.0.0.1");
      expect(audit.userAgent).toBe("VitestAgent/1.0");
      expect(audit.entityType).toBe("EvidenceSubmission");
      expect(audit.metadata.taskCode).toBe("FOLLOW_X");
    });

    it("successfully updates existing TaskProgress from REJECTED to SUBMITTED", async () => {
      mock.store.taskProgresses.push({
        id: "tp_prev",
        userId: "user_1",
        versionId: "ver_1",
        taskId: "task_1",
        status: "REJECTED",
      });

      const result = await submitTaskEvidence(mock.client as unknown as PrismaClient, {
        taskId: "task_1",
        userId: "user_1",
        submissionType: "TEXT_PROOF",
        payload: "Updated proof after fix",
        now: baseNow,
      });

      expect(result.success).toBe(true);
      expect(result.taskProgress.id).toBe("tp_prev");
      expect(result.taskProgress.status).toBe("SUBMITTED");
      expect(mock.store.taskProgresses).toHaveLength(1);
      expect(mock.store.taskProgresses[0].status).toBe("SUBMITTED");
    });

    it("rolls back all changes if audit log creation fails", async () => {
      // Force audit failure inside transaction
      const clientWithFailingAudit: any = {
        $transaction: vi.fn(async (callback: any) => {
          const { tx, rollback } = (
            mock.client as any
          ).$transaction.getMockImplementation()
            ? (mock as any)
            : mock;
          return await mock.client.$transaction(async (txInner: any) => {
            txInner.auditLog.create.mockRejectedValueOnce(new Error("Audit DB down"));
            return await callback(txInner);
          });
        }),
      };

      await expect(
        submitTaskEvidence(clientWithFailingAudit as unknown as PrismaClient, {
          taskId: "task_1",
          userId: "user_1",
          payload: "https://x.com/post/rollback",
          now: baseNow,
        }),
      ).rejects.toThrow("Audit DB down");

      expect(mock.store.taskProgresses).toHaveLength(0);
      expect(mock.store.evidenceSubmissions).toHaveLength(0);
    });
  });

  describe("getTaskEvidence()", () => {
    beforeEach(() => {
      mock.store.taskProgresses.push({
        id: "tp_1",
        userId: "user_1",
        versionId: "ver_1",
        taskId: "task_1",
        status: "SUBMITTED",
        verifiedAt: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mock.store.evidenceSubmissions.push({
        id: "ev_1",
        userId: "user_1",
        taskId: "task_1",
        taskProgressId: "tp_1",
        submissionType: "URL",
        payload: "https://x.com/proof_1",
        status: "PENDING_REVIEW",
        reviewerId: null,
        reviewerNotes: null,
        reviewedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mock.store.evidenceSubmissions.push({
        id: "ev_other",
        userId: "user_2",
        taskId: "task_1",
        taskProgressId: "tp_2",
        submissionType: "URL",
        payload: "https://x.com/proof_2",
        status: "APPROVED",
        reviewerId: "admin_1",
        reviewerNotes: "Looks good",
        reviewedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it("throws 404 if task not found", async () => {
      await expect(
        getTaskEvidence(mock.client as unknown as PrismaClient, {
          taskId: "non_existent_task",
          requesterUserId: "user_1",
        }),
      ).rejects.toMatchObject({
        code: "TASK_NOT_FOUND",
        status: 404,
      });
    });

    it("returns requester's own submissions and progress", async () => {
      const result = await getTaskEvidence(mock.client as unknown as PrismaClient, {
        taskId: "task_1",
        requesterUserId: "user_1",
      });

      expect(result.task.id).toBe("task_1");
      expect(result.progress?.status).toBe("SUBMITTED");
      expect(result.submissions).toHaveLength(1);
      expect(result.submissions[0].id).toBe("ev_1");
    });

    it("throws 403 if regular user attempts to view another user's submissions", async () => {
      await expect(
        getTaskEvidence(mock.client as unknown as PrismaClient, {
          taskId: "task_1",
          requesterUserId: "user_1",
          targetUserId: "user_2",
          isAdmin: false,
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        status: 403,
      });
    });

    it("allows admin to view another user's submissions", async () => {
      const result = await getTaskEvidence(mock.client as unknown as PrismaClient, {
        taskId: "task_1",
        requesterUserId: "admin_1",
        targetUserId: "user_2",
        isAdmin: true,
      });

      expect(result.task.id).toBe("task_1");
      expect(result.submissions).toHaveLength(1);
      expect(result.submissions[0].id).toBe("ev_other");
    });

    it("allows admin to view all task submissions when targetUserId is not specified", async () => {
      const result = await getTaskEvidence(mock.client as unknown as PrismaClient, {
        taskId: "task_1",
        requesterUserId: "admin_1",
        isAdmin: true,
      });

      expect(result.task.id).toBe("task_1");
      expect(result.submissions).toHaveLength(2);
      expect(result.progress).toBeNull();
    });
  });
});
