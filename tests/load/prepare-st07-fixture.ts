/**
 * ST-07 Master Execution: Dedicated Fixture Preparation
 * File: tests/load/prepare-st07-fixture.ts
 *
 * Prepares isolated test entities strictly in local PostgreSQL database `chimphood_test`:
 *   - Dedicated test Drop ('drop-load-test') and DropPeriod ('period-load-test') set to ACTIVE
 *   - Dedicated DropPoolItems with 150 total stock (50 bg, 50 fur, 50 headwear)
 *   - Exactly ONE dedicated synthetic user account (usr-st07-single-001)
 *   - Exactly ONE linked WalletIdentity record (0x7777...007)
 *   - Exactly ONE linked XIdentity record (satisfying checkUserDropEligibility)
 *   - Exactly ONE active AuthSession valid for 24h
 *   - tests/load/st07-test-session.json with sealed iron-session cookie
 *   - tests/load/st07-fixture-manifest.json with all created record IDs
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
  console.log("ST-07 Fixture Preparation (Local chimphood_test)");
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
  const startsAt = new Date(now.getTime() - 5 * 60 * 1000);  // Started 5 mins ago (active claim window)
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

  // 2. Upsert isolated test Drop
  const drop = await prisma.drop.upsert({
    where: { slug: "drop-load-test" },
    update: {
      status: "ACTIVE",
      startsAt,
      endsAt,
    },
    create: {
      id: "drop-load-test",
      slug: "drop-load-test",
      title: "Load Test Genesis Drop",
      status: "ACTIVE",
      startsAt,
      endsAt,
      cycleDurationHours: 2,
    },
  });

  // 3. Upsert isolated test DropPeriod
  const period = await prisma.dropPeriod.upsert({
    where: { id: "period-load-test" },
    update: {
      status: "ACTIVE",
      startsAt,
      endsAt,
      configLockAt: endsAt,
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
      configLockAt: endsAt,
      isStockConfigured: true,
      isStockLocked: true,
    },
  });

  // 4. Configure stock: 50 bg, 50 fur, 50 headwear = 150 units total
  const stockConfig = [
    { traitId: "trait-load-bg", allocated: 50, weight: 50 },
    { traitId: "trait-load-fur", allocated: 50, weight: 30 },
    { traitId: "trait-load-head", allocated: 50, weight: 20 },
  ];

  const poolItemIds: string[] = [];
  for (const s of stockConfig) {
    const existingPoolItem = await prisma.dropPoolItem.findFirst({
      where: {
        periodId: period.id,
        traitId: s.traitId,
      },
    });

    if (existingPoolItem) {
      const updated = await prisma.dropPoolItem.update({
        where: { id: existingPoolItem.id },
        data: {
          allocatedStock: s.allocated,
          remainingStock: s.allocated,
          claimedStock: 0,
          weight: s.weight,
        },
      });
      poolItemIds.push(updated.id);
    } else {
      const created = await prisma.dropPoolItem.create({
        data: {
          periodId: period.id,
          traitId: s.traitId,
          allocatedStock: s.allocated,
          remainingStock: s.allocated,
          claimedStock: 0,
          weight: s.weight,
        },
      });
      poolItemIds.push(created.id);
    }
  }

  // 5. Create exactly ONE dedicated ST-07 synthetic user
  const targetUserId = "usr-st07-single-001";
  const targetAddress = "0x0707070707070707070707070707070707070707".toLowerCase();
  const targetXId = "777700000000000001";
  const targetUsername = "st07_single_user";

  // Cleanup any old ST-07 records if previously aborted
  await prisma.claim.deleteMany({ where: { userId: targetUserId } });
  await prisma.inventoryItem.deleteMany({ where: { ownerId: targetUserId } });
  await prisma.authSession.deleteMany({ where: { userId: targetUserId } });
  await prisma.walletIdentity.deleteMany({ where: { OR: [{ userId: targetUserId }, { address: targetAddress }] } });
  await prisma.xIdentity.deleteMany({ where: { OR: [{ userId: targetUserId }, { xId: targetXId }, { username: targetUsername }] } });
  await prisma.user.deleteMany({ where: { id: targetUserId } });

  // Create User
  const user = await prisma.user.create({
    data: {
      id: targetUserId,
      role: "USER",
      isBanned: false,
    },
  });

  // Create WalletIdentity
  const wallet = await prisma.walletIdentity.create({
    data: {
      userId: targetUserId,
      address: targetAddress,
    },
  });

  // Create XIdentity
  const xIdentity = await prisma.xIdentity.create({
    data: {
      userId: targetUserId,
      xId: targetXId,
      username: targetUsername,
    },
  });

  // Create AuthSession
  const rawToken = generateSessionToken();
  const hashedToken = hashSessionToken(rawToken);
  const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const authSession = await prisma.authSession.create({
    data: {
      userId: targetUserId,
      token: hashedToken,
      expiresAt: sessionExpiresAt,
    },
  });

  // Seal iron-session cookie
  const sessionOptions = getSessionOptions();
  const sessionData = {
    userId: targetUserId,
    address: targetAddress,
    token: rawToken,
  };
  const sealedData = await sealData(sessionData, sessionOptions);
  const cookieHeader = `${SESSION_COOKIE_NAME}=${sealedData}`;

  // Verify eligibility pre-flight
  const eligibility = await checkUserDropEligibility(prisma, targetUserId, new Date());
  console.log("Pre-flight Eligibility Check:", JSON.stringify(eligibility, null, 2));

  if (!eligibility.isEligible) {
    throw new Error(
      `ABORT: Prepared test user is not eligible: ${eligibility.missingRequirements.join(", ")}`,
    );
  }

  // Verify existing claim count for this period
  const existingClaims = await prisma.claim.count({
    where: { periodId: period.id },
  });
  if (existingClaims !== 0) {
    throw new Error(`ABORT: Expected 0 claims in period ${period.id}, found ${existingClaims}`);
  }

  // Save session info to file for benchmark harness
  const sessionOutputFile = path.resolve(__dirname, "st07-test-session.json");
  fs.writeFileSync(
    sessionOutputFile,
    JSON.stringify(
      {
        userId: targetUserId,
        address: targetAddress,
        sessionId: authSession.id,
        cookie: cookieHeader,
      },
      null,
      2,
    ),
  );

  // Save manifest without secret tokens
  const manifest = {
    benchmark: "ST-07",
    scenario: "SAME_WALLET_CONCURRENT_CLAIM",
    targetDatabase: parsedDbUrl.pathname,
    prePreparationCounts: preCounts,
    fixture: {
      dropId: drop.id,
      dropSlug: drop.slug,
      periodId: period.id,
      poolItemIds,
      traitIds: stockConfig.map((s) => s.traitId),
      totalAllocatedStock: 150,
      initialRemainingStock: 150,
      initialClaimedStock: 0,
      user: {
        id: user.id,
        address: wallet.address,
        walletId: wallet.id,
        xIdentityId: xIdentity.id,
        authSessionId: authSession.id,
      },
    },
    createdAt: new Date().toISOString(),
  };

  const manifestPath = path.resolve(__dirname, "st07-fixture-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`\nST-07 Fixture preparation completed successfully!`);
  console.log(`Manifest saved: ${manifestPath}`);
  console.log(`Session saved:  ${sessionOutputFile}`);
}

main()
  .catch((err) => {
    console.error("FATAL ERROR in prepare-st07-fixture:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
