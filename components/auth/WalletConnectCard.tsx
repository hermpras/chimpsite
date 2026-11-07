"use client";

import { Wallet, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { useConnectors } from "wagmi";
import { useSiweAuth } from "@/hooks/useSiweAuth";
import { Button } from "@/components/ui/Button";
import { shortenAddress } from "@/lib/auth/address";
import { WalletIcon } from "./WalletIcons";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/Card";

/**
 * Profile-page wallet card: clean, compact SIWE login UI.
 * Shows connection status, authenticated address, and sign-in / sign-out actions.
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
    <Card className="rounded-2xl border-zinc-800 bg-[#0c0d15] shadow-brutal-sm p-4 sm:p-5">
      <CardHeader className="mb-3 space-y-0.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-400 border border-emerald-400/30">
            <Wallet className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="font-display text-lg uppercase tracking-wider text-white">Web3 Wallet</CardTitle>
            <CardDescription className="font-mono-street text-[11px] text-zinc-400">Gasless off-chain signature verification</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-0 font-mono-street">
        {status === "checking" && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
            <span>Checking session…</span>
          </div>
        )}

        {status === "authenticated" && sessionAddress && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-white text-sm truncate">
                    {shortenAddress(sessionAddress)}
                  </span>
                  <span className="text-[10px] font-mono-street text-emerald-300 bg-emerald-950/60 border border-emerald-500/40 px-1.5 py-0.2 rounded font-semibold">
                    Signed in
                  </span>
                </div>
                <p className="font-mono text-[11px] text-zinc-500 truncate">
                  {sessionAddress}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void logout()}
              className="rounded-lg text-xs font-mono-street font-medium border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 shrink-0 self-start sm:self-auto cursor-pointer"
            >
              Sign out
            </Button>
          </div>
        )}

        {status === "wallet-only" && walletAddress && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <div>
              <p className="text-xs font-bold text-zinc-200">Wallet connected</p>
              <p className="font-mono text-xs text-amber-400 font-bold">
                {shortenAddress(walletAddress)}
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void login()}
              className="rounded-lg text-xs font-mono-street font-medium uppercase tracking-wider bg-amber-400 text-black hover:bg-amber-300 shrink-0 self-start sm:self-auto cursor-pointer shadow-brutal-sm"
            >
              Sign In with Ethereum
            </Button>
          </div>
        )}

        {(status === "signed-out" || (status !== "signing" && error)) &&
          status !== "authenticated" &&
          status !== "wallet-only" && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <div>
                  <p className="text-xs font-bold text-zinc-300">Status: Not Connected</p>
                  <p className="text-[11px] text-zinc-500">Connect wallet to sign in.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {connectors.map((connector) => (
                  <Button
                    key={connector.uid}
                    variant="outline"
                    size="sm"
                    className="flex-1 min-w-[120px] justify-center gap-2 py-2 rounded-lg border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 hover:border-amber-400/50 text-xs text-white cursor-pointer"
                    onClick={() => void login(connector)}
                  >
                    <WalletIcon
                      name={connector.name}
                      iconUrl={connector.icon}
                      className="h-4 w-4"
                    />
                    <span className="font-syne font-medium text-xs truncate">Connect {connector.name}</span>
                  </Button>
                ))}
                {connectors.length === 0 && (
                  <p className="text-center text-xs text-zinc-500 w-full py-1">
                    No wallet detected. Install MetaMask or another EVM wallet.
                  </p>
                )}
              </div>
            </div>
          )}

        {status === "signing" && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
            <span>{busyMessage ?? "Working…"}</span>
          </div>
        )}

        {error && status !== "signing" && (
          <button
            onClick={dismissError}
            className="flex w-full items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-950/40 p-2.5 text-left font-mono-street"
            title="Dismiss"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
            <span className="text-xs text-rose-300">{error}</span>
          </button>
        )}
      </CardContent>
    </Card>
  );
}
