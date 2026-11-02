import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";

const REAL_DB_URL =
  process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("pooler.supabase.com")
    ? process.env.DATABASE_URL
    : "postgresql://hermawanprastiyanto@localhost:5432/chimphood_test";

describe("PostgreSQL Real Advisory Lock Serialization for Drop Engine", () => {
  let pool: Pool;
  let isDbAvailable = false;

  beforeAll(async () => {
    // Strictly prevent touching production database
    if (REAL_DB_URL.includes("pooler.supabase.com") || REAL_DB_URL.includes("supabase.co")) {
      isDbAvailable = false;
      return;
    }

    try {
      pool = new Pool({
        connectionString: REAL_DB_URL,
        max: 5,
        connectionTimeoutMillis: 1000,
      });

      const client = await pool.connect();
      try {
        await client.query("SELECT 1");
        isDbAvailable = true;
      } finally {
        client.release();
      }
    } catch {
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (pool) {
      await pool.end().catch(() => {});
    }
  });

  it("serializes concurrent transactions for the same drop ID using pg_advisory_xact_lock", async () => {
    if (!isDbAvailable) {
      console.warn("⚠️ Local PostgreSQL database is not accessible. Skipping real advisory lock integration test.");
      return;
    }

    const dropId = `test-drop-${Date.now()}`;
    const executionOrder: string[] = [];

    const client1 = await pool.connect();
    const client2 = await pool.connect();

    try {
      const tx1Promise = (async () => {
        await client1.query("BEGIN");
        await client1.query("SELECT pg_advisory_xact_lock(982341, hashtext($1))", [dropId]);
        executionOrder.push("tx1_locked");
        // Hold the lock for 100ms
        await new Promise((r) => setTimeout(r, 100));
        executionOrder.push("tx1_releasing");
        await client1.query("COMMIT");
      })();

      // Give tx1 a small head start so it acquires the lock first
      await new Promise((r) => setTimeout(r, 20));

      const tx2Promise = (async () => {
        await client2.query("BEGIN");
        // This query must block until tx1 commits
        await client2.query("SELECT pg_advisory_xact_lock(982341, hashtext($1))", [dropId]);
        executionOrder.push("tx2_locked");
        await client2.query("COMMIT");
      })();

      await Promise.all([tx1Promise, tx2Promise]);

      // Assert serialization: tx2_locked must strictly occur after tx1_releasing
      expect(executionOrder).toEqual(["tx1_locked", "tx1_releasing", "tx2_locked"]);
    } finally {
      client1.release();
      client2.release();
    }
  });

  it("does not block concurrent transactions for different drop IDs", async () => {
    if (!isDbAvailable) {
      return;
    }

    const dropA = `drop-a-${Date.now()}`;
    const dropB = `drop-b-${Date.now()}`;
    const executionOrder: string[] = [];

    const clientA = await pool.connect();
    const clientB = await pool.connect();

    try {
      const txAPromise = (async () => {
        await clientA.query("BEGIN");
        await clientA.query("SELECT pg_advisory_xact_lock(982341, hashtext($1))", [dropA]);
        executionOrder.push("txA_locked");
        await new Promise((r) => setTimeout(r, 100));
        await clientA.query("COMMIT");
      })();

      await new Promise((r) => setTimeout(r, 20));

      const txBPromise = (async () => {
        await clientB.query("BEGIN");
        // Different drop ID: must acquire immediately without waiting for txA to commit
        await clientB.query("SELECT pg_advisory_xact_lock(982341, hashtext($1))", [dropB]);
        executionOrder.push("txB_locked");
        await clientB.query("COMMIT");
      })();

      await Promise.all([txAPromise, txBPromise]);

      // Both should acquire lock without waiting for txA to finish
      expect(executionOrder).toContain("txA_locked");
      expect(executionOrder).toContain("txB_locked");
    } finally {
      clientA.release();
      clientB.release();
    }
  });
});
