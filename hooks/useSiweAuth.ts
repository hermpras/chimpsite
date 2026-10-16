"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useAccount,
  useChainId,
  useConnect,
  useConnectors,
  useDisconnect,
  useSignMessage,
  useSwitchChain,
  type Connector,
} from "wagmi";
import {
  buildSiweMessage,
  connectErrorMessage,
  fetchAuthConfig,
  fetchSessionStatus,
  logoutRequest,
  requestNonce,
  signingErrorMessage,
  SiweClientError,
  verifySiwe,
} from "@/lib/auth/client";

export type SiweAuthStatus =
  | "checking" // initial session check on mount
  | "signed-out" // no wallet connected, no session
  | "wallet-only" // wallet connected, no SIWE session yet
  | "signing" // busy: connecting / switching / nonce / signing / verifying
  | "authenticated";

export interface SiweAuth {
  status: SiweAuthStatus;
  /** Connected wallet address (wagmi), if any. */
  walletAddress: string | null;
  /** Address from the server session, if authenticated. */
  sessionAddress: string | null;
  userId: string | null;
  /** User-facing error message, if the last action failed. */
  error: string | null;
  /** What the hook is busy doing (shown while status === "signing"). */
  busyMessage: string | null;
  /** Full login: connect -> chain check -> nonce -> sign -> verify. */
  login: (connector?: Connector) => Promise<void>;
  /** Server logout + wallet disconnect. */
  logout: () => Promise<void>;
  dismissError: () => void;
}

/**
 * Broadcast channel (window event) that keeps every mounted `useSiweAuth`
 * instance in sync after a login or logout performed by any one of them.
 */
const AUTH_CHANGE_EVENT = "chimphood:siwe-auth-change";

function broadcastAuthChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT));
  }
}

/**
 * End-to-end SIWE authentication state machine.
 *
 * On mount it checks for an existing server session (cookie). `login()`
 * connects the wallet when needed, ensures the wallet is on an allowed
 * chain (prompting a switch), fetches a nonce bound to the address, asks
 * the wallet to sign the SIWE message, and verifies it server-side.
 * The server session (HttpOnly cookie) is the source of truth — the wallet
 * connection alone never implies authentication.
 *
 * Multiple hook instances (e.g. navbar + profile card) stay in sync:
 * `login()`/`logout()` broadcast an event and every mounted instance
 * re-validates its session against the server.
 */
export function useSiweAuth(): SiweAuth {
  const { address: walletAddress, isConnected } = useAccount();
  const currentChainId = useChainId();
  const connectors = useConnectors();
  const { connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();

  const [session, setSession] = useState<{
    address: string;
    userId: string;
  } | null>(null);
  const [checking, setChecking] = useState(true);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  /** Re-validate the local session against the server (source of truth). */
  const refreshSession = useCallback(() => {
    if (!mounted.current) return;
    setChecking(true);
    fetchSessionStatus()
      .then((s) => {
        if (!mounted.current) return;
        if (s.authenticated && s.address && s.userId) {
          setSession({ address: s.address, userId: s.userId });
        } else {
          setSession(null);
        }
      })
      .catch(() => {
        // Unreachable/unauthenticated — clear local session state.
        if (mounted.current) setSession(null);
      })
      .finally(() => {
        if (mounted.current) setChecking(false);
      });
  }, []);

  useEffect(() => {
    mounted.current = true;
    refreshSession();
    window.addEventListener(AUTH_CHANGE_EVENT, refreshSession);
    return () => {
      mounted.current = false;
      window.removeEventListener(AUTH_CHANGE_EVENT, refreshSession);
    };
  }, [refreshSession]);

  const login = useCallback(
    async (connector?: Connector) => {
      if (!mounted.current) return;
      setError(null);
      try {
        // 1. Connect the wallet when needed.
        let addr: `0x${string}` | null = walletAddress ?? null;
        let cid: number | undefined;
        if (!isConnected || !addr) {
          setBusyMessage("Connecting wallet…");
          const chosen = connector ?? connectors[0];
          if (!chosen) {
            throw new SiweClientError(
              "no_wallet",
              "No wallet found. Install MetaMask or another EVM wallet, then try again.",
            );
          }
          let connected: { accounts: readonly `0x${string}`[]; chainId: number };
          try {
            connected = await connectAsync({ connector: chosen });
          } catch (err) {
            if (process.env.NODE_ENV === "development") {
              // Safe diagnostic (dev only): error shape, never secrets.
              // Connect-step failures are provider/JSON-RPC errors — they
              // cannot contain signatures or session tokens (signing happens
              // in a later step). Distinguishes: provider not found
              // (ProviderNotFoundError), user rejection (code 4001), other.
              console.debug("[siwe] wallet connect failed", {
                connector: chosen.id,
                name: err instanceof Error ? err.name : typeof err,
                code: (err as { code?: unknown })?.code ?? null,
                message: err instanceof Error ? err.message : String(err),
              });
            }
            throw new SiweClientError(
              "connect_failed",
              // Tailor the not-detected message to the chosen wallet, except
              // for the generic injected connector where the wallet is unknown.
              connectErrorMessage(
                err,
                chosen.name === "Injected" ? undefined : chosen.name,
              ),
            );
          }
          addr = connected.accounts[0] ?? null;
          cid = connected.chainId;
          if (!addr) {
            throw new SiweClientError(
              "connect_failed",
              "Could not connect your wallet. Please try again.",
            );
          }
        }

        // 2. Ensure the wallet is on a chain the server accepts.
        // When the wallet was already connected, fall back to the live chain id.
        const config = await fetchAuthConfig();
        let chainId: number = cid ?? currentChainId;
        if (!config.allowedChainIds.includes(chainId)) {
          setBusyMessage("Switching network…");
          try {
            const switched = await switchChainAsync({
              chainId: config.allowedChainIds[0],
            });
            chainId = switched.id;
          } catch {
            throw new SiweClientError(
              "wrong_network",
              "Please switch your wallet to Ethereum mainnet and try again.",
            );
          }
        }

        // 3. Fetch a nonce bound to this address.
        setBusyMessage("Requesting sign-in…");
        const { nonce } = await requestNonce(addr);

        // 4. Ask the wallet to sign the SIWE message.
        const message = buildSiweMessage({ address: addr, chainId, nonce });
        setBusyMessage("Waiting for your signature…");
        let signature: string;
        try {
          signature = await signMessageAsync({ message });
        } catch (err) {
          throw new SiweClientError("sign_rejected", signingErrorMessage(err));
        }

        // 5. Verify server-side and establish the session.
        setBusyMessage("Verifying signature…");
        const result = await verifySiwe(message, signature);
        if (mounted.current) {
          setSession({ address: result.address, userId: result.userId });
        }
        // Sync every other mounted hook instance against the new session.
        broadcastAuthChange();
      } catch (err) {
        if (mounted.current) {
          const message =
            err instanceof SiweClientError
              ? err.message
              : "Something went wrong. Please try again.";
          setError(message);
        }
      } finally {
        if (mounted.current) setBusyMessage(null);
      }
    },
    [
      connectAsync,
      connectors,
      currentChainId,
      isConnected,
      signMessageAsync,
      switchChainAsync,
      walletAddress,
    ],
  );

  const logout = useCallback(async () => {
    if (!mounted.current) return;
    setError(null);
    setBusyMessage("Signing out…");
    try {
      await logoutRequest();
    } finally {
      try {
        await disconnectAsync();
      } catch {
        // Wallet disconnect is best-effort.
      }
      if (mounted.current) {
        setSession(null);
        setBusyMessage(null);
      }
      // Sync every other mounted hook instance: their sessions are gone too.
      broadcastAuthChange();
    }
  }, [disconnectAsync]);

  const dismissError = useCallback(() => setError(null), []);

  const status: SiweAuthStatus = checking
    ? "checking"
    : session
      ? "authenticated"
      : busyMessage
        ? "signing"
        : isConnected
          ? "wallet-only"
          : "signed-out";

  return {
    status,
    walletAddress: walletAddress ?? null,
    sessionAddress: session?.address ?? null,
    userId: session?.userId ?? null,
    error,
    busyMessage,
    login,
    logout,
    dismissError,
  };
}
