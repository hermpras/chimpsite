import type { PrismaClient, WLProgram } from "@prisma/client";
import type { PrismaTransactionClient } from "./qualification";
import { WhitelistError } from "./qualification";

export interface ProgramCapacityCheckResult {
  program: WLProgram;
  hasCapacity: boolean;
  remainingSlots: number;
  effectiveAllocatedCount: number;
}

/**
 * Locks the WLProgram row using PostgreSQL row-level lock (SELECT ... FOR UPDATE)
 * inside an interactive transaction, establishing the canonical lock order:
 * WLProgram -> WLSlot.
 *
 * This serializes concurrent allocation attempts and prevents deadlocks
 * between allocation, qualification, and revocation paths.
 */
export async function lockWlProgramForUpdate(
  tx: PrismaTransactionClient | PrismaClient,
  programId: string,
): Promise<WLProgram> {
  // Execute row-level lock on PostgreSQL when $queryRaw is available.
  // Any error in acquiring the lock must throw immediately (fail closed)
  // to ensure the interactive transaction aborts and rolls back.
  if (typeof (tx as any).$queryRaw === "function") {
    const rows = await (tx as any).$queryRaw`
      SELECT * FROM "WLProgram" WHERE id = ${programId} FOR UPDATE
    `;
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new WhitelistError("PROGRAM_NOT_FOUND", "Whitelist program not found.", 404);
    }
    return rows[0] as WLProgram;
  }

  // Fallback ONLY when $queryRaw is completely undefined (e.g. basic unit test mock without raw SQL capability)
  const program = await tx.wLProgram.findUnique({
    where: { id: programId },
  });

  if (!program) {
    throw new WhitelistError("PROGRAM_NOT_FOUND", "Whitelist program not found.", 404);
  }

  return program;
}

/**
 * Shared Pessimistic Capacity Guard.
 *
 * Acquires a pessimistic row-level lock on WLProgram (SELECT ... FOR UPDATE)
 * within an interactive transaction, re-reads capacity counters, and verifies
 * whether available capacity exists (allocatedSlotsCount < totalSlots).
 *
 * Both Qualification/Allocation (server/whitelist/qualification.ts) and Manual Grant
 * (server/admin/manual-grant.ts) use this exact same guard mechanism.
 *
 * Invariant strictly guaranteed:
 * 0 <= allocatedSlotsCount <= totalSlots
 */
export async function acquireProgramCapacityGuard(
  tx: PrismaTransactionClient | PrismaClient,
  programId: string,
  options?: { requireOpen?: boolean },
): Promise<ProgramCapacityCheckResult> {
  const program = await lockWlProgramForUpdate(tx, programId);

  if (options?.requireOpen && program.status !== "OPEN") {
    throw new WhitelistError(
      "PROGRAM_NOT_ACTIVE",
      `Whitelist program is not open (current status: ${program.status}).`,
      400,
    );
  }

  const activeSlotsCount = await tx.wLSlot.count({
    where: {
      programId: program.id,
      status: { in: ["ALLOCATED", "CONFIRMED"] },
    },
  });

  const effectiveAllocatedCount = Math.max(program.allocatedSlotsCount, activeSlotsCount);
  const remainingSlots = Math.max(0, program.totalSlots - effectiveAllocatedCount);
  const hasCapacity = remainingSlots > 0;

  return {
    program,
    hasCapacity,
    remainingSlots,
    effectiveAllocatedCount,
  };
}
