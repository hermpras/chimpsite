"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";

export interface WonTraitData {
  id: string;
  edition: number;
  trait: {
    id: string;
    name: string;
    category: string;
    rarity: string;
    imageUrl?: string | null;
    description?: string | null;
  };
}

export interface PoolPreviewItem {
  poolItemId: string;
  traitName: string;
  category: string;
  rarity: string;
  imageUrl?: string;
}

interface ClaimLootboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  poolItems?: PoolPreviewItem[];
  claimedItem?: WonTraitData | null;
  isLoading?: boolean;
  error?: string | null;
  periodIndex?: number;
}

const RARITY_THEME: Record<
  string,
  {
    border: string;
    bg: string;
    glow: string;
    badgeBg: string;
    badgeBorder: string;
    badgeText: string;
    titleColor: string;
    rayColor: string;
    particleColors: string[];
    prefix: string;
  }
> = {
  LEGENDARY: {
    border: "border-amber-400/80 shadow-[0_0_35px_rgba(251,191,36,0.35)]",
    bg: "bg-gradient-to-b from-amber-950/70 via-[#0d1f24] to-[#041419]",
    glow: "shadow-[0_0_60px_rgba(251,191,36,0.35)]",
    badgeBg: "bg-gradient-to-r from-amber-500/25 via-yellow-500/20 to-amber-500/25",
    badgeBorder: "border-amber-400/80",
    badgeText: "text-amber-200",
    titleColor: "text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400",
    rayColor: "rgba(251, 191, 36, 0.28)",
    particleColors: ["#f59e0b", "#fbbf24", "#fef08a", "#d97706", "#ffffff"],
    prefix: "LEGENDARY",
  },
  EPIC: {
    border: "border-purple-400/80 shadow-[0_0_35px_rgba(192,132,252,0.3)]",
    bg: "bg-gradient-to-b from-purple-950/70 via-[#0d1f24] to-[#041419]",
    glow: "shadow-[0_0_60px_rgba(192,132,252,0.3)]",
    badgeBg: "bg-gradient-to-r from-purple-500/25 via-fuchsia-500/20 to-purple-500/25",
    badgeBorder: "border-purple-400/80",
    badgeText: "text-purple-200",
    titleColor: "text-transparent bg-clip-text bg-gradient-to-r from-purple-200 via-fuchsia-300 to-purple-400",
    rayColor: "rgba(192, 132, 252, 0.24)",
    particleColors: ["#a855f7", "#c084fc", "#e879f9", "#7e22ce", "#ffffff"],
    prefix: "EPIC",
  },
  RARE: {
    border: "border-sky-400/80 shadow-[0_0_35px_rgba(56,189,248,0.3)]",
    bg: "bg-gradient-to-b from-sky-950/70 via-[#0d1f24] to-[#041419]",
    glow: "shadow-[0_0_60px_rgba(56,189,248,0.3)]",
    badgeBg: "bg-gradient-to-r from-sky-500/25 via-cyan-500/20 to-sky-500/25",
    badgeBorder: "border-sky-400/80",
    badgeText: "text-sky-200",
    titleColor: "text-transparent bg-clip-text bg-gradient-to-r from-sky-200 via-cyan-300 to-sky-400",
    rayColor: "rgba(56, 189, 248, 0.22)",
    particleColors: ["#0284c7", "#38bdf8", "#7dd3fc", "#0369a1", "#ffffff"],
    prefix: "RARE",
  },
  UNCOMMON: {
    border: "border-emerald-400/80 shadow-[0_0_30px_rgba(52,211,153,0.25)]",
    bg: "bg-gradient-to-b from-emerald-950/70 via-[#0d1f24] to-[#041419]",
    glow: "shadow-[0_0_50px_rgba(52,211,153,0.25)]",
    badgeBg: "bg-gradient-to-r from-emerald-500/25 via-teal-500/20 to-emerald-500/25",
    badgeBorder: "border-emerald-400/80",
    badgeText: "text-emerald-200",
    titleColor: "text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 via-teal-300 to-emerald-400",
    rayColor: "rgba(52, 211, 153, 0.2)",
    particleColors: ["#059669", "#34d399", "#6ee7b7", "#047857", "#ffffff"],
    prefix: "UNCOMMON",
  },
  COMMON: {
    border: "border-[#20515e] shadow-[0_0_25px_rgba(156,163,175,0.15)]",
    bg: "bg-gradient-to-b from-[#0e2a33]/80 via-[#0a2026] to-[#031317]",
    glow: "shadow-[0_0_40px_rgba(156,163,175,0.15)]",
    badgeBg: "bg-zinc-800/80",
    badgeBorder: "border-zinc-600/70",
    badgeText: "text-zinc-300",
    titleColor: "text-gray-100",
    rayColor: "rgba(156, 163, 175, 0.14)",
    particleColors: ["#9ca3af", "#d1d5db", "#6b7280", "#4b5563"],
    prefix: "COMMON",
  },
};

// Retro Web Audio SFX (self-contained, 0 external deps, zero latency)
function playTone(type: "tick" | "reveal" | "click") {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (type === "tick") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(540, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(760, ctx.currentTime + 0.035);
      gain.gain.setValueAtTime(0.025, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0005, ctx.currentTime + 0.035);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.035);
    } else if (type === "reveal") {
      // 5-note celebratory arpeggio: C5 (523Hz), E5 (659Hz), G5 (784Hz), B5 (988Hz), C6 (1046Hz)
      const notes = [523.25, 659.25, 783.99, 987.77, 1046.5];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        const start = ctx.currentTime + i * 0.07;
        const duration = 0.45;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.08, start);
        gain.gain.exponentialRampToValueAtTime(0.0005, start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration);
      });
    } else if (type === "click") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(650, ctx.currentTime);
      gain.gain.setValueAtTime(0.02, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.025);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.025);
    }
  } catch {
    // Audio autoplay restrictions or blocked context
  }
}

const ROLLING_MESSAGES = [
  "Connecting to Elysium RNG Pod...",
  "Scanning Cryptographic Entropy...",
  "Decrypting Trait Matrix...",
  "Forging Serialized Edition...",
  "Unlocking Mystery Capsule...",
];

export function ClaimLootboxModal({
  isOpen,
  onClose,
  poolItems = [],
  claimedItem,
  isLoading = false,
  error = null,
  periodIndex,
}: ClaimLootboxModalProps) {
  const [phase, setPhase] = useState<"ROLLING" | "REVEAL" | "ERROR">("ROLLING");
  const [currentRollIndex, setCurrentRollIndex] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [minRollingDone, setMinRollingDone] = useState(false);
  const modalContainerRef = useRef<HTMLDivElement>(null);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Focus trap & Escape key handler
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (phase !== "ROLLING") {
          onClose();
        }
        return;
      }

      if (e.key === "Tab") {
        const container = modalContainerRef.current;
        if (!container) return;

        const focusable = container.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, phase, onClose]);

  // Reset or initialize when modal opens
  useEffect(() => {
    if (isOpen) {
      setPhase("ROLLING");
      setMinRollingDone(false);
      setCurrentRollIndex(0);
      setMessageIndex(0);

      // Optimized suspense window (~1600ms): fast, thrilling, and responsive
      const minTimer = setTimeout(() => {
        setMinRollingDone(true);
      }, 1600);

      return () => clearTimeout(minTimer);
    }
  }, [isOpen]);

  // Handle error
  useEffect(() => {
    if (error && isOpen) {
      setPhase("ERROR");
    }
  }, [error, isOpen]);

  // Transition to REVEAL once loading completes, item is present, and minimum roll time has elapsed
  useEffect(() => {
    if (isOpen && claimedItem && !isLoading && minRollingDone && !error) {
      setPhase("REVEAL");
      if (soundEnabledRef.current) {
        playTone("reveal");
      }
    }
  }, [isOpen, claimedItem, isLoading, minRollingDone, error]);

  // Fast roulette ticker animation while in ROLLING phase
  useEffect(() => {
    if (!isOpen || phase !== "ROLLING") return;

    const interval = setInterval(() => {
      setCurrentRollIndex((prev) => {
        const next = (prev + 1) % Math.max(1, poolItems.length);
        if (soundEnabledRef.current && Math.random() > 0.45) {
          playTone("tick");
        }
        return next;
      });
    }, 85);

    return () => clearInterval(interval);
  }, [isOpen, phase, poolItems.length]);

  // Cycle suspense status messages
  useEffect(() => {
    if (!isOpen || phase !== "ROLLING") return;

    const msgInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % ROLLING_MESSAGES.length);
    }, 450);

    return () => clearInterval(msgInterval);
  }, [isOpen, phase]);

  if (!isOpen) return null;

  const currentPreview =
    poolItems.length > 0
      ? poolItems[currentRollIndex % poolItems.length]
      : {
          traitName: "Elychimp Trait",
          category: "TRAIT",
          rarity: "EPIC",
          imageUrl: undefined,
        };

  const wonTrait = claimedItem?.trait;
  const wonRarity = (wonTrait?.rarity || "COMMON").toUpperCase();
  const wonTheme = RARITY_THEME[wonRarity] || RARITY_THEME.COMMON;

  // Share on X (Twitter) URL
  const tweetText = wonTrait
    ? encodeURIComponent(
        `Just pulled ${wonTrait.name} (${wonRarity}) in the @Elychimp Drop! Edition #${claimedItem?.edition} • Deployed on @Enter_elysium (Elysium).\n\nRule the streets:`
      )
    : "";
  const shareUrl = typeof window !== "undefined" ? window.location.origin : "https://elychimp.xyz";
  const tweetHref = `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(
    shareUrl
  )}`;

  return (
    <div
      ref={modalContainerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lootbox-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-xl animate-fade-in overflow-y-auto overflow-x-hidden"
    >
      {/* Dynamic Keyframe & Particle Styles */}
      <style>{`
        @keyframes sunburst {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes podPulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 18px rgba(52,183,221,0.3)); }
          50% { transform: scale(1.02); filter: drop-shadow(0 0 32px rgba(52,183,221,0.55)); }
        }
        @keyframes podShake {
          0% { transform: translate(0, 0); }
          25% { transform: translate(-1.5px, 1.5px); }
          50% { transform: translate(1.5px, -1px); }
          75% { transform: translate(-1px, -1.5px); }
          100% { transform: translate(0, 0); }
        }
        @keyframes laserSweep {
          0% { top: 0%; opacity: 0.2; }
          30% { opacity: 0.9; }
          70% { opacity: 0.9; }
          100% { top: 100%; opacity: 0.2; }
        }
        @keyframes floatParticle {
          0% { transform: translateY(0) scale(0.8); opacity: 0; }
          30% { opacity: 0.95; }
          100% { transform: translateY(-75px) scale(1.2); opacity: 0; }
        }
        @keyframes bounceIn {
          0% { opacity: 0; transform: scale(0.7) translateY(18px); }
          65% { opacity: 1; transform: scale(1.03) translateY(-3px); }
          85% { transform: scale(0.99) translateY(1px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-sunburst {
          animation: sunburst 30s linear infinite;
        }
        .animate-pod-pulse {
          animation: podPulse 1.6s ease-in-out infinite;
        }
        .animate-pod-shake {
          animation: podShake 0.12s ease-in-out infinite;
        }
        .animate-bounce-in {
          animation: bounceIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
      `}</style>

      {/* Top Utility Controls: Minimalist Audio & Close Buttons (Zero Icons) */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const next = !soundEnabled;
            setSoundEnabled(next);
            if (next) playTone("click");
          }}
          className="rounded-lg border border-cyan-500/30 bg-[#07242c]/80 px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-300 hover:border-cyan-400 hover:text-white backdrop-blur transition-all cursor-pointer shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
          title={soundEnabled ? "Mute SFX" : "Unmute SFX"}
          aria-label={soundEnabled ? "Mute SFX" : "Unmute SFX"}
        >
          {soundEnabled ? "SFX ON" : "SFX OFF"}
        </button>
        {phase !== "ROLLING" && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 bg-white/[0.05] px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-300 hover:border-white/40 hover:text-white backdrop-blur transition-all cursor-pointer shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
            title="Close modal"
            aria-label="Close modal"
          >
            CLOSE
          </button>
        )}
      </div>

      {/* Main Luxury Glassmorphic Dialog Container */}
      <div className="relative my-auto w-full max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-3xl border border-cyan-500/25 bg-gradient-to-b from-[#0c2b33]/98 via-[#071f25]/98 to-[#021014]/99 p-5 sm:p-7 text-center shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.18),0_25px_70px_rgba(0,0,0,0.92)] backdrop-blur-2xl">
        {/* Top Specular Rim Line */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent" />

        {/* Ambient Radial Spotlight */}
        <div
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full blur-3xl opacity-40"
          style={{
            backgroundColor: phase === "REVEAL" ? wonTheme.particleColors[0] : "#34B7DD",
          }}
        />

        {/* ===================== PHASE 1: ROLLING ===================== */}
        {phase === "ROLLING" && (
          <div className="relative z-10 flex flex-col items-center py-2 sm:py-3">
            {/* Header Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-950/40 px-3.5 py-1 text-[11px] font-mono font-bold uppercase tracking-widest text-cyan-300 shadow-[0_0_15px_rgba(52,183,221,0.2)]">
              <span>
                {periodIndex ? `PERIOD #${periodIndex} DROP CAPSULE` : "LOOT CAPSULE"}
              </span>
            </div>

            <h3
              id="lootbox-title"
              className="mt-3.5 text-xl sm:text-2xl font-black uppercase tracking-[0.14em] text-transparent bg-clip-text bg-gradient-to-b from-white via-slate-100 to-slate-400 drop-shadow-sm"
            >
              Unlocking Mystery Trait
            </h3>

            {/* Futuristic Holographic Chamber Pod */}
            <div className="relative mt-5 sm:mt-6 flex h-48 w-48 sm:h-56 sm:w-56 items-center justify-center rounded-2xl border-2 border-cyan-400/50 bg-[#031519]/90 p-3 shadow-[0_0_40px_rgba(52,183,221,0.25)] animate-pod-pulse overflow-hidden">
              {/* Precision Tech Corner Brackets */}
              <div className="absolute top-1.5 left-1.5 h-3 w-3 border-t-2 border-l-2 border-cyan-400" />
              <div className="absolute top-1.5 right-1.5 h-3 w-3 border-t-2 border-r-2 border-cyan-400" />
              <div className="absolute bottom-1.5 left-1.5 h-3 w-3 border-b-2 border-l-2 border-cyan-400" />
              <div className="absolute bottom-1.5 right-1.5 h-3 w-3 border-b-2 border-r-2 border-cyan-400" />

              {/* Sweeping Holographic Laser Line */}
              <div className="pointer-events-none absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-300 to-transparent shadow-[0_0_12px_#38bdf8] animate-[laserSweep_1.4s_ease-in-out_infinite]" />

              {/* Pedestal Glow Behind Artwork */}
              <div className="pointer-events-none absolute inset-4 rounded-xl bg-gradient-to-b from-cyan-500/10 to-transparent blur-md" />

              {/* Shaking Ticker Preview Item */}
              <div className="relative flex flex-col items-center justify-center animate-pod-shake">
                {currentPreview.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentPreview.imageUrl}
                    alt={currentPreview.traitName}
                    className="h-32 w-32 sm:h-36 sm:w-36 object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.8)]"
                    style={{ imageRendering: "pixelated" }}
                  />
                ) : (
                  <div className="flex h-32 w-32 sm:h-36 sm:w-36 items-center justify-center rounded-xl bg-[#04181C] text-cyan-400 font-mono text-xs uppercase tracking-widest border border-cyan-500/20">
                    MYSTERY POD
                  </div>
                )}
                <div className="mt-2 text-center">
                  <p className="truncate max-w-[170px] text-xs font-bold text-gray-100">
                    {currentPreview.traitName}
                  </p>
                  <span className="text-[10px] font-mono text-cyan-400 uppercase font-semibold">
                    {currentPreview.rarity}
                  </span>
                </div>
              </div>
            </div>

            {/* Dynamic Status Ticker */}
            <div className="mt-6 flex flex-col items-center space-y-1.5">
              <div className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-950/40 px-3.5 py-1 shadow-[0_0_12px_rgba(52,211,153,0.2)]">
                <span className="font-mono text-xs font-bold text-emerald-300">
                  {ROLLING_MESSAGES[messageIndex]}
                </span>
              </div>
              <p className="text-[11px] text-[#8AA8B2] font-mono tracking-wide">
                Calculating transparent RNG on Elysium
              </p>
            </div>
          </div>
        )}

        {/* ===================== PHASE 2: REVEAL ===================== */}
        {phase === "REVEAL" && wonTrait && (
          <div className="relative z-10 flex flex-col items-center py-2 animate-bounce-in">
            {/* Sunburst Rays Background */}
            <div
              className="absolute -top-32 left-1/2 -translate-x-1/2 h-80 w-80 sm:h-96 sm:w-96 rounded-full pointer-events-none animate-sunburst opacity-45 blur-md overflow-hidden"
              style={{
                background: `conic-gradient(from 0deg, ${wonTheme.rayColor} 0deg 20deg, transparent 20deg 40deg, ${wonTheme.rayColor} 40deg 60deg, transparent 60deg 80deg, ${wonTheme.rayColor} 80deg 100deg, transparent 100deg 120deg, ${wonTheme.rayColor} 120deg 140deg, transparent 140deg 160deg, ${wonTheme.rayColor} 160deg 180deg, transparent 180deg 200deg, ${wonTheme.rayColor} 200deg 220deg, transparent 220deg 240deg, ${wonTheme.rayColor} 240deg 260deg, transparent 260deg 280deg, ${wonTheme.rayColor} 280deg 300deg, transparent 300deg 320deg, ${wonTheme.rayColor} 320deg 340deg, transparent 340deg 360deg)`,
              }}
            />

            {/* Floating Confetti Sparks */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {[...Array(16)].map((_, i) => (
                <div
                  key={i}
                  className="absolute h-2 w-2 rounded-full"
                  style={{
                    backgroundColor:
                      wonTheme.particleColors[i % wonTheme.particleColors.length],
                    left: `${15 + (i * 5.2) % 75}%`,
                    top: `${40 + (i * 7) % 50}%`,
                    animation: `floatParticle ${1.5 + (i % 4) * 0.4}s ease-out infinite`,
                    animationDelay: `${(i % 5) * 0.2}s`,
                  }}
                />
              ))}
            </div>

            {/* Rarity Banner */}
            <div
              className={`inline-flex items-center rounded-full border px-4 py-1.5 text-xs font-black uppercase tracking-[0.18em] ${wonTheme.badgeBg} ${wonTheme.badgeBorder} ${wonTheme.badgeText} shadow-lg`}
            >
              <span>{wonTheme.prefix} UNLOCKED</span>
            </div>

            {/* Trait Showcase Pedestal */}
            <div
              className={`relative mt-4 sm:mt-5 flex h-48 w-48 sm:h-56 sm:w-56 items-center justify-center overflow-hidden rounded-2xl border-2 ${wonTheme.border} ${wonTheme.bg} p-2.5 sm:p-3 ${wonTheme.glow} transition-all duration-300 shadow-2xl group`}
            >
              {/* Top Shimmer Sheen */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-white/60 to-transparent" />

              {/* Luxury Tech Corner Brackets */}
              <div className="absolute top-2 left-2 h-2.5 w-2.5 border-t border-l border-white/40" />
              <div className="absolute top-2 right-2 h-2.5 w-2.5 border-t border-r border-white/40" />
              <div className="absolute bottom-2 left-2 h-2.5 w-2.5 border-b border-l border-white/40" />
              <div className="absolute bottom-2 right-2 h-2.5 w-2.5 border-b border-r border-white/40" />

              {wonTrait.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={wonTrait.imageUrl}
                  alt={wonTrait.name}
                  className="h-36 w-36 sm:h-44 sm:w-44 object-contain transition-transform duration-300 hover:scale-105 drop-shadow-[0_12px_24px_rgba(0,0,0,0.85)]"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                <div className="flex h-44 w-44 items-center justify-center rounded-xl bg-[#04181C] text-white font-mono text-xs uppercase tracking-widest border border-white/10">
                  {wonTrait.category}
                </div>
              )}

              {/* Edition Serial Pill */}
              <div className="absolute bottom-2.5 right-2.5 rounded-lg border border-amber-400/50 bg-black/85 px-2.5 py-1 text-[11px] font-mono font-bold text-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.25)] backdrop-blur-sm">
                Edition #{claimedItem.edition}
              </div>
            </div>

            {/* Trait Title & Category */}
            <div className="mt-4 text-center">
              <h2 className={`text-2xl sm:text-3xl font-black tracking-tight ${wonTheme.titleColor}`}>
                {wonTrait.name}
              </h2>
              <div className="mt-1.5 flex items-center justify-center gap-2">
                <span className="rounded-md border border-cyan-500/30 bg-cyan-950/40 px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-300">
                  {wonTrait.category}
                </span>
                <span className="text-gray-600">•</span>
                <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                  Added to Your Inventory
                </span>
              </div>
              {wonTrait.description && (
                <p className="mt-2.5 text-xs text-slate-300/80 line-clamp-2 max-w-sm px-2 font-normal leading-relaxed">
                  {wonTrait.description}
                </p>
              )}
            </div>

            {/* Action Buttons (Zero Icons) */}
            <div className="mt-6 flex w-full flex-col gap-2.5">
              <Link
                href="/profile"
                onClick={onClose}
                className="flex w-full items-center justify-center rounded-xl border border-emerald-400/80 bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-600 py-3.5 font-sans text-xs sm:text-sm font-black uppercase tracking-[0.16em] text-[#02140d] shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.7),0_8px_24px_rgba(16,185,129,0.35)] hover:from-emerald-300 hover:via-emerald-400 hover:to-emerald-500 transition-all active:scale-[0.98]"
              >
                <span>Equip in Profile</span>
              </Link>

              <div className="flex items-center gap-2">
                <a
                  href={tweetHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center rounded-xl border border-[#7AE5FF]/80 bg-gradient-to-b from-[#4ED5F8] via-[#34B7DD] to-[#1E97BC] py-2.5 font-sans text-xs font-black uppercase tracking-[0.14em] text-[#021418] shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.85),0_8px_24px_rgba(52,183,221,0.3)] hover:from-[#72E2FF] hover:via-[#42C8EC] hover:to-[#26A6CC] transition-all active:scale-[0.98]"
                >
                  <span>Share on X</span>
                </a>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-[#34B7DD]/40 bg-gradient-to-b from-[#0D343F]/90 via-[#07242C]/90 to-[#04191F]/90 py-2.5 font-sans text-xs font-bold uppercase tracking-[0.14em] text-[#E0F5FA] shadow-[inset_0_1px_1px_rgba(255,255,255,0.25)] hover:border-[#6DE0FF] hover:text-white transition-all active:scale-[0.98] cursor-pointer"
                >
                  Collect & Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===================== PHASE 3: ERROR ===================== */}
        {phase === "ERROR" && (
          <div className="relative z-10 flex flex-col items-center py-6">
            <h3 className="text-lg font-bold text-rose-400">Claim Failed</h3>
            <p className="mt-2 text-xs text-gray-300 max-w-xs text-center leading-relaxed">
              {error || "An error occurred while claiming your drop. Please try again."}
            </p>

            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-xl border border-[#34B7DD]/40 bg-gradient-to-b from-[#0D343F]/90 via-[#07242C]/90 to-[#04191F]/90 py-2.5 font-sans text-xs font-bold uppercase tracking-[0.14em] text-[#E0F5FA] shadow-[inset_0_1px_1px_rgba(255,255,255,0.25)] hover:border-[#6DE0FF] hover:text-white transition-all active:scale-[0.98] cursor-pointer"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
