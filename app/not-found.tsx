import React from "react";
import Link from "next/link";
import { ArrowLeft, Gift, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="relative flex min-h-[75vh] flex-col items-center justify-center overflow-hidden px-4 py-16 text-center">
      {/* Ambient Leonida Sunset Lighting Bleed */}
      <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[380px] w-[380px] rounded-full bg-pink-500/10 blur-[130px]" />
      <div className="pointer-events-none absolute top-1/2 left-1/3 h-[280px] w-[280px] rounded-full bg-amber-400/10 blur-[110px]" />

      {/* Industrial Status Tag */}
      <div className="mb-4 inline-flex items-center gap-2 border-2 border-pink-500/60 bg-pink-500/10 px-3.5 py-1 font-mono-street text-xs font-black uppercase tracking-wider text-pink-300 backdrop-blur-sm">
        <Zap className="h-3.5 w-3.5 text-pink-400" />
        <span>404 // SIGNAL LOST IN THE HOOD</span>
      </div>

      {/* Big Display Headline */}
      <h1 className="font-display text-6xl sm:text-8xl md:text-9xl uppercase tracking-tighter text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)] leading-[0.9]">
        OFF THE <br />
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff5b89] via-[#facc15] to-[#4ade80]">
          GRID.
        </span>
      </h1>

      <p className="mt-6 max-w-lg font-mono-street text-xs sm:text-sm text-stone-300 leading-relaxed uppercase">
        The coordinates you entered do not exist or have been wiped from the Leonida Syndicate database. Re-route your clearance below.
      </p>

      {/* Brutalist Action Buttons */}
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
        <Link href="/" className="w-full sm:w-auto">
          <Button
            size="lg"
            className="w-full gap-2.5 border-2 border-black bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-300 font-display text-base sm:text-lg tracking-wider uppercase text-black shadow-brutal transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_#ff5b89] px-6 py-4"
          >
            <ArrowLeft className="h-4 w-4" />
            RETURN TO HQ
          </Button>
        </Link>
        <Link href="/drops" className="w-full sm:w-auto">
          <Button
            size="lg"
            variant="secondary"
            className="w-full gap-2.5 border-2 border-pink-500/50 bg-[#0d0a14]/90 backdrop-blur-md font-display text-base sm:text-lg tracking-wider uppercase text-pink-200 shadow-brutal transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-pink-400 hover:text-white px-6 py-4"
          >
            <Gift className="h-4 w-4 text-pink-400" />
            CHECK DROPS
          </Button>
        </Link>
      </div>
    </div>
  );
}
