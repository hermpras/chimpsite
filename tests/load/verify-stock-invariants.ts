/**
 * Task 5-B: Post-Load-Test Invariant Verifier
 *
 * Verifies that the load test against POST /api/drops/claim did NOT cause:
 *   1. Stock over-allocation (remainingStock < 0)
 *   2. Ghost claims or uncounted stock deductions
 *   3. Duplicate trait serial editions in InventoryItem
 *   4. Duplicate claims for the same user in the period
 *
 * Usage:
 *   npx tsx tests/load/verify-stock-invariants.ts --dropId drop-load-test --periodId period-load-test
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL must target the isolated test database.");
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const dropId = process.env.DROP_ID || "drop-load-test";
  const periodId = process.env.PERIOD_ID || "period-load-test";

  console.log("==================================================================");
  console.log(`Verifying Invariants for Drop Period: ${periodId} (${dropId})`);
  console.log("==================================================================\n");

  let hasErrors = false;

  // 1. Check DropPoolItems stock consistency
  const poolItems = await prisma.dropPoolItem.findMany({
    where: { periodId },
    include: { trait: true },
  });

  if (poolItems.length === 0) {
    console.error(`ERROR: No DropPoolItems found for periodId: ${periodId}`);
    process.exit(1);
  }

  let totalAllocated = 0;
  let totalRemaining = 0;
  let totalClaimedStock = 0;

  console.log("Stock Audit per Trait:");
  for (const item of poolItems) {
    console.log(
      `  - ${item.trait.name} (${item.trait.category}): Allocated=${item.allocatedStock}, Claimed=${item.claimedStock}, Remaining=${item.remainingStock}`,
    );

    if (item.remainingStock < 0) {
      console.error(
        `  CRITICAL VIOLATION: remainingStock is negative (${item.remainingStock})!`,
      );
      hasErrors = true;
    }

    if (item.allocatedStock !== item.remainingStock + item.claimedStock) {
      console.error(
        `  CRITICAL VIOLATION: allocated (${item.allocatedStock}) != remaining (${item.remainingStock}) + claimed (${item.claimedStock})!`,
      );
      hasErrors = true;
    }

    totalAllocated += item.allocatedStock;
    totalRemaining += item.remainingStock;
    totalClaimedStock += item.claimedStock;
  }

  console.log("\nAggregate Stock Summary:");
  console.log(`  Total Allocated: ${totalAllocated}`);
  console.log(`  Total Remaining: ${totalRemaining}`);
  console.log(`  Total Claimed:   ${totalClaimedStock}`);

  // 2. Cross-reference with Claim records
  const totalClaims = await prisma.claim.count({
    where: { periodId, status: "SUCCESS" },
  });
  console.log(`\nActual Claim Records in DB: ${totalClaims}`);

  if (totalClaims !== totalClaimedStock) {
    console.error(
      `  CRITICAL VIOLATION: Claim table count (${totalClaims}) != PoolItem claimedStock sum (${totalClaimedStock})!`,
    );
    hasErrors = true;
  } else {
    console.log(
      "  PASSED: Claim table count strictly equals DropPoolItem claimed stock.",
    );
  }

  // 3. Check for duplicate claims per user
  const duplicateUserClaims = await prisma.$queryRaw<
    Array<{ userId: string; count: bigint }>
  >`
    SELECT "userId", COUNT(*) as count
    FROM "Claim"
    WHERE "periodId" = ${periodId} AND "status" = 'SUCCESS'
    GROUP BY "userId"
    HAVING COUNT(*) > 1
  `;

  if (duplicateUserClaims.length > 0) {
    console.error(
      `  CRITICAL VIOLATION: Detected users with multiple claims in the same period:`,
    );
    console.error(duplicateUserClaims);
    hasErrors = true;
  } else {
    console.log("  PASSED: 100% of users have at most 1 claim in this period.");
  }

  // 4. Check for duplicate edition allocations in InventoryItem
  const duplicateEditions = await prisma.$queryRaw<
    Array<{ traitId: string; edition: number; count: bigint }>
  >`
    SELECT "traitId", "edition", COUNT(*) as count
    FROM "InventoryItem"
    WHERE "acquiredVia" = 'CLAIM'
    GROUP BY "traitId", "edition"
    HAVING COUNT(*) > 1
  `;

  if (duplicateEditions.length > 0) {
    console.error(
      `  CRITICAL VIOLATION: Detected duplicate trait edition numbers in InventoryItem:`,
    );
    console.error(duplicateEditions);
    hasErrors = true;
  } else {
    console.log(
      "  PASSED: 100% of minted InventoryItems have unique serial edition numbers.",
    );
  }

  console.log("\n==================================================================");
  if (hasErrors) {
    console.error("OVERALL RESULT: FAILED (Invariants violated)");
    process.exit(1);
  } else {
    console.log(
      "OVERALL RESULT: PASSED (All stock & concurrency invariants strictly satisfied)",
    );
    process.exit(0);
  }
}

main()
  .catch((e) => {
    console.error("Verification script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
