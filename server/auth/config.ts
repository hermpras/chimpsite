/**
 * Server-side SIWE configuration, resolved from the environment.
 *
 * SIWE_DOMAIN and SIWE_URI are REQUIRED and fail closed when unset: the
 * verify endpoint refuses to operate rather than deriving the expected
 * domain/URI from request headers, which would be spoofable.
 *
 * ALLOWED_CHAIN_IDS is optional and defaults to [1] (Ethereum mainnet),
 * consistent with DEC-006 (chainId retained as an EVM network reference,
 * default 1). Override with a comma-separated list, e.g. "1,137,8453".
 */

export interface SiweConfig {
  /** Expected SIWE domain, e.g. "localhost:3000" or "chimphood.xyz". */
  domain: string;
  /** Expected SIWE URI, e.g. "http://localhost:3000" or "https://chimphood.xyz". */
  uri: string;
  /** EVM chain IDs accepted for login. */
  allowedChainIds: number[];
}

/** Default allowlist when ALLOWED_CHAIN_IDS is unset (see DEC-006). */
export const DEFAULT_ALLOWED_CHAIN_IDS = [1];

/** Parse ALLOWED_CHAIN_IDS (comma-separated positive integers), default [1]. */
export function getAllowedChainIds(): number[] {
  const raw = process.env.ALLOWED_CHAIN_IDS?.trim();
  if (!raw) return [...DEFAULT_ALLOWED_CHAIN_IDS];
  const ids = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) {
    throw new Error("SIWE misconfigured: ALLOWED_CHAIN_IDS contains no valid chain IDs.");
  }
  return [...new Set(ids)];
}

/** Resolve the full SIWE config. Throws when SIWE_DOMAIN/SIWE_URI are unset. */
export function getSiweConfig(): SiweConfig {
  const domain = process.env.SIWE_DOMAIN?.trim();
  const uri = process.env.SIWE_URI?.trim();
  if (!domain || !uri) {
    throw new Error(
      "SIWE misconfigured: SIWE_DOMAIN and SIWE_URI environment variables must be set.",
    );
  }
  return { domain, uri, allowedChainIds: getAllowedChainIds() };
}
