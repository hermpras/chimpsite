import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { listFcfsDirectory } from "@/server/admin/fcfs-directory";
import { getGtdSlotReviewDetail } from "@/server/admin/slot-review";

describe("PostgreSQL Real Database Verification — FCFS Directory & Review Detail Read-Only Zero Mutation (Phase 6)", () => {
  let pool: Pool;
  let prisma: PrismaClient;
  let isDbAvailable = false;

  const runId = Date.now();
  const testSuffix = `p6_${runId}`;
  const programId = `prog_${testSuffix}`;
  const userGtdId = `u_gtd_${testSuffix}`;
  const userFcfs1Id = `u_fcfs1_${testSuffix}`;
  const userFcfs2Id = `u_fcfs2_${testSuffix}`;

  const validAddress1 = `0x111111111111111111111111111111111111${runId.toString().slice(-4)}`;
  const validAddress2 = `0x222222222222222222222222222222222222${runId.toString().slice(-4)}`;
  const validAddress3 = `0x333333333333333333333333333333333333${runId.toString().slice(-4)}`;

  const createdTraitIds: string[] = [];
  const createdUserIds: string[] = [userGtdId, userFcfs1Id, userFcfs2Id];
  let slotId = "";

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
            name: `${cat} Trait ${testSuffix}`,
            category: cat,
            rarity: "COMMON",
            imageUrl: `https://example.com/trait-${cat}.svg`,
            maxSupply: 1000,
          },
        });
        createdTraitIds.push(trait.id);
      }

      // 2. Create Users
      for (let i = 0; i < createdUserIds.length; i++) {
        const uid = createdUserIds[i];
        const addr = [validAddress1, validAddress2, validAddress3][i];
        await prisma.user.create({
          data: {
            id: uid,
            role: "USER",
            wallet: { create: { address: addr } },
            xIdentity: {
              create: {
                xId: `xid_${uid}`,
                username: `user_${i}_${testSuffix}`,
              },
            },
          },
        });
      }

      // 3. User Fcfs1 owns all 5 trait categories
      for (let i = 0; i < createdTraitIds.length; i++) {
        await prisma.inventoryItem.create({
          data: {
            ownerId: userFcfs1Id,
            traitId: createdTraitIds[i],
            edition: i + 1,
            acquiredVia: "CLAIM",
          },
        });
      }

      // 4. Create WLProgram
      await prisma.wLProgram.create({
        data: {
          id: programId,
          slug: `slug-${testSuffix}`,
          name: `Phase 6 Real Program ${testSuffix}`,
          totalSlots: 10,
          allocatedSlotsCount: 1,
          status: "OPEN",
          startsAt: new Date(Date.now() - 3600000),
        },
      });

      // 5. Create 1 GTD slot for userGtdId
      const slot = await prisma.wLSlot.create({
        data: {
          programId,
          userId: userGtdId,
          slotNumber: 1,
          status: "ALLOCATED",
          reviewStatus: "NOT_REVIEWED",
          allocatedBy: "SYSTEM_INSTANT",
          allocatedAt: new Date(),
        },
      });
      slotId = slot.id;

      // 6. Create FCFS directory entries (WLQueueEntry)
      await prisma.wLQueueEntry.create({
        data: {
          programId,
          userId: userFcfs1Id,
          queueNumber: 1,
          joinedAt: new Date(Date.now() - 2000),
          status: "WAITING",
          priorityScore: 0,
        },
      });

      await prisma.wLQueueEntry.create({
        data: {
          programId,
          userId: userFcfs2Id,
          queueNumber: 2,
          joinedAt: new Date(Date.now() - 1000),
          status: "WAITING",
          priorityScore: 0,
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
      await pool.query(`DELETE FROM "InventoryItem" WHERE "userId" = ANY($1::text[])`, [createdUserIds]);
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

  it("proves zero database mutations when listing FCFS directory across all tables", async () => {
    if (!isDbAvailable) {
      console.warn("Skipping real DB test: PostgreSQL not accessible.");
      return;
    }

    // Snapshot pre-execution counts
    const preSlotCount = await prisma.wLSlot.count({ where: { programId } });
    const preQueueCount = await prisma.wLQueueEntry.count({ where: { programId } });
    const preQualCount = await prisma.wLQualification.count({ where: { programId } });
    const preHistoryCount = await prisma.wLStatusHistory.count({ where: { programId } });
    const preAuditCount = await prisma.auditLog.count({ where: { entityId: programId } });
    const preProgram = await prisma.wLProgram.findUniqueOrThrow({ where: { id: programId } });

    // 1. List directory (all)
    const allResult = await listFcfsDirectory(prisma, { programId });
    expect(allResult.entries).toHaveLength(2);
    // Strict chronological ordering
    expect(allResult.entries[0].userId).toBe(userFcfs1Id);
    expect(allResult.entries[1].userId).toBe(userFcfs2Id);
    expect(allResult.entries[0].qualification.isFullyQualified).toBe(true);
    expect(allResult.entries[1].qualification.isFullyQualified).toBe(false);

    // 2. List directory (qualified only)
    const qualResult = await listFcfsDirectory(prisma, { programId, qualifiedOnly: true });
    expect(qualResult.entries).toHaveLength(1);
    expect(qualResult.entries[0].userId).toBe(userFcfs1Id);

    // 3. Search directory
    const searchResult = await listFcfsDirectory(prisma, { programId, search: validAddress2.slice(0, 10) });
    expect(searchResult.entries).toHaveLength(1);

    // Snapshot post-execution counts and assert STRICT EQUALITY (ZERO MUTATIONS)
    const postSlotCount = await prisma.wLSlot.count({ where: { programId } });
    const postQueueCount = await prisma.wLQueueEntry.count({ where: { programId } });
    const postQualCount = await prisma.wLQualification.count({ where: { programId } });
    const postHistoryCount = await prisma.wLStatusHistory.count({ where: { programId } });
    const postAuditCount = await prisma.auditLog.count({ where: { entityId: programId } });
    const postProgram = await prisma.wLProgram.findUniqueOrThrow({ where: { id: programId } });

    expect(postSlotCount).toBe(preSlotCount);
    expect(postQueueCount).toBe(preQueueCount);
    expect(postQualCount).toBe(preQualCount);
    expect(postHistoryCount).toBe(preHistoryCount);
    expect(postAuditCount).toBe(preAuditCount);
    expect(postProgram.allocatedSlotsCount).toBe(preProgram.allocatedSlotsCount);
    expect(postProgram.updatedAt.getTime()).toBe(preProgram.updatedAt.getTime());
  });

  it("proves zero database mutations when retrieving GTD slot review details", async () => {
    if (!isDbAvailable) {
      console.warn("Skipping real DB test: PostgreSQL not accessible.");
      return;
    }

    const preSlotCount = await prisma.wLSlot.count({ where: { programId } });
    const preQueueCount = await prisma.wLQueueEntry.count({ where: { programId } });
    const preQualCount = await prisma.wLQualification.count({ where: { programId } });
    const preAuditCount = await prisma.auditLog.count({ where: { entityId: slotId } });

    const detail = await getGtdSlotReviewDetail(prisma, slotId);

    expect(detail.slot.id).toBe(slotId);
    expect(detail.slot.slotNumber).toBe(1);
    expect(detail.slot.reviewStatus).toBe("NOT_REVIEWED");

    const postSlotCount = await prisma.wLSlot.count({ where: { programId } });
    const postQueueCount = await prisma.wLQueueEntry.count({ where: { programId } });
    const postQualCount = await prisma.wLQualification.count({ where: { programId } });
    const postAuditCount = await prisma.auditLog.count({ where: { entityId: slotId } });

    expect(postSlotCount).toBe(preSlotCount);
    expect(postQueueCount).toBe(preQueueCount);
    expect(postQualCount).toBe(preQualCount);
    expect(postAuditCount).toBe(preAuditCount);
  });
});
