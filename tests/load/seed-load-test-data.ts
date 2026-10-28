/**
 * Task 5-B: Test Data Seeder for Drops Load Testing
 *
 * SAFETY GUARD:
 * Refuses to run if DATABASE_URL points to production or Supabase without explicit
 * ALLOW_STAGING_SUPABASE=true flag, to comply strictly with Rule 4:
 * "Jangan menjalankan load test terhadap production atau database Supabase aktif."
 *
 * Generates:
 *   - 100 isolated test users with wallet addresses
 *   - 100 active AuthSessions in database
 *   - tests/load/load-test-sessions.json with sealed iron-session cookies
 *   - 1 active Drop ('drop-load-test') and DropPeriod ('period-load-test')
 *   - DropPoolItems with allocated stock for load testing
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
import fs from "node:fs";
import path from "node:path";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL must target the isolated test database.");
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const dbUrl = process.env.DATABASE_URL || "";

  // Safety guard: this load-test seeder may only target local PostgreSQL.
  let parsedDbUrl: URL;
  try {
    parsedDbUrl = new URL(dbUrl);
  } catch {
    throw new Error("Invalid DATABASE_URL; refusing to seed.");
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  const isLocalPostgres =
    ["postgres:", "postgresql:"].includes(parsedDbUrl.protocol) &&
    localHosts.has(parsedDbUrl.hostname) &&
    parsedDbUrl.pathname === "/chimphood_test";

  if (!isLocalPostgres) {
    throw new Error(
      "Safety guard: seeder only permits local PostgreSQL database chimphood_test. No data was seeded.",
    );
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 32) {
    console.error("SESSION_SECRET must be at least 32 characters to seal test cookies.");
    process.exit(1);
  }

  console.log("Seeding isolated test data for 100 concurrent claims...");

  const now = new Date();
  const startsAt = new Date(now.getTime() - 5 * 60 * 1000); // Started 5 mins ago
  const endsAt = new Date(now.getTime() + 25 * 60 * 1000); // Ends in 25 mins

  // 1. Create or ensure test traits exist
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
      update: {},
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

  // 2. Create isolated test drop
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

  // 3. Create active drop period
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

  // 4. Create DropPoolItems
  // Default: 20 stock total for contention testing (or 100 for capacity testing)
  const stockConfig = [
    { traitId: "trait-load-bg", stock: 10, weight: 50 },
    { traitId: "trait-load-fur", stock: 6, weight: 30 },
    { traitId: "trait-load-head", stock: 4, weight: 20 },
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

  // 5. Seed 100 test users and sessions
  const sessions: Array<{ userId: string; address: string; cookie: string }> = [];
  const TOTAL_TEST_USERS = 100;

  console.log(
    `Generating ${TOTAL_TEST_USERS} test user accounts and sealed session cookies...`,
  );

  for (let i = 1; i <= TOTAL_TEST_USERS; i++) {
    const padded = String(i).padStart(3, "0");
    const address = `0x9999${i.toString(16).padStart(36, "0")}`.toLowerCase();
    const userId = `usr-load-test-${padded}`;

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

  const outputPath = path.join(__dirname, "load-test-sessions.json");
  fs.writeFileSync(outputPath, JSON.stringify(sessions, null, 2), "utf8");
  console.log(`Successfully saved ${sessions.length} sessions to ${outputPath}`);
  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
