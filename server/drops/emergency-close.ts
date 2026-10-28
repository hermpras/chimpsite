import type { PrismaClient } from "@prisma/client";
import { DropClaimError } from "./claim";
import { recordAuditLog } from "../audit/audit";

export interface EmergencyCloseDropInput {
  dropId?: string;
  periodId: string;
  adminUserId: string;
  reason?: string | null;
  now?: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface EmergencyCloseDropResult {
  success: true;
  periodId: string;
  dropId: string;
  status: "CANCELLED";
  closedAt: Date;
  reason: string | null;
  cancelledPendingClaimsCount: number;
  auditLogId: string;
}

/**
 * Emergency-close an active drop claim window atomically.
 * Cancels the active DropPeriod, rejects all uncompleted (pending) claims,
 * preserves all previously completed claims, and records an immutable audit log.
 */
export async function emergencyCloseDropPeriod(
  prisma: PrismaClient,
  input: EmergencyCloseDropInput,
): Promise<EmergencyCloseDropResult> {
  const now = input.now ?? new Date();

  return await prisma.$transaction(async (tx) => {
    // 1. Verify DropPeriod exists and matches dropId if provided
    const period = await tx.dropPeriod.findUnique({
      where: { id: input.periodId },
      include: { drop: true },
    });

    if (!period || (input.dropId && period.dropId !== input.dropId)) {
      throw new DropClaimError("PERIOD_NOT_FOUND", "Drop period was not found.", 404);
    }

    // 2. Safe handling of repeated close requests and state validation
    if (period.status === "CANCELLED") {
      throw new DropClaimError(
        "PERIOD_ALREADY_CLOSED",
        "Drop period is already closed or cancelled.",
        409,
      );
    }

    if (period.status === "ENDED") {
      throw new DropClaimError(
        "PERIOD_ALREADY_ENDED",
        "Drop period has already ended.",
        409,
      );
    }

    if (period.status !== "ACTIVE") {
      throw new DropClaimError(
        "PERIOD_NOT_ACTIVE",
        `Drop period is not active (current status: ${period.status}).`,
        400,
      );
    }

    // 3. Atomic conditional state transition from ACTIVE to CANCELLED
    const updatePeriodResult = await tx.dropPeriod.updateMany({
      where: {
        id: input.periodId,
        status: "ACTIVE",
      },
      data: {
        status: "CANCELLED",
      },
    });

    if (updatePeriodResult.count === 0) {
      throw new DropClaimError(
        "PERIOD_ALREADY_CLOSED",
        "Drop period is already closed or cancelled.",
        409,
      );
    }

    // 4. Reject all claims that have not completed (status is PENDING)
    // Completed claims (status SUCCESS) are strictly preserved.
    const cancelledClaimsResult = await tx.claim.updateMany({
      where: {
        periodId: period.id,
        status: "PENDING",
      },
      data: {
        status: "CANCELLED",
      },
    });

    // 5. Immutable audit log recording (participates in transaction)
    const auditRecord = await recordAuditLog(tx, {
      actorId: input.adminUserId,
      actorIp: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      action: "DROP_PERIOD_EMERGENCY_CLOSED",
      entityType: "DropPeriod",
      entityId: period.id,
      oldValues: {
        status: "ACTIVE",
      },
      newValues: {
        status: "CANCELLED",
      },
      metadata: {
        dropId: period.dropId,
        periodIndex: period.periodIndex,
        reason: input.reason ?? null,
        closedAt: now.toISOString(),
        cancelledPendingClaimsCount: cancelledClaimsResult.count,
      },
    });

    return {
      success: true,
      periodId: period.id,
      dropId: period.dropId,
      status: "CANCELLED",
      closedAt: now,
      reason: input.reason ?? null,
      cancelledPendingClaimsCount: cancelledClaimsResult.count,
      auditLogId: auditRecord.id,
    };
  });
}

export const emergencyCloseDropWindow = emergencyCloseDropPeriod;
