import React from "react";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-gray-800 bg-[#07080c] py-8 text-sm text-gray-400">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
        <div>
          <p className="font-semibold text-gray-200">ChimpHood Site</p>
          <p className="text-xs text-gray-500">
            Tahap 0: Project Foundation & Documentation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-xs text-gray-400">
          <Link href="/" className="transition-colors hover:text-emerald-400">
            Home
          </Link>
          <Link href="/whitelist" className="transition-colors hover:text-emerald-400">
            Whitelist
          </Link>
          <Link href="/profile" className="transition-colors hover:text-emerald-400">
            Profile
          </Link>
          <Link href="/docs" className="transition-colors hover:text-emerald-400">
            Docs
          </Link>
        </div>

        <p className="text-xs text-gray-600">
          &copy; {new Date().getFullYear()} ChimpHood. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
