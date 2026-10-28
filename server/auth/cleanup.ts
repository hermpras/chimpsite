/**
 * Server-side cleanup service for expired authentication records (Task 2-C).
 *
 * Removes:
 * 1. Expired SIWE nonces (`SiweNonce` where `expiresAt < now`).
 *    Both consumed and unconsumed expired nonces are deleted — once expired,
 *    a nonce can never satisfy the consume query (which requires `expiresAt > now`).
 *    Valid, unconsumed nonces (expiresAt >= now) are never touched.
 * 2. Expired, non-revoked auth sessions (`AuthSession` where `expiresAt < now`
 *    AND `revokedAt IS NULL`). Already-revoked sessions are excluded to avoid
 *    double-counting and because they may still be needed for audit forensics.
 *
 * Preserves:
 * 1. Unexpired nonces (expiresAt >= now) — live login attempts.
 * 2. Active, unexpired sessions (expiresAt >= now).
 * 3. All unrelated tables and records.
 *
 * The Prisma client is taken as a parameter (dependency injection) so this
 * logic can be unit-tested without a live database.
 */
import type { PrismaClient } from "@prisma/client";

export interface CleanupAuthResult {
  deletedNonces: number;
  deletedSessions: number;
}

/**
 * Delete expired SiweNonce and AuthSession records.
 *
 * Both operations run in parallel — neither depends on the other and
 * each is index-friendly (expiresAt indexes exist on both tables per schema).
 */
export async function cleanupExpiredAuth(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<CleanupAuthResult> {
  const [deletedNoncesResult, deletedSessionsResult] = await Promise.all([
    prisma.siweNonce.deleteMany({
      where: {
        expiresAt: { lt: now },
      },
    }),
    prisma.authSession.deleteMany({
      where: {
        expiresAt: { lt: now },
        revokedAt: null,
      },
    }),
  ]);

  return {
    deletedNonces: deletedNoncesResult.count,
    deletedSessions: deletedSessionsResult.count,
  };
}
