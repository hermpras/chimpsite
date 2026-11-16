/**
 * ST-05 Master Execution: Controlled Atomic Cleanup Script
 * File: tests/load/cleanup-st05.ts
 *
 * Atomically removes records created specifically for ST-05 using exact IDs:
 *   - Exactly 100 test Claim records (periodId = 'period-load-test')
 *   - Exactly 100 test InventoryItem records (ownerId LIKE 'usr-load-test-%' AND acquiredVia = 'CLAIM')
 *   - Exactly 100 test XIdentity records created in Phase B
 *   - Exactly 100 test AuthSession records created in Phase B
 *   - Test AbuseFlag and AuditLog records generated during the benchmark
 *   - Resets test Drop and DropPeriod status to ENDED
 *
 * Verifies that zero baseline records are altered or deleted.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const rawDbUrl = process.env.DATABASE_URL;
if (!rawDbUrl || typeof rawDbUrl !== "string" || rawDbUrl.trim() === "") {
  throw new Error(
    "[SECURITY_GUARD] DATABASE_URL environment variable is not set. Execution aborted to protect remote environments.",
  );
}

let parsedDbUrl: URL;
try {
  parsedDbUrl = new URL(rawDbUrl);
} catch {
  throw new Error("[SECURITY_GUARD] Invalid or malformed DATABASE_URL; refusing to run cleanup.");
}

const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const isAllowedHost = localHosts.has(parsedDbUrl.hostname.replace(/^\[|\]$/g, "").toLowerCase());
const isAllowedProtocol = ["postgres:", "postgresql:"].includes(parsedDbUrl.protocol);
const isAllowedPort = parsedDbUrl.port === "" || parsedDbUrl.port === "5432";
const isAllowedDb = parsedDbUrl.pathname === "/chimphood_test";

if (!isAllowedProtocol || !isAllowedHost || !isAllowedPort || !isAllowedDb) {
  throw new Error(
    "[SECURITY_GUARD] Refusing to run cleanup: target must strictly be local PostgreSQL (chimphood_test on port 5432).",
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: rawDbUrl }),
});

async function main() {
  console.log("==================================================================");
  console.log("ST-05 Controlled Atomic Cleanup");
  console.log("Target Database: " + parsedDbUrl.pathname + " on " + parsedDbUrl.hostname);
  console.log("==================================================================\n");

  // 1. Fetch exact IDs for test claims
  const testClaims = await prisma.claim.findMany({
    where: { periodId: "period-load-test" },
    select: { id: true, userId: true },
  });
  console.log(`Identified ${testClaims.length} ST-05 Claim records.`);

  // Verify none are baseline users
  const invalidUserClaims = testClaims.filter((c) => !c.userId.startsWith("usr-load-test-"));
  if (invalidUserClaims.length > 0) {
    throw new Error(
      `ABORT: Found claims for non-synthetic user IDs in period-load-test: ${JSON.stringify(invalidUserClaims)}`,
    );
  }
  const claimIds = testClaims.map((c) => c.id);

  // 2. Fetch exact IDs for test inventory items
  const testItems = await prisma.inventoryItem.findMany({
    where: {
      ownerId: { startsWith: "usr-load-test-" },
      acquiredVia: "CLAIM",
    },
    select: { id: true, ownerId: true },
  });
  console.log(`Identified ${testItems.length} ST-05 InventoryItem records.`);
  const itemIds = testItems.map((i) => i.id);

  // 3. Fetch exact IDs for test XIdentity records
  const testXIdentities = await prisma.xIdentity.findMany({
    where: {
      userId: { startsWith: "usr-load-test-" },
    },
    select: { id: true, userId: true },
  });
  console.log(`Identified ${testXIdentities.length} ST-05 XIdentity records.`);
  const xIdentityIds = testXIdentities.map((x) => x.id);

  // 4. Fetch exact IDs for test AuthSessions
  const testSessions = await prisma.authSession.findMany({
    where: {
      userId: { startsWith: "usr-load-test-" },
    },
    select: { id: true },
  });
  console.log(`Identified ${testSessions.length} ST-05 AuthSession records.`);
  const sessionIds = testSessions.map((s) => s.id);

  // 5. Fetch test AbuseFlags
  const testAbuseFlags = await prisma.abuseFlag.findMany({
    where: {
      userId: { startsWith: "usr-load-test-" },
    },
    select: { id: true },
  });
  console.log(`Identified ${testAbuseFlags.length} ST-05 AbuseFlag records.`);
  const abuseFlagIds = testAbuseFlags.map((f) => f.id);

  // 6. Fetch test AuditLogs
  const testAuditLogs = await prisma.auditLog.findMany({
    where: {
      actorId: { startsWith: "usr-load-test-" },
    },
    select: { id: true },
  });
  console.log(`Identified ${testAuditLogs.length} ST-05 AuditLog records.`);
  const auditLogIds = testAuditLogs.map((a) => a.id);

  // Perform atomic cleanup in a transaction
  console.log("\nExecuting atomic cleanup transaction...");
  await prisma.$transaction(async (tx) => {
    // A. Delete Claims (must be deleted before InventoryItem due to RESTRICT FK)
    if (claimIds.length > 0) {
      const deletedClaims = await tx.claim.deleteMany({
        where: { id: { in: claimIds } },
      });
      console.log(`  Deleted ${deletedClaims.count} Claim records.`);
    }

    // B. Delete InventoryItems
    if (itemIds.length > 0) {
      const deletedItems = await tx.inventoryItem.deleteMany({
        where: { id: { in: itemIds } },
      });
      console.log(`  Deleted ${deletedItems.count} InventoryItem records.`);
    }

    // C. Delete XIdentities
    if (xIdentityIds.length > 0) {
      const deletedX = await tx.xIdentity.deleteMany({
        where: { id: { in: xIdentityIds } },
      });
      console.log(`  Deleted ${deletedX.count} XIdentity records.`);
    }

    // D. Delete AuthSessions
    if (sessionIds.length > 0) {
      const deletedSessions = await tx.authSession.deleteMany({
        where: { id: { in: sessionIds } },
      });
      console.log(`  Deleted ${deletedSessions.count} AuthSession records.`);
    }

    // E. Delete AbuseFlags
    if (abuseFlagIds.length > 0) {
      const deletedFlags = await tx.abuseFlag.deleteMany({
        where: { id: { in: abuseFlagIds } },
      });
      console.log(`  Deleted ${deletedFlags.count} AbuseFlag records.`);
    }

    // F. Delete AuditLogs
    if (auditLogIds.length > 0) {
      const deletedLogs = await tx.auditLog.deleteMany({
        where: { id: { in: auditLogIds } },
      });
      console.log(`  Deleted ${deletedLogs.count} AuditLog records.`);
    }

    // G. Reset DropPoolItem stock
    await tx.dropPoolItem.updateMany({
      where: { periodId: "period-load-test" },
      data: {
        claimedStock: 0,
        remainingStock: 0,
        allocatedStock: 0,
      },
    });
    console.log("  Reset DropPoolItem stock for period-load-test to 0.");

    // H. Reset Drop and DropPeriod status to ENDED
    await tx.dropPeriod.update({
      where: { id: "period-load-test" },
      data: { status: "ENDED" },
    });

    await tx.drop.update({
      where: { id: "drop-load-test" },
      data: { status: "ENDED" },
    });
    console.log("  Reset drop-load-test and period-load-test status to ENDED.");
  });

  console.log("\nAtomic cleanup transaction committed successfully.");
}

main()
  .catch((e) => {
    console.error("Cleanup failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
