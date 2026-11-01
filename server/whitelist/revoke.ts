import type { PrismaClient } from "@prisma/client";
import { recordAuditLog } from "../audit/audit";
import { lockWlProgramForUpdate } from "./capacity-guard";

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
  autoPromote?: boolean;
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
  reason: string;
  auditLogId: string;
  promotedUserId?: string;
  promotedSlotNumber?: number;
}


export function validateRevokeWlSlotInput(input: RevokeWlSlotInput): {
  slotId?: string;
  programId?: string;
  userId?: string;
  slotNumber?: number;
  adminUserId: string;
  reason: string;
  autoPromote?: boolean;
} {
  if (
    !input.adminUserId ||
    typeof input.adminUserId !== "string" ||
    !input.adminUserId.trim()
  ) {
    throw new WlSlotRevokeError("UNAUTHORIZED", "Admin authentication is required.", 401);
  }

  const slotId =
    input.slotId && typeof input.slotId === "string" ? input.slotId.trim() : undefined;
  const programId =
    input.programId && typeof input.programId === "string"
      ? input.programId.trim()
      : undefined;
  const userId =
    input.userId && typeof input.userId === "string" ? input.userId.trim() : undefined;
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

  if (input.reason === undefined || input.reason === null) {
    throw new WlSlotRevokeError(
      "REVOKE_REASON_REQUIRED",
      "Revocation reason is required.",
      400,
    );
  }

  if (typeof input.reason !== "string") {
    throw new WlSlotRevokeError("INVALID_INPUT", "Reason must be a string.", 400);
  }

  const trimmedReason = input.reason.trim();
  if (trimmedReason.length === 0) {
    throw new WlSlotRevokeError(
      "REVOKE_REASON_REQUIRED",
      "Revocation reason is required and cannot be empty.",
      400,
    );
  }

  if (trimmedReason.length < 5) {
    throw new WlSlotRevokeError(
      "REVOKE_REASON_REQUIRED",
      "Revocation reason must be at least 5 characters long.",
      400,
    );
  }

  if (trimmedReason.length > 1000) {
    throw new WlSlotRevokeError(
      "INVALID_INPUT",
      "Revocation reason cannot exceed 1000 characters.",
      400,
    );
  }

  return {
    slotId,
    programId,
    userId,
    slotNumber,
    adminUserId: input.adminUserId.trim(),
    reason: trimmedReason,
    autoPromote: input.autoPromote,
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
function isWlSlotNumberCollision(err: unknown): boolean {
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  ) {
    const pErr = err as { meta?: { target?: unknown; modelName?: string }; message?: string };
    const target = pErr.meta?.target;
    const targetStr = Array.isArray(target) ? target.join(",") : typeof target === "string" ? target : "";
    const message = pErr.message || "";
    const modelName = pErr.meta?.modelName || "";
    if (
      targetStr.includes("slotNumber") ||
      message.includes("slotNumber") ||
      (modelName === "WLSlot" && message.includes("slotNumber"))
    ) {
      return true;
    }
  }
  return false;
}

function isWlWriteConflictOrDeadlock(err: unknown): boolean {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code?: unknown }).code;
    return code === "P2034" || code === "40001" || code === "40P01";
  }
  return false;
}

function isRetryableRevokeConflict(err: unknown): boolean {
  return isWlSlotNumberCollision(err) || isWlWriteConflictOrDeadlock(err);
}

export async function revokeWlSlot(
  prisma: PrismaClient,
  rawInput: RevokeWlSlotInput,
  maxRetries: number = 5,
): Promise<RevokeWlSlotResult> {
  const validated = validateRevokeWlSlotInput(rawInput);
  const now = rawInput.now ?? new Date();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
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

    // 3. Lock WLProgram before locking WLSlot to establish consistent lock order: WLProgram -> WLSlot
    await lockWlProgramForUpdate(tx, slot.programId);

    // Conditional atomic state transition to prevent race conditions
    const updateResult = await tx.wLSlot.updateMany({
      where: {
        id: slot.id,
        status: { in: ["ALLOCATED", "CONFIRMED"] },
      },
      data: {
        status: "REVOKED_MANUAL_ADMIN",
        notes: validated.reason,
      },
    });

    if (updateResult.count !== 1) {
      throw new WlSlotRevokeError(
        "SLOT_ALREADY_REVOKED",
        "Whitelist slot is already revoked or not active.",
        409,
      );
    }

    // 4. Conditional decrement of allocatedSlotsCount on WLProgram (lower-bound protection)
    let programUpdateCount = 0;
    if (typeof tx.wLProgram.updateMany === "function") {
      const programUpdate = await tx.wLProgram.updateMany({
        where: {
          id: slot.programId,
          allocatedSlotsCount: { gt: 0 },
        },
        data: {
          allocatedSlotsCount: { decrement: 1 },
        },
      });
      programUpdateCount = programUpdate.count;
    } else {
      const prog = await tx.wLProgram.findUnique({
        where: { id: slot.programId },
        select: { id: true, allocatedSlotsCount: true },
      });
      if (prog && prog.allocatedSlotsCount > 0) {
        await tx.wLProgram.update({
          where: { id: slot.programId },
          data: { allocatedSlotsCount: { decrement: 1 } },
        });
        programUpdateCount = 1;
      }
    }

    if (programUpdateCount !== 1) {
      throw new WlSlotRevokeError(
        "COUNTER_INTEGRITY_VIOLATION",
        "Cannot decrement counter: allocatedSlotsCount is already 0.",
        500,
      );
    }

    // 5. Upsert WLQualification status to REVOKED (DEC-022 Full WL Disqualification)
    if (tx.wLQualification?.upsert) {
      await tx.wLQualification.upsert({
        where: {
          programId_userId: {
            programId: slot.programId,
            userId: slot.userId,
          },
        },
        create: {
          programId: slot.programId,
          userId: slot.userId,
          status: "REVOKED",
          disqualifiedAt: now,
          reason: validated.reason,
        },
        update: {
          status: "REVOKED",
          disqualifiedAt: now,
          reason: validated.reason,
        },
      });
    } else {
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
            reason: validated.reason,
          },
        });
      } else if (tx.wLQualification?.create) {
        await tx.wLQualification.create({
          data: {
            programId: slot.programId,
            userId: slot.userId,
            status: "REVOKED",
            disqualifiedAt: now,
            reason: validated.reason,
          },
        });
      }
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
        notes: validated.reason,
      },
      metadata: {
        programId: slot.programId,
        slotNumber: slot.slotNumber,
        targetUserId: slot.userId,
        reason: validated.reason,
        revokedAt: now.toISOString(),
      },
    });

    // 8. Vacant Slot Policy (DEC-016 & DEC-018):
    // Zero auto-promotion of waiting queue participants. The revoked slot is left vacant.
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
    } catch (err: unknown) {
      if (isRetryableRevokeConflict(err) && attempt < maxRetries) {
        continue;
      }
      throw err;
    }
  }

  throw new WlSlotRevokeError(
    "CONCURRENCY_COLLISION_RETRYABLE",
    "A concurrency collision occurred during slot revocation. Please retry.",
    409,
  );
}

export const revokeSlot = revokeWlSlot;
