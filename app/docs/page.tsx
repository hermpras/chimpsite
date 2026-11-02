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
  AlertTriangle,
  Lock,
  ShieldAlert,
  FileText,
  Users,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8 space-y-12">
      {/* Hero Header */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            ChimpHood Community Guide
          </h1>
          <Badge variant="default" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-semibold">
            Official Guide
          </Badge>
          <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300 font-medium">
            MVP Phase
          </Badge>
        </div>
        <p className="max-w-3xl text-base text-gray-300 leading-relaxed">
          Welcome to the ChimpHood ecosystem handbook! Learn how to collect traits, claim periodic lootbox drops, share duplicate traits with community members, qualify for Guaranteed (GTD) and FCFS Whitelist allocations, and safeguard your decentralized account identity.
        </p>

        {/* Quick Navigation Jump Bar */}
        <div className="pt-2">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Quick Navigation:
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href="#traits"
              className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-300 transition-colors hover:bg-purple-500/20"
            >
              <Layers className="h-3.5 w-3.5" />
              1. Trait Collection & Inventory
            </a>
            <a
              href="#drops"
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/20"
            >
              <Box className="h-3.5 w-3.5" />
              2. Drops & Lootbox
            </a>
            <a
              href="#gifts"
              className="inline-flex items-center gap-1.5 rounded-lg border border-pink-500/30 bg-pink-500/10 px-3 py-1.5 text-xs font-medium text-pink-300 transition-colors hover:bg-pink-500/20"
            >
              <Gift className="h-3.5 w-3.5" />
              3. Gifts & Duplicate Sharing
            </a>
            <a
              href="#whitelist"
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              4. Whitelist: GTD & FCFS
            </a>
            <a
              href="#tasks"
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-500/20"
            >
              <FileText className="h-3.5 w-3.5" />
              5. Campaign Tasks & Evidence Review
            </a>
            <a
              href="#security"
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20"
            >
              <Lock className="h-3.5 w-3.5" />
              6. Wallet Security & Identity
            </a>
          </div>
        </div>
      </div>

      {/* SECTION 1: TRAIT COLLECTION & INVENTORY */}
      <section id="traits" className="scroll-mt-20 space-y-4">
        <div className="flex items-center gap-3 border-b border-gray-800 pb-3">
          <div className="rounded-lg bg-purple-500/10 p-2 text-purple-400">
            <Layers className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">
              1. Trait Collection & Inventory
            </h2>
            <p className="text-sm text-gray-400">
              Assemble the five essential gear categories to build your unique ChimpHood avatar.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card className="border-purple-500/20">
            <CardHeader>
              <CardTitle className="text-base text-purple-300 flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                The Five Core Categories
              </CardTitle>
              <CardDescription>
                A complete set requires owning at least one trait in each category.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-300">
              <div className="rounded-lg border border-gray-800/80 bg-gray-900/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-400">• BG (Background)</span>
                  <Badge variant="outline" className="text-[10px]">Environment</Badge>
                </div>
                <p className="text-xs text-gray-400">
                  Atmospheric backdrops, ambient neon environments, and scene horizons.
                </p>
              </div>

              <div className="rounded-lg border border-gray-800/80 bg-gray-900/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-amber-400">• FUR</span>
                  <Badge variant="outline" className="text-[10px]">Base Character</Badge>
                </div>
                <p className="text-xs text-gray-400">
                  Primate base coat variants, cybernetic skin finishes, and fur textures.
                </p>
              </div>

              <div className="rounded-lg border border-gray-800/80 bg-gray-900/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-blue-400">• CLOTHING</span>
                  <Badge variant="outline" className="text-[10px]">Apparel</Badge>
                </div>
                <p className="text-xs text-gray-400">
                  Tactical jackets, hoodies, suits, and signature streetwear pieces.
                </p>
              </div>

              <div className="rounded-lg border border-gray-800/80 bg-gray-900/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-pink-400">• HEADWEAR</span>
                  <Badge variant="outline" className="text-[10px]">Gear</Badge>
                </div>
                <p className="text-xs text-gray-400">
                  Beanies, snapback caps, cyber halos, and head accessories.
                </p>
              </div>

              <div className="rounded-lg border border-gray-800/80 bg-gray-900/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-cyan-400">• EYEWEAR</span>
                  <Badge variant="outline" className="text-[10px]">Optics</Badge>
                </div>
                <p className="text-xs text-gray-400">
                  Laser visors, cyber shades, and tactical augmented-reality optics.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-purple-500/20">
            <CardHeader>
              <CardTitle className="text-base text-purple-300 flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Inventory & Equal MVP Probability
              </CardTitle>
              <CardDescription>
                How items are tracked and rendered in your inventory.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-gray-300">
              <div className="space-y-2">
                <h4 className="font-semibold text-white">Equal MVP Drop Probability</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  In this community MVP phase, all active traits in an active drop pool roll with an equal probability among available remaining stock. Every eligible participant has an equal chance to draw any remaining item in the lootbox pool.
                </p>
              </div>

              <div className="space-y-2 border-t border-gray-800/80 pt-3">
                <h4 className="font-semibold text-white">Edition Serial Numbers</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Every trait copy is minted with a strictly sequential edition number (e.g. Edition #1, Edition #2). Earlier claimants receive lower edition serial numbers recorded immutably in the system.
                </p>
              </div>

              <div className="space-y-2 border-t border-gray-800/80 pt-3">
                <h4 className="font-semibold text-white">Profile Avatar & Auto-Equip</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Your Profile page inspects your inventory and automatically equips one trait per category to generate your customized composite 240x240 avatar preview. Traits currently equipped to represent your profile cannot be sent as gifts.
                </p>
              </div>

              <div className="pt-2">
                <Link href="/profile">
                  <Button variant="outline" size="sm" className="w-full justify-between">
                    <span>Inspect Your Inventory on Profile</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* SECTION 2: DROPS & LOOTBOX */}
      <section id="drops" className="scroll-mt-20 space-y-4">
        <div className="flex items-center gap-3 border-b border-gray-800 pb-3">
          <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400">
            <Box className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">
              2. Drops & Lootbox
            </h2>
            <p className="text-sm text-gray-400">
              Claim periodic lootboxes on a global synchronized clock to build your trait collection.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Card className="border-amber-500/20">
            <CardHeader>
              <div className="mb-1 w-fit rounded-lg bg-amber-500/10 p-2 text-amber-400">
                <Clock className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">2-Hour Global UTC Schedule</CardTitle>
              <CardDescription>Continuous synchronized cycles</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-gray-400 leading-relaxed">
              <p>
                Drop cycles run continuously every 2 hours, anchored to global UTC time (00:00, 02:00, 04:00, 06:00, etc.).
              </p>
              <p>
                The schedule is identical worldwide, ensuring predictable windows for all international community members.
              </p>
            </CardContent>
          </Card>

          <Card className="border-amber-500/20">
            <CardHeader>
              <div className="mb-1 w-fit rounded-lg bg-amber-500/10 p-2 text-amber-400">
                <Box className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">30-Minute Claim Window</CardTitle>
              <CardDescription>Open claim availability</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-gray-400 leading-relaxed">
              <p>
                Claiming opens strictly for the first <strong className="text-amber-300">30 minutes</strong> of each period (from minute :00 to :30).
              </p>
              <p>
                When the 30-minute window closes, a cooldown period engages until the next scheduled 2-hour interval begins.
              </p>
            </CardContent>
          </Card>

          <Card className="border-amber-500/20">
            <CardHeader>
              <div className="mb-1 w-fit rounded-lg bg-amber-500/10 p-2 text-amber-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">1 Claim Per Wallet</CardTitle>
              <CardDescription>Strict period quota enforcement</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-gray-400 leading-relaxed">
              <p>
                Each authenticated wallet can claim at most <strong className="text-amber-300">one lootbox per period</strong>.
              </p>
              <p>
                Duplicate claims within the same period are rejected by database unique constraints.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Drops Rules Notice */}
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-2 text-sm text-gray-300">
                <h4 className="font-semibold text-white">Key Drops Rules & Protections</h4>
                <ul className="list-disc list-inside space-y-1.5 text-xs text-gray-300">
                  <li>
                    <strong className="text-amber-300">Stock Exhaustion:</strong> Pool stock is limited per period. If all allocated stock for a period is claimed before the 30 minutes expire, the portal displays <code className="text-amber-300 font-mono">Stock Exhausted</code> until the next cycle.
                  </li>
                  <li>
                    <strong className="text-amber-300">GTD Whitelist Holder Exclusion:</strong> Users who have already secured an active Guaranteed Whitelist (GTD) slot are prohibited from claiming drops. This protection reserves lootbox stock for hunters still completing their 5-category set.
                  </li>
                  <li>
                    <strong className="text-amber-300">Rate Limiting & Anti-Bot:</strong> Claim endpoints enforce dual rate limits (5 requests / 120s per wallet and 10 requests / 60s per IP) alongside Sybil cluster detection to ensure equitable access.
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-amber-500/20 pt-4">
              <span className="text-xs text-gray-400">
                Ready to try your luck in the next active window?
              </span>
              <Link href="/drops">
                <Button variant="primary" size="sm" className="bg-amber-600 hover:bg-amber-500">
                  <span>Visit Drops Portal</span>
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* SECTION 3: GIFTS & DUPLICATE SHARING */}
      <section id="gifts" className="scroll-mt-20 space-y-4">
        <div className="flex items-center gap-3 border-b border-gray-800 pb-3">
          <div className="rounded-lg bg-pink-500/10 p-2 text-pink-400">
            <Gift className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">
              3. Gifts & Duplicate Sharing
            </h2>
            <p className="text-sm text-gray-400">
              Share extra traits with friends to help everyone complete their 5-category set.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card className="border-pink-500/20">
            <CardHeader>
              <CardTitle className="text-base text-pink-300 flex items-center gap-2">
                <Share2 className="h-4 w-4" />
                Category Retention Rule
              </CardTitle>
              <CardDescription>
                Only surplus duplicate items can be gifted.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-gray-300 leading-relaxed">
              <p>
                Gifting transfers an existing owned item from your inventory to another user. To prevent accidental loss of qualification, the system enforces the <strong className="text-pink-300">Category Retention Rule</strong>:
              </p>
              <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 space-y-2">
                <p className="text-emerald-400 font-medium">✓ You must own at least 2 items in that trait category.</p>
                <p className="text-emerald-400 font-medium">✓ You must retain at least 1 item in that category after gifting.</p>
                <p className="text-rose-400 font-medium">✕ You cannot gift the trait currently equipped on your Profile avatar.</p>
              </div>
              <p className="text-gray-400">
                This rule ensures you never inadvertently disqualify yourself from Whitelist eligibility by gifting away your last item in any category.
              </p>
            </CardContent>
          </Card>

          <Card className="border-pink-500/20">
            <CardHeader>
              <CardTitle className="text-base text-pink-300 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Gifting Rules & Lifecyle
              </CardTitle>
              <CardDescription>
                Daily limits, expiration, and recipient confirmation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-gray-300 leading-relaxed">
              <ul className="space-y-2.5">
                <li className="flex items-start gap-2">
                  <span className="font-semibold text-pink-400 shrink-0">• 1 Gift Outgoing Per Day:</span>
                  <span>Each wallet may initiate at most 1 outgoing gift per calendar day (UTC 00:00 - 23:59:59).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-semibold text-pink-400 shrink-0">• 24-Hour Expiration:</span>
                  <span>Pending gifts expire after 24 hours. When expired or cancelled, the item is unlocked back to the sender.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-semibold text-pink-400 shrink-0">• Recipient Confirmation:</span>
                  <span>Transfers are not immediate. The recipient must visit Profile &gt; Gifts to manually Accept or Reject the gift.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-semibold text-pink-400 shrink-0">• No Duplicate Traits:</span>
                  <span>The recipient cannot already own the specific trait being sent.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-semibold text-pink-400 shrink-0">• WL Holders Cannot Receive:</span>
                  <span>Users holding an active GTD Whitelist allocation cannot receive gifts.</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* SECTION 4: WHITELIST: GTD & FCFS */}
      <section id="whitelist" className="scroll-mt-20 space-y-4">
        <div className="flex items-center gap-3 border-b border-gray-800 pb-3">
          <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">
              4. Whitelist: GTD & FCFS
            </h2>
            <p className="text-sm text-gray-400">
              Understanding the qualification criteria, Guaranteed (GTD) allocation, and the FCFS Directory.
            </p>
          </div>
        </div>

        {/* 5 Qualification Criteria Card */}
        <Card className="border-emerald-500/20">
          <CardHeader>
            <CardTitle className="text-base text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              The Five Mandatory Qualification Requirements
            </CardTitle>
            <CardDescription>
              Every participant must satisfy all five criteria to achieve Fully Qualified status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 text-xs">
              <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 space-y-1">
                <span className="font-semibold text-emerald-400">1. Verified Wallet</span>
                <p className="text-gray-400">Connected EVM wallet with authenticated SIWE session.</p>
              </div>
              <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 space-y-1">
                <span className="font-semibold text-emerald-400">2. Linked X Account</span>
                <p className="text-gray-400">OAuth 2.0 connected and verified X (Twitter) profile.</p>
              </div>
              <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 space-y-1">
                <span className="font-semibold text-emerald-400">3. Full 5-Trait Set</span>
                <p className="text-gray-400">At least one item owned across BG, FUR, CLOTHING, HEADWEAR, EYEWEAR.</p>
              </div>
              <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 space-y-1">
                <span className="font-semibold text-emerald-400">4. Mandatory Tasks</span>
                <p className="text-gray-400">100% completion and approval of all required campaign quests.</p>
              </div>
              <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 space-y-1">
                <span className="font-semibold text-emerald-400">5. Clean Standing</span>
                <p className="text-gray-400">Zero active system bans, fraud flags, or Sybil restrictions.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* GTD vs FCFS Comparison */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardHeader>
              <div className="flex items-center justify-between">
                <Badge variant="default" className="bg-emerald-500/20 text-emerald-300 font-bold border-emerald-500/30">
                  TIER 1
                </Badge>
                <span className="text-xs font-mono text-emerald-400">Cap: 1,000 Slots</span>
              </div>
              <CardTitle className="text-lg text-emerald-300">
                Guaranteed Whitelist (GTD)
              </CardTitle>
              <CardDescription>
                Guaranteed Phase 1 minting reservation on OpenSea.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-gray-300 leading-relaxed">
              <p>
                <strong className="text-white">Instant Automatic Allocation:</strong> As soon as an authenticated participant fulfills all five qualification criteria, a GTD slot is allocated <strong className="text-emerald-300">immediately and automatically</strong>, provided capacity remains available (&lt; 1,000 slots). No manual admin pre-approval is required.
              </p>
              <p>
                <strong className="text-white">Strict Capacity Cap:</strong> Total GTD allocation is strictly capped at <strong className="text-emerald-300">1,000 slots</strong>. A shared pessimistic database row lock ensures zero over-allocation even under high concurrent traffic.
              </p>
              <p>
                <strong className="text-white">Post-Allocation Review & Revocation:</strong> Slots remain active unless an administrator revokes the slot for documented Sybil abuse or rules violations. Revocation results in full program disqualification (DEC-022).
              </p>
            </CardContent>
          </Card>

          <Card className="border-blue-500/30 bg-blue-500/5">
            <CardHeader>
              <div className="flex items-center justify-between">
                <Badge variant="default" className="bg-blue-500/20 text-blue-300 font-bold border-blue-500/30">
                  TIER 2
                </Badge>
                <span className="text-xs font-mono text-blue-400">Phase 2 Allowlist</span>
              </div>
              <CardTitle className="text-lg text-blue-300">
                FCFS Directory & OpenSea Export
              </CardTitle>
              <CardDescription>
                First-Come, First-Served participant directory and export list.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-gray-300 leading-relaxed">
              <p>
                <strong className="text-white">Participant Master Directory:</strong> When you connect an EVM wallet and link your X account, you are registered in the FCFS Directory with an immutable timestamp (<code className="text-blue-300 font-mono">joinedAt</code>) and deterministic <code className="text-blue-300 font-mono">queueNumber</code>.
              </p>
              <p>
                <strong className="text-white">No Auto-Promotion:</strong> The FCFS Directory is a master registry, not an automated promotion queue. If a GTD slot is vacated by revocation, the slot is left vacant until an admin manually assigns it to a qualified candidate. There is zero auto-promotion or auto-reconciliation.
              </p>
              <p>
                <strong className="text-white">Qualified Export Invariant:</strong> When the Phase 2 FCFS Allowlist is exported for OpenSea SeaDrop, it strictly includes <strong className="text-blue-300">only participants who are fully qualified, not banned, and do not hold an active GTD slot</strong>. Unqualified participants never enter the export.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="pt-2">
          <Link href="/whitelist">
            <Button variant="outline" size="sm" className="w-full justify-between">
              <span>Check Your Whitelist Qualification Status</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* SECTION 5: CAMPAIGN TASKS & EVIDENCE REVIEW */}
      <section id="tasks" className="scroll-mt-20 space-y-4">
        <div className="flex items-center gap-3 border-b border-gray-800 pb-3">
          <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">
              5. Campaign Tasks & Evidence Review
            </h2>
            <p className="text-sm text-gray-400">
              Submit proof for community quests and track your review status in real time.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Card className="border-blue-500/20">
            <CardHeader>
              <div className="mb-1 w-fit rounded-lg bg-amber-500/10 p-2 text-amber-400">
                <Clock className="h-5 w-5" />
              </div>
              <CardTitle className="text-base text-amber-300">Pending Review</CardTitle>
              <CardDescription>Awaiting verification</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-gray-400 leading-relaxed">
              <p>
                When you submit evidence (such as a tweet URL, image link, or text proof), your task enters <strong className="text-amber-300">PENDING_REVIEW</strong> status.
              </p>
              <p>
                While a submission is pending, you cannot submit duplicate evidence for that task until review is complete.
              </p>
            </CardContent>
          </Card>

          <Card className="border-blue-500/20">
            <CardHeader>
              <div className="mb-1 w-fit rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <CardTitle className="text-base text-emerald-300">Approved (Verified)</CardTitle>
              <CardDescription>Task requirements met</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-gray-400 leading-relaxed">
              <p>
                Once a moderator or admin confirms your submission, the task progress updates to <strong className="text-emerald-300">VERIFIED</strong> and campaign points are awarded.
              </p>
              <p>
                Approval automatically triggers an instant eligibility check for your Whitelist status.
              </p>
            </CardContent>
          </Card>

          <Card className="border-blue-500/20">
            <CardHeader>
              <div className="mb-1 w-fit rounded-lg bg-rose-500/10 p-2 text-rose-400">
                <XCircle className="h-5 w-5" />
              </div>
              <CardTitle className="text-base text-rose-300">Rejected & Resubmission</CardTitle>
              <CardDescription>Feedback & instant retry</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-gray-400 leading-relaxed">
              <p>
                If your submission is rejected (e.g. invalid URL, broken link, or incomplete task), the reviewer provides optional feedback notes.
              </p>
              <p>
                <strong className="text-rose-300">You can submit new evidence immediately!</strong> Rejection unlocks the task form so you can correct your submission and try again.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-gray-800 bg-gray-900/40">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-gray-200">
              Evidence Submission Guidelines
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-gray-400">
            <p>• Supported submission types: Valid HTTP or HTTPS web URLs (e.g. X/Twitter post links), hosted image URLs, or concise text descriptions.</p>
            <p>• Maximum payload length is strictly capped at 2,048 characters.</p>
            <p>• Only active campaign tasks within their designated start and end dates can receive submissions.</p>
          </CardContent>
        </Card>
      </section>

      {/* SECTION 6: WALLET SECURITY & IDENTITY */}
      <section id="security" className="scroll-mt-20 space-y-4">
        <div className="flex items-center gap-3 border-b border-gray-800 pb-3">
          <div className="rounded-lg bg-rose-500/10 p-2 text-rose-400">
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">
              6. Wallet Security & Identity
            </h2>
            <p className="text-sm text-gray-400">
              Safeguards, non-custodial authentication, and protecting your ChimpHood account.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card className="border-rose-500/20">
            <CardHeader>
              <CardTitle className="text-base text-rose-300 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Sign-In with Ethereum (SIWE)
              </CardTitle>
              <CardDescription>
                Decentralized, passwordless, non-custodial login.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-gray-300 leading-relaxed">
              <p>
                ChimpHood authenticates users through <strong className="text-white">EIP-4361 (Sign-In with Ethereum)</strong>. Supported connectors include MetaMask, Coinbase Wallet, and standard Injected browser wallets.
              </p>
              <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 space-y-2">
                <p className="text-emerald-400 font-medium">✓ Cryptographic signature via personal_sign only.</p>
                <p className="text-emerald-400 font-medium">✓ Zero gas fees required to log in or manage your inventory.</p>
                <p className="text-emerald-400 font-medium">✓ Zero token spending permissions or asset approval requested.</p>
              </div>
              <p className="text-gray-400">
                The SIWE signature merely proves that you control the private key associated with your public wallet address. It cannot move funds or execute contracts on your behalf.
              </p>
            </CardContent>
          </Card>

          <Card className="border-rose-500/20">
            <CardHeader>
              <CardTitle className="text-base text-rose-300 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Social Identity & 1:1 Binding
              </CardTitle>
              <CardDescription>
                Anti-Sybil account linking via OAuth 2.0.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-gray-300 leading-relaxed">
              <p>
                To maintain fair Whitelist distribution, each ChimpHood user has a strict 1:1 relation between their EVM wallet and their connected X (Twitter) profile.
              </p>
              <p>
                An X account cannot be connected to multiple wallets at the same time. This binding prevents multi-wallet farming and preserves authentic community participation.
              </p>
              <p className="text-gray-400">
                Social identity is verified securely via direct OAuth 2.0 PKCE redirection without storing your Twitter passwords.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Security Warning Notice */}
        <Card className="border-rose-500/30 bg-rose-500/5">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-6 w-6 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-2 text-sm text-gray-300">
                <h4 className="font-semibold text-white">Critical Non-Custodial Security Notice</h4>
                <div className="space-y-2 text-xs text-gray-300 leading-relaxed">
                  <p>
                    <strong className="text-rose-300">Protect Your Recovery Phrase:</strong> ChimpHood is a decentralized, non-custodial application. We never have access to your private keys, seed phrases, or wallet credentials.
                  </p>
                  <p>
                    <strong className="text-rose-300">Risk of Access Loss:</strong> If you lose access to your EVM wallet or its private key, you may permanently lose access to your ChimpHood account, your collected traits, and your Whitelist allocation status. Because there are no centralized custodial passwords or email resets, lost keys cannot be recovered by ChimpHood administrators.
                  </p>
                  <p>
                    <strong className="text-rose-300">Official Minting Advisory:</strong> Official minting dates, mint prices, contract addresses, and SeaDrop deployment statuses have not yet been announced. All official deployment and minting updates will be posted exclusively through verified ChimpHood social channels. Always verify contract addresses before signing transactions and beware of phishing links or fake mint sites.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
