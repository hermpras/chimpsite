import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Gift,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function HomePage() {
  return (
    <div className="relative w-full overflow-hidden">
      {/* ========================================================================= */}
      {/* 1. HERO SECTION: Full-Width Cinematic Splash                              */}
      {/* ========================================================================= */}
      <section className="relative w-full overflow-hidden pt-6 pb-16 sm:pt-10 sm:pb-20 lg:pt-14 lg:pb-24 border-b border-[#163B44]">
        {/* Full-Bleed Background Backdrop */}
        <div className="pointer-events-none absolute inset-0 select-none">
          {/* Base Artwork Image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/bg-starlet-motel.jpg"
            alt="Starlet Motel Leonida Background"
            className="h-full w-full object-cover object-[75%_25%] sm:object-[80%_center] opacity-40 lg:opacity-50 filter saturate-125 brightness-90"
          />

          {/* Cinematic Vignette & Gradients for Razor-Sharp Typography Contrast */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#04181C] via-[#04181C]/95 to-transparent sm:via-[#04181C]/85 w-full lg:w-3/5" />
          <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#04181C] via-[#04181C]/85 to-transparent" />
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#04181C] to-transparent" />

          {/* Ambient Lighting Bleed */}
          <div className="absolute top-1/4 right-1/4 h-[420px] w-[420px] rounded-full bg-[#34B7DD]/12 blur-[140px]" />
          <div className="absolute top-10 right-10 h-[300px] w-[300px] rounded-full bg-[#F59E0B]/10 blur-[120px]" />
        </div>

        {/* Hero Content Container */}
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-8">
            {/* Left: Headline and Actions */}
            <div className="flex flex-col items-start lg:col-span-7">
              <h1 className="font-display text-5xl sm:text-7xl md:text-8xl lg:text-9xl uppercase tracking-tight leading-[0.92] text-[#F8F7F4] drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]">
                RULE THE <br />
                <span className="inline-block pr-5 sm:pr-7 pb-1 text-transparent bg-clip-text bg-gradient-to-r from-[#34B7DD] via-[#6FCDE8] to-[#F59E0B]">
                  STREETS
                </span>
                <br />
                OF ELYSIUM.
              </h1>

              <p className="mt-6 max-w-xl text-base leading-snug sm:leading-normal text-[#DBF2F9] sm:text-lg">
                Vice City grit meets hyper-speed on-chain execution on Elysium L2.
                Zero roadmap fairy tales. Assemble your 5-piece fit, claim
                limited cycle crates, and secure guaranteed allowlist standing.
              </p>

              {/* Action Buttons */}
              <div className="mt-8 flex w-full flex-col gap-4 sm:w-auto sm:flex-row">
                <Link href="/whitelist" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className="w-full gap-3 border border-[#34B7DD]/70 bg-gradient-to-r from-[#34B7DD] to-[#6FCDE8] font-bold text-base sm:text-lg uppercase tracking-wider text-[#04181C] shadow-[0_0_25px_rgba(52,183,221,0.35)] transition-all hover:scale-[1.02] hover:shadow-[0_0_35px_rgba(52,183,221,0.5)] active:scale-[0.99] sm:w-auto px-6 py-4 sm:px-8 sm:py-5"
                  >
                    GET ON THE LIST <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/drops" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    variant="secondary"
                    className="w-full gap-3 border border-[#1E4D5A] bg-[#0B2026]/90 backdrop-blur-md font-semibold text-base sm:text-lg uppercase tracking-wider text-[#DBF2F9] transition-all hover:border-[#34B7DD]/60 hover:text-white hover:bg-[#102B33] active:scale-[0.99] sm:w-auto px-6 py-4 sm:px-8 sm:py-5"
                  >
                    OPEN CRATES <Gift className="h-5 w-5 text-[#34B7DD]" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Right: Blister Pack / Action Card */}
            <div className="flex flex-col items-center justify-center lg:col-span-5">
              <div className="relative w-full max-w-[360px] sm:max-w-[400px]">
                {/* Clean Genesis Tag */}
                <div className="absolute -top-3 -right-2 z-20 rounded-md border border-[#34B7DD]/60 bg-[#0B2026] px-3 py-1 text-xs font-bold tracking-wider text-[#34B7DD] shadow-lg uppercase">
                  GENESIS DROP
                </div>

                {/* Main Card */}
                <div className="relative overflow-hidden rounded-2xl border border-[#1E4D5A] bg-gradient-to-b from-[#0B2026]/95 via-[#071F24]/90 to-[#04181C] p-5 shadow-[0_20px_50px_rgba(4,24,28,0.8)] backdrop-blur-md">
                  {/* Top Punch Hole */}
                  <div className="mb-4 flex items-center justify-between border-b border-[#163B44] pb-3">
                    <div className="h-3.5 w-12 rounded-full border border-[#163B44] bg-[#04181C]" />
                    <span className="text-[11px] font-bold text-[#34B7DD] tracking-widest uppercase">
                      GENESIS MASK
                    </span>
                    <div className="h-2.5 w-2.5 rounded-full bg-[#34B7DD] shadow-[0_0_8px_rgba(52,183,221,0.8)]" />
                  </div>

                  {/* Composite Pixel Mascot Canvas */}
                  <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-[#163B44] bg-[#04181C] shadow-inner">
                    {/* Layer 0: Background */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/traits/sky.png"
                      alt="Mascot Sky Background"
                      width={360}
                      height={360}
                      loading="eager"
                      fetchPriority="high"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]"
                    />

                    {/* Layer 1: Base Chimp Structure */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/chimp-base-bw.png"
                      alt="Mascot Base Chimp"
                      width={360}
                      height={360}
                      loading="eager"
                      fetchPriority="high"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated] opacity-35"
                    />

                    {/* Layer 2: Fur Layer */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/traits/gold.png"
                      alt="Mascot Golden Fur"
                      width={360}
                      height={360}
                      loading="eager"
                      fetchPriority="high"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]"
                    />

                    {/* Layer 3: Clothing Layer */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/traits/varsity-jacket.png"
                      alt="Mascot Varsity Jacket"
                      width={360}
                      height={360}
                      loading="eager"
                      fetchPriority="high"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]"
                    />

                    {/* Layer 4: Headwear Layer */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/traits/snapback.png"
                      alt="Mascot Snapback"
                      width={360}
                      height={360}
                      loading="eager"
                      fetchPriority="high"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]"
                    />

                    {/* Layer 5: Eyewear Layer */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/traits/matrix-shades.png"
                      alt="Mascot Matrix Shades"
                      width={360}
                      height={360}
                      loading="eager"
                      fetchPriority="high"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]"
                    />

                    {/* Holo reflection glare */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent" />
                  </div>

                  {/* 5-Piece Equipment Spec */}
                  <div className="mt-4 grid grid-cols-5 gap-1 text-[9px] font-bold text-center uppercase">
                    <div className="border border-[#163B44] bg-[#051D22] py-1 text-[#8AA8B2]">
                      BG
                    </div>
                    <div className="border border-[#F59E0B]/40 bg-[#F59E0B]/10 py-1 text-[#FBBF24]">
                      GOLD
                    </div>
                    <div className="border border-violet-500/40 bg-violet-500/10 py-1 text-violet-300">
                      VARSITY
                    </div>
                    <div className="border border-yellow-500/40 bg-yellow-500/10 py-1 text-yellow-300">
                      SNAP
                    </div>
                    <div className="border border-[#34B7DD]/40 bg-[#34B7DD]/10 py-1 text-[#6FCDE8]">
                      SHADES
                    </div>
                  </div>

                  {/* Bottom Microcopy */}
                  <div className="mt-3 flex items-center justify-between border-t border-[#163B44] pt-2 text-[9px] text-[#8AA8B2]">
                    <span>EDITION #0001</span>
                    <span>AUTHENTICATED ON ELYSIUM L2</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. INFINITE STREET MARQUEE TICKER (Edge-to-Edge Full Width)               */}
      {/* ========================================================================= */}
      <div className="relative w-full overflow-hidden border-y border-[#1E4D5A] bg-[#051D22] py-3.5 shadow-lg mb-20">
        <div className="animate-marquee font-display text-xl sm:text-2xl uppercase tracking-wider">
          <span className="mx-6 text-[#FBBF24]">✦ NOVEMBER 19 DROP</span>
          <span className="mx-6 text-[#F8F7F4]">✦ ENTER ELYSIUM LAYER 2</span>
          <span className="mx-6 text-[#34B7DD]">✦ 5-PIECE GEAR LOCK</span>
          <span className="mx-6 text-emerald-400">✦ SUB-SECOND FINALITY</span>
          <span className="mx-6 text-[#FBBF24]">✦ GTD & FCFS ALLOWLIST</span>
          <span className="mx-6 text-[#F8F7F4]">✦ POWERED BY KINETIQ</span>
          <span className="mx-6 text-[#FBBF24]">✦ NOVEMBER 19 DROP</span>
          <span className="mx-6 text-[#F8F7F4]">✦ ENTER ELYSIUM LAYER 2</span>
          <span className="mx-6 text-[#34B7DD]">✦ 5-PIECE GEAR LOCK</span>
          <span className="mx-6 text-emerald-400">✦ SUB-SECOND FINALITY</span>
          <span className="mx-6 text-[#FBBF24]">✦ GTD & FCFS ALLOWLIST</span>
          <span className="mx-6 text-[#F8F7F4]">✦ POWERED BY KINETIQ</span>
        </div>
      </div>

      {/* Main Page Container for Content Sections */}
      <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 sm:pb-24 lg:px-8">
        {/* ========================================================================= */}
        {/* 3. THE 3 SYNDICATE PILLARS                                                */}
        {/* ========================================================================= */}
        <section className="mb-20">
          <div className="mb-10 flex flex-col items-start justify-between gap-4 border-b border-[#163B44] pb-6 sm:flex-row sm:items-end">
            <div>
              <h2 className="font-display text-4xl sm:text-6xl uppercase tracking-tight text-[#F8F7F4]">
                THE 3 GROUND RULES.
              </h2>
            </div>
            <p className="max-w-md text-sm sm:text-base text-[#B8D7E0] leading-snug">
              Built directly on Elysium L2. Engineered for high-speed looting,
              dynamic avatar composition, and real collector distribution.
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
                Clothing, Headwear, and Eyewear to assemble and flex your custom
                Leonida syndicate identity.
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
        {/* 4. THE 3-STEP HEIST PROTOCOL (How to Get In)                              */}
        {/* ========================================================================= */}
        <section className="mb-20 rounded-2xl border border-[#1E4D5A] bg-gradient-to-r from-[#071F24] via-[#051D22] to-[#0B2026] p-6 sm:p-10 shadow-xl">
          <div className="mb-8 flex flex-col items-start justify-between gap-2 border-b border-[#163B44] pb-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="font-display text-3xl sm:text-5xl uppercase tracking-tight text-[#F8F7F4]">
                HOW TO SECURE YOUR SPOT.
              </h2>
            </div>
            <span className="text-xs text-[#8AA8B2]">
              3 Steps • Non-Custodial • 1:1 Identity
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
                  <Button className="w-full justify-between border border-[#34B7DD]/60 bg-gradient-to-r from-[#34B7DD] to-[#6FCDE8] font-bold text-base sm:text-lg uppercase tracking-wider text-[#04181C] shadow-[0_0_20px_rgba(52,183,221,0.25)] transition-all hover:scale-[1.01] hover:shadow-[0_0_30px_rgba(52,183,221,0.4)] py-5">
                    OPEN CRATES <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Bento Card 2: Allowlist Clearance */}
            <div className="relative rounded-2xl border border-[#F59E0B]/40 bg-gradient-to-b from-[#0F231D]/80 via-[#071F24] to-[#04181C] p-8 shadow-[0_10px_35px_rgba(245,158,11,0.1)]">
              <h3 className="font-display text-3xl sm:text-4xl uppercase tracking-tight text-[#F8F7F4]">
                The Syndicate Pass
              </h3>
              <p className="mt-3 text-sm leading-snug text-[#B8D7E0]">
                Guaranteed (GTD) and FCFS allowlist export for official mint
                day on OpenSea SeaDrop. Check qualification status, complete community missions,
                or verify your 5/5 outfit to claim your pass.
              </p>

              <div className="mt-8 pt-4 border-t border-[#163B44]">
                <Link href="/whitelist" className="block w-full">
                  <Button className="w-full justify-between border border-[#F59E0B]/60 bg-[#F59E0B] font-bold text-base sm:text-lg uppercase tracking-wider text-[#04181C] shadow-[0_0_20px_rgba(245,158,11,0.25)] transition-all hover:scale-[1.01] hover:bg-[#FBBF24] hover:shadow-[0_0_30px_rgba(245,158,11,0.4)] py-5">
                    GET ON THE LIST <ArrowRight className="h-5 w-5" />
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
              JOIN THE SYNDICATE.
            </h2>
            <p className="mt-4 text-sm sm:text-base text-[#B8D7E0] leading-snug">
              Elysium Layer 2 on Hyperliquid. Connect wallet, loot crates, and
              get cleared before the November 19 mint drop.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link href="/whitelist">
                <Button
                  size="lg"
                  className="border border-[#34B7DD]/60 bg-gradient-to-r from-[#34B7DD] to-[#6FCDE8] font-bold text-base sm:text-lg uppercase tracking-wider text-[#04181C] shadow-[0_0_20px_rgba(52,183,221,0.25)] hover:shadow-[0_0_30px_rgba(52,183,221,0.4)] hover:scale-[1.02] active:scale-[0.99] px-6 py-4 sm:px-8 sm:py-5"
                >
                  GET ON THE LIST
                </Button>
              </Link>
              <Link href="/profile">
                <Button
                  size="lg"
                  variant="secondary"
                  className="border border-[#1E4D5A] bg-[#051D22] font-semibold text-base sm:text-lg uppercase tracking-wider text-[#DBF2F9] hover:border-[#34B7DD]/60 hover:text-white px-6 py-4 sm:px-8 sm:py-5"
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
