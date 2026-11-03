import React from "react";
import Link from "next/link";
import {
  Shield,
  Gift,
  User,
  FileText,
  ArrowRight,
  Flame,
  Zap,
  Layers,
  Share2,
  Clock,
  Sparkles,
  Check,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export default function HomePage() {
  return (
    <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8 overflow-hidden">
      {/* Subtle Grain / Ambient Sunset Bleed in Background */}
      <div className="pointer-events-none absolute -top-20 left-1/3 h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-amber-500/15 via-pink-500/10 to-cyan-500/10 blur-[130px]" />
      <div className="pointer-events-none absolute top-1/2 -right-32 h-[450px] w-[450px] rounded-full bg-cyan-500/10 blur-[150px]" />

      {/* ========================================================================= */}
      {/* 1. HERO SECTION: Massive Typography & Collector's Blister Pack              */}
      {/* ========================================================================= */}
      <section className="relative mb-16 pt-4 sm:pt-8 lg:pt-12">
        {/* Top Industrial Telemetry Strip */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b-2 border-gray-800 pb-3 font-mono-street text-[11px] uppercase tracking-widest text-gray-400">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
            <span className="font-bold text-amber-400">ELYCHIMP SYNDICATE</span>
            <span className="text-gray-600">//</span>
            <span>HYPERLIQUID L2</span>
          </div>
          <div className="flex items-center gap-4 text-gray-400">
            <span className="hidden sm:inline">CYCLE 04 LIVE</span>
            <span className="rounded bg-amber-400/10 px-2 py-0.5 font-bold text-amber-300 border border-amber-400/30">
              MINT: NOV 19
            </span>
          </div>
        </div>

        {/* Main Hero Grid */}
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-8">
          {/* Left: Heavy Poster Typography */}
          <div className="flex flex-col items-start lg:col-span-7">
            {/* Tag Badge */}
            <div className="mb-4 inline-flex items-center gap-2 border-2 border-amber-400 bg-amber-400/10 px-3 py-1 font-mono-street text-xs font-black uppercase tracking-wider text-amber-300">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <span>Leonida Street Protocol</span>
            </div>

            {/* Giant Display Headline */}
            <h1 className="font-display text-5xl sm:text-7xl md:text-8xl lg:text-9xl uppercase tracking-tighter leading-[0.88] text-white">
              RULE THE <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-200 to-cyan-400">
                STREETS
              </span>{" "}
              <br />
              OF ELYSIUM.
            </h1>

            {/* Sharp Subhead */}
            <p className="mt-6 max-w-xl text-base leading-relaxed text-gray-300 sm:text-lg">
              GTA 6 Vice City heat meets hyper-speed on-chain execution.
              Zero roadmap fairy tales. Assemble your 5-piece fit, claim
              limited cycle crates, and secure guaranteed allowlist standing.
            </p>

            {/* Brutalist Action Buttons */}
            <div className="mt-8 flex w-full flex-col gap-4 sm:w-auto sm:flex-row">
              <Link href="/whitelist" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full gap-3 border-2 border-black bg-amber-400 font-display text-xl tracking-wider uppercase text-black shadow-brutal transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-amber-300 active:translate-x-1 active:translate-y-1 active:shadow-none sm:w-auto px-8 py-6"
                >
                  GET ON THE LIST <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <Link href="/drops" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="secondary"
                  className="w-full gap-3 border-2 border-gray-700 bg-[#12141d] font-display text-xl tracking-wider uppercase text-white shadow-brutal transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-cyan-400 hover:text-cyan-300 active:translate-x-1 active:translate-y-1 active:shadow-none sm:w-auto px-8 py-6"
                >
                  OPEN CRATES <Gift className="h-5 w-5 text-cyan-400" />
                </Button>
              </Link>
            </div>

            {/* Secondary Direct Links */}
            <div className="mt-8 flex flex-wrap items-center gap-6 font-mono-street text-xs uppercase tracking-wider text-gray-400">
              <Link
                href="/profile"
                className="flex items-center gap-1.5 font-bold text-gray-300 transition-colors hover:text-amber-400"
              >
                <User className="h-3.5 w-3.5 text-amber-400" />
                <span>[01] My Syndicate ID</span>
              </Link>
              <span className="text-gray-700">/</span>
              <Link
                href="/docs"
                className="flex items-center gap-1.5 font-bold text-gray-300 transition-colors hover:text-cyan-400"
              >
                <FileText className="h-3.5 w-3.5 text-cyan-400" />
                <span>[02] System Dossier</span>
              </Link>
            </div>
          </div>

          {/* Right: Physical Blister Pack / Action Toy Card */}
          <div className="flex flex-col items-center justify-center lg:col-span-5">
            <div className="relative w-full max-w-[360px] sm:max-w-[400px]">
              {/* Slanted Street Sticker */}
              <div className="absolute -top-4 -right-2 z-20 rotate-6 border-2 border-black bg-yellow-300 px-3 py-1 font-display text-xs tracking-wider text-black shadow-brutal-sm uppercase">
                VICE CITY SPEC // 001
              </div>

              {/* Main Physical Hangtag Card */}
              <div className="relative overflow-hidden rounded-2xl border-2 border-gray-700 bg-gradient-to-b from-[#141620] via-[#0d0f17] to-[#07080c] p-5 shadow-2xl">
                {/* Top Hangtag Punch-Hole Simulation */}
                <div className="mb-4 flex items-center justify-between border-b border-gray-800 pb-3">
                  <div className="h-3.5 w-12 rounded-full border border-gray-700 bg-black/60" />
                  <span className="font-mono-street text-[10px] font-bold text-amber-400 tracking-widest uppercase">
                    GENESIS MASK
                  </span>
                  <div className="h-3 w-3 rounded-full bg-cyan-400/80 animate-pulse" />
                </div>

                {/* Composite Pixel Mascot Canvas */}
                <div className="relative aspect-square w-full overflow-hidden rounded-xl border-2 border-black bg-[#050609] shadow-inner">
                  {/* Layer 0: Background */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/traits/sky.png"
                    alt="Mascot Sky Background"
                    className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]"
                  />

                  {/* Layer 1: Base Chimp Structure */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/images/chimp-base-bw.png"
                    alt="Mascot Base Chimp"
                    className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated] opacity-35"
                  />

                  {/* Layer 2: Fur Layer */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/traits/gold.png"
                    alt="Mascot Golden Fur"
                    className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]"
                  />

                  {/* Layer 3: Clothing Layer */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/traits/varsity-jacket.png"
                    alt="Mascot Varsity Jacket"
                    className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]"
                  />

                  {/* Layer 4: Headwear Layer */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/traits/snapback.png"
                    alt="Mascot Snapback"
                    className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]"
                  />

                  {/* Layer 5: Eyewear Layer */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/traits/matrix-shades.png"
                    alt="Mascot Matrix Shades"
                    className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]"
                  />

                  {/* Holo reflection glare */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent" />
                </div>

                {/* 5-Piece Equipment Hangtag Spec */}
                <div className="mt-4 grid grid-cols-5 gap-1 font-mono-street text-[9px] font-bold text-center uppercase">
                  <div className="border border-gray-800 bg-gray-900/90 py-1 text-gray-400">
                    BG
                  </div>
                  <div className="border border-amber-500/40 bg-amber-500/10 py-1 text-amber-300">
                    GOLD
                  </div>
                  <div className="border border-violet-500/40 bg-violet-500/10 py-1 text-violet-300">
                    VARSITY
                  </div>
                  <div className="border border-yellow-500/40 bg-yellow-500/10 py-1 text-yellow-300">
                    SNAP
                  </div>
                  <div className="border border-cyan-500/40 bg-cyan-500/10 py-1 text-cyan-300">
                    SHADES
                  </div>
                </div>

                {/* Bottom Barcode / Serial Microcopy */}
                <div className="mt-3 flex items-center justify-between border-t border-gray-800/80 pt-2 font-mono-street text-[9px] text-gray-400">
                  <span>SERIAL // #0001-ELY</span>
                  <span>AUTHENTICATED BY HYPERLIQUID</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. INFINITE STREET MARQUEE TICKER                                          */}
      {/* ========================================================================= */}
      <div className="relative -mx-4 sm:-mx-6 lg:-mx-8 mb-20 overflow-hidden border-y-2 border-amber-400 bg-black py-3 text-black">
        <div className="animate-marquee font-display text-xl sm:text-2xl uppercase tracking-wider text-amber-300">
          <span className="mx-6">✦ NOVEMBER 19 DROP</span>
          <span className="mx-6 text-white">✦ ENTER ELYSIUM LAYER 2</span>
          <span className="mx-6">✦ 5-PIECE GEAR LOCK</span>
          <span className="mx-6 text-cyan-300">✦ SUB-SECOND FINALITY</span>
          <span className="mx-6">✦ GTD & FCFS ALLOWLIST</span>
          <span className="mx-6 text-white">✦ NO SLOP ROADMAP</span>
          <span className="mx-6">✦ NOVEMBER 19 DROP</span>
          <span className="mx-6 text-white">✦ ENTER ELYSIUM LAYER 2</span>
          <span className="mx-6">✦ 5-PIECE GEAR LOCK</span>
          <span className="mx-6 text-cyan-300">✦ SUB-SECOND FINALITY</span>
          <span className="mx-6">✦ GTD & FCFS ALLOWLIST</span>
          <span className="mx-6 text-white">✦ NO SLOP ROADMAP</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. THE 3 SYNDICATE PILLARS: High Contrast Street Dossier                   */}
      {/* ========================================================================= */}
      <section className="mb-20">
        <div className="mb-10 flex flex-col items-start justify-between gap-4 border-b-2 border-gray-800 pb-6 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 font-mono-street text-xs font-bold text-amber-400 uppercase tracking-widest">
              [SYSTEM SPECIFICATION]
            </div>
            <h2 className="font-display text-4xl sm:text-6xl uppercase tracking-tight text-white">
              THE 3 GROUND RULES.
            </h2>
          </div>
          <p className="max-w-md font-mono-street text-xs text-gray-400 leading-relaxed uppercase">
            Built directly on Elysium L2. Engineered for high-speed looting,
            dynamic avatar composition, and real collector distribution.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Rule 01 */}
          <div className="group relative border-2 border-gray-800 bg-[#0c0d14] p-8 transition-all hover:border-amber-400 hover:shadow-brutal-amber">
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
              <span className="font-display text-5xl text-gray-700 transition-colors group-hover:text-amber-400">
                01
              </span>
              <span className="border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono-street text-[10px] font-bold text-amber-300 uppercase">
                HYPERLIQUID L2
              </span>
            </div>
            <h3 className="mt-6 font-display text-2xl uppercase tracking-tight text-white">
              Instant Speed, Zero Gas Pain
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-gray-400">
              Transactions settle in milliseconds. Crate unlocks, trait swaps,
              and transfers don&apos;t drain your wallet with ridiculous gas fees.
              Pure high-frequency execution.
            </p>
          </div>

          {/* Rule 02 */}
          <div className="group relative border-2 border-gray-800 bg-[#0c0d14] p-8 transition-all hover:border-cyan-400 hover:shadow-brutal-cyan">
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
              <span className="font-display text-5xl text-gray-700 transition-colors group-hover:text-cyan-400">
                02
              </span>
              <span className="border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono-street text-[10px] font-bold text-cyan-300 uppercase">
                5-PIECE FIT
              </span>
            </div>
            <h3 className="mt-6 font-display text-2xl uppercase tracking-tight text-white">
              Dynamic Persona Engine
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-gray-400">
              You don&apos;t just hold a static JPEG. Collect Background, Fur,
              Clothing, Headwear, and Eyewear to assemble and flex your custom
              Leonida syndicate identity.
            </p>
          </div>

          {/* Rule 03 */}
          <div className="group relative border-2 border-gray-800 bg-[#0c0d14] p-8 transition-all hover:border-yellow-400 hover:shadow-brutal">
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
              <span className="font-display text-5xl text-gray-700 transition-colors group-hover:text-yellow-400">
                03
              </span>
              <span className="border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 font-mono-street text-[10px] font-bold text-yellow-300 uppercase">
                PEER GIFTING
              </span>
            </div>
            <h3 className="mt-6 font-display text-2xl uppercase tracking-tight text-white">
              Crate Drops & Crew Sharing
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-gray-400">
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
      <section className="mb-20 border-2 border-black bg-gradient-to-r from-[#11131c] via-[#0d0e17] to-[#11131c] p-6 sm:p-10 shadow-brutal">
        <div className="mb-8 flex flex-col items-start justify-between gap-2 border-b border-gray-800 pb-4 sm:flex-row sm:items-end">
          <div>
            <div className="font-mono-street text-xs font-bold text-amber-400 uppercase tracking-widest">
              [CLEARANCE PROCESS]
            </div>
            <h2 className="font-display text-3xl sm:text-5xl uppercase tracking-tight text-white">
              HOW TO SECURE YOUR SPOT.
            </h2>
          </div>
          <span className="font-mono-street text-xs text-gray-400 uppercase">
            3 Steps • Non-Custodial • 1:1 Identity
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="border border-gray-800 bg-black/60 p-6">
            <div className="font-mono-street text-xs font-black text-amber-400">
              PHASE // 01
            </div>
            <h4 className="mt-2 font-display text-xl uppercase text-white">
              Sign In with Ethereum
            </h4>
            <p className="mt-2 text-xs leading-relaxed text-gray-400">
              Connect your EVM wallet via SIWE and link your X (Twitter) account.
              Protected against Sybil clusters and bots.
            </p>
          </div>

          <div className="border border-gray-800 bg-black/60 p-6">
            <div className="font-mono-street text-xs font-black text-cyan-400">
              PHASE // 02
            </div>
            <h4 className="mt-2 font-display text-xl uppercase text-white">
              Loot Crate Cycles
            </h4>
            <p className="mt-2 text-xs leading-relaxed text-gray-400">
              Enter active claim windows to unbox limited traits or receive
              gifts from community peers to build up your inventory.
            </p>
          </div>

          <div className="border border-gray-800 bg-black/60 p-6">
            <div className="font-mono-street text-xs font-black text-yellow-300">
              PHASE // 03
            </div>
            <h4 className="mt-2 font-display text-xl uppercase text-white">
              Lock GTD & FCFS
            </h4>
            <p className="mt-2 text-xs leading-relaxed text-gray-400">
              Complete your 5-piece outfit or submit community missions to
              lock in your Guaranteed (GTD) or FCFS allowlist slot.
            </p>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 5. DUAL ACTION BENTO: Tactile Terminal Panels                             */}
      {/* ========================================================================= */}
      <section className="mb-20">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Bento Card 1: Crate Drops */}
          <div className="relative border-2 border-cyan-400/40 bg-gradient-to-b from-[#0e1624] via-[#090d16] to-[#06070a] p-8 shadow-brutal-cyan">
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
                <span className="font-mono-street text-xs font-bold text-cyan-400 uppercase tracking-widest">
                  CRATE UNBOXING ENGINE
                </span>
              </div>
              <span className="border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 font-mono-street text-[10px] text-cyan-300 uppercase">
                30-MIN CYCLES
              </span>
            </div>

            <h3 className="mt-6 font-display text-3xl sm:text-4xl uppercase tracking-tight text-white">
              Loot Drops & Inventory
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-gray-300">
              Continuous cycle drops with atomic inventory minting. Unpack
              random traits from Common to Legendary, manage your backpack, and
              gift duplicate gear to peers.
            </p>

            <div className="mt-8 pt-4 border-t border-gray-800">
              <Link href="/drops" className="block w-full">
                <Button className="w-full justify-between border-2 border-black bg-cyan-400 font-display text-lg uppercase tracking-wider text-black shadow-brutal transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-cyan-300 py-6">
                  OPEN CRATES <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Bento Card 2: Allowlist Clearance */}
          <div className="relative border-2 border-amber-400/40 bg-gradient-to-b from-[#1c1810] via-[#100e0a] to-[#070605] p-8 shadow-brutal-amber">
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                <span className="font-mono-street text-xs font-bold text-amber-400 uppercase tracking-widest">
                  ALLOWLIST CLEARANCE
                </span>
              </div>
              <span className="border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 font-mono-street text-[10px] text-amber-300 uppercase">
                GTD & FCFS
              </span>
            </div>

            <h3 className="mt-6 font-display text-3xl sm:text-4xl uppercase tracking-tight text-white">
              The Syndicate Pass
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-gray-300">
              Guaranteed (GTD) and FCFS allowlist export for official mint
              day. Check qualification status, complete community hits, or
              verify your 5/5 outfit to claim your pass.
            </p>

            <div className="mt-8 pt-4 border-t border-gray-800">
              <Link href="/whitelist" className="block w-full">
                <Button className="w-full justify-between border-2 border-black bg-amber-400 font-display text-lg uppercase tracking-wider text-black shadow-brutal transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-amber-300 py-6">
                  GET ON THE LIST <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 6. BOTTOM CALL TO ACTION: The Grand Heist                                  */}
      {/* ========================================================================= */}
      <section className="relative overflow-hidden border-2 border-amber-400 bg-black p-8 sm:p-14 text-center shadow-brutal-amber">
        <div className="mx-auto max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 border border-gray-800 bg-gray-900 px-3 py-1 font-mono-street text-xs font-bold text-amber-400 uppercase">
            <Flame className="h-3.5 w-3.5 text-amber-400" />
            PURE ON-CHAIN COLLECTION // @ENTER_ELYSIUM
          </div>
          <h2 className="font-display text-4xl sm:text-6xl uppercase tracking-tight text-white">
            JOIN THE SYNDICATE.
          </h2>
          <p className="mt-4 font-mono-street text-xs sm:text-sm text-gray-400 leading-relaxed uppercase">
            Elysium Layer 2 on Hyperliquid. Connect wallet, loot crates, and
            get cleared before the November 19 mint drop.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/whitelist">
              <Button
                size="lg"
                className="border-2 border-black bg-amber-400 font-display text-xl uppercase tracking-wider text-black shadow-brutal hover:bg-amber-300 px-8 py-6"
              >
                GET ON THE LIST
              </Button>
            </Link>
            <Link href="/profile">
              <Button
                size="lg"
                variant="secondary"
                className="border-2 border-gray-700 bg-gray-900 font-display text-xl uppercase tracking-wider text-white shadow-brutal hover:border-white px-8 py-6"
              >
                VIEW GEAR
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
