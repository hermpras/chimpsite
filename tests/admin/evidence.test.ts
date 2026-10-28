import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  reviewEvidence,
  listAdminEvidence,
  getAdminEvidenceById,
  AdminEvidenceError,
  normalizeReviewStatus,
  normalizeReviewerNotes,
  VALID_REVIEW_DECISIONS,
} from "@/server/admin/evidence";
import type { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Mock Prisma Store
// ---------------------------------------------------------------------------

function createMockPrisma() {
  const store = {
    users: [] as any[],
    wallets: [] as any[],
    xIdentities: [] as any[],
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
    const evidenceSnapshots: Array<{ id: string; data: any }> = [];

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
      for (const snap of evidenceSnapshots) {
        const e = store.evidenceSubmissions.find((x) => x.id === snap.id);
        if (e) Object.assign(e, snap.data);
      }
    };

    const tx: any = {
      evidenceSubmission: {
        findUnique: vi.fn(async ({ where }: any) => {
          const sub = store.evidenceSubmissions.find((e) => e.id === where.id);
          if (!sub) return null;
          const taskProgress = store.taskProgresses.find(
            (p) => p.id === sub.taskProgressId,
          );
          const task = store.campaignTasks.find((t) => t.id === sub.taskId);
          return {
            ...sub,
            taskProgress,
            task,
          };
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const sub = store.evidenceSubmissions.find((e) => e.id === where.id);
          if (!sub) throw new Error("Evidence submission not found in tx");
          evidenceSnapshots.push({ id: sub.id, data: { ...sub } });
          Object.assign(sub, data, { updatedAt: new Date() });
          return sub;
        }),
      },
      taskProgress: {
        update: vi.fn(async ({ where, data }: any) => {
          const progress = store.taskProgresses.find((p) => p.id === where.id);
          if (!progress) throw new Error("Progress not found in tx");
          progressSnapshots.push({ id: progress.id, data: { ...progress } });
          Object.assign(progress, data, { updatedAt: new Date() });
          return progress;
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
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      const { tx, rollback } = createTxClient();
      try {
        return await cb(tx);
      } catch (err) {
        rollback();
        throw err;
      }
    }),
    evidenceSubmission: {
      findUnique: vi.fn(async ({ where }: any) => {
        const sub = store.evidenceSubmissions.find((e) => e.id === where.id);
        if (!sub) return null;
        const taskProgress = store.taskProgresses.find(
          (p) => p.id === sub.taskProgressId,
        );
        const task = store.campaignTasks.find((t) => t.id === sub.taskId);
        const user = store.users.find((u) => u.id === sub.userId);
        const wallet = store.wallets.find((w) => w.userId === sub.userId);
        const xIdentity = store.xIdentities.find((x) => x.userId === sub.userId);
        return {
          ...sub,
          taskProgress,
          task,
          user: user
            ? {
                ...user,
                wallet: wallet ?? null,
                xIdentity: xIdentity ?? null,
              }
            : null,
        };
      }),
      findMany: vi.fn(async ({ where, skip = 0, take = 50 }: any) => {
        let list = [...store.evidenceSubmissions];
        if (where?.status) {
          list = list.filter((e) => e.status === where.status);
        }
        if (where?.taskId) {
          list = list.filter((e) => e.taskId === where.taskId);
        }
        if (where?.userId) {
          list = list.filter((e) => e.userId === where.userId);
        }
        return list.slice(skip, skip + take).map((sub) => {
          const user = store.users.find((u) => u.id === sub.userId);
          const wallet = store.wallets.find((w) => w.userId === sub.userId);
          const xIdentity = store.xIdentities.find((x) => x.userId === sub.userId);
          const task = store.campaignTasks.find((t) => t.id === sub.taskId);
          return {
            ...sub,
            user: user
              ? {
                  ...user,
                  wallet: wallet ?? null,
                  xIdentity: xIdentity ?? null,
                }
              : null,
            task,
          };
        });
      }),
      count: vi.fn(async ({ where }: any) => {
        let list = [...store.evidenceSubmissions];
        if (where?.status) {
          list = list.filter((e) => e.status === where.status);
        }
        if (where?.taskId) {
          list = list.filter((e) => e.taskId === where.taskId);
        }
        if (where?.userId) {
          list = list.filter((e) => e.userId === where.userId);
        }
        return list.length;
      }),
    },
  };

  return { store, client };
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe("Task 4-D Evidence Review Service (server/admin/evidence.ts)", () => {
  let mock: ReturnType<typeof createMockPrisma>;

  const baseNow = new Date("2026-10-23T15:00:00Z");

  beforeEach(() => {
    mock = createMockPrisma();

    // Default Seed Data
    mock.store.users.push(
      { id: "user_user1", isBanned: false },
      { id: "admin_1", isBanned: false },
    );

    mock.store.wallets.push({
      id: "w_1",
      userId: "user_user1",
      address: "0x1111111111111111111111111111111111111111",
    });

    mock.store.xIdentities.push({
      id: "x_1",
      userId: "user_user1",
      username: "chimphood_fan",
    });

    mock.store.campaignTasks.push({
      id: "task_1",
      versionId: "ver_1",
      taskCode: "FOLLOW_X",
      title: "Follow ChimpHood on X",
      taskType: "SOCIAL_X_FOLLOW",
      points: 20,
      isRequired: true,
    });

    mock.store.taskProgresses.push({
      id: "tp_1",
      userId: "user_user1",
      versionId: "ver_1",
      taskId: "task_1",
      status: "SUBMITTED",
      verifiedAt: null,
      completedAt: null,
      createdAt: new Date("2026-10-23T10:00:00Z"),
      updatedAt: new Date("2026-10-23T10:00:00Z"),
    });

    mock.store.evidenceSubmissions.push({
      id: "ev_1",
      userId: "user_user1",
      taskId: "task_1",
      taskProgressId: "tp_1",
      submissionType: "URL",
      payload: "https://x.com/chimphood_fan/status/123456789",
      status: "PENDING_REVIEW",
      reviewerId: null,
      reviewerNotes: null,
      reviewedAt: null,
      createdAt: new Date("2026-10-23T10:00:00Z"),
      updatedAt: new Date("2026-10-23T10:00:00Z"),
    });
  });

  describe("Validation & Helpers", () => {
    it("exports valid review decisions", () => {
      expect(VALID_REVIEW_DECISIONS).toEqual(["APPROVED", "REJECTED"]);
    });

    it("normalizes status strings correctly", () => {
      expect(normalizeReviewStatus("APPROVED")).toBe("APPROVED");
      expect(normalizeReviewStatus("approved")).toBe("APPROVED");
      expect(normalizeReviewStatus("APPROVE")).toBe("APPROVED");
      expect(normalizeReviewStatus("approve")).toBe("APPROVED");
      expect(normalizeReviewStatus("REJECTED")).toBe("REJECTED");
      expect(normalizeReviewStatus("rejected")).toBe("REJECTED");
      expect(normalizeReviewStatus("REJECT")).toBe("REJECTED");
      expect(normalizeReviewStatus("reject")).toBe("REJECTED");
    });

    it("throws 422 INVALID_STATUS on invalid status values", () => {
      expect(() => normalizeReviewStatus("PENDING")).toThrow(AdminEvidenceError);
      expect(() => normalizeReviewStatus("")).toThrow(AdminEvidenceError);
      expect(() => normalizeReviewStatus(null)).toThrow(AdminEvidenceError);
      expect(() => normalizeReviewStatus(123)).toThrow(AdminEvidenceError);
    });

    it("normalizes reviewer notes correctly", () => {
      expect(normalizeReviewerNotes(null)).toBeNull();
      expect(normalizeReviewerNotes(undefined)).toBeNull();
      expect(normalizeReviewerNotes("")).toBeNull();
      expect(normalizeReviewerNotes("   ")).toBeNull();
      expect(normalizeReviewerNotes("  Looks good  ")).toBe("Looks good");
    });

    it("throws 422 INVALID_NOTES on non-string or oversized notes", () => {
      expect(() => normalizeReviewerNotes(123)).toThrow(AdminEvidenceError);
      const longNote = "A".repeat(2049);
      expect(() => normalizeReviewerNotes(longNote)).toThrow(AdminEvidenceError);
    });
  });

  describe("reviewEvidence Service", () => {
    it("successfully APPROVES an evidence submission and verifies TaskProgress", async () => {
      const result = await reviewEvidence(mock.client as unknown as PrismaClient, {
        submissionId: "ev_1",
        adminUserId: "admin_1",
        status: "APPROVED",
        reviewerNotes: "Verified follow tweet.",
        now: baseNow,
      });

      expect(result.success).toBe(true);
      expect(result.submission.id).toBe("ev_1");
      expect(result.submission.status).toBe("APPROVED");
      expect(result.submission.reviewerId).toBe("admin_1");
      expect(result.submission.reviewerNotes).toBe("Verified follow tweet.");
      expect(result.submission.reviewedAt).toBe(baseNow.toISOString());

      // TaskProgress must be updated to VERIFIED
      expect(result.taskProgress.id).toBe("tp_1");
      expect(result.taskProgress.status).toBe("VERIFIED");
      expect(result.taskProgress.verifiedAt).toBe(baseNow.toISOString());
      expect(result.taskProgress.completedAt).toBe(baseNow.toISOString());

      // In-store state assertions
      const updatedSub = mock.store.evidenceSubmissions.find((e) => e.id === "ev_1");
      expect(updatedSub.status).toBe("APPROVED");
      expect(updatedSub.reviewerId).toBe("admin_1");

      const updatedProgress = mock.store.taskProgresses.find((p) => p.id === "tp_1");
      expect(updatedProgress.status).toBe("VERIFIED");
      expect(updatedProgress.verifiedAt).toEqual(baseNow);

      // AuditLog assertion
      expect(mock.store.auditLogs).toHaveLength(1);
      const audit = mock.store.auditLogs[0];
      expect(audit.action).toBe("EVIDENCE_REVIEWED");
      expect(audit.actorId).toBe("admin_1");
      expect(audit.entityType).toBe("EvidenceSubmission");
      expect(audit.entityId).toBe("ev_1");
      expect(audit.oldValues.status).toBe("PENDING_REVIEW");
      expect(audit.newValues.status).toBe("APPROVED");
      expect(audit.metadata.decision).toBe("APPROVED");
      expect(audit.metadata.taskCode).toBe("FOLLOW_X");
    });

    it("successfully REJECTS an evidence submission and marks TaskProgress as REJECTED", async () => {
      const result = await reviewEvidence(mock.client as unknown as PrismaClient, {
        submissionId: "ev_1",
        adminUserId: "admin_1",
        status: "REJECTED",
        reviewerNotes: "Profile does not match submitted wallet address.",
        now: baseNow,
      });

      expect(result.success).toBe(true);
      expect(result.submission.id).toBe("ev_1");
      expect(result.submission.status).toBe("REJECTED");
      expect(result.submission.reviewerId).toBe("admin_1");
      expect(result.submission.reviewerNotes).toBe(
        "Profile does not match submitted wallet address.",
      );
      expect(result.submission.reviewedAt).toBe(baseNow.toISOString());

      // TaskProgress must be updated to REJECTED with verifiedAt cleared
      expect(result.taskProgress.id).toBe("tp_1");
      expect(result.taskProgress.status).toBe("REJECTED");
      expect(result.taskProgress.verifiedAt).toBeNull();

      const updatedProgress = mock.store.taskProgresses.find((p) => p.id === "tp_1");
      expect(updatedProgress.status).toBe("REJECTED");
      expect(updatedProgress.verifiedAt).toBeNull();

      // AuditLog assertion
      const audit = mock.store.auditLogs[0];
      expect(audit.action).toBe("EVIDENCE_REVIEWED");
      expect(audit.metadata.decision).toBe("REJECTED");
      expect(audit.newValues.status).toBe("REJECTED");
    });

    it("throws 422 MISSING_SUBMISSION_ID if submissionId is empty", async () => {
      await expect(
        reviewEvidence(mock.client as unknown as PrismaClient, {
          submissionId: "",
          adminUserId: "admin_1",
          status: "APPROVED",
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "MISSING_SUBMISSION_ID",
          status: 422,
        }),
      );
    });

    it("throws 422 MISSING_ADMIN_USER_ID if adminUserId is empty", async () => {
      await expect(
        reviewEvidence(mock.client as unknown as PrismaClient, {
          submissionId: "ev_1",
          adminUserId: "",
          status: "APPROVED",
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "MISSING_ADMIN_USER_ID",
          status: 422,
        }),
      );
    });

    it("throws 404 SUBMISSION_NOT_FOUND if evidence does not exist", async () => {
      await expect(
        reviewEvidence(mock.client as unknown as PrismaClient, {
          submissionId: "nonexistent_sub",
          adminUserId: "admin_1",
          status: "APPROVED",
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "SUBMISSION_NOT_FOUND",
          status: 404,
        }),
      );
    });

    it("throws 409 SUBMISSION_ALREADY_REVIEWED if submission status is already APPROVED", async () => {
      mock.store.evidenceSubmissions[0].status = "APPROVED";
      mock.store.evidenceSubmissions[0].reviewedAt = new Date();

      await expect(
        reviewEvidence(mock.client as unknown as PrismaClient, {
          submissionId: "ev_1",
          adminUserId: "admin_1",
          status: "REJECTED",
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "SUBMISSION_ALREADY_REVIEWED",
          status: 409,
        }),
      );
    });

    it("throws 409 SUBMISSION_ALREADY_REVIEWED if submission status is already REJECTED", async () => {
      mock.store.evidenceSubmissions[0].status = "REJECTED";
      mock.store.evidenceSubmissions[0].reviewedAt = new Date();

      await expect(
        reviewEvidence(mock.client as unknown as PrismaClient, {
          submissionId: "ev_1",
          adminUserId: "admin_1",
          status: "APPROVED",
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "SUBMISSION_ALREADY_REVIEWED",
          status: 409,
        }),
      );
    });

    it("rolls back all changes if an error occurs inside the transaction", async () => {
      // Cause an auditLog error to trigger transaction rollback
      const originalTx = mock.client.$transaction;
      mock.client.$transaction = vi.fn(async (cb: any) => {
        const { tx, rollback } = mock as any;
        // Simulate audit fail
        try {
          return await cb({
            evidenceSubmission: {
              findUnique: vi.fn(async () => ({
                id: "ev_1",
                status: "PENDING_REVIEW",
                taskProgressId: "tp_1",
                taskId: "task_1",
                taskProgress: { id: "tp_1", status: "SUBMITTED" },
                task: { id: "task_1", taskCode: "FOLLOW_X" },
              })),
              update: vi.fn(async () => {
                mock.store.evidenceSubmissions[0].status = "APPROVED";
                return mock.store.evidenceSubmissions[0];
              }),
            },
            taskProgress: {
              update: vi.fn(async () => {
                mock.store.taskProgresses[0].status = "VERIFIED";
                return mock.store.taskProgresses[0];
              }),
            },
            auditLog: {
              create: vi.fn(async () => {
                throw new Error("Audit log database failure");
              }),
            },
          });
        } catch (e) {
          // Reset store on rollback
          mock.store.evidenceSubmissions[0].status = "PENDING_REVIEW";
          mock.store.taskProgresses[0].status = "SUBMITTED";
          throw e;
        }
      });

      await expect(
        reviewEvidence(mock.client as unknown as PrismaClient, {
          submissionId: "ev_1",
          adminUserId: "admin_1",
          status: "APPROVED",
        }),
      ).rejects.toThrow("Audit log database failure");

      // Verify rollback preserved state
      expect(mock.store.evidenceSubmissions[0].status).toBe("PENDING_REVIEW");
      expect(mock.store.taskProgresses[0].status).toBe("SUBMITTED");
    });
  });

  describe("listAdminEvidence Service", () => {
    beforeEach(() => {
      // Add more items for listing tests
      mock.store.evidenceSubmissions.push(
        {
          id: "ev_2",
          userId: "user_user1",
          taskId: "task_1",
          taskProgressId: "tp_1",
          submissionType: "URL",
          payload: "https://x.com/approved",
          status: "APPROVED",
          reviewerId: "admin_1",
          reviewerNotes: "Approved note",
          reviewedAt: new Date("2026-10-23T11:00:00Z"),
          createdAt: new Date("2026-10-23T11:00:00Z"),
          updatedAt: new Date("2026-10-23T11:00:00Z"),
        },
        {
          id: "ev_3",
          userId: "user_user2",
          taskId: "task_2",
          taskProgressId: "tp_2",
          submissionType: "TEXT_PROOF",
          payload: "Proof text",
          status: "REJECTED",
          reviewerId: "admin_1",
          reviewerNotes: "Invalid proof",
          reviewedAt: new Date("2026-10-23T12:00:00Z"),
          createdAt: new Date("2026-10-23T12:00:00Z"),
          updatedAt: new Date("2026-10-23T12:00:00Z"),
        },
      );
    });

    it("lists all evidence submissions when no filter is provided", async () => {
      const result = await listAdminEvidence(mock.client as unknown as PrismaClient);
      expect(result.total).toBe(3);
      expect(result.submissions).toHaveLength(3);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it("filters submissions by status PENDING_REVIEW", async () => {
      const result = await listAdminEvidence(mock.client as unknown as PrismaClient, {
        status: "PENDING_REVIEW",
      });
      expect(result.total).toBe(1);
      expect(result.submissions[0].id).toBe("ev_1");
      expect(result.submissions[0].status).toBe("PENDING_REVIEW");
    });

    it("filters submissions by status APPROVED", async () => {
      const result = await listAdminEvidence(mock.client as unknown as PrismaClient, {
        status: "APPROVED",
      });
      expect(result.total).toBe(1);
      expect(result.submissions[0].id).toBe("ev_2");
      expect(result.submissions[0].status).toBe("APPROVED");
    });

    it("filters submissions by taskId and userId", async () => {
      const result = await listAdminEvidence(mock.client as unknown as PrismaClient, {
        taskId: "task_1",
        userId: "user_user1",
      });
      expect(result.total).toBe(2);
      expect(result.submissions.map((s) => s.id)).toEqual(["ev_1", "ev_2"]);
    });

    it("throws 422 INVALID_STATUS on invalid status filter", async () => {
      await expect(
        listAdminEvidence(mock.client as unknown as PrismaClient, {
          status: "INVALID_STATUS_VALUE",
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "INVALID_STATUS",
          status: 422,
        }),
      );
    });

    it("applies limit and offset pagination", async () => {
      const result = await listAdminEvidence(mock.client as unknown as PrismaClient, {
        limit: 1,
        offset: 1,
      });
      expect(result.total).toBe(3);
      expect(result.submissions).toHaveLength(1);
      expect(result.submissions[0].id).toBe("ev_2");
      expect(result.limit).toBe(1);
      expect(result.offset).toBe(1);
    });

    it("includes user wallet and xIdentity details in list results", async () => {
      const result = await listAdminEvidence(mock.client as unknown as PrismaClient, {
        status: "PENDING_REVIEW",
      });
      expect(result.submissions[0].user).toBeDefined();
      expect(result.submissions[0].user?.wallet?.address).toBe(
        "0x1111111111111111111111111111111111111111",
      );
      expect(result.submissions[0].user?.xIdentity?.username).toBe("chimphood_fan");
      expect(result.submissions[0].task?.taskCode).toBe("FOLLOW_X");
    });
  });

  describe("getAdminEvidenceById Service", () => {
    it("retrieves a single evidence submission with full relational details", async () => {
      const result = await getAdminEvidenceById(
        mock.client as unknown as PrismaClient,
        "ev_1",
      );
      expect(result.id).toBe("ev_1");
      expect(result.status).toBe("PENDING_REVIEW");
      expect(result.user?.wallet?.address).toBe(
        "0x1111111111111111111111111111111111111111",
      );
      expect(result.task?.taskCode).toBe("FOLLOW_X");
      expect(result.taskProgress?.status).toBe("SUBMITTED");
    });

    it("throws 404 SUBMISSION_NOT_FOUND if id does not exist", async () => {
      await expect(
        getAdminEvidenceById(mock.client as unknown as PrismaClient, "missing"),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "SUBMISSION_NOT_FOUND",
          status: 404,
        }),
      );
    });

    it("throws 422 MISSING_SUBMISSION_ID if id is empty", async () => {
      await expect(
        getAdminEvidenceById(mock.client as unknown as PrismaClient, "  "),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "MISSING_SUBMISSION_ID",
          status: 422,
        }),
      );
    });
  });
});
