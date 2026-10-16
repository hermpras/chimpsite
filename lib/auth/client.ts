/**
 * Client-side SIWE helpers (browser only).
 *
 * Thin wrappers around the auth API routes plus SIWE message construction.
 * All server rejections surface as SiweClientError with a user-facing
 * message — the raw server response is never shown to the user.
 */
import { SiweMessage } from "siwe";

/** Statement embedded in every ChimpHood SIWE message. */
export const SIWE_STATEMENT = "Sign in to ChimpHood";

/** Machine-readable client error with a user-facing message. */
export class SiweClientError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SiweClientError";
    this.code = code;
  }
}

export interface AuthConfig {
  allowedChainIds: number[];
}

/** Public login configuration (chain allowlist). No secrets. */
export async function fetchAuthConfig(): Promise<AuthConfig> {
  let res: Response;
  try {
    res = await fetch("/api/auth/config", { method: "GET" });
  } catch {
    throw new SiweClientError(
      "network_error",
      "Could not reach the server. Check your connection and try again.",
    );
  }
  if (!res.ok) {
    throw new SiweClientError(
      "auth_config_failed",
      "Could not load the login configuration. Please try again.",
    );
  }
  const body = (await res.json()) as { allowedChainIds?: unknown };
  if (
    !Array.isArray(body.allowedChainIds) ||
    body.allowedChainIds.length === 0 ||
    !body.allowedChainIds.every((n) => Number.isInteger(n))
  ) {
    throw new SiweClientError(
      "auth_config_failed",
      "Could not load the login configuration. Please try again.",
    );
  }
  return { allowedChainIds: body.allowedChainIds as number[] };
}

/** Request a one-time nonce bound to the connected address. */
export async function requestNonce(
  address: string,
): Promise<{ nonce: string; expiresAt: string }> {
  let res: Response;
  try {
    res = await fetch("/api/auth/nonce", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address }),
    });
  } catch {
    throw new SiweClientError(
      "network_error",
      "Could not reach the server. Check your connection and try again.",
    );
  }
  if (res.status === 429) {
    throw new SiweClientError(
      "rate_limited",
      "Too many attempts. Please wait a minute and try again.",
    );
  }
  if (!res.ok) {
    throw new SiweClientError(
      "nonce_failed",
      "Could not start the sign-in. Please try again.",
    );
  }
  const body = (await res.json()) as { nonce?: unknown; expiresAt?: unknown };
  if (typeof body.nonce !== "string" || typeof body.expiresAt !== "string") {
    throw new SiweClientError(
      "nonce_failed",
      "Could not start the sign-in. Please try again.",
    );
  }
  return { nonce: body.nonce, expiresAt: body.expiresAt };
}

/**
 * Build the EIP-4361 SIWE message the wallet will sign.
 *
 * domain/uri come from the current page origin — they must match the
 * server's SIWE_DOMAIN/SIWE_URI exactly or verification fails. The message
 * expiry mirrors the server nonce TTL (10 minutes).
 */
export function buildSiweMessage(opts: {
  address: string;
  chainId: number;
  nonce: string;
}): string {
  const message = new SiweMessage({
    domain: window.location.host,
    address: opts.address,
    statement: SIWE_STATEMENT,
    uri: window.location.origin,
    version: "1",
    chainId: opts.chainId,
    nonce: opts.nonce,
    issuedAt: new Date().toISOString(),
    expirationTime: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  return message.prepareMessage();
}

/** Submit the signed SIWE message and establish the server session. */
export async function verifySiwe(
  message: string,
  signature: string,
): Promise<{ address: string; userId: string }> {
  let res: Response;
  try {
    res = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
  } catch {
    throw new SiweClientError(
      "network_error",
      "Could not reach the server. Check your connection and try again.",
    );
  }
  if (res.status === 429) {
    throw new SiweClientError(
      "rate_limited",
      "Too many attempts. Please wait a minute and try again.",
    );
  }
  if (res.status === 403) {
    throw new SiweClientError("suspended", "This account has been suspended.");
  }
  if (!res.ok) {
    // 400/401/500: malformed, expired/replayed nonce, bad signature,
    // wrong domain/URI/chain, or server error — one generic message.
    throw new SiweClientError(
      "verify_failed",
      "Sign-in failed. Your request may have expired — please try again.",
    );
  }
  const body = (await res.json()) as { address?: unknown; userId?: unknown };
  if (typeof body.address !== "string" || typeof body.userId !== "string") {
    throw new SiweClientError("verify_failed", "Sign-in failed. Please try again.");
  }
  return { address: body.address, userId: body.userId };
}

export interface SessionStatus {
  authenticated: boolean;
  address?: string;
  userId?: string;
}

/** Check whether a server session already exists (e.g. on page load). */
export async function fetchSessionStatus(): Promise<SessionStatus> {
  let res: Response;
  try {
    res = await fetch("/api/auth/session", { method: "GET" });
  } catch {
    return { authenticated: false };
  }
  if (!res.ok) return { authenticated: false };
  const body = (await res.json()) as {
    authenticated?: unknown;
    address?: unknown;
    userId?: unknown;
  };
  if (body.authenticated !== true) return { authenticated: false };
  return {
    authenticated: true,
    address: typeof body.address === "string" ? body.address : undefined,
    userId: typeof body.userId === "string" ? body.userId : undefined,
  };
}

/** Best-effort server logout (revokes the session, clears the cookie). */
export async function logoutRequest(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // Best-effort: local state is cleared regardless.
  }
}

/**
 * Map a wallet connection error to a user-facing message.
 * `walletName` (e.g. "MetaMask") tailors the not-detected message so the
 * user knows exactly which wallet was not found; omit it for the generic
 * injected connector where the wallet is unknown.
 */
export function connectErrorMessage(err: unknown, walletName?: string): string {
  const message = err instanceof Error ? err.message : "";
  if (/not found|not installed|no provider|not detected/i.test(message)) {
    return walletName
      ? `${walletName} was not detected. Install ${walletName}, then try again.`
      : "No wallet detected. Install MetaMask or another EVM wallet, then try again.";
  }
  const code = (err as { code?: unknown })?.code;
  if (code === 4001 || /rejected|denied|cancelled|canceled/i.test(message)) {
    return "The connection request was cancelled in your wallet.";
  }
  return "Could not connect your wallet. Please try again.";
}

/** Map a wallet signing error to a user-facing message. */
export function signingErrorMessage(err: unknown): string {
  const code = (err as { code?: unknown })?.code;
  if (code === 4001) return "The signature request was cancelled in your wallet.";
  const message = err instanceof Error ? err.message : "";
  if (/rejected|denied|cancelled|canceled/i.test(message)) {
    return "The signature request was cancelled in your wallet.";
  }
  return "Could not get a signature from your wallet. Please try again.";
}
