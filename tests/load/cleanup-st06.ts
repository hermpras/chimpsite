/**
 * ST-06 Master Execution: Controlled Atomic Cleanup Script
 * File: tests/load/cleanup-st06.ts
 *
 * Atomically removes records created specifically for ST-06 using exact IDs from manifest:
 *   - Exactly 50 test Claim records (periodId = 'period-load-test')
 *   - Exactly 50 test InventoryItem records (acquiredVia = 'CLAIM' by usr-st06-*)
 *   - Exactly 500 test AuthSession records created for ST-06
 *   - Exactly 500 test XIdentity records created for ST-06
 *   - Exactly 500 test WalletIdentity records created for ST-06
 *   - Exactly 500 test User records created for ST-06
 *   - Test AbuseFlag and AuditLog records generated during ST-06
 *   - Restores DropPoolItem stock for period-load-test to 0/0/0
 *   - Restores Drop and DropPeriod status to ENDED
 *
 * Verifies that zero baseline records are altered or deleted.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";

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

const manifestPath = path.resolve(__dirname, "st06-fixture-manifest.json");
if (!fs.existsSync(manifestPath)) {
  throw new Error(`[CLEANUP_GUARD] Manifest file not found: ${manifestPath}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const userIdsSet = new Set(manifest.userIds);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: rawDbUrl }),
});

async function main() {
  console.log("==================================================================");
  console.log("ST-06 Controlled Atomic Cleanup");
  console.log("Target Database: " + parsedDbUrl.pathname + " on " + parsedDbUrl.hostname);
  console.log("==================================================================\n");

  // 1. Fetch exact IDs for test claims
  const testClaims = await prisma.claim.findMany({
    where: { periodId: "period-load-test" },
    select: { id: true, userId: true, inventoryItemId: true },
  });
  console.log(`Identified ${testClaims.length} ST-06 Claim records.`);

  // Verify none are non-ST06 users
  const invalidClaims = testClaims.filter((c) => !userIdsSet.has(c.userId));
  if (invalidClaims.length > 0) {
    throw new Error(
      `ABORT: Found claims for non-ST06 user IDs in period-load-test: ${JSON.stringify(invalidClaims)}`,
    );
  }
  const claimIds = testClaims.map((c) => c.id);
  const inventoryItemIds = testClaims.map((c) => c.inventoryItemId);

  // 2. Fetch exact IDs for test inventory items
  const testItems = await prisma.inventoryItem.findMany({
    where: {
      id: { in: inventoryItemIds },
    },
    select: { id: true, ownerId: true },
  });
  console.log(`Identified ${testItems.length} ST-06 InventoryItem records.`);
  const invalidItems = testItems.filter((i) => !userIdsSet.has(i.ownerId));
  if (invalidItems.length > 0) {
    throw new Error(
      `ABORT: Found inventory items belonging to non-ST06 users: ${JSON.stringify(invalidItems)}`,
    );
  }
  const itemIds = testItems.map((i) => i.id);

  // 3. Fetch exact IDs for test XIdentity records
  const testX = await prisma.xIdentity.findMany({
    where: { userId: { in: manifest.userIds } },
    select: { id: true },
  });
  console.log(`Identified ${testX.length} ST-06 XIdentity records.`);
  const xIdentityIds = testX.map((x) => x.id);

  // 4. Fetch exact IDs for test AuthSession records
  const testSessions = await prisma.authSession.findMany({
    where: { userId: { in: manifest.userIds } },
    select: { id: true },
  });
  console.log(`Identified ${testSessions.length} ST-06 AuthSession records.`);
  const sessionIds = testSessions.map((s) => s.id);

  // 5. Fetch exact IDs for test WalletIdentity records
  const testWallets = await prisma.walletIdentity.findMany({
    where: { userId: { in: manifest.userIds } },
    select: { id: true },
  });
  console.log(`Identified ${testWallets.length} ST-06 WalletIdentity records.`);
  const walletIds = testWallets.map((w) => w.id);

  // 6. Fetch test AbuseFlags
  const testAbuseFlags = await prisma.abuseFlag.findMany({
    where: { userId: { in: manifest.userIds } },
    select: { id: true },
  });
  console.log(`Identified ${testAbuseFlags.length} ST-06 AbuseFlag records.`);
  const abuseFlagIds = testAbuseFlags.map((f) => f.id);

  // 7. Fetch test AuditLogs
  const testAuditLogs = await prisma.auditLog.findMany({
    where: { actorId: { in: manifest.userIds } },
    select: { id: true },
  });
  console.log(`Identified ${testAuditLogs.length} ST-06 AuditLog records.`);
  const auditLogIds = testAuditLogs.map((a) => a.id);

  // Perform atomic cleanup inside a transaction
  console.log("\nExecuting atomic cleanup transaction...");
  await prisma.$transaction(async (tx) => {
    // A. Delete Claims (foreign key to InventoryItem has onDelete: Restrict)
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

    // C. Delete AbuseFlags
    if (abuseFlagIds.length > 0) {
      const deletedFlags = await tx.abuseFlag.deleteMany({
        where: { id: { in: abuseFlagIds } },
      });
      console.log(`  Deleted ${deletedFlags.count} AbuseFlag records.`);
    }

    // D. Delete AuditLogs
    if (auditLogIds.length > 0) {
      const deletedLogs = await tx.auditLog.deleteMany({
        where: { id: { in: auditLogIds } },
      });
      console.log(`  Deleted ${deletedLogs.count} AuditLog records.`);
    }

    // E. Delete AuthSessions
    if (sessionIds.length > 0) {
      const deletedSessions = await tx.authSession.deleteMany({
        where: { id: { in: sessionIds } },
      });
      console.log(`  Deleted ${deletedSessions.count} AuthSession records.`);
    }

    // F. Delete XIdentities
    if (xIdentityIds.length > 0) {
      const deletedX = await tx.xIdentity.deleteMany({
        where: { id: { in: xIdentityIds } },
      });
      console.log(`  Deleted ${deletedX.count} XIdentity records.`);
    }

    // G. Delete WalletIdentities
    if (walletIds.length > 0) {
      const deletedWallets = await tx.walletIdentity.deleteMany({
        where: { id: { in: walletIds } },
      });
      console.log(`  Deleted ${deletedWallets.count} WalletIdentity records.`);
    }

    // H. Delete Users
    const deletedUsers = await tx.user.deleteMany({
      where: { id: { in: manifest.userIds } },
    });
    console.log(`  Deleted ${deletedUsers.count} User records.`);

    // I. Restore DropPoolItem stock for period-load-test to 0/0/0
    await tx.dropPoolItem.updateMany({
      where: { periodId: "period-load-test" },
      data: {
        claimedStock: 0,
        remainingStock: 0,
        allocatedStock: 0,
      },
    });
    console.log("  Restored DropPoolItem stock for period-load-test to 0/0/0.");

    // J. Restore Drop and DropPeriod status to ENDED
    await tx.dropPeriod.update({
      where: { id: "period-load-test" },
      data: { status: "ENDED" },
    });

    await tx.drop.update({
      where: { id: "drop-load-test" },
      data: { status: "ENDED" },
    });
    console.log("  Restored drop-load-test and period-load-test status to ENDED.");
  });

  console.log("\nAtomic cleanup transaction committed successfully.");

  // Post-cleanup count check
  const postCounts = {
    User: await prisma.user.count(),
    WalletIdentity: await prisma.walletIdentity.count(),
    XIdentity: await prisma.xIdentity.count(),
    AuthSession: await prisma.authSession.count(),
    Drop: await prisma.drop.count(),
    DropPeriod: await prisma.dropPeriod.count(),
    DropPoolItem: await prisma.dropPoolItem.count(),
    Claim: await prisma.claim.count(),
    InventoryItem: await prisma.inventoryItem.count(),
    Trait: await prisma.trait.count(),
  };

  console.log("\nPost-cleanup Database Counts:", JSON.stringify(postCounts, null, 2));

  const expectedCounts = {
    User: 394,
    WalletIdentity: 384,
    XIdentity: 274,
    AuthSession: 180,
    Drop: 3,
    DropPeriod: 6,
    DropPoolItem: 32,
    Claim: 1,
    InventoryItem: 1176,
    Trait: 57,
  };

  let allMatch = true;
  for (const [key, expected] of Object.entries(expectedCounts)) {
    const actual = (postCounts as any)[key];
    if (actual !== expected) {
      console.error(`MISMATCH: ${key} expected ${expected}, got ${actual}`);
      allMatch = false;
    }
  }

  if (!allMatch) {
    throw new Error("Post-cleanup count verification failed against clean baseline!");
  }

  console.log("\nFINAL VERIFICATION: All 10 database table counts match the clean baseline perfectly!");
}

main()
  .catch((e) => {
    console.error("ST-06 Cleanup failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
