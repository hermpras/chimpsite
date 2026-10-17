import type { PrismaClient } from "@prisma/client";
import { recordAuditLog } from "../audit/audit";

export class WlSlotRevokeError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = "WlSlotRevokeError";
    this.code = code;
    this.status = status;
  }
}

export const AdminSlotRevokeError = WlSlotRevokeError;

export interface RevokeWlSlotInput {
  slotId?: string;
  programId?: string;
  userId?: string;
  slotNumber?: number;
  adminUserId: string;
  reason?: string | null;
  now?: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface RevokeWlSlotResult {
  success: true;
  slotId: string;
  programId: string;
  userId: string;
  slotNumber: number;
  previousStatus: string;
  status: "REVOKED_MANUAL_ADMIN";
  revokedAt: Date;
  reason: string | null;
  auditLogId: string;
}

export function validateRevokeWlSlotInput(input: RevokeWlSlotInput): {
  slotId?: string;
  programId?: string;
  userId?: string;
  slotNumber?: number;
  adminUserId: string;
  reason: string | null;
} {
  if (!input.adminUserId || typeof input.adminUserId !== "string" || !input.adminUserId.trim()) {
    throw new WlSlotRevokeError("UNAUTHORIZED", "Admin authentication is required.", 401);
  }

  const slotId = input.slotId && typeof input.slotId === "string" ? input.slotId.trim() : undefined;
  const programId =
    input.programId && typeof input.programId === "string" ? input.programId.trim() : undefined;
  const userId = input.userId && typeof input.userId === "string" ? input.userId.trim() : undefined;
  const slotNumber =
    typeof input.slotNumber === "number" &&
    Number.isInteger(input.slotNumber) &&
    input.slotNumber > 0
      ? input.slotNumber
      : undefined;

  if (!slotId && (!programId || (!userId && !slotNumber))) {
    throw new WlSlotRevokeError(
      "INVALID_INPUT",
      "A valid slotId or (programId with userId or slotNumber) is required.",
      400,
    );
  }

  if (input.reason !== undefined && input.reason !== null && typeof input.reason !== "string") {
    throw new WlSlotRevokeError("INVALID_INPUT", "Reason must be a string.", 400);
  }

  const reason = input.reason ? input.reason.trim() || null : null;

  return {
    slotId,
    programId,
    userId,
    slotNumber,
    adminUserId: input.adminUserId.trim(),
    reason,
  };
}

/**
 * Revoke an allocated Whitelist slot atomically.
 *
 * Enforces:
 * 1. Admin caller authentication and valid input.
 * 2. Target slot existence.
 * 3. Prevention of revoking already revoked slots (409 conflict).
 * 4. Conditional atomic state transition from ALLOCATED/CONFIRMED to REVOKED_MANUAL_ADMIN.
 * 5. Synchronous decrement of WLProgram.allocatedSlotsCount to preserve capacity consistency.
 * 6. Synchronous transition of WLQualification to REVOKED (if record exists).
 * 7. Creation of WLStatusHistory audit trail entry (SLOT_ALLOCATED -> REVOKED).
 * 8. Transaction-scoped AuditLog recording with fail-closed rollback.
 */
export async function revokeWlSlot(
  prisma: PrismaClient,
  rawInput: RevokeWlSlotInput,
): Promise<RevokeWlSlotResult> {
  const validated = validateRevokeWlSlotInput(rawInput);
  const now = rawInput.now ?? new Date();

  return await prisma.$transaction(async (tx) => {
    // 1. Fetch target slot
    let slot: any = null;
    if (validated.slotId) {
      slot = await tx.wLSlot.findUnique({
        where: { id: validated.slotId },
        include: { program: true },
      });
    } else if (validated.programId && validated.userId) {
      slot = await tx.wLSlot.findUnique({
        where: {
          programId_userId: {
            programId: validated.programId,
            userId: validated.userId,
          },
        },
        include: { program: true },
      });
    } else if (validated.programId && validated.slotNumber) {
      slot = await tx.wLSlot.findUnique({
        where: {
          programId_slotNumber: {
            programId: validated.programId,
            slotNumber: validated.slotNumber,
          },
        },
        include: { program: true },
      });
    }

    if (!slot) {
      throw new WlSlotRevokeError("SLOT_NOT_FOUND", "Whitelist slot was not found.", 404);
    }

    // 2. State verification
    if (slot.status === "REVOKED_MANUAL_ADMIN") {
      throw new WlSlotRevokeError(
        "SLOT_ALREADY_REVOKED",
        "Whitelist slot is already revoked.",
        409,
      );
    }

    if (slot.status !== "ALLOCATED" && slot.status !== "CONFIRMED") {
      throw new WlSlotRevokeError(
        "INVALID_SLOT_STATUS",
        `Whitelist slot cannot be revoked from status "${slot.status}".`,
        400,
      );
    }

    // 3. Conditional atomic state transition to prevent race conditions
    const updateResult = await tx.wLSlot.updateMany({
      where: {
        id: slot.id,
        status: { in: ["ALLOCATED", "CONFIRMED"] },
      },
      data: {
        status: "REVOKED_MANUAL_ADMIN",
        notes: validated.reason ?? slot.notes,
      },
    });

    if (updateResult.count === 0) {
      throw new WlSlotRevokeError(
        "SLOT_ALREADY_REVOKED",
        "Whitelist slot is already revoked.",
        409,
      );
    }

    // 4. Decrement allocatedSlotsCount on WLProgram to restore capacity consistency
    const program = await tx.wLProgram.findUnique({
      where: { id: slot.programId },
      select: { id: true, allocatedSlotsCount: true },
    });
    if (program && program.allocatedSlotsCount > 0) {
      await tx.wLProgram.update({
        where: { id: slot.programId },
        data: { allocatedSlotsCount: { decrement: 1 } },
      });
    }

    // 5. Update WLQualification status to REVOKED if qualification record exists
    const existingQual = await tx.wLQualification.findUnique({
      where: {
        programId_userId: {
          programId: slot.programId,
          userId: slot.userId,
        },
      },
    });

    if (existingQual) {
      await tx.wLQualification.update({
        where: { id: existingQual.id },
        data: {
          status: "REVOKED",
          disqualifiedAt: now,
          reason: validated.reason ?? "Revoked by administrator",
        },
      });
    }

    // 6. Record WLStatusHistory
    await tx.wLStatusHistory.create({
      data: {
        programId: slot.programId,
        userId: slot.userId,
        fromPhase: "SLOT_ALLOCATED",
        toPhase: "REVOKED",
        action: "SLOT_REVOKED_MANUAL_ADMIN",
        actorId: validated.adminUserId,
        metadata: {
          slotId: slot.id,
          slotNumber: slot.slotNumber,
          reason: validated.reason,
          revokedAt: now.toISOString(),
        },
        createdAt: now,
      },
    });

    // 7. Record immutable AuditLog inside the transaction
    const auditRecord = await recordAuditLog(tx, {
      actorId: validated.adminUserId,
      actorIp: rawInput.ipAddress ?? null,
      userAgent: rawInput.userAgent ?? null,
      action: "REVOKE_WL_SLOT",
      entityType: "WLSlot",
      entityId: slot.id,
      oldValues: {
        status: slot.status,
        notes: slot.notes,
      },
      newValues: {
        status: "REVOKED_MANUAL_ADMIN",
        notes: validated.reason ?? slot.notes,
      },
      metadata: {
        programId: slot.programId,
        slotNumber: slot.slotNumber,
        targetUserId: slot.userId,
        reason: validated.reason,
        revokedAt: now.toISOString(),
      },
    });

    return {
      success: true,
      slotId: slot.id,
      programId: slot.programId,
      userId: slot.userId,
      slotNumber: slot.slotNumber,
      previousStatus: slot.status,
      status: "REVOKED_MANUAL_ADMIN",
      revokedAt: now,
      reason: validated.reason,
      auditLogId: auditRecord.id,
    };
  });
}

export const revokeSlot = revokeWlSlot;
