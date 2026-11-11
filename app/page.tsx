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
      <section className="relative w-full overflow-hidden border-b border-[#1A4550] bg-[#061F25] pt-6 pb-14 sm:pt-8 sm:pb-18 lg:pt-10 lg:pb-22">
        {/* Subtle Architectural Grid Lines & Ambient Atmosphere */}
        <div className="pointer-events-none absolute inset-0 select-none">
          {/* Top Edge Jewel Rim */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#34B7DD]/40 to-transparent" />

          {/* Atmospheric Starlet Motel Backdrop */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/bg-starlet-motel.jpg"
            alt="Atmospheric Background"
            className="h-full w-full object-cover object-[75%_25%] opacity-20 filter contrast-105 saturate-[0.8] blur-[2px] scale-105"
          />

          {/* Radiant Centerstage Ambient Lighting */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_55%_at_50%_45%,rgba(52,183,221,0.22),transparent_70%)]" />

          {/* Focal Darkening Vignette around Runway */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_52%,transparent_25%,rgba(6,31,37,0.55)_65%,#061F25_95%)]" />

          {/* Atmospheric Vignettes */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#061F25]/85 via-transparent to-[#061F25]" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#061F25] to-transparent" />
          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#061F25] to-transparent" />
        </div>

        {/* Hero Content Container (Centerstage Runway) */}
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Top Header Block: Monumental Headline & Subtitle */}
          <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
            {/* Monumental Editorial Headline */}
            <h1 className="font-display text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-black uppercase tracking-tight leading-[0.98] text-center select-none">
              <span className="block bg-gradient-to-b from-[#FFFFFF] via-[#F4FBFD] to-[#A2CDD9] bg-clip-text text-transparent drop-shadow-[0_4px_20px_rgba(0,0,0,0.85)]">
                RULE THE STREETS
              </span>
              <span className="block bg-gradient-to-r from-[#4AE2FF] via-[#7DE8FF] to-[#2DA8CD] bg-clip-text text-transparent drop-shadow-[0_0_35px_rgba(52,183,221,0.5)]">
                OF ELYSIUM
              </span>
            </h1>

            {/* High-Caliber Subheading */}
            <p className="mt-3 sm:mt-4 max-w-xl text-center text-xs sm:text-sm md:text-base leading-relaxed text-[#A8CCD7] font-normal">
              A dynamic digital wardrobe engineered for Elysium. Collect modular apparel traits through cyclic drop periods, compose your signature specimen, and clear guaranteed allocation for OpenSea SeaDrop.
            </p>
          </div>

          {/* Middle Stage: 3D Coverflow Runway Carousel */}
          <div className="mt-6 sm:mt-8 w-full">
            <CoverflowCarousel />
          </div>

          {/* Bottom Action Console */}
          <div className="mt-7 sm:mt-8 flex flex-col items-center">
            {/* Luxury Actions (Strictly Clean & Icon-Free) */}
            <div className="flex w-full flex-col gap-3.5 sm:gap-4 sm:w-auto sm:flex-row justify-center items-center">
              <Link href="/whitelist" className="w-full sm:w-auto">
                <button
                  type="button"
                  className="group relative flex w-full sm:w-auto items-center justify-center overflow-hidden rounded-xl border border-[#7AE5FF]/80 bg-gradient-to-b from-[#4ED5F8] via-[#34B7DD] to-[#1E97BC] px-8 sm:px-11 py-3.5 sm:py-4 font-sans text-xs sm:text-sm font-black uppercase tracking-[0.2em] text-[#021418] shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.85),0_10px_32px_rgba(52,183,221,0.45)] transition-all duration-300 hover:from-[#72E2FF] hover:via-[#42C8EC] hover:to-[#26A6CC] hover:shadow-[inset_0_1px_2px_rgba(255,255,255,1),0_14px_42px_rgba(52,183,221,0.7)] active:scale-[0.98] cursor-pointer"
                >
                  <span className="relative z-10 transition-transform duration-300 group-hover:scale-[1.02]">
                    GET ON THE LIST
                  </span>
                </button>
              </Link>
              <Link href="/drops" className="w-full sm:w-auto">
                <button
                  type="button"
                  className="group relative flex w-full sm:w-auto items-center justify-center overflow-hidden rounded-xl border border-[#34B7DD]/60 bg-gradient-to-b from-[#0D343F]/95 via-[#07242C]/95 to-[#04191F]/95 px-8 sm:px-11 py-3.5 sm:py-4 font-sans text-xs sm:text-sm font-extrabold uppercase tracking-[0.2em] text-[#E0F5FA] shadow-[inset_0_1px_1px_rgba(255,255,255,0.35),inset_0_0_24px_rgba(52,183,221,0.12),0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur-2xl transition-all duration-300 hover:border-[#6DE0FF] hover:from-[#134452] hover:via-[#0A2E38] hover:to-[#052129] hover:text-white hover:shadow-[inset_0_1px_2px_rgba(255,255,255,0.65),0_0_36px_rgba(52,183,221,0.45)] active:scale-[0.98] cursor-pointer"
                >
                  <span className="relative z-10 transition-transform duration-300 group-hover:scale-[1.02]">
                    OPEN CRATES
                  </span>
                </button>
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
                Claim free crate drops during 30-minute windows across periodic cycles. Pull duplicate
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
                  <Button variant="primary" size="lg" className="w-full justify-center">
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
                  <Button variant="gold" size="lg" className="w-full justify-center">
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
                  variant="primary"
                  size="lg"
                  className="w-full sm:w-auto px-8 sm:px-11"
                >
                  GET ON THE LIST
                </Button>
              </Link>
              <Link href="/profile" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="secondary"
                  className="w-full sm:w-auto px-8 sm:px-11"
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
