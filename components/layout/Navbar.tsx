"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield } from "lucide-react";
import { WalletButton } from "@/components/auth/WalletButton";
import { useSiweAuth } from "@/hooks/useSiweAuth";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/whitelist", label: "Whitelist" },
  { href: "/drops", label: "Drops" },
  { href: "/docs", label: "Docs" },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { status, sessionAddress } = useSiweAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  // Dynamic scroll listener for glassmorphic depth & elevation
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 15);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (status === "authenticated") {
      fetch("/api/admin/check")
        .then((res) => (res.ok ? res.json() : { isAdmin: false }))
        .then((data) => {
          if (!cancelled) {
            setIsAdmin(Boolean(data?.isAdmin));
          }
        })
        .catch(() => {
          if (!cancelled) setIsAdmin(false);
        });
    } else {
      setIsAdmin(false);
    }
    return () => {
      cancelled = true;
    };
  }, [status, sessionAddress]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [mobileMenuOpen]);

  // Close mobile menu on page navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <header
      className={`sticky top-0 z-40 w-full transition-all duration-300 ${
        isScrolled
          ? "border-b border-[#1E4D5A]/90 bg-[#04181C]/92 shadow-[0_12px_40px_rgba(2,10,12,0.85)] backdrop-blur-2xl"
          : "border-b border-[#163B44]/70 bg-[#04181C]/80 shadow-[0_4px_20px_rgba(0,0,0,0.3)] backdrop-blur-xl"
      }`}
    >
      {/* Top Cyber Accent Line (Luminous Neon Beam) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#34B7DD]/60 to-transparent" />

      {/* Main Bar Container */}
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:h-18 sm:px-6 lg:px-8">
        {/* Left: Brand Identity */}
        <div className="flex flex-1 items-center justify-start">
          <Link
            href="/"
            aria-label="ChimpHood Home — Elychimp Logo"
            className="group relative inline-flex items-center gap-2 focus:outline-none"
          >
            {/* Ambient Cyan Glow on Hover */}
            <div className="absolute -inset-2 rounded-xl bg-gradient-to-r from-[#34B7DD]/25 to-transparent opacity-0 blur-lg transition-opacity duration-300 group-hover:opacity-100" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/elychimp-logo.png"
              alt="Elychimp Logo"
              className="relative h-8 w-auto object-contain drop-shadow-[0_2px_14px_rgba(52,183,221,0.25)] transition-transform duration-200 group-hover:scale-105 sm:h-9"
            />
          </Link>
        </div>

        {/* Center: Desktop Navigation Island (Cyber Capsule) */}
        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-1 rounded-full border border-[#163B44]/80 bg-[#071F24]/75 p-1 shadow-[inset_0_1px_2px_rgba(255,255,255,0.06),0_6px_24px_rgba(0,0,0,0.4)] backdrop-blur-md md:flex"
        >
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-label={link.label}
                className={`group relative inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold tracking-wider uppercase transition-all duration-200 ${
                  isActive
                    ? "border border-[#34B7DD]/60 bg-gradient-to-b from-[#103844] to-[#082229] text-[#34B7DD] shadow-[0_0_16px_rgba(52,183,221,0.3)]"
                    : "text-[#8AA8B2] hover:bg-[#102B33]/60 hover:text-[#DBF2F9]"
                }`}
              >
                {/* Active Neon Dot */}
                {isActive && (
                  <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#34B7DD] shadow-[0_0_8px_#34B7DD]" />
                )}
                <span>{link.label}</span>
              </Link>
            );
          })}

          {/* Admin Mission Control Link */}
          {isAdmin && (
            <Link
              href="/admin"
              aria-label="Admin Portal"
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold tracking-wider uppercase transition-all ${
                pathname.startsWith("/admin")
                  ? "border border-[#F59E0B]/60 bg-gradient-to-b from-[#F59E0B]/25 to-[#F59E0B]/10 text-[#F59E0B] shadow-[0_0_16px_rgba(245,158,11,0.25)]"
                  : "text-[#F59E0B] hover:bg-[#F59E0B]/15 hover:text-[#FBBF24]"
              }`}
            >
              <Shield className="h-3.5 w-3.5 text-[#F59E0B]" />
              <span>Admin</span>
            </Link>
          )}
        </nav>

        {/* Right: Wallet Button & Mobile Toggle */}
        <div className="flex flex-1 items-center justify-end gap-3">
          {/* Desktop Wallet Button */}
          <div className="hidden items-center sm:flex">
            <WalletButton />
          </div>

          {/* Mobile: Compact Wallet Button */}
          <div className="flex items-center sm:hidden">
            <WalletButton compact />
          </div>

          {/* Mobile Menu Trigger Button */}
          <button
            type="button"
            className={`group relative flex h-11 w-11 items-center justify-center rounded-xl border transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#34B7DD] md:hidden ${
              mobileMenuOpen
                ? "scale-105 border-[#34B7DD]/80 bg-[#0A262E] text-[#34B7DD] shadow-[0_0_18px_rgba(52,183,221,0.35)] ring-1 ring-[#34B7DD]/30"
                : "border-[#163B44]/80 bg-[#071F24]/80 text-[#DBF2F9] hover:border-[#34B7DD]/60 hover:bg-[#102B33] active:scale-95"
            }`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {/* Ambient Neon Glow */}
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-[#34B7DD]/30 to-transparent blur-sm transition-opacity duration-300 ${
                mobileMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-60"
              }`}
            />

            {/* Morphing Hamburger Bars */}
            <div
              className="relative flex h-[18px] w-5 flex-col items-center justify-between"
              aria-hidden="true"
            >
              {/* Bar 1 (Top) */}
              <span
                className={`block h-[2px] origin-center rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  mobileMenuOpen
                    ? "w-5 translate-y-[8px] rotate-45 bg-[#34B7DD] shadow-[0_0_8px_#34B7DD]"
                    : "w-5 bg-[#DBF2F9] group-hover:bg-[#34B7DD]"
                }`}
              />
              {/* Bar 2 (Middle) */}
              <span
                className={`block h-[2px] rounded-full transition-all duration-200 ease-out ${
                  mobileMenuOpen
                    ? "w-0 -translate-x-2 bg-[#34B7DD] opacity-0"
                    : "w-3.5 self-start bg-[#8AA8B2] group-hover:w-5 group-hover:bg-[#34B7DD]"
                }`}
              />
              {/* Bar 3 (Bottom) */}
              <span
                className={`block h-[2px] origin-center rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  mobileMenuOpen
                    ? "w-5 -translate-y-[8px] -rotate-45 bg-[#34B7DD] shadow-[0_0_8px_#34B7DD]"
                    : "w-5 bg-[#DBF2F9] group-hover:bg-[#34B7DD]"
                }`}
              />
            </div>
          </button>
        </div>
      </div>

      {/* Bottom Glowing Accent Border Line */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-[1px] transition-opacity duration-300 ${
          isScrolled
            ? "bg-gradient-to-r from-transparent via-[#34B7DD]/35 to-transparent opacity-100"
            : "opacity-0"
        }`}
      />

      {/* Mobile Drawer Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          className="animate-mobile-backdrop fixed inset-0 top-16 z-30 bg-black/75 backdrop-blur-md md:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="animate-mobile-drawer relative z-40 rounded-b-3xl border-b border-[#1E4D5A]/90 bg-gradient-to-b from-[#061E24]/98 via-[#04181C]/98 to-[#020D10]/98 px-5 pt-5 pb-6 shadow-[0_24px_60px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(52,183,221,0.2)] backdrop-blur-2xl sm:px-6 md:hidden">
          {/* Decorative Cyber Top Beam */}
          <div className="pointer-events-none absolute inset-x-8 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#34B7DD]/60 to-transparent" />

          <nav
            aria-label="Mobile navigation"
            className="flex flex-col items-center gap-2.5"
          >
            {navLinks.map((link, idx) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-label={link.label}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{ animationDelay: `${50 + idx * 45}ms` }}
                  className={`animate-mobile-item group relative flex w-full items-center justify-start rounded-xl px-4 py-3 text-sm font-semibold tracking-wider uppercase transition-all duration-200 active:scale-[0.99] ${
                    isActive
                      ? "border border-[#34B7DD]/70 bg-gradient-to-r from-[#34B7DD]/20 via-[#103844]/60 to-[#34B7DD]/15 text-[#34B7DD] shadow-[0_0_20px_rgba(52,183,221,0.25)]"
                      : "border border-[#163B44]/80 bg-[#071F24]/70 text-[#DBF2F9] hover:border-[#34B7DD]/50 hover:bg-[#102B33]/90 hover:text-[#34B7DD]"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    {isActive ? (
                      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#34B7DD] shadow-[0_0_8px_#34B7DD]" />
                    ) : (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#163B44] transition-colors group-hover:bg-[#34B7DD]" />
                    )}
                    <span>{link.label}</span>
                  </span>
                </Link>
              );
            })}

            {/* Mobile Admin Link */}
            {isAdmin && (
              <Link
                href="/admin"
                aria-label="Admin Portal"
                onClick={() => setMobileMenuOpen(false)}
                style={{ animationDelay: `${50 + navLinks.length * 45}ms` }}
                className={`animate-mobile-item group flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold tracking-wider uppercase transition-all duration-200 active:scale-[0.99] ${
                  pathname.startsWith("/admin")
                    ? "border border-[#F59E0B]/70 bg-gradient-to-r from-[#F59E0B]/25 via-[#F59E0B]/15 to-[#F59E0B]/20 text-[#F59E0B] shadow-[0_0_20px_rgba(245,158,11,0.25)]"
                    : "border border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#F59E0B] hover:border-[#F59E0B]/60 hover:bg-[#F59E0B]/20"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Shield className="h-4 w-4" />
                  <span>Admin Portal</span>
                </span>
                <span className="font-mono-street rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-1.5 py-0.5 text-[10px] tracking-widest text-[#F59E0B]/80 uppercase">
                  Mod
                </span>
              </Link>
            )}
          </nav>

          {/* Mobile Wallet & Session Dock */}
          <div
            style={{
              animationDelay: `${70 + (navLinks.length + (isAdmin ? 1 : 0)) * 45}ms`,
            }}
            className="animate-mobile-item mt-5 flex flex-col items-center gap-3 border-t border-[#163B44]/80 pt-5"
          >
            <div className="flex w-full items-center px-1">
              <span className="font-mono-street text-[10px] tracking-wider text-[#8AA8B2]/70 uppercase">
                Account & Wallet
              </span>
            </div>

            <WalletButton align="center" onAction={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}
    </header>
  );
}
