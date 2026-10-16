"use client";

import { useState } from "react";
import Link from "next/link";
import { useConnectors } from "wagmi";
import { useSiweAuth } from "@/hooks/useSiweAuth";
import { Button } from "@/components/ui/Button";
import { shortenAddress } from "@/lib/auth/address";

/**
 * Navbar wallet control.
 *
 * - No wallet: "Connect Wallet" opens a connector picker.
 * - Wallet connected, no session: "Sign In" runs the SIWE flow.
 * - Authenticated: address chip with a small menu (Profile / Sign out).
 * The server session (HttpOnly cookie) is the source of truth.
 */
export function WalletButton() {
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  if (status === "checking") {
    return (
      <Button variant="outline" size="sm" disabled>
        Loading…
      </Button>
    );
  }

  if (status === "authenticated" && sessionAddress) {
    return (
      <div className="relative">
        <Button variant="outline" size="sm" onClick={() => setMenuOpen((v) => !v)}>
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400" />
          <span className="font-mono">{shortenAddress(sessionAddress)}</span>
        </Button>
        {menuOpen && (
          <div className="absolute right-0 z-50 mt-2 w-44 rounded-lg border border-gray-800 bg-[#0c0e17] p-1 shadow-xl">
            <Link
              href="/profile"
              onClick={() => setMenuOpen(false)}
              className="block rounded-md px-3 py-2 text-sm text-gray-300 hover:bg-gray-800/60 hover:text-white"
            >
              Profile
            </Link>
            <button
              onClick={() => {
                setMenuOpen(false);
                void logout();
              }}
              className="block w-full rounded-md px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-800/60 hover:text-white"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    );
  }

  if (status === "signing") {
    return (
      <Button variant="outline" size="sm" disabled>
        {busyMessage ?? "Working…"}
      </Button>
    );
  }

  if (status === "wallet-only" && walletAddress) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button variant="primary" size="sm" onClick={() => void login()}>
          Sign In with Ethereum
        </Button>
        {error && (
          <button
            onClick={dismissError}
            className="max-w-56 text-right text-[11px] text-red-400 hover:text-red-300"
            title="Dismiss"
          >
            {error}
          </button>
        )}
      </div>
    );
  }

  // signed-out (or error after a failed attempt): connector picker.
  return (
    <div className="relative">
      <div className="flex flex-col items-end gap-1">
        <Button variant="outline" size="sm" onClick={() => setPickerOpen((v) => !v)}>
          Connect Wallet
        </Button>
        {error && (
          <button
            onClick={dismissError}
            className="max-w-56 text-right text-[11px] text-red-400 hover:text-red-300"
            title="Dismiss"
          >
            {error}
          </button>
        )}
      </div>
      {pickerOpen && (
        <div className="absolute right-0 z-50 mt-2 w-52 rounded-lg border border-gray-800 bg-[#0c0e17] p-1 shadow-xl">
          {connectors.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-500">
              No wallet connectors available.
            </p>
          )}
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              onClick={() => {
                setPickerOpen(false);
                void login(connector);
              }}
              className="block w-full rounded-md px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-800/60 hover:text-white"
            >
              {connector.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
