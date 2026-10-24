import type {
  PrismaClient,
  EvidenceStatus,
  TaskProgressStatus,
  EvidenceType,
  TaskType,
  Prisma,
} from "@prisma/client";
import { recordAuditLog } from "../audit/audit";
import {
  formatEvidenceSubmissionOutput,
  formatTaskProgressOutput,
  type EvidenceSubmissionOutput,
  type TaskProgressOutput,
} from "../tasks/evidence";

// ---------------------------------------------------------------------------
// Error Class
// ---------------------------------------------------------------------------

export class AdminEvidenceError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = "AdminEvidenceError";
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Constants & Types
// ---------------------------------------------------------------------------

export const VALID_REVIEW_DECISIONS: readonly EvidenceStatus[] = [
  "APPROVED",
  "REJECTED",
] as const;

export interface ReviewEvidenceInput {
  submissionId: string;
  adminUserId: string;
  status: EvidenceStatus | string;
  reviewerNotes?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  now?: Date;
}

export interface ReviewEvidenceResult {
  success: true;
  submission: EvidenceSubmissionOutput;
  taskProgress: TaskProgressOutput;
  auditLogId: string;
}

export interface ListEvidenceFilter {
  status?: EvidenceStatus | string;
  taskId?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}

export interface AdminEvidenceSubmissionDetail extends EvidenceSubmissionOutput {
  user?: {
    id: string;
    wallet?: { address: string } | null;
    xIdentity?: { username: string } | null;
  };
  task?: {
    id: string;
    taskCode: string;
    title: string;
    taskType: TaskType;
    points: number;
    isRequired: boolean;
  };
  taskProgress?: TaskProgressOutput | null;
}

export interface ListEvidenceResult {
  submissions: AdminEvidenceSubmissionDetail[];
  total: number;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

export function normalizeReviewStatus(status: unknown): EvidenceStatus {
  if (typeof status !== "string") {
    throw new AdminEvidenceError("INVALID_STATUS", "Status must be a string.", 422);
  }
  const upper = status.trim().toUpperCase();
  if (upper === "APPROVED" || upper === "APPROVE") return "APPROVED";
  if (upper === "REJECTED" || upper === "REJECT") return "REJECTED";
  throw new AdminEvidenceError(
    "INVALID_STATUS",
    `Invalid status '${status}'. Status must be either 'APPROVED' or 'REJECTED'.`,
    422,
  );
}

export function normalizeReviewerNotes(notes: unknown): string | null {
  if (notes === undefined || notes === null) return null;
  if (typeof notes !== "string") {
    throw new AdminEvidenceError(
      "INVALID_NOTES",
      "Reviewer notes must be a string.",
      422,
    );
  }
  const trimmed = notes.trim();
  if (trimmed.length > 2048) {
    throw new AdminEvidenceError(
      "INVALID_NOTES",
      "Reviewer notes must not exceed 2048 characters.",
      422,
    );
  }
  return trimmed.length > 0 ? trimmed : null;
}

// ---------------------------------------------------------------------------
// Service Functions
// ---------------------------------------------------------------------------

/**
 * Review an evidence submission: approve or reject.
 * Atomic execution:
 * 1. Validates existence and pending status of the submission.
 * 2. Updates EvidenceSubmission (status, reviewerId, reviewerNotes, reviewedAt).
 * 3. Updates linked TaskProgress (VERIFIED if approved, REJECTED if rejected).
 * 4. Records AuditLog with old and new values.
 */
export async function reviewEvidence(
  prisma: PrismaClient,
  input: ReviewEvidenceInput,
): Promise<ReviewEvidenceResult> {
  if (
    !input.submissionId ||
    typeof input.submissionId !== "string" ||
    !input.submissionId.trim()
  ) {
    throw new AdminEvidenceError(
      "MISSING_SUBMISSION_ID",
      "submissionId is required.",
      422,
    );
  }
  if (
    !input.adminUserId ||
    typeof input.adminUserId !== "string" ||
    !input.adminUserId.trim()
  ) {
    throw new AdminEvidenceError(
      "MISSING_ADMIN_USER_ID",
      "adminUserId is required.",
      422,
    );
  }

  const submissionId = input.submissionId.trim();
  const adminUserId = input.adminUserId.trim();
  const targetStatus = normalizeReviewStatus(input.status);
  const reviewerNotes = normalizeReviewerNotes(input.reviewerNotes);
  const now = input.now ?? new Date();

  return await prisma.$transaction(async (tx) => {
    // 1. Fetch submission with task and progress
    const existingSubmission = await tx.evidenceSubmission.findUnique({
      where: { id: submissionId },
      include: {
        taskProgress: true,
        task: true,
      },
    });

    if (!existingSubmission) {
      throw new AdminEvidenceError(
        "SUBMISSION_NOT_FOUND",
        "Evidence submission not found.",
        404,
      );
    }

    // 2. Invariant: only PENDING_REVIEW submissions can be reviewed
    if (existingSubmission.status !== "PENDING_REVIEW") {
      throw new AdminEvidenceError(
        "SUBMISSION_ALREADY_REVIEWED",
        `Evidence submission has already been reviewed (current status: ${existingSubmission.status}).`,
        409,
      );
    }

    // 3. Update EvidenceSubmission
    const updatedSubmission = await tx.evidenceSubmission.update({
      where: { id: submissionId },
      data: {
        status: targetStatus,
        reviewerId: adminUserId,
        reviewerNotes,
        reviewedAt: now,
      },
    });

    // 4. Update linked TaskProgress
    const targetProgressStatus: TaskProgressStatus =
      targetStatus === "APPROVED" ? "VERIFIED" : "REJECTED";

    const updatedTaskProgress = await tx.taskProgress.update({
      where: { id: existingSubmission.taskProgressId },
      data: {
        status: targetProgressStatus,
        ...(targetStatus === "APPROVED"
          ? {
              verifiedAt: now,
              completedAt: existingSubmission.taskProgress.completedAt ?? now,
            }
          : {
              verifiedAt: null,
            }),
      },
    });

    // 5. Record AuditLog inside same transaction
    const audit = await recordAuditLog(tx, {
      actorId: adminUserId,
      actorIp: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      action: "EVIDENCE_REVIEWED",
      entityType: "EvidenceSubmission",
      entityId: submissionId,
      oldValues: {
        status: existingSubmission.status,
        reviewerId: existingSubmission.reviewerId,
        reviewerNotes: existingSubmission.reviewerNotes,
        reviewedAt: existingSubmission.reviewedAt
          ? existingSubmission.reviewedAt.toISOString()
          : null,
        taskProgressStatus: existingSubmission.taskProgress.status,
      },
      newValues: {
        status: targetStatus,
        reviewerId: adminUserId,
        reviewerNotes,
        reviewedAt: now.toISOString(),
        taskProgressStatus: targetProgressStatus,
      },
      metadata: {
        decision: targetStatus,
        taskId: existingSubmission.taskId,
        taskCode: existingSubmission.task?.taskCode,
        taskProgressId: existingSubmission.taskProgressId,
        userId: existingSubmission.userId,
      },
    });

    return {
      success: true,
      submission: formatEvidenceSubmissionOutput(updatedSubmission),
      taskProgress: formatTaskProgressOutput(updatedTaskProgress),
      auditLogId: audit.id,
    };
  });
}

/**
 * List evidence submissions for admin review, supporting filters and pagination.
 */
export async function listAdminEvidence(
  prisma: PrismaClient,
  filter: ListEvidenceFilter = {},
): Promise<ListEvidenceResult> {
  const where: Prisma.EvidenceSubmissionWhereInput = {};

  if (filter.status) {
    const raw = String(filter.status).trim().toUpperCase();
    if (!["PENDING_REVIEW", "APPROVED", "REJECTED"].includes(raw)) {
      throw new AdminEvidenceError(
        "INVALID_STATUS",
        `Invalid status filter '${filter.status}'. Must be PENDING_REVIEW, APPROVED, or REJECTED.`,
        422,
      );
    }
    where.status = raw as EvidenceStatus;
  }

  if (filter.taskId && typeof filter.taskId === "string" && filter.taskId.trim()) {
    where.taskId = filter.taskId.trim();
  }

  if (filter.userId && typeof filter.userId === "string" && filter.userId.trim()) {
    where.userId = filter.userId.trim();
  }

  const limit = Math.min(Math.max(1, Number(filter.limit) || 50), 100);
  const offset = Math.max(0, Number(filter.offset) || 0);

  const [submissions, total] = await Promise.all([
    prisma.evidenceSubmission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            wallet: { select: { address: true } },
            xIdentity: { select: { username: true } },
          },
        },
        task: {
          select: {
            id: true,
            taskCode: true,
            title: true,
            taskType: true,
            points: true,
            isRequired: true,
          },
        },
      },
    }),
    prisma.evidenceSubmission.count({ where }),
  ]);

  return {
    submissions: (submissions as any[]).map((s) => ({
      ...formatEvidenceSubmissionOutput(s),
      user: s.user
        ? {
            id: s.user.id,
            wallet: s.user.wallet ? { address: s.user.wallet.address } : null,
            xIdentity: s.user.xIdentity ? { username: s.user.xIdentity.username } : null,
          }
        : undefined,
      task: s.task
        ? {
            id: s.task.id,
            taskCode: s.task.taskCode,
            title: s.task.title,
            taskType: s.task.taskType,
            points: s.task.points,
            isRequired: s.task.isRequired,
          }
        : undefined,
    })),
    total,
    limit,
    offset,
  };
}

/**
 * Retrieve a single evidence submission with full details for admin review.
 */
export async function getAdminEvidenceById(
  prisma: PrismaClient,
  submissionId: string,
): Promise<AdminEvidenceSubmissionDetail> {
  if (!submissionId || typeof submissionId !== "string" || !submissionId.trim()) {
    throw new AdminEvidenceError(
      "MISSING_SUBMISSION_ID",
      "submissionId is required.",
      422,
    );
  }

  const submission = (await prisma.evidenceSubmission.findUnique({
    where: { id: submissionId.trim() },
    include: {
      user: {
        select: {
          id: true,
          wallet: { select: { address: true } },
          xIdentity: { select: { username: true } },
        },
      },
      task: {
        select: {
          id: true,
          taskCode: true,
          title: true,
          taskType: true,
          points: true,
          isRequired: true,
        },
      },
      taskProgress: true,
    },
  })) as any;

  if (!submission) {
    throw new AdminEvidenceError(
      "SUBMISSION_NOT_FOUND",
      "Evidence submission not found.",
      404,
    );
  }

  return {
    ...formatEvidenceSubmissionOutput(submission),
    user: submission.user
      ? {
          id: submission.user.id,
          wallet: submission.user.wallet
            ? { address: submission.user.wallet.address }
            : null,
          xIdentity: submission.user.xIdentity
            ? { username: submission.user.xIdentity.username }
            : null,
        }
      : undefined,
    task: submission.task
      ? {
          id: submission.task.id,
          taskCode: submission.task.taskCode,
          title: submission.task.title,
          taskType: submission.task.taskType,
          points: submission.task.points,
          isRequired: submission.task.isRequired,
        }
      : undefined,
    taskProgress: submission.taskProgress
      ? formatTaskProgressOutput(submission.taskProgress)
      : null,
  };
}
