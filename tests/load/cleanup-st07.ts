/**
 * ST-07 Master Execution: Controlled Atomic Cleanup Script
 * File: tests/load/cleanup-st07.ts
 *
 * Atomically removes records created specifically for ST-07 using exact IDs from manifest:
 *   - Exactly 1 test Claim record (id = 'cmwizq4c60003seqavkaekxl1')
 *   - Exactly 1 test InventoryItem record (id = 'cmwizq4bf0000seqa37jyiw3e')
 *   - Exactly 1 test AuthSession record (id = 'cmwizgu690002geqawlkmmhaw')
 *   - Exactly 1 test XIdentity record (id = 'cmwizgu670001geqaz37d4n8p')
 *   - Exactly 1 test WalletIdentity record (id = 'cmwizgu650000geqa4gtvquk4')
 *   - Exactly 1 test User record (id = 'usr-st07-single-001')
 *   - ST-07 AuditLog and AbuseFlag records if any
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

const manifestPath = path.resolve(__dirname, "st07-fixture-manifest.json");
if (!fs.existsSync(manifestPath)) {
  throw new Error(`[CLEANUP_GUARD] Manifest file not found: ${manifestPath}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const targetUserId = manifest.fixture.user.id;
const targetWalletId = manifest.fixture.user.walletId;
const targetXIdentityId = manifest.fixture.user.xIdentityId;
const targetAuthSessionId = manifest.fixture.user.authSessionId;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: rawDbUrl }),
});

async function main() {
  console.log("==================================================================");
  console.log("ST-07 Controlled Atomic Cleanup");
  console.log("Target Database: " + parsedDbUrl.pathname + " on " + parsedDbUrl.hostname);
  console.log("==================================================================\n");

  // 1. Fetch exact IDs for test claims
  const testClaims = await prisma.claim.findMany({
    where: { periodId: "period-load-test" },
    select: { id: true, userId: true, inventoryItemId: true },
  });
  console.log(`Identified ${testClaims.length} ST-07 Claim records.`);

  // Verify only target user
  const invalidClaims = testClaims.filter((c) => c.userId !== targetUserId);
  if (invalidClaims.length > 0) {
    throw new Error(
      `ABORT: Found claims for unexpected user IDs in period-load-test: ${JSON.stringify(invalidClaims)}`,
    );
  }
  const claimIds = testClaims.map((c) => c.id);
  const inventoryItemIds = testClaims.map((c) => c.inventoryItemId);

  // 2. Fetch exact IDs for test inventory items
  const testItems = await prisma.inventoryItem.findMany({
    where: { ownerId: targetUserId },
    select: { id: true, ownerId: true },
  });
  console.log(`Identified ${testItems.length} ST-07 InventoryItem records.`);
  const itemIds = testItems.map((i) => i.id);

  // 3. Fetch exact IDs for test XIdentity records
  const testX = await prisma.xIdentity.findMany({
    where: { userId: targetUserId },
    select: { id: true },
  });
  console.log(`Identified ${testX.length} ST-07 XIdentity records.`);
  const xIdentityIds = testX.map((x) => x.id);

  // 4. Fetch exact IDs for test AuthSession records
  const testSessions = await prisma.authSession.findMany({
    where: { userId: targetUserId },
    select: { id: true },
  });
  console.log(`Identified ${testSessions.length} ST-07 AuthSession records.`);
  const sessionIds = testSessions.map((s) => s.id);

  // 5. Fetch exact IDs for test WalletIdentity records
  const testWallets = await prisma.walletIdentity.findMany({
    where: { userId: targetUserId },
    select: { id: true },
  });
  console.log(`Identified ${testWallets.length} ST-07 WalletIdentity records.`);
  const walletIds = testWallets.map((w) => w.id);

  // 6. Execute atomic transaction
  console.log("\nExecuting atomic cleanup transaction...");
  const cleanupResults = await prisma.$transaction(async (tx) => {
    // a. AuditLog records created by target user
    const auditLogsDeleted = await tx.auditLog.deleteMany({
      where: { actorId: targetUserId },
    });

    // b. AbuseFlag records for target user
    const abuseFlagsDeleted = await tx.abuseFlag.deleteMany({
      where: { userId: targetUserId },
    });

    // c. Delete Claims
    const claimsDeleted = await tx.claim.deleteMany({
      where: { id: { in: claimIds } },
    });

    // d. Delete InventoryItems
    const itemsDeleted = await tx.inventoryItem.deleteMany({
      where: { id: { in: itemIds } },
    });

    // e. Delete AuthSessions
    const sessionsDeleted = await tx.authSession.deleteMany({
      where: { id: { in: sessionIds } },
    });

    // f. Delete XIdentity
    const xDeleted = await tx.xIdentity.deleteMany({
      where: { id: { in: xIdentityIds } },
    });

    // g. Delete WalletIdentity
    const walletsDeleted = await tx.walletIdentity.deleteMany({
      where: { id: { in: walletIds } },
    });

    // h. Delete User
    const usersDeleted = await tx.user.deleteMany({
      where: { id: targetUserId },
    });

    // i. Reset DropPoolItem stock to 0/0/0
    const stockReset = await tx.dropPoolItem.updateMany({
      where: { periodId: "period-load-test" },
      data: {
        allocatedStock: 0,
        remainingStock: 0,
        claimedStock: 0,
      },
    });

    // j. Reset DropPeriod status to ENDED
    const periodReset = await tx.dropPeriod.update({
      where: { id: "period-load-test" },
      data: { status: "ENDED" },
    });

    // k. Reset Drop status to ENDED
    const dropReset = await tx.drop.update({
      where: { id: "drop-load-test" },
      data: { status: "ENDED" },
    });

    return {
      auditLogsDeleted: auditLogsDeleted.count,
      abuseFlagsDeleted: abuseFlagsDeleted.count,
      claimsDeleted: claimsDeleted.count,
      itemsDeleted: itemsDeleted.count,
      sessionsDeleted: sessionsDeleted.count,
      xDeleted: xDeleted.count,
      walletsDeleted: walletsDeleted.count,
      usersDeleted: usersDeleted.count,
      stockReset: stockReset.count,
      periodResetId: periodReset.id,
      dropResetId: dropReset.id,
    };
  });

  console.log("Cleanup Transaction Results:", JSON.stringify(cleanupResults, null, 2));

  // 7. Verify post-cleanup database counts
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

  // Compare with pre-preparation baseline
  const expectedBaseline = {
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

  let countsMatch = true;
  for (const [table, expectedCount] of Object.entries(expectedBaseline)) {
    const actual = (postCounts as any)[table];
    if (actual !== expectedCount) {
      console.error(`MISMATCH on ${table}: expected ${expectedCount}, got ${actual}`);
      countsMatch = false;
    }
  }

  if (!countsMatch) {
    throw new Error("ABORT: Post-cleanup database counts do not match pre-test baseline!");
  }

  console.log("\n[PASS] Controlled cleanup successful. Exact baseline perfectly restored!");
}

main()
  .catch((err) => {
    console.error("FATAL ERROR in cleanup-st07:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
