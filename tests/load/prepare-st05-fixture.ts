/**
 * ST-05 Master Execution: Dedicated Fixture Preparation
 * File: tests/load/prepare-st05-fixture.ts
 *
 * Prepares isolated test entities strictly in local PostgreSQL database `chimphood_test`:
 *   - Dedicated test Drop ('drop-load-test') and DropPeriod ('period-load-test')
 *   - Dedicated DropPoolItems with 100 allocated stock (50 bg, 30 fur, 20 headwear)
 *   - 100 distinct synthetic user accounts (usr-load-test-001 .. usr-load-test-100)
 *   - 100 linked WalletIdentity records
 *   - 100 linked XIdentity records (satisfying checkUserDropEligibility)
 *   - 100 active AuthSessions valid for 24h
 *   - tests/load/load-test-sessions.json with sealed iron-session cookies
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
  console.log("ST-05 Fixture Preparation (Local chimphood_test)");
  console.log("Target Database: " + parsedDbUrl.pathname + " on " + parsedDbUrl.hostname);
  console.log("==================================================================\n");

  const now = new Date();
  const startsAt = new Date(now.getTime() - 10 * 60 * 1000); // Started 10 mins ago
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

  // 4. Clean up previous test claims and acquired inventory items for this period
  const deletedClaims = await prisma.claim.deleteMany({
    where: { periodId: period.id },
  });
  console.log(`Pruned ${deletedClaims.count} prior test claims for period: ${period.id}`);

  const deletedItems = await prisma.inventoryItem.deleteMany({
    where: {
      ownerId: { startsWith: "usr-load-test-" },
      acquiredVia: "CLAIM",
    },
  });
  console.log(`Pruned ${deletedItems.count} prior test inventory items.`);

  const deletedSessions = await prisma.authSession.deleteMany({
    where: {
      userId: { startsWith: "usr-load-test-" },
    },
  });
  console.log(`Pruned ${deletedSessions.count} prior test sessions.`);

  // 5. Configure DropPoolItems for 100 total capacity
  const stockConfig = [
    { traitId: "trait-load-bg", stock: 50, weight: 50 },
    { traitId: "trait-load-fur", stock: 30, weight: 30 },
    { traitId: "trait-load-head", stock: 20, weight: 20 },
  ];

  for (const s of stockConfig) {
    await prisma.dropPoolItem.upsert({
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
  }
  console.log("Configured DropPoolItems with 100 total allocated stock (50 BG, 30 Fur, 20 Headwear).");

  // 6. Seed 100 test users, wallets, X identities, and auth sessions
  const TOTAL_TEST_USERS = 100;
  const sessions: Array<{ userId: string; address: string; cookie: string }> = [];

  console.log(`Preparing ${TOTAL_TEST_USERS} distinct synthetic users with linked X identities...`);

  for (let i = 1; i <= TOTAL_TEST_USERS; i++) {
    const padded = String(i).padStart(3, "0");
    const address = `0x9999${i.toString(16).padStart(36, "0")}`.toLowerCase();
    const userId = `usr-load-test-${padded}`;
    const xId = `999900000000000${padded}`;
    const username = `loadtest_${padded}`;

    // Upsert User
    const user = await prisma.user.upsert({
      where: { id: userId },
      update: { isBanned: false },
      create: {
        id: userId,
        role: "USER",
        isBanned: false,
        wallet: {
          create: { address },
        },
      },
    });

    // Ensure WalletIdentity exists
    await prisma.walletIdentity.upsert({
      where: { userId: user.id },
      update: { address },
      create: {
        userId: user.id,
        address,
      },
    });

    // Ensure XIdentity exists (required by checkUserDropEligibility)
    await prisma.xIdentity.upsert({
      where: { userId: user.id },
      update: { xId, username },
      create: {
        userId: user.id,
        xId,
        username,
      },
    });

    // Create fresh AuthSession
    const rawToken = generateSessionToken();
    const hashedToken = hashSessionToken(rawToken);

    await prisma.authSession.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const sessionData = {
      userId: user.id,
      address,
      token: rawToken,
    };

    const sealed = await sealData(sessionData, getSessionOptions());

    sessions.push({
      userId: user.id,
      address,
      cookie: `${SESSION_COOKIE_NAME}=${sealed}`,
    });
  }

  // Write sealed session cookies
  const outputPath = path.resolve(__dirname, "load-test-sessions.json");
  fs.writeFileSync(outputPath, JSON.stringify(sessions, null, 2), "utf8");
  console.log(`Saved ${sessions.length} sealed sessions to ${outputPath}`);

  // 7. Pre-flight verification of eligibility for sample user
  console.log("\nPre-flight check: evaluating eligibility for usr-load-test-001...");
  const sampleEligibility = await checkUserDropEligibility(prisma, "usr-load-test-001", new Date());
  console.log("Eligibility result:", sampleEligibility);
  if (!sampleEligibility.isEligible) {
    throw new Error(
      `Eligibility pre-flight failed: ${sampleEligibility.missingRequirements.join(", ")}`,
    );
  }
  console.log("PRE-FLIGHT PASSED: Synthetic users satisfy all drop claim prerequisites.");

  console.log("\n==================================================================");
  console.log("ST-05 Fixture Preparation Complete.");
  console.log(`Drop ID:   ${drop.id}`);
  console.log(`Period ID: ${period.id}`);
  console.log(`Total Synthetic Users: ${sessions.length}`);
  console.log(`Total Allocated Stock: 100`);
  console.log("==================================================================");
}

main()
  .catch((e) => {
    console.error("Fixture preparation failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
