import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { issueNonce } from "@/server/auth/nonce";
import { NONCE_TTL_MS } from "@/lib/auth/nonce";

/** Minimal fake of the Prisma client surface used by issueNonce. */
function fakePrisma() {
  const create = vi.fn(
    async (args: {
      data: { nonce: string; expiresAt: Date; address: string | null };
    }) => ({
      nonce: args.data.nonce,
      expiresAt: args.data.expiresAt,
    }),
  );
  const prisma = { siweNonce: { create } } as unknown as PrismaClient;
  return { create, prisma };
}

describe("issueNonce", () => {
  it("persists a nonce with an expiry matching the 10-minute TTL", async () => {
    const { create, prisma } = fakePrisma();
    const before = Date.now();
    const { nonce, expiresAt } = await issueNonce(prisma);
    const after = Date.now();

    expect(create).toHaveBeenCalledTimes(1);
    const args = create.mock.calls[0][0];
    expect(args.data.nonce).toBe(nonce);
    expect(args.data.expiresAt).toEqual(expiresAt);
    // 43-char alphanumeric (EIP-4361), 256-bit entropy
    expect(nonce).toMatch(/^[A-Za-z0-9]{43}$/);
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + NONCE_TTL_MS);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + NONCE_TTL_MS);
  });

  it("issues a different nonce on every call", async () => {
    const { prisma } = fakePrisma();
    const first = await issueNonce(prisma);
    const second = await issueNonce(prisma);
    expect(first.nonce).not.toBe(second.nonce);
  });

  it("stores the bound address when one is provided", async () => {
    const { create, prisma } = fakePrisma();
    const address = "0x" + "ab".repeat(20);
    await issueNonce(prisma, { address });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.address).toBe(address);
  });

  it("stores a null address when none is provided (unbound nonce)", async () => {
    const { create, prisma } = fakePrisma();
    await issueNonce(prisma);
    expect(create.mock.calls[0][0].data.address).toBeNull();
  });

  it("propagates database errors to the caller (the route maps these to 500)", async () => {
    const create = vi.fn(async () => {
      throw new Error("P2002 unique constraint failed");
    });
    const prisma = { siweNonce: { create } } as unknown as PrismaClient;
    await expect(issueNonce(prisma)).rejects.toThrow("P2002");
    expect(create).toHaveBeenCalledTimes(1);
  });
});
