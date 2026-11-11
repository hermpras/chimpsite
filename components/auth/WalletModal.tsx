"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Connector } from "wagmi";
import { X } from "lucide-react";
import { WalletIcon } from "./WalletIcons";

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectors: readonly Connector[];
  onSelect: (connector: Connector) => void;
  isConnecting?: boolean;
  busyMessage?: string | null;
  error?: string | null;
  onDismissError?: () => void;
}

interface MobileWalletOption {
  id: string;
  name: string;
  getDeepLink: () => string;
}

export function WalletModal({
  isOpen,
  onClose,
  connectors,
  onSelect,
  isConnecting = false,
  busyMessage = null,
  error = null,
  onDismissError,
}: WalletModalProps) {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [hasInjected, setHasInjected] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
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

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen && !isConnecting) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isConnecting, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const handleCopyUrl = async () => {
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = window.location.href;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {}
      document.body.removeChild(textArea);
    }
  };

  const mobileWallets: MobileWalletOption[] = [
    {
      id: "metamask",
      name: "MetaMask",
      getDeepLink: () => {
        const dappUrl = window.location.host + window.location.pathname + window.location.search;
        return `https://metamask.app.link/dapp/${dappUrl}`;
      },
    },
    {
      id: "coinbase",
      name: "Coinbase Wallet",
      getDeepLink: () => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(window.location.href)}`,
    },
    {
      id: "trust",
      name: "Trust Wallet",
      getDeepLink: () => `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(window.location.href)}`,
    },
    {
      id: "phantom",
      name: "Phantom",
      getDeepLink: () => `https://phantom.app/ul/browse/${encodeURIComponent(window.location.href)}`,
    },
  ];

  const handleSelectMobileWallet = (wallet: MobileWalletOption) => {
    if (hasInjected) {
      const match = connectors.find((c) =>
        c.name.toLowerCase().includes(wallet.id) ||
        (wallet.id === "metamask" && c.id === "metaMask")
      );
      if (match) {
        onSelect(match);
        return;
      }
    }
    window.location.href = wallet.getDeepLink();
  };

  if (!isOpen || !mounted) return null;

  const showMobileAppList = isMobile && !hasInjected;

  const modalContent = (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Dark Blurred Backdrop */}
      <div
        className="fixed inset-0 bg-[#04181C]/85 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        onClick={() => {
          if (!isConnecting) onClose();
        }}
      />

      {/* Modal Dialog Content - Centered & Responsive */}
      <div className="relative z-10 my-auto w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden rounded-2xl border border-[#1E4D5A] bg-[#071F24] p-5 sm:p-6 shadow-[0_20px_60px_rgba(4,24,28,0.9)] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#163B44] pb-4">
          <h3 className="font-display text-xl sm:text-2xl uppercase tracking-wider text-[#F8F7F4]">
            CONNECT WALLET
          </h3>
          <button
            onClick={onClose}
            disabled={isConnecting}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#163B44] text-[#8AA8B2] hover:border-[#34B7DD]/60 hover:bg-[#102B33] hover:text-[#DBF2F9] transition-colors disabled:opacity-50 cursor-pointer"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mt-4 flex items-start justify-between gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-left">
            <div className="flex-1">
              <p className="text-xs font-medium text-red-300">{error}</p>
            </div>
            {onDismissError && (
              <button
                onClick={onDismissError}
                className="text-xs text-red-400 hover:text-red-200 uppercase font-medium cursor-pointer"
              >
                Dismiss
              </button>
            )}
          </div>
        )}

        {/* Connecting Spinner Overlay State */}
        {isConnecting ? (
          <div className="py-10 flex flex-col items-center justify-center text-center">
            <div className="relative mb-4">
              <div className="h-14 w-14 rounded-full border-2 border-[#34B7DD]/20 border-t-[#34B7DD] animate-spin" />
            </div>
            <p className="font-display text-lg uppercase tracking-wide text-[#F8F7F4]">
              {busyMessage ?? "Awaiting Wallet Signature..."}
            </p>
            <p className="mt-1 text-xs text-[#8AA8B2] uppercase">
              Approve connection in your wallet
            </p>
          </div>
        ) : (
          /* List of Wallet Connectors / Mobile Apps */
          <div className="mt-5 space-y-2.5 max-h-[380px] overflow-y-auto flex-1 min-h-0 pr-0.5">
            {showMobileAppList ? (
              <>
                {mobileWallets.map((wallet) => (
                  <button
                    key={wallet.id}
                    onClick={() => handleSelectMobileWallet(wallet)}
                    className="group flex w-full items-center justify-between rounded-xl border border-[#163B44] bg-[#0B2026]/90 p-3.5 text-left transition-all duration-200 hover:border-[#34B7DD]/70 hover:bg-[#102B33] hover:shadow-[0_0_20px_rgba(52,183,221,0.15)] active:scale-[0.99] cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#163B44] bg-[#04181C] p-1.5 transition-transform group-hover:scale-105">
                        <WalletIcon
                          name={wallet.name}
                          className="h-7 w-7"
                        />
                      </div>
                      <p className="text-sm font-semibold text-[#F8F7F4] group-hover:text-[#6FCDE8] transition-colors">
                        {wallet.name}
                      </p>
                    </div>

                    <span className="text-xs font-bold text-[#8AA8B2] group-hover:text-[#34B7DD] transition-colors">
                      CONNECT →
                    </span>
                  </button>
                ))}

                <div className="mt-3 rounded-xl border border-[#163B44] bg-[#051D22] p-3 text-center">
                  <p className="text-xs text-[#8AA8B2] leading-relaxed">
                    Browsing on mobile? Tap a wallet to open the app, or copy the link to paste in your wallet&apos;s browser.
                  </p>
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="mt-2.5 w-full rounded-lg border border-[#1E4D5A] bg-[#071F24] py-2 text-xs font-semibold uppercase tracking-wider text-[#34B7DD] hover:border-[#34B7DD]/60 hover:text-white transition-colors cursor-pointer"
                  >
                    {copied ? "Link Copied to Clipboard" : "Copy Site Link"}
                  </button>
                </div>
              </>
            ) : connectors.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#163B44] p-6 text-center text-xs text-[#8AA8B2]">
                No web3 wallets detected in your browser. Install MetaMask, Rabby, or Coinbase Wallet.
              </div>
            ) : (
              connectors.map((connector) => {
                const displayName =
                  connector.name.toLowerCase() === "injected"
                    ? "Browser Wallet"
                    : connector.name;

                return (
                  <button
                    key={connector.uid}
                    onClick={() => onSelect(connector)}
                    className="group flex w-full items-center justify-between rounded-xl border border-[#163B44] bg-[#0B2026]/90 p-3.5 text-left transition-all duration-200 hover:border-[#34B7DD]/70 hover:bg-[#102B33] hover:shadow-[0_0_20px_rgba(52,183,221,0.15)] active:scale-[0.99] cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#163B44] bg-[#04181C] p-1.5 transition-transform group-hover:scale-105">
                        <WalletIcon
                          name={connector.name}
                          iconUrl={connector.icon}
                          className="h-7 w-7"
                        />
                      </div>
                      <p className="text-sm font-semibold text-[#F8F7F4] group-hover:text-[#6FCDE8] transition-colors">
                        {displayName}
                      </p>
                    </div>

                    <span className="text-xs font-bold text-[#8AA8B2] group-hover:text-[#34B7DD] transition-colors">
                      CONNECT →
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
