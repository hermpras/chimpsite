import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { evaluateUserQualification } from "@/server/whitelist/qualification";

const REAL_DB_URL =
  process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("pooler.supabase.com")
    ? process.env.DATABASE_URL
    : "postgresql://hermawanprastiyanto@localhost:5432/chimphood_test";

describe("PostgreSQL Real Concurrency & Shared Capacity Guard", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let isDbAvailable = false;

  const testSuffix = `t1_${Date.now()}`;
  const programId = `prog_${testSuffix}`;
  const user1Id = `u1_${testSuffix}`;
  const user2Id = `u2_${testSuffix}`;
  const user3Id = `u3_${testSuffix}`;

  const createdTraitIds: string[] = [];
  const createdUserIds: string[] = [user1Id, user2Id, user3Id];

  beforeAll(async () => {
    try {
      pool = new Pool({
        connectionString: REAL_DB_URL,
        max: 5,
      });
      const adapter = new PrismaPg(pool);
      prisma = new PrismaClient({ adapter });

      // Quick connectivity check
      await prisma.$queryRaw`SELECT 1`;
      isDbAvailable = true;
    } catch (err) {
      console.warn("Real PostgreSQL database is not accessible:", err);
      isDbAvailable = false;
      return;
    }

    // 1. Create 5 Master Traits (1 per required category)
    const categories = ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"] as const;
    for (const cat of categories) {
      const trait = await prisma.trait.create({
        data: {
          slug: `trait-${cat.toLowerCase()}-${testSuffix}`,
          name: `Test ${cat} Trait`,
          category: cat,
          rarity: "COMMON",
          imageUrl: `https://example.com/trait-${cat.toLowerCase()}.png`,
        },
      });
      createdTraitIds.push(trait.id);
    }

    // 2. Create WL Program with totalSlots = 2, allocatedSlotsCount = 1 (1 slot remaining)
    await prisma.wLProgram.create({
      data: {
        id: programId,
        slug: `prog-slug-${testSuffix}`,
        name: `Concurrency Test Program ${testSuffix}`,
        totalSlots: 2,
        allocatedSlotsCount: 1,
        status: "OPEN",
        startsAt: new Date(Date.now() - 3600000),
      },
    });

    // 3. Helper to setup a fully qualified user
    const setupUser = async (id: string, walletAddr: string, xId: string, xHandle: string, editionNumber: number) => {
      await prisma.user.create({
        data: {
          id,
          wallet: {
            create: {
              address: walletAddr.toLowerCase(),
              chainId: 1,
            },
          },
          xIdentity: {
            create: {
              xId,
              username: xHandle,
            },
          },
        },
      });

      // Give 5 traits
      for (const traitId of createdTraitIds) {
        await prisma.inventoryItem.create({
          data: {
            ownerId: id,
            traitId,
            edition: editionNumber,
          },
        });
      }
    };

    // User 1 holds slot 1
    await setupUser(user1Id, `0x1111111111111111111111111111111111111111`, `x_1_${testSuffix}`, `user1_${testSuffix}`, 1);
    await prisma.wLSlot.create({
      data: {
        programId,
        userId: user1Id,
        slotNumber: 1,
        status: "ALLOCATED",
      },
    });

    // User 2 and User 3 are fully qualified contenders for the remaining 1 slot
    await setupUser(user2Id, `0x2222222222222222222222222222222222222222`, `x_2_${testSuffix}`, `user2_${testSuffix}`, 2);
    await setupUser(user3Id, `0x3333333333333333333333333333333333333333`, `x_3_${testSuffix}`, `user3_${testSuffix}`, 3);
  });

  afterAll(async () => {
    if (!isDbAvailable || !prisma) return;

    try {
      // Clean up test data
      await prisma.wLStatusHistory.deleteMany({ where: { programId } });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: [programId, user1Id, user2Id, user3Id] } } });
      await prisma.wLSlot.deleteMany({ where: { programId } });
      await prisma.wLQueueEntry.deleteMany({ where: { programId } });
      await prisma.wLQualification.deleteMany({ where: { programId } });
      await prisma.wLProgram.deleteMany({ where: { id: programId } });

      await prisma.inventoryItem.deleteMany({ where: { ownerId: { in: createdUserIds } } });
      await prisma.walletIdentity.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.xIdentity.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.trait.deleteMany({ where: { id: { in: createdTraitIds } } });

      await prisma.$disconnect();
      if (pool) {
        await pool.end();
      }
    } catch (cleanErr) {
      console.error("Cleanup error in real postgres test:", cleanErr);
    }
  });

  it("handles 2 concurrent allocation requests for the final slot without exceeding capacity", async (ctx) => {
    if (!isDbAvailable) {
      console.warn("\n⚠️ NOT VERIFIED: Real PostgreSQL database was not accessible in this execution environment.\n");
      ctx.skip();
      return;
    }

    // Launch 2 concurrent qualification evaluations for the last remaining slot
    const [resultUser2, resultUser3] = await Promise.all([
      evaluateUserQualification(prisma, {
        userId: user2Id,
        programId,
      }),
      evaluateUserQualification(prisma, {
        userId: user3Id,
        programId,
      }),
    ]);

    const results = [resultUser2, resultUser3];
    const allocated = results.filter((r) => r.phase === "SLOT_ALLOCATED");
    const queued = results.filter((r) => r.phase === "IN_QUEUE");

    // Exactly one contender receives the final slot
    expect(allocated).toHaveLength(1);
    expect(allocated[0].slotNumber).toBe(2);

    // The other contender is safely placed in the queue
    expect(queued).toHaveLength(1);
    expect(queued[0].queueNumber).toBe(1);

    // Verify database state: allocatedSlotsCount MUST NOT exceed totalSlots (2)
    const programAfter = await prisma.wLProgram.findUnique({
      where: { id: programId },
    });
    expect(programAfter?.allocatedSlotsCount).toBe(2);

    // Verify active slots in database
    const activeSlots = await prisma.wLSlot.findMany({
      where: {
        programId,
        status: { in: ["ALLOCATED", "CONFIRMED"] },
      },
    });
    expect(activeSlots).toHaveLength(2);

    const activeSlotNumbers = activeSlots.map((s) => s.slotNumber).sort((a, b) => a - b);
    expect(activeSlotNumbers).toEqual([1, 2]);

    // Verify queue entries
    const queueEntries = await prisma.wLQueueEntry.findMany({
      where: { programId },
    });
    expect(queueEntries).toHaveLength(1);
    expect(queueEntries[0].status).toBe("WAITING");
  });
});
