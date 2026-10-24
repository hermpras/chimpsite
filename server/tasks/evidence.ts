import type {
  PrismaClient,
  EvidenceType,
  EvidenceStatus,
  TaskProgressStatus,
  TaskType,
  CampaignStatus,
} from "@prisma/client";
import { recordAuditLog } from "../audit/audit";

// ---------------------------------------------------------------------------
// Error Class
// ---------------------------------------------------------------------------

export class TaskEvidenceError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = "TaskEvidenceError";
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Constants & Types
// ---------------------------------------------------------------------------

export const VALID_EVIDENCE_TYPES: EvidenceType[] = [
  "URL",
  "IMAGE_URL",
  "TEXT_PROOF",
  "OAUTH_VERIFICATION",
];

export interface EvidenceSubmissionOutput {
  id: string;
  userId: string;
  taskId: string;
  taskProgressId: string;
  submissionType: EvidenceType;
  payload: string;
  status: EvidenceStatus;
  reviewerId: string | null;
  reviewerNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskProgressOutput {
  id: string;
  userId: string;
  versionId: string;
  taskId: string;
  status: TaskProgressStatus;
  verifiedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubmitTaskEvidenceInput {
  taskId: string;
  userId: string;
  submissionType?: EvidenceType | string;
  payload: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  now?: Date;
}

export interface SubmitTaskEvidenceResult {
  success: true;
  submission: EvidenceSubmissionOutput;
  taskProgress: TaskProgressOutput;
  auditLogId: string;
}

export interface GetTaskEvidenceInput {
  taskId: string;
  requesterUserId: string;
  targetUserId?: string;
  isAdmin?: boolean;
}

export interface GetTaskEvidenceResult {
  task: {
    id: string;
    versionId: string;
    taskCode: string;
    title: string;
    description: string | null;
    taskType: TaskType;
    points: number;
    isRequired: boolean;
  };
  progress: TaskProgressOutput | null;
  submissions: EvidenceSubmissionOutput[];
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

export function formatEvidenceSubmissionOutput(sub: {
  id: string;
  userId: string;
  taskId: string;
  taskProgressId: string;
  submissionType: EvidenceType;
  payload: string;
  status: EvidenceStatus;
  reviewerId: string | null;
  reviewerNotes: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): EvidenceSubmissionOutput {
  return {
    id: sub.id,
    userId: sub.userId,
    taskId: sub.taskId,
    taskProgressId: sub.taskProgressId,
    submissionType: sub.submissionType,
    payload: sub.payload,
    status: sub.status,
    reviewerId: sub.reviewerId ?? null,
    reviewerNotes: sub.reviewerNotes ?? null,
    reviewedAt:
      sub.reviewedAt instanceof Date
        ? sub.reviewedAt.toISOString()
        : (sub.reviewedAt ?? null),
    createdAt:
      sub.createdAt instanceof Date ? sub.createdAt.toISOString() : String(sub.createdAt),
    updatedAt:
      sub.updatedAt instanceof Date ? sub.updatedAt.toISOString() : String(sub.updatedAt),
  };
}

export function formatTaskProgressOutput(tp: {
  id: string;
  userId: string;
  versionId: string;
  taskId: string;
  status: TaskProgressStatus;
  verifiedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): TaskProgressOutput {
  return {
    id: tp.id,
    userId: tp.userId,
    versionId: tp.versionId,
    taskId: tp.taskId,
    status: tp.status,
    verifiedAt:
      tp.verifiedAt instanceof Date
        ? tp.verifiedAt.toISOString()
        : (tp.verifiedAt ?? null),
    completedAt:
      tp.completedAt instanceof Date
        ? tp.completedAt.toISOString()
        : (tp.completedAt ?? null),
    createdAt:
      tp.createdAt instanceof Date ? tp.createdAt.toISOString() : String(tp.createdAt),
    updatedAt:
      tp.updatedAt instanceof Date ? tp.updatedAt.toISOString() : String(tp.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

export function validateEvidencePayload(
  payload: string,
  submissionType: EvidenceType,
): string {
  if (typeof payload !== "string") {
    throw new TaskEvidenceError(
      "INVALID_PAYLOAD",
      "Evidence payload must be a string.",
      422,
    );
  }

  const trimmed = payload.trim();
  if (!trimmed || trimmed.length === 0) {
    throw new TaskEvidenceError(
      "INVALID_PAYLOAD",
      "Evidence payload cannot be empty.",
      422,
    );
  }

  if (trimmed.length > 2048) {
    throw new TaskEvidenceError(
      "INVALID_PAYLOAD",
      "Evidence payload must not exceed 2048 characters.",
      422,
    );
  }

  if (submissionType === "URL" || submissionType === "IMAGE_URL") {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error();
      }
    } catch {
      throw new TaskEvidenceError(
        "INVALID_URL",
        `Evidence payload must be a valid HTTP or HTTPS URL for submission type ${submissionType}.`,
        422,
      );
    }
  }

  return trimmed;
}

// ---------------------------------------------------------------------------
// Service Functions
// ---------------------------------------------------------------------------

/**
 * Submit evidence for a campaign task.
 * Atomic: validates user, task, campaign, and existing progress/pending evidence,
 * then updates/creates TaskProgress, creates EvidenceSubmission, and records an AuditLog.
 */
export async function submitTaskEvidence(
  prisma: PrismaClient,
  input: SubmitTaskEvidenceInput,
): Promise<SubmitTaskEvidenceResult> {
  if (!input.taskId || typeof input.taskId !== "string" || !input.taskId.trim()) {
    throw new TaskEvidenceError("MISSING_TASK_ID", "taskId is required.", 422);
  }
  if (!input.userId || typeof input.userId !== "string" || !input.userId.trim()) {
    throw new TaskEvidenceError("MISSING_USER_ID", "userId is required.", 422);
  }

  const taskId = input.taskId.trim();
  const userId = input.userId.trim();
  const now = input.now ?? new Date();

  // Validate or default submissionType
  let submissionType: EvidenceType = "URL";
  if (input.submissionType) {
    const rawType = input.submissionType.trim();
    if (!VALID_EVIDENCE_TYPES.includes(rawType as EvidenceType)) {
      throw new TaskEvidenceError(
        "INVALID_SUBMISSION_TYPE",
        `Invalid submissionType '${rawType}'. Must be one of: ${VALID_EVIDENCE_TYPES.join(", ")}.`,
        422,
      );
    }
    submissionType = rawType as EvidenceType;
  }

  // Validate payload
  const trimmedPayload = validateEvidencePayload(input.payload, submissionType);

  return await prisma.$transaction(async (tx) => {
    // 1. Check user existence and ban status
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isBanned: true,
        banRecords: {
          where: {
            isActive: true,
            scope: { in: ["FULL_SYSTEM", "WL_DISQUALIFIED"] },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          select: { id: true, scope: true },
        },
      },
    });

    if (!user) {
      throw new TaskEvidenceError("USER_NOT_FOUND", "User not found.", 404);
    }

    if (user.isBanned || user.banRecords.length > 0) {
      throw new TaskEvidenceError(
        "USER_BANNED",
        "Your account is banned or restricted from submitting campaign evidence.",
        403,
      );
    }

    // 2. Fetch task with version and campaign
    const task = await tx.campaignTask.findUnique({
      where: { id: taskId },
      include: {
        version: {
          include: {
            campaign: true,
          },
        },
      },
    });

    if (!task) {
      throw new TaskEvidenceError("TASK_NOT_FOUND", "Campaign task not found.", 404);
    }

    // 3. Verify campaign status
    if (task.version.campaign.status !== "ACTIVE") {
      throw new TaskEvidenceError(
        "CAMPAIGN_NOT_ACTIVE",
        `Campaign '${task.version.campaign.title}' is currently ${task.version.campaign.status} and not accepting submissions.`,
        422,
      );
    }

    // 4. Verify version active window
    if (task.version.startsAt > now) {
      throw new TaskEvidenceError(
        "CAMPAIGN_NOT_STARTED",
        "Campaign version has not started yet.",
        422,
      );
    }
    if (task.version.endsAt && task.version.endsAt < now) {
      throw new TaskEvidenceError(
        "CAMPAIGN_ENDED",
        "Campaign version has already ended.",
        422,
      );
    }

    // 5. Check existing TaskProgress
    const existingProgress = await tx.taskProgress.findUnique({
      where: {
        userId_versionId_taskId: {
          userId,
          versionId: task.versionId,
          taskId: task.id,
        },
      },
    });

    if (existingProgress?.status === "VERIFIED") {
      throw new TaskEvidenceError(
        "TASK_ALREADY_COMPLETED",
        "This task has already been completed and verified.",
        409,
      );
    }

    // 6. Check for already pending review submission
    const pendingSubmission = await tx.evidenceSubmission.findFirst({
      where: {
        userId,
        taskId: task.id,
        status: "PENDING_REVIEW",
      },
    });

    if (pendingSubmission) {
      throw new TaskEvidenceError(
        "EVIDENCE_PENDING_REVIEW",
        "An evidence submission for this task is already pending review.",
        409,
      );
    }

    // 7. Upsert TaskProgress to SUBMITTED
    let progressRecord;
    if (existingProgress) {
      progressRecord = await tx.taskProgress.update({
        where: { id: existingProgress.id },
        data: {
          status: "SUBMITTED",
        },
      });
    } else {
      progressRecord = await tx.taskProgress.create({
        data: {
          userId,
          versionId: task.versionId,
          taskId: task.id,
          status: "SUBMITTED",
        },
      });
    }

    // 8. Create EvidenceSubmission
    const submission = await tx.evidenceSubmission.create({
      data: {
        userId,
        taskId: task.id,
        taskProgressId: progressRecord.id,
        submissionType,
        payload: trimmedPayload,
        status: "PENDING_REVIEW",
      },
    });

    // 9. Record Audit Log
    const audit = await recordAuditLog(tx, {
      actorId: userId,
      actorIp: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      action: "EVIDENCE_SUBMITTED",
      entityType: "EvidenceSubmission",
      entityId: submission.id,
      metadata: {
        taskId: task.id,
        taskCode: task.taskCode,
        versionId: task.versionId,
        submissionType,
        taskProgressId: progressRecord.id,
      },
    });

    return {
      success: true,
      submission: formatEvidenceSubmissionOutput(submission),
      taskProgress: formatTaskProgressOutput(progressRecord),
      auditLogId: audit.id,
    };
  });
}

/**
 * Retrieve evidence submissions and progress for a task.
 * Regular users can only query their own submissions.
 * Admins can optionally specify a targetUserId or retrieve all submissions for the task.
 */
export async function getTaskEvidence(
  prisma: PrismaClient,
  input: GetTaskEvidenceInput,
): Promise<GetTaskEvidenceResult> {
  if (!input.taskId || typeof input.taskId !== "string" || !input.taskId.trim()) {
    throw new TaskEvidenceError("MISSING_TASK_ID", "taskId is required.", 422);
  }
  if (
    !input.requesterUserId ||
    typeof input.requesterUserId !== "string" ||
    !input.requesterUserId.trim()
  ) {
    throw new TaskEvidenceError("MISSING_USER_ID", "requesterUserId is required.", 422);
  }

  const taskId = input.taskId.trim();
  const requesterUserId = input.requesterUserId.trim();
  const targetUserId = input.targetUserId?.trim() || undefined;
  const isAdmin = Boolean(input.isAdmin);

  // 1. Fetch task
  const task = await prisma.campaignTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      versionId: true,
      taskCode: true,
      title: true,
      description: true,
      taskType: true,
      points: true,
      isRequired: true,
    },
  });

  if (!task) {
    throw new TaskEvidenceError("TASK_NOT_FOUND", "Campaign task not found.", 404);
  }

  // 2. Authorization check
  if (targetUserId && targetUserId !== requesterUserId && !isAdmin) {
    throw new TaskEvidenceError(
      "FORBIDDEN",
      "You are not authorized to view evidence submissions for other users.",
      403,
    );
  }

  const effectiveUserId = targetUserId ?? (!isAdmin ? requesterUserId : undefined);

  // 3. Fetch submissions
  const whereClause: { taskId: string; userId?: string } = { taskId: task.id };
  if (effectiveUserId) {
    whereClause.userId = effectiveUserId;
  }

  const submissions = await prisma.evidenceSubmission.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
  });

  // 4. Fetch progress (if specific user targeted)
  let progressRecord = null;
  if (effectiveUserId) {
    progressRecord = await prisma.taskProgress.findUnique({
      where: {
        userId_versionId_taskId: {
          userId: effectiveUserId,
          versionId: task.versionId,
          taskId: task.id,
        },
      },
    });
  }

  return {
    task: {
      id: task.id,
      versionId: task.versionId,
      taskCode: task.taskCode,
      title: task.title,
      description: task.description,
      taskType: task.taskType,
      points: task.points,
      isRequired: task.isRequired,
    },
    progress: progressRecord ? formatTaskProgressOutput(progressRecord) : null,
    submissions: submissions.map(formatEvidenceSubmissionOutput),
  };
}

// Re-export admin evidence functions from server/admin/evidence
export {
  reviewEvidence,
  listAdminEvidence,
  getAdminEvidenceById,
  AdminEvidenceError,
  normalizeReviewStatus,
  normalizeReviewerNotes,
  VALID_REVIEW_DECISIONS,
  type ReviewEvidenceInput,
  type ReviewEvidenceResult,
  type ListEvidenceFilter,
  type ListEvidenceResult,
  type AdminEvidenceSubmissionDetail,
} from "../admin/evidence";
