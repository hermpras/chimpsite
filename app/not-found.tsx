import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="relative flex min-h-[75vh] flex-col items-center justify-center overflow-hidden px-4 py-16 text-center">
      {/* Ambient Lighting Bleed */}
      <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[380px] w-[380px] rounded-full bg-[#34B7DD]/10 blur-[130px]" />
      <div className="pointer-events-none absolute top-1/2 left-1/3 h-[280px] w-[280px] rounded-full bg-[#F59E0B]/10 blur-[110px]" />

      {/* Clean Status Tag */}
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#163B44] bg-[#0B2026] px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-[#34B7DD] backdrop-blur-sm">
        <span>404 Page Not Found</span>
      </div>

      {/* Headline */}
      <h1 className="font-display text-6xl sm:text-8xl md:text-9xl uppercase tracking-tighter text-[#F8F7F4] drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)] leading-[0.9]">
        OFF THE <br />
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#34B7DD] via-[#6FCDE8] to-[#F59E0B]">
          GRID.
        </span>
      </h1>

      <p className="mt-6 max-w-lg text-sm sm:text-base text-[#8AA8B2] leading-relaxed">
        The coordinates you entered do not exist or have moved. Return to headquarters or explore active drops.
      </p>

      {/* Action Buttons */}
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
        <Link href="/" className="w-full sm:w-auto">
          <Button
            variant="primary"
            size="lg"
            className="w-full px-8"
          >
            RETURN TO HQ
          </Button>
        </Link>
        <Link href="/drops" className="w-full sm:w-auto">
          <Button
            size="lg"
            variant="secondary"
            className="w-full px-8"
          >
            CHECK DROPS
          </Button>
        </Link>
      </div>
    </div>
  );
}
