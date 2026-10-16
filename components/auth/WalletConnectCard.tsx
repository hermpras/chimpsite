"use client";

import { Wallet, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { useConnectors } from "wagmi";
import { useSiweAuth } from "@/hooks/useSiweAuth";
import { Button } from "@/components/ui/Button";
import { shortenAddress } from "@/lib/auth/address";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/Card";

/**
 * Profile-page wallet card: the real SIWE login UI replacing the
 * Stage 1 placeholder. Shows connection status, the authenticated address,
 * and sign-in / sign-out actions driven by useSiweAuth.
 */
export function WalletConnectCard() {
  const {
    status,
    walletAddress,
    sessionAddress,
    userId,
    error,
    busyMessage,
    login,
    logout,
    dismissError,
  } = useSiweAuth();
  const connectors = useConnectors();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>Web3 Wallet</CardTitle>
            <CardDescription>Sign in with Ethereum (SIWE)</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "checking" && (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-gray-800 bg-gray-900/40 p-6 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking session…
          </div>
        )}

        {status === "authenticated" && sessionAddress && (
          <>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Signed in
              </p>
              <p className="mt-2 font-mono text-sm text-gray-200">
                {shortenAddress(sessionAddress)}
              </p>
              <p className="mt-1 truncate font-mono text-xs text-gray-500">
                {sessionAddress}
              </p>
              {userId && (
                <p className="mt-1 font-mono text-[11px] text-gray-600">user: {userId}</p>
              )}
            </div>
            <Button variant="outline" className="w-full" onClick={() => void logout()}>
              Sign out
            </Button>
          </>
        )}

        {status === "wallet-only" && walletAddress && (
          <>
            <div className="rounded-lg border border-dashed border-gray-700 bg-gray-900/40 p-4 text-center">
              <p className="text-sm font-medium text-gray-300">Wallet connected</p>
              <p className="mt-1 font-mono text-xs text-gray-500">
                {shortenAddress(walletAddress)}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Sign a message to prove ownership and start your session.
              </p>
            </div>
            <Button variant="primary" className="w-full" onClick={() => void login()}>
              Sign In with Ethereum
            </Button>
          </>
        )}

        {(status === "signed-out" || (status !== "signing" && error)) &&
          status !== "authenticated" &&
          status !== "wallet-only" && (
            <>
              <div className="rounded-lg border border-dashed border-gray-700 bg-gray-900/40 p-4 text-center">
                <p className="text-sm font-medium text-gray-400">Status: Not Connected</p>
                <p className="mt-1 text-xs text-gray-500">
                  Connect your wallet, then sign in with Ethereum.
                </p>
              </div>
              <div className="space-y-2">
                {connectors.map((connector) => (
                  <Button
                    key={connector.uid}
                    variant="outline"
                    className="w-full"
                    onClick={() => void login(connector)}
                  >
                    Connect {connector.name}
                  </Button>
                ))}
                {connectors.length === 0 && (
                  <p className="text-center text-xs text-gray-500">
                    No wallet detected. Install MetaMask or another EVM wallet.
                  </p>
                )}
              </div>
            </>
          )}

        {status === "signing" && (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-gray-800 bg-gray-900/40 p-6 text-sm text-gray-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            {busyMessage ?? "Working…"}
          </div>
        )}

        {error && status !== "signing" && (
          <button
            onClick={dismissError}
            className="flex w-full items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-left"
            title="Dismiss"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <span className="text-xs text-red-300">{error}</span>
          </button>
        )}
      </CardContent>
    </Card>
  );
}
