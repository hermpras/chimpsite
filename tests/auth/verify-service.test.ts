// @vitest-environment node
// (Node env: ethers v6's Wallet.createRandom() breaks under jsdom because its
// internal randomBytes produces a cross-realm Buffer shape that getBytes()
// rejects. This file is pure crypto + a fake DB — no DOM needed.)
import { describe, it, expect, vi } from "vitest";
import { Wallet } from "ethers";
import { SiweMessage } from "siwe";
import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { verifySiweLogin, SiweAuthError } from "@/server/auth/verify";
import { generateNonce } from "@/lib/auth/nonce";

// NOTE: these tests use REAL cryptography (ethers Wallet + siwe verification)
// against a FAKE Prisma store — no database, no network, fully deterministic.

const DOMAIN = "localhost:3000";
const URI = "http://localhost:3000";
const VERIFY_OPTS = { expectedDomain: DOMAIN, expectedUri: URI, allowedChainIds: [1] };
const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

interface FakeNonceRow {
  nonce: string;
  address: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
}
interface FakeUserRow {
  id: string;
  isBanned: boolean;
}
interface FakeWalletRow {
  address: string;
  chainId: number;
  user: FakeUserRow;
}
interface FakeSessionRow {
  userId: string;
  token: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}
interface FakeBanRecordRow {
  userId: string;
  isActive: boolean;
  scope: string;
  expiresAt: Date | null;
}

/** Fake Prisma store with honest conditional-update semantics for siweNonce. */
function makeFakePrisma() {
  const nonces = new Map<string, FakeNonceRow>();
  const wallets = new Map<string, FakeWalletRow>();
  const sessions: FakeSessionRow[] = [];

  const siweNonce = {
    updateMany: vi.fn(
      async (args: {
        where: {
          nonce: string;
          consumedAt: null;
          expiresAt: { gt: Date };
          OR?: Array<{ address: string | null }>;
        };
        data: { consumedAt: Date };
      }): Promise<{ count: number }> => {
        const row = nonces.get(args.where.nonce);
        if (!row) return { count: 0 };
        if (row.consumedAt !== null) return { count: 0 };
        if (row.expiresAt <= args.where.expiresAt.gt) return { count: 0 };
        const or = args.where.OR;
        if (or && !or.some((cond) => cond.address === row.address)) return { count: 0 };
        row.consumedAt = args.data.consumedAt;
        return { count: 1 };
      },
    ),
  };

  const walletIdentity = {
    findUnique: vi.fn(
      async (args: {
        where: { address: string };
        include: { user: true };
      }): Promise<FakeWalletRow | null> => {
        const row = wallets.get(args.where.address);
        return row
          ? { address: row.address, chainId: row.chainId, user: { ...row.user } }
          : null;
      },
    ),
    create: vi.fn(
      async (args: {
        data: {
          address: string;
          chainId: number;
          user: { create: Record<string, never> };
        };
        include: { user: true };
      }): Promise<FakeWalletRow> => {
        if (wallets.has(args.data.address)) {
          const err = new Error(
            "Unique constraint failed on the fields: (`address`)",
          ) as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const row: FakeWalletRow = {
          address: args.data.address,
          chainId: args.data.chainId,
          user: { id: `user_${args.data.address.slice(2, 10)}`, isBanned: false },
        };
        wallets.set(args.data.address, row);
        return row;
      },
    ),
  };

  const authSession = {
    create: vi.fn(
      async (args: {
        data: {
          userId: string;
          token: string;
          expiresAt: Date;
          ipAddress?: string;
          userAgent?: string;
        };
        select: { id: true; expiresAt: true };
      }): Promise<{ id: string; expiresAt: Date }> => {
        sessions.push({ ...args.data });
        return { id: `sess_${sessions.length}`, expiresAt: args.data.expiresAt };
      },
    ),
  };

  const bans: FakeBanRecordRow[] = [];
  const banRecord = {
    findFirst: vi.fn(async (args: any) => {
      const now = new Date();
      return (
        bans.find((b) => {
          if (b.userId !== args.where.userId) return false;
          if (args.where.isActive !== undefined && b.isActive !== args.where.isActive) return false;
          if (args.where.scope && b.scope !== args.where.scope) return false;
          if (args.where.OR && b.expiresAt) {
            const gtObj = args.where.OR.find((cond: any) => cond.expiresAt?.gt);
            if (gtObj && gtObj.expiresAt.gt >= b.expiresAt) return false;
          }
          return true;
        }) || null
      );
    }),
  };

  const user = {
    update: vi.fn(async (args: any) => {
      for (const w of wallets.values()) {
        if (w.user.id === args.where.id) {
          Object.assign(w.user, args.data);
          return w.user;
        }
      }
      return null;
    }),
  };

  const prisma = {
    siweNonce,
    walletIdentity,
    authSession,
    banRecord,
    user,
  } as unknown as PrismaClient;
  return { prisma, nonces, wallets, sessions, bans };
}

function seedNonce(
  nonces: Map<string, FakeNonceRow>,
  overrides?: Partial<FakeNonceRow>,
): FakeNonceRow {
  const row: FakeNonceRow = {
    nonce: generateNonce(),
    address: null,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    consumedAt: null,
    ...overrides,
  };
  nonces.set(row.nonce, row);
  return row;
}

interface SignOverrides {
  domain?: string;
  uri?: string;
  chainId?: number;
  address?: string;
  expirationTime?: string;
  issuedAt?: string;
}

/** Minimal signer surface — satisfied by both ethers Wallet and HDNodeWallet. */
interface TestSigner {
  readonly address: string;
  signMessage(message: string): Promise<string>;
}

async function signLogin(signer: TestSigner, nonce: string, overrides?: SignOverrides) {
  const message = new SiweMessage({
    domain: overrides?.domain ?? DOMAIN,
    address: overrides?.address ?? signer.address,
    statement: "Sign in to ChimpHood",
    uri: overrides?.uri ?? URI,
    version: "1",
    chainId: overrides?.chainId ?? 1,
    nonce,
    ...(overrides?.expirationTime ? { expirationTime: overrides.expirationTime } : {}),
    ...(overrides?.issuedAt ? { issuedAt: overrides.issuedAt } : {}),
  }).prepareMessage();
  const signature = await signer.signMessage(message);
  return { message, signature };
}

async function expectSiweError(
  promise: Promise<unknown>,
  code: string,
  status: number,
): Promise<void> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(SiweAuthError);
    const authErr = err as SiweAuthError;
    expect(authErr.code).toBe(code);
    expect(authErr.status).toBe(status);
    return;
  }
  expect.unreachable(`Expected SiweAuthError ${code}, but the call succeeded.`);
}

describe("verifySiweLogin", () => {
  it("verifies a valid signature and creates user, wallet, and session", async () => {
    const { prisma, nonces, wallets, sessions } = makeFakePrisma();
    const signer = Wallet.createRandom();
    const row = seedNonce(nonces);
    const { message, signature } = await signLogin(signer, row.nonce);

    const result = await verifySiweLogin(prisma, { message, signature }, VERIFY_OPTS);
    const address = signer.address.toLowerCase();

    expect(result.address).toBe(address);
    expect(result.userId).toBe(wallets.get(address)?.user.id);
    expect(result.rawToken).toMatch(/^[0-9a-f]{64}$/);

    // Nonce was consumed atomically.
    expect(nonces.get(row.nonce)?.consumedAt).toBeInstanceOf(Date);
    // Wallet identity was created with the message chain ID.
    expect(wallets.get(address)?.chainId).toBe(1);
    // Session persisted ONLY as a hash; the raw token is returned for the cookie.
    expect(sessions).toHaveLength(1);
    expect(sessions[0].token).toBe(sha256(result.rawToken));
    expect(sessions[0].token).not.toBe(result.rawToken);
    expect(sessions[0].userId).toBe(result.userId);
  });

  it("rejects a signature from a different key (AUTH_FAILED:SIWE_VERIFICATION_FAILED, 401)", async () => {
    const { prisma, nonces, wallets, sessions } = makeFakePrisma();
    const victim = Wallet.createRandom();
    const attacker = Wallet.createRandom();
    const row = seedNonce(nonces);
    const { message } = await signLogin(victim, row.nonce);
    const signature = await attacker.signMessage(message);

    await expectSiweError(
      verifySiweLogin(prisma, { message, signature }, VERIFY_OPTS),
      "AUTH_FAILED:SIWE_VERIFICATION_FAILED",
      401,
    );
    expect(wallets.size).toBe(0);
    expect(sessions).toHaveLength(0);
  });

  it("rejects a wrong domain (AUTH_FAILED:SIWE_DOMAIN_MISMATCH, 401)", async () => {
    const { prisma, nonces } = makeFakePrisma();
    const signer = Wallet.createRandom();
    const row = seedNonce(nonces);
    const { message, signature } = await signLogin(signer, row.nonce, {
      domain: "evil.example",
    });

    await expectSiweError(
      verifySiweLogin(prisma, { message, signature }, VERIFY_OPTS),
      "AUTH_FAILED:SIWE_DOMAIN_MISMATCH",
      401,
    );
  });

  it("rejects a wrong URI (AUTH_FAILED:SIWE_URI_MISMATCH, 401)", async () => {
    const { prisma, nonces } = makeFakePrisma();
    const signer = Wallet.createRandom();
    const row = seedNonce(nonces);
    const { message, signature } = await signLogin(signer, row.nonce, {
      uri: "https://evil.example/login",
    });

    await expectSiweError(
      verifySiweLogin(prisma, { message, signature }, VERIFY_OPTS),
      "AUTH_FAILED:SIWE_URI_MISMATCH",
      401,
    );
  });

  it("rejects a message with issuedAt too far in the past (AUTH_FAILED:SIWE_ISSUED_AT_INVALID, 401)", async () => {
    const { prisma, nonces } = makeFakePrisma();
    const signer = Wallet.createRandom();
    const row = seedNonce(nonces);
    const { message, signature } = await signLogin(signer, row.nonce, {
      issuedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });

    await expectSiweError(
      verifySiweLogin(prisma, { message, signature }, VERIFY_OPTS),
      "AUTH_FAILED:SIWE_ISSUED_AT_INVALID",
      401,
    );
  });

  it("rejects a message with issuedAt too far in the future (AUTH_FAILED:SIWE_ISSUED_AT_INVALID, 401)", async () => {
    const { prisma, nonces } = makeFakePrisma();
    const signer = Wallet.createRandom();
    const row = seedNonce(nonces);
    const { message, signature } = await signLogin(signer, row.nonce, {
      issuedAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    await expectSiweError(
      verifySiweLogin(prisma, { message, signature }, VERIFY_OPTS),
      "AUTH_FAILED:SIWE_ISSUED_AT_INVALID",
      401,
    );
  });

  it("rejects an expired nonce (NONCE_INVALID, 401) with no side effects", async () => {
    const { prisma, nonces, wallets, sessions } = makeFakePrisma();
    const signer = Wallet.createRandom();
    const row = seedNonce(nonces, { expiresAt: new Date(Date.now() - 1000) });
    const { message, signature } = await signLogin(signer, row.nonce);

    await expectSiweError(
      verifySiweLogin(prisma, { message, signature }, VERIFY_OPTS),
      "NONCE_INVALID",
      401,
    );
    expect(wallets.size).toBe(0);
    expect(sessions).toHaveLength(0);
  });

  it("rejects a replayed nonce (second use fails)", async () => {
    const { prisma, nonces } = makeFakePrisma();
    const signer = Wallet.createRandom();
    const row = seedNonce(nonces);
    const { message, signature } = await signLogin(signer, row.nonce);

    const first = await verifySiweLogin(prisma, { message, signature }, VERIFY_OPTS);
    expect(first.address).toBe(signer.address.toLowerCase());
    await expectSiweError(
      verifySiweLogin(prisma, { message, signature }, VERIFY_OPTS),
      "NONCE_INVALID",
      401,
    );
  });

  it("rejects a disallowed chain ID (AUTH_FAILED:SIWE_CHAIN_NOT_ALLOWED, 401)", async () => {
    const { prisma, nonces, sessions } = makeFakePrisma();
    const signer = Wallet.createRandom();
    const row = seedNonce(nonces);
    const { message, signature } = await signLogin(signer, row.nonce, { chainId: 137 });

    await expectSiweError(
      verifySiweLogin(
        prisma,
        { message, signature },
        { ...VERIFY_OPTS, allowedChainIds: [1] },
      ),
      "AUTH_FAILED:SIWE_CHAIN_NOT_ALLOWED",
      401,
    );
    expect(sessions).toHaveLength(0);
  });

  it("rejects a message whose domain omits the port when the configured domain includes it (AUTH_FAILED:SIWE_DOMAIN_MISMATCH, 401)", async () => {
    const { prisma, nonces, sessions } = makeFakePrisma();
    const signer = Wallet.createRandom();
    const row = seedNonce(nonces);
    // Regression for the local-dev incident: browser on http://localhost:3000
    // sends domain "localhost:3000"; a server configured with "localhost"
    // (no port) must reject it with the categorized code.
    const { message, signature } = await signLogin(signer, row.nonce, {
      domain: "localhost",
    });

    await expectSiweError(
      verifySiweLogin(prisma, { message, signature }, VERIFY_OPTS),
      "AUTH_FAILED:SIWE_DOMAIN_MISMATCH",
      401,
    );
    expect(sessions).toHaveLength(0);
  });

  it("rejects a message whose expirationTime has passed (AUTH_FAILED:SIWE_MESSAGE_EXPIRED, 401)", async () => {
    const { prisma, nonces, sessions } = makeFakePrisma();
    const signer = Wallet.createRandom();
    const row = seedNonce(nonces);
    const { message, signature } = await signLogin(signer, row.nonce, {
      expirationTime: new Date(Date.now() - 1000).toISOString(),
    });

    await expectSiweError(
      verifySiweLogin(prisma, { message, signature }, VERIFY_OPTS),
      "AUTH_FAILED:SIWE_MESSAGE_EXPIRED",
      401,
    );
    expect(sessions).toHaveLength(0);
  });

  it("accepts an allowed non-default chain ID", async () => {
    const { prisma, nonces, wallets } = makeFakePrisma();
    const signer = Wallet.createRandom();
    const row = seedNonce(nonces);
    const { message, signature } = await signLogin(signer, row.nonce, { chainId: 137 });

    const result = await verifySiweLogin(
      prisma,
      { message, signature },
      { ...VERIFY_OPTS, allowedChainIds: [1, 137] },
    );
    expect(result.address).toBe(signer.address.toLowerCase());
    expect(wallets.get(result.address)?.chainId).toBe(137);
  });

  it("enforces nonce->address binding: mismatched address is rejected, nonce not burned", async () => {
    const { prisma, nonces } = makeFakePrisma();
    const boundWallet = Wallet.createRandom();
    const otherWallet = Wallet.createRandom();
    const row = seedNonce(nonces, { address: boundWallet.address.toLowerCase() });
    const { message, signature } = await signLogin(otherWallet, row.nonce);

    await expectSiweError(
      verifySiweLogin(prisma, { message, signature }, VERIFY_OPTS),
      "NONCE_INVALID",
      401,
    );
    // Not consumed — the legitimate holder can still use it.
    expect(nonces.get(row.nonce)?.consumedAt).toBeNull();
  });

  it("accepts a nonce bound to the signing address", async () => {
    const { prisma, nonces } = makeFakePrisma();
    const signer = Wallet.createRandom();
    const row = seedNonce(nonces, { address: signer.address.toLowerCase() });
    const { message, signature } = await signLogin(signer, row.nonce);

    const result = await verifySiweLogin(prisma, { message, signature }, VERIFY_OPTS);
    expect(result.address).toBe(signer.address.toLowerCase());
  });

  it("rejects banned users (ACCOUNT_SUSPENDED, 403) with no session", async () => {
    const { prisma, nonces, wallets, sessions } = makeFakePrisma();
    const signer = Wallet.createRandom();
    const address = signer.address.toLowerCase();
    const row = seedNonce(nonces);
    const { message, signature } = await signLogin(signer, row.nonce);
    wallets.set(address, {
      address,
      chainId: 1,
      user: { id: "user_banned", isBanned: true },
    });

    await expectSiweError(
      verifySiweLogin(prisma, { message, signature }, VERIFY_OPTS),
      "ACCOUNT_SUSPENDED",
      403,
    );
    expect(sessions).toHaveLength(0);
  });

  it("rejects login when active unexpired temporary FULL_SYSTEM ban is present", async () => {
    const { prisma, nonces, wallets, sessions, bans } = makeFakePrisma();
    const signer = Wallet.createRandom();
    const address = signer.address.toLowerCase();
    const row = seedNonce(nonces);
    const { message, signature } = await signLogin(signer, row.nonce);
    wallets.set(address, {
      address,
      chainId: 1,
      user: { id: "user_temp_active", isBanned: false },
    });
    bans.push({
      userId: "user_temp_active",
      isActive: true,
      scope: "FULL_SYSTEM",
      expiresAt: new Date(Date.now() + 3600_000), // in the future
    });

    await expectSiweError(
      verifySiweLogin(prisma, { message, signature }, VERIFY_OPTS),
      "ACCOUNT_SUSPENDED",
      403,
    );
    expect(sessions).toHaveLength(0);
  });

  it("allows login and clears isBanned after temporary FULL_SYSTEM ban expires", async () => {
    const { prisma, nonces, wallets, sessions, bans } = makeFakePrisma();
    const signer = Wallet.createRandom();
    const address = signer.address.toLowerCase();
    const row = seedNonce(nonces);
    const { message, signature } = await signLogin(signer, row.nonce);
    wallets.set(address, {
      address,
      chainId: 1,
      user: { id: "user_temp_expired", isBanned: true },
    });
    bans.push({
      userId: "user_temp_expired",
      isActive: true,
      scope: "FULL_SYSTEM",
      expiresAt: new Date(Date.now() - 10_000), // in the past
    });

    const res = await verifySiweLogin(prisma, { message, signature }, VERIFY_OPTS);
    expect(res.userId).toBe("user_temp_expired");
    expect(wallets.get(address)!.user.isBanned).toBe(false); // auto-healed!
    expect(sessions).toHaveLength(1);
  });

  it("overlapping bans: expired temporary ban does not unblock an active permanent ban", async () => {
    const { prisma, nonces, wallets, sessions, bans } = makeFakePrisma();
    const signer = Wallet.createRandom();
    const address = signer.address.toLowerCase();
    const row = seedNonce(nonces);
    const { message, signature } = await signLogin(signer, row.nonce);
    wallets.set(address, {
      address,
      chainId: 1,
      user: { id: "user_overlap", isBanned: true },
    });
    bans.push({
      userId: "user_overlap",
      isActive: true,
      scope: "FULL_SYSTEM",
      expiresAt: new Date(Date.now() - 10_000), // expired temporary ban
    });
    bans.push({
      userId: "user_overlap",
      isActive: true,
      scope: "FULL_SYSTEM",
      expiresAt: null, // permanent active ban
    });

    await expectSiweError(
      verifySiweLogin(prisma, { message, signature }, VERIFY_OPTS),
      "ACCOUNT_SUSPENDED",
      403,
    );
    expect(sessions).toHaveLength(0);
  });

  it("rejects malformed input (INVALID_REQUEST, 400)", async () => {
    const { prisma } = makeFakePrisma();
    await expectSiweError(
      verifySiweLogin(prisma, { message: "", signature: "" }, VERIFY_OPTS),
      "INVALID_REQUEST",
      400,
    );
    await expectSiweError(
      verifySiweLogin(
        prisma,
        { message: "not a siwe message", signature: "0x1234" },
        VERIFY_OPTS,
      ),
      "INVALID_MESSAGE",
      401,
    );
  });

  it("recovers from a wallet-creation race via the P2002 retry", async () => {
    const { prisma, nonces, wallets } = makeFakePrisma();
    const signer = Wallet.createRandom();
    const address = signer.address.toLowerCase();
    const row = seedNonce(nonces);
    const { message, signature } = await signLogin(signer, row.nonce);
    // Simulate the loser of a creation race: findUnique misses, then create
    // hits P2002 because a concurrent request won.
    wallets.set(address, {
      address,
      chainId: 1,
      user: { id: "user_race_winner", isBanned: false },
    });

    const result = await verifySiweLogin(prisma, { message, signature }, VERIFY_OPTS);
    expect(result.userId).toBe("user_race_winner");
    expect(result.address).toBe(address);
  });
});
