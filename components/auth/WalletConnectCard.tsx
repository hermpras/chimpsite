"use client";

import { useState, useEffect } from "react";
import { useConnectors, type Connector } from "wagmi";
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

  const handleConnect = (connector: Connector) => {
    if (isMobile && !hasInjected) {
      const name = connector.name.toLowerCase();
      const dappUrl = window.location.host + window.location.pathname + window.location.search;
      const fullUrl = window.location.href;

      if (name.includes("metamask")) {
        window.location.href = `https://metamask.app.link/dapp/${dappUrl}`;
        return;
      }
      if (name.includes("coinbase")) {
        window.location.href = `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(fullUrl)}`;
        return;
      }
      if (name.includes("phantom")) {
        window.location.href = `https://phantom.app/ul/browse/${encodeURIComponent(fullUrl)}`;
        return;
      }
      if (name.includes("trust")) {
        window.location.href = `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(fullUrl)}`;
        return;
      }
      // If connector cannot be deep-linked directly, open the full modal
      setModalOpen(true);
      return;
    }

    void login(connector);
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
                <span>Sign In with Ethereum</span>
              </Button>
            </div>
          )}

          {(status === "signed-out" || (status !== "signing" && error)) &&
            status !== "authenticated" &&
            status !== "wallet-only" && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  {connectors.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => setModalOpen(true)}
                      className="group flex flex-1 min-w-[120px] items-center justify-center gap-2 rounded-xl border border-[#163B44] bg-[#071F24] px-4 py-2.5 text-xs sm:text-sm font-semibold tracking-wide text-[#DBF2F9] transition-all hover:border-[#34B7DD]/70 hover:bg-[#102B33] hover:text-white hover:shadow-[0_0_15px_rgba(52,183,221,0.15)] active:scale-[0.98] cursor-pointer"
                    >
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#04181C] p-0.5 transition-transform group-hover:scale-105">
                        <WalletIcon name="Generic" className="h-4 w-4 shrink-0" />
                      </div>
                      <span>Connect</span>
                    </button>
                  ) : (
                    connectors.map((connector) => (
                      <button
                        key={connector.uid}
                        type="button"
                        onClick={() => handleConnect(connector)}
                        title={connector.name}
                        aria-label={`Connect with ${connector.name}`}
                        className="group flex flex-1 min-w-[100px] sm:min-w-[120px] items-center justify-center gap-2 rounded-xl border border-[#163B44] bg-[#071F24] px-3.5 py-2.5 text-xs sm:text-sm font-semibold tracking-wide text-[#DBF2F9] transition-all hover:border-[#34B7DD]/70 hover:bg-[#102B33] hover:text-white hover:shadow-[0_0_15px_rgba(52,183,221,0.15)] active:scale-[0.98] cursor-pointer"
                      >
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#04181C] p-0.5 transition-transform group-hover:scale-105">
                          <WalletIcon
                            name={connector.name}
                            iconUrl={connector.icon}
                            className="h-4 w-4 shrink-0"
                          />
                        </div>
                        <span>Connect</span>
                      </button>
                    ))
                  )}
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
