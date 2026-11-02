import type { PrismaClient } from "@prisma/client";
import { recordAuditLog } from "../audit/audit";
import {
  acquireProgramCapacityGuard,
  lockWlProgramForUpdate,
} from "../whitelist/capacity-guard";
import { executeQualificationEvaluation } from "../whitelist/qualification";

export class AdminManualGrantError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = "AdminManualGrantError";
    this.code = code;
    this.status = status;
  }
}

export interface ManualGrantGtdSlotInput {
  programId: string;
  candidateUserId: string;
  adminUserId: string;
  slotNumber?: number;
  notes?: string | null;
  now?: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface ManualGrantGtdSlotResult {
  success: true;
  slot: {
    id: string;
    programId: string;
    slotNumber: number;
    userId: string;
    status: string;
    reviewStatus: string;
    allocatedAt: Date;
    allocatedBy: string;
    notes: string | null;
  };
  auditLogId: string;
  previousUserId?: string;
}

/**
 * Validates input for manual GTD grant.
 */
export function validateManualGrantInput(input: ManualGrantGtdSlotInput): {
  programId: string;
  candidateUserId: string;
  adminUserId: string;
  slotNumber?: number;
  notes: string | null;
} {
  if (
    !input.adminUserId ||
    typeof input.adminUserId !== "string" ||
    !input.adminUserId.trim()
  ) {
    throw new AdminManualGrantError(
      "UNAUTHORIZED",
      "Admin user ID is required.",
      401,
    );
  }

  if (
    !input.programId ||
    typeof input.programId !== "string" ||
    !input.programId.trim()
  ) {
    throw new AdminManualGrantError(
      "PROGRAM_ID_REQUIRED",
      "Program ID is required.",
      400,
    );
  }

  if (
    !input.candidateUserId ||
    typeof input.candidateUserId !== "string" ||
    !input.candidateUserId.trim()
  ) {
    throw new AdminManualGrantError(
      "CANDIDATE_USER_ID_REQUIRED",
      "Candidate user ID is required.",
      400,
    );
  }

  let slotNumber: number | undefined = undefined;
  if (input.slotNumber !== undefined && input.slotNumber !== null) {
    if (
      typeof input.slotNumber !== "number" ||
      !Number.isInteger(input.slotNumber) ||
      input.slotNumber <= 0
    ) {
      throw new AdminManualGrantError(
        "INVALID_SLOT_NUMBER",
        "Slot number must be a positive integer.",
        400,
      );
    }
    slotNumber = input.slotNumber;
  }

  let notes: string | null = null;
  if (input.notes !== undefined && input.notes !== null) {
    if (typeof input.notes !== "string") {
      throw new AdminManualGrantError(
        "INVALID_NOTES",
        "Notes must be a string.",
        400,
      );
    }
    if (input.notes.length > 2048) {
      throw new AdminManualGrantError(
        "NOTES_TOO_LONG",
        "Notes cannot exceed 2048 characters.",
        400,
      );
    }
    notes = input.notes.trim() || null;
  }

  return {
    programId: input.programId.trim(),
    candidateUserId: input.candidateUserId.trim(),
    adminUserId: input.adminUserId.trim(),
    slotNumber,
    notes,
  };
}

/**
 * Manually grants a vacant (revoked) GTD slot to an eligible candidate from the FCFS Directory.
 *
 * Enforces:
 * 1. Admin RBAC: Caller must hold ADMIN or SUPER_ADMIN role.
 * 2. Shared Capacity Guard: Lock order WLProgram -> WLSlot; re-reads capacity under row-level lock.
 * 3. Candidate Eligibility: Must meet ALL 5 Whitelist requirements and must not already hold an active slot.
 * 4. Conditional Vacant Slot Reuse: Reuses existing revoked record (REVOKED_MANUAL_ADMIN or REVOKED_SYSTEM)
 *    via conditional updateMany strictly requiring count === 1.
 * 5. Historical Ownership Preservation: Past ownership records in WLStatusHistory and AuditLog remain untouched.
 * 6. Review Status: Sets reviewStatus = NOT_REVIEWED on reused slot.
 * 7. Directory Record: Sets candidate's WLQueueEntry.status = PROCESSED.
 * 8. Counter Parity: Atomically increments allocatedSlotsCount by exactly 1 on WLProgram.
 * 9. Audit Integrity: Creates exactly ONE AuditLog (WL_SLOT_MANUALLY_GRANTED) within the same transaction.
 * 10. Atomicity: Any failure rolls back the entire transaction completely.
 */
export async function manualGrantGtdSlot(
  prisma: PrismaClient,
  rawInput: ManualGrantGtdSlotInput,
): Promise<ManualGrantGtdSlotResult> {
  const validated = validateManualGrantInput(rawInput);
  const now = rawInput.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    // 1. Verify Admin caller role (ADMIN or SUPER_ADMIN required)
    const adminRole = await tx.adminRole.findUnique({
      where: { userId: validated.adminUserId },
    });
    const adminUser = adminRole
      ? null
      : await tx.user.findUnique({
          where: { id: validated.adminUserId },
          select: { role: true },
        });

    const role = adminRole?.roleType ?? adminUser?.role;
    const allowedRoles = ["ADMIN", "SUPER_ADMIN"];
    if (!role || !allowedRoles.includes(role)) {
      throw new AdminManualGrantError(
        "FORBIDDEN",
        `Requires ADMIN or SUPER_ADMIN role. Current role: ${role ?? "NONE"}.`,
        403,
      );
    }

    // 2. Candidate must not already hold an active GTD slot in this program
    const existingActiveSlot = await tx.wLSlot.findFirst({
      where: {
        programId: validated.programId,
        userId: validated.candidateUserId,
        status: { in: ["ALLOCATED", "CONFIRMED"] },
      },
    });

    if (existingActiveSlot) {
      throw new AdminManualGrantError(
        "ALREADY_HOLDS_ACTIVE_SLOT",
        "Candidate already holds an active whitelist slot in this program.",
        409,
      );
    }

    // 3. Candidate Eligibility Verification: evaluate ALL 5 Whitelist criteria
    const qualResult = await executeQualificationEvaluation(
      tx,
      {
        userId: validated.candidateUserId,
        programId: validated.programId,
        readOnly: true,
      },
      now,
    );

    if (!qualResult.qualified) {
      throw new AdminManualGrantError(
        "CANDIDATE_NOT_QUALIFIED",
        `Candidate does not satisfy all whitelist criteria: ${qualResult.missingRequirements.join("; ")}`,
        400,
      );
    }

    // 4. Shared Capacity Guard: Lock WLProgram (FOR UPDATE) and verify capacity
    const capacityGuard = await acquireProgramCapacityGuard(tx, validated.programId, {
      requireOpen: true,
    });

    if (!capacityGuard.hasCapacity) {
      throw new AdminManualGrantError(
        "NO_VACANT_SLOTS_AVAILABLE",
        "No vacant slots available in this program (allocatedSlotsCount >= totalSlots).",
        409,
      );
    }

    // 5. Find vacant slot record (lowest available or targeted slotNumber)
    const whereVacant: any = {
      programId: validated.programId,
      status: { in: ["REVOKED_MANUAL_ADMIN", "REVOKED_SYSTEM"] },
    };
    if (validated.slotNumber !== undefined) {
      whereVacant.slotNumber = validated.slotNumber;
    }

    const vacantSlot = await tx.wLSlot.findFirst({
      where: whereVacant,
      orderBy: { slotNumber: "asc" },
      select: {
        id: true,
        slotNumber: true,
        userId: true,
        notes: true,
        status: true,
      },
    });

    if (!vacantSlot) {
      throw new AdminManualGrantError(
        "NO_VACANT_SLOTS_AVAILABLE",
        validated.slotNumber !== undefined
          ? `Slot #${validated.slotNumber} is not a revoked vacant slot available for reuse.`
          : "No revoked slot record is available to reuse.",
        409,
      );
    }

    const previousUserId = vacantSlot.userId;
    const previousNotes = vacantSlot.notes;

    // 6. Conditional vacant slot record reuse via updateMany
    const updateResult = await tx.wLSlot.updateMany({
      where: {
        id: vacantSlot.id,
        status: { in: ["REVOKED_MANUAL_ADMIN", "REVOKED_SYSTEM"] },
      },
      data: {
        userId: validated.candidateUserId,
        status: "ALLOCATED",
        reviewStatus: "NOT_REVIEWED",
        allocatedAt: now,
        confirmedAt: null,
        allocatedBy: "ADMIN_MANUAL",
        notes: validated.notes ?? null,
      },
    });

    if (updateResult.count !== 1) {
      throw new AdminManualGrantError(
        "SLOT_ACQUISITION_FAILED",
        "Failed to acquire vacant slot record; already claimed by concurrent transaction.",
        409,
      );
    }

    // 7. Update candidate's WLQueueEntry status to PROCESSED (if existing)
    await tx.wLQueueEntry.updateMany({
      where: {
        programId: validated.programId,
        userId: validated.candidateUserId,
      },
      data: {
        status: "PROCESSED",
        processedAt: now,
      },
    });

    // 8. Atomically increment allocatedSlotsCount on WLProgram by exactly 1
    await tx.wLProgram.update({
      where: { id: validated.programId },
      data: { allocatedSlotsCount: { increment: 1 } },
    });

    // 9. Record WLStatusHistory for candidate
    await tx.wLStatusHistory.create({
      data: {
        programId: validated.programId,
        userId: validated.candidateUserId,
        fromPhase: "IN_QUEUE",
        toPhase: "SLOT_ALLOCATED",
        action: "SLOT_MANUALLY_GRANTED",
        actorId: validated.adminUserId,
        metadata: {
          slotId: vacantSlot.id,
          slotNumber: vacantSlot.slotNumber,
          previousUserId,
          notes: validated.notes ?? null,
        },
        createdAt: now,
      },
    });

    // 10. Create EXACTLY ONE AuditLog entry
    const auditRecord = await recordAuditLog(tx, {
      actorId: validated.adminUserId,
      actorIp: rawInput.ipAddress ?? null,
      userAgent: rawInput.userAgent ?? null,
      action: "WL_SLOT_MANUALLY_GRANTED",
      entityType: "WLSlot",
      entityId: vacantSlot.id,
      oldValues: {
        status: "REVOKED_MANUAL_ADMIN",
        userId: previousUserId,
        notes: previousNotes,
      },
      newValues: {
        status: "ALLOCATED",
        reviewStatus: "NOT_REVIEWED",
        userId: validated.candidateUserId,
        slotNumber: vacantSlot.slotNumber,
        allocatedBy: "ADMIN_MANUAL",
        notes: validated.notes ?? null,
      },
      metadata: {
        programId: validated.programId,
        slotNumber: vacantSlot.slotNumber,
        targetUserId: validated.candidateUserId,
        previousUserId,
        notes: validated.notes ?? null,
        grantedAt: now.toISOString(),
      },
    });

    return {
      success: true,
      slot: {
        id: vacantSlot.id,
        programId: validated.programId,
        slotNumber: vacantSlot.slotNumber,
        userId: validated.candidateUserId,
        status: "ALLOCATED",
        reviewStatus: "NOT_REVIEWED",
        allocatedAt: now,
        allocatedBy: "ADMIN_MANUAL",
        notes: validated.notes ?? null,
      },
      auditLogId: auditRecord.id,
      previousUserId,
    };
  });
}

/**
 * Checks if a Prisma error is a unique constraint collision on userId.
 */
export function isUserIdCollision(err: unknown): boolean {
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  ) {
    const pErr = err as { meta?: { target?: unknown }; message?: string };
    const target = pErr.meta?.target;
    const targetStr = Array.isArray(target)
      ? target.join(",")
      : typeof target === "string"
        ? target
        : "";
    const message = pErr.message || "";
    if (targetStr.includes("userId") || message.includes("userId")) {
      return true;
    }
  }
  return false;
}

/**
 * Determines whether a Prisma error is transient and safe to retry.
 * Only P2034 (write conflict / deadlock) and definitively verified P2002
 * on slotNumber or queueNumber are eligible.
 */
export function isRetryableManualGrantConflict(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;

  if ("code" in err) {
    const code = (err as { code?: unknown }).code;

    // 1. Transaction write conflict / serialization failure / deadlock
    if (code === "P2034" || code === "40001" || code === "40P01") {
      return true;
    }

    // 2. Unique constraint collision
    if (code === "P2002") {
      const pErr = err as {
        meta?: { target?: unknown; modelName?: string };
        message?: string;
      };
      const target = pErr.meta?.target;
      const targetStr = Array.isArray(target)
        ? target.join(",")
        : typeof target === "string"
          ? target
          : "";
      const message = pErr.message || "";
      const modelName = pErr.meta?.modelName || "";

      // Terminal business conflict: NEVER retry on userId!
      if (
        targetStr.includes("userId") ||
        (!targetStr && message.includes("userId"))
      ) {
        return false;
      }

      // Retry eligible ONLY if definitively verified as slotNumber or queueNumber collision
      const isSlotCollision =
        targetStr.includes("slotNumber") ||
        message.includes("slotNumber") ||
        (modelName === "WLSlot" && message.includes("slotNumber"));

      const isQueueCollision =
        targetStr.includes("queueNumber") ||
        message.includes("queueNumber") ||
        (modelName === "WLQueueEntry" && message.includes("queueNumber"));

      if (isSlotCollision || isQueueCollision) {
        return true;
      }

      // Ambiguous metadata -> fail-closed (DO NOT RETRY)
      return false;
    }
  }

  return false;
}

