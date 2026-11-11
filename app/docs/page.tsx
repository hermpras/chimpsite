"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

const NAV_SECTIONS = [
  { id: "traits", title: "Trait Collection & Inventory", short: "Traits & Inventory" },
  { id: "drops", title: "Trait Drops & Lootbox", short: "Drops & Lootbox" },
  { id: "gifts", title: "Peer Gifting & Duplicate Sharing", short: "Peer Gifts" },
  { id: "whitelist", title: "Whitelist Qualification Criteria", short: "Qualification" },
  { id: "tasks", title: "Campaign Tasks & Evidence Review", short: "Quests & Review" },
  { id: "security", title: "Wallet Security & Verification", short: "Security & Auth" },
] as const;

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState<string>("traits");

  const scrollToSection = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
      e.preventDefault();
      const el = document.getElementById(id);
      if (el) {
        const isMobileOrTablet = window.innerWidth < 1024;
        const topOffset = isMobileOrTablet ? 128 : 92;
        const elementPosition = el.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.scrollY - topOffset;
        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth",
        });
        setActiveSection(id);
        if (typeof window.history?.replaceState === "function") {
          window.history.replaceState(null, "", `#${id}`);
        }
      }
    },
    [],
  );

  // Sync initial URL hash on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const rawHash = window.location.hash.replace(/^#/, "").toLowerCase();
    if (rawHash && NAV_SECTIONS.some((s) => s.id === rawHash)) {
      setActiveSection(rawHash);
    }
  }, []);

  // Active section scrollspy + bottom-of-page fallback
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleScrollBottom = () => {
      const scrolledToBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 48;
      if (scrolledToBottom) {
        setActiveSection(NAV_SECTIONS[NAV_SECTIONS.length - 1].id);
      }
    };

    window.addEventListener("scroll", handleScrollBottom, { passive: true });

    if (typeof IntersectionObserver === "undefined") {
      return () => window.removeEventListener("scroll", handleScrollBottom);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      {
        rootMargin: "-18% 0px -65% 0px",
        threshold: 0,
      },
    );

    NAV_SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", handleScrollBottom);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#04181C] text-[#DBF2F9] antialiased selection:bg-[#34B7DD] selection:text-[#04181C]">
      {/* Top Subtle Ambient Atmosphere */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 h-[420px] w-full max-w-7xl bg-[radial-gradient(ellipse_at_top,rgba(52,183,221,0.08)_0%,transparent_70%)]" />

      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {/* ===================================================================
            HEADER: Protocol Architecture & Overview (Elysium Luxury Aesthetic)
        =================================================================== */}
        <header className="relative mb-8 sm:mb-12 overflow-hidden rounded-[28px] sm:rounded-[32px] border border-cyan-500/25 bg-gradient-to-b from-[#0c2831]/90 via-[#071d24]/95 to-[#031116]/98 p-6 sm:p-8 backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),inset_0_0_24px_rgba(52,183,221,0.05),0_24px_50px_-12px_rgba(0,0,0,0.7)] transition-all">
          {/* Top rim highlight line */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />

          {/* Ambient cyan glow orbs */}
          <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-teal-500/10 blur-3xl" />

          <div className="relative z-10 space-y-3 max-w-3xl">
            <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl uppercase tracking-tight text-white leading-[0.95]">
              <span className="bg-gradient-to-r from-white via-[#dbf2f9] to-[#6fcde8] bg-clip-text text-transparent drop-shadow-sm">
                How Elychimp Works
              </span>
            </h1>

            <p className="text-sm sm:text-base text-[#8AA8B2] leading-relaxed max-w-2xl font-normal">
              The architectural guide for modular wardrobe trait assembly, periodic crate drops, peer-to-peer gifting, allowlist qualification, and non-custodial security on Elysium.
            </p>

            <div className="flex flex-wrap items-center gap-2.5 pt-1 text-xs font-medium text-cyan-200/80">
              <span className="inline-flex items-center rounded-full border border-cyan-500/20 bg-[#071f27]/80 px-3.5 py-1 backdrop-blur-sm">
                5 Trait Categories
              </span>
              <span className="inline-flex items-center rounded-full border border-cyan-500/20 bg-[#071f27]/80 px-3.5 py-1 backdrop-blur-sm">
                30-Minute Claim Windows
              </span>
              <span className="inline-flex items-center rounded-full border border-cyan-500/20 bg-[#071f27]/80 px-3.5 py-1 backdrop-blur-sm">
                Non-Custodial Auth
              </span>
            </div>
          </div>
        </header>

        {/* ===================================================================
            MOBILE HORIZONTAL JUMP BAR (Visible < lg)
        =================================================================== */}
        <div className="lg:hidden sticky top-16 sm:top-18 z-30 -mx-4 px-4 py-2.5 mb-8 border-y border-[#163B44] bg-[#04181C]/95 backdrop-blur-xl overflow-x-auto scrollbar-none text-xs uppercase tracking-wider shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
          <div className="flex items-center gap-2 min-w-max">
            {NAV_SECTIONS.map((sec, idx) => {
              const isSelected = activeSection === sec.id;
              return (
                <a
                  key={sec.id}
                  href={`#${sec.id}`}
                  onClick={(e) => scrollToSection(e, sec.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 transition-all text-xs font-semibold ${
                    isSelected
                      ? "bg-[#34B7DD] text-[#04181C] font-bold shadow-[0_0_12px_rgba(52,183,221,0.3)]"
                      : "bg-[#0B2026] border border-[#163B44] text-[#8AA8B2] hover:text-white"
                  }`}
                >
                  <span
                    className={`font-mono ${
                      isSelected ? "text-[#04181C] font-bold" : "text-[#34B7DD] font-bold"
                    }`}
                  >
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
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
          {/* =================================================================
              LEFT COLUMN: Stacked Modular Section Cards (lg:col-span-8)
          ================================================================= */}
          <main className="lg:col-span-8 space-y-6 sm:space-y-8">
            {/* -------------------------------------------------------------
                SECTION 1: TRAIT COLLECTION & INVENTORY
            ------------------------------------------------------------- */}
            <section
              id="traits"
              className="relative overflow-hidden scroll-mt-32 lg:scroll-mt-24 rounded-3xl border border-[#163B44] bg-gradient-to-b from-[#0B2026]/90 via-[#071D23]/95 to-[#04181C]/98 p-6 sm:p-8 transition-all hover:border-cyan-500/30 shadow-[0_20px_50px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
            >
              <div className="pointer-events-none absolute inset-x-10 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />

              <div className="space-y-5">
                <div className="space-y-2.5 border-b border-[#163B44] pb-5">
                  <span className="inline-flex items-center rounded-md border border-[#34B7DD]/30 bg-[#34B7DD]/10 px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-widest text-[#34B7DD]">
                    01 — Wardrobe Assembly
                  </span>

                  <h2 className="font-display text-2xl sm:text-3xl uppercase tracking-wider text-white">
                    Trait Collection &amp; Inventory
                  </h2>

                  <p className="text-sm sm:text-base text-[#B8D7E0] leading-relaxed font-normal">
                    Assemble the five modular streetwear categories to complete your full Elychimp specimen and unlock official Whitelist eligibility on Elysium.
                  </p>
                </div>

                {/* 5 Trait Categories + Full Set Requirement Grid (6 Cards) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {[
                    {
                      code: "01",
                      name: "BG (Background)",
                      desc: "Elysium horizons, neon skylines, and atmospheric street environments.",
                    },
                    {
                      code: "02",
                      name: "FUR (Character)",
                      desc: "Signature base coat variants, rare pelts, and cybernetic finishes.",
                    },
                    {
                      code: "03",
                      name: "CLOTHING (Apparel)",
                      desc: "Tailored jackets, heavyweight hoodies, and technical streetwear.",
                    },
                    {
                      code: "04",
                      name: "HEADWEAR (Head Gear)",
                      desc: "Structured caps, tactical beanies, crowns, and bespoke headpieces.",
                    },
                    {
                      code: "05",
                      name: "EYEWEAR (Optics)",
                      desc: "Precision visors, luxury frames, and holographic optics.",
                    },
                  ].map((item) => (
                    <div
                      key={item.name}
                      className="rounded-2xl border border-[#163B44] bg-[#051D22]/90 p-4 space-y-1.5 transition-colors hover:border-[#1E4D5A]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-white">
                          {item.name}
                        </span>
                        <span className="font-mono text-[11px] font-bold text-[#34B7DD]">
                          {item.code}
                        </span>
                      </div>
                      <p className="text-xs sm:text-[13px] text-[#8AA8B2] leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  ))}

                  <div className="rounded-2xl border border-[#F59E0B]/35 bg-gradient-to-b from-[#F59E0B]/15 to-[#F59E0B]/5 p-4 flex flex-col justify-center space-y-1.5">
                    <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-[#F59E0B]">
                      Full 5/5 Set Requirement
                    </span>
                    <p className="text-xs sm:text-[13px] text-[#DBF2F9] leading-relaxed">
                      Hold at least 1 trait across all 5 categories simultaneously to clear the wardrobe requirement.
                    </p>
                  </div>
                </div>

                {/* Serial & Avatar Composition Specifications */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  <div className="rounded-2xl border border-[#163B44] bg-[#04181C]/80 p-4 space-y-1">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#34B7DD] block">
                      Sequential Edition Numbers
                    </span>
                    <p className="text-xs sm:text-[13px] text-[#B8D7E0] leading-relaxed">
                      Every claimed trait is assigned an immutable, sequential edition number (e.g., Edition #1, Edition #2) permanently bound to that inventory item.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#163B44] bg-[#04181C]/80 p-4 space-y-1">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#34B7DD] block">
                      Live Avatar Composition
                    </span>
                    <p className="text-xs sm:text-[13px] text-[#B8D7E0] leading-relaxed">
                      Your Profile dynamically layers equipped traits into a custom avatar with high-resolution PNG export. Active equipped items are locked from gifting.
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
              className="relative overflow-hidden scroll-mt-32 lg:scroll-mt-24 rounded-3xl border border-[#163B44] bg-gradient-to-b from-[#0B2026]/90 via-[#071D23]/95 to-[#04181C]/98 p-6 sm:p-8 transition-all hover:border-cyan-500/30 shadow-[0_20px_50px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
            >
              <div className="pointer-events-none absolute inset-x-10 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />

              <div className="space-y-5">
                <div className="space-y-2.5 border-b border-[#163B44] pb-5">
                  <span className="inline-flex items-center rounded-md border border-[#34B7DD]/30 bg-[#34B7DD]/10 px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-widest text-[#34B7DD]">
                    02 — Drop Engine
                  </span>

                  <h2 className="font-display text-2xl sm:text-3xl uppercase tracking-wider text-white">
                    Trait Drops &amp; Lootbox
                  </h2>

                  <p className="text-sm sm:text-base text-[#B8D7E0] leading-relaxed font-normal">
                    Mystery trait crates open on a synchronized global UTC schedule. Claim lootboxes during active windows to unbox streetwear gear from Common to Legendary.
                  </p>
                </div>

                {/* 3 Core Drop Mechanics */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="rounded-2xl border border-[#163B44] bg-[#051D22]/90 p-4 space-y-2 transition-colors hover:border-[#1E4D5A]">
                    <span className="inline-block rounded-md border border-[#34B7DD]/25 bg-[#34B7DD]/10 px-2 py-0.5 font-mono text-xs font-bold text-[#34B7DD]">
                      01
                    </span>
                    <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-white block">
                      Periodic UTC Cycles
                    </span>
                    <p className="text-xs sm:text-[13px] text-[#8AA8B2] leading-relaxed">
                      Cycles run continuously on a synchronized UTC schedule (standard 2-hour cycles or scheduled Hype Control intervals).
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#163B44] bg-[#051D22]/90 p-4 space-y-2 transition-colors hover:border-[#1E4D5A]">
                    <span className="inline-block rounded-md border border-[#34B7DD]/25 bg-[#34B7DD]/10 px-2 py-0.5 font-mono text-xs font-bold text-[#34B7DD]">
                      02
                    </span>
                    <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-white block">
                      30-Minute Window
                    </span>
                    <p className="text-xs sm:text-[13px] text-[#8AA8B2] leading-relaxed">
                      Claims unlock strictly for the first 30 minutes (:00 to :30) of each active cycle period before entering cooldown.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#163B44] bg-[#051D22]/90 p-4 space-y-2 transition-colors hover:border-[#1E4D5A]">
                    <span className="inline-block rounded-md border border-[#34B7DD]/25 bg-[#34B7DD]/10 px-2 py-0.5 font-mono text-xs font-bold text-[#34B7DD]">
                      03
                    </span>
                    <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-white block">
                      1 Claim / Period
                    </span>
                    <p className="text-xs sm:text-[13px] text-[#8AA8B2] leading-relaxed">
                      Each authenticated EVM wallet is limited to one mystery crate claim per active period interval.
                    </p>
                  </div>
                </div>

                {/* Prerequisites & Safeguards */}
                <div className="rounded-2xl border border-[#163B44] bg-[#04181C]/80 p-4 sm:p-5 space-y-3.5">
                  <span className="font-bold text-xs sm:text-sm uppercase tracking-wider text-white block">
                    Drop Prerequisites &amp; Safeguards
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-[#163B44] bg-[#051D22]/80 p-3.5 space-y-1">
                      <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#34B7DD] block">
                        Linked X Account Required
                      </span>
                      <p className="text-xs text-[#B8D7E0] leading-relaxed">
                        Collectors must link an X (Twitter) profile via OAuth 2.0 before unlocking crate claims.
                      </p>
                    </div>

                    <div className="rounded-xl border border-[#163B44] bg-[#051D22]/80 p-3.5 space-y-1">
                      <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#34B7DD] block">
                        Mandatory Quests Required
                      </span>
                      <p className="text-xs text-[#B8D7E0] leading-relaxed">
                        All mandatory campaign tasks (100%) must be completed and verified before claiming.
                      </p>
                    </div>

                    <div className="rounded-xl border border-[#163B44] bg-[#051D22]/80 p-3.5 space-y-1">
                      <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#F59E0B] block">
                        Whitelist Holder Exclusion
                      </span>
                      <p className="text-xs text-[#B8D7E0] leading-relaxed">
                        Wallets that already hold an allocated allowlist slot cannot claim crates, preserving supply for collectors completing their 5-piece outfit.
                      </p>
                    </div>

                    <div className="rounded-xl border border-[#163B44] bg-[#051D22]/80 p-3.5 space-y-1">
                      <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#34B7DD] block">
                        Finite Period Stock
                      </span>
                      <p className="text-xs text-[#B8D7E0] leading-relaxed">
                        Each interval has a dedicated unit quota. When exhausted, claims pause until the next cycle opens.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* -------------------------------------------------------------
                SECTION 3: PEER GIFTS & TRANSFER
            ------------------------------------------------------------- */}
            <section
              id="gifts"
              className="relative overflow-hidden scroll-mt-32 lg:scroll-mt-24 rounded-3xl border border-[#163B44] bg-gradient-to-b from-[#0B2026]/90 via-[#071D23]/95 to-[#04181C]/98 p-6 sm:p-8 transition-all hover:border-cyan-500/30 shadow-[0_20px_50px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
            >
              <div className="pointer-events-none absolute inset-x-10 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />

              <div className="space-y-5">
                <div className="space-y-2.5 border-b border-[#163B44] pb-5">
                  <span className="inline-flex items-center rounded-md border border-[#34B7DD]/30 bg-[#34B7DD]/10 px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-widest text-[#34B7DD]">
                    03 — Peer Gifting
                  </span>

                  <h2 className="font-display text-2xl sm:text-3xl uppercase tracking-wider text-white">
                    Peer Gifting &amp; Duplicate Sharing
                  </h2>

                  <p className="text-sm sm:text-base text-[#B8D7E0] leading-relaxed font-normal">
                    Transfer duplicate traits to fellow collectors on Elysium to help them assemble their 5-piece outfit without putting your own allowlist eligibility at risk.
                  </p>
                </div>

                {/* Category Retention Rule Highlight */}
                <div className="rounded-2xl border border-[#34B7DD]/30 bg-[#34B7DD]/10 p-4 sm:p-5 space-y-3.5">
                  <span className="font-bold text-xs sm:text-sm uppercase tracking-wider text-[#34B7DD] block">
                    The Category Retention Rule
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs sm:text-[13px]">
                    <div className="rounded-xl border border-[#34B7DD]/25 bg-[#051D22]/85 p-3.5 space-y-1">
                      <span className="font-mono text-[11px] font-bold text-[#34B7DD] block uppercase tracking-wider">
                        Threshold (Own &gt;= 2)
                      </span>
                      <span className="text-[#DBF2F9] leading-relaxed block">
                        You must own at least 2 items in a category before gifting from that slot.
                      </span>
                    </div>

                    <div className="rounded-xl border border-[#34B7DD]/25 bg-[#051D22]/85 p-3.5 space-y-1">
                      <span className="font-mono text-[11px] font-bold text-[#34B7DD] block uppercase tracking-wider">
                        Retention (Keep &gt;= 1)
                      </span>
                      <span className="text-[#DBF2F9] leading-relaxed block">
                        Your inventory always retains at least 1 item in the category after transfer.
                      </span>
                    </div>

                    <div className="rounded-xl border border-[#F59E0B]/35 bg-[#051D22]/85 p-3.5 space-y-1">
                      <span className="font-mono text-[11px] font-bold text-[#F59E0B] block uppercase tracking-wider">
                        Equipped Trait Lock
                      </span>
                      <span className="text-[#DBF2F9] leading-relaxed block">
                        Active traits currently equipped on your avatar cannot be gifted until unequipped.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Lifecycle Rules */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="rounded-2xl border border-[#163B44] bg-[#04181C]/80 p-4 space-y-1">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-white block">
                      1 Gift / Day Limit
                    </span>
                    <p className="text-xs text-[#B8D7E0] leading-relaxed">
                      Maximum 1 outgoing gift transfer per wallet per UTC calendar day (00:00 to 23:59:59 UTC).
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#163B44] bg-[#04181C]/80 p-4 space-y-1">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-white block">
                      24-Hour Expiration
                    </span>
                    <p className="text-xs text-[#B8D7E0] leading-relaxed">
                      Unclaimed gifts expire automatically after 24 hours and return directly to the sender&apos;s inventory.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#163B44] bg-[#04181C]/80 p-4 space-y-1">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-white block">
                      Recipient Eligibility
                    </span>
                    <p className="text-xs text-[#B8D7E0] leading-relaxed">
                      Recipients cannot already own the exact same trait and must hold an active, non-restricted account.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* -------------------------------------------------------------
                SECTION 4: WHITELIST QUALIFICATION CRITERIA
            ------------------------------------------------------------- */}
            <section
              id="whitelist"
              className="relative overflow-hidden scroll-mt-32 lg:scroll-mt-24 rounded-3xl border border-[#163B44] bg-gradient-to-b from-[#0B2026]/90 via-[#071D23]/95 to-[#04181C]/98 p-6 sm:p-8 transition-all hover:border-cyan-500/30 shadow-[0_20px_50px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
            >
              <div className="pointer-events-none absolute inset-x-10 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />

              <div className="space-y-5">
                <div className="space-y-2.5 border-b border-[#163B44] pb-5">
                  <span className="inline-flex items-center rounded-md border border-[#34B7DD]/30 bg-[#34B7DD]/10 px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-widest text-[#34B7DD]">
                    04 — Whitelist Criteria
                  </span>

                  <h2 className="font-display text-2xl sm:text-3xl uppercase tracking-wider text-white">
                    Whitelist Qualification Criteria
                  </h2>

                  <p className="text-sm sm:text-base text-[#B8D7E0] leading-relaxed font-normal">
                    Progress through the 5-step verification flow on the Whitelist Portal to lock in your allowlist allocation for OpenSea SeaDrop on Elysium.
                  </p>
                </div>

                {/* Whitelist Qualification & Syndicate Pass Overview */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="rounded-2xl border border-[#F59E0B]/35 bg-gradient-to-b from-[#F59E0B]/15 to-[#051D22]/90 p-4 space-y-1.5">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#F59E0B] block">
                      Official Whitelist Status
                    </span>
                    <p className="text-xs sm:text-[13px] text-[#DBF2F9] leading-relaxed">
                      Unlocked automatically upon completing all 5 mandatory criteria—connecting your EVM wallet, linking X, completing required quests, and assembling all 5 trait categories.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#34B7DD]/30 bg-gradient-to-b from-[#34B7DD]/12 to-[#051D22]/90 p-4 space-y-1.5">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#34B7DD] block">
                      Syndicate Whitelist Pass
                    </span>
                    <p className="text-xs sm:text-[13px] text-[#DBF2F9] leading-relaxed">
                      Fully qualified collectors unlock their personalized Syndicate ID Badge featuring their assembled Elychimp avatar and sequential pass number for the official mint allowlist.
                    </p>
                  </div>
                </div>

                {/* 5 Mandatory Criteria Grid */}
                <div className="rounded-2xl border border-[#163B44] bg-[#04181C]/80 p-4 sm:p-5 space-y-3.5">
                  <span className="font-bold text-xs sm:text-sm uppercase tracking-wider text-white block">
                    5 Mandatory Qualification Steps
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-[13px] text-[#DBF2F9]">
                    <div className="flex items-start gap-3 rounded-xl border border-[#163B44] bg-[#051D22]/90 p-3.5">
                      <span className="rounded-md border border-[#34B7DD]/25 bg-[#34B7DD]/10 px-2 py-0.5 font-mono text-xs font-bold text-[#34B7DD] shrink-0">
                        01
                      </span>
                      <div>
                        <strong className="text-white block uppercase text-xs tracking-wider mb-0.5">
                          EVM Wallet Session
                        </strong>
                        <span className="text-[#8AA8B2] leading-relaxed block">
                          Verified off-chain cryptographic wallet session.
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 rounded-xl border border-[#163B44] bg-[#051D22]/90 p-3.5">
                      <span className="rounded-md border border-[#34B7DD]/25 bg-[#34B7DD]/10 px-2 py-0.5 font-mono text-xs font-bold text-[#34B7DD] shrink-0">
                        02
                      </span>
                      <div>
                        <strong className="text-white block uppercase text-xs tracking-wider mb-0.5">
                          Linked X Account
                        </strong>
                        <span className="text-[#8AA8B2] leading-relaxed block">
                          1:1 OAuth 2.0 PKCE social identity binding.
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 rounded-xl border border-[#163B44] bg-[#051D22]/90 p-3.5">
                      <span className="rounded-md border border-[#34B7DD]/25 bg-[#34B7DD]/10 px-2 py-0.5 font-mono text-xs font-bold text-[#34B7DD] shrink-0">
                        03
                      </span>
                      <div>
                        <strong className="text-white block uppercase text-xs tracking-wider mb-0.5">
                          Mandatory Quests
                        </strong>
                        <span className="text-[#8AA8B2] leading-relaxed block">
                          100% completion and approval of required campaign tasks.
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 rounded-xl border border-[#163B44] bg-[#051D22]/90 p-3.5">
                      <span className="rounded-md border border-[#34B7DD]/25 bg-[#34B7DD]/10 px-2 py-0.5 font-mono text-xs font-bold text-[#34B7DD] shrink-0">
                        04
                      </span>
                      <div>
                        <strong className="text-white block uppercase text-xs tracking-wider mb-0.5">
                          5-Piece Trait Set
                        </strong>
                        <span className="text-[#8AA8B2] leading-relaxed block">
                          Hold at least 1 trait across all 5 wardrobe categories.
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 rounded-xl border border-[#163B44] bg-[#051D22]/90 p-3.5 sm:col-span-2">
                      <span className="rounded-md border border-[#34B7DD]/25 bg-[#34B7DD]/10 px-2 py-0.5 font-mono text-xs font-bold text-[#34B7DD] shrink-0">
                        05
                      </span>
                      <div>
                        <strong className="text-white block uppercase text-xs tracking-wider mb-0.5">
                          Clean Account Standing
                        </strong>
                        <span className="text-[#8AA8B2] leading-relaxed block">
                          Zero active bans, Sybil cluster flags, or security violations at snapshot export.
                        </span>
                      </div>
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
              className="relative overflow-hidden scroll-mt-32 lg:scroll-mt-24 rounded-3xl border border-[#163B44] bg-gradient-to-b from-[#0B2026]/90 via-[#071D23]/95 to-[#04181C]/98 p-6 sm:p-8 transition-all hover:border-cyan-500/30 shadow-[0_20px_50px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
            >
              <div className="pointer-events-none absolute inset-x-10 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />

              <div className="space-y-5">
                <div className="space-y-2.5 border-b border-[#163B44] pb-5">
                  <span className="inline-flex items-center rounded-md border border-[#34B7DD]/30 bg-[#34B7DD]/10 px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-widest text-[#34B7DD]">
                    05 — Quest Verification
                  </span>

                  <h2 className="font-display text-2xl sm:text-3xl uppercase tracking-wider text-white">
                    Campaign Tasks &amp; Evidence Review
                  </h2>

                  <p className="text-sm sm:text-base text-[#B8D7E0] leading-relaxed font-normal">
                    Complete social missions with automated verification or submit proof links for community quests, tracked in real time toward your allowlist status.
                  </p>
                </div>

                {/* 3 Verification States */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 rounded-2xl border border-[#163B44] bg-[#051D22]/90 p-4 hover:border-[#1E4D5A] transition-colors">
                    <div className="shrink-0">
                      <span className="inline-block w-32 text-center px-2.5 py-1 rounded-md bg-[#34B7DD]/10 border border-[#34B7DD]/30 text-[#34B7DD] font-mono text-[11px] font-bold uppercase tracking-wider">
                        Auto-Verify
                      </span>
                    </div>
                    <div className="space-y-1 min-w-0 flex-1">
                      <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-white block">
                        Instant Social Verification
                      </span>
                      <p className="text-xs sm:text-[13px] text-[#8AA8B2] leading-relaxed">
                        Standard X actions (Follow @Elychimp, Like, Repost) verify via an interactive 10-second inspection timer, granting instant{" "}
                        <code className="text-[#34B7DD] font-bold font-mono px-1.5 py-0.5 rounded bg-black/40 border border-[#163B44]">
                          VERIFIED
                        </code>{" "}
                        status.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 rounded-2xl border border-[#163B44] bg-[#051D22]/90 p-4 hover:border-[#1E4D5A] transition-colors">
                    <div className="shrink-0">
                      <span className="inline-block w-32 text-center px-2.5 py-1 rounded-md bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B] font-mono text-[11px] font-bold uppercase tracking-wider">
                        Pending Review
                      </span>
                    </div>
                    <div className="space-y-1 min-w-0 flex-1">
                      <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-white block">
                        Manual Evidence Queue
                      </span>
                      <p className="text-xs sm:text-[13px] text-[#8AA8B2] leading-relaxed">
                        Quests requiring external proof links (Quote posts, replies, or custom tasks) enter{" "}
                        <code className="text-[#F59E0B] font-bold font-mono px-1.5 py-0.5 rounded bg-black/40 border border-[#163B44]">
                          PENDING_REVIEW
                        </code>{" "}
                        upon submission for moderator inspection.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 rounded-2xl border border-[#163B44] bg-[#051D22]/90 p-4 hover:border-[#1E4D5A] transition-colors">
                    <div className="shrink-0">
                      <span className="inline-block w-32 text-center px-2.5 py-1 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-300 font-mono text-[11px] font-bold uppercase tracking-wider">
                        Rejected &amp; Retry
                      </span>
                    </div>
                    <div className="space-y-1 min-w-0 flex-1">
                      <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-white block">
                        Moderator Feedback &amp; Resubmission
                      </span>
                      <p className="text-xs sm:text-[13px] text-[#8AA8B2] leading-relaxed">
                        If submitted evidence is invalid, reviewer notes explain the rejection and the task input unlocks immediately for corrected resubmission.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Payload Specifications */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
                  <div className="rounded-2xl border border-[#163B44] bg-[#04181C]/80 p-4 space-y-1">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-white block">
                      Accepted Proof Formats
                    </span>
                    <p className="text-xs text-[#B8D7E0] leading-relaxed">
                      Valid HTTP/HTTPS URLs (X reply or quote links) or concise text verification payloads.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#163B44] bg-[#04181C]/80 p-4 space-y-1">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-white block">
                      Payload Cap
                    </span>
                    <p className="text-xs text-[#B8D7E0] leading-relaxed">
                      Maximum 2,048 characters per task evidence submission.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#163B44] bg-[#04181C]/80 p-4 space-y-1">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-white block">
                      Campaign Schedule
                    </span>
                    <p className="text-xs text-[#B8D7E0] leading-relaxed">
                      Task submissions and verifications remain active strictly within published campaign dates.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* -------------------------------------------------------------
                SECTION 6: WALLET SECURITY & IDENTITY
            ------------------------------------------------------------- */}
            <section
              id="security"
              className="relative overflow-hidden scroll-mt-32 lg:scroll-mt-24 rounded-3xl border border-[#163B44] bg-gradient-to-b from-[#0B2026]/90 via-[#071D23]/95 to-[#04181C]/98 p-6 sm:p-8 transition-all hover:border-cyan-500/30 shadow-[0_20px_50px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
            >
              <div className="pointer-events-none absolute inset-x-10 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />

              <div className="space-y-5">
                <div className="space-y-2.5 border-b border-[#163B44] pb-5">
                  <span className="inline-flex items-center rounded-md border border-[#34B7DD]/30 bg-[#34B7DD]/10 px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-widest text-[#34B7DD]">
                    06 — Platform Security
                  </span>

                  <h2 className="font-display text-2xl sm:text-3xl uppercase tracking-wider text-white">
                    Wallet Security &amp; Non-Custodial Verification
                  </h2>

                  <p className="text-sm sm:text-base text-[#B8D7E0] leading-relaxed font-normal">
                    Non-custodial authentication powered by off-chain cryptographic wallet signatures and strict 1:1 anti-Sybil social identity binding on Elysium.
                  </p>
                </div>

                {/* Security Highlights */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="rounded-2xl border border-[#163B44] bg-[#051D22]/90 p-4 space-y-2 transition-colors hover:border-[#1E4D5A]">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-white">
                        Cryptographic Authentication
                      </span>
                      <span className="rounded-md border border-[#34B7DD]/25 bg-[#34B7DD]/10 px-2 py-0.5 font-mono text-[11px] font-bold text-[#34B7DD]">
                        01
                      </span>
                    </div>
                    <p className="text-xs sm:text-[13px] text-[#8AA8B2] leading-relaxed">
                      Standard{" "}
                      <code className="text-[#34B7DD] font-bold font-mono px-1.5 py-0.5 rounded bg-black/40 border border-[#163B44]">
                        personal_sign
                      </code>{" "}
                      verification. Zero gas fees, zero token approvals, and zero contract spending permissions.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#163B44] bg-[#051D22]/90 p-4 space-y-2 transition-colors hover:border-[#1E4D5A]">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs sm:text-sm uppercase tracking-wide text-white">
                        1:1 Anti-Sybil Social Binding
                      </span>
                      <span className="rounded-md border border-[#34B7DD]/25 bg-[#34B7DD]/10 px-2 py-0.5 font-mono text-[11px] font-bold text-[#34B7DD]">
                        02
                      </span>
                    </div>
                    <p className="text-xs sm:text-[13px] text-[#8AA8B2] leading-relaxed">
                      Each EVM wallet maintains a strict 1:1 binding to a single X account via OAuth 2.0 PKCE, preventing multi-wallet farming.
                    </p>
                  </div>
                </div>

                {/* Non-Custodial Advisory Box */}
                <div className="rounded-2xl border border-[#F59E0B]/35 bg-gradient-to-b from-[#F59E0B]/15 to-[#F59E0B]/5 p-4 sm:p-5 space-y-2">
                  <div className="font-bold text-xs sm:text-sm uppercase tracking-wider text-[#F59E0B]">
                    Critical Non-Custodial Advisory
                  </div>
                  <p className="text-xs sm:text-sm text-[#DBF2F9] leading-relaxed font-normal">
                    Elychimp is strictly non-custodial. We will never request private keys, seed phrases, or wallet permissions during authentication. Lost wallet keys cannot be recovered by administrators. Official announcements and contracts on Elysium are published exclusively via{" "}
                    <code className="text-[#34B7DD] font-bold font-mono px-1.5 py-0.5 rounded bg-black/40 border border-[#163B44]">
                      @Elychimp
                    </code>
                    .
                  </p>
                </div>
              </div>
            </section>
          </main>

          {/* =================================================================
              RIGHT COLUMN: Sticky Sidebar TOC + Action CTA (lg:col-span-4)
          ================================================================= */}
          <aside className="hidden lg:block lg:col-span-4 lg:sticky lg:top-24 space-y-5">
            {/* Table of Contents Card */}
            <div className="relative overflow-hidden rounded-3xl border border-[#163B44] bg-gradient-to-b from-[#0B2026]/95 via-[#071D23]/95 to-[#04181C]/98 p-5 sm:p-6 shadow-[0_16px_40px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl space-y-4">
              <div className="border-b border-[#163B44] pb-3">
                <span className="font-bold text-xs uppercase tracking-widest text-white">
                  On this page
                </span>
              </div>

              <nav aria-label="Documentation sections" className="space-y-1.5 text-xs uppercase tracking-wider">
                {NAV_SECTIONS.map((item, index) => {
                  const isCurrent = activeSection === item.id;
                  return (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      onClick={(e) => scrollToSection(e, item.id)}
                      className={`group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs sm:text-[13px] transition-all ${
                        isCurrent
                          ? "bg-[#34B7DD]/12 text-[#34B7DD] font-bold border border-[#34B7DD]/35 shadow-[0_0_16px_rgba(52,183,221,0.12)]"
                          : "border border-transparent text-[#8AA8B2] hover:text-white hover:bg-[#102B33]/70"
                      }`}
                    >
                      <span
                        className={`font-mono text-xs font-bold shrink-0 ${
                          isCurrent ? "text-[#34B7DD]" : "text-[#8AA8B2] group-hover:text-[#DBF2F9]"
                        }`}
                      >
                        0{index + 1}
                      </span>
                      <span className="truncate">{item.title}</span>
                    </a>
                  );
                })}
              </nav>

              {/* Quick Protocol Snapshot */}
              <div className="rounded-2xl border border-[#163B44] bg-[#04181C]/90 p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between text-[#8AA8B2]">
                  <span>Cycle Schedule</span>
                  <span className="font-bold text-white font-mono">Periodic UTC</span>
                </div>
                <div className="flex items-center justify-between text-[#8AA8B2]">
                  <span>Claim Window</span>
                  <span className="font-bold text-[#34B7DD] font-mono">30 Minutes</span>
                </div>
                <div className="flex items-center justify-between text-[#8AA8B2]">
                  <span>Full Set Requirement</span>
                  <span className="font-bold text-[#34B7DD] font-mono">5 Categories</span>
                </div>
                <div className="flex items-center justify-between text-[#8AA8B2]">
                  <span>Network</span>
                  <span className="font-bold text-white font-mono">Elysium</span>
                </div>
              </div>
            </div>

            {/* High-Contrast Action Banner (Elysium Luxury CTA) */}
            <div className="relative overflow-hidden rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-[#0c2831]/90 via-[#071d24]/95 to-[#031116]/98 p-6 text-white shadow-[0_20px_45px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.12)] space-y-4">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />

              <div className="relative z-10 space-y-1.5">
                <p className="font-display text-2xl uppercase tracking-tight text-white leading-tight">
                  Ready for Elysium?
                </p>
                <p className="text-xs sm:text-sm text-[#8AA8B2] leading-relaxed">
                  Unbox mystery crates during active drop cycles or track your 5-step allowlist qualification in real time.
                </p>
              </div>

              <div className="relative z-10 flex flex-col gap-2.5 pt-1">
                <Link href="/drops" className="block w-full">
                  <Button variant="primary" size="md" className="w-full justify-center">
                    Open Crates
                  </Button>
                </Link>
                <Link href="/whitelist" className="block w-full">
                  <Button variant="secondary" size="md" className="w-full justify-center">
                    Whitelist Portal
                  </Button>
                </Link>
              </div>

              <div className="pointer-events-none absolute -bottom-8 -right-8 h-28 w-28 rounded-full bg-[#34B7DD]/10 blur-xl" />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
