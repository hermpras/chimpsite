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
        className="fixed inset-0 bg-black/85 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        onClick={() => {
          if (!isConnecting) onClose();
        }}
      />

      {/* Modal Dialog Content - Centered & Responsive */}
      <div className="relative z-10 my-auto w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden rounded-2xl border-2 border-gray-700 bg-[#0d0f17] p-5 sm:p-6 shadow-[0_20px_50px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-4">
          <div>
            <h3 className="font-display text-2xl uppercase tracking-wider text-white">
              CONNECT WALLET
            </h3>
            <p className="font-mono-street text-[10px] text-gray-400 uppercase tracking-widest mt-0.5">
              Select your Ethereum identity provider
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isConnecting}
            className="rounded-lg border border-gray-800 p-2 text-gray-400 hover:border-gray-700 hover:bg-gray-800 hover:text-white transition-colors disabled:opacity-50"
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
                className="text-xs text-red-400 hover:text-red-200 uppercase font-mono-street font-medium"
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
              <div className="h-14 w-14 rounded-full border-2 border-amber-500/20 border-t-amber-400 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-amber-400 animate-spin" />
              </div>
            </div>
            <p className="font-display text-lg uppercase tracking-wide text-white">
              {busyMessage ?? "Awaiting Wallet Signature..."}
            </p>
            <p className="mt-1 font-mono-street text-xs text-gray-400 uppercase">
              Approve connection in your browser extension
            </p>
          </div>
        ) : (
          /* List of Wallet Connectors with Logos */
          <div className="mt-5 space-y-2.5 max-h-[380px] overflow-y-auto flex-1 min-h-0 pr-0.5">
            {connectors.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-800 p-6 text-center text-xs text-gray-400 font-mono-street">
                No web3 wallets detected in your browser. Install MetaMask, Rabby, or Coinbase Wallet.
              </div>
            ) : (
              connectors.map((connector) => (
                <button
                  key={connector.uid}
                  onClick={() => onSelect(connector)}
                  className="group flex w-full items-center justify-between rounded-xl border border-gray-800 bg-gray-900/60 p-3.5 text-left transition-all duration-200 hover:border-amber-400 hover:bg-amber-400/5 hover:shadow-lg active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-800 bg-[#07080d] p-1.5 transition-transform group-hover:scale-105">
                      <WalletIcon
                        name={connector.name}
                        iconUrl={connector.icon}
                        className="h-7 w-7"
                      />
                    </div>
                    <div>
                      <p className="font-syne text-sm font-medium text-white group-hover:text-amber-300 transition-colors">
                        {connector.name}
                      </p>
                      <p className="font-mono-street text-[10px] text-gray-400 uppercase">
                        {connector.name.toLowerCase().includes("injected")
                          ? "Default Browser Provider"
                          : "EIP-6963 Verified"}
                      </p>
                    </div>
                  </div>

                  <span className="font-mono-street text-[11px] font-medium text-gray-400 group-hover:text-amber-400 transition-colors">
                    CONNECT →
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {/* Footer info */}
        <div className="mt-5 border-t border-gray-800/80 pt-3.5 text-center">
          <p className="font-mono-street text-[10px] text-gray-400 uppercase">
            NON-CUSTODIAL • POWERED BY SIWE & ELYSIUM L2
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
