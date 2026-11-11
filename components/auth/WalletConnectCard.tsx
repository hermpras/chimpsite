"use client";

import { useState, useEffect } from "react";
import { useConnectors } from "wagmi";
import { LogIn } from "lucide-react";
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
import { WalletIcon } from "./WalletIcons";
import { WalletModal } from "./WalletModal";

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
  const [modalOpen, setModalOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [hasInjected, setHasInjected] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const ua = navigator.userAgent || "";
      const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      const isMobileDevice =
        /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(ua) ||
        (window.innerWidth < 768 && isTouch);
      setIsMobile(isMobileDevice);

      const injectedAvailable = Boolean(
        (window as unknown as { ethereum?: unknown }).ethereum ||
        (window as unknown as { phantom?: { ethereum?: unknown } }).phantom?.ethereum
      );
      setHasInjected(injectedAvailable);
    }
  }, []);

  const handleConnectBrowserWallet = () => {
    if (isMobile && !hasInjected) {
      setModalOpen(true);
      return;
    }
    const injectedConnector =
      connectors.find((c) => c.id === "injected" || c.name.toLowerCase() === "injected") ??
      connectors[0];

    if (injectedConnector) {
      void login(injectedConnector);
    } else {
      setModalOpen(true);
    }
  };

  return (
    <>
      <Card className="rounded-2xl border border-[#163B44] bg-[#0B2026]/90 p-4 sm:p-5 shadow-sm">
        <CardHeader className="mb-3 space-y-0.5">
          <div>
            <CardTitle className="font-display text-lg uppercase tracking-wider text-[#F8F7F4]">
              Web3 Wallet
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-[#8AA8B2] mt-0.5">
              Connect your wallet to verify identity on Elysium
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-0">
          {status === "checking" && (
            <div className="flex items-center justify-center rounded-xl border border-[#163B44] bg-[#051D22] p-3 text-xs sm:text-sm text-[#8AA8B2]">
              <span>Checking session…</span>
            </div>
          )}

          {status === "authenticated" && sessionAddress && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-[#163B44] bg-[#051D22] p-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="font-mono font-bold text-[#F8F7F4] text-sm sm:text-base truncate"
                    title={sessionAddress}
                  >
                    {shortenAddress(sessionAddress)}
                  </span>
                </div>
                <p className="font-mono text-xs sm:text-[13px] text-[#8AA8B2] truncate mt-0.5">
                  {sessionAddress}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void logout()}
                className="shrink-0 self-start sm:self-auto cursor-pointer"
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
                className="shrink-0 self-start sm:self-auto gap-1.5 cursor-pointer"
              >
                <LogIn className="h-3.5 w-3.5 shrink-0" />
                <span>Sign In</span>
              </Button>
            </div>
          )}

          {(status === "signed-out" || (status !== "signing" && error)) &&
            status !== "authenticated" &&
            status !== "wallet-only" && (
              <div className="space-y-3">
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleConnectBrowserWallet}
                  className="w-full flex items-center justify-center gap-2.5 py-3 tracking-wider cursor-pointer"
                >
                  <WalletIcon name="Generic" className="h-5 w-5 shrink-0" />
                  <span>Connect Browser Wallet</span>
                </Button>

                <div className="flex items-center justify-between px-1 text-xs text-[#8AA8B2]">
                  <span>Need another device or wallet?</span>
                  <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="font-semibold text-[#34B7DD] hover:text-[#6FCDE8] hover:underline transition-colors cursor-pointer"
                  >
                    All Wallets
                  </button>
                </div>
              </div>
            )}

          {status === "signing" && (
            <div className="flex items-center justify-center rounded-xl border border-[#163B44] bg-[#051D22] p-3 text-xs sm:text-sm text-[#DBF2F9]">
              <span>{busyMessage ?? "Working…"}</span>
            </div>
          )}

          {error && status !== "signing" && (
            <button
              onClick={dismissError}
              className="flex w-full items-start rounded-xl border border-rose-500/40 bg-rose-950/40 p-2.5 text-left cursor-pointer"
              title="Dismiss"
            >
              <span className="text-xs text-rose-300">{error}</span>
            </button>
          )}
        </CardContent>
      </Card>

      <WalletModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        connectors={connectors}
        onSelect={async (connector) => {
          try {
            await login(connector);
            setModalOpen(false);
          } catch {}
        }}
        isConnecting={status === "signing"}
        busyMessage={busyMessage}
        error={error}
        onDismissError={dismissError}
      />
    </>
  );
}
