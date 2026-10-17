/**
 * SIWE login orchestration for POST /api/auth/verify.
 *
 * Order of operations (deliberate):
 *   1. Light parse (no crypto) to extract the claimed nonce + address.
 *   2. ATOMICALLY consume the nonce: a conditional updateMany that matches
 *      only an eligible, unconsumed, unexpired row bound to this address
 *      (or to no address). Exactly one row must be updated; anything else —
 *      unknown, expired, replayed, or address-mismatched — is rejected.
 *      Consuming BEFORE signature verification means a failed verification
 *      burns the nonce (the client simply requests a new one) and leaves no
 *      replay window whatsoever.
 *   3. Full cryptographic verification: signature, domain, URI, nonce
 *      equality, message-level expiry, chain allowlist. Failures are mapped
 *      to a generic 401 for the client; the machine-readable failure
 *      category (AUTH_FAILED:SIWE_*) is written to the server log only, so
 *      operators can diagnose without touching signatures or secrets.
 *   4. Find-or-create the wallet identity (race-safe via P2002 retry).
 *   5. Reject banned users (403).
 *   6. Create the session — only the token HASH is persisted; the raw token
 *      is returned for the route to seal into the cookie.
 *
 * The Prisma client is injected (dependency injection) for DB-free tests.
 */
import { SiweMessage } from "siwe";
import type { PrismaClient } from "@prisma/client";
import { normalizeAddress } from "@/lib/auth/address";
import { SiweVerifyError, verifySiweMessage } from "@/lib/auth/siwe";
import { createSession } from "./session";

/**
 * Machine-readable login failure. The route maps `code` -> HTTP status and
 * returns only generic client messages (no internal details leak).
 */
export class SiweAuthError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) {
    super(code);
    this.name = "SiweAuthError";
    this.code = code;
    this.status = status;
  }
}

export interface VerifySiweInput {
  message: string;
  signature: string;
}

export interface VerifySiweOptions {
  expectedDomain: string;
  expectedUri: string;
  allowedChainIds: number[];
  ipAddress?: string;
  userAgent?: string;
}

export interface VerifiedLogin {
  userId: string;
  /** Normalized (lowercase) wallet address. */
  address: string;
  /** Raw session token — the route seals it into the cookie, never persists it. */
  rawToken: string;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

/**
 * Find the wallet identity by normalized address, creating the User +
 * WalletIdentity pair when absent. A concurrent creation race surfaces as a
 * P2002 unique violation, in which case we re-read the winner's row once.
 */
async function findOrCreateWalletIdentity(
  prisma: PrismaClient,
  address: string,
  chainId: number,
) {
  const existing = await prisma.walletIdentity.findUnique({
    where: { address },
    include: { user: true },
  });
  if (existing) return existing;
  try {
    return await prisma.walletIdentity.create({
      data: { address, chainId, user: { create: {} } },
      include: { user: true },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const winner = await prisma.walletIdentity.findUnique({
        where: { address },
        include: { user: true },
      });
      if (winner) return winner;
    }
    throw err;
  }
}

export async function verifySiweLogin(
  prisma: PrismaClient,
  input: VerifySiweInput,
  opts: VerifySiweOptions,
): Promise<VerifiedLogin> {
  const message = input?.message;
  const signature = input?.signature;
  if (
    typeof message !== "string" ||
    typeof signature !== "string" ||
    !message ||
    !signature
  ) {
    throw new SiweAuthError("INVALID_REQUEST", 400);
  }

  // 1. Light parse (no crypto): extract the claimed nonce + address.
  let parsed: SiweMessage;
  try {
    parsed = new SiweMessage(message);
  } catch {
    throw new SiweAuthError("INVALID_MESSAGE", 401);
  }
  let claimedAddress: string;
  try {
    claimedAddress = normalizeAddress(parsed.address);
  } catch {
    throw new SiweAuthError("INVALID_MESSAGE", 401);
  }
  const claimedNonce = parsed.nonce;
  if (!claimedNonce) {
    throw new SiweAuthError("INVALID_MESSAGE", 401);
  }

  // 2. Atomically consume the nonce. Exactly one row must match.
  const now = new Date();
  const consumed = await prisma.siweNonce.updateMany({
    where: {
      nonce: claimedNonce,
      consumedAt: null,
      expiresAt: { gt: now },
      OR: [{ address: null }, { address: claimedAddress }],
    },
    data: { consumedAt: now },
  });
  if (consumed.count !== 1) {
    throw new SiweAuthError("NONCE_INVALID", 401);
  }

  // 3. Full cryptographic verification (signature, domain, URI, nonce,
  //    message expiry, chain allowlist). The failure category is preserved in
  //    the error code for the server log (reason codes only — no signature,
  //    cookie, or secret material); the client still gets a generic 401.
  let verifiedAddress: string;
  let chainId: number;
  try {
    const result = await verifySiweMessage({
      message,
      signature,
      nonce: claimedNonce,
      expectedDomain: opts.expectedDomain,
      expectedUri: opts.expectedUri,
      allowedChainIds: opts.allowedChainIds,
    });
    verifiedAddress = result.address;
    chainId = result.chainId;
  } catch (err) {
    const reason =
      err instanceof SiweVerifyError ? err.reason : "SIWE_VERIFICATION_FAILED";
    throw new SiweAuthError(`AUTH_FAILED:${reason}`, 401);
  }

  // 4. Find or create the wallet identity (race-safe).
  const wallet = await findOrCreateWalletIdentity(prisma, verifiedAddress, chainId);

  // 5. Banned users cannot obtain a session.
  let isSuspended = wallet.user.isBanned;

  if (isSuspended && (prisma as any).banRecord) {
    // If user.isBanned was previously set to true, verify whether there is still an active unexpired FULL_SYSTEM ban
    const activeFullBan = await (prisma as any).banRecord.findFirst({
      where: {
        userId: wallet.user.id,
        isActive: true,
        scope: "FULL_SYSTEM",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    const anyBanRecord = await (prisma as any).banRecord.findFirst({
      where: { userId: wallet.user.id },
    });

    // If the user has ban history but NO active/unexpired FULL_SYSTEM ban remains, auto-heal user.isBanned
    if (!activeFullBan && anyBanRecord) {
      isSuspended = false;
      if ((prisma as any).user?.update) {
        await (prisma as any).user.update({
          where: { id: wallet.user.id },
          data: { isBanned: false },
        });
      }
    }
  } else if (!isSuspended && (prisma as any).banRecord) {
    const activeBan = await (prisma as any).banRecord.findFirst({
      where: {
        userId: wallet.user.id,
        isActive: true,
        scope: "FULL_SYSTEM",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
    if (activeBan && (!activeBan.expiresAt || activeBan.expiresAt > now)) {
      isSuspended = true;
    }
  }

  if (isSuspended) {
    throw new SiweAuthError("ACCOUNT_SUSPENDED", 403);
  }

  // 6. Create the session (only the token hash is persisted).
  const { rawToken } = await createSession(prisma, {
    userId: wallet.user.id,
    address: verifiedAddress,
    ipAddress: opts.ipAddress,
    userAgent: opts.userAgent,
  });

  return { userId: wallet.user.id, address: verifiedAddress, rawToken };
}
