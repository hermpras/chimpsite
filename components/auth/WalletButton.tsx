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
import { ChevronDown, User, LogOut, LogIn, Loader2 } from "lucide-react";

/**
 * Navbar wallet control.
 *
 * - No wallet: "Connect Wallet" opens the rich WalletModal with logos.
 * - Wallet connected, no session: "Sign In" runs the SIWE flow.
 * - Authenticated: address chip with a small menu (Profile / Sign out).
 *
 * @param compact - When true, renders a minimal icon-only button (used in mobile navbar).
 * @param align - Dropdown menu alignment: "right" (default) or "center" (for mobile drawers).
 * @param onAction - Optional callback invoked when a menu action is chosen (e.g. closing drawer).
 */
export interface WalletButtonProps {
  compact?: boolean;
  align?: "right" | "center";
  onAction?: () => void;
}

export function WalletButton({
  compact = false,
  align = "right",
  onAction,
}: WalletButtonProps = {}) {
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
        <div className="h-8 w-8 animate-pulse rounded-xl border border-[#163B44] bg-[#0B2026]" />
      );
    }
    return (
      <Button variant="outline" size="sm" disabled className="text-xs">
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
            className="flex items-center gap-1.5 rounded-xl border border-[#163B44]/90 bg-[#071F24]/90 p-1.5 transition-all hover:border-[#34B7DD]/80 hover:bg-[#102B33] active:scale-95 shadow-sm"
          >
            <UserAvatar
              identifier={sessionAddress}
              size="sm"
              className="h-7 w-7 rounded-lg [image-rendering:pixelated]"
            />
            <ChevronDown className="h-3.5 w-3.5 text-[#8AA8B2]" />
          </button>
        ) : (
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-label="Account menu"
            className="group flex items-center gap-2.5 rounded-2xl border border-[#163B44]/90 bg-[#071F24]/85 px-3 py-1.5 transition-all hover:border-[#34B7DD]/80 hover:bg-[#102B33] hover:shadow-[0_0_18px_rgba(52,183,221,0.2)] shadow-sm text-left active:scale-[0.98]"
          >
            <UserAvatar
              identifier={sessionAddress}
              size="md"
              className="h-9 w-9 rounded-xl border border-[#163B44] [image-rendering:pixelated] shrink-0"
            />
            <div className="flex flex-col min-w-0 pr-0.5">
              <span className="truncate text-xs font-semibold text-[#F8F7F4] max-w-[130px] leading-tight">
                {displayName}
              </span>
              <div className="flex items-center gap-1.5 text-[10px] text-[#8AA8B2] leading-tight mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34D399] shrink-0" />
                <span>Signed in</span>
                <ChevronDown className="h-3 w-3 text-[#8AA8B2] transition-transform group-hover:translate-y-0.5" />
              </div>
            </div>
          </button>
        )}

        {menuOpen && (
          <div
            className={`absolute z-50 mt-2 w-72 max-w-[calc(100vw-32px)] rounded-2xl border border-[#1E4D5A] bg-[#04181C]/96 p-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.85)] backdrop-blur-2xl animate-in fade-in-0 zoom-in-95 duration-150 ${
              align === "center"
                ? "left-1/2 -translate-x-1/2"
                : compact
                ? "-right-12 sm:right-0"
                : "right-0"
            }`}
          >
            {/* Top Accent Line */}
            <div className="pointer-events-none -mx-2.5 -mt-2.5 mb-2.5 h-[1px] bg-gradient-to-r from-transparent via-[#34B7DD]/40 to-transparent rounded-t-2xl" />
            {/* Header Profile Section */}
            <div className="flex items-center gap-3 rounded-xl border border-[#163B44] bg-[#0B2026] p-3 mb-2">
              <UserAvatar
                identifier={sessionAddress}
                size="md"
                className="h-11 w-11 rounded-xl border border-[#1E4D5A] [image-rendering:pixelated] shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[#F8F7F4] leading-tight">
                  {displayName}
                </p>
                {xUsername ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                    <p className="truncate font-mono text-[11px] text-[#DBF2F9]">
                      @{xUsername} on X
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="h-2 w-2 rounded-full bg-[#34B7DD] shrink-0" />
                    <p className="truncate text-[11px] text-[#8AA8B2]">
                      Wallet connected
                    </p>
                  </div>
                )}
                <p
                  className="font-mono text-[10px] text-[#8AA8B2] mt-0.5 truncate"
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
                onClick={() => {
                  setMenuOpen(false);
                  onAction?.();
                }}
                className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-xs uppercase font-medium text-[#DBF2F9] transition-colors hover:bg-[#102B33] hover:text-white"
              >
                <User className="h-4 w-4 text-[#8AA8B2]" />
                <span>Profile</span>
              </Link>
            </div>

            {/* Bottom Actions */}
            <div className="border-t border-[#163B44] mt-2 pt-2">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onAction?.();
                  void logout();
                }}
                className="flex items-center gap-3 w-full rounded-xl px-3 py-2 text-left text-xs uppercase font-medium text-rose-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
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
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#34B7DD]/20 border border-[#34B7DD]/40 text-[#6FCDE8]">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 rounded-xl bg-[#34B7DD] px-4 py-2 font-display text-sm tracking-wider uppercase text-[#04181C] font-semibold shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin text-[#04181C]" />
        <span>{busyMessage ?? "Signing in…"}</span>
      </div>
    );
  }

  if (status === "wallet-only" && walletAddress) {
    return (
      <div className={`flex flex-col gap-1 ${align === "center" ? "items-center" : "items-end"}`}>
        <button
          onClick={() => void login()}
          aria-label="Sign in"
          className={
            compact
              ? "flex items-center gap-1.5 rounded-xl bg-[#34B7DD] px-3 py-1.5 font-display text-xs tracking-wider uppercase text-[#04181C] font-semibold shadow-[0_0_15px_rgba(52,183,221,0.25)] transition-all hover:bg-[#6FCDE8] active:scale-95"
              : "flex items-center gap-2 rounded-xl bg-[#34B7DD] px-4 py-2 font-display text-sm tracking-wider uppercase text-[#04181C] font-semibold shadow-[0_0_15px_rgba(52,183,221,0.25)] transition-all hover:bg-[#6FCDE8] hover:shadow-[0_0_20px_rgba(52,183,221,0.4)] active:scale-95"
          }
        >
          <LogIn className="h-4 w-4 shrink-0 text-[#04181C] stroke-[2.5]" />
          <span>Sign in</span>
        </button>
        {error && !compact && (
          <button
            onClick={dismissError}
            className={`max-w-56 text-[11px] text-red-400 hover:text-red-300 ${align === "center" ? "text-center" : "text-right"}`}
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
      <div className={`flex flex-col gap-1 ${align === "center" ? "items-center" : "items-end"}`}>
        <button
          onClick={() => setModalOpen(true)}
          aria-label="Sign in"
          className={
            compact
              ? "flex items-center gap-1.5 rounded-xl bg-[#34B7DD] px-3 py-1.5 font-display text-xs tracking-wider uppercase text-[#04181C] font-semibold shadow-[0_0_15px_rgba(52,183,221,0.25)] transition-all hover:bg-[#6FCDE8] active:scale-95"
              : "flex items-center gap-2 rounded-xl bg-[#34B7DD] px-4 py-2 font-display text-sm tracking-wider uppercase text-[#04181C] font-semibold shadow-[0_0_15px_rgba(52,183,221,0.25)] transition-all hover:bg-[#6FCDE8] hover:shadow-[0_0_20px_rgba(52,183,221,0.4)] active:scale-95"
          }
        >
          <LogIn className="h-4 w-4 shrink-0 text-[#04181C] stroke-[2.5]" />
          <span>Sign in</span>
        </button>
        {error && !compact && (
          <button
            onClick={dismissError}
            className={`max-w-56 text-[11px] text-red-400 hover:text-red-300 ${align === "center" ? "text-center" : "text-right"}`}
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
