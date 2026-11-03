import React from "react";
import Link from "next/link";
import {
  Sparkles,
  Layers,
  Box,
  Clock,
  Gift,
  Share2,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Lock,
  ShieldAlert,
  FileText,
  Users,
  ArrowRight,
  ExternalLink,
  Terminal,
  Zap,
  Check,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export default function DocsPage() {
  const sections = [
    { id: "traits", num: "01", label: "Traits & Inventory", icon: Layers, color: "text-purple-400" },
    { id: "drops", num: "02", label: "Drops & Lootbox", icon: Box, color: "text-amber-400" },
    { id: "gifts", num: "03", label: "Syndicate Gifts", icon: Gift, color: "text-pink-400" },
    { id: "whitelist", num: "04", label: "Allowlist & GTD", icon: ShieldCheck, color: "text-emerald-400" },
    { id: "tasks", num: "05", label: "Quests & Review", icon: FileText, color: "text-cyan-400" },
    { id: "security", num: "06", label: "Security & SIWE", icon: Lock, color: "text-rose-400" },
  ];

  return (
    <div className="relative mx-auto max-w-7xl px-4 py-6 sm:py-12 sm:px-6 lg:px-8 overflow-hidden">
      {/* Background Ambient Glows */}
      <div className="pointer-events-none absolute top-10 right-10 h-72 w-72 sm:h-96 sm:w-96 rounded-full bg-amber-500/10 blur-[130px]" />
      <div className="pointer-events-none absolute top-96 left-10 h-64 w-64 sm:h-80 sm:w-80 rounded-full bg-cyan-500/10 blur-[140px]" />

      {/* Hero Header - GTA 6 Brutalist Streetwear Style */}
      <div className="mb-8 sm:mb-12 border-b-2 border-gray-800 pb-6 sm:pb-8 space-y-4">
        {/* Eyebrow Badges */}
        <div className="flex flex-wrap items-center gap-2 font-mono-street text-[10px] sm:text-[11px] uppercase tracking-wider">
          <span className="inline-flex items-center gap-1.5 border border-amber-400/40 bg-amber-400/10 px-2 sm:px-2.5 py-0.5 font-bold text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
            LEONIDA FIELD MANUAL
          </span>
          <span className="border border-cyan-400/40 bg-cyan-400/10 px-2 sm:px-2.5 py-0.5 font-bold text-cyan-300">
            Elysium L2 // Hyperliquid
          </span>
          <span className="border border-emerald-400/40 bg-emerald-400/10 px-2 sm:px-2.5 py-0.5 font-bold text-emerald-300">
            Official Protocol Dossier
          </span>
        </div>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <h1 className="font-display text-3xl sm:text-5xl lg:text-7xl uppercase tracking-tight text-white leading-tight sm:leading-[0.9] break-words">
              Elychimp Community Guide
            </h1>
            <p className="max-w-3xl font-mono-street text-xs sm:text-sm text-gray-300 leading-relaxed uppercase tracking-wide">
              The definitive operational guide for contraband drops, trait assembly, syndicate gifting, guaranteed allowlist criteria, and non-custodial security.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0 w-full sm:w-auto">
            <Link href="/drops" className="w-full sm:w-auto">
              <Button
                variant="primary"
                size="sm"
                className="w-full sm:w-auto justify-center border border-black bg-amber-400 font-display uppercase tracking-wider text-black hover:bg-amber-300 shadow-brutal-sm text-xs px-4 py-2.5"
              >
                <span>Claim Drops</span>
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
            <Link href="/whitelist" className="w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto justify-center border-2 border-gray-700 bg-gray-900 font-mono-street uppercase text-xs text-gray-300 hover:border-amber-400 hover:text-white px-4 py-2.5"
              >
                <span>Check Allowlist</span>
                <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile Sticky Horizontal Jump Bar (Visible only on mobile < lg) */}
      <div className="lg:hidden -mx-4 px-4 py-2.5 border-y border-gray-800 bg-[#08090d]/95 backdrop-blur-md sticky top-16 z-30 mb-8 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-2 min-w-max font-mono-street text-xs">
          <span className="text-[10px] uppercase font-bold text-gray-500 mr-1 flex items-center gap-1">
            <Terminal className="h-3 w-3 text-amber-400" /> Jump:
          </span>
          {sections.map((sec) => (
            <a
              key={sec.id}
              href={`#${sec.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-800 bg-gray-900/80 px-2.5 py-1 text-[11px] font-bold text-gray-300 hover:border-amber-400 hover:text-white transition-colors"
            >
              <span className="text-amber-400 font-extrabold">{sec.num}</span>
              <span>{sec.label}</span>
            </a>
          ))}
        </div>
      </div>

      {/* Main Grid: Sticky Sidebar Index (Desktop) + Content Panels */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
        {/* Desktop Sticky Sidebar Directory (Visible only on lg+) */}
        <aside className="hidden lg:block lg:col-span-4 lg:sticky lg:top-24 space-y-5">
          <div className="rounded-2xl border-2 border-gray-800 bg-[#0c0d15] p-5 shadow-brutal-sm space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-amber-400" />
                <span className="font-display text-xs uppercase tracking-wider text-white">
                  Dossier Directory
                </span>
              </div>
              <span className="font-mono-street text-[10px] text-amber-400 font-bold uppercase tracking-widest">
                6 Sections
              </span>
            </div>

            <nav className="space-y-1.5 font-mono-street text-xs uppercase">
              {sections.map((item) => {
                const IconComponent = item.icon;
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="group flex items-center justify-between rounded-xl border border-gray-800/80 bg-gray-900/40 p-2.5 transition-all hover:border-amber-400/60 hover:bg-gray-800/60"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-bold text-gray-500 group-hover:text-amber-400 text-[11px]">
                        {item.num}
                      </span>
                      <IconComponent className={`h-3.5 w-3.5 shrink-0 ${item.color}`} />
                      <span className="text-gray-300 group-hover:text-white truncate font-medium text-[11px]">
                        {item.label}
                      </span>
                    </div>
                    <ArrowRight className="h-3 w-3 text-gray-600 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </a>
                );
              })}
            </nav>

            {/* Tactical Protocol Quick Specs */}
            <div className="rounded-xl border border-gray-800/80 bg-[#08090d] p-3.5 space-y-2 text-[11px] font-mono-street">
              <div className="flex items-center justify-between text-gray-400">
                <span>GTD Slot Cap</span>
                <span className="font-bold text-emerald-400">1,000 Slots</span>
              </div>
              <div className="flex items-center justify-between text-gray-400">
                <span>Cycle Frequency</span>
                <span className="font-bold text-amber-400">2-Hour UTC</span>
              </div>
              <div className="flex items-center justify-between text-gray-400">
                <span>Claim Window</span>
                <span className="font-bold text-cyan-400">30 Minutes</span>
              </div>
              <div className="flex items-center justify-between text-gray-400">
                <span>Fit Assembly</span>
                <span className="font-bold text-purple-400">5 Categories</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Content Panels (12 cols on mobile, 8 cols on lg) */}
        <div className="lg:col-span-8 space-y-10 sm:space-y-12">
          {/* =======================================================================
              SECTION 1: TRAIT COLLECTION & INVENTORY
          ======================================================================= */}
          <section id="traits" className="scroll-mt-24 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b-2 border-gray-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-purple-400/40 bg-purple-400/10 text-purple-400">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <span className="font-mono-street text-[10px] font-bold text-purple-400 uppercase tracking-widest">
                    Section 01 // Wardrobe
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl lg:text-3xl uppercase tracking-wider text-white">
                    1. Trait Collection &amp; Inventory
                  </h2>
                </div>
              </div>
              <Badge variant="outline" className="self-start sm:self-auto border-purple-400/40 bg-purple-400/10 text-purple-300 font-mono-street text-[10px] uppercase">
                5 Pieces
              </Badge>
            </div>

            <p className="font-mono-street text-xs sm:text-sm text-gray-300 leading-relaxed uppercase">
              Assemble the five essential streetwear gear categories to complete your full Elychimp fit and unlock guaranteed allowlist eligibility on Elysium L2.
            </p>

            {/* Five Trait Cards Bento */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { name: "BG (Background)", category: "Environment", desc: "Atmospheric Vice City backdrops, ambient neon horizons, and street environments.", border: "border-cyan-400/40", text: "text-cyan-300", bg: "bg-cyan-950/20" },
                { name: "FUR", category: "Base Character", desc: "Primate base coat variants, cybernetic finishes, and raw fur textures.", border: "border-amber-400/40", text: "text-amber-300", bg: "bg-amber-950/20" },
                { name: "CLOTHING", category: "Apparel", desc: "Tactical jackets, varsity hoodies, mafia suits, and signature Leonida streetwear pieces.", border: "border-purple-400/40", text: "text-purple-300", bg: "bg-purple-950/20" },
                { name: "HEADWEAR", category: "Head Gear", desc: "Snapback caps, tactical beanies, cyber halos, and headpiece accessories.", border: "border-emerald-400/40", text: "text-emerald-300", bg: "bg-emerald-950/20" },
                { name: "EYEWEAR", category: "Optics", desc: "Laser visors, dark contraband shades, and tactical augmented-reality goggles.", border: "border-pink-400/40", text: "text-pink-300", bg: "bg-pink-950/20" },
              ].map((c) => (
                <div
                  key={c.name}
                  className={`border-2 ${c.border} ${c.bg} p-4 rounded-xl space-y-2`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-display text-sm uppercase tracking-wider ${c.text}`}>
                      {c.name}
                    </span>
                    <span className="font-mono-street text-[10px] uppercase tracking-wider text-gray-400">
                      {c.category}
                    </span>
                  </div>
                  <p className="font-mono-street text-[11px] text-gray-300 leading-relaxed">
                    {c.desc}
                  </p>
                </div>
              ))}

              <div className="border-2 border-gray-800 bg-[#0c0d15] p-4 rounded-xl flex flex-col justify-between space-y-3">
                <div>
                  <span className="font-display text-sm uppercase tracking-wider text-white">
                    Full Set Qualification
                  </span>
                  <p className="font-mono-street text-[11px] text-gray-400 mt-1 leading-relaxed">
                    Own at least 1 item in each of the 5 categories simultaneously to trigger full trait qualification.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 font-mono-street text-[10px] text-amber-400 font-bold uppercase">
                  <Check className="h-3.5 w-3.5" />
                  <span>Real-time on-chain check</span>
                </div>
              </div>
            </div>

            {/* Key Mechanics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border-2 border-gray-800 bg-[#0c0d15] p-4 sm:p-5 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-purple-400">
                  <Sparkles className="h-4 w-4" />
                  <h4 className="font-display text-base uppercase tracking-wider text-white">
                    Sequential Edition Serial Numbers
                  </h4>
                </div>
                <p className="font-mono-street text-xs text-gray-300 leading-relaxed">
                  Every trait minted through the drop engine carries an immutable, strictly sequential edition number (e.g. Edition #1, Edition #2). Earlier claimants secure lower serial numbers permanently tied to their lootbox claim.
                </p>
              </div>

              <div className="border-2 border-gray-800 bg-[#0c0d15] p-4 sm:p-5 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-cyan-400">
                  <Layers className="h-4 w-4" />
                  <h4 className="font-display text-base uppercase tracking-wider text-white">
                    Auto-Equip &amp; Avatar Composition
                  </h4>
                </div>
                <p className="font-mono-street text-xs text-gray-300 leading-relaxed">
                  Your Profile inspects your inventory and automatically layers your owned items into a high-res 240x240 pixel composite avatar. Traits currently equipped as your active avatar cannot be transferred via gifts.
                </p>
              </div>
            </div>
          </section>

          {/* =======================================================================
              SECTION 2: DROPS & LOOTBOX
          ======================================================================= */}
          <section id="drops" className="scroll-mt-24 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b-2 border-gray-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-amber-400/40 bg-amber-400/10 text-amber-400">
                  <Box className="h-5 w-5" />
                </div>
                <div>
                  <span className="font-mono-street text-[10px] font-bold text-amber-400 uppercase tracking-widest">
                    Section 02 // Contraband Engine
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl lg:text-3xl uppercase tracking-wider text-white">
                    2. Drops &amp; Lootbox
                  </h2>
                </div>
              </div>
              <Badge variant="outline" className="self-start sm:self-auto border-amber-400/40 bg-amber-400/10 text-amber-300 font-mono-street text-[10px] uppercase">
                Cycle Protocol
              </Badge>
            </div>

            <p className="font-mono-street text-xs sm:text-sm text-gray-300 leading-relaxed uppercase">
              Periodic contraband lootbox drops open on a synchronized global clock. Grab mystery pods during the active claim window to collect missing traits.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border-2 border-gray-800 bg-[#0c0d15] p-4 sm:p-5 rounded-2xl space-y-2.5">
                <div className="flex h-9 w-9 items-center justify-center border border-amber-400/30 bg-amber-400/10 text-amber-400 rounded-lg">
                  <Clock className="h-4 w-4" />
                </div>
                <h4 className="font-display text-base uppercase tracking-wider text-white">
                  2-Hour Global UTC Cycle
                </h4>
                <p className="font-mono-street text-xs text-gray-400 leading-relaxed">
                  Drop cycles run continuously every 2 hours, anchored to global UTC time (00:00, 02:00, 04:00, etc.). The clock is identical worldwide for fair international access.
                </p>
              </div>

              <div className="border-2 border-gray-800 bg-[#0c0d15] p-4 sm:p-5 rounded-2xl space-y-2.5">
                <div className="flex h-9 w-9 items-center justify-center border border-amber-400/30 bg-amber-400/10 text-amber-400 rounded-lg">
                  <Zap className="h-4 w-4" />
                </div>
                <h4 className="font-display text-base uppercase tracking-wider text-white">
                  30-Minute Claim Window
                </h4>
                <p className="font-mono-street text-xs text-gray-400 leading-relaxed">
                  Claims unlock strictly for the first <strong className="text-amber-300">30 minutes</strong> of each interval (minute :00 to :30). Once the window closes, cooling mode activates until the next cycle.
                </p>
              </div>

              <div className="border-2 border-gray-800 bg-[#0c0d15] p-4 sm:p-5 rounded-2xl space-y-2.5">
                <div className="flex h-9 w-9 items-center justify-center border border-amber-400/30 bg-amber-400/10 text-amber-400 rounded-lg">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <h4 className="font-display text-base uppercase tracking-wider text-white">
                  1 Claim Per Period
                </h4>
                <p className="font-mono-street text-xs text-gray-400 leading-relaxed">
                  Each authenticated wallet can claim at most <strong className="text-amber-300">one lootbox per period</strong>. Duplicate claims are blocked by database integrity constraints.
                </p>
              </div>
            </div>

            {/* Key Drops Safeguards */}
            <div className="border-2 border-amber-400/40 bg-amber-950/20 p-4 sm:p-6 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-amber-400">
                <AlertCircle className="h-5 w-5" />
                <h4 className="font-display text-base sm:text-lg uppercase tracking-wider text-white">
                  Drop Protection Rules
                </h4>
              </div>
              <ul className="space-y-2 font-mono-street text-xs text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold shrink-0">• GTD Holder Exclusion:</span>
                  <span>Operatives who have already secured an active Guaranteed Whitelist (GTD) slot are prohibited from claiming drops. This preserves crates for hunters still completing their 5-category set.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold shrink-0">• Stock Depletion:</span>
                  <span>Lootbox stock is allocated per period. If period stock is fully claimed before 30 minutes expire, the portal shows <code className="text-amber-300 font-bold">Stock Exhausted</code> until the next schedule.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold shrink-0">• Dual Rate Limiting:</span>
                  <span>Claim endpoints enforce strict rate limits (5 requests / 120s per wallet and 10 requests / 60s per IP) to prevent bot exploitation.</span>
                </li>
              </ul>
            </div>
          </section>

          {/* =======================================================================
              SECTION 3: GIFTS & DUPLICATE SHARING
          ======================================================================= */}
          <section id="gifts" className="scroll-mt-24 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b-2 border-gray-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-pink-400/40 bg-pink-400/10 text-pink-400">
                  <Gift className="h-5 w-5" />
                </div>
                <div>
                  <span className="font-mono-street text-[10px] font-bold text-pink-400 uppercase tracking-widest">
                    Section 03 // Peer Transfer
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl lg:text-3xl uppercase tracking-wider text-white">
                    3. Gifts &amp; Duplicate Sharing
                  </h2>
                </div>
              </div>
              <Badge variant="outline" className="self-start sm:self-auto border-pink-400/40 bg-pink-400/10 text-pink-300 font-mono-street text-[10px] uppercase">
                Syndicate Gifting
              </Badge>
            </div>

            <p className="font-mono-street text-xs sm:text-sm text-gray-300 leading-relaxed uppercase">
              Transfer duplicate traits to fellow syndicate members to help them complete their sets without putting your own allowlist qualification at risk.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Category Retention Rule */}
              <div className="border-2 border-pink-400/40 bg-pink-950/20 p-4 sm:p-5 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-pink-400">
                  <Share2 className="h-5 w-5" />
                  <h4 className="font-display text-base uppercase tracking-wider text-white">
                    Category Retention Rule
                  </h4>
                </div>
                <p className="font-mono-street text-xs text-gray-300 leading-relaxed">
                  To protect operatives from accidentally breaking their 5-trait set, the system strictly enforces the <strong className="text-pink-300">Category Retention Rule</strong>:
                </p>
                <div className="rounded-xl border border-pink-500/30 bg-[#08090d] p-3 space-y-1.5 font-mono-street text-xs">
                  <p className="text-emerald-400 font-bold">✓ Must own at least 2 items in that category to gift one.</p>
                  <p className="text-emerald-400 font-bold">✓ Must retain at least 1 item in the category after transfer.</p>
                  <p className="text-rose-400 font-bold">✕ Cannot gift the trait currently equipped on your Profile.</p>
                </div>
              </div>

              {/* Gifting Lifecycle Rules */}
              <div className="border-2 border-gray-800 bg-[#0c0d15] p-4 sm:p-5 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-pink-400">
                  <Clock className="h-5 w-5" />
                  <h4 className="font-display text-base uppercase tracking-wider text-white">
                    Gifting Lifecycle Rules
                  </h4>
                </div>
                <ul className="space-y-2 font-mono-street text-xs text-gray-300">
                  <li className="flex items-start gap-2">
                    <span className="text-pink-400 font-bold shrink-0">• 1 Gift / Day:</span>
                    <span>Max 1 outgoing gift per wallet per calendar day (UTC 00:00 - 23:59:59).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-pink-400 font-bold shrink-0">• 24h Expiration:</span>
                    <span>Unclaimed gifts expire in 24 hours and revert automatically back to the sender.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-pink-400 font-bold shrink-0">• Manual Claim:</span>
                    <span>Recipient must visit Profile &gt; Gifts to inspect and accept the transfer.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-pink-400 font-bold shrink-0">• Recipient Eligibility:</span>
                    <span>GTD Allowlist holders cannot receive gifts, and recipients cannot already own the specific trait.</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* =======================================================================
              SECTION 4: WHITELIST: GTD & FCFS
          ======================================================================= */}
          <section id="whitelist" className="scroll-mt-24 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b-2 border-gray-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-emerald-400/40 bg-emerald-400/10 text-emerald-400">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <span className="font-mono-street text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                    Section 04 // Allocation Tiers
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl lg:text-3xl uppercase tracking-wider text-white">
                    4. Whitelist: GTD &amp; FCFS
                  </h2>
                </div>
              </div>
              <Badge variant="outline" className="self-start sm:self-auto border-emerald-400/40 bg-emerald-400/10 text-emerald-300 font-mono-street text-[10px] uppercase">
                Tier Allocation
              </Badge>
            </div>

            <p className="font-mono-street text-xs sm:text-sm text-gray-300 leading-relaxed uppercase">
              Understanding the 5 mandatory qualification criteria, Guaranteed (GTD) allocation cap, and the FCFS Allowlist directory on Elysium.
            </p>

            {/* 5 Qualification Criteria */}
            <div className="border-2 border-emerald-400/40 bg-emerald-950/20 p-4 sm:p-5 rounded-2xl space-y-4">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
                <h4 className="font-display text-base uppercase tracking-wider text-white">
                  The Five Mandatory Qualification Criteria
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs font-mono-street">
                <div className="border border-emerald-500/30 bg-[#08090d] p-3 rounded-xl space-y-1">
                  <span className="font-bold text-emerald-400">1. EVM WALLET</span>
                  <p className="text-gray-400 text-[11px]">Connected EVM wallet with verified SIWE session.</p>
                </div>
                <div className="border border-emerald-500/30 bg-[#08090d] p-3 rounded-xl space-y-1">
                  <span className="font-bold text-emerald-400">2. LINKED X</span>
                  <p className="text-gray-400 text-[11px]">OAuth 2.0 PKCE connected and verified X profile.</p>
                </div>
                <div className="border border-emerald-500/30 bg-[#08090d] p-3 rounded-xl space-y-1">
                  <span className="font-bold text-emerald-400">3. 5-TRAIT SET</span>
                  <p className="text-gray-400 text-[11px]">At least 1 item owned across all 5 categories.</p>
                </div>
                <div className="border border-emerald-500/30 bg-[#08090d] p-3 rounded-xl space-y-1">
                  <span className="font-bold text-emerald-400">4. MANDATORY TASKS</span>
                  <p className="text-gray-400 text-[11px]">100% completion of all required campaign quests.</p>
                </div>
                <div className="border border-emerald-500/30 bg-[#08090d] p-3 rounded-xl space-y-1">
                  <span className="font-bold text-emerald-400">5. CLEAN STANDING</span>
                  <p className="text-gray-400 text-[11px]">Zero active fraud flags, bans, or Sybil restrictions.</p>
                </div>
              </div>
            </div>

            {/* GTD vs FCFS Comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border-2 border-emerald-500/50 bg-[#0c0d15] p-4 sm:p-5 rounded-2xl space-y-3">
                <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                  <span className="border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-0.5 font-mono-street text-[10px] font-bold text-emerald-300 uppercase">
                    TIER 1 ALLOCATION
                  </span>
                  <span className="font-mono-street text-xs font-bold text-emerald-400">
                    Capped at 1,000 Slots
                  </span>
                </div>
                <h4 className="font-display text-base sm:text-lg uppercase tracking-wider text-white">
                  Guaranteed Whitelist (GTD)
                </h4>
                <div className="space-y-2 font-mono-street text-xs text-gray-300 leading-relaxed">
                  <p>
                    <strong className="text-white">Instant Automated Allocation:</strong> Fulfilling all five criteria allocates a GTD slot immediately if capacity remains (&lt; 1,000 slots). No admin intervention required.
                  </p>
                  <p>
                    <strong className="text-white">Strict Concurrency Locks:</strong> Allocation executes within a pessimistic database row transaction, guaranteeing zero over-allocation even during peak traffic spikes.
                  </p>
                </div>
              </div>

              <div className="border-2 border-cyan-500/50 bg-[#0c0d15] p-4 sm:p-5 rounded-2xl space-y-3">
                <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                  <span className="border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-0.5 font-mono-street text-[10px] font-bold text-cyan-300 uppercase">
                    TIER 2 DIRECTORY
                  </span>
                  <span className="font-mono-street text-xs font-bold text-cyan-400">
                    Phase 2 Allowlist
                  </span>
                </div>
                <h4 className="font-display text-base sm:text-lg uppercase tracking-wider text-white">
                  FCFS Directory &amp; OpenSea Export
                </h4>
                <div className="space-y-2 font-mono-street text-xs text-gray-300 leading-relaxed">
                  <p>
                    <strong className="text-white">Master Registry:</strong> Connecting a wallet and linking X registers your timestamp (<code className="text-cyan-300">joinedAt</code>) and deterministic queue index.
                  </p>
                  <p>
                    <strong className="text-white">Export Invariant:</strong> The OpenSea SeaDrop export includes strictly participants who are fully qualified and not holding an active GTD slot. Unqualified accounts never enter the export.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* =======================================================================
              SECTION 5: CAMPAIGN TASKS & EVIDENCE REVIEW
          ======================================================================= */}
          <section id="tasks" className="scroll-mt-24 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b-2 border-gray-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-cyan-400/40 bg-cyan-400/10 text-cyan-400">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <span className="font-mono-street text-[10px] font-bold text-cyan-400 uppercase tracking-widest">
                    Section 05 // Quest Protocol
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl lg:text-3xl uppercase tracking-wider text-white">
                    5. Campaign Tasks &amp; Evidence Review
                  </h2>
                </div>
              </div>
              <Badge variant="outline" className="self-start sm:self-auto border-cyan-400/40 bg-cyan-400/10 text-cyan-300 font-mono-street text-[10px] uppercase">
                Quests &amp; Proof
              </Badge>
            </div>

            <p className="font-mono-street text-xs sm:text-sm text-gray-300 leading-relaxed uppercase">
              Submit proof for social and community quests, track review states in real-time, and unlock whitelist status upon verification.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border-2 border-gray-800 bg-[#0c0d15] p-4 sm:p-5 rounded-2xl space-y-2.5">
                <div className="flex h-8 w-8 items-center justify-center border border-amber-400/40 bg-amber-400/10 text-amber-400 rounded-lg">
                  <Clock className="h-4 w-4" />
                </div>
                <h4 className="font-display text-base uppercase tracking-wider text-amber-300">
                  Pending Review
                </h4>
                <p className="font-mono-street text-xs text-gray-400 leading-relaxed">
                  Upon submission (URL, screenshot link, or text), your task enters <strong className="text-amber-300">PENDING_REVIEW</strong>. Evidence is queued for moderator inspection.
                </p>
              </div>

              <div className="border-2 border-gray-800 bg-[#0c0d15] p-4 sm:p-5 rounded-2xl space-y-2.5">
                <div className="flex h-8 w-8 items-center justify-center border border-emerald-400/40 bg-emerald-400/10 text-emerald-400 rounded-lg">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <h4 className="font-display text-base uppercase tracking-wider text-emerald-300">
                  Approved (Verified)
                </h4>
                <p className="font-mono-street text-xs text-gray-400 leading-relaxed">
                  Once confirmed, progress updates to <strong className="text-emerald-300">VERIFIED</strong>, awarding campaign status and triggering an instant allowlist check.
                </p>
              </div>

              <div className="border-2 border-gray-800 bg-[#0c0d15] p-4 sm:p-5 rounded-2xl space-y-2.5">
                <div className="flex h-8 w-8 items-center justify-center border border-rose-400/40 bg-rose-400/10 text-rose-400 rounded-lg">
                  <XCircle className="h-4 w-4" />
                </div>
                <h4 className="font-display text-base uppercase tracking-wider text-rose-300">
                  Rejected &amp; Retry
                </h4>
                <p className="font-mono-street text-xs text-gray-400 leading-relaxed">
                  If proof is invalid, the reviewer leaves notes. The task form unlocks immediately, allowing you to <strong className="text-rose-300">resubmit correct evidence instantly</strong>.
                </p>
              </div>
            </div>

            <div className="border border-gray-800 bg-[#08090d] p-4 rounded-xl space-y-2 font-mono-street text-xs text-gray-300 break-words">
              <span className="font-bold text-white uppercase tracking-wider">Submission Payload Specifications:</span>
              <p>• Accepted formats: Valid HTTP/HTTPS URLs (X/Twitter post links, verified screenshots) or concise text.</p>
              <p>• Maximum payload cap: 2,048 characters per task submission.</p>
              <p>• Active campaign enforcement: Only tasks within their active dates can accept evidence.</p>
            </div>
          </section>

          {/* =======================================================================
              SECTION 6: WALLET SECURITY & IDENTITY
          ======================================================================= */}
          <section id="security" className="scroll-mt-24 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b-2 border-gray-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-rose-400/40 bg-rose-400/10 text-rose-400">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <span className="font-mono-street text-[10px] font-bold text-rose-400 uppercase tracking-widest">
                    Section 06 // Cyber Safeguards
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl lg:text-3xl uppercase tracking-wider text-white">
                    6. Wallet Security &amp; Identity
                  </h2>
                </div>
              </div>
              <Badge variant="outline" className="self-start sm:self-auto border-rose-400/40 bg-rose-400/10 text-rose-300 font-mono-street text-[10px] uppercase">
                Non-Custodial
              </Badge>
            </div>

            <p className="font-mono-street text-xs sm:text-sm text-gray-300 leading-relaxed uppercase">
              Decentralized, non-custodial architecture with cryptographic SIWE authentication and anti-Sybil 1:1 binding.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border-2 border-gray-800 bg-[#0c0d15] p-4 sm:p-5 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-rose-400">
                  <ShieldCheck className="h-5 w-5" />
                  <h4 className="font-display text-base uppercase tracking-wider text-white">
                    Sign-In with Ethereum (SIWE)
                  </h4>
                </div>
                <div className="space-y-2 font-mono-street text-xs text-gray-300 leading-relaxed">
                  <p>
                    Authentication uses <strong className="text-white">EIP-4361 (SIWE)</strong> via standard <code className="text-rose-300">personal_sign</code> cryptographic challenge.
                  </p>
                  <div className="rounded-xl border border-gray-800 bg-[#08090d] p-3 space-y-1.5">
                    <p className="text-emerald-400 font-bold">✓ Zero gas fees to sign in or manage inventory.</p>
                    <p className="text-emerald-400 font-bold">✓ Zero token spending approvals or contract permissions.</p>
                    <p className="text-emerald-400 font-bold">✓ Supported: MetaMask, Rabby, Phantom, Coinbase Wallet.</p>
                  </div>
                </div>
              </div>

              <div className="border-2 border-gray-800 bg-[#0c0d15] p-4 sm:p-5 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-rose-400">
                  <Users className="h-5 w-5" />
                  <h4 className="font-display text-base uppercase tracking-wider text-white">
                    1:1 Anti-Sybil Social Binding
                  </h4>
                </div>
                <div className="space-y-2 font-mono-street text-xs text-gray-300 leading-relaxed">
                  <p>
                    Each EVM wallet maintains a strict 1:1 binding to a single X (Twitter) profile authenticated through OAuth 2.0 PKCE.
                  </p>
                  <p>
                    An X profile cannot be linked to multiple wallets simultaneously. This prevents multi-wallet farming and protects genuine community allocations.
                  </p>
                </div>
              </div>
            </div>

            {/* Critical Security Warning */}
            <div className="border-2 border-rose-500/40 bg-rose-950/20 p-4 sm:p-6 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-rose-400">
                <ShieldAlert className="h-5 w-5" />
                <h4 className="font-display text-base sm:text-lg uppercase tracking-wider text-white">
                  Critical Non-Custodial Advisory
                </h4>
              </div>
              <div className="space-y-2 font-mono-street text-xs text-gray-300 leading-relaxed">
                <p>
                  <strong className="text-rose-300">Guarding Your Seed Phrase:</strong> Elychimp is non-custodial. We will never ask for your private keys or seed phrase.
                </p>
                <p>
                  <strong className="text-rose-300">Key Loss Advisory:</strong> If you lose access to your EVM wallet, your traits and allowlist slot cannot be recovered by administrators.
                </p>
                <p>
                  <strong className="text-rose-300">Official Links Only:</strong> Deployment and mint contracts are announced exclusively on official syndicate channels (<code className="text-rose-300 font-bold">@Enter_elysium</code>). Beware of scam mint sites or phishing DMs.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
