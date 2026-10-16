/**
 * EVM address normalization utilities.
 *
 * SECURITY: All wallet addresses must be normalized to lowercase before any
 * database query or persistence. Never trust a browser-supplied address string
 * without validation and normalization.
 */

/** Regex matching a valid 0x-prefixed 40-hex-char EVM address. */
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Validate and normalize an EVM address to lowercase hex.
 * Throws if the input does not match the expected format.
 */
export function normalizeAddress(address: string): string {
  const trimmed = address.trim();
  if (!EVM_ADDRESS_RE.test(trimmed)) {
    throw new Error(`Invalid EVM address format: "${trimmed}"`);
  }
  return trimmed.toLowerCase();
}

/**
 * Return a shortened address for display: 0x1234...abcd
 * Only call with a value that has already been validated.
 */
export function shortenAddress(address: string): string {
  const norm = normalizeAddress(address);
  return `${norm.slice(0, 6)}...${norm.slice(-4)}`;
}
