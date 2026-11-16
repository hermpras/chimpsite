/**
 * ST-06 Master Execution: Dedicated Fixture Preparation
 * File: tests/load/prepare-st06-fixture.ts
 *
 * Prepares isolated test entities strictly in local PostgreSQL database `chimphood_test`:
 *   - Dedicated test Drop ('drop-load-test') and DropPeriod ('period-load-test')
 *   - Dedicated DropPoolItems with exactly 50 allocated stock (25 bg, 15 fur, 10 headwear)
 *   - 500 distinct synthetic user accounts (usr-st06-001 .. usr-st06-500)
 *   - 500 linked WalletIdentity records
 *   - 500 linked XIdentity records (satisfying checkUserDropEligibility)
 *   - 500 active AuthSessions valid for 24h
 *   - tests/load/st06-test-sessions.json with sealed iron-session cookies
 *   - tests/load/st06-fixture-manifest.json with all created record IDs
 *
 * Verifies eligibility pre-flight before completing.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { sealData } from "iron-session";
import {
  generateSessionToken,
  hashSessionToken,
  SESSION_COOKIE_NAME,
  getSessionOptions,
} from "../../lib/auth/session";
import { checkUserDropEligibility } from "../../server/drops/eligibility";
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
  throw new Error("[SECURITY_GUARD] Invalid or malformed DATABASE_URL; refusing to prepare fixture.");
}

const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const isAllowedHost = localHosts.has(parsedDbUrl.hostname.replace(/^\[|\]$/g, "").toLowerCase());
const isAllowedProtocol = ["postgres:", "postgresql:"].includes(parsedDbUrl.protocol);
const isAllowedPort = parsedDbUrl.port === "" || parsedDbUrl.port === "5432";
const isAllowedDb = parsedDbUrl.pathname === "/chimphood_test";

if (!isAllowedProtocol || !isAllowedHost || !isAllowedPort || !isAllowedDb) {
  throw new Error(
    "[SECURITY_GUARD] Refusing to prepare fixture: target must strictly be local PostgreSQL (chimphood_test on port 5432).",
  );
}

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || typeof sessionSecret !== "string" || sessionSecret.trim().length < 32) {
  throw new Error(
    "[SECURITY_GUARD] SESSION_SECRET environment variable is missing or less than 32 characters. Execution aborted.",
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: rawDbUrl }),
});

async function main() {
  console.log("==================================================================");
  console.log("ST-06 Fixture Preparation (Local chimphood_test)");
  console.log("Target Database: " + parsedDbUrl.pathname + " on " + parsedDbUrl.hostname);
  console.log("==================================================================\n");

  // Record pre-preparation database counts
  const preCounts = {
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
  console.log("Pre-preparation Baseline Counts:", JSON.stringify(preCounts, null, 2));

  const now = new Date();
  const startsAt = new Date(now.getTime() - 5 * 60 * 1000);  // Started 5 mins ago
  const endsAt = new Date(now.getTime() + 120 * 60 * 1000);  // Ends in 120 mins

  // 1. Ensure test traits exist
  const traitsData = [
    {
      id: "trait-load-bg",
      slug: "trait-load-bg",
      name: "Load Matrix BG",
      category: "BG" as const,
      rarity: "COMMON" as const,
    },
    {
      id: "trait-load-fur",
      slug: "trait-load-fur",
      name: "Load Golden Fur",
      category: "FUR" as const,
      rarity: "RARE" as const,
    },
    {
      id: "trait-load-head",
      slug: "trait-load-head",
      name: "Load Neon Visor",
      category: "HEADWEAR" as const,
      rarity: "EPIC" as const,
    },
  ];

  for (const t of traitsData) {
    await prisma.trait.upsert({
      where: { slug: t.slug },
      update: { isActive: true },
      create: {
        id: t.id,
        slug: t.slug,
        name: t.name,
        category: t.category,
        rarity: t.rarity,
        imageUrl: `/test/${t.slug}.png`,
        isActive: true,
      },
    });
  }

  // 2. Ensure test Drop exists and is ACTIVE
  const drop = await prisma.drop.upsert({
    where: { slug: "drop-load-test" },
    update: { status: "ACTIVE", startsAt, endsAt },
    create: {
      id: "drop-load-test",
      slug: "drop-load-test",
      title: "Load Test Genesis Drop",
      status: "ACTIVE",
      startsAt,
      endsAt,
    },
  });

  // 3. Ensure test DropPeriod exists and is ACTIVE
  const period = await prisma.dropPeriod.upsert({
    where: {
      dropId_periodIndex: {
        dropId: drop.id,
        periodIndex: 1,
      },
    },
    update: {
      status: "ACTIVE",
      startsAt,
      endsAt,
      isStockConfigured: true,
      isStockLocked: true,
    },
    create: {
      id: "period-load-test",
      dropId: drop.id,
      periodIndex: 1,
      status: "ACTIVE",
      startsAt,
      endsAt,
      configLockAt: startsAt,
      isStockConfigured: true,
      isStockLocked: true,
    },
  });

  // Clean any lingering claims for period-load-test if any exist
  const existingPeriodClaims = await prisma.claim.findMany({
    where: { periodId: period.id },
    select: { id: true, inventoryItemId: true },
  });
  if (existingPeriodClaims.length > 0) {
    const claimIds = existingPeriodClaims.map((c) => c.id);
    const itemIds = existingPeriodClaims.map((c) => c.inventoryItemId);
    await prisma.claim.deleteMany({ where: { id: { in: claimIds } } });
    await prisma.inventoryItem.deleteMany({ where: { id: { in: itemIds } } });
    console.log(`Pruned ${existingPeriodClaims.length} prior test claims and inventory items.`);
  }

  // 4. Configure DropPoolItems for EXACTLY 50 total stock: 25 BG, 15 Fur, 10 Headwear
  const stockConfig = [
    { traitId: "trait-load-bg", stock: 25, weight: 50 },
    { traitId: "trait-load-fur", stock: 15, weight: 30 },
    { traitId: "trait-load-head", stock: 10, weight: 20 },
  ];

  const poolItemIds: string[] = [];
  for (const s of stockConfig) {
    const item = await prisma.dropPoolItem.upsert({
      where: {
        periodId_traitId: {
          periodId: period.id,
          traitId: s.traitId,
        },
      },
      update: {
        allocatedStock: s.stock,
        claimedStock: 0,
        remainingStock: s.stock,
        weight: s.weight,
      },
      create: {
        periodId: period.id,
        traitId: s.traitId,
        allocatedStock: s.stock,
        claimedStock: 0,
        remainingStock: s.stock,
        weight: s.weight,
      },
    });
    poolItemIds.push(item.id);
  }

  const poolSummary = await prisma.dropPoolItem.findMany({
    where: { periodId: period.id },
  });
  const totalAllocated = poolSummary.reduce((sum, item) => sum + item.allocatedStock, 0);
  const totalRemaining = poolSummary.reduce((sum, item) => sum + item.remainingStock, 0);
  const totalClaimed = poolSummary.reduce((sum, item) => sum + item.claimedStock, 0);

  if (totalAllocated !== 50 || totalRemaining !== 50 || totalClaimed !== 0) {
    throw new Error(
      `Stock invariant validation failed: allocated=${totalAllocated}, remaining=${totalRemaining}, claimed=${totalClaimed}. Expected exactly 50/50/0.`,
    );
  }
  console.log(`Configured DropPoolItems with EXACTLY 50 total allocated stock (25 BG, 15 Fur, 10 Headwear).`);

  // 5. Seed 500 dedicated test users, wallets, X identities, and auth sessions
  const TOTAL_TEST_USERS = 500;
  const sessions: Array<{ userId: string; address: string; cookie: string }> = [];
  const createdManifest = {
    dropId: drop.id,
    periodId: period.id,
    poolItemIds,
    traitIds: stockConfig.map((s) => s.traitId),
    userIds: [] as string[],
    walletAddresses: [] as string[],
    xIdentityIds: [] as string[],
    authSessionIds: [] as string[],
  };

  console.log(`Preparing ${TOTAL_TEST_USERS} distinct synthetic users (usr-st06-001 .. usr-st06-500)...`);

  const BATCH_SIZE = 50;
  for (let batchStart = 1; batchStart <= TOTAL_TEST_USERS; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, TOTAL_TEST_USERS);
    const userBatch: Array<{
      id: string;
      role: "USER";
      isBanned: boolean;
    }> = [];
    const walletBatch: Array<{
      userId: string;
      address: string;
    }> = [];
    const xBatch: Array<{
      userId: string;
      xId: string;
      username: string;
    }> = [];
    const sessionBatch: Array<{
      id?: string;
      userId: string;
      token: string;
      expiresAt: Date;
    }> = [];

    const sessionDataList: Array<{
      userId: string;
      address: string;
      rawToken: string;
    }> = [];

    for (let i = batchStart; i <= batchEnd; i++) {
      const padded = String(i).padStart(3, "0");
      const address = `0x8888${i.toString(16).padStart(36, "0")}`.toLowerCase();
      const userId = `usr-st06-${padded}`;
      const xId = `888800000000000${padded}`;
      const username = `st06_user_${padded}`;

      userBatch.push({ id: userId, role: "USER", isBanned: false });
      walletBatch.push({ userId, address });
      xBatch.push({ userId, xId, username });

      const rawToken = generateSessionToken();
      const hashedToken = hashSessionToken(rawToken);
      sessionBatch.push({
        userId,
        token: hashedToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      sessionDataList.push({ userId, address, rawToken });
      createdManifest.userIds.push(userId);
      createdManifest.walletAddresses.push(address);
    }

    // Insert Users
    await prisma.user.createMany({
      data: userBatch,
      skipDuplicates: true,
    });

    // Insert WalletIdentities
    await prisma.walletIdentity.createMany({
      data: walletBatch,
      skipDuplicates: true,
    });

    // Insert XIdentities
    await prisma.xIdentity.createMany({
      data: xBatch,
      skipDuplicates: true,
    });

    // Insert AuthSessions
    await prisma.authSession.createMany({
      data: sessionBatch,
      skipDuplicates: true,
    });

    // Seal cookies for each session in batch
    for (const item of sessionDataList) {
      const sessionData = {
        userId: item.userId,
        address: item.address,
        token: item.rawToken,
      };
      const sealed = await sealData(sessionData, getSessionOptions());
      sessions.push({
        userId: item.userId,
        address: item.address,
        cookie: `${SESSION_COOKIE_NAME}=${sealed}`,
      });
    }
  }

  // Fetch created XIdentity and AuthSession IDs for the manifest
  const xRecords = await prisma.xIdentity.findMany({
    where: { userId: { in: createdManifest.userIds } },
    select: { id: true },
  });
  createdManifest.xIdentityIds = xRecords.map((x) => x.id);

  const sessionRecords = await prisma.authSession.findMany({
    where: { userId: { in: createdManifest.userIds } },
    select: { id: true },
  });
  createdManifest.authSessionIds = sessionRecords.map((s) => s.id);

  // Write sealed session cookies
  const sessionsOutputPath = path.resolve(__dirname, "st06-test-sessions.json");
  fs.writeFileSync(sessionsOutputPath, JSON.stringify(sessions, null, 2), "utf8");
  console.log(`Saved ${sessions.length} sealed sessions to ${sessionsOutputPath}`);

  // Write manifest
  const manifestOutputPath = path.resolve(__dirname, "st06-fixture-manifest.json");
  fs.writeFileSync(manifestOutputPath, JSON.stringify(createdManifest, null, 2), "utf8");
  console.log(`Saved fixture manifest with ${createdManifest.userIds.length} users to ${manifestOutputPath}`);

  // 6. Pre-flight verification of eligibility
  console.log("\nPre-flight check: evaluating eligibility for usr-st06-001...");
  const sample1 = await checkUserDropEligibility(prisma, "usr-st06-001", new Date());
  console.log("usr-st06-001 Eligibility:", sample1);
  if (!sample1.isEligible) {
    throw new Error(
      `Eligibility pre-flight failed for usr-st06-001: ${sample1.missingRequirements.join(", ")}`,
    );
  }

  console.log("Pre-flight check: evaluating eligibility for usr-st06-500...");
  const sample500 = await checkUserDropEligibility(prisma, "usr-st06-500", new Date());
  console.log("usr-st06-500 Eligibility:", sample500);
  if (!sample500.isEligible) {
    throw new Error(
      `Eligibility pre-flight failed for usr-st06-500: ${sample500.missingRequirements.join(", ")}`,
    );
  }

  console.log("\n==================================================================");
  console.log("PRE-FLIGHT PASSED: All synthetic users satisfy drop claim prerequisites.");
  console.log(`Drop ID:               ${drop.id}`);
  console.log(`Period ID:             ${period.id}`);
  console.log(`Total Synthetic Users: ${sessions.length}`);
  console.log(`Total Allocated Stock: 50`);
  console.log(`Initial Claimed Stock: 0`);
  console.log(`Initial Remaining Stock: 50`);
  console.log("==================================================================");
}

main()
  .catch((e) => {
    console.error("ST-06 Fixture preparation failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
