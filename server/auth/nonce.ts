/**
 * Server-side SIWE nonce issuance.
 *
 * The Prisma client is taken as a parameter (dependency injection) so this
 * logic can be unit-tested with a fake store without a live database.
 * The PrismaClient import is type-only and erased at runtime.
 */
import type { PrismaClient } from "@prisma/client";
import { generateNonce, nonceExpiresAt } from "@/lib/auth/nonce";

export interface IssuedNonce {
  nonce: string;
  expiresAt: Date;
}

export interface IssueNonceOptions {
  /**
   * Optional wallet address to bind the nonce to. Must already be normalized
   * (see lib/auth/nonce.ts normalizeAddress) — the nonce route validates this.
   * The verify endpoint accepts the nonce only for this address (or when
   * no address was bound).
   */
  address?: string;
}

/**
 * Issue a one-time SIWE nonce and persist it with an explicit expiry.
 *
 * Uniqueness: the nonce is 256-bit CSPRNG output (see lib/auth/nonce.ts)
 * and `SiweNonce.nonce` carries a UNIQUE constraint as a backstop.
 * On the astronomically unlikely collision the UNIQUE constraint raises and
 * this function throws — the route maps that to a 500 without leaking
 * details. No retry loop: a retry could mask genuine database outages.
 *
 * Any database error propagates to the caller (the route returns 500).
 */
export async function issueNonce(
  prisma: PrismaClient,
  opts?: IssueNonceOptions,
): Promise<IssuedNonce> {
  const nonce = generateNonce();
  const expiresAt = nonceExpiresAt();

  const record = await prisma.siweNonce.create({
    data: { nonce, expiresAt, address: opts?.address ?? null },
    select: { nonce: true, expiresAt: true },
  });

  return { nonce: record.nonce, expiresAt: record.expiresAt };
}
