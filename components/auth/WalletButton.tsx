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
import { Wallet, ChevronDown, User, LogOut, LogIn, Loader2 } from "lucide-react";

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
  const { xUsername, xName } = useXIdentity();
  const connectors = useConnectors();
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Fallback chain: Display name on X -> @handle on X -> Shortened EVM Address
  const displayName =
    xName || (xUsername ? `@${xUsername}` : sessionAddress ? shortenAddress(sessionAddress) : "");

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
        <div className="h-8 w-8 animate-pulse rounded-xl border border-gray-800 bg-gray-900/60" />
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
        {compact ? (
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-label="Account menu"
            className="flex items-center gap-1.5 rounded-xl border border-zinc-700/80 bg-[#12141c] p-1.5 transition-all hover:border-amber-400/80 hover:bg-[#161824]"
          >
            <UserAvatar
              identifier={sessionAddress}
              size="sm"
              className="h-7 w-7 rounded-lg [image-rendering:pixelated]"
            />
            <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
          </button>
        ) : (
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-label="Account menu"
            className="group flex items-center gap-2.5 rounded-2xl border border-zinc-700/80 bg-[#12141c]/90 px-3 py-1.5 transition-all hover:border-amber-400 hover:bg-[#171a26] shadow-sm text-left"
          >
            <UserAvatar
              identifier={sessionAddress}
              size="md"
              className="h-9 w-9 rounded-xl border border-zinc-700/80 [image-rendering:pixelated] shrink-0"
            />
            <div className="flex flex-col min-w-0 pr-0.5">
              <span className="truncate text-xs font-bold text-white max-w-[130px] leading-tight">
                {displayName}
              </span>
              <div className="flex items-center gap-1 text-[10px] text-zinc-400 font-mono-street leading-tight mt-0.5">
                <span>Signed in</span>
                <ChevronDown className="h-3 w-3 text-zinc-400 transition-transform group-hover:translate-y-0.5" />
              </div>
            </div>
          </button>
        )}

        {menuOpen && (
          <div className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border-2 border-zinc-800 bg-[#0c0e17] p-2.5 shadow-2xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95 duration-150">
            {/* Header Profile Section */}
            <div className="flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-3 mb-2">
              <UserAvatar
                identifier={sessionAddress}
                size="md"
                className="h-11 w-11 rounded-xl border border-zinc-700 [image-rendering:pixelated] shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white leading-tight">
                  {displayName}
                </p>
                {xUsername ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                    <p className="truncate font-mono-street text-[11px] text-zinc-300">
                      @{xUsername} on X
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                    <p className="truncate font-mono-street text-[11px] text-zinc-400">
                      Wallet connected
                    </p>
                  </div>
                )}
                <p
                  className="font-mono-street text-[10px] text-zinc-500 mt-0.5 truncate"
                  title={sessionAddress}
                >
                  {shortenAddress(sessionAddress)}
                </p>
              </div>
            </div>

            {/* Menu Links */}
            <div className="space-y-1">
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-xs font-mono-street uppercase font-bold text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                <User className="h-4 w-4 text-zinc-400" />
                <span>Profile</span>
              </Link>
            </div>

            {/* Bottom Actions */}
            <div className="border-t border-zinc-800/80 mt-2 pt-2">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  void logout();
                }}
                className="flex items-center gap-3 w-full rounded-xl px-3 py-2 text-left font-mono-street text-xs uppercase font-bold text-rose-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
              >
                <LogOut className="h-4 w-4 text-rose-400" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (status === "signing") {
    if (compact) {
      return (
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/20 border border-amber-400/40 text-amber-300">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 font-display text-sm tracking-wider uppercase text-black font-bold shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin text-black" />
        <span>{busyMessage ?? "Signing in…"}</span>
      </div>
    );
  }

  if (status === "wallet-only" && walletAddress) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={() => void login()}
          aria-label="Sign in"
          className={
            compact
              ? "flex items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-1.5 font-display text-xs tracking-wider uppercase text-black font-bold shadow-sm transition-all hover:bg-amber-300 active:scale-95"
              : "flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 font-display text-sm tracking-wider uppercase text-black font-bold shadow-sm transition-all hover:bg-amber-300 hover:shadow-md active:scale-95"
          }
        >
          <LogIn className="h-4 w-4 shrink-0 text-black stroke-[2.5]" />
          <span>Sign in</span>
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
    );
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={() => setModalOpen(true)}
          aria-label="Sign in"
          className={
            compact
              ? "flex items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-1.5 font-display text-xs tracking-wider uppercase text-black font-bold shadow-sm transition-all hover:bg-amber-300 active:scale-95"
              : "flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 font-display text-sm tracking-wider uppercase text-black font-bold shadow-sm transition-all hover:bg-amber-300 hover:shadow-md active:scale-95"
          }
        >
          <LogIn className="h-4 w-4 shrink-0 text-black stroke-[2.5]" />
          <span>Sign in</span>
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
