"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
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
    error,
    busyMessage,
    login,
    logout,
    dismissError,
  } = useSiweAuth();
  const connectors = useConnectors();

  return (
    <Card className="rounded-2xl border border-[#163B44] bg-[#0B2026]/90 p-4 sm:p-5 shadow-sm">
      <CardHeader className="mb-3 space-y-0.5">
        <div>
          <CardTitle className="font-display text-lg uppercase tracking-wider text-[#F8F7F4]">Web3 Wallet</CardTitle>
          <CardDescription className="text-xs sm:text-sm text-[#8AA8B2] mt-0.5">Gasless off-chain signature verification on Elysium L2</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-0">
        {status === "checking" && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-[#163B44] bg-[#051D22] p-3 text-xs sm:text-sm text-[#8AA8B2]">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#34B7DD]" />
            <span>Checking session…</span>
          </div>
        )}

        {status === "authenticated" && sessionAddress && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-[#163B44] bg-[#051D22] p-3.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-[#F8F7F4] text-sm sm:text-base truncate" title={sessionAddress}>
                    {shortenAddress(sessionAddress)}
                  </span>
                  <span className="text-xs font-mono text-emerald-300 bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 rounded font-semibold">
                    Signed in
                  </span>
                </div>
                <p className="font-mono text-xs sm:text-[13px] text-[#8AA8B2] truncate mt-0.5">
                  {sessionAddress}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void logout()}
              className="rounded-lg text-xs sm:text-sm font-semibold border-[#163B44] bg-[#102B33] hover:bg-[#163B44] hover:text-white text-[#DBF2F9] shrink-0 self-start sm:self-auto cursor-pointer"
            >
              Sign out
            </Button>
          </div>
        )}

        {status === "wallet-only" && walletAddress && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-[#163B44] bg-[#051D22] p-3">
            <div>
              <p className="text-xs sm:text-sm font-bold text-[#DBF2F9]">Wallet connected</p>
              <p className="font-mono text-xs sm:text-sm text-[#34B7DD] font-bold">
                {shortenAddress(walletAddress)}
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void login()}
              className="group relative overflow-hidden rounded-xl border border-[#6FCDE8]/40 bg-gradient-to-r from-[#34B7DD] via-[#46C4E9] to-[#34B7DD] px-4 py-2 font-display text-xs sm:text-sm font-black uppercase tracking-wider text-[#04181C] shadow-[0_0_16px_rgba(52,183,221,0.35)] transition-all duration-300 hover:shadow-[0_0_26px_rgba(52,183,221,0.65)] hover:scale-[1.03] active:scale-[0.97] shrink-0 self-start sm:self-auto cursor-pointer"
            >
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 ease-in-out group-hover:translate-x-full" />
              <span>Sign In with Ethereum</span>
            </Button>
          </div>
        )}

        {(status === "signed-out" || (status !== "signing" && error)) &&
          status !== "authenticated" &&
          status !== "wallet-only" && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#163B44] bg-[#051D22] p-3">
                <div>
                  <p className="text-xs sm:text-sm font-bold text-[#DBF2F9]">Status: Not Connected</p>
                  <p className="text-xs sm:text-[13px] text-[#8AA8B2]">Connect wallet to sign in.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {connectors.map((connector) => (
                  <Button
                    key={connector.uid}
                    variant="outline"
                    size="sm"
                    className="flex-1 min-w-[120px] justify-center gap-2 py-2 rounded-lg border-[#163B44] bg-[#102B33]/80 hover:bg-[#163B44] hover:border-[#34B7DD]/60 text-xs sm:text-sm text-[#DBF2F9] cursor-pointer"
                    onClick={() => void login(connector)}
                  >
                    <WalletIcon
                      name={connector.name}
                      iconUrl={connector.icon}
                      className="h-4 w-4"
                    />
                    <span className="font-semibold text-xs sm:text-sm truncate">Connect {connector.name}</span>
                  </Button>
                ))}
                {connectors.length === 0 && (
                  <p className="text-center text-xs sm:text-sm text-[#8AA8B2] w-full py-1">
                    No wallet detected. Install MetaMask or another EVM wallet.
                  </p>
                )}
              </div>
            </div>
          )}

        {status === "signing" && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-[#163B44] bg-[#051D22] p-3 text-xs sm:text-sm text-[#DBF2F9]">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#34B7DD]" />
            <span>{busyMessage ?? "Working…"}</span>
          </div>
        )}

        {error && status !== "signing" && (
          <button
            onClick={dismissError}
            className="flex w-full items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-950/40 p-2.5 text-left"
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
