import React from "react";
import Link from "next/link";
import { XLogo } from "@/components/icons/XLogo";

export function Footer() {
  return (
    <footer className="border-t border-[#163B44] bg-[#031316] py-6 text-sm text-[#8AA8B2]">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 text-center sm:text-left">
          <Link href="/" className="inline-flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/elychimp-logo.png"
              alt="Elychimp Logo"
              className="h-6 w-auto object-contain opacity-90 hover:opacity-100 transition-opacity drop-shadow-[0_0_10px_rgba(52,183,221,0.2)]"
            />
          </Link>
          <span className="text-[#163B44] hidden sm:inline">•</span>
          <p className="text-[11px] text-[#8AA8B2] uppercase tracking-wider">
            Leonida Syndicate on Elysium L2
          </p>
        </div>

        <nav
          aria-label="Footer navigation"
          className="flex flex-wrap items-center justify-center gap-6 text-xs uppercase tracking-wider text-[#8AA8B2]"
        >
          <Link href="/" className="transition-colors hover:text-[#34B7DD]">
            Home
          </Link>
          <Link href="/whitelist" className="transition-colors hover:text-[#34B7DD]">
            Whitelist
          </Link>
          <Link href="/drops" className="transition-colors hover:text-[#34B7DD]">
            Drops
          </Link>
          <Link href="/docs" className="transition-colors hover:text-[#34B7DD]">
            Docs
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          <a
            href="https://x.com/Elychimp"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Follow Elychimp on X"
            className="flex items-center gap-1.5 rounded-lg border border-[#163B44] bg-[#0B2026]/80 px-2.5 py-1 text-xs text-[#8AA8B2] transition-colors hover:border-[#34B7DD]/60 hover:text-[#DBF2F9]"
          >
            <XLogo className="h-3.5 w-3.5" />
            <span className="text-[10px] font-bold">@Elychimp</span>
          </a>
          <p className="text-center text-[11px] text-[#8AA8B2] sm:text-right uppercase">
            &copy; {new Date().getFullYear()} Elychimp.
          </p>
        </div>
      </div>
    </footer>
  );
}
