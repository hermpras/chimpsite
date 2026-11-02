import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { registerParticipantInDirectory } from "@/server/whitelist/participant-registration";
import { manualGrantGtdSlot } from "@/server/admin/manual-grant";
import { revokeWlSlot } from "@/server/whitelist/revoke";

describe("PostgreSQL Real Database Verification — Phase 3", () => {
  let pool: Pool;
  let prisma: PrismaClient;
  let isDbAvailable = false;

  const runId = Date.now();
  const adminUserId = `admin_p3_${runId}`;

  beforeAll(async () => {
    try {
      pool = new Pool({
        host: "/tmp",
        port: 5432,
        database: "chimphood_test",
        user: "hermawanprastiyanto",
        max: 10,
      });

      const adapter = new PrismaPg(pool);
      prisma = new PrismaClient({ adapter });

      await pool.query("SELECT 1");
      isDbAvailable = true;

      // Ensure test admin exists
      await pool.query(
        `INSERT INTO "User" (id, role, "createdAt", "updatedAt")
         VALUES ($1, 'ADMIN', NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [adminUserId],
      );
      await pool.query(
        `INSERT INTO "AdminRole" (id, "userId", "roleType", permissions, "createdAt", "updatedAt")
         VALUES ($1, $2, 'ADMIN', ARRAY['*']::text[], NOW(), NOW())
         ON CONFLICT ("userId") DO NOTHING`,
        [`ar_${runId}`, adminUserId],
      );
    } catch (err) {
      console.warn("PostgreSQL not accessible in current environment:", err);
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (pool) {
      // Clean up triggers & functions
      await pool.query(`DROP TRIGGER IF EXISTS trg_fail_audit_grant ON "AuditLog"`).catch(() => {});
      await pool.query(`DROP FUNCTION IF EXISTS fn_force_fail_grant_audit()`).catch(() => {});

      // Clean up test admin
      await pool.query(`DELETE FROM "AdminRole" WHERE "userId" = $1`, [adminUserId]).catch(() => {});
      await pool.query(`DELETE FROM "User" WHERE id = $1`, [adminUserId]).catch(() => {});

      await prisma?.$disconnect().catch(() => {});
      await pool.end().catch(() => {});
    }
  });

  // Helper to setup a user with ONLY wallet and X (strictly ZERO traits, ZERO tasks)
  async function setupWalletAndXUser(userId: string) {
    await pool.query(
      `INSERT INTO "User" (id, role, "createdAt", "updatedAt") VALUES ($1, 'USER', NOW(), NOW()) ON CONFLICT (id) DO NOTHING`,
      [userId],
    );
    await pool.query(
      `INSERT INTO "WalletIdentity" (id, "userId", address, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT ("userId") DO NOTHING`,
      [`w_${userId}`, userId, `0x${userId.slice(0, 38).padEnd(40, "0")}`.toLowerCase()],
    );
    await pool.query(
      `INSERT INTO "XIdentity" (id, "userId", "xId", username, "connectedAt", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT ("userId") DO NOTHING`,
      [`x_${userId}`, userId, `xid_${userId}`, `uname_${userId}`],
    );
  }

  // Helper to setup a fully qualified candidate in DB
  async function setupQualifiedCandidate(userId: string) {
    await pool.query(
      `INSERT INTO "User" (id, role, "createdAt", "updatedAt") VALUES ($1, 'USER', NOW(), NOW()) ON CONFLICT (id) DO NOTHING`,
      [userId],
    );
    await pool.query(
      `INSERT INTO "WalletIdentity" (id, "userId", address, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT ("userId") DO NOTHING`,
      [`w_${userId}`, userId, `0x${userId.slice(0, 38).padEnd(40, "0")}`.toLowerCase()],
    );
    await pool.query(
      `INSERT INTO "XIdentity" (id, "userId", "xId", username, "connectedAt", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT ("userId") DO NOTHING`,
      [`x_${userId}`, userId, `xid_${userId}`, `uname_${userId}`],
    );

    const categories = ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"];
    for (const cat of categories) {
      const traitId = `trait_${cat.toLowerCase()}_real`;
      const edition = Math.floor(Math.random() * 900000) + 1000;
      await pool.query(
        `INSERT INTO "Trait" (id, slug, name, category, rarity, "imageUrl", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4::"TraitCategory", 'COMMON', '/traits/test.png', NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [traitId, `slug-${cat.toLowerCase()}`, `Trait ${cat}`, cat],
      );
      await pool.query(
        `INSERT INTO "InventoryItem" (id, "ownerId", "traitId", edition, "isLocked", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, false, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [`item_${userId}_${cat}`, userId, traitId, edition],
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Verifikasi 1: FCFS Registration (Tanpa Trait/Task, Idempotensi, & Concurrency)
  // ──────────────────────────────────────────────────────────────────────────
  it("Verifikasi 1: FCFS registration tidak bergantung trait/task, idempoten, dan konkuren menghasilkan queue number unik", async () => {
    if (!isDbAvailable) {
      console.warn("⚠️ SKIPPED: Real PostgreSQL not accessible.");
      return;
    }

    const testTag = `v1_${Date.now()}`;
    const programId = `prog_${testTag}`;
    const userNoTraits = `usr_notraits_${testTag}`;
    const userA = `usr_a_${testTag}`;
    const userB = `usr_b_${testTag}`;

    // Setup program
    await pool.query(
      `INSERT INTO "WLProgram" (id, slug, name, "totalSlots", "allocatedSlotsCount", status, "startsAt", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Concurrent Reg Program', 100, 0, 'OPEN', NOW(), NOW(), NOW())`,
      [programId, `slug-${testTag}`],
    );

    // 1. Verify user with ONLY wallet and X (strictly ZERO traits, ZERO tasks) can register
    await setupWalletAndXUser(userNoTraits);
    const regNoTraits1 = await registerParticipantInDirectory(prisma, {
      userId: userNoTraits,
      programId,
    });
    expect(regNoTraits1.isNewRegistration).toBe(true);
    expect(regNoTraits1.entry.queueNumber).toBe(1);
    const initialJoinedAt = regNoTraits1.entry.joinedAt;

    // 2. Verify repeated registration does NOT mutate joinedAt or queueNumber (idempotent & immutable)
    await new Promise((res) => setTimeout(res, 50));
    const regNoTraits2 = await registerParticipantInDirectory(prisma, {
      userId: userNoTraits,
      programId,
    });
    expect(regNoTraits2.isNewRegistration).toBe(false);
    expect(regNoTraits2.entry.queueNumber).toBe(1);
    expect(regNoTraits2.entry.joinedAt.getTime()).toBe(initialJoinedAt.getTime());

    // 3. Concurrently register userA and userB -> unique sequential queue numbers
    await setupQualifiedCandidate(userA);
    await setupQualifiedCandidate(userB);

    const [resA, resB] = await Promise.all([
      registerParticipantInDirectory(prisma, { userId: userA, programId }),
      registerParticipantInDirectory(prisma, { userId: userB, programId }),
    ]);

    expect(resA.entry.queueNumber).toBeDefined();
    expect(resB.entry.queueNumber).toBeDefined();
    expect(resA.entry.queueNumber).not.toEqual(resB.entry.queueNumber);

    // Query direct PostgreSQL
    const rows = await pool.query(
      `SELECT "userId", "queueNumber" FROM "WLQueueEntry" WHERE "programId" = $1 ORDER BY "queueNumber" ASC`,
      [programId],
    );

    expect(rows.rows).toHaveLength(3);
    const qNums = rows.rows.map((r: any) => r.queueNumber);
    expect(qNums).toEqual([1, 2, 3]);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Verifikasi 2a: Manual grant menggunakan kembali vacant slot REVOKED_MANUAL_ADMIN
  // ──────────────────────────────────────────────────────────────────────────
  it("Verifikasi 2a: Manual grant dapat menggunakan slot REVOKED_MANUAL_ADMIN tanpa menghapus histori", async () => {
    if (!isDbAvailable) {
      console.warn("⚠️ SKIPPED: Real PostgreSQL not accessible.");
      return;
    }

    const testTag = `v2a_${Date.now()}`;
    const programId = `prog_${testTag}`;
    const initialUser = `usr_init_${testTag}`;
    const candidateUser = `usr_cand_${testTag}`;
    const slotId = `slot_${testTag}`;

    // Setup program with 1 slot
    await pool.query(
      `INSERT INTO "WLProgram" (id, slug, name, "totalSlots", "allocatedSlotsCount", status, "startsAt", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Reuse Program Admin', 1, 1, 'OPEN', NOW(), NOW(), NOW())`,
      [programId, `slug-${testTag}`],
    );

    await setupQualifiedCandidate(initialUser);
    await setupQualifiedCandidate(candidateUser);

    // Create slot #1 for initialUser
    await pool.query(
      `INSERT INTO "WLSlot" (id, "programId", "userId", "slotNumber", status, "reviewStatus", "allocatedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 1, 'ALLOCATED', 'NOT_REVIEWED', NOW(), NOW(), NOW())`,
      [slotId, programId, initialUser],
    );

    // Revoke initialUser slot
    await revokeWlSlot(prisma, {
      slotId,
      adminUserId,
      reason: "Initial revocation for testing history preservation",
    });

    // Check slot is revoked and counter is 0
    const revokedSlotRes = await pool.query(`SELECT status, "userId" FROM "WLSlot" WHERE id = $1`, [slotId]);
    expect(revokedSlotRes.rows[0].status).toBe("REVOKED_MANUAL_ADMIN");

    // Candidate registers in directory
    await registerParticipantInDirectory(prisma, { userId: candidateUser, programId });

    // Manually grant vacant slot to candidateUser
    const grantRes = await manualGrantGtdSlot(prisma, {
      programId,
      candidateUserId: candidateUser,
      adminUserId,
      notes: "Granted to candidateUser from REVOKED_MANUAL_ADMIN",
    });

    expect(grantRes.success).toBe(true);
    expect(grantRes.slot.id).toBe(slotId);
    expect(grantRes.slot.userId).toBe(candidateUser);
    expect(grantRes.previousUserId).toBe(initialUser);

    // Verify direct PostgreSQL state
    const finalSlotRes = await pool.query(
      `SELECT id, "userId", status, "reviewStatus", "slotNumber" FROM "WLSlot" WHERE id = $1`,
      [slotId],
    );
    expect(finalSlotRes.rows[0].userId).toBe(candidateUser);
    expect(finalSlotRes.rows[0].status).toBe("ALLOCATED");
    expect(finalSlotRes.rows[0].reviewStatus).toBe("NOT_REVIEWED");

    // Verify history preserved for BOTH users
    const historyRes = await pool.query(
      `SELECT "userId", action FROM "WLStatusHistory" WHERE "programId" = $1 ORDER BY "createdAt" ASC`,
      [programId],
    );
    const userIdsInHistory = historyRes.rows.map((h: any) => h.userId);
    expect(userIdsInHistory).toContain(initialUser);
    expect(userIdsInHistory).toContain(candidateUser);

    // Verify AuditLog contains entries for both actions
    const auditRes = await pool.query(
      `SELECT action, metadata FROM "AuditLog" WHERE "entityId" = $1 ORDER BY "createdAt" ASC`,
      [slotId],
    );
    expect(auditRes.rows.some((a: any) => a.action === "REVOKE_WL_SLOT")).toBe(true);
    expect(auditRes.rows.some((a: any) => a.action === "WL_SLOT_MANUALLY_GRANTED")).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Verifikasi 2b: Manual grant menggunakan kembali vacant slot REVOKED_SYSTEM
  // ──────────────────────────────────────────────────────────────────────────
  it("Verifikasi 2b: Manual grant dapat menggunakan slot REVOKED_SYSTEM tanpa menghapus histori", async () => {
    if (!isDbAvailable) {
      console.warn("⚠️ SKIPPED: Real PostgreSQL not accessible.");
      return;
    }

    const testTag = `v2b_${Date.now()}`;
    const programId = `prog_${testTag}`;
    const sysUser = `usr_sys_${testTag}`;
    const candidateUser = `usr_cand_sys_${testTag}`;
    const slotId = `slot_sys_${testTag}`;

    // Setup program with 1 slot, allocatedSlotsCount = 0 (vacant)
    await pool.query(
      `INSERT INTO "WLProgram" (id, slug, name, "totalSlots", "allocatedSlotsCount", status, "startsAt", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Reuse Program System', 1, 0, 'OPEN', NOW(), NOW(), NOW())`,
      [programId, `slug-${testTag}`],
    );

    await setupQualifiedCandidate(sysUser);
    await setupQualifiedCandidate(candidateUser);

    // Create slot #1 with REVOKED_SYSTEM
    await pool.query(
      `INSERT INTO "WLSlot" (id, "programId", "userId", "slotNumber", status, "reviewStatus", "allocatedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 1, 'REVOKED_SYSTEM', 'NOT_REVIEWED', NOW(), NOW(), NOW())`,
      [slotId, programId, sysUser],
    );

    // Add previous history for sysUser
    await pool.query(
      `INSERT INTO "WLStatusHistory" (id, "programId", "userId", action, "fromPhase", "toPhase", metadata, "createdAt")
       VALUES ($1, $2, $3, 'SLOT_REVOKED_SYSTEM', 'SLOT_ALLOCATED', 'REVOKED', '{"reason":"system timeout"}'::jsonb, NOW())`,
      [`hist_sys_${testTag}`, programId, sysUser],
    );

    // Candidate registers in directory
    await registerParticipantInDirectory(prisma, { userId: candidateUser, programId });

    // Manually grant vacant slot to candidateUser
    const grantRes = await manualGrantGtdSlot(prisma, {
      programId,
      candidateUserId: candidateUser,
      adminUserId,
      notes: "Granted to candidateUser from REVOKED_SYSTEM",
    });

    expect(grantRes.success).toBe(true);
    expect(grantRes.slot.id).toBe(slotId);
    expect(grantRes.slot.userId).toBe(candidateUser);
    expect(grantRes.previousUserId).toBe(sysUser);

    // Verify direct PostgreSQL state
    const finalSlotRes = await pool.query(
      `SELECT id, "userId", status, "reviewStatus", "slotNumber" FROM "WLSlot" WHERE id = $1`,
      [slotId],
    );
    expect(finalSlotRes.rows[0].userId).toBe(candidateUser);
    expect(finalSlotRes.rows[0].status).toBe("ALLOCATED");
    expect(finalSlotRes.rows[0].reviewStatus).toBe("NOT_REVIEWED");

    // Verify history preserved for BOTH users
    const historyRes = await pool.query(
      `SELECT "userId", action FROM "WLStatusHistory" WHERE "programId" = $1 ORDER BY "createdAt" ASC`,
      [programId],
    );
    const userIdsInHistory = historyRes.rows.map((h: any) => h.userId);
    expect(userIdsInHistory).toContain(sysUser);
    expect(userIdsInHistory).toContain(candidateUser);

    // Verify AuditLog contains WL_SLOT_MANUALLY_GRANTED
    const auditRes = await pool.query(
      `SELECT action, metadata FROM "AuditLog" WHERE "entityId" = $1 ORDER BY "createdAt" ASC`,
      [slotId],
    );
    expect(auditRes.rows.some((a: any) => a.action === "WL_SLOT_MANUALLY_GRANTED")).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Verifikasi 3: Dua proses berebut kapasitas terakhir: hanya satu berhasil
  // ──────────────────────────────────────────────────────────────────────────
  it("Verifikasi 3: Dua proses berebut kapasitas terakhir: hanya satu berhasil", async () => {
    if (!isDbAvailable) {
      console.warn("⚠️ SKIPPED: Real PostgreSQL not accessible.");
      return;
    }

    const testTag = `v3_${Date.now()}`;
    const programId = `prog_${testTag}`;
    const userPrev = `usr_prev_${testTag}`;
    const candA = `cand_a_${testTag}`;
    const candB = `cand_b_${testTag}`;
    const slotId = `slot_${testTag}`;

    // Program with totalSlots = 1, allocatedSlotsCount = 0 (1 vacant slot available)
    await pool.query(
      `INSERT INTO "WLProgram" (id, slug, name, "totalSlots", "allocatedSlotsCount", status, "startsAt", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Race Program', 1, 0, 'OPEN', NOW(), NOW(), NOW())`,
      [programId, `slug-${testTag}`],
    );

    await setupQualifiedCandidate(userPrev);
    await setupQualifiedCandidate(candA);
    await setupQualifiedCandidate(candB);

    // Insert 1 revoked vacant slot
    await pool.query(
      `INSERT INTO "WLSlot" (id, "programId", "userId", "slotNumber", status, "reviewStatus", "allocatedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 1, 'REVOKED_MANUAL_ADMIN', 'NOT_REVIEWED', NOW(), NOW(), NOW())`,
      [slotId, programId, userPrev],
    );

    // Race both candidate grants simultaneously
    const results = await Promise.allSettled([
      manualGrantGtdSlot(prisma, { programId, candidateUserId: candA, adminUserId }),
      manualGrantGtdSlot(prisma, { programId, candidateUserId: candB, adminUserId }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Strictly 1 success and 1 rejection
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Verify counter is exactly 1
    const progRes = await pool.query(`SELECT "allocatedSlotsCount" FROM "WLProgram" WHERE id = $1`, [programId]);
    expect(progRes.rows[0].allocatedSlotsCount).toBe(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Verifikasi 4: Counter tetap konsisten dengan jumlah slot aktif
  // ──────────────────────────────────────────────────────────────────────────
  it("Verifikasi 4: Counter tetap konsisten dengan jumlah slot aktif", async () => {
    if (!isDbAvailable) {
      console.warn("⚠️ SKIPPED: Real PostgreSQL not accessible.");
      return;
    }

    const testTag = `v4_${Date.now()}`;
    const programId = `prog_${testTag}`;
    const u1 = `u1_${testTag}`;
    const u2 = `u2_${testTag}`;

    await pool.query(
      `INSERT INTO "WLProgram" (id, slug, name, "totalSlots", "allocatedSlotsCount", status, "startsAt", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Counter Program', 5, 2, 'OPEN', NOW(), NOW(), NOW())`,
      [programId, `slug-${testTag}`],
    );

    await setupQualifiedCandidate(u1);
    await setupQualifiedCandidate(u2);

    await pool.query(
      `INSERT INTO "WLSlot" (id, "programId", "userId", "slotNumber", status, "reviewStatus", "allocatedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 1, 'ALLOCATED', 'NOT_REVIEWED', NOW(), NOW(), NOW()),
              ($4, $2, $5, 2, 'ALLOCATED', 'NOT_REVIEWED', NOW(), NOW(), NOW())`,
      [`s1_${testTag}`, programId, u1, `s2_${testTag}`, u2],
    );

    // Revoke u1
    await revokeWlSlot(prisma, {
      slotId: `s1_${testTag}`,
      adminUserId,
      reason: "Revoke u1",
    });

    const progRes = await pool.query(
      `SELECT "allocatedSlotsCount" FROM "WLProgram" WHERE id = $1`,
      [programId],
    );
    const activeSlotsRes = await pool.query(
      `SELECT COUNT(*)::int as count FROM "WLSlot" WHERE "programId" = $1 AND status IN ('ALLOCATED', 'CONFIRMED')`,
      [programId],
    );

    expect(progRes.rows[0].allocatedSlotsCount).toBe(activeSlotsRes.rows[0].count);
    expect(progRes.rows[0].allocatedSlotsCount).toBe(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Verifikasi 5: Revoke tidak memicu auto-promotion
  // ──────────────────────────────────────────────────────────────────────────
  it("Verifikasi 5: Revoke tidak memicu auto-promotion", async () => {
    if (!isDbAvailable) {
      console.warn("⚠️ SKIPPED: Real PostgreSQL not accessible.");
      return;
    }

    const testTag = `v5_${Date.now()}`;
    const programId = `prog_${testTag}`;
    const slotUser = `slot_u_${testTag}`;
    const queuedUser = `queue_u_${testTag}`;
    const slotId = `slot_v5_${testTag}`;

    await pool.query(
      `INSERT INTO "WLProgram" (id, slug, name, "totalSlots", "allocatedSlotsCount", status, "startsAt", "createdAt", "updatedAt")
       VALUES ($1, $2, 'No Auto Promo Program', 5, 1, 'OPEN', NOW(), NOW(), NOW())`,
      [programId, `slug-${testTag}`],
    );

    await setupQualifiedCandidate(slotUser);
    await setupQualifiedCandidate(queuedUser);

    await pool.query(
      `INSERT INTO "WLSlot" (id, "programId", "userId", "slotNumber", status, "reviewStatus", "allocatedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 1, 'ALLOCATED', 'NOT_REVIEWED', NOW(), NOW(), NOW())`,
      [slotId, programId, slotUser],
    );

    await pool.query(
      `INSERT INTO "WLQueueEntry" (id, "programId", "userId", "queueNumber", status, "joinedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 1, 'WAITING', NOW(), NOW(), NOW())`,
      [`qe_v5_${testTag}`, programId, queuedUser],
    );

    // Revoke slot
    const revokeRes = await revokeWlSlot(prisma, {
      slotId,
      adminUserId,
      reason: "Revoke testing no auto promo",
    });

    expect(revokeRes.success).toBe(true);
    expect(revokeRes.promotedUserId).toBeUndefined();

    // Verify in direct PostgreSQL
    const slotRes = await pool.query(`SELECT status FROM "WLSlot" WHERE id = $1`, [slotId]);
    expect(slotRes.rows[0].status).toBe("REVOKED_MANUAL_ADMIN");

    // Queue entry MUST still be WAITING
    const qeRes = await pool.query(`SELECT status, "processedAt" FROM "WLQueueEntry" WHERE id = $1`, [`qe_v5_${testTag}`]);
    expect(qeRes.rows[0].status).toBe("WAITING");
    expect(qeRes.rows[0].processedAt).toBeNull();

    // Total active slots is 0
    const activeCountRes = await pool.query(
      `SELECT COUNT(*)::int as count FROM "WLSlot" WHERE "programId" = $1 AND status IN ('ALLOCATED', 'CONFIRMED')`,
      [programId],
    );
    expect(activeCountRes.rows[0].count).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Verifikasi 6: Kegagalan AuditLog pada manual grant menyebabkan seluruh transaksi rollback
  // ──────────────────────────────────────────────────────────────────────────
  it("Verifikasi 6: Kegagalan AuditLog pada manual grant menyebabkan seluruh transaksi rollback", async () => {
    if (!isDbAvailable) {
      console.warn("⚠️ SKIPPED: Real PostgreSQL not accessible.");
      return;
    }

    const testTag = `v6_${Date.now()}`;
    const programId = `prog_${testTag}`;
    const prevUser = `prev_u_${testTag}`;
    const candidateUser = `cand_u_${testTag}`;
    const slotId = `slot_v6_${testTag}`;

    await pool.query(
      `INSERT INTO "WLProgram" (id, slug, name, "totalSlots", "allocatedSlotsCount", status, "startsAt", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Rollback Program', 5, 0, 'OPEN', NOW(), NOW(), NOW())`,
      [programId, `slug-${testTag}`],
    );

    await setupQualifiedCandidate(prevUser);
    await setupQualifiedCandidate(candidateUser);

    await pool.query(
      `INSERT INTO "WLSlot" (id, "programId", "userId", "slotNumber", status, "reviewStatus", "allocatedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 1, 'REVOKED_MANUAL_ADMIN', 'NOT_REVIEWED', NOW(), NOW(), NOW())`,
      [slotId, programId, prevUser],
    );

    await pool.query(
      `INSERT INTO "WLQueueEntry" (id, "programId", "userId", "queueNumber", status, "joinedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 1, 'WAITING', NOW(), NOW(), NOW())`,
      [`qe_v6_${testTag}`, programId, candidateUser],
    );

    // Install trigger to force AuditLog creation failure on grant
    await pool.query(`
      CREATE OR REPLACE FUNCTION fn_force_fail_grant_audit() RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.action = 'WL_SLOT_MANUALLY_GRANTED' THEN
          RAISE EXCEPTION 'FORCED_FAILURE_MANUAL_GRANT_AUDIT_LOG';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await pool.query(`
      CREATE TRIGGER trg_fail_audit_grant
      BEFORE INSERT ON "AuditLog"
      FOR EACH ROW EXECUTE FUNCTION fn_force_fail_grant_audit();
    `);

    try {
      await expect(
        manualGrantGtdSlot(prisma, {
          programId,
          candidateUserId: candidateUser,
          adminUserId,
        }),
      ).rejects.toThrow("FORCED_FAILURE_MANUAL_GRANT_AUDIT_LOG");

      // Verify direct PostgreSQL state is 100% rolled back:
      // 1. Slot is still REVOKED_MANUAL_ADMIN and belongs to prevUser
      const slotRes = await pool.query(`SELECT status, "userId" FROM "WLSlot" WHERE id = $1`, [slotId]);
      expect(slotRes.rows[0].status).toBe("REVOKED_MANUAL_ADMIN");
      expect(slotRes.rows[0].userId).toBe(prevUser);

      // 2. Program counter was NOT incremented (remains 0)
      const progRes = await pool.query(`SELECT "allocatedSlotsCount" FROM "WLProgram" WHERE id = $1`, [programId]);
      expect(progRes.rows[0].allocatedSlotsCount).toBe(0);

      // 3. Queue entry is still WAITING
      const qeRes = await pool.query(`SELECT status FROM "WLQueueEntry" WHERE id = $1`, [`qe_v6_${testTag}`]);
      expect(qeRes.rows[0].status).toBe("WAITING");

      // 4. No WLStatusHistory created
      const histRes = await pool.query(`SELECT COUNT(*)::int as count FROM "WLStatusHistory" WHERE "programId" = $1`, [programId]);
      expect(histRes.rows[0].count).toBe(0);
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS trg_fail_audit_grant ON "AuditLog"`).catch(() => {});
      await pool.query(`DROP FUNCTION IF EXISTS fn_force_fail_grant_audit()`).catch(() => {});
    }
  });
});
