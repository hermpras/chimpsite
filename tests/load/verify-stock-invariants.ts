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

const ALLOWED_QUERY_PARAMS = new Map<string, Set<string>>([
  ["schema", new Set(["public"])],
  ["sslmode", new Set(["disable", "prefer"])],
]);

/**
 * Validates that the database connection string strictly targets local PostgreSQL
 * with the exact database name "chimphood_test".
 *
 * Enforces strict isolation:
 * - Protocols: strictly "postgresql:" or "postgres:".
 * - Hostname: strictly local loopback ("localhost", "127.0.0.1", "::1").
 * - Port: strictly standard PostgreSQL port 5432 or default (empty).
 * - Pathname: strictly "/chimphood_test" without variation, trailing slashes, or subpaths.
 * - Fragments: strictly rejected.
 * - Query Parameters: strictly whitelisted ("schema=public", "sslmode=disable|prefer").
 *   Disallows all target-altering parameters (e.g., host, hostaddr, port, database, dbname, options, socket, etc.).
 *
 * Throws informative errors without leaking credentials or passwords.
 */
export function validateLocalTestDatabaseUrl(rawUrl?: string): string {
  if (!rawUrl || typeof rawUrl !== "string" || rawUrl.trim() === "") {
    throw new Error(
      "[DATABASE_SECURITY_GUARD] DATABASE_URL environment variable is not set. Execution aborted to protect remote environments.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(
      "[DATABASE_SECURITY_GUARD] Invalid or malformed DATABASE_URL. Execution aborted.",
    );
  }

  const validProtocols = new Set(["postgres:", "postgresql:"]);
  if (!validProtocols.has(parsed.protocol)) {
    throw new Error(
      `[DATABASE_SECURITY_GUARD] Invalid protocol "${parsed.protocol}". Expected "postgresql:" or "postgres:".`,
    );
  }

  const normalizedHost = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const allowedHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!allowedHosts.has(normalizedHost)) {
    throw new Error(
      `[DATABASE_SECURITY_GUARD] Target host "${normalizedHost}" is not an allowed local loopback host (localhost, 127.0.0.1, ::1). Refusing to connect to remote or unverified host.`,
    );
  }

  if (parsed.port !== "" && parsed.port !== "5432") {
    throw new Error(
      `[DATABASE_SECURITY_GUARD] Port "${parsed.port}" is not allowed. Expected default PostgreSQL port 5432.`,
    );
  }

  if (parsed.pathname !== "/chimphood_test") {
    throw new Error(
      `[DATABASE_SECURITY_GUARD] Target database is not allowed. Pathname must be exactly "/chimphood_test" without variation. Received "${parsed.pathname}". Execution aborted.`,
    );
  }

  if (parsed.hash && parsed.hash !== "") {
    throw new Error(
      `[DATABASE_SECURITY_GUARD] URL fragments ("#...") are not allowed in DATABASE_URL. Execution aborted.`,
    );
  }

  const paramKeys = Array.from(parsed.searchParams.keys());
  for (const key of paramKeys) {
    const allowedValues = ALLOWED_QUERY_PARAMS.get(key);
    if (!allowedValues) {
      throw new Error(
        `[DATABASE_SECURITY_GUARD] Disallowed query parameter "${key}". Parameters that alter connection target or behavior are strictly prohibited.`,
      );
    }
    const values = parsed.searchParams.getAll(key);
    if (values.length > 1) {
      throw new Error(
        `[DATABASE_SECURITY_GUARD] Duplicate query parameter "${key}" is not allowed.`,
      );
    }
    if (!allowedValues.has(values[0])) {
      throw new Error(
        `[DATABASE_SECURITY_GUARD] Invalid value "${values[0]}" for query parameter "${key}".`,
      );
    }
  }

  return rawUrl;
}

let prisma: PrismaClient | null = null;

async function main() {
  const connectionString = validateLocalTestDatabaseUrl(process.env.DATABASE_URL);
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
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

const isDirectRun =
  !process.env.VITEST &&
  Boolean(process.argv[1]) &&
  process.argv[1].includes("verify-stock-invariants");

if (isDirectRun) {
  main()
    .catch((e) => {
      console.error("Verification script failed:", e);
      process.exit(1);
    })
    .finally(async () => {
      if (prisma) {
        await prisma.$disconnect();
      }
    });
}
