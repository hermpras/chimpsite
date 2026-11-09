import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { CoverflowCarousel } from "@/components/home/CoverflowCarousel";

export default function HomePage() {
  return (
    <div className="relative w-full overflow-hidden">
      {/* ========================================================================= */}
      {/* 1. HERO SECTION: Centerstage 3D Runway Exhibition                         */}
      {/* ========================================================================= */}
      <section className="relative w-full overflow-hidden border-b border-[#163B44]/80 bg-[#04181C] pt-6 pb-14 sm:pt-8 sm:pb-18 lg:pt-10 lg:pb-22">
        {/* Subtle Architectural Grid Lines & Ambient Atmosphere */}
        <div className="pointer-events-none absolute inset-0 select-none">
          {/* Faint Grid Texture */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(to right, #34B7DD 1px, transparent 1px), linear-gradient(to bottom, #34B7DD 1px, transparent 1px)",
              backgroundSize: "64px 64px",
            }}
          />

          {/* Deep Muted Backdrop */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/bg-starlet-motel.jpg"
            alt="Atmospheric Background"
            className="h-full w-full object-cover object-[75%_25%] opacity-15 filter grayscale contrast-125"
          />

          {/* Precision Vignettes */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#04181C] via-[#04181C]/92 to-[#04181C]" />
          <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[#04181C] to-transparent" />
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#04181C] to-transparent" />
        </div>

        {/* Hero Content Container (Centerstage Runway) */}
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Top Header Block: Subtitle matching user screenshot */}
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            {/* Screen-reader heading for SEO and accessibility */}
            <h1 className="sr-only">Five Pieces. One Collective.</h1>

            {/* High-Caliber Subheading (Hero opener) */}
            <p className="max-w-2xl text-center text-sm leading-relaxed text-[#B8D7E0] sm:text-base font-normal">
              A dynamic digital wardrobe engineered for Elysium. Collect modular apparel traits through cyclic drop periods, compose your signature specimen, and clear guaranteed allocation for OpenSea SeaDrop.
            </p>
          </div>

          {/* Middle Stage: 3D Coverflow Runway Carousel */}
          <div className="mt-6 sm:mt-8 w-full">
            <CoverflowCarousel />
          </div>

          {/* Bottom Action Console */}
          <div className="mt-7 sm:mt-8 flex flex-col items-center">
            {/* Actions (Strictly Clean & Icon-Free) */}
            <div className="flex w-full flex-col gap-3.5 sm:w-auto sm:flex-row justify-center">
              <Link href="/whitelist" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full border border-[#34B7DD] bg-[#34B7DD] font-semibold text-sm sm:text-base uppercase tracking-[0.14em] text-[#04181C] shadow-[0_0_24px_rgba(52,183,221,0.25)] transition-all hover:bg-[#6FCDE8] hover:shadow-[0_0_36px_rgba(52,183,221,0.4)] active:scale-[0.99] sm:w-auto px-8 py-3.5 sm:py-4"
                >
                  GET ON THE LIST
                </Button>
              </Link>
              <Link href="/drops" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="secondary"
                  className="w-full border border-[#163B44] bg-[#071F24]/80 backdrop-blur-md font-semibold text-sm sm:text-base uppercase tracking-[0.14em] text-[#DBF2F9] transition-all hover:border-[#34B7DD]/60 hover:text-white hover:bg-[#0B2A32] active:scale-[0.99] sm:w-auto px-8 py-3.5 sm:py-4"
                >
                  OPEN CRATES
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Main Page Container for Content Sections */}
      <div className="mx-auto max-w-7xl px-4 pt-16 sm:pt-20 pb-20 sm:px-6 sm:pb-24 lg:px-8">
        {/* ========================================================================= */}
        {/* 3. CORE ARCHITECTURE PILLARS                                              */}
        {/* ========================================================================= */}
        <section className="mb-20">
          <div className="mb-10 flex flex-col items-start justify-between gap-4 border-b border-[#163B44] pb-6 sm:flex-row sm:items-end">
            <div>
              <h2 className="font-display text-4xl sm:text-6xl uppercase tracking-tight text-[#F8F7F4]">
                THE 3 GROUND RULES.
              </h2>
            </div>
            <p className="max-w-md text-sm sm:text-base text-[#B8D7E0] leading-snug">
              Engineered for high-speed crate drops, dynamic avatar composition, and
              verified community allocation on OpenSea SeaDrop.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Rule 01 */}
            <div className="group relative rounded-xl border border-[#163B44] bg-[#0B2026] p-8 transition-all hover:border-[#34B7DD]/60 hover:shadow-[0_0_25px_rgba(52,183,221,0.15)]">
              <div className="flex items-center justify-between border-b border-[#163B44] pb-4">
                <span className="font-display text-5xl text-[#163B44] transition-colors group-hover:text-[#34B7DD]">
                  01
                </span>
              </div>
              <h3 className="mt-6 font-display text-2xl uppercase tracking-tight text-[#F8F7F4]">
                Instant Speed, Zero Gas Pain
              </h3>
              <p className="mt-3 text-sm leading-snug text-[#B8D7E0]">
                Transactions settle in milliseconds. Crate unlocks, trait swaps,
                and transfers don&apos;t drain your wallet with ridiculous gas fees.
                Pure high-frequency execution.
              </p>
            </div>

            {/* Rule 02 */}
            <div className="group relative rounded-xl border border-[#163B44] bg-[#0B2026] p-8 transition-all hover:border-emerald-400/60 hover:shadow-[0_0_25px_rgba(52,211,153,0.15)]">
              <div className="flex items-center justify-between border-b border-[#163B44] pb-4">
                <span className="font-display text-5xl text-[#163B44] transition-colors group-hover:text-emerald-400">
                  02
                </span>
              </div>
              <h3 className="mt-6 font-display text-2xl uppercase tracking-tight text-[#F8F7F4]">
                Dynamic Persona Engine
              </h3>
              <p className="mt-3 text-sm leading-snug text-[#B8D7E0]">
                You don&apos;t just hold a static JPEG. Collect Background, Fur,
                Clothing, Headwear, and Eyewear to assemble and equip your custom
                signature identity.
              </p>
            </div>

            {/* Rule 03 */}
            <div className="group relative rounded-xl border border-[#163B44] bg-[#0B2026] p-8 transition-all hover:border-[#F59E0B]/60 hover:shadow-[0_0_25px_rgba(245,158,11,0.15)]">
              <div className="flex items-center justify-between border-b border-[#163B44] pb-4">
                <span className="font-display text-5xl text-[#163B44] transition-colors group-hover:text-[#F59E0B]">
                  03
                </span>
              </div>
              <h3 className="mt-6 font-display text-2xl uppercase tracking-tight text-[#F8F7F4]">
                Crate Drops & Crew Sharing
              </h3>
              <p className="mt-3 text-sm leading-snug text-[#B8D7E0]">
                Claim free crate drops every 30-minute cycle. Pull duplicate
                traits? Transfer them directly to your homies to help them
                qualify their 5/5 outfit for the allowlist.
              </p>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 4. THE 3-STEP PROTOCOL (How to Get In)                                    */}
        {/* ========================================================================= */}
        <section className="mb-20 rounded-2xl border border-[#1E4D5A] bg-gradient-to-r from-[#071F24] via-[#051D22] to-[#0B2026] p-6 sm:p-10 shadow-xl">
          <div className="mb-8 flex flex-col items-start justify-between gap-2 border-b border-[#163B44] pb-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="font-display text-3xl sm:text-5xl uppercase tracking-tight text-[#F8F7F4]">
                HOW TO SECURE YOUR SPOT.
              </h2>
            </div>
            <span className="text-xs text-[#8AA8B2]">
              3 Steps | Non-Custodial | 1:1 Identity
            </span>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-[#163B44] bg-[#04181C]/90 p-6">
              <div className="text-xs font-bold text-[#34B7DD]">
                PHASE 01
              </div>
              <h4 className="mt-2 font-display text-xl uppercase text-[#F8F7F4]">
                Sign In with Ethereum
              </h4>
              <p className="mt-2 text-xs sm:text-sm leading-snug text-[#B8D7E0]">
                Connect your EVM wallet via SIWE and link your X account.
                Protected against Sybil clusters and bots.
              </p>
            </div>

            <div className="rounded-xl border border-[#163B44] bg-[#04181C]/90 p-6">
              <div className="text-xs font-bold text-emerald-400">
                PHASE 02
              </div>
              <h4 className="mt-2 font-display text-xl uppercase text-[#F8F7F4]">
                Loot Crate Cycles
              </h4>
              <p className="mt-2 text-xs sm:text-sm leading-snug text-[#B8D7E0]">
                Enter active claim windows to unbox limited traits or receive
                gifts from community peers to build up your inventory.
              </p>
            </div>

            <div className="rounded-xl border border-[#163B44] bg-[#04181C]/90 p-6">
              <div className="text-xs font-bold text-[#FBBF24]">
                PHASE 03
              </div>
              <h4 className="mt-2 font-display text-xl uppercase text-[#F8F7F4]">
                Lock GTD & FCFS
              </h4>
              <p className="mt-2 text-xs sm:text-sm leading-snug text-[#B8D7E0]">
                Complete your 5-piece outfit or submit community missions to
                lock in your Guaranteed (GTD) or FCFS allowlist slot.
              </p>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 5. DUAL ACTION BENTO                                                      */}
        {/* ========================================================================= */}
        <section className="mb-20">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* Bento Card 1: Crate Drops */}
            <div className="relative rounded-2xl border border-[#1E4D5A] bg-gradient-to-b from-[#0B2026] via-[#071F24] to-[#04181C] p-8 shadow-[0_10px_35px_rgba(4,24,28,0.7)]">
              <h3 className="font-display text-3xl sm:text-4xl uppercase tracking-tight text-[#F8F7F4]">
                Loot Drops &amp; Inventory
              </h3>
              <p className="mt-3 text-sm leading-snug text-[#B8D7E0]">
                Continuous cycle drops with atomic inventory minting. Unpack
                random traits from Common to Legendary, manage your inventory, and
                gift duplicate gear to peers.
              </p>

              <div className="mt-8 pt-4 border-t border-[#163B44]">
                <Link href="/drops" className="block w-full">
                  <Button className="w-full justify-center border border-[#34B7DD]/60 bg-gradient-to-r from-[#34B7DD] to-[#6FCDE8] font-bold text-base sm:text-lg uppercase tracking-wider text-[#04181C] shadow-[0_0_20px_rgba(52,183,221,0.25)] transition-all hover:scale-[1.01] hover:shadow-[0_0_30px_rgba(52,183,221,0.4)] py-5">
                    OPEN CRATES
                  </Button>
                </Link>
              </div>
            </div>

            {/* Bento Card 2: Allowlist Clearance */}
            <div className="relative rounded-2xl border border-[#F59E0B]/40 bg-gradient-to-b from-[#0F231D]/80 via-[#071F24] to-[#04181C] p-8 shadow-[0_10px_35px_rgba(245,158,11,0.1)]">
              <h3 className="font-display text-3xl sm:text-4xl uppercase tracking-tight text-[#F8F7F4]">
                Allowlist Allocation
              </h3>
              <p className="mt-3 text-sm leading-snug text-[#B8D7E0]">
                Guaranteed (GTD) and FCFS allowlist export for official mint
                day on OpenSea SeaDrop. Check qualification status, complete community missions,
                or verify your 5/5 outfit to claim your pass.
              </p>

              <div className="mt-8 pt-4 border-t border-[#163B44]">
                <Link href="/whitelist" className="block w-full">
                  <Button className="w-full justify-center border border-[#F59E0B]/60 bg-[#F59E0B] font-bold text-base sm:text-lg uppercase tracking-wider text-[#04181C] shadow-[0_0_20px_rgba(245,158,11,0.25)] transition-all hover:scale-[1.01] hover:bg-[#FBBF24] hover:shadow-[0_0_30px_rgba(245,158,11,0.4)] py-5">
                    GET ON THE LIST
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 6. BOTTOM CALL TO ACTION                                                  */}
        {/* ========================================================================= */}
        <section className="relative overflow-hidden rounded-2xl border border-[#1E4D5A] bg-gradient-to-b from-[#0B2026] via-[#071F24] to-[#04181C] p-8 sm:p-14 text-center shadow-[0_0_40px_rgba(52,183,221,0.15)]">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-4xl sm:text-6xl uppercase tracking-tight text-[#F8F7F4]">
              SECURE YOUR ALLOCATION.
            </h2>
            <p className="mt-4 text-sm sm:text-base text-[#B8D7E0] leading-snug">
              Connect wallet, unbox traits in active drop cycles, and qualify your specimen
              before the November 19 drop on OpenSea SeaDrop.
            </p>

            <div className="mt-8 flex w-full flex-col items-center justify-center gap-3.5 sm:w-auto sm:flex-row sm:gap-4">
              <Link href="/whitelist" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full sm:w-auto border border-[#34B7DD]/60 bg-gradient-to-r from-[#34B7DD] to-[#6FCDE8] font-bold text-base sm:text-lg uppercase tracking-wider text-[#04181C] shadow-[0_0_20px_rgba(52,183,221,0.25)] hover:shadow-[0_0_30px_rgba(52,183,221,0.4)] hover:scale-[1.02] active:scale-[0.99] px-8 py-4 sm:px-10 sm:py-5"
                >
                  GET ON THE LIST
                </Button>
              </Link>
              <Link href="/profile" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="secondary"
                  className="w-full sm:w-auto border border-[#1E4D5A] bg-[#051D22] font-semibold text-base sm:text-lg uppercase tracking-wider text-[#DBF2F9] hover:border-[#34B7DD]/60 hover:text-white px-8 py-4 sm:px-10 sm:py-5"
                >
                  VIEW GEAR
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
