"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, Menu, X } from "lucide-react";
import { WalletButton } from "@/components/auth/WalletButton";
import { useSiweAuth } from "@/hooks/useSiweAuth";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/drops", label: "Drops" },
  { href: "/whitelist", label: "Whitelist" },
  { href: "/profile", label: "Profile" },
  { href: "/docs", label: "Docs" },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { status, sessionAddress } = useSiweAuth();
  const [isAdmin, setIsAdmin] = useState(false);

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

  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-800/80 bg-[#08090d]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Brand Logo */}
        <div className="flex flex-1 items-center justify-start">
          <Link href="/" className="inline-flex items-center group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/elychimp-logo.png"
              alt="Elychimp Logo"
              className="h-8 sm:h-9 w-auto object-contain transition-transform duration-200 group-hover:scale-105 drop-shadow-[0_2px_10px_rgba(255,255,255,0.15)]"
            />
          </Link>
        </div>

        {/* Center: Desktop Navigation Links (Centered) */}
        <nav className="hidden md:flex items-center justify-center gap-1.5 lg:gap-2">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3.5 py-1.5 font-mono-street text-xs font-bold uppercase tracking-wider transition-all duration-150 ${
                  isActive
                    ? "border border-amber-400/50 bg-amber-400/10 text-amber-400 shadow-sm"
                    : "text-gray-400 hover:bg-gray-800/60 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}

          {/* Exclusive Admin Portal Link for verified Admins */}
          {isAdmin && (
            <Link
              href="/admin"
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 font-mono-street text-xs font-bold uppercase tracking-wider transition-all ${
                pathname.startsWith("/admin")
                  ? "border border-amber-500/50 bg-amber-500/20 text-amber-400"
                  : "text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
              }`}
            >
              <Shield className="h-3.5 w-3.5" />
              Admin
            </Link>
          )}
        </nav>

        {/* Right: Wallet Button & Mobile Menu Toggle */}
        <div className="flex flex-1 items-center justify-end gap-3">
          <div className="hidden sm:flex items-center">
            <WalletButton />
          </div>

          {/* Mobile menu trigger */}
          <button
            className="flex p-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white md:hidden border border-gray-800 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5 text-amber-400" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation (Centered & Fully Responsive) */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-gray-800 bg-[#0a0c13] px-6 py-6 shadow-2xl animate-in slide-in-from-top-2 duration-200">
          <nav className="flex flex-col items-center gap-2">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`w-full text-center rounded-xl py-3 font-mono-street text-sm font-bold uppercase tracking-wider transition-all ${
                    isActive
                      ? "border border-amber-400/50 bg-amber-400/10 text-amber-400 shadow-sm"
                      : "text-gray-300 hover:bg-gray-800/80 hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}

            {/* Mobile Admin Link */}
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 font-mono-street text-sm font-bold uppercase tracking-wider transition-all ${
                  pathname.startsWith("/admin")
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                    : "text-amber-400 hover:bg-amber-500/10"
                }`}
              >
                <Shield className="h-4 w-4" />
                Admin Portal
              </Link>
            )}
          </nav>

          <div className="mt-6 border-t border-gray-800/80 pt-5 flex justify-center">
            <WalletButton />
          </div>
        </div>
      )}
    </header>
  );
}
