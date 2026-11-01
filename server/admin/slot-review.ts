import {
  type PrismaClient,
  type Prisma,
  WLSlotReviewStatus,
} from "@prisma/client";
import { recordAuditLog } from "../audit/audit";
import {
  executeQualificationEvaluation,
  REQUIRED_TRAIT_CATEGORIES,
} from "../whitelist/qualification";
import { normalizeXAvatarUrl } from "@/lib/social/x-avatar";

// ---------------------------------------------------------------------------
// Error Class
// ---------------------------------------------------------------------------

export class AdminSlotReviewError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = "AdminSlotReviewError";
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Constants & Types
// ---------------------------------------------------------------------------

export const VALID_SLOT_REVIEW_STATUSES: readonly WLSlotReviewStatus[] = [
  WLSlotReviewStatus.NOT_REVIEWED,
  WLSlotReviewStatus.UNDER_REVIEW,
  WLSlotReviewStatus.VALID,
  WLSlotReviewStatus.FLAGGED,
] as const;

export interface ListGtdSlotsForReviewFilter {
  programId?: string;
  reviewStatus?: WLSlotReviewStatus | string;
  searchAddress?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface GtdSlotReviewUser {
  id: string;
  wallet: { address: string } | null;
  xIdentity: {
    xId: string;
    username: string;
    name: string | null;
    profileImageUrl: string | null;
  } | null;
}

export interface GtdSlotReviewProgram {
  id: string;
  name: string;
  slug: string;
}

export interface GtdSlotReviewItem {
  id: string;
  slotNumber: number;
  programId: string;
  program?: GtdSlotReviewProgram | null;
  userId: string;
  status: string;
  reviewStatus: WLSlotReviewStatus;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
  allocatedAt: Date;
  confirmedAt: Date | null;
  allocatedBy: string | null;
  user: GtdSlotReviewUser;
}

export interface ListGtdSlotsForReviewResult {
  slots: GtdSlotReviewItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface UpdateGtdSlotReviewStatusInput {
  slotId: string;
  reviewStatus: WLSlotReviewStatus | string;
  reviewNotes?: string | null;
  reviewedBy: string;
  reviewedAt?: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface UpdateGtdSlotReviewStatusResult {
  success: true;
  slot: GtdSlotReviewItem;
  auditLogId: string;
}

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

export function normalizeReviewStatus(status: unknown): WLSlotReviewStatus {
  if (typeof status !== "string") {
    throw new AdminSlotReviewError(
      "INVALID_REVIEW_STATUS",
      "Review status must be a string.",
      400,
    );
  }
  const upper = status.trim().toUpperCase();
  if (Object.values(WLSlotReviewStatus).includes(upper as WLSlotReviewStatus)) {
    return upper as WLSlotReviewStatus;
  }
  throw new AdminSlotReviewError(
    "INVALID_REVIEW_STATUS",
    `Invalid review status '${status}'. Must be one of: ${Object.values(WLSlotReviewStatus).join(", ")}.`,
    400,
  );
}

// ---------------------------------------------------------------------------
// Service Functions
// ---------------------------------------------------------------------------

/**
 * Lists GTD whitelist slots for administrative review with pagination, status filter,
 * and user wallet / X identity details.
 */
export async function listGtdSlotsForReview(
  prisma: PrismaClient,
  filter: ListGtdSlotsForReviewFilter = {},
): Promise<ListGtdSlotsForReviewResult> {
  const limit = Math.min(Math.max(1, Number(filter.limit) || 20), 100);
  const offset = Math.max(0, Number(filter.offset) || 0);

  const where: Prisma.WLSlotWhereInput = {};

  if (filter.programId && filter.programId.trim()) {
    where.programId = filter.programId.trim();
  }

  if (filter.reviewStatus) {
    where.reviewStatus = normalizeReviewStatus(filter.reviewStatus);
  }

  const searchParam = filter.searchAddress || filter.search;
  if (searchParam && searchParam.trim()) {
    const rawSearch = searchParam.trim();
    const lowerSearch = rawSearch.toLowerCase();
    where.user = {
      OR: [
        { wallet: { address: { contains: lowerSearch } } },
        { xIdentity: { username: { contains: rawSearch } } },
      ],
    };
  }

  const [total, slots] = await Promise.all([
    prisma.wLSlot.count({ where }),
    prisma.wLSlot.findMany({
      where,
      include: {
        program: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        user: {
          select: {
            id: true,
            wallet: {
              select: {
                address: true,
              },
            },
            xIdentity: {
              select: {
                xId: true,
                username: true,
                name: true,
                profileImageUrl: true,
              },
            },
          },
        },
      },
      orderBy: [{ slotNumber: "asc" }],
      take: limit,
      skip: offset,
    }),
  ]);

  return {
    slots: slots.map((s) => ({
      id: s.id,
      slotNumber: s.slotNumber,
      programId: s.programId,
      program: s.program
        ? {
            id: s.program.id,
            name: s.program.name,
            slug: s.program.slug,
          }
        : null,
      userId: s.userId,
      status: s.status,
      reviewStatus: s.reviewStatus,
      reviewedAt: s.reviewedAt,
      reviewedBy: s.reviewedBy,
      reviewNotes: s.reviewNotes,
      allocatedAt: s.allocatedAt,
      confirmedAt: s.confirmedAt,
      allocatedBy: s.allocatedBy,
      user: s.user
        ? {
            id: s.user.id,
            wallet: s.user.wallet ? { address: s.user.wallet.address } : null,
            xIdentity: s.user.xIdentity
              ? {
                  xId: s.user.xIdentity.xId,
                  username: s.user.xIdentity.username,
                  name: s.user.xIdentity.name,
                  profileImageUrl: s.user.xIdentity.profileImageUrl,
                }
              : null,
          }
        : {
            id: s.userId,
            wallet: null,
            xIdentity: null,
          },
    })),
    total,
    limit,
    offset,
  };
}

/**
 * Updates review status and review notes for a GTD slot in an atomic database transaction.
 * Strictly guarantees that WLSlot.status is unchanged (never revokes or deactivates slot).
 * Records an immutable AuditLog entry with action 'WL_SLOT_REVIEW_STATUS_UPDATED'.
 * Any failure in the AuditLog creation rolls back the review status change.
 */
export async function updateGtdSlotReviewStatus(
  prisma: PrismaClient,
  input: UpdateGtdSlotReviewStatusInput,
): Promise<UpdateGtdSlotReviewStatusResult> {
  if (!input.slotId || typeof input.slotId !== "string" || !input.slotId.trim()) {
    throw new AdminSlotReviewError(
      "SLOT_ID_REQUIRED",
      "Whitelist slot ID is required.",
      400,
    );
  }

  if (
    !input.reviewedBy ||
    typeof input.reviewedBy !== "string" ||
    !input.reviewedBy.trim()
  ) {
    throw new AdminSlotReviewError(
      "REVIEWER_ID_REQUIRED",
      "Reviewer user ID is required.",
      400,
    );
  }

  const targetReviewStatus = normalizeReviewStatus(input.reviewStatus);

  let reviewNotes: string | null | undefined = undefined;
  if (input.reviewNotes !== undefined) {
    if (input.reviewNotes === null) {
      reviewNotes = null;
    } else if (typeof input.reviewNotes === "string") {
      if (input.reviewNotes.length > 2048) {
        throw new AdminSlotReviewError(
          "REVIEW_NOTES_TOO_LONG",
          "Review notes cannot exceed 2048 characters.",
          400,
        );
      }
      reviewNotes = input.reviewNotes;
    } else {
      throw new AdminSlotReviewError(
        "INVALID_REVIEW_NOTES",
        "Review notes must be a string or null.",
        400,
      );
    }
  }

  const now = input.reviewedAt ?? new Date();

  return prisma.$transaction(async (tx) => {
    // 1. Verify reviewer authorization: requires MODERATOR, ADMIN, or SUPER_ADMIN
    const adminRole = await tx.adminRole.findUnique({
      where: { userId: input.reviewedBy },
    });
    const user = adminRole
      ? null
      : await tx.user.findUnique({
          where: { id: input.reviewedBy },
          select: { role: true },
        });

    const role = adminRole?.roleType ?? user?.role;
    const allowedRoles = ["MODERATOR", "ADMIN", "SUPER_ADMIN"];
    if (!role || !allowedRoles.includes(role)) {
      throw new AdminSlotReviewError(
        "FORBIDDEN",
        `Requires MODERATOR, ADMIN, or SUPER_ADMIN role. Current role: ${role ?? "NONE"}.`,
        403,
      );
    }

    // 2. Fetch existing slot
    const existingSlot = await tx.wLSlot.findUnique({
      where: { id: input.slotId },
      include: {
        program: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        user: {
          select: {
            id: true,
            wallet: { select: { address: true } },
            xIdentity: {
              select: {
                xId: true,
                username: true,
                name: true,
                profileImageUrl: true,
              },
            },
          },
        },
      },
    });

    if (!existingSlot) {
      throw new AdminSlotReviewError(
        "SLOT_NOT_FOUND",
        `Whitelist slot not found (id: ${input.slotId}).`,
        404,
      );
    }

    // 3. Update slot review status WITHOUT altering slot.status
    const updatedSlot = await tx.wLSlot.update({
      where: { id: input.slotId },
      data: {
        reviewStatus: targetReviewStatus,
        reviewedAt: now,
        reviewedBy: input.reviewedBy,
        ...(reviewNotes !== undefined ? { reviewNotes } : {}),
      },
      include: {
        program: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        user: {
          select: {
            id: true,
            wallet: { select: { address: true } },
            xIdentity: {
              select: {
                xId: true,
                username: true,
                name: true,
                profileImageUrl: true,
              },
            },
          },
        },
      },
    });

    // 4. Record AuditLog in the exact same transaction
    const audit = await recordAuditLog(tx, {
      actorId: input.reviewedBy,
      actorIp: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      action: "WL_SLOT_REVIEW_STATUS_UPDATED",
      entityType: "WLSlot",
      entityId: existingSlot.id,
      oldValues: {
        reviewStatus: existingSlot.reviewStatus,
        reviewedAt: existingSlot.reviewedAt
          ? existingSlot.reviewedAt.toISOString()
          : null,
        reviewedBy: existingSlot.reviewedBy,
        reviewNotes: existingSlot.reviewNotes,
      },
      newValues: {
        reviewStatus: targetReviewStatus,
        reviewedAt: now.toISOString(),
        reviewedBy: input.reviewedBy,
        reviewNotes:
          reviewNotes !== undefined ? reviewNotes : existingSlot.reviewNotes,
      },
      metadata: {
        programId: existingSlot.programId,
        slotNumber: existingSlot.slotNumber,
        targetUserId: existingSlot.userId,
        status: existingSlot.status,
      },
    });

    return {
      success: true,
      slot: {
        id: updatedSlot.id,
        slotNumber: updatedSlot.slotNumber,
        programId: updatedSlot.programId,
        program: updatedSlot.program
          ? {
              id: updatedSlot.program.id,
              name: updatedSlot.program.name,
              slug: updatedSlot.program.slug,
            }
          : null,
        userId: updatedSlot.userId,
        status: updatedSlot.status,
        reviewStatus: updatedSlot.reviewStatus,
        reviewedAt: updatedSlot.reviewedAt,
        reviewedBy: updatedSlot.reviewedBy,
        reviewNotes: updatedSlot.reviewNotes,
        allocatedAt: updatedSlot.allocatedAt,
        confirmedAt: updatedSlot.confirmedAt,
        allocatedBy: updatedSlot.allocatedBy,
        user: updatedSlot.user
          ? {
              id: updatedSlot.user.id,
              wallet: updatedSlot.user.wallet
                ? { address: updatedSlot.user.wallet.address }
                : null,
              xIdentity: updatedSlot.user.xIdentity
                ? {
                    xId: updatedSlot.user.xIdentity.xId,
                    username: updatedSlot.user.xIdentity.username,
                    name: updatedSlot.user.xIdentity.name,
                    profileImageUrl: updatedSlot.user.xIdentity.profileImageUrl,
                  }
                : null,
            }
          : {
              id: updatedSlot.userId,
              wallet: null,
              xIdentity: null,
            },
      },
      auditLogId: audit.id,
    };
  });
}

export interface GtdSlotReviewDetailResult {
  slot: {
    id: string;
    slotNumber: number;
    programId: string;
    program?: GtdSlotReviewProgram | null;
    userId: string;
    status: string;
    reviewStatus: WLSlotReviewStatus;
    reviewedAt: Date | null;
    reviewedBy: string | null;
    reviewNotes: string | null;
    allocatedAt: Date;
    confirmedAt: Date | null;
    allocatedBy: string | null;
    user: GtdSlotReviewUser & { isBanned: boolean };
  };
  traits: {
    heldCategories: string[];
    heldCategoriesCount: number;
    missingCategories: string[];
    hasAllCategories: boolean;
  };
  campaigns: {
    completedMandatoryTasksCount: number;
    totalMandatoryTasksCount: number;
    tasksCompleted: boolean;
    submissions: Array<{
      id: string;
      taskId: string;
      taskTitle: string;
      status: string;
      payload: string;
      reviewerNotes: string | null;
      reviewedAt: Date | null;
      createdAt: Date;
    }>;
  };
  auditHistory: Array<{
    id: string;
    action: string;
    actorId: string | null;
    actor: {
      id: string;
      role: string;
      address?: string | null;
      username?: string | null;
    } | null;
    oldValues: any;
    newValues: any;
    metadata: any;
    createdAt: Date;
  }>;
}

/**
 * Retrieves full GTD slot review details for Review Details Modal (Task 6.3):
 * user profile (wallet & X), 5 trait categories, campaign task evidence submissions,
 * and slot-specific review AuditLog history.
 */
export async function getGtdSlotReviewDetail(
  prisma: PrismaClient,
  slotId: string,
  now: Date = new Date(),
): Promise<GtdSlotReviewDetailResult> {
  if (!slotId || typeof slotId !== "string" || !slotId.trim()) {
    throw new AdminSlotReviewError("SLOT_ID_REQUIRED", "Slot ID is required.", 400);
  }

  const slot = await prisma.wLSlot.findUnique({
    where: { id: slotId.trim() },
    include: {
      program: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      user: {
        select: {
          id: true,
          isBanned: true,
          wallet: {
            select: { address: true },
          },
          xIdentity: {
            select: {
              xId: true,
              username: true,
              name: true,
              profileImageUrl: true,
            },
          },
          banRecords: {
            where: { isActive: true },
          },
        },
      },
    },
  });

  if (!slot) {
    throw new AdminSlotReviewError("SLOT_NOT_FOUND", "Whitelist slot not found.", 404);
  }

  const user = slot.user;
  const isBanned = Boolean(user?.isBanned || (user?.banRecords && user.banRecords.length > 0));

  // 1. Evaluate Trait categories and campaign tasks
  let qualDetails;
  try {
    const qual = await executeQualificationEvaluation(
      prisma,
      {
        userId: slot.userId,
        programId: slot.programId,
        readOnly: true,
        allowClosed: true,
      },
      now,
    );
    qualDetails = qual.details;
  } catch {
    qualDetails = {
      heldCategories: [],
      missingCategories: REQUIRED_TRAIT_CATEGORIES,
      completedMandatoryTasksCount: 0,
      totalMandatoryTasksCount: 0,
    };
  }

  const heldCategories = qualDetails?.heldCategories ?? [];
  const missingCategories = qualDetails?.missingCategories ?? REQUIRED_TRAIT_CATEGORIES;
  const completedTasksCount = qualDetails?.completedMandatoryTasksCount ?? 0;
  const totalTasksCount = qualDetails?.totalMandatoryTasksCount ?? 0;

  // 2. Query evidence submissions for user
  const submissions = await prisma.evidenceSubmission.findMany({
    where: { userId: slot.userId },
    include: {
      task: {
        select: { title: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // 3. Query AuditLog history specific to this WLSlot
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      entityType: "WLSlot",
      entityId: slot.id,
    },
    include: {
      actor: {
        select: {
          id: true,
          role: true,
          wallet: { select: { address: true } },
          xIdentity: { select: { username: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return {
    slot: {
      id: slot.id,
      slotNumber: slot.slotNumber,
      programId: slot.programId,
      program: slot.program,
      userId: slot.userId,
      status: slot.status,
      reviewStatus: slot.reviewStatus,
      reviewedAt: slot.reviewedAt,
      reviewedBy: slot.reviewedBy,
      reviewNotes: slot.reviewNotes,
      allocatedAt: slot.allocatedAt,
      confirmedAt: slot.confirmedAt,
      allocatedBy: slot.allocatedBy,
      user: {
        id: slot.userId,
        wallet: user?.wallet ? { address: user.wallet.address } : null,
        xIdentity: user?.xIdentity
          ? {
              xId: user.xIdentity.xId,
              username: user.xIdentity.username,
              name: user.xIdentity.name,
              profileImageUrl: normalizeXAvatarUrl(user.xIdentity.profileImageUrl),
            }
          : null,
        isBanned,
      },
    },
    traits: {
      heldCategories,
      heldCategoriesCount: heldCategories.length,
      missingCategories,
      hasAllCategories: heldCategories.length >= REQUIRED_TRAIT_CATEGORIES.length,
    },
    campaigns: {
      completedMandatoryTasksCount: completedTasksCount,
      totalMandatoryTasksCount: totalTasksCount,
      tasksCompleted: totalTasksCount > 0 ? completedTasksCount >= totalTasksCount : true,
      submissions: submissions.map((sub) => ({
        id: sub.id,
        taskId: sub.taskId,
        taskTitle: sub.task.title,
        status: sub.status,
        payload: sub.payload,
        reviewerNotes: sub.reviewerNotes,
        reviewedAt: sub.reviewedAt,
        createdAt: sub.createdAt,
      })),
    },
    auditHistory: auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      actorId: log.actorId,
      actor: log.actor
        ? {
            id: log.actor.id,
            role: log.actor.role,
            address: log.actor.wallet?.address ?? null,
            username: log.actor.xIdentity?.username ?? null,
          }
        : null,
      oldValues: log.oldValues,
      newValues: log.newValues,
      metadata: log.metadata,
      createdAt: log.createdAt,
    })),
  };
}

