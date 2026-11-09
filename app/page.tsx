import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function HomePage() {
  return (
    <div className="relative w-full overflow-hidden">
      {/* ========================================================================= */}
      {/* 1. HERO SECTION: Luxury Brutalist Editorial Gallery                       */}
      {/* ========================================================================= */}
      <section className="relative w-full overflow-hidden border-b border-[#163B44]/80 bg-[#04181C] pt-10 pb-16 sm:pt-14 sm:pb-24 lg:pt-18 lg:pb-28">
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

          {/* Precision Vignettes (Pure Dark Depth, Zero Blurry Rainbow Blobs) */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#04181C] via-[#04181C]/92 to-[#04181C]/75" />
          <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[#04181C] to-transparent" />
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#04181C] to-transparent" />
        </div>

        {/* Hero Content Container */}
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-12">
            {/* Left: Editorial Statement & Primary Actions */}
            <div className="flex flex-col items-start lg:col-span-7">
              {/* Overhead Monospace Spec Sheet Tag */}
              <div className="mb-5 inline-flex items-center gap-3 border border-[#163B44] bg-[#071F24]/85 px-3.5 py-1.5 backdrop-blur-sm">
                <span className="font-mono text-[11px] font-medium tracking-[0.22em] text-[#8AA8B2] uppercase">
                  CHIMPHOOD ARCHIVE
                </span>
                <span className="text-[10px] text-[#163B44]">|</span>
                <span className="font-mono text-[11px] font-medium tracking-[0.18em] text-[#34B7DD] uppercase">
                  5-PIECE GEAR MATRIX
                </span>
              </div>

              {/* Monolithic Editorial Headline */}
              <h1 className="font-display text-4xl sm:text-6xl md:text-8xl lg:text-9xl uppercase tracking-tight leading-[0.88] text-[#F8F7F4]">
                FIVE PIECES.
                <br />
                <span className="text-[#34B7DD]">ONE COLLECTIVE.</span>
              </h1>

              {/* Refined Luxury Subtitle */}
              <p className="mt-6 max-w-xl text-base leading-relaxed text-[#B8D7E0] sm:text-lg font-normal">
                Modular avatar compositing with zero gas friction. Collect five distinct
                gear categories through drop cycles, assemble your signature specimen,
                and clear guaranteed allocation for OpenSea SeaDrop.
              </p>

              {/* Action Buttons (Strictly Clean & Icon-Free) */}
              <div className="mt-8 flex w-full flex-col gap-3.5 sm:w-auto sm:flex-row">
                <Link href="/whitelist" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className="w-full border border-[#34B7DD] bg-[#34B7DD] font-semibold text-sm sm:text-base uppercase tracking-[0.14em] text-[#04181C] shadow-[0_0_24px_rgba(52,183,221,0.25)] transition-all hover:bg-[#6FCDE8] hover:shadow-[0_0_36px_rgba(52,183,221,0.4)] active:scale-[0.99] sm:w-auto px-8 py-4 sm:py-5"
                  >
                    GET ON THE LIST
                  </Button>
                </Link>
                <Link href="/drops" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    variant="secondary"
                    className="w-full border border-[#163B44] bg-[#071F24]/80 backdrop-blur-md font-semibold text-sm sm:text-base uppercase tracking-[0.14em] text-[#DBF2F9] transition-all hover:border-[#34B7DD]/60 hover:text-white hover:bg-[#0B2A32] active:scale-[0.99] sm:w-auto px-8 py-4 sm:py-5"
                  >
                    OPEN CRATES
                  </Button>
                </Link>
              </div>

              {/* Micro Telemetry Spec Row */}
              <div className="mt-10 grid grid-cols-3 gap-6 border-t border-[#163B44]/80 pt-6 w-full max-w-lg">
                <div>
                  <div className="font-mono text-[10px] tracking-[0.18em] text-[#8AA8B2] uppercase">
                    CAPACITY
                  </div>
                  <div className="mt-1 font-display text-xl text-[#F8F7F4] tracking-wide">
                    1,000 SLOTS
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[10px] tracking-[0.18em] text-[#8AA8B2] uppercase">
                    ANATOMY
                  </div>
                  <div className="mt-1 font-display text-xl text-[#34B7DD] tracking-wide">
                    5 TIERS
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[10px] tracking-[0.18em] text-[#8AA8B2] uppercase">
                    SETTLEMENT
                  </div>
                  <div className="mt-1 font-display text-xl text-[#F8F7F4] tracking-wide">
                    SEADROP
                  </div>
                </div>
              </div>
            </div>

            {/* Right: The Exhibition Pedestal Frame */}
            <div className="flex flex-col items-center justify-center lg:col-span-5">
              <div className="relative w-full max-w-[380px] sm:max-w-[420px]">
                {/* Minimalist Specimen Card */}
                <div className="relative overflow-hidden border border-[#1E4D5A]/80 bg-[#071F24]/90 p-5 shadow-[0_24px_60px_rgba(2,10,12,0.9)] backdrop-blur-md">
                  {/* Top Architectural Metadata Header */}
                  <div className="mb-4 flex items-center justify-between border-b border-[#163B44] pb-3 font-mono text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tracking-[0.16em] text-[#F8F7F4] uppercase">
                        SPECIMEN
                      </span>
                      <span className="text-[#8AA8B2]">#0001</span>
                    </div>
                    <span className="border border-[#34B7DD]/40 bg-[#04181C] px-2 py-0.5 text-[10px] font-medium tracking-[0.14em] text-[#34B7DD] uppercase">
                      ACTIVE FIT
                    </span>
                  </div>

                  {/* High-Resolution Layered Canvas */}
                  <div className="relative aspect-square w-full overflow-hidden border border-[#163B44] bg-[#04181C] shadow-inner">
                    {/* Layer 0: Background */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/traits/sky.png"
                      alt="Trait Background Sky"
                      width={360}
                      height={360}
                      loading="eager"
                      fetchPriority="high"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]"
                    />

                    {/* Layer 1: Base Chimp */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/chimp-base-bw.png"
                      alt="Trait Base Structure"
                      width={360}
                      height={360}
                      loading="eager"
                      fetchPriority="high"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated] opacity-35"
                    />

                    {/* Layer 2: Fur */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/traits/gold.png"
                      alt="Trait Fur Gold"
                      width={360}
                      height={360}
                      loading="eager"
                      fetchPriority="high"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]"
                    />

                    {/* Layer 3: Clothing */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/traits/varsity-jacket.png"
                      alt="Trait Apparel Varsity Jacket"
                      width={360}
                      height={360}
                      loading="eager"
                      fetchPriority="high"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]"
                    />

                    {/* Layer 4: Headwear */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/traits/snapback.png"
                      alt="Trait Headwear Snapback"
                      width={360}
                      height={360}
                      loading="eager"
                      fetchPriority="high"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]"
                    />

                    {/* Layer 5: Eyewear */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/traits/matrix-shades.png"
                      alt="Trait Eyewear Matrix Shades"
                      width={360}
                      height={360}
                      loading="eager"
                      fetchPriority="high"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]"
                    />

                    {/* Subtle Studio Lighting Glare */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.04] to-transparent" />
                  </div>

                  {/* 5-Tier Apparel Specimen Grid */}
                  <div className="mt-4 grid grid-cols-5 gap-1.5 font-mono text-[10px] text-center uppercase">
                    <div className="border border-[#163B44] bg-[#04181C] py-2 px-1">
                      <span className="block text-[8px] text-[#8AA8B2] tracking-wider">
                        01 BG
                      </span>
                      <span className="mt-0.5 block font-semibold text-[#DBF2F9] truncate">
                        SKY
                      </span>
                    </div>
                    <div className="border border-[#163B44] bg-[#04181C] py-2 px-1">
                      <span className="block text-[8px] text-[#8AA8B2] tracking-wider">
                        02 FUR
                      </span>
                      <span className="mt-0.5 block font-semibold text-[#FBBF24] truncate">
                        GOLD
                      </span>
                    </div>
                    <div className="border border-[#163B44] bg-[#04181C] py-2 px-1">
                      <span className="block text-[8px] text-[#8AA8B2] tracking-wider">
                        03 FIT
                      </span>
                      <span className="mt-0.5 block font-semibold text-[#DBF2F9] truncate">
                        VARSITY
                      </span>
                    </div>
                    <div className="border border-[#163B44] bg-[#04181C] py-2 px-1">
                      <span className="block text-[8px] text-[#8AA8B2] tracking-wider">
                        04 HEAD
                      </span>
                      <span className="mt-0.5 block font-semibold text-[#DBF2F9] truncate">
                        SNAP
                      </span>
                    </div>
                    <div className="border border-[#163B44] bg-[#04181C] py-2 px-1">
                      <span className="block text-[8px] text-[#8AA8B2] tracking-wider">
                        05 EYE
                      </span>
                      <span className="mt-0.5 block font-semibold text-[#34B7DD] truncate">
                        SHADES
                      </span>
                    </div>
                  </div>

                  {/* Bottom Verification Telemetry */}
                  <div className="mt-3.5 flex items-center justify-between border-t border-[#163B44] pt-2.5 font-mono text-[9px] tracking-[0.14em] text-[#8AA8B2] uppercase">
                    <span>LAYER MATRIX RESOLVED</span>
                    <span className="text-[#34B7DD]">OPENSEA READY</span>
                  </div>
                </div>
              </div>
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
