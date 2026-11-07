"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Layers,
  Box,
  Gift,
  ShieldCheck,
  FileText,
  Lock,
  ArrowRight,
  ExternalLink,
  Clock,
  Zap,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldAlert,
  Users,
  Check,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Sliders,
  Share2,
} from "lucide-react";

// ============================================================================
// BESPOKE SVG ART CANVASES (FungoLabs Minimalist Aesthetic)
// ============================================================================

function TraitsArtCanvas() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {/* Background Radial Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.12)_0%,transparent_70%)]" />
      
      {/* 5-Slot Matrix Layout */}
      <svg viewBox="0 0 160 160" className="h-36 w-36 sm:h-40 sm:w-40" fill="none">
        {/* Subtle Background Grid Lines */}
        <line x1="20" y1="55" x2="140" y2="55" stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />
        <line x1="20" y1="105" x2="140" y2="105" stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />
        <line x1="55" y1="20" x2="55" y2="140" stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />
        <line x1="105" y1="20" x2="105" y2="140" stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />

        {/* 1. Background (Top Left) */}
        <rect x="22" y="24" width="34" height="34" rx="7" fill="#071F24" stroke="rgba(255,255,255,0.12)" strokeWidth="1.2" />
        <path d="M28 48L36 38L42 45L46 40L51 48H28Z" fill="rgba(245,158,11,0.5)" />
        <circle cx="47" cy="32" r="2.5" fill="#f59e0b" />

        {/* 2. Fur (Top Right) */}
        <rect x="104" y="24" width="34" height="34" rx="7" fill="#071F24" stroke="rgba(255,255,255,0.12)" strokeWidth="1.2" />
        <circle cx="121" cy="37" r="6" fill="#f59e0b" fillOpacity="0.8" />
        <path d="M113 49C113 45 117 43 121 43C125 43 129 45 129 49" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />

        {/* 3. Clothing / Apparel (Center Keypiece - Gold Highlight) */}
        <rect x="63" y="63" width="34" height="34" rx="8" fill="#242217" stroke="#f59e0b" strokeWidth="1.5" />
        <path d="M72 73L80 77L88 73L85 87H75L72 73Z" fill="#f59e0b" />
        <path d="M80 77V87" stroke="#051D22" strokeWidth="1.2" />

        {/* 4. Headwear (Bottom Left) */}
        <rect x="22" y="102" width="34" height="34" rx="7" fill="#071F24" stroke="rgba(255,255,255,0.12)" strokeWidth="1.2" />
        <path d="M30 123C30 116 35 113 39 113H45C49 113 52 116 52 123H30Z" fill="rgba(245,158,11,0.5)" />
        <line x1="28" y1="123" x2="56" y2="123" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />

        {/* 5. Eyewear (Bottom Right) */}
        <rect x="104" y="102" width="34" height="34" rx="7" fill="#071F24" stroke="rgba(255,255,255,0.12)" strokeWidth="1.2" />
        <rect x="110" y="115" width="9" height="7" rx="2" fill="#f59e0b" />
        <rect x="123" y="115" width="9" height="7" rx="2" fill="#f59e0b" />
        <line x1="119" y1="118.5" x2="123" y2="118.5" stroke="#f59e0b" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function DropsArtCanvas() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.14)_0%,transparent_70%)]" />
      
      <svg viewBox="0 0 160 160" className="h-36 w-36 sm:h-40 sm:w-40" fill="none">
        {/* Outer Circular UTC 2-Hour Clock Dial */}
        <circle cx="80" cy="80" r="58" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" strokeDasharray="3 4" />
        
        {/* Active 30-Minute Sector Arc (Highlighted Gold) */}
        <path
          d="M80 22 A 58 58 0 0 1 138 80"
          stroke="#f59e0b"
          strokeWidth="3.5"
          strokeLinecap="round"
        />

        {/* Hour Notch Ticks */}
        <line x1="80" y1="18" x2="80" y2="25" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
        <line x1="142" y1="80" x2="135" y2="80" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
        <line x1="80" y1="142" x2="80" y2="135" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="18" y1="80" x2="25" y2="80" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" />

        {/* Center Contraband Mystery Pod */}
        <rect x="58" y="58" width="44" height="44" rx="10" fill="#1e1d17" stroke="#f59e0b" strokeWidth="1.5" />
        
        {/* Pod Aperture Core */}
        <circle cx="80" cy="80" r="12" fill="#2d2919" stroke="#f59e0b" strokeWidth="1.2" />
        <circle cx="80" cy="80" r="5" fill="#f59e0b" />
        
        {/* Radar Scanning Line */}
        <line x1="80" y1="80" x2="118" y2="42" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="118" cy="42" r="2.5" fill="#f59e0b" />
      </svg>
    </div>
  );
}

function GiftsArtCanvas() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(236,72,153,0.12)_0%,transparent_70%)]" />
      
      <svg viewBox="0 0 160 160" className="h-36 w-36 sm:h-40 sm:w-40" fill="none">
        {/* Sender Vault Box (Left) */}
        <rect x="24" y="56" width="38" height="48" rx="8" fill="#1b1c20" stroke="rgba(255,255,255,0.12)" strokeWidth="1.2" />
        <circle cx="43" cy="74" r="5" fill="#f59e0b" fillOpacity="0.4" />
        <circle cx="43" cy="74" r="2" fill="#f59e0b" />
        <rect x="35" y="87" width="16" height="4" rx="2" fill="rgba(255,255,255,0.15)" />

        {/* Recipient Vault Box (Right) */}
        <rect x="98" y="56" width="38" height="48" rx="8" fill="#1b1c20" stroke="rgba(255,255,255,0.12)" strokeWidth="1.2" />
        <circle cx="117" cy="74" r="5" fill="#ec4899" fillOpacity="0.3" />
        <circle cx="117" cy="74" r="2" fill="#ec4899" />
        <rect x="109" y="87" width="16" height="4" rx="2" fill="rgba(255,255,255,0.15)" />

        {/* Transfer Beam & Direction */}
        <path d="M62 70 H98" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeDasharray="3 3" />
        <path d="M90 66L97 70L90 74" fill="rgba(255,255,255,0.4)" />

        {/* Floating Capsule with Retention Lock Emblem */}
        <circle cx="80" cy="70" r="14" fill="#241b21" stroke="#ec4899" strokeWidth="1.5" />
        {/* Retention Lock Icon */}
        <rect x="74" y="68" width="12" height="9" rx="2" fill="#ec4899" />
        <path d="M76 68V64C76 61.8 77.8 60 80 60C82.2 60 84 61.8 84 64V68" stroke="#ec4899" strokeWidth="1.2" />
        
        {/* +1 Duplicate Indicator */}
        <text x="80" y="118" textAnchor="middle" fill="#ec4899" fontSize="10" fontFamily="monospace" fontWeight="bold">
          KEEP &gt;= 1
        </text>
      </svg>
    </div>
  );
}

function WhitelistArtCanvas() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.12)_0%,transparent_70%)]" />
      
      <svg viewBox="0 0 160 160" className="h-36 w-36 sm:h-40 sm:w-40" fill="none">
        {/* Tier 1 GTD Pass (Gold - Foreground) */}
        <g transform="translate(24, 34)">
          <rect x="0" y="0" width="70" height="92" rx="10" fill="#221e14" stroke="#f59e0b" strokeWidth="1.6" />
          {/* Chip Emblem */}
          <rect x="12" y="14" width="16" height="13" rx="3" fill="#f59e0b" />
          <path d="M12 20.5H28" stroke="#051D22" strokeWidth="1" />
          <path d="M20 14V27" stroke="#051D22" strokeWidth="1" />
          {/* Tier Label */}
          <text x="12" y="46" fill="#f59e0b" fontSize="8" fontFamily="monospace" fontWeight="bold">TIER 1</text>
          <text x="12" y="58" fill="#ffffff" fontSize="11" fontFamily="sans-serif" fontWeight="800">GTD</text>
          <text x="12" y="74" fill="#a1a1aa" fontSize="7" fontFamily="monospace">1,000 CAP</text>
        </g>

        {/* Tier 2 FCFS Pass (Cyan - Offset Behind) */}
        <g transform="translate(68, 44)">
          <rect x="0" y="0" width="68" height="84" rx="10" fill="#132024" stroke="#06b6d4" strokeWidth="1.2" strokeOpacity="0.8" />
          <circle cx="50" cy="22" r="6" fill="#06b6d4" fillOpacity="0.3" stroke="#06b6d4" strokeWidth="1" />
          <text x="12" y="38" fill="#06b6d4" fontSize="8" fontFamily="monospace" fontWeight="bold">TIER 2</text>
          <text x="12" y="50" fill="#ffffff" fontSize="10" fontFamily="sans-serif" fontWeight="800">FCFS</text>
          <text x="12" y="66" fill="#a1a1aa" fontSize="7" fontFamily="monospace">OPENSEA</text>
        </g>
      </svg>
    </div>
  );
}

function TasksArtCanvas() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.12)_0%,transparent_70%)]" />
      
      <svg viewBox="0 0 160 160" className="h-36 w-36 sm:h-40 sm:w-40" fill="none">
        {/* Dossier Document Sheet */}
        <rect x="36" y="22" width="88" height="116" rx="8" fill="#171920" stroke="rgba(255,255,255,0.12)" strokeWidth="1.2" />
        
        {/* Dossier Top Bar */}
        <rect x="44" y="32" width="40" height="6" rx="3" fill="rgba(255,255,235,0.3)" />
        <circle cx="112" cy="35" r="3" fill="#06b6d4" />

        {/* Line Items with Status Checkpoints */}
        {/* Item 1: Verified */}
        <line x1="44" y1="52" x2="88" y2="52" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="106" cy="52" r="5" fill="#10b981" />
        <path d="M104 52L105.5 53.5L108 50.5" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />

        {/* Item 2: Verified */}
        <line x1="44" y1="68" x2="80" y2="68" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="106" cy="68" r="5" fill="#10b981" />
        <path d="M104 68L105.5 69.5L108 66.5" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />

        {/* Item 3: Pending Review */}
        <line x1="44" y1="84" x2="72" y2="84" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="106" cy="84" r="5" fill="#f59e0b" fillOpacity="0.4" stroke="#f59e0b" strokeWidth="1" />
        <circle cx="106" cy="84" r="1.5" fill="#f59e0b" />

        {/* Verification Stamp at Bottom */}
        <rect x="44" y="102" width="72" height="24" rx="5" fill="#102d24" stroke="#10b981" strokeWidth="1.2" strokeDasharray="2 2" />
        <text x="80" y="117" textAnchor="middle" fill="#10b981" fontSize="9" fontFamily="monospace" fontWeight="bold">
          PROOF VERIFIED
        </text>
      </svg>
    </div>
  );
}

function SecurityArtCanvas() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(244,63,94,0.12)_0%,transparent_70%)]" />
      
      <svg viewBox="0 0 160 160" className="h-36 w-36 sm:h-40 sm:w-40" fill="none">
        {/* Hexagonal Cryptographic Vault Crest */}
        <path
          d="M80 20 L126 46 V98 L80 124 L34 98 V46 Z"
          fill="#1c181d"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="1.4"
        />

        {/* SIWE Key Shield Core */}
        <path
          d="M80 34 L114 54 V90 L80 110 L46 90 V54 Z"
          fill="#271920"
          stroke="#f43f5e"
          strokeWidth="1.5"
        />

        {/* Inner Lock Emblem */}
        <rect x="71" y="70" width="18" height="16" rx="3.5" fill="#f43f5e" />
        <circle cx="80" cy="77" r="2" fill="#051D22" />
        <path d="M80 79V83" stroke="#051D22" strokeWidth="1.5" strokeLinecap="round" />
        <path
          d="M74 70V64C74 60.7 76.7 58 80 58C83.3 58 86 60.7 86 64V70"
          stroke="#f43f5e"
          strokeWidth="1.8"
        />

        {/* 1:1 Social Anchor Node */}
        <circle cx="80" cy="138" r="8" fill="#191a20" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
        <path d="M80 124V130" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" strokeDasharray="2 2" />
        <text x="80" y="141" textAnchor="middle" fill="#ffffff" fontSize="7" fontFamily="sans-serif" fontWeight="bold">𝕏</text>
      </svg>
    </div>
  );
}

// ============================================================================
// MAIN DOCS PAGE COMPONENT (SYNCHRONIZED WITH CHIMPHOOD TYPOGRAPHY SYSTEM)
// ============================================================================

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("traits");

  const navSections = [
    { id: "traits", title: "Trait Collection & Inventory", short: "Traits & Inventory" },
    { id: "drops", title: "Contraband Drops & Lootbox", short: "Drops & Lootbox" },
    { id: "gifts", title: "Syndicate Gifting & Transfer", short: "Syndicate Gifts" },
    { id: "whitelist", title: "Whitelist: GTD & FCFS Tiers", short: "Allowlist Tiers" },
    { id: "tasks", title: "Campaign Tasks & Verification", short: "Quests & Review" },
    { id: "security", title: "Wallet Security & SIWE", short: "Security & SIWE" },
  ];

  // Active section scrollspy
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      {
        rootMargin: "-20% 0px -70% 0px",
        threshold: 0,
      }
    );

    navSections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      const topOffset = 80;
      const elementPosition = el.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - topOffset;
      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
      setActiveSection(id);
    }
  };

  return (
    <div className="min-h-screen bg-[#04181C] text-[#DBF2F9] antialiased selection:bg-[#34B7DD] selection:text-[#04181C]">
      {/* Top Subtle Ambient Atmosphere */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 h-[420px] w-full max-w-7xl bg-[radial-gradient(ellipse_at_top,rgba(52,183,221,0.08)_0%,transparent_70%)]" />

      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {/* ===================================================================
            HEADER: Protocol Architecture & Overview
        =================================================================== */}
        <header className="mb-10 sm:mb-14 border-b border-[#163B44] pb-8 sm:pb-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3 max-w-3xl">
              <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl uppercase tracking-tight text-white leading-none">
                How Elychimp Works
              </h1>
              <p className="text-sm sm:text-base text-[#B8D7E0] leading-relaxed max-w-2xl font-normal">
                The comprehensive architectural guide for wardrobe trait assembly, synchronized cycle drops, peer gifting, guaranteed allowlist allocation, and security on Elysium L2.
              </p>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-3 shrink-0">
              <Link
                href="/drops"
                className="inline-flex items-center gap-2 rounded-xl bg-[#34B7DD] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#04181C] hover:bg-[#6FCDE8] shadow-[0_0_15px_rgba(52,183,221,0.25)] transition-all"
              >
                <span>Claim Drops</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/whitelist"
                className="inline-flex items-center gap-2 rounded-xl border border-[#163B44] bg-[#0B2026] text-xs font-semibold uppercase tracking-wider text-[#DBF2F9] hover:border-[#34B7DD]/60 hover:text-white px-5 py-2.5 transition-colors"
              >
                <span>Check Allowlist</span>
                <ExternalLink className="h-3.5 w-3.5 text-[#8AA8B2]" />
              </Link>
            </div>
          </div>
        </header>

        {/* ===================================================================
            MOBILE HORIZONTAL JUMP BAR (Visible < lg)
        =================================================================== */}
        <div className="lg:hidden sticky top-16 z-30 -mx-4 px-4 py-2.5 mb-8 border-y border-[#163B44] bg-[#04181C]/95 backdrop-blur-md overflow-x-auto scrollbar-none text-xs uppercase tracking-wider">
          <div className="flex items-center gap-2 min-w-max">
            {navSections.map((sec, idx) => {
              const isSelected = activeSection === sec.id;
              return (
                <a
                  key={sec.id}
                  href={`#${sec.id}`}
                  onClick={(e) => scrollToSection(e, sec.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 transition-all text-xs font-semibold ${
                    isSelected
                      ? "bg-[#34B7DD] text-[#04181C] font-bold shadow-sm"
                      : "bg-[#0B2026] border border-[#163B44] text-[#8AA8B2] hover:text-white"
                  }`}
                >
                  <span className={isSelected ? "text-[#04181C] font-bold" : "text-[#34B7DD] font-bold"}>
                    0{idx + 1}
                  </span>
                  <span>{sec.short}</span>
                </a>
              );
            })}
          </div>
        </div>

        {/* ===================================================================
            MAIN 2-COLUMN LAYOUT: Content Cards + Sticky Aside
        =================================================================== */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 items-start">
          {/* =================================================================
              LEFT COLUMN: Stacked Modular Section Cards (lg:col-span-8)
          ================================================================= */}
          <main className="lg:col-span-8 space-y-6 sm:space-y-8">
            {/* -------------------------------------------------------------
                SECTION 1: TRAIT COLLECTION & INVENTORY
            ------------------------------------------------------------- */}
            <section
              id="traits"
              className="scroll-mt-24 rounded-2xl border border-[#163B44] bg-[#0B2026] p-6 sm:p-8 transition-colors hover:border-[#1E4D5A] shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
            >
              <div className="flex flex-col md:flex-row items-center gap-6 lg:gap-8">
                {/* Left Visual Art Canvas */}
                <div className="w-full md:w-56 h-48 sm:h-52 shrink-0 rounded-xl bg-[#051D22] border border-[#163B44] flex items-center justify-center p-3 relative overflow-hidden group self-center">
                  <TraitsArtCanvas />
                </div>

                {/* Right Content */}
                <div className="flex-1 min-w-0 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#F59E0B]">
                    <Layers className="h-4 w-4" />
                    <span>01. Wardrobe Assembly</span>
                  </div>

                  <h2 className="font-display text-2xl sm:text-3xl uppercase tracking-wider text-white">
                    Trait Collection &amp; Inventory
                  </h2>

                  <p className="text-sm sm:text-base text-[#DBF2F9] leading-relaxed font-normal">
                    Assemble the five essential streetwear gear categories to complete your full Elychimp outfit and unlock guaranteed allowlist eligibility on Elysium L2.
                  </p>

                  {/* 5 Trait Categories Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {[
                      { name: "BG (Background)", desc: "Vice City horizons & street environments." },
                      { name: "FUR (Character)", desc: "Base coat variants & cybernetic finishes." },
                      { name: "CLOTHING (Apparel)", desc: "Jackets, hoodies, & signature streetwear." },
                      { name: "HEADWEAR (Head Gear)", desc: "Snapback caps, tactical beanies, & halos." },
                      { name: "EYEWEAR (Optics)", desc: "Laser visors, shades, & AR goggles." },
                    ].map((item) => (
                      <div
                        key={item.name}
                        className="rounded-xl border border-[#163B44] bg-[#051D22] p-3.5 space-y-1"
                      >
                        <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-white">{item.name}</span>
                        <p className="text-xs sm:text-[13px] text-[#B8D7E0] leading-snug">{item.desc}</p>
                      </div>
                    ))}

                    <div className="rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-3.5 flex flex-col justify-center space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm uppercase tracking-wide text-[#F59E0B]">
                        <Check className="h-4 w-4 text-[#F59E0B]" />
                        <span>Full Set Requirement</span>
                      </div>
                      <p className="text-xs sm:text-[13px] text-[#DBF2F9] leading-snug">
                        Own at least 1 item across all 5 categories simultaneously to qualify.
                      </p>
                    </div>
                  </div>

                  {/* Serial & Auto-Equip Details */}
                  <div className="space-y-2 pt-3 border-t border-[#163B44] text-xs sm:text-sm text-[#B8D7E0] leading-relaxed">
                    <p className="flex items-start gap-2">
                      <span className="text-[#F59E0B] font-bold shrink-0">• Sequential Serial Numbers:</span>
                      <span>Every trait carries an immutable, strictly sequential edition number (e.g., Edition #1, Edition #2) permanently bound to your claim.</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-[#F59E0B] font-bold shrink-0">• Auto-Equip Avatar:</span>
                      <span>Your Profile automatically composites owned items into a high-res 240×240 avatar. Equipped active items cannot be transferred via gifts.</span>
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* -------------------------------------------------------------
                SECTION 2: DROPS & LOOTBOX
            ------------------------------------------------------------- */}
            <section
              id="drops"
              className="scroll-mt-24 rounded-2xl border border-[#163B44] bg-[#0B2026] p-6 sm:p-8 transition-colors hover:border-[#1E4D5A] shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
            >
              <div className="flex flex-col md:flex-row items-center gap-6 lg:gap-8">
                {/* Left Visual Art Canvas */}
                <div className="w-full md:w-56 h-48 sm:h-52 shrink-0 rounded-xl bg-[#051D22] border border-[#163B44] flex items-center justify-center p-3 relative overflow-hidden group self-center">
                  <DropsArtCanvas />
                </div>

                {/* Right Content */}
                <div className="flex-1 min-w-0 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#F59E0B]">
                    <Box className="h-4 w-4" />
                    <span>02. Drop Engine</span>
                  </div>

                  <h2 className="font-display text-2xl sm:text-3xl uppercase tracking-wider text-white">
                    Contraband Drops &amp; Lootbox
                  </h2>

                  <p className="text-sm sm:text-base text-[#DBF2F9] leading-relaxed font-normal">
                    Periodic mystery crates open on a synchronized global schedule. Claim lootboxes during active drop windows to collect missing streetwear traits.
                  </p>

                  {/* 3 Core Drop Mechanics - Elongated Horizontal Cards */}
                  <div className="space-y-2.5 pt-1">
                    <div className="flex items-start gap-3.5 rounded-xl border border-[#163B44] bg-[#051D22] p-3.5 hover:border-[#1E4D5A] transition-colors">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B] shrink-0 mt-0.5">
                        <Clock className="h-4 w-4" />
                      </div>
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-white block">2-Hour UTC Cycle</span>
                        <p className="text-xs sm:text-[13px] text-[#B8D7E0] leading-relaxed text-left">
                          Cycles run continuously every 2 hours anchored to UTC (00:00, 02:00, etc.) worldwide.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3.5 rounded-xl border border-[#163B44] bg-[#051D22] p-3.5 hover:border-[#1E4D5A] transition-colors">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B] shrink-0 mt-0.5">
                        <Zap className="h-4 w-4" />
                      </div>
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-white block">30-Minute Window</span>
                        <p className="text-xs sm:text-[13px] text-[#B8D7E0] leading-relaxed text-left">
                          Claims unlock strictly for the first 30 minutes (:00 to :30) of each period.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3.5 rounded-xl border border-[#163B44] bg-[#051D22] p-3.5 hover:border-[#1E4D5A] transition-colors">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B] shrink-0 mt-0.5">
                        <ShieldCheck className="h-4 w-4" />
                      </div>
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-white block">1 Claim / Interval</span>
                        <p className="text-xs sm:text-[13px] text-[#B8D7E0] leading-relaxed text-left">
                          Each authenticated wallet is limited to one crate claim per cycle period.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Safeguards & Rules */}
                  <div className="rounded-xl border border-[#163B44] bg-[#051D22] p-4 space-y-2 text-xs sm:text-sm text-[#B8D7E0]">
                    <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-white">
                      Drop Protection Safeguards:
                    </span>
                    <ul className="space-y-1.5 text-[#B8D7E0] leading-relaxed">
                      <li>• <strong className="text-white">GTD Holder Exclusion:</strong> Operatives who already hold an active GTD slot cannot claim crates, preserving stock for hunters completing their 5-piece fit.</li>
                      <li>• <strong className="text-white">Finite Period Stock:</strong> Each interval has an allocated quota. When exhausted, the portal enters rest mode until the next interval.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            {/* -------------------------------------------------------------
                SECTION 3: SYNDICATE GIFTS & TRANSFER
            ------------------------------------------------------------- */}
            <section
              id="gifts"
              className="scroll-mt-24 rounded-2xl border border-[#163B44] bg-[#0B2026] p-6 sm:p-8 transition-colors hover:border-[#1E4D5A] shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
            >
              <div className="flex flex-col md:flex-row items-center gap-6 lg:gap-8">
                {/* Left Visual Art Canvas */}
                <div className="w-full md:w-56 h-48 sm:h-52 shrink-0 rounded-xl bg-[#051D22] border border-[#163B44] flex items-center justify-center p-3 relative overflow-hidden group self-center">
                  <GiftsArtCanvas />
                </div>

                {/* Right Content */}
                <div className="flex-1 min-w-0 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-pink-400">
                    <Gift className="h-4 w-4" />
                    <span>03. Peer Gifting</span>
                  </div>

                  <h2 className="font-display text-2xl sm:text-3xl uppercase tracking-wider text-white">
                    Syndicate Gifting &amp; Duplicate Sharing
                  </h2>

                  <p className="text-sm sm:text-base text-[#DBF2F9] leading-relaxed font-normal">
                    Transfer duplicate traits to fellow syndicate members to help them assemble their 5-piece fit without putting your own allowlist eligibility at risk.
                  </p>

                  {/* Category Retention Rule Highlight */}
                  <div className="rounded-xl border border-pink-500/25 bg-pink-950/20 p-4 space-y-2.5">
                    <div className="flex items-center gap-2 font-bold text-xs sm:text-sm uppercase tracking-wide text-pink-300">
                      <Share2 className="h-4 w-4 text-pink-400" />
                      <span>The Category Retention Rule</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-[13px]">
                      <div className="flex items-center gap-2 text-emerald-300">
                        <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                        <span>Must own at least 2 items in category to gift.</span>
                      </div>
                      <div className="flex items-center gap-2 text-emerald-300">
                        <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                        <span>Must retain at least 1 item after transfer.</span>
                      </div>
                      <div className="flex items-center gap-2 text-rose-300 sm:col-span-2">
                        <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
                        <span>Cannot gift the active trait currently equipped on your avatar profile.</span>
                      </div>
                    </div>
                  </div>

                  {/* Lifecycle Rules */}
                  <div className="space-y-2 pt-2 text-xs sm:text-sm text-[#B8D7E0] leading-relaxed">
                    <p>• <strong className="text-white">1 Gift / Day:</strong> Maximum 1 outgoing gift per wallet per calendar day (UTC 00:00 - 23:59:59).</p>
                    <p>• <strong className="text-white">24-Hour Expiration:</strong> Unclaimed gifts expire in 24 hours and revert automatically back to the sender.</p>
                    <p>• <strong className="text-white">Recipient Eligibility:</strong> GTD allowlist holders cannot receive gifts, and recipients cannot already own the specific trait item.</p>
                  </div>
                </div>
              </div>
            </section>

            {/* -------------------------------------------------------------
                SECTION 4: WHITELIST: GTD & FCFS
            ------------------------------------------------------------- */}
            <section
              id="whitelist"
              className="scroll-mt-24 rounded-2xl border border-[#163B44] bg-[#0B2026] p-6 sm:p-8 transition-colors hover:border-[#1E4D5A] shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
            >
              <div className="flex flex-col md:flex-row items-center gap-6 lg:gap-8">
                {/* Left Visual Art Canvas */}
                <div className="w-full md:w-56 h-48 sm:h-52 shrink-0 rounded-xl bg-[#051D22] border border-[#163B44] flex items-center justify-center p-3 relative overflow-hidden group self-center">
                  <WhitelistArtCanvas />
                </div>

                {/* Right Content */}
                <div className="flex-1 min-w-0 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                    <ShieldCheck className="h-4 w-4" />
                    <span>04. Whitelist Allocation</span>
                  </div>

                  <h2 className="font-display text-2xl sm:text-3xl uppercase tracking-wider text-white">
                    Whitelist: GTD &amp; FCFS Allocation
                  </h2>

                  <p className="text-sm sm:text-base text-[#DBF2F9] leading-relaxed font-normal">
                    Understand the 5 mandatory qualification criteria, Guaranteed (GTD) 1,000-slot allocation cap, and the Phase 2 FCFS directory on Elysium.
                  </p>

                  {/* 5 Mandatory Criteria Pills */}
                  <div className="rounded-xl border border-[#163B44] bg-[#051D22] p-4 space-y-3">
                    <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-emerald-300">
                      5 Mandatory Qualification Criteria:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs sm:text-[13px] text-[#DBF2F9]">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span><strong className="text-white">1. EVM Wallet:</strong> Verified SIWE session.</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span><strong className="text-white">2. Linked X:</strong> OAuth 2.0 PKCE profile.</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span><strong className="text-white">3. 5-Trait Set:</strong> 1+ item in all 5 categories.</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span><strong className="text-white">4. Quests:</strong> 100% campaign task completion.</span>
                      </div>
                      <div className="flex items-center gap-2 sm:col-span-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span><strong className="text-white">5. Clean Standing:</strong> Zero fraud flags, active bans, or Sybil flags.</span>
                      </div>
                    </div>
                  </div>

                  {/* GTD vs FCFS Breakdown */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="rounded-xl border border-[#163B44] bg-[#051D22] p-4 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-[#F59E0B]">Tier 1: GTD</span>
                        <span className="text-xs font-bold text-emerald-400">1,000 Slots</span>
                      </div>
                      <p className="text-xs sm:text-[13px] text-[#B8D7E0] leading-snug">
                        Fulfilling all 5 criteria grants instant allocation via pessimistic row locks while capacity remains.
                      </p>
                    </div>

                    <div className="rounded-xl border border-[#163B44] bg-[#051D22] p-4 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-[#34B7DD]">Tier 2: FCFS</span>
                        <span className="text-xs font-bold text-cyan-400">OpenSea Export</span>
                      </div>
                      <p className="text-xs sm:text-[13px] text-[#B8D7E0] leading-snug">
                        Deterministic queue index for qualified operatives without GTD slots, exported cleanly to SeaDrop.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* -------------------------------------------------------------
                SECTION 5: CAMPAIGN TASKS & EVIDENCE REVIEW
            ------------------------------------------------------------- */}
            <section
              id="tasks"
              className="scroll-mt-24 rounded-2xl border border-[#163B44] bg-[#0B2026] p-6 sm:p-8 transition-colors hover:border-[#1E4D5A] shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
            >
              <div className="flex flex-col md:flex-row items-center gap-6 lg:gap-8">
                {/* Left Visual Art Canvas */}
                <div className="w-full md:w-56 h-48 sm:h-52 shrink-0 rounded-xl bg-[#051D22] border border-[#163B44] flex items-center justify-center p-3 relative overflow-hidden group self-center">
                  <TasksArtCanvas />
                </div>

                {/* Right Content */}
                <div className="flex-1 min-w-0 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#34B7DD]">
                    <FileText className="h-4 w-4" />
                    <span>05. Quest Verification</span>
                  </div>

                  <h2 className="font-display text-2xl sm:text-3xl uppercase tracking-wider text-white">
                    Campaign Tasks &amp; Evidence Review
                  </h2>

                  <p className="text-sm sm:text-base text-[#DBF2F9] leading-relaxed font-normal">
                    Submit proof for social and community quests, track review states in real-time, and unlock allowlist eligibility upon verification.
                  </p>

                  {/* 3 Review States - Elongated Horizontal Cards */}
                  <div className="space-y-2.5 pt-1">
                    <div className="flex items-start gap-3.5 rounded-xl border border-[#163B44] bg-[#051D22] p-3.5 hover:border-[#1E4D5A] transition-colors">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B] shrink-0 mt-0.5">
                        <Clock className="h-4 w-4" />
                      </div>
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-white block">Pending Review</span>
                        <p className="text-xs sm:text-[13px] text-[#B8D7E0] leading-relaxed text-left">
                          Enters <code className="text-[#F59E0B] font-bold font-mono px-1.5 py-0.5 rounded bg-black/40 border border-[#163B44]">PENDING_REVIEW</code> immediately, queued for moderator inspection.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3.5 rounded-xl border border-[#163B44] bg-[#051D22] p-3.5 hover:border-[#1E4D5A] transition-colors">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/10 border border-emerald-400/30 text-emerald-400 shrink-0 mt-0.5">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-white block">Approved (Verified)</span>
                        <p className="text-xs sm:text-[13px] text-[#B8D7E0] leading-relaxed text-left">
                          Updates to <code className="text-emerald-400 font-bold font-mono px-1.5 py-0.5 rounded bg-black/40 border border-[#163B44]">VERIFIED</code>, awarding quest completion status.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3.5 rounded-xl border border-[#163B44] bg-[#051D22] p-3.5 hover:border-[#1E4D5A] transition-colors">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-400/10 border border-rose-400/30 text-rose-400 shrink-0 mt-0.5">
                        <RefreshCw className="h-4 w-4" />
                      </div>
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-white block">Rejected &amp; Retry</span>
                        <p className="text-xs sm:text-[13px] text-[#B8D7E0] leading-relaxed text-left">
                          Reviewer feedback is provided; the submission form unlocks immediately for resubmission.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Payload Specifications */}
                  <div className="space-y-2 pt-2 text-xs sm:text-sm text-[#B8D7E0] leading-relaxed">
                    <p>• <strong className="text-white">Accepted Formats:</strong> Valid HTTP/HTTPS URLs (X posts, verified screenshots) or concise text.</p>
                    <p>• <strong className="text-white">Payload Cap:</strong> Maximum 2,048 characters per task submission.</p>
                    <p>• <strong className="text-white">Campaign Schedule:</strong> Proof submissions are accepted strictly within active campaign dates.</p>
                  </div>
                </div>
              </div>
            </section>

            {/* -------------------------------------------------------------
                SECTION 6: WALLET SECURITY & IDENTITY
            ------------------------------------------------------------- */}
            <section
              id="security"
              className="scroll-mt-24 rounded-2xl border border-[#163B44] bg-[#0B2026] p-6 sm:p-8 transition-colors hover:border-[#1E4D5A] shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
            >
              <div className="flex flex-col md:flex-row items-center gap-6 lg:gap-8">
                {/* Left Visual Art Canvas */}
                <div className="w-full md:w-56 h-48 sm:h-52 shrink-0 rounded-xl bg-[#051D22] border border-[#163B44] flex items-center justify-center p-3 relative overflow-hidden group self-center">
                  <SecurityArtCanvas />
                </div>

                {/* Right Content */}
                <div className="flex-1 min-w-0 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-400">
                    <Lock className="h-4 w-4" />
                    <span>06. Platform Security</span>
                  </div>

                  <h2 className="font-display text-2xl sm:text-3xl uppercase tracking-wider text-white">
                    Wallet Security &amp; Non-Custodial SIWE
                  </h2>

                  <p className="text-sm sm:text-base text-[#DBF2F9] leading-relaxed font-normal">
                    Decentralized, non-custodial architecture powered by cryptographic Sign-In with Ethereum (SIWE) and strict 1:1 anti-Sybil social binding.
                  </p>

                  {/* Security Highlights - Elongated Horizontal Cards */}
                  <div className="space-y-2.5 pt-1">
                    <div className="flex items-start gap-3.5 rounded-xl border border-[#163B44] bg-[#051D22] p-3.5 hover:border-[#1E4D5A] transition-colors">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-400/10 border border-rose-400/30 text-rose-400 shrink-0 mt-0.5">
                        <Lock className="h-4 w-4" />
                      </div>
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-white block">Sign-In with Ethereum (EIP-4361)</span>
                        <p className="text-xs sm:text-[13px] text-[#B8D7E0] leading-relaxed text-left">
                          Cryptographic <code className="text-rose-300 font-bold font-mono px-1.5 py-0.5 rounded bg-black/40 border border-[#163B44]">personal_sign</code> authentication. Zero gas fees, zero token approvals, and zero contract spending permissions.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3.5 rounded-xl border border-[#163B44] bg-[#051D22] p-3.5 hover:border-[#1E4D5A] transition-colors">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-400/10 border border-cyan-400/30 text-cyan-400 shrink-0 mt-0.5">
                        <ShieldCheck className="h-4 w-4" />
                      </div>
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-white block">1:1 Anti-Sybil Social Binding</span>
                        <p className="text-xs sm:text-[13px] text-[#B8D7E0] leading-relaxed text-left">
                          Each EVM wallet maintains a strict 1:1 binding to an X account via OAuth 2.0 PKCE, preventing multi-wallet farming.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Non-Custodial Advisory Box */}
                  <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 space-y-2 text-xs sm:text-sm text-[#DBF2F9]">
                    <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm uppercase tracking-wide text-rose-400">
                      <ShieldAlert className="h-4 w-4" />
                      <span>Critical Non-Custodial Advisory</span>
                    </div>
                    <p className="text-xs sm:text-sm text-[#DBF2F9] leading-relaxed font-normal">
                      Elychimp is completely non-custodial. We will never request private keys or seed phrases. Lost wallet keys cannot be recovered by administrators. Official contracts and announcements are published exclusively via official channels (<code className="text-[#34B7DD] font-bold font-mono px-1.5 py-0.5 rounded bg-black/40 border border-[#163B44]">@Enter_elysium</code>).
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </main>

          {/* =================================================================
              RIGHT COLUMN: Sticky Sidebar TOC + Action CTA (lg:col-span-4)
          ================================================================= */}
          <aside className="hidden lg:block lg:col-span-4 lg:sticky lg:top-24 space-y-5">
            {/* Table of Contents Card */}
            <div className="rounded-2xl border border-[#163B44] bg-[#0B2026] p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[#163B44] pb-3">
                <span className="font-bold text-xs uppercase tracking-wider text-white">
                  On this page
                </span>
                <span className="text-xs text-[#F59E0B] font-bold uppercase tracking-wider">
                  6 Topics
                </span>
              </div>

              <nav className="space-y-1 text-xs uppercase tracking-wider">
                {navSections.map((item, index) => {
                  const isCurrent = activeSection === item.id;
                  return (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      onClick={(e) => scrollToSection(e, item.id)}
                      className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-xs sm:text-sm transition-all ${
                        isCurrent
                          ? "bg-[#F59E0B]/10 text-[#F59E0B] font-bold border border-[#F59E0B]/30"
                          : "text-[#8AA8B2] hover:text-white hover:bg-[#102B33]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span
                          className={`text-xs font-bold ${
                            isCurrent ? "text-[#F59E0B]" : "text-[#8AA8B2] group-hover:text-[#DBF2F9]"
                          }`}
                        >
                          0{index + 1}
                        </span>
                        <span className="truncate">{item.title}</span>
                      </div>
                      <ChevronRight
                        className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                          isCurrent
                            ? "text-[#F59E0B] translate-x-0.5"
                            : "text-[#8AA8B2] group-hover:text-white"
                        }`}
                      />
                    </a>
                  );
                })}
              </nav>

              {/* Quick Protocol Snapshot */}
              <div className="rounded-xl border border-[#163B44] bg-[#051D22] p-3.5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between text-[#8AA8B2]">
                  <span>GTD Slot Cap</span>
                  <span className="font-bold text-emerald-400">1,000 Slots</span>
                </div>
                <div className="flex items-center justify-between text-[#8AA8B2]">
                  <span>Cycle Frequency</span>
                  <span className="font-bold text-[#F59E0B]">2-Hour UTC</span>
                </div>
                <div className="flex items-center justify-between text-[#8AA8B2]">
                  <span>Claim Window</span>
                  <span className="font-bold text-[#34B7DD]">30 Minutes</span>
                </div>
                <div className="flex items-center justify-between text-[#8AA8B2]">
                  <span>Wardrobe Fit</span>
                  <span className="font-bold text-purple-400">5 Categories</span>
                </div>
              </div>
            </div>

            {/* High-Contrast Action Banner (Elysium Luxury CTA) */}
            <div className="rounded-2xl border border-[#34B7DD]/40 bg-gradient-to-b from-[#0B2026] via-[#102B33] to-[#0B2026] p-6 text-white shadow-[0_4px_24px_rgba(52,183,221,0.15)] relative overflow-hidden space-y-4">
              <div className="relative z-10 space-y-1.5">
                <p className="font-display text-2xl uppercase tracking-tight text-white leading-tight">
                  Ready to step into Leonida?
                </p>
                <p className="text-xs sm:text-sm text-[#B8D7E0] leading-snug">
                  Claim your contraband lootbox crate or verify your allowlist qualification in real-time.
                </p>
              </div>

              <div className="relative z-10 pt-1">
                <Link
                  href="/drops"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#34B7DD] px-5 py-3 text-xs font-bold uppercase tracking-wider text-[#04181C] hover:bg-[#6FCDE8] shadow-[0_0_20px_rgba(52,183,221,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span>See the drops</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {/* Decorative Subtle Background Corner Graphic */}
              <div className="pointer-events-none absolute -bottom-6 -right-6 h-28 w-28 rounded-full bg-[#34B7DD]/10 blur-xl" />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
