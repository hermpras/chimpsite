"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, AlertCircle } from "lucide-react";
import type { Connector } from "wagmi";
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

  useEffect(() => {
    setMounted(true);
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

  if (!isOpen || !mounted) return null;

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
          <div>
            <h3 className="font-display text-2xl uppercase tracking-wider text-[#F8F7F4]">
              CONNECT WALLET
            </h3>
            <p className="text-[10px] text-[#8AA8B2] uppercase tracking-widest mt-0.5">
              Select your Ethereum identity provider
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isConnecting}
            className="rounded-lg border border-[#163B44] p-2 text-[#8AA8B2] hover:border-[#34B7DD]/60 hover:bg-[#102B33] hover:text-[#DBF2F9] transition-colors disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-left">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-medium text-red-300">{error}</p>
            </div>
            {onDismissError && (
              <button
                onClick={onDismissError}
                className="text-xs text-red-400 hover:text-red-200 uppercase font-medium"
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
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-[#34B7DD] animate-spin" />
              </div>
            </div>
            <p className="font-display text-lg uppercase tracking-wide text-[#F8F7F4]">
              {busyMessage ?? "Awaiting Wallet Signature..."}
            </p>
            <p className="mt-1 text-xs text-[#8AA8B2] uppercase">
              Approve connection in your browser extension
            </p>
          </div>
        ) : (
          /* List of Wallet Connectors with Logos */
          <div className="mt-5 space-y-2.5 max-h-[380px] overflow-y-auto flex-1 min-h-0 pr-0.5">
            {connectors.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#163B44] p-6 text-center text-xs text-[#8AA8B2]">
                No web3 wallets detected in your browser. Install MetaMask, Rabby, or Coinbase Wallet.
              </div>
            ) : (
              connectors.map((connector) => (
                <button
                  key={connector.uid}
                  onClick={() => onSelect(connector)}
                  className="group flex w-full items-center justify-between rounded-xl border border-[#163B44] bg-[#0B2026]/90 p-3.5 text-left transition-all duration-200 hover:border-[#34B7DD]/70 hover:bg-[#102B33] hover:shadow-[0_0_20px_rgba(52,183,221,0.15)] active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#163B44] bg-[#04181C] p-1.5 transition-transform group-hover:scale-105">
                      <WalletIcon
                        name={connector.name}
                        iconUrl={connector.icon}
                        className="h-7 w-7"
                      />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#F8F7F4] group-hover:text-[#6FCDE8] transition-colors">
                        {connector.name}
                      </p>
                      <p className="text-[10px] text-[#8AA8B2] uppercase">
                        {connector.name.toLowerCase().includes("injected")
                          ? "Default Browser Provider"
                          : "EIP-6963 Verified"}
                      </p>
                    </div>
                  </div>

                  <span className="text-[11px] font-semibold text-[#8AA8B2] group-hover:text-[#34B7DD] transition-colors">
                    CONNECT →
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {/* Footer info */}
        <div className="mt-5 border-t border-[#163B44] pt-3.5 text-center">
          <p className="text-[10px] text-[#8AA8B2] uppercase">
            NON-CUSTODIAL • POWERED BY SIWE & ELYSIUM L2
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
