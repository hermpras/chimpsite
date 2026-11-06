"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useConnectors } from "wagmi";
import { useSiweAuth } from "@/hooks/useSiweAuth";
import { useXIdentity } from "@/hooks/useXIdentity";
import { Button } from "@/components/ui/Button";
import { shortenAddress } from "@/lib/auth/address";
import { UserAvatar } from "@/components/inventory/UserAvatar";
import { WalletModal } from "./WalletModal";
import { Wallet } from "lucide-react";

/**
 * Navbar wallet control.
 *
 * - No wallet: "Connect Wallet" opens the rich WalletModal with logos.
 * - Wallet connected, no session: "Sign In" runs the SIWE flow.
 * - Authenticated: address chip with a small menu (Profile / Sign out).
 *
 * @param compact - When true, renders a minimal icon-only button (used in mobile navbar).
 */
export function WalletButton({ compact = false }: { compact?: boolean } = {}) {
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
  const { xUsername } = useXIdentity();
  const connectors = useConnectors();
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Close dropdown when user clicks outside of it
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  if (status === "checking") {
    if (compact) {
      return (
        <div className="h-8 w-8 animate-pulse rounded-lg border border-gray-800 bg-gray-900/60" />
      );
    }
    return (
      <Button variant="outline" size="sm" disabled className="font-mono-street text-xs">
        Checking…
      </Button>
    );
  }

  if (status === "authenticated" && sessionAddress) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="true"
          aria-expanded={menuOpen}
          aria-label="Account menu"
          className="flex items-center gap-2 rounded-xl border border-gray-700 bg-gray-900/90 px-3 py-1.5 font-mono-street text-xs font-bold text-gray-200 transition-all hover:border-amber-400 hover:text-white shadow-sm"
        >
          <UserAvatar identifier={sessionAddress} size="sm" />
          {!compact && (
            <span>{xUsername ? `@${xUsername}` : shortenAddress(sessionAddress)}</span>
          )}
        </button>
        {menuOpen && (
          <div className="absolute right-0 z-50 mt-2 w-48 rounded-xl border-2 border-gray-800 bg-[#0c0e17] p-1.5 shadow-2xl">
            <div className="mb-1 flex items-center gap-2 border-b border-gray-800/80 px-2.5 py-2">
              <UserAvatar identifier={sessionAddress} size="md" />
              <div className="overflow-hidden">
                <p className="truncate font-mono-street text-xs font-bold text-white">
                  {xUsername ? `@${xUsername}` : shortenAddress(sessionAddress)}
                </p>
                {xUsername && (
                  <p className="truncate font-mono-street text-[10px] text-zinc-500">
                    {shortenAddress(sessionAddress)}
                  </p>
                )}
                <p className="font-mono-street text-[10px] text-amber-400 font-bold uppercase tracking-wider">
                  Active
                </p>
              </div>
            </div>
            <Link
              href="/profile"
              onClick={() => setMenuOpen(false)}
              className="block rounded-lg px-3 py-2 font-mono-street text-xs text-gray-300 hover:bg-gray-800 hover:text-white uppercase font-bold"
            >
              My Gear & Profile
            </Link>
            <button
              onClick={() => {
                setMenuOpen(false);
                void logout();
              }}
              className="block w-full rounded-lg px-3 py-2 text-left font-mono-street text-xs text-gray-400 hover:bg-red-500/10 hover:text-red-300 uppercase font-bold"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    );
  }

  if (status === "signing") {
    if (compact) {
      return (
        <div className="h-8 w-8 animate-pulse rounded-lg border border-amber-400/30 bg-amber-400/10" />
      );
    }
    return (
      <Button variant="outline" size="sm" disabled className="font-mono-street text-xs border-amber-400/40 text-amber-400">
        {busyMessage ?? "Signing…"}
      </Button>
    );
  }

  if (status === "wallet-only" && walletAddress) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          variant="primary"
          size="sm"
          onClick={() => void login()}
          className="border border-black bg-amber-400 font-display uppercase tracking-wider text-black hover:bg-amber-300 shadow-brutal-sm text-xs px-4 py-2"
        >
          {compact ? "Sign In" : "Sign In with Ethereum"}
        </Button>
        {error && !compact && (
          <button
            onClick={dismissError}
            className="max-w-56 text-right text-[11px] text-red-400 hover:text-red-300 font-mono-street"
            title="Dismiss"
          >
            {error}
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={() => setModalOpen(true)}
          aria-label="Connect Wallet"
          className={
            compact
              ? "flex items-center justify-center rounded-lg border-2 border-amber-400 bg-amber-400/10 p-2 text-amber-300 shadow-brutal-sm transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-amber-400 hover:text-black active:translate-x-0.5 active:translate-y-0.5"
              : "flex items-center gap-2 border-2 border-amber-400 bg-amber-400/10 px-4 py-2 font-mono-street text-xs font-black uppercase tracking-wider text-amber-300 shadow-brutal-sm transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-amber-400 hover:text-black active:translate-x-0.5 active:translate-y-0.5"
          }
        >
          <Wallet className="h-4 w-4" />
          {!compact && <span>Connect Wallet</span>}
        </button>
        {error && !compact && (
          <button
            onClick={dismissError}
            className="max-w-56 text-right text-[11px] text-red-400 hover:text-red-300 font-mono-street"
            title="Dismiss"
          >
            {error}
          </button>
        )}
      </div>

      {/* Rich Modal with Wallet Logos */}
      <WalletModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setConnecting(false);
        }}
        connectors={connectors}
        onSelect={async (connector) => {
          setConnecting(true);
          try {
            await login(connector);
            setModalOpen(false);
          } finally {
            setConnecting(false);
          }
        }}
        isConnecting={connecting}
        busyMessage={busyMessage}
        error={error}
        onDismissError={dismissError}
      />
    </>
  );
}
