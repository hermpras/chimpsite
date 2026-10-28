"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  Sparkles,
  Share2,
  ExternalLink,
  CheckCircle2,
  X,
  AlertTriangle,
  Flame,
  Volume2,
  VolumeX,
} from "lucide-react";

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
    border: "border-amber-400",
    bg: "bg-gradient-to-b from-amber-950/60 via-amber-900/20 to-black",
    glow: "shadow-[0_0_50px_rgba(251,191,36,0.35)]",
    badgeBg: "bg-amber-500/25",
    badgeBorder: "border-amber-400/80",
    badgeText: "text-amber-300",
    titleColor: "text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400",
    rayColor: "rgba(251, 191, 36, 0.25)",
    particleColors: ["#f59e0b", "#fbbf24", "#fef08a", "#d97706", "#ffffff"],
    prefix: "★ LEGENDARY",
  },
  EPIC: {
    border: "border-purple-400",
    bg: "bg-gradient-to-b from-purple-950/60 via-purple-900/20 to-black",
    glow: "shadow-[0_0_50px_rgba(192,132,252,0.3)]",
    badgeBg: "bg-purple-500/25",
    badgeBorder: "border-purple-400/80",
    badgeText: "text-purple-300",
    titleColor: "text-transparent bg-clip-text bg-gradient-to-r from-purple-200 via-fuchsia-300 to-purple-400",
    rayColor: "rgba(192, 132, 252, 0.2)",
    particleColors: ["#a855f7", "#c084fc", "#e879f9", "#7e22ce", "#ffffff"],
    prefix: "◆ EPIC",
  },
  RARE: {
    border: "border-sky-400",
    bg: "bg-gradient-to-b from-sky-950/60 via-sky-900/20 to-black",
    glow: "shadow-[0_0_50px_rgba(56,189,248,0.3)]",
    badgeBg: "bg-sky-500/25",
    badgeBorder: "border-sky-400/80",
    badgeText: "text-sky-300",
    titleColor: "text-transparent bg-clip-text bg-gradient-to-r from-sky-200 via-cyan-300 to-sky-400",
    rayColor: "rgba(56, 189, 248, 0.2)",
    particleColors: ["#0284c7", "#38bdf8", "#7dd3fc", "#0369a1", "#ffffff"],
    prefix: "▲ RARE",
  },
  UNCOMMON: {
    border: "border-emerald-400",
    bg: "bg-gradient-to-b from-emerald-950/60 via-emerald-900/20 to-black",
    glow: "shadow-[0_0_40px_rgba(52,211,153,0.25)]",
    badgeBg: "bg-emerald-500/25",
    badgeBorder: "border-emerald-400/80",
    badgeText: "text-emerald-300",
    titleColor: "text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 via-teal-300 to-emerald-400",
    rayColor: "rgba(52, 211, 153, 0.18)",
    particleColors: ["#059669", "#34d399", "#6ee7b7", "#047857", "#ffffff"],
    prefix: "● UNCOMMON",
  },
  COMMON: {
    border: "border-gray-600",
    bg: "bg-gradient-to-b from-gray-900/80 via-gray-950 to-black",
    glow: "shadow-[0_0_30px_rgba(156,163,175,0.15)]",
    badgeBg: "bg-gray-800/60",
    badgeBorder: "border-gray-600",
    badgeText: "text-gray-300",
    titleColor: "text-gray-200",
    rayColor: "rgba(156, 163, 175, 0.12)",
    particleColors: ["#9ca3af", "#d1d5db", "#6b7280", "#4b5563"],
    prefix: "COMMON",
  },
};

// Retro Web Audio SFX (self-contained, 0 external deps)
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
      osc.frequency.setValueAtTime(420, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(780, ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } else if (type === "reveal") {
      // Fanfare chord: C5 (523Hz), E5 (659Hz), G5 (784Hz), C6 (1046Hz)
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.09);
        gain.gain.setValueAtTime(0.09, ctx.currentTime + i * 0.09);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          ctx.currentTime + i * 0.09 + 0.45,
        );
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.09);
        osc.stop(ctx.currentTime + i * 0.09 + 0.45);
      });
    } else if (type === "click") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      gain.gain.setValueAtTime(0.03, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.03);
    }
  } catch {
    // Audio autoplay restrictions or context blocked
  }
}

const ROLLING_MESSAGES = [
  "Connecting to RNG Pod...",
  "Scanning Cryptographic Entropy...",
  "Decrypting Chimp Matrix...",
  "Forging Serialized Edition...",
  "Unlocking Trait Capsule...",
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
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Reset or initialize when modal opens
  useEffect(() => {
    if (isOpen) {
      setPhase("ROLLING");
      setMinRollingDone(false);
      setCurrentRollIndex(0);
      setMessageIndex(0);

      // Force minimum rolling animation time for dramatic tension (~2200ms)
      const minTimer = setTimeout(() => {
        setMinRollingDone(true);
      }, 2200);

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
        if (soundEnabledRef.current && Math.random() > 0.5) {
          playTone("tick");
        }
        return next;
      });
    }, 90);

    return () => clearInterval(interval);
  }, [isOpen, phase, poolItems.length]);

  // Cycle suspense status messages
  useEffect(() => {
    if (!isOpen || phase !== "ROLLING") return;

    const msgInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % ROLLING_MESSAGES.length);
    }, 550);

    return () => clearInterval(msgInterval);
  }, [isOpen, phase]);

  if (!isOpen) return null;

  const currentPreview =
    poolItems.length > 0
      ? poolItems[currentRollIndex % poolItems.length]
      : {
          traitName: "Chimp Trait",
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
        `I just unlocked ${wonTrait.name} (${wonRarity}) in the @ChimpHood Drop! 🐒🔥 Edition #${claimedItem?.edition} • Verified on-chain.\n\nJoin the Hood:`,
      )
    : "";
  const shareUrl = typeof window !== "undefined" ? window.location.origin : "https://chimphood.com";
  const tweetHref = `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(
    shareUrl,
  )}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lootbox-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in"
    >
      {/* Dynamic Keyframe & Particle Styles */}
      <style>{`
        @keyframes sunburst {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes podPulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 15px rgba(16,185,129,0.3)); }
          50% { transform: scale(1.02); filter: drop-shadow(0 0 30px rgba(16,185,129,0.6)); }
        }
        @keyframes podShake {
          0% { transform: translate(0, 0) rotate(0deg); }
          20% { transform: translate(-2px, 2px) rotate(-1deg); }
          40% { transform: translate(2px, -2px) rotate(1deg); }
          60% { transform: translate(-2px, -1px) rotate(0.5deg); }
          80% { transform: translate(1px, 2px) rotate(-0.5deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }
        @keyframes floatParticle {
          0% { transform: translateY(0) scale(0.8); opacity: 0; }
          30% { opacity: 0.9; }
          100% { transform: translateY(-70px) scale(1.2); opacity: 0; }
        }
        @keyframes bounceIn {
          0% { opacity: 0; transform: scale(0.65) translateY(20px); }
          60% { opacity: 1; transform: scale(1.04) translateY(-4px); }
          80% { transform: scale(0.98) translateY(2px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-sunburst {
          animation: sunburst 25s linear infinite;
        }
        .animate-pod-pulse {
          animation: podPulse 1.8s ease-in-out infinite;
        }
        .animate-pod-shake {
          animation: podShake 0.15s ease-in-out infinite;
        }
        .animate-bounce-in {
          animation: bounceIn 0.55s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
      `}</style>

      {/* Sound Toggle (Top-Right) */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const next = !soundEnabled;
            setSoundEnabled(next);
            if (next) playTone("click");
          }}
          className="rounded-full bg-gray-900/80 p-2 text-gray-400 hover:text-white border border-gray-800 backdrop-blur transition-colors"
          title={soundEnabled ? "Mute SFX" : "Unmute SFX"}
          aria-label={soundEnabled ? "Mute SFX" : "Unmute SFX"}
        >
          {soundEnabled ? (
            <Volume2 className="h-4 w-4" />
          ) : (
            <VolumeX className="h-4 w-4 text-gray-500" />
          )}
        </button>
        {phase !== "ROLLING" && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-gray-900/80 p-2 text-gray-400 hover:text-white border border-gray-800 backdrop-blur transition-colors"
            title="Close modal"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Main Container */}
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-gray-800 bg-[#090b12] p-6 text-center shadow-2xl">
        {/* ===================== PHASE 1: ROLLING ===================== */}
        {phase === "ROLLING" && (
          <div className="flex flex-col items-center py-4">
            {/* Ambient Back Glow */}
            <div className="absolute inset-0 bg-radial from-emerald-500/10 via-transparent to-transparent pointer-events-none" />

            {/* Header Badge */}
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-400">
              <Sparkles className="h-3.5 w-3.5 animate-spin" />
              <span>
                {periodIndex ? `PERIOD #${periodIndex} DROP CAPSULE` : "LOOT CAPSULE"}
              </span>
            </div>

            <h3
              id="lootbox-title"
              className="mt-3 text-xl font-black tracking-wider uppercase text-white"
            >
              Unlocking Mystery Trait
            </h3>

            {/* Spinning Trait Roulette Pod */}
            <div className="relative mt-6 flex h-52 w-52 items-center justify-center rounded-2xl border-2 border-emerald-500/40 bg-[#0c0f1a] p-3 shadow-[0_0_40px_rgba(16,185,129,0.2)] animate-pod-pulse">
              {/* Rotating Corner Tech Brackets */}
              <div className="absolute top-1 left-1 h-3 w-3 border-t-2 border-l-2 border-emerald-400" />
              <div className="absolute top-1 right-1 h-3 w-3 border-t-2 border-r-2 border-emerald-400" />
              <div className="absolute bottom-1 left-1 h-3 w-3 border-b-2 border-l-2 border-emerald-400" />
              <div className="absolute bottom-1 right-1 h-3 w-3 border-b-2 border-r-2 border-emerald-400" />

              {/* Laser Scan Line */}
              <div className="absolute inset-x-2 top-0 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_#34d399] animate-[podShake_0.2s_ease-in-out_infinite]" />

              {/* Shaking Preview Item */}
              <div className="relative flex flex-col items-center justify-center animate-pod-shake">
                {currentPreview.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentPreview.imageUrl}
                    alt={currentPreview.traitName}
                    className="h-32 w-32 object-contain"
                    style={{ imageRendering: "pixelated" }}
                  />
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center rounded-xl bg-gray-900/80 text-emerald-400">
                    <Flame className="h-14 w-14 animate-pulse text-emerald-400" />
                  </div>
                )}
                <div className="mt-2 text-center">
                  <p className="truncate max-w-[170px] text-xs font-bold text-gray-200">
                    {currentPreview.traitName}
                  </p>
                  <span className="text-[10px] font-mono text-emerald-400 uppercase">
                    {currentPreview.rarity}
                  </span>
                </div>
              </div>
            </div>

            {/* Dynamic Status Ticker */}
            <div className="mt-6 flex flex-col items-center space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="font-mono text-xs font-semibold text-emerald-400">
                  {ROLLING_MESSAGES[messageIndex]}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 font-mono">
                Calculating transparent RNG on Base network
              </p>
            </div>
          </div>
        )}

        {/* ===================== PHASE 2: REVEAL ===================== */}
        {phase === "REVEAL" && wonTrait && (
          <div className="relative flex flex-col items-center py-2 animate-bounce-in">
            {/* Sunburst Rays Background */}
            <div
              className="absolute -top-32 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full pointer-events-none animate-sunburst opacity-40 blur-md"
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
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs font-black uppercase tracking-wider ${wonTheme.badgeBg} ${wonTheme.badgeBorder} ${wonTheme.badgeText} shadow-md`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{wonTheme.prefix} UNLOCKED</span>
            </div>

            {/* Trait Card */}
            <div
              className={`relative mt-5 flex h-56 w-56 items-center justify-center rounded-2xl border-2 ${wonTheme.border} ${wonTheme.bg} p-3 ${wonTheme.glow} transition-all duration-300`}
            >
              {wonTrait.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={wonTrait.imageUrl}
                  alt={wonTrait.name}
                  className="h-44 w-44 object-contain transition-transform duration-300 hover:scale-105"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                <div className="flex h-44 w-44 items-center justify-center rounded-xl bg-gray-900/80 text-white">
                  <Flame className="h-16 w-16" />
                </div>
              )}

              {/* Edition Serial Pill */}
              <div className="absolute bottom-2.5 right-2.5 rounded-md border border-gray-700 bg-gray-900/90 px-2 py-0.5 text-[10px] font-mono font-bold text-white shadow-sm">
                Edition #{claimedItem.edition}
              </div>
            </div>

            {/* Trait Title & Category */}
            <div className="mt-4 text-center">
              <h2 className={`text-2xl font-black tracking-tight ${wonTheme.titleColor}`}>
                {wonTrait.name}
              </h2>
              <div className="mt-1 flex items-center justify-center gap-2">
                <span className="rounded bg-gray-800/80 px-2 py-0.5 text-[10px] font-mono uppercase text-gray-300 border border-gray-700">
                  {wonTrait.category}
                </span>
                <span className="text-gray-600">•</span>
                <span className="text-[11px] font-mono text-emerald-400">
                  Added to Your Inventory
                </span>
              </div>
              {wonTrait.description && (
                <p className="mt-2 text-xs text-gray-400 line-clamp-2 max-w-sm px-2">
                  {wonTrait.description}
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex w-full flex-col gap-2.5">
              <Link
                href="/profile"
                onClick={onClose}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/60 bg-emerald-600 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-950/50 hover:bg-emerald-500 transition-colors"
              >
                <span>Equip in Profile</span>
                <ExternalLink className="h-4 w-4" />
              </Link>

              <div className="flex items-center gap-2">
                <a
                  href={tweetHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-700 bg-gray-900/90 py-2.5 text-xs font-semibold text-gray-200 hover:border-gray-500 hover:bg-gray-800 transition-colors"
                >
                  <Share2 className="h-3.5 w-3.5 text-sky-400" />
                  <span>Share on X</span>
                </a>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-gray-800 bg-gray-900/50 py-2.5 text-xs font-semibold text-gray-400 hover:text-white hover:bg-gray-800/80 transition-colors"
                >
                  Collect & Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===================== PHASE 3: ERROR ===================== */}
        {phase === "ERROR" && (
          <div className="flex flex-col items-center py-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-rose-500/40 bg-rose-950/40 text-rose-400">
              <AlertTriangle className="h-8 w-8" />
            </div>

            <h3 className="mt-4 text-lg font-bold text-white">Claim Failed</h3>
            <p className="mt-2 text-xs text-gray-400 max-w-xs text-center leading-relaxed">
              {error || "An error occurred while claiming your drop. Please try again."}
            </p>

            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-xl border border-gray-700 bg-gray-800 py-2.5 text-xs font-semibold text-white hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
