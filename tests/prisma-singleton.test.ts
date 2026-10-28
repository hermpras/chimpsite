import { describe, it, expect, beforeEach } from "vitest";
import { getPrismaClient, prisma } from "@/lib/prisma";

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
});
