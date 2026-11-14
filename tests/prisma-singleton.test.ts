import { describe, it, expect, beforeEach } from "vitest";
import { getPrismaClient, parseDatabasePoolMax, prisma } from "@/lib/prisma";

describe("PrismaClient Singleton & Connection Pool Management (lib/prisma.ts)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns the exact same PrismaClient instance across multiple calls in production", () => {
    (process.env as any).NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://mockuser:mockpass@localhost:5432/mockdb";

    const client1 = getPrismaClient();
    const client2 = getPrismaClient();

    expect(client1).toBe(client2);
  });

  it("reuses the underlying pg.Pool on globalThis in production", () => {
    (process.env as any).NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://mockuser:mockpass@localhost:5432/mockdb";

    const globalForPrisma = globalThis as any;
    const pool1 = globalForPrisma.pgPool;
    expect(pool1).toBeDefined();

    const client = getPrismaClient();
    expect(client).toBeDefined();
    expect(globalForPrisma.pgPool).toBe(pool1);
  });

  it("proxy does not spawn new client instances on repeated property accesses", () => {
    (process.env as any).NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://mockuser:mockpass@localhost:5432/mockdb";

    const globalForPrisma = globalThis as any;
    const clientBefore = globalForPrisma.prisma;

    // Access various model delegates on the proxy
    const _user = prisma.user;
    const _drop = prisma.drop;
    const _claim = prisma.claim;

    const clientAfter = globalForPrisma.prisma;
    expect(clientBefore).toBe(clientAfter);
  });

  it("configures pg.Pool with default max: 1 when DATABASE_POOL_MAX is unset", () => {
    (process.env as any).NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://mockuser:mockpass@localhost:5432/mockdb";
    delete process.env.DATABASE_POOL_MAX;

    const globalForPrisma = globalThis as any;
    delete globalForPrisma.pgPool;
    delete globalForPrisma.prisma;

    getPrismaClient();

    expect(globalForPrisma.pgPool).toBeDefined();
    expect(globalForPrisma.pgPool.options.max).toBe(1);
  });

  it("configures pg.Pool using DATABASE_POOL_MAX override when specified", () => {
    (process.env as any).NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://mockuser:mockpass@localhost:5432/mockdb";
    process.env.DATABASE_POOL_MAX = "5";

    const globalForPrisma = globalThis as any;
    delete globalForPrisma.pgPool;
    delete globalForPrisma.prisma;

    getPrismaClient();

    expect(globalForPrisma.pgPool).toBeDefined();
    expect(globalForPrisma.pgPool.options.max).toBe(5);
  });

  it("safely falls back to default max: 1 when DATABASE_POOL_MAX is zero or negative", () => {
    (process.env as any).NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://mockuser:mockpass@localhost:5432/mockdb";

    const globalForPrisma = globalThis as any;

    // Test zero
    process.env.DATABASE_POOL_MAX = "0";
    delete globalForPrisma.pgPool;
    delete globalForPrisma.prisma;
    getPrismaClient();
    expect(globalForPrisma.pgPool?.options.max).toBe(1);

    // Test negative
    process.env.DATABASE_POOL_MAX = "-5";
    delete globalForPrisma.pgPool;
    delete globalForPrisma.prisma;
    getPrismaClient();
    expect(globalForPrisma.pgPool?.options.max).toBe(1);
  });

  it("safely falls back to default max: 1 when DATABASE_POOL_MAX contains decimals or mixed strings", () => {
    (process.env as any).NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://mockuser:mockpass@localhost:5432/mockdb";

    const globalForPrisma = globalThis as any;

    // Test decimal (parseInt would have incorrectly accepted 1.5 as 1)
    process.env.DATABASE_POOL_MAX = "1.5";
    delete globalForPrisma.pgPool;
    delete globalForPrisma.prisma;
    getPrismaClient();
    expect(globalForPrisma.pgPool?.options.max).toBe(1);

    // Test mixed string with trailing chars (parseInt would have incorrectly accepted 5abc as 5)
    process.env.DATABASE_POOL_MAX = "5abc";
    delete globalForPrisma.pgPool;
    delete globalForPrisma.prisma;
    getPrismaClient();
    expect(globalForPrisma.pgPool?.options.max).toBe(1);

    // Test mixed string with trailing chars (parseInt would have incorrectly accepted 2xyz as 2)
    process.env.DATABASE_POOL_MAX = "2xyz";
    delete globalForPrisma.pgPool;
    delete globalForPrisma.prisma;
    getPrismaClient();
    expect(globalForPrisma.pgPool?.options.max).toBe(1);
  });

  it("safely falls back to default max: 1 when DATABASE_POOL_MAX is non-numeric, whitespace, or invalid", () => {
    (process.env as any).NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://mockuser:mockpass@localhost:5432/mockdb";

    const globalForPrisma = globalThis as any;

    // Test non-numeric string
    process.env.DATABASE_POOL_MAX = "not-a-number";
    delete globalForPrisma.pgPool;
    delete globalForPrisma.prisma;
    getPrismaClient();
    expect(globalForPrisma.pgPool?.options.max).toBe(1);

    // Test whitespace only
    process.env.DATABASE_POOL_MAX = "   ";
    delete globalForPrisma.pgPool;
    delete globalForPrisma.prisma;
    getPrismaClient();
    expect(globalForPrisma.pgPool?.options.max).toBe(1);

    // Test empty string
    process.env.DATABASE_POOL_MAX = "";
    delete globalForPrisma.pgPool;
    delete globalForPrisma.prisma;
    getPrismaClient();
    expect(globalForPrisma.pgPool?.options.max).toBe(1);
  });

  describe("parseDatabasePoolMax strict validation logic", () => {
    it("accepts valid whole positive integers", () => {
      expect(parseDatabasePoolMax("1")).toBe(1);
      expect(parseDatabasePoolMax("2")).toBe(2);
      expect(parseDatabasePoolMax("10")).toBe(10);
      expect(parseDatabasePoolMax("100")).toBe(100);
      expect(parseDatabasePoolMax(" 5 ")).toBe(5);
    });

    it("rejects non-positive numbers, zeros, and leading zeros", () => {
      expect(parseDatabasePoolMax("0")).toBe(1);
      expect(parseDatabasePoolMax("-1")).toBe(1);
      expect(parseDatabasePoolMax("-10")).toBe(1);
      expect(parseDatabasePoolMax("05")).toBe(1);
    });

    it("rejects decimals, non-integers, and mixed strings", () => {
      expect(parseDatabasePoolMax("1.5")).toBe(1);
      expect(parseDatabasePoolMax("3.14")).toBe(1);
      expect(parseDatabasePoolMax("5abc")).toBe(1);
      expect(parseDatabasePoolMax("2xyz")).toBe(1);
      expect(parseDatabasePoolMax("abc5")).toBe(1);
      expect(parseDatabasePoolMax("10e2")).toBe(1);
    });

    it("rejects special floating-point values, empty, and whitespace strings", () => {
      expect(parseDatabasePoolMax(undefined)).toBe(1);
      expect(parseDatabasePoolMax("")).toBe(1);
      expect(parseDatabasePoolMax("   ")).toBe(1);
      expect(parseDatabasePoolMax("NaN")).toBe(1);
      expect(parseDatabasePoolMax("Infinity")).toBe(1);
      expect(parseDatabasePoolMax("-Infinity")).toBe(1);
    });
  });
});
