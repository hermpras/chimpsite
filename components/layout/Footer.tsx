import React from "react";
import Link from "next/link";
import { XLogo } from "@/components/icons/XLogo";

export function Footer() {
  return (
    <footer className="border-t border-gray-800/80 bg-[#06070a] py-6 text-sm text-gray-400">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 text-center sm:text-left">
          <Link href="/" className="inline-flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/elychimp-logo.png"
              alt="Elychimp Logo"
              className="h-6 w-auto object-contain opacity-90 hover:opacity-100 transition-opacity"
            />
          </Link>
          <span className="text-gray-700 hidden sm:inline">•</span>
          <p className="font-mono-street text-[11px] text-gray-400 uppercase tracking-wider">
            Leonida Syndicate on Elysium
          </p>
        </div>

        <nav
          aria-label="Footer navigation"
          className="flex flex-wrap items-center justify-center gap-6 font-mono-street text-xs uppercase tracking-wider text-gray-400"
        >
          <Link href="/" className="transition-colors hover:text-amber-400">
            Home
          </Link>
          <Link href="/drops" className="transition-colors hover:text-amber-400">
            Drops
          </Link>
          <Link href="/whitelist" className="transition-colors hover:text-amber-400">
            Whitelist
          </Link>
          <Link href="/profile" className="transition-colors hover:text-amber-400">
            Profile
          </Link>
          <Link href="/docs" className="transition-colors hover:text-amber-400">
            Docs
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          <a
            href="https://x.com/chimphoodNFT"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Follow Elychimp on X"
            className="flex items-center gap-1.5 rounded-lg border border-gray-800 bg-gray-900/60 px-2.5 py-1 text-xs text-gray-400 transition-colors hover:border-amber-400 hover:text-white"
          >
            <XLogo className="h-3.5 w-3.5" />
            <span className="font-mono-street text-[10px] font-bold">@chimphoodNFT</span>
          </a>
          <p className="font-mono-street text-center text-[11px] text-gray-400 sm:text-right uppercase">
            &copy; {new Date().getFullYear()} Elychimp.
          </p>
        </div>
      </div>
    </footer>
  );
}
