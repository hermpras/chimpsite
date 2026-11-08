import React from "react";
import Link from "next/link";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative border-t border-[#163B44]/80 bg-gradient-to-b from-[#031519] via-[#020D10] to-[#01080A] text-sm text-[#8AA8B2] overflow-hidden">
      {/* Luminous Top Neon Accent Line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#34B7DD]/40 to-transparent" />

      {/* Subtle Background Radial Ambient Glow */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 h-64 w-[600px] rounded-full bg-[#34B7DD]/5 blur-[120px]" />

      <div className="relative mx-auto max-w-7xl px-4 pt-14 pb-10 sm:px-6 lg:px-8">
        {/* Main Grid: 4 Balanced Columns */}
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-12 lg:gap-12">
          {/* Column 1: Brand & Syndicate Identity (Wide Column) */}
          <div className="flex flex-col items-start lg:col-span-5">
            <Link
              href="/"
              aria-label="Elychimp Logo"
              className="group inline-flex items-center gap-3 focus:outline-none"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/elychimp-logo.png"
                alt="Elychimp Logo"
                className="h-8 w-auto object-contain transition-transform duration-300 group-hover:scale-105 drop-shadow-[0_0_16px_rgba(52,183,221,0.25)]"
              />
            </Link>

            <p className="mt-4 max-w-sm text-xs leading-relaxed text-[#8AA8B2]">
              The next-generation digital syndicate and streetwear collective
              forged on Elysium L2. High-speed trait assembly, algorithmic crate
              drops, and sovereign on-chain identity.
            </p>

            {/* Architectural Status Pills (Minimalist, No Icons) */}
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="font-mono-street rounded-md border border-[#34B7DD]/30 bg-[#34B7DD]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#34B7DD]">
                Elysium L2
              </span>
              <span className="font-mono-street rounded-md border border-[#163B44] bg-[#071F24]/70 px-2.5 py-1 text-[10px] uppercase tracking-wider text-[#8AA8B2]">
                Gasless SIWE
              </span>
              <span className="font-mono-street rounded-md border border-[#163B44] bg-[#071F24]/70 px-2.5 py-1 text-[10px] uppercase tracking-wider text-[#8AA8B2]">
                Sub-Second EVM
              </span>
            </div>
          </div>

          {/* Column 2: Ecosystem Navigation */}
          <div className="flex flex-col lg:col-span-2">
            <h3 className="font-mono-street text-[11px] font-bold uppercase tracking-widest text-[#34B7DD]">
              Ecosystem
            </h3>
            <nav
              aria-label="Footer navigation"
              className="mt-4 flex flex-col space-y-2.5 text-xs uppercase tracking-wider text-[#8AA8B2]"
            >
              <Link
                href="/"
                className="transition-colors duration-200 hover:text-[#34B7DD]"
              >
                Home
              </Link>
              <Link
                href="/whitelist"
                className="transition-colors duration-200 hover:text-[#34B7DD]"
              >
                Whitelist
              </Link>
              <Link
                href="/drops"
                className="transition-colors duration-200 hover:text-[#34B7DD]"
              >
                Drops
              </Link>
              <Link
                href="/docs"
                className="transition-colors duration-200 hover:text-[#34B7DD]"
              >
                Docs
              </Link>
            </nav>
          </div>

          {/* Column 3: Syndicate & Wardrobe */}
          <div className="flex flex-col lg:col-span-2">
            <h3 className="font-mono-street text-[11px] font-bold uppercase tracking-widest text-[#34B7DD]">
              Syndicate
            </h3>
            <div className="mt-4 flex flex-col space-y-2.5 text-xs uppercase tracking-wider text-[#8AA8B2]">
              <Link
                href="/profile"
                className="transition-colors duration-200 hover:text-[#34B7DD]"
              >
                Wardrobe
              </Link>
              <Link
                href="/drops"
                className="transition-colors duration-200 hover:text-[#34B7DD]"
              >
                Loot Crates
              </Link>
              <Link
                href="/whitelist"
                className="transition-colors duration-200 hover:text-[#34B7DD]"
              >
                Allowlist
              </Link>
              <Link
                href="/docs"
                className="transition-colors duration-200 hover:text-[#34B7DD]"
              >
                Blueprint
              </Link>
            </div>
          </div>

          {/* Column 4: Official Dispatch & Protocol Status */}
          <div className="flex flex-col lg:col-span-3">
            <h3 className="font-mono-street text-[11px] font-bold uppercase tracking-widest text-[#34B7DD]">
              Communications
            </h3>

            {/* Official X Channel Card (Clean, Luxurious, No Icon) */}
            <a
              href="https://x.com/Elychimp"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Follow Elychimp on X"
              className="group mt-4 block rounded-xl border border-[#163B44] bg-[#071F24]/70 p-3.5 transition-all duration-300 hover:border-[#34B7DD]/60 hover:bg-[#0A272F] hover:shadow-[0_0_24px_rgba(52,183,221,0.2)]"
            >
              <div className="flex items-center justify-between font-mono-street text-[10px] tracking-wider uppercase text-[#8AA8B2]">
                <span>Official Channel</span>
                <span className="font-semibold text-[#34B7DD] group-hover:text-white transition-colors">
                  Join
                </span>
              </div>
              <div className="mt-1 font-mono-street text-sm font-bold tracking-wide text-[#DBF2F9] group-hover:text-white transition-colors">
                @Elychimp
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[#8AA8B2]/80">
                Direct dispatches, drop countdowns, and syndicate announcements.
              </p>
            </a>

            {/* Protocol Status Display (Minimalist Monospace, No Icon) */}
            <div className="mt-3 rounded-xl border border-[#163B44]/70 bg-[#05181C]/90 px-3.5 py-2.5 font-mono-street text-[10px] tracking-wider">
              <div className="flex items-center justify-between text-[#8AA8B2]/70 uppercase">
                <span>Protocol Status</span>
                <span className="font-bold text-[#34B7DD]">Operational</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[#DBF2F9]/80 uppercase">
                <span>Network</span>
                <span className="text-[#8AA8B2]">Elysium L2</span>
              </div>
            </div>
          </div>
        </div>

        {/* Lower Divider & Baseline Copyright Bar */}
        <div className="mt-12 border-t border-[#163B44]/70 pt-6">
          <div className="flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
            <p className="font-mono-street text-[11px] uppercase tracking-widest text-[#8AA8B2]/90">
              Leonida Syndicate on Elysium L2
            </p>

            <p className="font-mono-street text-[11px] uppercase tracking-wider text-[#8AA8B2]/70">
              &copy; {currentYear} Elychimp. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
