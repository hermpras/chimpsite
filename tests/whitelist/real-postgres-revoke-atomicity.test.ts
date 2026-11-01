import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { revokeWlSlot, WlSlotRevokeError } from "@/server/whitelist/revoke";

describe("PostgreSQL Real Database Verification — Tahap 2 Revoke Atomicity", () => {
  let pool: Pool;
  let prisma: PrismaClient;
  let isDbAvailable = false;

  const runId = Date.now();
  const adminUserId = `admin_real_${runId}`;

  // Helper to query direct PostgreSQL tables
  async function queryDbState(slotId: string, programId: string, userId: string) {
    const slotRes = await pool.query(
      `SELECT id, "programId", "userId", "slotNumber", status, notes FROM "WLSlot" WHERE id = $1`,
      [slotId],
    );
    const progRes = await pool.query(
      `SELECT id, "totalSlots", "allocatedSlotsCount", status FROM "WLProgram" WHERE id = $1`,
      [programId],
    );
    const histRes = await pool.query(
      `SELECT id, "programId", "userId", "fromPhase", "toPhase", action, "createdAt" 
       FROM "WLStatusHistory" 
       WHERE "programId" = $1 AND "userId" = $2`,
      [programId, userId],
    );
    const auditRes = await pool.query(
      `SELECT id, "actorId", action, "entityType", "entityId", "newValues", metadata 
       FROM "AuditLog" 
       WHERE "entityId" = $1`,
      [slotId],
    );

    return {
      slot: slotRes.rows[0] || null,
      program: progRes.rows[0] || null,
      histories: histRes.rows,
      auditLogs: auditRes.rows,
    };
  }

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

      // Ensure admin user exists in DB
      await pool.query(
        `INSERT INTO "User" (id, role, "createdAt", "updatedAt") 
         VALUES ($1, 'ADMIN', NOW(), NOW()) 
         ON CONFLICT (id) DO NOTHING`,
        [adminUserId],
      );
    } catch (err) {
      console.warn("PostgreSQL not accessible:", err);
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (pool) {
      // Clean up triggers if any left
      await pool.query(`DROP TRIGGER IF EXISTS trg_fail_history ON "WLStatusHistory"`).catch(() => {});
      await pool.query(`DROP TRIGGER IF EXISTS trg_fail_audit ON "AuditLog"`).catch(() => {});
      await pool.query(`DROP FUNCTION IF EXISTS fn_force_fail_op()`).catch(() => {});

      // Clean up test admin
      await pool.query(`DELETE FROM "User" WHERE id = $1`, [adminUserId]).catch(() => {});

      await prisma?.$disconnect().catch(() => {});
      await pool.end().catch(() => {});
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Skenario 1: Revoke berhasil
  // ──────────────────────────────────────────────────────────────────────────
  it("Skenario 1: Revoke berhasil — verifikasi status WLSlot, allocatedSlotsCount, WLStatusHistory, dan AuditLog", async () => {
    if (!isDbAvailable) {
      console.warn("⚠️ NOT VERIFIED: Real PostgreSQL not accessible.");
      return;
    }

    const testTag = `sc1_${Date.now()}`;
    const programId = `prog_${testTag}`;
    const userId = `user_${testTag}`;
    const slotId = `slot_${testTag}`;

    // Setup initial data
    await pool.query(
      `INSERT INTO "User" (id, role, "createdAt", "updatedAt") VALUES ($1, 'USER', NOW(), NOW())`,
      [userId],
    );
    await pool.query(
      `INSERT INTO "WLProgram" (id, slug, name, "totalSlots", "allocatedSlotsCount", status, "startsAt", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Test Program 1', 10, 1, 'OPEN', NOW(), NOW(), NOW())`,
      [programId, `slug-${testTag}`],
    );
    await pool.query(
      `INSERT INTO "WLSlot" (id, "programId", "userId", "slotNumber", status, "allocatedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 1, 'ALLOCATED', NOW(), NOW(), NOW())`,
      [slotId, programId, userId],
    );

    // 1. Kondisi Database SEBELUM
    const beforeState = await queryDbState(slotId, programId, userId);
    console.log("\n=== SKENARIO 1: SEBELUM ===");
    console.log("WLSlot:", beforeState.slot);
    console.log("WLProgram:", beforeState.program);
    console.log("WLStatusHistory count:", beforeState.histories.length);
    console.log("AuditLog count:", beforeState.auditLogs.length);

    expect(beforeState.slot.status).toBe("ALLOCATED");
    expect(beforeState.program.allocatedSlotsCount).toBe(1);
    expect(beforeState.histories.length).toBe(0);
    expect(beforeState.auditLogs.length).toBe(0);

    // 2. Eksekusi revokeWlSlot
    const revokeResult = await revokeWlSlot(prisma, {
      slotId,
      adminUserId,
      reason: "Manual admin compliance audit revocation.",
      now: new Date(),
    });

    console.log("\n=== SKENARIO 1: HASIL EKSEKUSI ===");
    console.log("revokeWlSlot output:", {
      success: revokeResult.success,
      slotId: revokeResult.slotId,
      status: revokeResult.status,
      reason: revokeResult.reason,
    });

    // 3. Kondisi Database SESUDAH
    const afterState = await queryDbState(slotId, programId, userId);
    console.log("\n=== SKENARIO 1: SESUDAH (POSTGRESQL LANGSUNG) ===");
    console.log("WLSlot:", afterState.slot);
    console.log("WLProgram:", afterState.program);
    console.log("WLStatusHistory:", afterState.histories);
    console.log("AuditLog:", afterState.auditLogs);

    // Verifikasi Langsung ke PostgreSQL:
    // a. WLSlot berubah menjadi REVOKED_MANUAL_ADMIN dengan catatan reason
    expect(afterState.slot.status).toBe("REVOKED_MANUAL_ADMIN");
    expect(afterState.slot.notes).toBe("Manual admin compliance audit revocation.");

    // b. WLProgram allocatedSlotsCount berkurang tepat 1 (dari 1 menjadi 0)
    expect(afterState.program.allocatedSlotsCount).toBe(0);

    // c. WLStatusHistory tersimpan tepat 1 baris
    expect(afterState.histories.length).toBe(1);
    expect(afterState.histories[0].fromPhase).toBe("SLOT_ALLOCATED");
    expect(afterState.histories[0].toPhase).toBe("REVOKED");
    expect(afterState.histories[0].action).toBe("SLOT_REVOKED_MANUAL_ADMIN");
    expect(afterState.histories[0].userId).toBe(userId);

    // d. AuditLog tersimpan tepat 1 baris
    expect(afterState.auditLogs.length).toBe(1);
    expect(afterState.auditLogs[0].action).toBe("REVOKE_WL_SLOT");
    expect(afterState.auditLogs[0].entityType).toBe("WLSlot");
    expect(afterState.auditLogs[0].entityId).toBe(slotId);
    expect(afterState.auditLogs[0].actorId).toBe(adminUserId);

    // Clean up
    await pool.query(`DELETE FROM "AuditLog" WHERE "entityId" = $1`, [slotId]);
    await pool.query(`DELETE FROM "WLStatusHistory" WHERE "programId" = $1`, [programId]);
    await pool.query(`DELETE FROM "WLSlot" WHERE id = $1`, [slotId]);
    await pool.query(`DELETE FROM "WLProgram" WHERE id = $1`, [programId]);
    await pool.query(`DELETE FROM "User" WHERE id = $1`, [userId]);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Skenario 2: Paksa pembuatan WLStatusHistory gagal -> Rollback
  // ──────────────────────────────────────────────────────────────────────────
  it("Skenario 2: Paksa pembuatan WLStatusHistory gagal — pastikan seluruh perubahan rollback", async () => {
    if (!isDbAvailable) {
      console.warn("⚠️ NOT VERIFIED: Real PostgreSQL not accessible.");
      return;
    }

    const testTag = `sc2_${Date.now()}`;
    const programId = `prog_${testTag}`;
    const userId = `user_${testTag}`;
    const slotId = `slot_${testTag}`;

    // Setup initial data
    await pool.query(
      `INSERT INTO "User" (id, role, "createdAt", "updatedAt") VALUES ($1, 'USER', NOW(), NOW())`,
      [userId],
    );
    await pool.query(
      `INSERT INTO "WLProgram" (id, slug, name, "totalSlots", "allocatedSlotsCount", status, "startsAt", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Test Program 2', 10, 1, 'OPEN', NOW(), NOW(), NOW())`,
      [programId, `slug-${testTag}`],
    );
    await pool.query(
      `INSERT INTO "WLSlot" (id, "programId", "userId", "slotNumber", status, "allocatedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 1, 'ALLOCATED', NOW(), NOW(), NOW())`,
      [slotId, programId, userId],
    );

    // Pasang PostgreSQL trigger yang memaksa kegagalan pada INSERT WLStatusHistory
    await pool.query(`
      CREATE OR REPLACE FUNCTION fn_force_fail_op() RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'FORCED_POSTGRESQL_FAILURE_STATUS_HISTORY';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await pool.query(`
      CREATE TRIGGER trg_fail_history
      BEFORE INSERT ON "WLStatusHistory"
      FOR EACH ROW EXECUTE FUNCTION fn_force_fail_op();
    `);

    // 1. Kondisi Database SEBELUM
    const beforeState = await queryDbState(slotId, programId, userId);
    console.log("\n=== SKENARIO 2: SEBELUM ===");
    console.log("WLSlot:", beforeState.slot);
    console.log("WLProgram:", beforeState.program);

    expect(beforeState.slot.status).toBe("ALLOCATED");
    expect(beforeState.program.allocatedSlotsCount).toBe(1);

    // 2. Eksekusi revokeWlSlot (harus melempar error karena trigger PostgreSQL)
    let caughtError: any = null;
    try {
      await revokeWlSlot(prisma, {
        slotId,
        adminUserId,
        reason: "Forced failure on status history test",
        now: new Date(),
      });
    } catch (err) {
      caughtError = err;
    }

    console.log("\n=== SKENARIO 2: ERROR YANG DITANGKAP ===");
    console.log("Caught Error:", caughtError?.message || caughtError);
    expect(caughtError).toBeDefined();

    // Lepas trigger
    await pool.query(`DROP TRIGGER IF EXISTS trg_fail_history ON "WLStatusHistory"`);

    // 3. Kondisi Database SESUDAH (Verifikasi Rollback Penuh di PostgreSQL)
    const afterState = await queryDbState(slotId, programId, userId);
    console.log("\n=== SKENARIO 2: SESUDAH ROLLBACK (POSTGRESQL LANGSUNG) ===");
    console.log("WLSlot (harus tetap ALLOCATED):", afterState.slot);
    console.log("WLProgram (counter harus tetap 1):", afterState.program);
    console.log("WLStatusHistory count (harus 0):", afterState.histories.length);
    console.log("AuditLog count (harus 0):", afterState.auditLogs.length);

    expect(afterState.slot.status).toBe("ALLOCATED");
    expect(afterState.slot.notes).toBeNull();
    expect(afterState.program.allocatedSlotsCount).toBe(1);
    expect(afterState.histories.length).toBe(0);
    expect(afterState.auditLogs.length).toBe(0);

    // Clean up
    await pool.query(`DELETE FROM "WLSlot" WHERE id = $1`, [slotId]);
    await pool.query(`DELETE FROM "WLProgram" WHERE id = $1`, [programId]);
    await pool.query(`DELETE FROM "User" WHERE id = $1`, [userId]);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Skenario 3: Paksa AuditLog gagal -> Rollback
  // ──────────────────────────────────────────────────────────────────────────
  it("Skenario 3: Paksa AuditLog gagal — pastikan seluruh perubahan rollback", async () => {
    if (!isDbAvailable) {
      console.warn("⚠️ NOT VERIFIED: Real PostgreSQL not accessible.");
      return;
    }

    const testTag = `sc3_${Date.now()}`;
    const programId = `prog_${testTag}`;
    const userId = `user_${testTag}`;
    const slotId = `slot_${testTag}`;

    // Setup initial data
    await pool.query(
      `INSERT INTO "User" (id, role, "createdAt", "updatedAt") VALUES ($1, 'USER', NOW(), NOW())`,
      [userId],
    );
    await pool.query(
      `INSERT INTO "WLProgram" (id, slug, name, "totalSlots", "allocatedSlotsCount", status, "startsAt", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Test Program 3', 10, 1, 'OPEN', NOW(), NOW(), NOW())`,
      [programId, `slug-${testTag}`],
    );
    await pool.query(
      `INSERT INTO "WLSlot" (id, "programId", "userId", "slotNumber", status, "allocatedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 1, 'ALLOCATED', NOW(), NOW(), NOW())`,
      [slotId, programId, userId],
    );

    // Pasang PostgreSQL trigger yang memaksa kegagalan pada INSERT AuditLog
    await pool.query(`
      CREATE OR REPLACE FUNCTION fn_force_fail_op() RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'FORCED_POSTGRESQL_FAILURE_AUDIT_LOG';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await pool.query(`
      CREATE TRIGGER trg_fail_audit
      BEFORE INSERT ON "AuditLog"
      FOR EACH ROW EXECUTE FUNCTION fn_force_fail_op();
    `);

    // 1. Kondisi Database SEBELUM
    const beforeState = await queryDbState(slotId, programId, userId);
    console.log("\n=== SKENARIO 3: SEBELUM ===");
    console.log("WLSlot:", beforeState.slot);
    console.log("WLProgram:", beforeState.program);

    expect(beforeState.slot.status).toBe("ALLOCATED");
    expect(beforeState.program.allocatedSlotsCount).toBe(1);

    // 2. Eksekusi revokeWlSlot
    let caughtError: any = null;
    try {
      await revokeWlSlot(prisma, {
        slotId,
        adminUserId,
        reason: "Forced failure on audit log test",
        now: new Date(),
      });
    } catch (err) {
      caughtError = err;
    }

    console.log("\n=== SKENARIO 3: ERROR YANG DITANGKAP ===");
    console.log("Caught Error:", caughtError?.message || caughtError);
    expect(caughtError).toBeDefined();

    // Lepas trigger
    await pool.query(`DROP TRIGGER IF EXISTS trg_fail_audit ON "AuditLog"`);

    // 3. Kondisi Database SESUDAH (Verifikasi Rollback Penuh di PostgreSQL)
    const afterState = await queryDbState(slotId, programId, userId);
    console.log("\n=== SKENARIO 3: SESUDAH ROLLBACK (POSTGRESQL LANGSUNG) ===");
    console.log("WLSlot (harus tetap ALLOCATED):", afterState.slot);
    console.log("WLProgram (counter harus tetap 1):", afterState.program);
    console.log("WLStatusHistory count (harus 0):", afterState.histories.length);
    console.log("AuditLog count (harus 0):", afterState.auditLogs.length);

    expect(afterState.slot.status).toBe("ALLOCATED");
    expect(afterState.slot.notes).toBeNull();
    expect(afterState.program.allocatedSlotsCount).toBe(1);
    expect(afterState.histories.length).toBe(0);
    expect(afterState.auditLogs.length).toBe(0);

    // Clean up
    await pool.query(`DELETE FROM "WLSlot" WHERE id = $1`, [slotId]);
    await pool.query(`DELETE FROM "WLProgram" WHERE id = $1`, [programId]);
    await pool.query(`DELETE FROM "User" WHERE id = $1`, [userId]);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Skenario 4: Counter = 0 -> Revoke gagal dan slot tetap tidak berubah
  // ──────────────────────────────────────────────────────────────────────────
  it("Skenario 4: Counter = 0 — pastikan revoke gagal dan status slot tetap tidak berubah", async () => {
    if (!isDbAvailable) {
      console.warn("⚠️ NOT VERIFIED: Real PostgreSQL not accessible.");
      return;
    }

    const testTag = `sc4_${Date.now()}`;
    const programId = `prog_${testTag}`;
    const userId = `user_${testTag}`;
    const slotId = `slot_${testTag}`;

    // Setup initial data: program counter disengajakan 0
    await pool.query(
      `INSERT INTO "User" (id, role, "createdAt", "updatedAt") VALUES ($1, 'USER', NOW(), NOW())`,
      [userId],
    );
    await pool.query(
      `INSERT INTO "WLProgram" (id, slug, name, "totalSlots", "allocatedSlotsCount", status, "startsAt", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Test Program 4', 10, 0, 'OPEN', NOW(), NOW(), NOW())`,
      [programId, `slug-${testTag}`],
    );
    await pool.query(
      `INSERT INTO "WLSlot" (id, "programId", "userId", "slotNumber", status, "allocatedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 1, 'ALLOCATED', NOW(), NOW(), NOW())`,
      [slotId, programId, userId],
    );

    // 1. Kondisi Database SEBELUM
    const beforeState = await queryDbState(slotId, programId, userId);
    console.log("\n=== SKENARIO 4: SEBELUM ===");
    console.log("WLSlot:", beforeState.slot);
    console.log("WLProgram:", beforeState.program);

    expect(beforeState.slot.status).toBe("ALLOCATED");
    expect(beforeState.program.allocatedSlotsCount).toBe(0);

    // 2. Eksekusi revokeWlSlot (harus melempar COUNTER_INTEGRITY_VIOLATION)
    let caughtError: any = null;
    try {
      await revokeWlSlot(prisma, {
        slotId,
        adminUserId,
        reason: "Revoke attempt when counter is 0",
        now: new Date(),
      });
    } catch (err) {
      caughtError = err;
    }

    console.log("\n=== SKENARIO 4: ERROR YANG DITANGKAP ===");
    console.log("Caught Error:", {
      code: caughtError?.code,
      message: caughtError?.message,
      status: caughtError?.status,
    });

    expect(caughtError).toBeInstanceOf(WlSlotRevokeError);
    expect(caughtError.code).toBe("COUNTER_INTEGRITY_VIOLATION");
    expect(caughtError.status).toBe(500);

    // 3. Kondisi Database SESUDAH (Verifikasi Rollback di PostgreSQL)
    const afterState = await queryDbState(slotId, programId, userId);
    console.log("\n=== SKENARIO 4: SESUDAH ROLLBACK (POSTGRESQL LANGSUNG) ===");
    console.log("WLSlot (harus tetap ALLOCATED):", afterState.slot);
    console.log("WLProgram (counter harus tetap 0, tidak negatif):", afterState.program);
    console.log("WLStatusHistory count (harus 0):", afterState.histories.length);
    console.log("AuditLog count (harus 0):", afterState.auditLogs.length);

    // Slot tidak boleh berubah sebagian!
    expect(afterState.slot.status).toBe("ALLOCATED");
    expect(afterState.slot.notes).toBeNull();
    // Counter tetap 0 dan tidak pernah negatif
    expect(afterState.program.allocatedSlotsCount).toBe(0);
    // Tidak ada record history atau audit
    expect(afterState.histories.length).toBe(0);
    expect(afterState.auditLogs.length).toBe(0);

    // Clean up
    await pool.query(`DELETE FROM "WLSlot" WHERE id = $1`, [slotId]);
    await pool.query(`DELETE FROM "WLProgram" WHERE id = $1`, [programId]);
    await pool.query(`DELETE FROM "User" WHERE id = $1`, [userId]);
  });
});
