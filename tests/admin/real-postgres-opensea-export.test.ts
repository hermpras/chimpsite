import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { exportOpenSeaAllowlist } from "@/server/admin/opensea-export";

describe("PostgreSQL Real Database Verification — OpenSea CSV Export Hardening (Tasks 4.2 & 4.3)", () => {
  let pool: Pool;
  let prisma: PrismaClient;
  let isDbAvailable = false;

  const runId = Date.now();
  const testSuffix = `rpe_${runId}`;
  const programId = `prog_${testSuffix}`;

  const userGtdFlaggedId = `u_gtd_flag_${testSuffix}`;
  const userGtdValidId = `u_gtd_val_${testSuffix}`;
  const userGtdRevokedManualId = `u_gtd_revman_${testSuffix}`;
  const userGtdRevokedSystemId = `u_gtd_revsys_${testSuffix}`;
  const userGtdBannedId = `u_gtd_ban_${testSuffix}`;
  const userFcfsQualifiedId = `u_fcfs_qual_${testSuffix}`;
  const userFcfsUnderId = `u_fcfs_under_${testSuffix}`;
  const userFcfsBannedId = `u_fcfs_ban_${testSuffix}`;

  const addrGtdFlagged = `0x111111111111111111111111111111111111${runId.toString().slice(-4)}`;
  const addrGtdValid = `0x222222222222222222222222222222222222${runId.toString().slice(-4)}`;
  const addrGtdRevokedManual = `0x333333333333333333333333333333333333${runId.toString().slice(-4)}`;
  const addrGtdRevokedSystem = `0x333333333333333333333333333333333334${runId.toString().slice(-4)}`;
  const addrGtdBanned = `0x444444444444444444444444444444444444${runId.toString().slice(-4)}`;
  const addrFcfsQualified = `0x555555555555555555555555555555555555${runId.toString().slice(-4)}`;
  const addrFcfsUnder = `0x666666666666666666666666666666666666${runId.toString().slice(-4)}`;
  const addrFcfsBanned = `0x777777777777777777777777777777777777${runId.toString().slice(-4)}`;

  const createdTraitIds: string[] = [];
  const createdUserIds: string[] = [
    userGtdFlaggedId,
    userGtdValidId,
    userGtdRevokedManualId,
    userGtdRevokedSystemId,
    userGtdBannedId,
    userFcfsQualifiedId,
    userFcfsUnderId,
    userFcfsBannedId,
  ];

  beforeAll(async () => {
    try {
      pool = new Pool({
        host: "/tmp",
        port: 5432,
        database: "chimphood_test",
        user: "hermawanprastiyanto",
        max: 5,
      });

      const adapter = new PrismaPg(pool);
      prisma = new PrismaClient({ adapter });

      await pool.query("SELECT 1");
      isDbAvailable = true;

      // 1. Create 5 Master Traits
      const categories = ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"] as const;
      for (const cat of categories) {
        const trait = await prisma.trait.create({
          data: {
            slug: `trait-${cat.toLowerCase()}-${testSuffix}`,
            name: `Export Test Trait ${cat}`,
            category: cat,
            rarity: "COMMON",
            imageUrl: `https://example.com/trait-${cat}.png`,
          },
        });
        createdTraitIds.push(trait.id);
      }

      // 2. Create Finalized Program (required for export)
      await prisma.wLProgram.create({
        data: {
          id: programId,
          slug: `prog-exp-${testSuffix}`,
          name: `Export Test Program ${testSuffix}`,
          status: "FINALIZED",
          totalSlots: 10,
          allocatedSlotsCount: 2,
          startsAt: new Date(Date.now() - 100000),
          endsAt: new Date(Date.now() - 1000),
        },
      });

      // 3. Create Users
      const userDefs = [
        { id: userGtdFlaggedId, addr: addrGtdFlagged, banned: false },
        { id: userGtdValidId, addr: addrGtdValid, banned: false },
        { id: userGtdRevokedManualId, addr: addrGtdRevokedManual, banned: false },
        { id: userGtdRevokedSystemId, addr: addrGtdRevokedSystem, banned: false },
        { id: userGtdBannedId, addr: addrGtdBanned, banned: true },
        { id: userFcfsQualifiedId, addr: addrFcfsQualified, banned: false },
        { id: userFcfsUnderId, addr: addrFcfsUnder, banned: false },
        { id: userFcfsBannedId, addr: addrFcfsBanned, banned: true },
      ];

      for (const u of userDefs) {
        await prisma.user.create({
          data: {
            id: u.id,
            isBanned: u.banned,
            wallet: { create: { address: u.addr } },
            xIdentity: { create: { xId: `xid_${u.id}`, username: `user_${u.id}` } },
          },
        });
      }

      // 4. Give userFcfsQualified all 5 trait categories so they qualify for FCFS
      for (const traitId of createdTraitIds) {
        await prisma.inventoryItem.create({
          data: {
            ownerId: userFcfsQualifiedId,
            traitId,
            edition: 1,
          },
        });
      }

      // 5. Also give userGtdFlagged all 5 traits and put them in FCFS queue too
      // This tests disjoint set enforcement: even if userGtdFlagged is WAITING and qualified in FCFS queue,
      // they MUST be excluded from FCFS CSV because they hold an active GTD slot!
      for (const traitId of createdTraitIds) {
        await prisma.inventoryItem.create({
          data: {
            ownerId: userGtdFlaggedId,
            traitId,
            edition: 2,
          },
        });
      }

      // 6. Create GTD Slots
      // Slot 1: ALLOCATED, FLAGGED (Task 4.2: Must be INCLUDED in GTD CSV)
      await prisma.wLSlot.create({
        data: {
          programId,
          userId: userGtdFlaggedId,
          slotNumber: 1,
          status: "ALLOCATED",
          reviewStatus: "FLAGGED",
        },
      });
      // Slot 2: CONFIRMED, VALID (Task 4.2: Must be INCLUDED in GTD CSV)
      await prisma.wLSlot.create({
        data: {
          programId,
          userId: userGtdValidId,
          slotNumber: 2,
          status: "CONFIRMED",
          reviewStatus: "VALID",
        },
      });
      // Slot 3: REVOKED_MANUAL_ADMIN (Task 4.2: Must be EXCLUDED from GTD CSV)
      await prisma.wLSlot.create({
        data: {
          programId,
          userId: userGtdRevokedManualId,
          slotNumber: 3,
          status: "REVOKED_MANUAL_ADMIN",
          reviewStatus: "VALID",
        },
      });
      // Slot 4: REVOKED_SYSTEM (Task 4.2: Must be EXCLUDED from GTD CSV)
      await prisma.wLSlot.create({
        data: {
          programId,
          userId: userGtdRevokedSystemId,
          slotNumber: 4,
          status: "REVOKED_SYSTEM",
          reviewStatus: "VALID",
        },
      });
      // Slot 5: ALLOCATED, but user is banned (Task 4.2: Must be EXCLUDED from GTD CSV)
      await prisma.wLSlot.create({
        data: {
          programId,
          userId: userGtdBannedId,
          slotNumber: 5,
          status: "ALLOCATED",
          reviewStatus: "VALID",
        },
      });

      // 7. Create FCFS Directory Entries
      // Entry 1: userGtdFlagged (holds GTD slot 1) -> must be excluded from FCFS CSV
      await prisma.wLQueueEntry.create({
        data: {
          programId,
          userId: userGtdFlaggedId,
          queueNumber: 1,
          status: "WAITING",
          priorityScore: 100,
        },
      });
      // Entry 2: userFcfsQualified (fully qualified with 5 traits) -> must be INCLUDED in FCFS CSV
      await prisma.wLQueueEntry.create({
        data: {
          programId,
          userId: userFcfsQualifiedId,
          queueNumber: 2,
          status: "WAITING",
          priorityScore: 90,
        },
      });
      // Entry 3: userFcfsUnder (under-qualified, 0 traits) -> must be EXCLUDED from FCFS CSV
      await prisma.wLQueueEntry.create({
        data: {
          programId,
          userId: userFcfsUnderId,
          queueNumber: 3,
          status: "WAITING",
          priorityScore: 80,
        },
      });
      // Entry 4: userFcfsBanned (banned) -> must be EXCLUDED from FCFS CSV
      await prisma.wLQueueEntry.create({
        data: {
          programId,
          userId: userFcfsBannedId,
          queueNumber: 4,
          status: "WAITING",
          priorityScore: 70,
        },
      });
    } catch (err) {
      console.warn("PostgreSQL not accessible for real export test:", err);
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (!isDbAvailable) return;
    try {
      await pool.query(`DELETE FROM "InventoryItem" WHERE "ownerId" = ANY($1::text[])`, [createdUserIds]);
      await pool.query(`DELETE FROM "WLSlot" WHERE "programId" = $1`, [programId]);
      await pool.query(`DELETE FROM "WLQueueEntry" WHERE "programId" = $1`, [programId]);
      await pool.query(`DELETE FROM "WLQualification" WHERE "programId" = $1`, [programId]);
      await pool.query(`DELETE FROM "WLStatusHistory" WHERE "programId" = $1`, [programId]);
      await pool.query(`DELETE FROM "WLProgram" WHERE id = $1`, [programId]);
      await pool.query(`DELETE FROM "WalletIdentity" WHERE "userId" = ANY($1::text[])`, [createdUserIds]);
      await pool.query(`DELETE FROM "XIdentity" WHERE "userId" = ANY($1::text[])`, [createdUserIds]);
      await pool.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [createdUserIds]);
      await pool.query(`DELETE FROM "Trait" WHERE id = ANY($1::text[])`, [createdTraitIds]);
      await pool.end();
    } catch (err) {
      console.error("Cleanup error:", err);
    }
  });

  it("Task 4.2 Verification: GTD CSV includes active ALLOCATED, CONFIRMED, and FLAGGED slots while strictly excluding both REVOKED statuses and banned accounts without duplicates", async () => {
    if (!isDbAvailable) return;

    const result = await exportOpenSeaAllowlist({
      prisma,
      stage: "gtd",
      programIdOrSlug: programId,
    });

    expect(result.filename).toBe("elychimp-gtd-allowlist.csv");
    expect(result.stage).toBe("gtd");
    expect(result.count).toBe(2);

    // 1. ALLOCATED + FLAGGED active slot (userGtdFlagged) MUST be included
    expect(result.csv).toContain(`${addrGtdFlagged.toLowerCase()},1\n`);
    // 2. CONFIRMED + VALID active slot (userGtdValid) MUST be included
    expect(result.csv).toContain(`${addrGtdValid.toLowerCase()},1\n`);

    // 3. Both REVOKED statuses MUST be strictly excluded
    // REVOKED_MANUAL_ADMIN slot (userGtdRevokedManual) MUST be excluded
    expect(result.csv).not.toContain(addrGtdRevokedManual.toLowerCase());
    // REVOKED_SYSTEM slot (userGtdRevokedSystem) MUST be excluded
    expect(result.csv).not.toContain(addrGtdRevokedSystem.toLowerCase());

    // 4. Banned user (userGtdBanned) MUST be excluded
    expect(result.csv).not.toContain(addrGtdBanned.toLowerCase());

    // 5. Deduplication check: zero duplicate wallets in GTD CSV
    const lines = result.csv.trim().split("\n");
    const gtdWallets = lines.map((l) => l.split(",")[0]);
    expect(lines).toHaveLength(2);
    expect(new Set(gtdWallets).size).toBe(gtdWallets.length);

    // 6. CSV format check: no header, lowercase EVM address, limit = 1
    for (const line of lines) {
      expect(line).toMatch(/^0x[a-f0-9]{40},1$/);
    }
  });

  it("Task 4.3 Verification: FCFS CSV includes ONLY fully qualified candidates, excludes under-qualified, banned, and GTD holders, with zero duplicates and strict disjointness", async () => {
    if (!isDbAvailable) return;

    const gtdResult = await exportOpenSeaAllowlist({
      prisma,
      stage: "gtd",
      programIdOrSlug: programId,
    });

    const fcfsResult = await exportOpenSeaAllowlist({
      prisma,
      stage: "fcfs",
      programIdOrSlug: programId,
    });

    expect(fcfsResult.filename).toBe("elychimp-fcfs-allowlist.csv");
    expect(fcfsResult.stage).toBe("fcfs");
    expect(fcfsResult.count).toBe(1);

    // 1. Fully qualified FCFS user (userFcfsQualified) MUST be included
    expect(fcfsResult.csv).toContain(`${addrFcfsQualified.toLowerCase()},1\n`);

    // 2. Under-qualified FCFS user (userFcfsUnder, 0 traits) MUST be excluded
    expect(fcfsResult.csv).not.toContain(addrFcfsUnder.toLowerCase());

    // 3. Active GTD slot holder (userGtdFlagged) MUST be excluded from FCFS despite being WAITING and qualified
    expect(fcfsResult.csv).not.toContain(addrGtdFlagged.toLowerCase());

    // 4. Banned user (userFcfsBanned) MUST be excluded
    expect(fcfsResult.csv).not.toContain(addrFcfsBanned.toLowerCase());

    // 5. Deduplication check: zero duplicate wallets in FCFS CSV
    const fcfsLines = fcfsResult.csv.trim().split("\n");
    const fcfsWallets = fcfsLines.map((l) => l.split(",")[0]);
    expect(fcfsLines).toHaveLength(1);
    expect(new Set(fcfsWallets).size).toBe(fcfsWallets.length);

    // 6. CSV format check: no header, lowercase EVM address, limit = 1
    for (const line of fcfsLines) {
      expect(line).toMatch(/^0x[a-f0-9]{40},1$/);
    }

    // 7. STRICT DISJOINT SET GUARANTEE: Zero overlapping wallets between GTD and FCFS CSVs
    const gtdWallets = gtdResult.csv.trim().split("\n").map((l) => l.split(",")[0]);
    const overlap = fcfsWallets.filter((w) => gtdWallets.includes(w));
    expect(overlap).toHaveLength(0);
  });
});
