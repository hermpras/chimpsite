import type {
  PrismaClient,
  AbuseFlag,
  AbuseFlagStatus,
  AbuseFlagType,
  AbuseSeverity,
  Prisma,
} from "@prisma/client";
import { recordAuditLog } from "../audit/audit";

// ---------------------------------------------------------------------------
// Error Class
// ---------------------------------------------------------------------------

export class AdminAbuseFlagError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = "AdminAbuseFlagError";
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Constants & Allowed Enums
// ---------------------------------------------------------------------------

export const VALID_ABUSE_FLAG_STATUSES: readonly AbuseFlagStatus[] = [
  "OPEN",
  "UNDER_REVIEW",
  "DISMISSED",
  "CONFIRMED_ACTION_TAKEN",
] as const;

export const VALID_ABUSE_FLAG_TYPES: readonly AbuseFlagType[] = [
  "SYBIL_WALLET_CLUSTER",
  "BOT_ACTIVITY",
  "X_ACCOUNT_MISMATCH",
  "RAPID_CLAIM_ATTEMPT",
  "SUSPICIOUS_GIFT_LOOP",
  "OTHER",
] as const;

export const VALID_ABUSE_SEVERITIES: readonly AbuseSeverity[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ListAbuseFlagsFilter {
  status?: AbuseFlagStatus | string;
  flagType?: AbuseFlagType | string;
  severity?: AbuseSeverity | string;
  userId?: string;
  limit?: number;
  offset?: number;
}

export interface AdminAbuseFlagUserDetail {
  id: string;
  isBanned: boolean;
  role: string;
  wallet?: { address: string } | null;
  xIdentity?: { username: string } | null;
}

export interface AdminAbuseFlagReviewerDetail {
  id: string;
  role: string;
  wallet?: { address: string } | null;
}

export interface AdminAbuseFlagDetail extends AbuseFlag {
  user?: AdminAbuseFlagUserDetail | null;
  reviewedBy?: AdminAbuseFlagReviewerDetail | null;
}

export interface ListAbuseFlagsResult {
  flags: AdminAbuseFlagDetail[];
  total: number;
  limit: number;
  offset: number;
}

export interface UpdateAbuseFlagInput {
  flagId: string;
  adminUserId: string;
  status: AbuseFlagStatus | string;
  resolutionNotes?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  now?: Date;
}

export interface UpdateAbuseFlagResult {
  success: true;
  flag: AdminAbuseFlagDetail;
  auditLogId: string;
}

// ---------------------------------------------------------------------------
// Normalization & Validation Helpers
// ---------------------------------------------------------------------------

export function normalizeAbuseFlagStatus(status: unknown): AbuseFlagStatus {
  if (typeof status !== "string") {
    throw new AdminAbuseFlagError(
      "INVALID_STATUS",
      "Status must be a string.",
      400,
    );
  }

  const upper = status.trim().toUpperCase() as AbuseFlagStatus;
  if (!VALID_ABUSE_FLAG_STATUSES.includes(upper)) {
    throw new AdminAbuseFlagError(
      "INVALID_STATUS",
      `Invalid status '${status}'. Valid statuses are: ${VALID_ABUSE_FLAG_STATUSES.join(", ")}.`,
      400,
    );
  }

  return upper;
}

export function normalizeResolutionNotes(notes: unknown): string | null {
  if (notes === undefined || notes === null) return null;
  if (typeof notes !== "string") {
    throw new AdminAbuseFlagError(
      "INVALID_RESOLUTION_NOTES",
      "Resolution notes must be a string.",
      400,
    );
  }

  const trimmed = notes.trim();
  if (trimmed.length > 2048) {
    throw new AdminAbuseFlagError(
      "INVALID_RESOLUTION_NOTES",
      "Resolution notes must not exceed 2048 characters.",
      400,
    );
  }

  return trimmed.length > 0 ? trimmed : null;
}

// ---------------------------------------------------------------------------
// Service Functions
// ---------------------------------------------------------------------------

/**
 * Lists AbuseFlag records with filtering by status, flagType, severity, userId and pagination.
 */
export async function listAbuseFlags(
  prisma: PrismaClient,
  filters: ListAbuseFlagsFilter = {},
): Promise<ListAbuseFlagsResult> {
  const where: Prisma.AbuseFlagWhereInput = {};

  if (filters.status) {
    where.status = normalizeAbuseFlagStatus(filters.status);
  }

  if (filters.flagType) {
    const upperType = String(filters.flagType).trim().toUpperCase() as AbuseFlagType;
    if (!VALID_ABUSE_FLAG_TYPES.includes(upperType)) {
      throw new AdminAbuseFlagError(
        "INVALID_FILTER",
        `Invalid flagType '${filters.flagType}'. Valid types are: ${VALID_ABUSE_FLAG_TYPES.join(", ")}.`,
        400,
      );
    }
    where.flagType = upperType;
  }

  if (filters.severity) {
    const upperSeverity = String(filters.severity).trim().toUpperCase() as AbuseSeverity;
    if (!VALID_ABUSE_SEVERITIES.includes(upperSeverity)) {
      throw new AdminAbuseFlagError(
        "INVALID_FILTER",
        `Invalid severity '${filters.severity}'. Valid severities are: ${VALID_ABUSE_SEVERITIES.join(", ")}.`,
        400,
      );
    }
    where.severity = upperSeverity;
  }

  if (filters.userId && typeof filters.userId === "string") {
    const trimmedUser = filters.userId.trim();
    if (trimmedUser) {
      where.userId = trimmedUser;
    }
  }

  const limit = Math.max(1, Math.min(100, filters.limit ?? 50));
  const offset = Math.max(0, filters.offset ?? 0);

  const [total, flags] = await Promise.all([
    prisma.abuseFlag.count({ where }),
    prisma.abuseFlag.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            isBanned: true,
            role: true,
            wallet: { select: { address: true } },
            xIdentity: { select: { username: true } },
          },
        },
        reviewedBy: {
          select: {
            id: true,
            role: true,
            wallet: { select: { address: true } },
          },
        },
      },
    }),
  ]);

  return {
    flags: flags as AdminAbuseFlagDetail[],
    total,
    limit,
    offset,
  };
}

/**
 * Retrieves a single AbuseFlag with user and reviewer details.
 */
export async function getAbuseFlagById(
  prisma: PrismaClient,
  flagId: string,
): Promise<AdminAbuseFlagDetail> {
  if (!flagId || typeof flagId !== "string" || !flagId.trim()) {
    throw new AdminAbuseFlagError("MISSING_FLAG_ID", "flagId is required.", 400);
  }

  const flag = await prisma.abuseFlag.findUnique({
    where: { id: flagId.trim() },
    include: {
      user: {
        select: {
          id: true,
          isBanned: true,
          role: true,
          wallet: { select: { address: true } },
          xIdentity: { select: { username: true } },
        },
      },
      reviewedBy: {
        select: {
          id: true,
          role: true,
          wallet: { select: { address: true } },
        },
      },
    },
  });

  if (!flag) {
    throw new AdminAbuseFlagError("FLAG_NOT_FOUND", "Abuse flag not found.", 404);
  }

  return flag as AdminAbuseFlagDetail;
}

/**
 * Updates an AbuseFlag status and resolution notes, recording an AuditLog within the transaction.
 */
export async function updateAbuseFlag(
  prisma: PrismaClient,
  input: UpdateAbuseFlagInput,
): Promise<UpdateAbuseFlagResult> {
  if (!input.flagId || typeof input.flagId !== "string" || !input.flagId.trim()) {
    throw new AdminAbuseFlagError("MISSING_FLAG_ID", "flagId is required.", 400);
  }
  if (!input.adminUserId || typeof input.adminUserId !== "string" || !input.adminUserId.trim()) {
    throw new AdminAbuseFlagError("MISSING_ADMIN_USER_ID", "adminUserId is required.", 400);
  }

  const targetStatus = normalizeAbuseFlagStatus(input.status);
  const normalizedNotes = normalizeResolutionNotes(input.resolutionNotes);
  const now = input.now ?? new Date();

  return await prisma.$transaction(async (tx) => {
    // 1. Verify existence of flag
    const existing = await tx.abuseFlag.findUnique({
      where: { id: input.flagId.trim() },
    });

    if (!existing) {
      throw new AdminAbuseFlagError("FLAG_NOT_FOUND", "Abuse flag not found.", 404);
    }

    // 2. Perform update
    const updatedFlag = await tx.abuseFlag.update({
      where: { id: existing.id },
      data: {
        status: targetStatus,
        resolutionNotes:
          input.resolutionNotes !== undefined ? normalizedNotes : existing.resolutionNotes,
        reviewedById: input.adminUserId,
        reviewedAt: now,
      },
      include: {
        user: {
          select: {
            id: true,
            isBanned: true,
            role: true,
            wallet: { select: { address: true } },
            xIdentity: { select: { username: true } },
          },
        },
        reviewedBy: {
          select: {
            id: true,
            role: true,
            wallet: { select: { address: true } },
          },
        },
      },
    });

    // 3. Record AuditLog inside transaction
    const audit = await recordAuditLog(tx, {
      actorId: input.adminUserId,
      actorIp: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      action: "ABUSE_FLAG_UPDATED",
      entityType: "AbuseFlag",
      entityId: existing.id,
      oldValues: {
        status: existing.status,
        resolutionNotes: existing.resolutionNotes,
        reviewedById: existing.reviewedById,
        reviewedAt: existing.reviewedAt ? existing.reviewedAt.toISOString() : null,
      },
      newValues: {
        status: targetStatus,
        resolutionNotes: updatedFlag.resolutionNotes,
        reviewedById: input.adminUserId,
        reviewedAt: now.toISOString(),
      },
      metadata: {
        flagType: existing.flagType,
        severity: existing.severity,
        userId: existing.userId,
      },
    });

    return {
      success: true as const,
      flag: updatedFlag as AdminAbuseFlagDetail,
      auditLogId: audit.id,
    };
  });
}
