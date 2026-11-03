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

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-800 bg-[#090a0f]/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-black tracking-tight text-emerald-400">
              CHIMP<span className="text-gray-100">HOOD</span>
            </span>
            <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-emerald-400 uppercase">
              Stage 1
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-gray-800 text-emerald-400"
                      : "text-gray-300 hover:bg-gray-800/60 hover:text-white"
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
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                  pathname.startsWith("/admin")
                    ? "border border-amber-500/30 bg-amber-500/20 text-amber-400"
                    : "text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                }`}
              >
                <Shield className="h-4 w-4" />
                Admin Portal
              </Link>
            )}
          </nav>
        </div>

        {/* Right CTA */}
        <div className="hidden items-center gap-3 md:flex">
          <WalletButton />
        </div>

        {/* Mobile menu trigger */}
        <button
          className="flex p-2 text-gray-300 hover:text-white md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="border-b border-gray-800 bg-[#0c0e17] px-4 pt-2 pb-4 md:hidden">
          <nav className="flex flex-col gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-gray-800 text-emerald-400"
                      : "text-gray-300 hover:bg-gray-800/60 hover:text-white"
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
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                  pathname.startsWith("/admin")
                    ? "bg-amber-500/20 text-amber-400"
                    : "text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                }`}
              >
                <Shield className="h-4 w-4" />
                Admin Portal
              </Link>
            )}
          </nav>
          <div className="mt-4 border-t border-gray-800 pt-3">
            <div className="flex w-full justify-center">
              <WalletButton />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
