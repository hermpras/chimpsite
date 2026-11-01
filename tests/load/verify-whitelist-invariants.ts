/**
 * Whitelist Qualification Invariant Verifier
 *
 * Runs read-only queries to verify strict system invariants after load testing:
 *   1. allocatedSlotsCount <= totalSlots (Never exceeds capacity)
 *   2. allocatedSlotsCount >= 0 (No underflow)
 *   3. Active slot count strictly equals allocatedSlotsCount
 *   4. No user has duplicate GTD allocations in the same program
 *   5. Slot numbers are strictly unique (no collisions)
 *   6. Slot numbers are within valid bounds (1 <= slotNumber <= totalSlots)
 *   7. Queue entries are consistent (unique queue numbers, unique user queue positions)
 *
 * Usage:
 *   npx tsx tests/load/verify-whitelist-invariants.ts --programId program-load-test
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

// Retain caller provided DATABASE_URL
const callerDatabaseUrl = process.env.DATABASE_URL;
dotenv.config({ path: ".env.local" });
if (callerDatabaseUrl) {
  process.env.DATABASE_URL = callerDatabaseUrl;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL must target the isolated test database.");
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function safeJson(val: any): string {
  return JSON.stringify(val, (_, v) => (typeof v === "bigint" ? v.toString() : v));
}

export interface InvariantVerificationResult {
  passed: boolean;
  programId: string;
  totalSlots: number;
  allocatedSlotsCount: number;
  activeSlotsCount: number;
  waitingQueueCount: number;
  processedQueueCount: number;
  violations: string[];
}

export async function verifyWhitelistInvariants(
  client: PrismaClient,
  programId: string = "program-load-test",
): Promise<InvariantVerificationResult> {
  const violations: string[] = [];

  // Fetch program
  const program = await client.wLProgram.findUnique({
    where: { id: programId },
  });

  if (!program) {
    throw new Error(`Whitelist program '${programId}' not found in database.`);
  }

  console.log("==================================================================");
  console.log(`Verifying Whitelist Invariants for: ${program.name} (${programId})`);
  console.log(`Program Total Slots:          ${program.totalSlots}`);
  console.log(`Program Allocated Counter:    ${program.allocatedSlotsCount}`);
  console.log("==================================================================\n");

  // Invariant 1: allocatedSlotsCount <= totalSlots
  if (program.allocatedSlotsCount > program.totalSlots) {
    violations.push(
      `CRITICAL: allocatedSlotsCount (${program.allocatedSlotsCount}) exceeds totalSlots (${program.totalSlots})!`,
    );
  } else {
    console.log(`✓ Invariant 1: Capacity not exceeded (${program.allocatedSlotsCount} <= ${program.totalSlots})`);
  }

  // Invariant 2: allocatedSlotsCount >= 0
  if (program.allocatedSlotsCount < 0) {
    violations.push(
      `CRITICAL: allocatedSlotsCount is negative (${program.allocatedSlotsCount})! Underflow detected.`,
    );
  } else {
    console.log(`✓ Invariant 2: Counter not negative (${program.allocatedSlotsCount} >= 0)`);
  }

  // Invariant 3: Active slots strictly match program counter
  const activeSlotsCount = await client.wLSlot.count({
    where: {
      programId,
      status: { in: ["ALLOCATED", "CONFIRMED"] },
    },
  });

  if (activeSlotsCount !== program.allocatedSlotsCount) {
    violations.push(
      `CRITICAL: Active slot count (${activeSlotsCount}) does not match program.allocatedSlotsCount (${program.allocatedSlotsCount})!`,
    );
  } else {
    console.log(
      `✓ Invariant 3: Active slot records (${activeSlotsCount}) strictly match program counter (${program.allocatedSlotsCount})`,
    );
  }

  // Invariant 4: No user has duplicate GTD allocations in the same program
  const duplicateUserSlots = await client.$queryRaw<Array<{ userId: string; count: bigint }>>`
    SELECT "userId", COUNT(*) as count
    FROM "WLSlot"
    WHERE "programId" = ${programId} AND "status" IN ('ALLOCATED', 'CONFIRMED')
    GROUP BY "userId"
    HAVING COUNT(*) > 1
  `;

  if (duplicateUserSlots.length > 0) {
    violations.push(
      `CRITICAL: Detected users with duplicate GTD slots in program ${programId}: ${safeJson(duplicateUserSlots)}`,
    );
  } else {
    console.log("✓ Invariant 4: No duplicate GTD allocations per user (100% unique)");
  }

  // Invariant 5: No duplicate slot numbers (collision guard)
  const duplicateSlotNumbers = await client.$queryRaw<Array<{ slotNumber: number; count: bigint }>>`
    SELECT "slotNumber", COUNT(*) as count
    FROM "WLSlot"
    WHERE "programId" = ${programId}
    GROUP BY "slotNumber"
    HAVING COUNT(*) > 1
  `;

  if (duplicateSlotNumbers.length > 0) {
    violations.push(
      `CRITICAL: Detected duplicate slot numbers in program ${programId}: ${safeJson(duplicateSlotNumbers)}`,
    );
  } else {
    console.log("✓ Invariant 5: All slot numbers are strictly distinct (no collisions)");
  }

  // Invariant 6: Slot numbers within valid range [1 .. totalSlots]
  const outOfBoundsSlots = await client.wLSlot.findMany({
    where: {
      programId,
      OR: [
        { slotNumber: { lt: 1 } },
        { slotNumber: { gt: program.totalSlots } },
      ],
    },
    select: { id: true, slotNumber: true, userId: true },
  });

  if (outOfBoundsSlots.length > 0) {
    violations.push(
      `CRITICAL: Detected slot numbers outside range [1 .. ${program.totalSlots}]: ${safeJson(outOfBoundsSlots)}`,
    );
  } else {
    console.log(`✓ Invariant 6: All allocated slot numbers within valid range [1 .. ${program.totalSlots}]`);
  }

  // Invariant 7: Queue consistency & duplicate qualifications
  const waitingQueueCount = await client.wLQueueEntry.count({
    where: { programId, status: "WAITING" },
  });
  const processedQueueCount = await client.wLQueueEntry.count({
    where: { programId, status: "PROCESSED" },
  });

  const duplicateQueueNumbers = await client.$queryRaw<Array<{ queueNumber: number; count: bigint }>>`
    SELECT "queueNumber", COUNT(*) as count
    FROM "WLQueueEntry"
    WHERE "programId" = ${programId}
    GROUP BY "queueNumber"
    HAVING COUNT(*) > 1
  `;

  if (duplicateQueueNumbers.length > 0) {
    violations.push(
      `CRITICAL: Detected duplicate queue numbers in WLQueueEntry: ${safeJson(duplicateQueueNumbers)}`,
    );
  } else {
    console.log(`✓ Invariant 7: Queue numbers are strictly unique (Waiting: ${waitingQueueCount}, Processed: ${processedQueueCount})`);
  }

  // Check duplicate WLQualification records per user
  const duplicateQualifications = await client.$queryRaw<Array<{ userId: string; count: bigint }>>`
    SELECT "userId", COUNT(*) as count
    FROM "WLQualification"
    WHERE "programId" = ${programId}
    GROUP BY "userId"
    HAVING COUNT(*) > 1
  `;

  if (duplicateQualifications.length > 0) {
    violations.push(
      `CRITICAL: Detected duplicate qualification records per user: ${safeJson(duplicateQualifications)}`,
    );
  } else {
    console.log("✓ Invariant 8: Qualification records strictly 1-per-user");
  }

  console.log("\n------------------------------------------------------------------");
  const passed = violations.length === 0;
  if (!passed) {
    console.error(`FAILED: ${violations.length} invariant violation(s) detected:`);
    for (const v of violations) {
      console.error(`  - ${v}`);
    }
  } else {
    console.log("ALL INVARIANTS SATISFIED: Database is completely consistent.");
  }
  console.log("==================================================================\n");

  return {
    passed,
    programId,
    totalSlots: program.totalSlots,
    allocatedSlotsCount: program.allocatedSlotsCount,
    activeSlotsCount,
    waitingQueueCount,
    processedQueueCount,
    violations,
  };
}

function parseCliProgramId() {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--programId");
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  const prefix = "--programId=";
  const found = args.find((a) => a.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  return process.env.PROGRAM_ID || "program-load-test";
}

if (process.argv[1] && process.argv[1].endsWith("verify-whitelist-invariants.ts")) {
  const programId = parseCliProgramId();
  verifyWhitelistInvariants(prisma, programId)
    .then((res) => {
      if (!res.passed) process.exit(1);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Invariant verification error:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
