/**
 * Test Data Seeder for Whitelist Qualification Load Testing
 *
 * SAFETY GUARD:
 * Refuses to run if DATABASE_URL points to production or Supabase without explicit
 * ALLOW_STAGING_SUPABASE=true flag, to comply strictly with Rule 4:
 * "Jangan menjalankan load test terhadap production atau database Supabase aktif."
 *
 * Generates:
 *   - 5 trait categories (BG, FUR, CLOTHING, HEADWEAR, EYEWEAR)
 *   - 1 active Whitelist Program ('program-load-test') with configurable totalSlots
 *   - 150 isolated test users with wallet addresses, X identities, and all 5 traits
 *   - 150 active AuthSessions in database
 *   - tests/load/whitelist-test-sessions.json with sealed iron-session cookies
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
import dotenv from "dotenv";

// Retain CLI/caller provided DATABASE_URL while sourcing SESSION_SECRET from .env.local
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

function parseArgs() {
  const args = process.argv.slice(2);
  const getArg = (name: string, def: string) => {
    const idx = args.indexOf(`--${name}`);
    if (idx !== -1 && args[idx + 1]) return args[idx + 1];
    const prefix = `--${name}=`;
    const found = args.find((a) => a.startsWith(prefix));
    if (found) return found.slice(prefix.length);
    return def;
  };
  return {
    slots: parseInt(getArg("slots", process.env.WL_SLOTS || "20"), 10),
    users: parseInt(getArg("users", process.env.WL_USERS || "150"), 10),
    resetOnly: args.includes("--reset"),
  };
}

export async function seedWhitelistTestData(options?: {
  slots?: number;
  users?: number;
  resetOnly?: boolean;
}) {
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

  if (!isLocalPostgres && process.env.ALLOW_STAGING_SUPABASE !== "true") {
    throw new Error(
      "Safety guard: seeder only permits local PostgreSQL database chimphood_test. No data was seeded.",
    );
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters to seal test cookies.");
  }

  const opts = {
    slots: options?.slots ?? 20,
    users: options?.users ?? 150,
    resetOnly: options?.resetOnly ?? false,
  };

  console.log("==================================================================");
  console.log(`Seeding Whitelist Load Test Data in ${parsedDbUrl.pathname}`);
  console.log(`Program ID:     program-load-test`);
  console.log(`Total Slots:    ${opts.slots}`);
  console.log(`Test Users:     ${opts.users}`);
  console.log("==================================================================\n");

  const programId = "program-load-test";
  const now = new Date();
  const startsAt = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago
  const endsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours later

  // 1. Clean up existing slots, queue entries, and qualifications for this test program
  console.log("Cleaning up previous load test slots and records...");
  await prisma.wLStatusHistory.deleteMany({
    where: { programId },
  });
  await prisma.wLSlot.deleteMany({
    where: { programId },
  });
  await prisma.wLQueueEntry.deleteMany({
    where: { programId },
  });
  await prisma.wLQualification.deleteMany({
    where: { programId },
  });

  if (!opts.resetOnly) {
    await prisma.inventoryItem.deleteMany({
      where: {
        OR: [
          { ownerId: { startsWith: "usr-wl-load-" } },
          { traitId: { in: ["trait-wl-bg", "trait-wl-fur", "trait-wl-clothing", "trait-wl-headwear", "trait-wl-eyewear"] } },
        ],
      },
    });
  }

  // 2. Ensure test traits exist covering all 5 mandatory categories: BG, FUR, CLOTHING, HEADWEAR, EYEWEAR
  const requiredTraits = [
    {
      id: "trait-wl-bg",
      slug: "trait-wl-bg",
      name: "Load Test Matrix BG",
      category: "BG" as const,
      rarity: "COMMON" as const,
    },
    {
      id: "trait-wl-fur",
      slug: "trait-wl-fur",
      name: "Load Test Golden Fur",
      category: "FUR" as const,
      rarity: "RARE" as const,
    },
    {
      id: "trait-wl-clothing",
      slug: "trait-wl-clothing",
      name: "Load Test Cyber Hoodie",
      category: "CLOTHING" as const,
      rarity: "EPIC" as const,
    },
    {
      id: "trait-wl-headwear",
      slug: "trait-wl-headwear",
      name: "Load Test Neon Visor",
      category: "HEADWEAR" as const,
      rarity: "RARE" as const,
    },
    {
      id: "trait-wl-eyewear",
      slug: "trait-wl-eyewear",
      name: "Load Test Pixel Shades",
      category: "EYEWEAR" as const,
      rarity: "COMMON" as const,
    },
  ];

  for (const t of requiredTraits) {
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

  // 3. Upsert or reset test WLProgram
  const program = await prisma.wLProgram.upsert({
    where: { id: programId },
    update: {
      status: "OPEN",
      totalSlots: opts.slots,
      allocatedSlotsCount: 0,
      startsAt,
      endsAt,
    },
    create: {
      id: programId,
      slug: "program-load-test",
      name: "Load Test Whitelist Program",
      description: "Dedicated isolated program for HTTP load testing whitelist qualification",
      totalSlots: opts.slots,
      allocatedSlotsCount: 0,
      status: "OPEN",
      startsAt,
      endsAt,
    },
  });

  if (opts.resetOnly) {
    console.log("Reset complete. WLProgram allocatedSlotsCount reset to 0.");
    return { programId, totalSlots: opts.slots, sessionCount: 0 };
  }

  // 4. Seed test users and sessions
  const sessions: Array<{ userId: string; address: string; cookie: string }> = [];

  console.log(`Generating ${opts.users} fully-qualified test users and sessions...`);

  for (let i = 1; i <= opts.users; i++) {
    const padded = String(i).padStart(3, "0");
    const address = `0x7777${i.toString(16).padStart(36, "0")}`.toLowerCase();
    const userId = `usr-wl-load-${padded}`;
    const xId = `x-wl-load-${padded}`;
    const xUsername = `chimp_load_${padded}`;

    // Upsert User
    const user = await prisma.user.upsert({
      where: { id: userId },
      update: { isBanned: false },
      create: {
        id: userId,
        role: "USER",
        isBanned: false,
      },
    });

    // Upsert WalletIdentity
    await prisma.walletIdentity.upsert({
      where: { userId: user.id },
      update: { address },
      create: {
        userId: user.id,
        address,
      },
    });

    // Upsert XIdentity
    await prisma.xIdentity.upsert({
      where: { userId: user.id },
      update: { xId, username: xUsername },
      create: {
        userId: user.id,
        xId,
        username: xUsername,
      },
    });

    // Ensure user has all 5 trait items in InventoryItem
    for (const t of requiredTraits) {
      const invItemId = `inv-${userId}-${t.category.toLowerCase()}`;
      await prisma.inventoryItem.upsert({
        where: { id: invItemId },
        update: { ownerId: user.id },
        create: {
          id: invItemId,
          ownerId: user.id,
          traitId: t.id,
          edition: i,
          acquiredVia: "ADMIN_AIRDROP",
        },
      });
    }

    // Clean any prior auth sessions for this user
    await prisma.authSession.deleteMany({
      where: { userId: user.id },
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

    // Seal iron-session cookie
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

  const outputPath = path.join(process.cwd(), "tests/load/whitelist-test-sessions.json");
  fs.writeFileSync(outputPath, JSON.stringify(sessions, null, 2), "utf8");

  console.log(`\nSuccessfully saved ${sessions.length} sessions to ${outputPath}`);
  console.log("Seeding complete!\n");

  return {
    programId: program.id,
    totalSlots: program.totalSlots,
    sessionCount: sessions.length,
  };
}

if (process.argv[1] && process.argv[1].endsWith("seed-whitelist-test-data.ts")) {
  const cliArgs = parseArgs();
  seedWhitelistTestData(cliArgs)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seeding failed:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
