import type { PrismaClient, BanType, BanScope } from "@prisma/client";
import { recordAuditLog } from "../audit/audit";

export class AdminBanError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = "AdminBanError";
    this.code = code;
    this.status = status;
  }
}

export const VALID_BAN_TYPES: BanType[] = [
  "PERMANENT",
  "TEMPORARY",
  "SHADOWBAN",
  "FEATURE_RESTRICTION",
];

export const VALID_BAN_SCOPES: BanScope[] = [
  "FULL_SYSTEM",
  "CLAIM_RESTRICTED",
  "GIFT_RESTRICTED",
  "WL_DISQUALIFIED",
];

export interface AdminBanUserInput {
  userId: string;
  adminUserId: string;
  reason: string;
  banType?: BanType | string;
  scope?: BanScope | string;
  evidence?: string | null;
  expiresAt?: Date | string | null;
  now?: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AdminBanResult {
  success: true;
  userId: string;
  isBanned: boolean;
  alreadyBanned: boolean;
  banRecord: {
    id: string;
    userId: string;
    banType: BanType;
    scope: BanScope;
    reason: string;
    evidence: string | null;
    issuedById: string;
    issuedAt: Date;
    expiresAt: Date | null;
    isActive: boolean;
  };
  auditLogId?: string | null;
}

export function validateAdminBanInput(input: AdminBanUserInput): {
  userId: string;
  adminUserId: string;
  reason: string;
  banType: BanType;
  scope: BanScope;
  evidence: string | null;
  expiresAt: Date | null;
} {
  if (!input.userId || typeof input.userId !== "string" || !input.userId.trim()) {
    throw new AdminBanError("INVALID_INPUT", "Target userId is required.", 400);
  }

  if (!input.adminUserId || typeof input.adminUserId !== "string" || !input.adminUserId.trim()) {
    throw new AdminBanError("UNAUTHORIZED", "Admin authentication is required.", 401);
  }

  if (!input.reason || typeof input.reason !== "string" || !input.reason.trim()) {
    throw new AdminBanError("INVALID_INPUT", "A non-empty ban reason is required.", 400);
  }

  const banType = (input.banType ?? "PERMANENT") as BanType;
  if (!VALID_BAN_TYPES.includes(banType)) {
    throw new AdminBanError(
      "INVALID_BAN_TYPE",
      `Invalid ban type "${String(input.banType)}". Valid types: ${VALID_BAN_TYPES.join(", ")}.`,
      400,
    );
  }

  const scope = (input.scope ?? "FULL_SYSTEM") as BanScope;
  if (!VALID_BAN_SCOPES.includes(scope)) {
    throw new AdminBanError(
      "INVALID_BAN_SCOPE",
      `Invalid ban scope "${String(input.scope)}". Valid scopes: ${VALID_BAN_SCOPES.join(", ")}.`,
      400,
    );
  }

  let expiresAt: Date | null = null;
  if (input.expiresAt !== undefined && input.expiresAt !== null) {
    expiresAt = new Date(input.expiresAt);
    if (isNaN(expiresAt.getTime())) {
      throw new AdminBanError("INVALID_INPUT", "Invalid expiresAt timestamp.", 400);
    }
  }

  const now = input.now ?? new Date();

  if (banType === "TEMPORARY") {
    if (!expiresAt) {
      throw new AdminBanError(
        "INVALID_INPUT",
        "Temporary bans require a valid future expiresAt timestamp.",
        400,
      );
    }
    if (expiresAt.getTime() <= now.getTime()) {
      throw new AdminBanError(
        "INVALID_INPUT",
        "expiresAt must be a date in the future.",
        400,
      );
    }
  }

  return {
    userId: input.userId.trim(),
    adminUserId: input.adminUserId.trim(),
    reason: input.reason.trim(),
    banType,
    scope,
    evidence: input.evidence ? input.evidence.trim() || null : null,
    expiresAt,
  };
}

/**
 * Execute an Admin Ban operation atomically with strict audit logging.
 *
 * Enforces:
 * 1. Target user existence.
 * 2. Protection against self-banning.
 * 3. Protection of super admin accounts.
 * 4. Role privilege checks (admins cannot ban other admins without super admin role).
 * 5. Idempotent handling of repeated active bans with identical or encompassing scope.
 * 6. Setting `user.isBanned = true` and immediately invalidating active auth sessions
 *    when the ban scope is FULL_SYSTEM.
 * 7. Creation of an active BanRecord.
 * 8. Transaction-scoped AuditLog recording with failure propagation (fails closed).
 * 9. Preservation of existing successful claims, inventory, and allocated WL slots (Slot Revoke is Task 1-E).
 */
export async function banUser(
  prisma: PrismaClient,
  rawInput: AdminBanUserInput,
): Promise<AdminBanResult> {
  const validated = validateAdminBanInput(rawInput);
  const now = rawInput.now ?? new Date();

  return await prisma.$transaction(async (tx) => {
    // 1. Fetch target user with adminRole
    const targetUser = await tx.user.findUnique({
      where: { id: validated.userId },
      include: {
        adminRole: true,
      },
    });

    if (!targetUser) {
      throw new AdminBanError("USER_NOT_FOUND", "Target user does not exist.", 404);
    }

    // 2. Prevent self-banning
    if (targetUser.id === validated.adminUserId) {
      throw new AdminBanError(
        "CANNOT_BAN_SELF",
        "Administrators cannot ban their own account.",
        400,
      );
    }

    // 3. Authority checks on administrative target accounts
    if (targetUser.role === "SUPER_ADMIN" || targetUser.adminRole?.roleType === "SUPER_ADMIN") {
      throw new AdminBanError(
        "CANNOT_BAN_SUPER_ADMIN",
        "Super administrators cannot be banned.",
        403,
      );
    }

    if (targetUser.role === "ADMIN" || targetUser.adminRole?.roleType === "ADMIN") {
      const actingAdminRole = await tx.adminRole.findUnique({
        where: { userId: validated.adminUserId },
      });
      if (!actingAdminRole || actingAdminRole.roleType !== "SUPER_ADMIN") {
        throw new AdminBanError(
          "INSUFFICIENT_PRIVILEGE",
          "Only super administrators can ban administrative accounts.",
          403,
        );
      }
    }

    // 4. Idempotency: Check if an active non-expired ban already exists with the same scope
    const existingActiveBan = await tx.banRecord.findFirst({
      where: {
        userId: targetUser.id,
        isActive: true,
        scope: validated.scope,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    if (existingActiveBan && (!existingActiveBan.expiresAt || existingActiveBan.expiresAt > now)) {
      return {
        success: true,
        userId: targetUser.id,
        isBanned: targetUser.isBanned,
        alreadyBanned: true,
        banRecord: {
          id: existingActiveBan.id,
          userId: existingActiveBan.userId,
          banType: existingActiveBan.banType,
          scope: existingActiveBan.scope,
          reason: existingActiveBan.reason,
          evidence: existingActiveBan.evidence,
          issuedById: existingActiveBan.issuedById,
          issuedAt: existingActiveBan.issuedAt,
          expiresAt: existingActiveBan.expiresAt,
          isActive: existingActiveBan.isActive,
        },
        auditLogId: null,
      };
    }

    // Also check if an active FULL_SYSTEM non-expired ban already exists when requesting a narrower feature scope
    if (validated.scope !== "FULL_SYSTEM") {
      const existingFullSystemBan = await tx.banRecord.findFirst({
        where: {
          userId: targetUser.id,
          isActive: true,
          scope: "FULL_SYSTEM",
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      });

      if (existingFullSystemBan && (!existingFullSystemBan.expiresAt || existingFullSystemBan.expiresAt > now)) {
        return {
          success: true,
          userId: targetUser.id,
          isBanned: targetUser.isBanned,
          alreadyBanned: true,
          banRecord: {
            id: existingFullSystemBan.id,
            userId: existingFullSystemBan.userId,
            banType: existingFullSystemBan.banType,
            scope: existingFullSystemBan.scope,
            reason: existingFullSystemBan.reason,
            evidence: existingFullSystemBan.evidence,
            issuedById: existingFullSystemBan.issuedById,
            issuedAt: existingFullSystemBan.issuedAt,
            expiresAt: existingFullSystemBan.expiresAt,
            isActive: existingFullSystemBan.isActive,
          },
          auditLogId: null,
        };
      }
    }

    // 5. Create new BanRecord
    const banRecord = await tx.banRecord.create({
      data: {
        userId: targetUser.id,
        banType: validated.banType,
        scope: validated.scope,
        reason: validated.reason,
        evidence: validated.evidence,
        issuedById: validated.adminUserId,
        issuedAt: now,
        expiresAt: validated.expiresAt,
        isActive: true,
      },
    });

    // 6. State updates for FULL_SYSTEM scope
    let updatedIsBanned = targetUser.isBanned;
    let revokedSessionsCount = 0;
    if (validated.scope === "FULL_SYSTEM") {
      // Set persistent User.isBanned = true only for PERMANENT bans.
      // Temporary bans rely on BanRecord with expiresAt to ensure login capability is naturally restored after expiry.
      if (validated.banType === "PERMANENT") {
        if (!targetUser.isBanned) {
          await tx.user.update({
            where: { id: targetUser.id },
            data: { isBanned: true },
          });
          updatedIsBanned = true;
        }
      }

      const revokeResult = await tx.authSession.updateMany({
        where: { userId: targetUser.id, revokedAt: null },
        data: { revokedAt: now },
      });
      revokedSessionsCount = revokeResult.count;
    }

    // 7. Record immutable AuditLog inside the transaction
    const auditRecord = await recordAuditLog(tx, {
      actorId: validated.adminUserId,
      actorIp: rawInput.ipAddress ?? null,
      userAgent: rawInput.userAgent ?? null,
      action: "BAN_USER",
      entityType: "User",
      entityId: targetUser.id,
      oldValues: {
        isBanned: targetUser.isBanned,
      },
      newValues: {
        isBanned: updatedIsBanned,
        banRecordId: banRecord.id,
        banType: banRecord.banType,
        scope: banRecord.scope,
        reason: banRecord.reason,
        expiresAt: banRecord.expiresAt ? banRecord.expiresAt.toISOString() : null,
      },
      metadata: {
        targetUserId: targetUser.id,
        adminUserId: validated.adminUserId,
        banRecordId: banRecord.id,
        banType: banRecord.banType,
        scope: banRecord.scope,
        reason: banRecord.reason,
        evidence: banRecord.evidence,
        revokedSessionsCount,
        bannedAt: now.toISOString(),
      },
    });

    return {
      success: true,
      userId: targetUser.id,
      isBanned: updatedIsBanned,
      alreadyBanned: false,
      banRecord: {
        id: banRecord.id,
        userId: banRecord.userId,
        banType: banRecord.banType,
        scope: banRecord.scope,
        reason: banRecord.reason,
        evidence: banRecord.evidence,
        issuedById: banRecord.issuedById,
        issuedAt: banRecord.issuedAt,
        expiresAt: banRecord.expiresAt,
        isActive: banRecord.isActive,
      },
      auditLogId: auditRecord.id,
    };
  });
}
