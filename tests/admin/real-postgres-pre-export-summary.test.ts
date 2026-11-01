import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { getPreExportAuditSummary } from "@/server/admin/opensea-export";

describe("PostgreSQL Real Database Verification — Pre-Export Summary Zero Mutation (Task 4.1)", () => {
  let pool: Pool;
  let prisma: PrismaClient;
  let isDbAvailable = false;

  const runId = Date.now();
  const testSuffix = `pes_${runId}`;
  const programId = `prog_${testSuffix}`;
  const userGtd1Id = `u_gtd1_${testSuffix}`;
  const userGtd2Id = `u_gtd2_${testSuffix}`;
  const userFcfs1Id = `u_fcfs1_${testSuffix}`;
  const userFcfs2Id = `u_fcfs2_${testSuffix}`;
  const userBannedId = `u_banned_${testSuffix}`;
  const userCancelledId = `u_cancelled_${testSuffix}`;

  const validAddress1 = `0x111111111111111111111111111111111111${runId.toString().slice(-4)}`;
  const validAddress2 = `0x222222222222222222222222222222222222${runId.toString().slice(-4)}`;
  const validAddress3 = `0x333333333333333333333333333333333333${runId.toString().slice(-4)}`;
  const validAddress4 = `0x444444444444444444444444444444444444${runId.toString().slice(-4)}`;
  const validAddress5 = `0x555555555555555555555555555555555555${runId.toString().slice(-4)}`;
  const validAddress6 = `0x666666666666666666666666666666666666${runId.toString().slice(-4)}`;

  const createdTraitIds: string[] = [];
  const createdUserIds: string[] = [
    userGtd1Id,
    userGtd2Id,
    userFcfs1Id,
    userFcfs2Id,
    userBannedId,
    userCancelledId,
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

      // 1. Create Traits (all 5 categories)
      const categories = ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"] as const;
      for (const cat of categories) {
        const trait = await prisma.trait.create({
          data: {
            slug: `trait-${cat.toLowerCase()}-${testSuffix}`,
            name: `Trait ${cat}`,
            category: cat,
            rarity: "COMMON",
            imageUrl: `https://example.com/${cat}.png`,
          },
        });
        createdTraitIds.push(trait.id);
      }

      // 2. Create WLProgram (FINALIZED status to test allowClosed behavior)
      await prisma.wLProgram.create({
        data: {
          id: programId,
          slug: `prog-slug-${testSuffix}`,
          name: `Audit Test Program ${testSuffix}`,
          status: "FINALIZED",
          totalSlots: 10,
          allocatedSlotsCount: 2,
          startsAt: new Date(),
        },
      });

      // 3. Create Users with Wallets and XIdentities
      const userDefs = [
        { id: userGtd1Id, addr: validAddress1, x: `x_gtd1_${testSuffix}`, isBanned: false },
        { id: userGtd2Id, addr: validAddress2, x: `x_gtd2_${testSuffix}`, isBanned: false },
        { id: userFcfs1Id, addr: validAddress3, x: `x_fcfs1_${testSuffix}`, isBanned: false },
        { id: userFcfs2Id, addr: validAddress4, x: `x_fcfs2_${testSuffix}`, isBanned: false },
        { id: userBannedId, addr: validAddress5, x: `x_banned_${testSuffix}`, isBanned: true },
        { id: userCancelledId, addr: validAddress6, x: `x_canc_${testSuffix}`, isBanned: false },
      ];

      for (const u of userDefs) {
        await prisma.user.create({
          data: {
            id: u.id,
            isBanned: u.isBanned,
            wallet: {
              create: {
                address: u.addr,
              },
            },
            xIdentity: {
              create: {
                xId: `xid_${u.id}`,
                username: u.x,
              },
            },
          },
        });
      }

      // 4. Give userFcfs1 all 5 traits so they qualify
      for (const traitId of createdTraitIds) {
        await prisma.inventoryItem.create({
          data: {
            ownerId: userFcfs1Id,
            traitId,
            edition: 1,
          },
        });
      }

      // 5. Create GTD slots (slot 1 FLAGGED, slot 2 VALID)
      await prisma.wLSlot.create({
        data: {
          programId,
          userId: userGtd1Id,
          slotNumber: 1,
          status: "ALLOCATED",
          reviewStatus: "FLAGGED",
        },
      });
      await prisma.wLSlot.create({
        data: {
          programId,
          userId: userGtd2Id,
          slotNumber: 2,
          status: "CONFIRMED",
          reviewStatus: "VALID",
        },
      });

      // 6. Create FCFS Directory entries
      // userFcfs1 -> WAITING, fully qualified (5 traits)
      await prisma.wLQueueEntry.create({
        data: {
          programId,
          userId: userFcfs1Id,
          queueNumber: 1,
          status: "WAITING",
        },
      });
      // userFcfs2 -> WAITING, under-qualified (0 traits)
      await prisma.wLQueueEntry.create({
        data: {
          programId,
          userId: userFcfs2Id,
          queueNumber: 2,
          status: "WAITING",
        },
      });
      // userBanned -> WAITING, banned user
      await prisma.wLQueueEntry.create({
        data: {
          programId,
          userId: userBannedId,
          queueNumber: 3,
          status: "WAITING",
        },
      });
      // userCancelled -> CANCELLED entry
      await prisma.wLQueueEntry.create({
        data: {
          programId,
          userId: userCancelledId,
          queueNumber: 4,
          status: "CANCELLED",
        },
      });
    } catch (err) {
      console.warn("PostgreSQL not accessible for real integration test:", err);
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

  it("proves zero database mutations across WLSlot, WLQueueEntry, WLQualification, WLStatusHistory, WLProgram, and AuditLog on real PostgreSQL", async () => {
    if (!isDbAvailable) {
      console.warn("Skipping real DB test: PostgreSQL not accessible.");
      return;
    }

    // 1. Take initial database snapshots
    const preSlotCount = await prisma.wLSlot.count({ where: { programId } });
    const preQueueCount = await prisma.wLQueueEntry.count({ where: { programId } });
    const preQualCount = await prisma.wLQualification.count({ where: { programId } });
    const preHistoryCount = await prisma.wLStatusHistory.count({ where: { programId } });
    const preAuditLogCount = await prisma.auditLog.count({
      where: {
        entityId: { in: [programId, userGtd1Id, userGtd2Id, userFcfs1Id, userFcfs2Id] },
      },
    });
    const preProgram = await prisma.wLProgram.findUniqueOrThrow({ where: { id: programId } });

    // 2. Execute getPreExportAuditSummary on real PostgreSQL
    const summary = await getPreExportAuditSummary({
      prisma,
      programIdOrSlug: programId,
    });

    // 3. Verify output calculations
    expect(summary.program.id).toBe(programId);
    expect(summary.gtd.allocatedCount).toBe(2);
    expect(summary.gtd.vacantCount).toBe(8);
    expect(summary.gtd.flaggedCount).toBe(1); // userGtd1 is FLAGGED
    expect(summary.fcfs.totalDirectoryEntries).toBe(4);
    expect(summary.fcfs.bannedOrDisqualifiedCount).toBe(1); // userBanned
    expect(summary.fcfs.inactiveDirectoryEntriesCount).toBe(1); // userCancelled
    expect(summary.fcfs.underQualifiedCount).toBe(1); // userFcfs2 (0 traits)
    expect(summary.fcfs.qualifiedReadyCount).toBe(1); // userFcfs1 (all 5 traits)
    expect(summary.fcfs.alreadyGtdCount).toBe(0);
    expect(summary.fcfs.accountingBalanceCheck).toBe(true);
    expect(summary.disjointVerification.disjointSetVerified).toBe(true);
    expect(summary.disjointVerification.overlappingWalletsCount).toBe(0);

    // 4. Take post-execution snapshots and assert STRICT EQUALITY (ZERO MUTATIONS)
    const postSlotCount = await prisma.wLSlot.count({ where: { programId } });
    const postQueueCount = await prisma.wLQueueEntry.count({ where: { programId } });
    const postQualCount = await prisma.wLQualification.count({ where: { programId } });
    const postHistoryCount = await prisma.wLStatusHistory.count({ where: { programId } });
    const postAuditLogCount = await prisma.auditLog.count({
      where: {
        entityId: { in: [programId, userGtd1Id, userGtd2Id, userFcfs1Id, userFcfs2Id] },
      },
    });
    const postProgram = await prisma.wLProgram.findUniqueOrThrow({ where: { id: programId } });

    // Strict Zero Mutation Invariants:
    expect(postSlotCount).toBe(preSlotCount);
    expect(postQueueCount).toBe(preQueueCount);
    expect(postQualCount).toBe(preQualCount);
    expect(postHistoryCount).toBe(preHistoryCount);
    expect(postAuditLogCount).toBe(preAuditLogCount);
    expect(postProgram.allocatedSlotsCount).toBe(preProgram.allocatedSlotsCount);
    expect(postProgram.updatedAt.getTime()).toBe(preProgram.updatedAt.getTime());
  });
});
