/**
 * Server-side SIWE (Sign-In with Ethereum) message verification.
 *
 * This module MUST only be imported in server-side code (API routes).
 * It validates the full SIWE message against server-controlled expectations:
 *   - domain (prevents phishing replay)
 *   - URI
 *   - nonce (must match DB-stored nonce)
 *   - expiration (if present in the message)
 *   - issuedAt freshness (rejected when too old or too far in the future)
 *   - chain ID allowlist (when `allowedChainIds` is provided)
 *   - cryptographic signature
 *
 * The verified address is returned normalized to lowercase.
 * Any validation failure throws a descriptive Error.
 */
import { SiweMessage } from "siwe";
import { normalizeAddress } from "./address";

export interface SiweVerifyParams {
  /** The EIP-4361 SIWE message string. */
  message: string;
  /** Hex-encoded EIP-191 personal_sign signature. */
  signature: string;
  /** The nonce that was issued by the server for this session. */
  nonce: string;
  /** Expected domain (e.g. "localhost" or "chimphood.xyz"). */
  expectedDomain: string;
  /** Expected URI (e.g. "http://localhost:3000"). */
  expectedUri: string;
  /**
   * Optional allowlist of EVM chain IDs. When provided, a message whose
   * chain ID is not in the list is rejected with SIWE_CHAIN_NOT_ALLOWED.
   */
  allowedChainIds?: number[];
}

export interface SiweVerifyResult {
  /** Normalized (lowercase) EVM address of the signer. */
  address: string;
  /** EVM chain ID from the SIWE message (defaults to 1 if absent). */
  chainId: number;
}

/**
 * Machine-readable SIWE verification failure.
 *
 * `reason` is a stable `SIWE_*` category (e.g. `SIWE_DOMAIN_MISMATCH`) that
 * is safe to write to server logs — it never contains the signature,
 * cookie, private key, or any secret. The human-readable message is
 * server-side only and must never be returned to the client.
 */
export class SiweVerifyError extends Error {
  reason: string;
  constructor(reason: string, detail: string) {
    super(`${reason}: ${detail}`);
    this.name = "SiweVerifyError";
    this.reason = reason;
  }
}

/**
 * Clock-skew tolerance for a SIWE `issuedAt` timestamp in the future.
 * Client clocks are unreliable; 5 minutes avoids false rejections.
 */
const ISSUED_AT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
/**
 * Maximum age of a SIWE `issuedAt` timestamp. The message is created after
 * the nonce is issued, so an older `issuedAt` signals a stale or replayed
 * message. Generous relative to the 10-minute server nonce TTL.
 */
const ISSUED_AT_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * Verify a SIWE message + signature on the server.
 *
 * Policy:
 *  - Chain ID allowlisting is enforced when `allowedChainIds` is provided
 *    (anything not in the list is rejected); otherwise any chain ID is
 *    accepted and stored for audit.
 *  - Expiration in the message is validated if present.
 *  - `issuedAt` is validated against a freshness window.
 *  - The nonce is NOT consumed here — the caller (API route) is responsible
 *    for marking the nonce consumed in the database.
 */
export async function verifySiweMessage(
  params: SiweVerifyParams,
): Promise<SiweVerifyResult> {
  const { message, signature, nonce, expectedDomain, expectedUri } = params;

  // Parse
  let siweMsg: SiweMessage;
  try {
    siweMsg = new SiweMessage(message);
  } catch {
    throw new SiweVerifyError("SIWE_INVALID_MESSAGE", "Could not parse SIWE message.");
  }

  // Validate domain (anti-phishing)
  if (siweMsg.domain !== expectedDomain) {
    throw new SiweVerifyError(
      "SIWE_DOMAIN_MISMATCH",
      `Expected '${expectedDomain}', got '${siweMsg.domain}'.`,
    );
  }

  // Validate URI
  if (siweMsg.uri !== expectedUri) {
    throw new SiweVerifyError(
      "SIWE_URI_MISMATCH",
      `Expected '${expectedUri}', got '${siweMsg.uri}'.`,
    );
  }

  // Validate nonce matches what we passed in
  if (siweMsg.nonce !== nonce) {
    throw new SiweVerifyError(
      "SIWE_NONCE_MISMATCH",
      "Nonce does not match issued value.",
    );
  }

  // Validate message-level expiration (separate from DB nonce expiry)
  if (siweMsg.expirationTime) {
    const expiry = new Date(siweMsg.expirationTime);
    if (expiry < new Date()) {
      throw new SiweVerifyError("SIWE_MESSAGE_EXPIRED", "The SIWE message has expired.");
    }
  }

  // Validate issuedAt freshness: reject timestamps too far in the future
  // (beyond clock-skew tolerance) or older than the freshness window. The
  // DB nonce TTL already bounds replay, but a stale issuedAt is a strong
  // signal of message reuse or a misbehaving client.
  if (siweMsg.issuedAt) {
    const issuedAtMs = new Date(siweMsg.issuedAt).getTime();
    const nowMs = Date.now();
    if (
      Number.isNaN(issuedAtMs) ||
      issuedAtMs > nowMs + ISSUED_AT_FUTURE_TOLERANCE_MS ||
      issuedAtMs < nowMs - ISSUED_AT_MAX_AGE_MS
    ) {
      throw new SiweVerifyError(
        "SIWE_ISSUED_AT_INVALID",
        "The SIWE message issuedAt is outside the freshness window.",
      );
    }
  }

  // Cryptographic signature verification
  let result: Awaited<ReturnType<SiweMessage["verify"]>>;
  try {
    result = await siweMsg.verify({ signature, nonce }, { suppressExceptions: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signature verification error.";
    throw new SiweVerifyError("SIWE_VERIFICATION_FAILED", msg);
  }

  if (!result.success) {
    throw new SiweVerifyError("SIWE_VERIFICATION_FAILED", "Signature is invalid.");
  }

  const address = normalizeAddress(siweMsg.address);
  const chainId = siweMsg.chainId ?? 1;

  // Chain allowlist (rejects chains the deployment does not serve)
  if (params.allowedChainIds && !params.allowedChainIds.includes(chainId)) {
    throw new SiweVerifyError(
      "SIWE_CHAIN_NOT_ALLOWED",
      `Chain ID ${chainId} is not allowed.`,
    );
  }

  return { address, chainId };
}
