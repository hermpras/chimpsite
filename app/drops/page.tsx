"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Sparkles,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Gift,
  ShieldCheck,
  Lock,
  ArrowRight,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useCurrentTime } from "@/lib/hooks/useCurrentTime";
import { useSiweAuth } from "@/hooks/useSiweAuth";
import {
  fetchCurrentDrop,
  claimDropItem,
  type CurrentDropResponse,
} from "@/lib/drops/client";
import {
  ClaimLootboxModal,
  type WonTraitData,
} from "@/components/drops/ClaimLootboxModal";
import { XLogo } from "@/components/icons/XLogo";
import { ElychimpSpinner } from "@/components/ui/ElychimpSpinner";

const RARITY_THEME: Record<
  string,
  {
    border: string;
    bg: string;
    text: string;
    badgeBg: string;
    badgeBorder: string;
    badgeText: string;
    glow: string;
    prefix: string;
    barColor: string;
    sheen: string;
    ambientGlow: string;
    pedestalBorder: string;
    pedestalBg: string;
    halo: string;
  }
> = {
  LEGENDARY: {
    border: "border-amber-400/50 hover:border-amber-300",
    bg: "bg-gradient-to-b from-amber-950/40 via-[#071F24] to-[#04181C]",
    text: "text-amber-300 font-extrabold",
    badgeBg: "bg-gradient-to-r from-amber-500/30 to-yellow-500/20",
    badgeBorder: "border-amber-400/70",
    badgeText: "text-amber-200 font-bold",
    glow: "shadow-[0_8px_30px_rgba(251,191,36,0.15)] hover:shadow-[0_12px_42px_rgba(251,191,36,0.3)]",
    prefix: "★ ",
    barColor: "bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-300",
    sheen: "from-transparent via-amber-400/80 to-transparent",
    ambientGlow: "bg-amber-500/20",
    pedestalBorder: "border-amber-500/30 group-hover:border-amber-400/60",
    pedestalBg: "bg-gradient-to-b from-amber-950/25 via-[#051D22] to-[#04181C]",
    halo: "bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-500/25 via-transparent to-transparent",
  },
  EPIC: {
    border: "border-purple-500/50 hover:border-purple-400",
    bg: "bg-gradient-to-b from-purple-950/40 via-[#071F24] to-[#04181C]",
    text: "text-purple-300 font-bold",
    badgeBg: "bg-gradient-to-r from-purple-500/30 to-fuchsia-500/20",
    badgeBorder: "border-purple-400/70",
    badgeText: "text-purple-200 font-semibold",
    glow: "shadow-[0_8px_30px_rgba(168,85,247,0.15)] hover:shadow-[0_12px_42px_rgba(168,85,247,0.3)]",
    prefix: "◆ ",
    barColor: "bg-gradient-to-r from-purple-500 via-fuchsia-400 to-pink-400",
    sheen: "from-transparent via-purple-400/80 to-transparent",
    ambientGlow: "bg-purple-500/20",
    pedestalBorder: "border-purple-500/30 group-hover:border-purple-400/60",
    pedestalBg: "bg-gradient-to-b from-purple-950/25 via-[#051D22] to-[#04181C]",
    halo: "bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-500/25 via-transparent to-transparent",
  },
  RARE: {
    border: "border-sky-500/50 hover:border-sky-400",
    bg: "bg-gradient-to-b from-sky-950/35 via-[#071F24] to-[#04181C]",
    text: "text-sky-300 font-semibold",
    badgeBg: "bg-gradient-to-r from-sky-500/30 to-cyan-500/20",
    badgeBorder: "border-sky-400/70",
    badgeText: "text-sky-200 font-semibold",
    glow: "shadow-[0_8px_30px_rgba(56,189,248,0.12)] hover:shadow-[0_12px_42px_rgba(56,189,248,0.25)]",
    prefix: "▲ ",
    barColor: "bg-gradient-to-r from-sky-500 via-cyan-400 to-teal-300",
    sheen: "from-transparent via-sky-400/80 to-transparent",
    ambientGlow: "bg-sky-500/18",
    pedestalBorder: "border-sky-500/30 group-hover:border-sky-400/60",
    pedestalBg: "bg-gradient-to-b from-sky-950/25 via-[#051D22] to-[#04181C]",
    halo: "bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-sky-500/22 via-transparent to-transparent",
  },
  UNCOMMON: {
    border: "border-emerald-500/40 hover:border-emerald-400",
    bg: "bg-gradient-to-b from-emerald-950/30 via-[#071F24] to-[#04181C]",
    text: "text-emerald-300 font-medium",
    badgeBg: "bg-gradient-to-r from-emerald-500/25 to-teal-500/15",
    badgeBorder: "border-emerald-400/60",
    badgeText: "text-emerald-400 font-medium",
    glow: "shadow-[0_8px_24px_rgba(52,211,153,0.1)] hover:shadow-[0_12px_36px_rgba(52,211,153,0.22)]",
    prefix: "● ",
    barColor: "bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400",
    sheen: "from-transparent via-emerald-400/70 to-transparent",
    ambientGlow: "bg-emerald-500/15",
    pedestalBorder: "border-emerald-500/30 group-hover:border-emerald-400/50",
    pedestalBg: "bg-gradient-to-b from-emerald-950/20 via-[#051D22] to-[#04181C]",
    halo: "bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-500/20 via-transparent to-transparent",
  },
  COMMON: {
    border: "border-[#163B44] hover:border-[#163B44]",
    bg: "bg-gradient-to-b from-zinc-900/40 via-[#071F24] to-[#04181C]",
    text: "text-zinc-300 font-medium",
    badgeBg: "bg-zinc-800/80",
    badgeBorder: "border-[#163B44]",
    badgeText: "text-zinc-400",
    glow: "shadow-[0_4px_20px_rgba(0,0,0,0.5)] hover:shadow-[0_8px_28px_rgba(148,163,184,0.12)]",
    prefix: "",
    barColor: "bg-gradient-to-r from-zinc-500 via-zinc-400 to-zinc-300",
    sheen: "from-transparent via-zinc-600/40 to-transparent",
    ambientGlow: "bg-zinc-500/10",
    pedestalBorder: "border-[#163B44] group-hover:border-[#163B44]",
    pedestalBg: "bg-[#051D22]",
    halo: "bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-600/15 via-transparent to-transparent",
  },
};

const CATEGORY_BADGE_STYLES: Record<string, string> = {
  BG: "border-sky-500/40 bg-sky-500/15 text-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.2)]",
  FUR: "border-amber-500/40 bg-amber-500/15 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.2)]",
  CLOTHING: "border-violet-500/40 bg-violet-500/15 text-violet-400 shadow-[0_0_10px_rgba(139,92,246,0.2)]",
  HEADWEAR: "border-emerald-500/40 bg-emerald-500/15 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]",
  EYEWEAR: "border-teal-500/40 bg-teal-500/15 text-teal-400 shadow-[0_0_10px_rgba(20,184,166,0.2)]",
};

export default function DropsPage() {
  const { status, login, busyMessage, walletAddress, sessionAddress } = useSiweAuth();
  const address = sessionAddress || walletAddress;

  // Drop status state
  const [dropData, setDropData] = useState<CurrentDropResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [claimLoading, setClaimLoading] = useState<boolean>(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [isLootboxOpen, setIsLootboxOpen] = useState<boolean>(false);
  const [claimedLootboxItem, setClaimedLootboxItem] = useState<WonTraitData | null>(null);
  const [lootboxError, setLootboxError] = useState<string | null>(null);
  const [claimedPeriodId, setClaimedPeriodId] = useState<string | null>(null);

  // X Connection State
  const [isConnectingX, setIsConnectingX] = useState<boolean>(false);
  const [connectXError, setConnectXError] = useState<string | null>(null);

  const handleConnectX = async () => {
    setIsConnectingX(true);
    setConnectXError(null);
    try {
      const res = await fetch("/api/social/x/connect");
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setConnectXError(data.message || "Failed to initiate X connection.");
        setIsConnectingX(false);
      }
    } catch (err: unknown) {
      setConnectXError((err as Error).message || "Network error connecting X.");
      setIsConnectingX(false);
    }
  };

  // Eligibility & Registration derivations
  const userEligibility = dropData?.userEligibility;
  const isCheckingEligibility = status === "authenticated" && (isLoading || !userEligibility);
  const hasLinkedX = Boolean(userEligibility?.hasLinkedX);
  const areTasksDone = Boolean(userEligibility?.areMandatoryTasksCompleted);
  const totalTasks = userEligibility?.totalMandatoryTasksCount ?? 0;
  const completedTasks = userEligibility?.completedMandatoryTasksCount ?? 0;
  const isUserEligible = Boolean(userEligibility?.isEligible);
  const hasAllocatedSlot = Boolean(userEligibility?.hasAllocatedSlot);

  // Fetch current drop data
  const loadDropData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const data = await fetchCurrentDrop();
      setDropData(data);
      setFetchError(null);
      return data;
    } catch (err: unknown) {
      console.error("Failed to load drop:", err);
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to load drop data. Please try again.";
      setFetchError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch or re-fetch drop data on initial mount and whenever auth status changes
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setFetchError(null);
    if (status === "authenticated") {
      setDropData((prev) => (prev ? { ...prev, userEligibility: undefined } : null));
    }
    fetchCurrentDrop()
      .then((data) => {
        if (isMounted) {
          setDropData(data);
          setFetchError(null);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        console.error("Failed to load drop:", err);
        if (isMounted) {
          const msg =
            err instanceof Error
              ? err.message
              : "Failed to load drop data. Please try again.";
          setFetchError(msg);
          setIsLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [status]);

  // Live 1-second ticker for real-time countdowns
  const currentTime = useCurrentTime();

  // Helper to format remaining milliseconds as HH:MM:SS
  const formatRemaining = (ms: number): string => {
    if (ms <= 0) return "00:00:00";
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  // Helper to format timestamp with UTC (pure UTC standard, no local timezone leak)
  const formatTimeWithUtc = (dateInput?: string | Date | number | null): string => {
    if (!dateInput) return "";
    try {
      const d = new Date(dateInput);
      if (isNaN(d.getTime())) return "";

      const utcHours = String(d.getUTCHours()).padStart(2, "0");
      const utcMinutes = String(d.getUTCMinutes()).padStart(2, "0");
      return `${utcHours}:${utcMinutes} UTC`;
    } catch {
      return "";
    }
  };

  // Calculate live countdowns & window status
  const claimWindowEndsMs = dropData?.claimWindow?.endsAt
    ? new Date(dropData.claimWindow.endsAt).getTime()
    : 0;
  const periodEndsMs = dropData?.period?.endsAt
    ? new Date(dropData.period.endsAt).getTime()
    : dropData?.nextCycle?.startsAt
      ? new Date(dropData.nextCycle.startsAt).getTime()
      : 0;

  // Server isActive flag is the single source of truth for claim window status
  const isWindowActive = Boolean(dropData?.claimWindow?.isActive);
  const claimRemainingMs = Math.max(0, claimWindowEndsMs - currentTime);
  const nextDropRemainingMs = Math.max(0, periodEndsMs - currentTime);

  // Active vs Upcoming period index & stock
  const currentPeriodIndex = dropData?.period?.periodIndex ?? 1;
  const displayPeriodIndex = isWindowActive ? currentPeriodIndex : currentPeriodIndex + 1;

  const totalAllocated = dropData?.stock?.totalAllocated ?? 250;
  const totalRemaining = dropData?.stock?.totalRemaining ?? 0;

  // When window is active, show actual remaining stock from current period.
  // When window has ended / cooldown, reset remaining stock to full allocated pool for upcoming cycle.
  const displayRemainingStock = isWindowActive ? totalRemaining : totalAllocated;
  const displayAllocatedStock = totalAllocated;
  const displayStockPercentage = Math.min(
    100,
    Math.round((displayRemainingStock / Math.max(1, displayAllocatedStock)) * 100)
  );

  // Period stock status
  const isStockExhausted = Boolean(
    isWindowActive &&
      (dropData?.stock?.isExhausted ||
        (dropData?.stock && dropData.stock.totalRemaining <= 0))
  );

  // Reset claim feedback & state whenever drop period rolls over
  useEffect(() => {
    if (dropData?.period?.id && claimedPeriodId && claimedPeriodId !== dropData.period.id) {
      setClaimMessage(null);
      setClaimError(null);
      setLootboxError(null);
      setClaimedLootboxItem(null);
      setClaimedPeriodId(null);
    }
  }, [dropData?.period?.id, claimedPeriodId]);

  const isAlreadyClaimed =
    isWindowActive &&
    (Boolean(dropData?.userHasClaimed) ||
      Boolean(claimedPeriodId && claimedPeriodId === dropData?.period?.id) ||
      Boolean(claimMessage && claimedPeriodId === dropData?.period?.id));

  // Auto-refresh when a timer reaches 0 (triggers rollover when next drop starts)
  useEffect(() => {
    if (!dropData?.active) return;

    if (isWindowActive && claimRemainingMs === 0 && claimWindowEndsMs > 0) {
      const timer = setTimeout(() => {
        void loadDropData();
      }, 1000);
      return () => clearTimeout(timer);
    } else if (!isWindowActive && nextDropRemainingMs === 0 && periodEndsMs > 0) {
      const timer = setTimeout(() => {
        void loadDropData();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [claimRemainingMs, nextDropRemainingMs, isWindowActive, dropData?.active, claimWindowEndsMs, periodEndsMs, loadDropData]);

  async function handleClaim() {
    if (!dropData?.drop || !dropData?.period) return;
    setClaimLoading(true);
    setClaimMessage(null);
    setClaimError(null);
    setLootboxError(null);
    setClaimedLootboxItem(null);
    setIsLootboxOpen(true);

    try {
      const res = await claimDropItem(dropData.drop.id, dropData.period.id);
      setClaimedPeriodId(dropData.period.id);
      setClaimedLootboxItem(res.inventoryItem);
      setClaimMessage(
        `Successfully claimed ${res.inventoryItem.trait.name} (Edition #${res.inventoryItem.edition})!`
      );
      // Refresh drop info
      await loadDropData();
    } catch (err: unknown) {
      const msg = (err as Error).message || "Failed to claim drop.";
      setClaimError(msg);
      setLootboxError(msg);
    } finally {
      setClaimLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12 sm:px-6 lg:px-8">
      {/* Background Ambient Glow */}
      <div className="pointer-events-none absolute top-20 right-10 h-96 w-96 rounded-full bg-amber-500/10 blur-[130px]" />
      <div className="pointer-events-none absolute top-96 left-10 h-80 w-80 rounded-full bg-cyan-500/10 blur-[140px]" />

      {/* Hero Banner - Brutalist Streetwear Style */}
      <div className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between border-b-2 border-gray-800 pb-8">
        <div className="space-y-3">
          <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl uppercase tracking-tight text-white leading-[0.9]">
            Trait Drops &amp; Lootbox Engine
          </h1>

          <p className="max-w-2xl text-sm sm:text-base leading-relaxed text-gray-300">
            Claim periodic lootbox mystery pods to collect traits across all 5 categories.
          </p>

          <div className="flex flex-wrap items-center gap-2.5 pt-1 text-sm sm:text-base font-medium text-zinc-300">
            <span>
              {dropData?.drop?.cycleDurationHours === 5
                ? "5-Hour Hype Control Cycle"
                : "2-Hour Drop Cycles"}
            </span>
            <span className="text-zinc-600 select-none">•</span>
            <span>30-Minute Claim Window</span>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {/* Drops Cycle Status Card */}
        <div className="relative overflow-hidden rounded-3xl border border-[#163B44] bg-gradient-to-b from-[#0B2026]/90 via-[#051D22]/95 to-[#04181C]/98 p-6 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl transition-all">
          {/* Top Luxury Gold Accent Sheen */}
          <div className="pointer-events-none absolute inset-x-12 top-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#163B44] pb-5">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="font-display text-2xl sm:text-3xl uppercase tracking-wider text-white">
                  Periodic Drop Cycle
                </h2>
              </div>
              <p className="text-sm sm:text-base text-[#8AA8B2] mt-1">
                1 claim per EVM wallet per period cycle.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={loadDropData}
                disabled={isLoading}
                className="flex items-center justify-center rounded-xl border border-[#163B44] bg-[#102B33]/50 p-2.5 text-gray-300 hover:border-amber-400/60 hover:text-amber-300 hover:bg-amber-400/10 hover:shadow-[0_0_15px_rgba(251,191,36,0.2)] transition-all duration-300 disabled:opacity-50"
                title="Refresh Drop Status"
                aria-label="Refresh Drop Status"
              >
                {isLoading ? (
                  <ElychimpSpinner size="sm" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-6 mt-6">
            {fetchError && dropData && (
              <div
                role="alert"
                className="flex flex-col gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 sm:flex-row sm:items-center sm:justify-between text-xs text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.15)]"
              >
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{fetchError}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadDropData()}
                  disabled={isLoading}
                  className="border-rose-500/40 text-xs text-rose-300 hover:bg-rose-500/20 shrink-0 rounded-lg"
                >
                  {isLoading ? (
                    <ElychimpSpinner size="xs" className="mr-1.5" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3 w-3" />
                  )}
                  Try Again
                </Button>
              </div>
            )}

            {isLoading && !dropData ? (
              <div className="py-20 text-center text-sm text-gray-400 flex flex-col items-center justify-center">
                <ElychimpSpinner size="lg" className="mb-4 filter drop-shadow-[0_0_25px_rgba(251,191,36,0.5)]" />
                <span className="text-xs uppercase tracking-widest text-amber-400 animate-pulse">
                  Loading drop event and stock data...
                </span>
              </div>
            ) : fetchError && !dropData ? (
              <div
                role="alert"
                className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-8 sm:p-10 text-center shadow-[0_0_30px_rgba(244,63,94,0.15)]"
              >
                <AlertCircle className="mx-auto mb-3 h-9 w-9 text-rose-400" />
                <h3 className="text-base font-bold text-white">Failed to Load Drop Event</h3>
                <p className="mt-1 text-sm text-rose-300">
                  {fetchError}
                </p>
                <div className="mt-5">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void loadDropData()}
                    disabled={isLoading}
                    className="gap-2 font-medium rounded-xl border border-rose-400/40 bg-rose-500 hover:bg-rose-600 text-white shadow-lg"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                    Try Again
                  </Button>
                </div>
              </div>
            ) : dropData?.active && dropData.period ? (
              <div className="space-y-6">
                {/* 3 Metric Cards */}
                <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
                  {/* Period Cycle Card */}
                  <div className="relative overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-b from-amber-950/20 via-[#071F24] to-[#04181C] p-5 sm:p-6 shadow-[0_8px_24px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(251,191,36,0.15)] flex flex-col justify-center items-center text-center group hover:border-amber-400/50 hover:shadow-[0_12px_32px_rgba(251,191,36,0.15)] transition-all duration-300">
                    <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />
                    <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 h-24 w-40 rounded-full bg-amber-500/15 blur-xl" />
                    <span className="text-xs font-bold text-amber-300/90 uppercase tracking-widest flex items-center justify-center">
                      Period Cycle
                    </span>
                    <p className="my-2 font-display text-4xl sm:text-5xl font-black bg-gradient-to-br from-amber-100 via-yellow-300 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_2px_12px_rgba(251,191,36,0.3)]">
                      #{displayPeriodIndex}
                    </p>
                  </div>

                  {/* Remaining Stock Card */}
                  <div className="relative overflow-hidden rounded-2xl border border-cyan-500/25 bg-gradient-to-b from-cyan-950/20 via-[#071F24] to-[#04181C] p-5 sm:p-6 shadow-[0_8px_24px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(6,182,212,0.15)] flex flex-col justify-center items-center text-center group hover:border-cyan-400/50 hover:shadow-[0_12px_32px_rgba(6,182,212,0.15)] transition-all duration-300">
                    <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />
                    <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 h-24 w-40 rounded-full bg-cyan-500/15 blur-xl" />
                    <span className="text-xs font-bold text-cyan-300/90 uppercase tracking-widest flex items-center justify-center">
                      Remaining Stock
                    </span>
                    <p className="my-2 font-mono text-2xl sm:text-3xl font-bold text-white">
                      <span className="bg-gradient-to-r from-cyan-100 via-cyan-300 to-sky-400 bg-clip-text text-transparent drop-shadow-[0_2px_12px_rgba(6,182,212,0.3)]">
                        {displayRemainingStock}
                      </span>{" "}
                      <span className="text-xs font-semibold text-gray-400">
                        / {displayAllocatedStock} Units
                      </span>
                    </p>
                    <div className="mt-2 h-2.5 w-full max-w-[220px] rounded-full bg-black/80 overflow-hidden border border-cyan-500/30 p-[1px] shadow-inner">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-teal-300 to-amber-300 shadow-[0_0_10px_rgba(6,182,212,0.6)] transition-all duration-500"
                        style={{
                          width: `${displayStockPercentage}%`,
                        }}
                      />
                    </div>
                    <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
                      {displayStockPercentage}% Available
                    </span>
                  </div>

                  {/* Claim Window / Countdown Card */}
                  <div
                    className={`relative overflow-hidden rounded-2xl border ${
                      isWindowActive
                        ? "border-amber-500/40 bg-gradient-to-b from-amber-950/25 via-[#071F24] to-[#04181C] shadow-[0_8px_24px_rgba(245,158,11,0.15),inset_0_1px_0_rgba(251,191,36,0.2)] hover:border-amber-400/60"
                        : "border-[#163B44] bg-gradient-to-b from-white/[0.03] via-[#071F24] to-[#04181C] shadow-[0_8px_24px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-white/20"
                    } p-5 sm:p-6 flex flex-col justify-between text-center group transition-all duration-300`}
                  >
                    <div
                      className={`absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent ${
                        isWindowActive ? "via-amber-400/70" : "via-cyan-400/50"
                      } to-transparent`}
                    />
                    <div>
                      <div className="flex items-center justify-center gap-2">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            isWindowActive
                              ? "bg-amber-400 shadow-[0_0_8px_#fbbf24] animate-ping"
                              : "bg-cyan-400 shadow-[0_0_8px_#22d3ee]"
                          }`}
                        />
                        <span
                          className={`text-xs font-bold uppercase tracking-widest ${
                            isWindowActive ? "text-amber-300" : "text-gray-300"
                          }`}
                        >
                          {isWindowActive ? "Claim Window Active" : "Next Drop Window"}
                        </span>
                      </div>
                      <p
                        className={`my-2 font-mono text-2xl sm:text-3xl font-bold ${
                          isWindowActive
                            ? "bg-gradient-to-r from-amber-100 via-yellow-300 to-amber-400 bg-clip-text text-transparent drop-shadow-[0_2px_12px_rgba(251,191,36,0.3)]"
                            : "text-amber-300"
                        }`}
                      >
                        {isWindowActive
                          ? `${formatRemaining(claimRemainingMs)} left`
                          : `Opens in ${formatRemaining(nextDropRemainingMs)}`}
                      </p>
                      {isWindowActive && dropData.claimWindow?.endsAt && (
                        <span className="block text-[10px] text-gray-400 uppercase tracking-wider">
                          Closes at {formatTimeWithUtc(dropData.claimWindow.endsAt)}
                        </span>
                      )}
                      {!isWindowActive && periodEndsMs > 0 && (
                        <span className="block text-[10px] text-gray-400 uppercase tracking-wider">
                          Cycle starts at {formatTimeWithUtc(periodEndsMs)}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#163B44]">
                      {claimLoading ? (
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full rounded-xl border border-yellow-300/60 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 font-black text-sm uppercase tracking-wider text-black shadow-[0_0_20px_rgba(245,158,11,0.35)] py-2.5"
                            disabled
                          >
                            <span className="flex items-center justify-center gap-2">
                              <ElychimpSpinner size="xs" />
                              Claiming...
                            </span>
                          </Button>
                        ) : status === "signing" ? (
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full rounded-xl border border-yellow-300/60 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 font-black text-sm uppercase tracking-wider text-black shadow-[0_0_20px_rgba(245,158,11,0.35)] py-2.5"
                            disabled
                          >
                            <span className="flex items-center justify-center gap-2">
                              <ElychimpSpinner size="xs" />
                              {busyMessage || "Authenticating..."}
                            </span>
                          </Button>
                        ) : status === "wallet-only" ? (
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full rounded-xl border border-yellow-300/60 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 font-black text-sm uppercase tracking-wider text-black shadow-[0_0_20px_rgba(245,158,11,0.35)] hover:from-amber-300 hover:to-yellow-300 transition-all py-2.5"
                            onClick={() => void login()}
                          >
                            Sign In with Ethereum
                          </Button>
                        ) : status !== "authenticated" ? (
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full rounded-xl border border-yellow-300/60 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 font-black text-sm uppercase tracking-wider text-black shadow-[0_0_20px_rgba(245,158,11,0.35)] hover:from-amber-300 hover:to-yellow-300 transition-all py-2.5"
                            onClick={() => void login()}
                          >
                            Connect Wallet to Register
                          </Button>
                        ) : isCheckingEligibility ? (
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full rounded-xl border border-yellow-300/60 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 font-black text-sm uppercase tracking-wider text-black shadow-[0_0_20px_rgba(245,158,11,0.35)] cursor-wait py-2.5"
                            disabled
                          >
                            <span className="flex items-center justify-center gap-2">
                              <ElychimpSpinner size="xs" />
                              Verifying Registration...
                            </span>
                          </Button>
                        ) : hasAllocatedSlot ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full rounded-xl border border-amber-500/50 bg-gradient-to-r from-amber-500/20 via-amber-600/15 to-transparent text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center justify-center gap-2 cursor-not-allowed opacity-90 py-2.5 shadow-sm"
                            disabled
                          >
                            <ShieldCheck className="h-4 w-4 text-amber-400 shrink-0" />
                            <span>Whitelist Slot Secured</span>
                          </Button>
                        ) : !hasLinkedX ? (
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full rounded-xl border border-cyan-400/50 bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 font-bold text-sm uppercase tracking-wider text-black shadow-[0_0_20px_rgba(6,182,212,0.35)] hover:from-cyan-300 hover:to-blue-400 flex items-center justify-center gap-2 transition-all py-2.5"
                            onClick={handleConnectX}
                            disabled={isConnectingX}
                          >
                            <XLogo className="h-4 w-4 shrink-0" />
                            <span>{isConnectingX ? "Connecting X..." : "Link X (Twitter) to Register"}</span>
                          </Button>
                        ) : !areTasksDone ? (
                          <Link
                            href="/whitelist#tasks"
                            aria-label={`Complete Quests on Whitelist (${completedTasks}/${totalTasks})`}
                            className="w-full rounded-xl border border-yellow-300/70 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 font-black text-xs sm:text-sm uppercase tracking-wider text-black shadow-[0_0_24px_rgba(245,158,11,0.35)] hover:from-amber-300 hover:via-yellow-200 hover:to-amber-400 hover:shadow-[0_0_32px_rgba(245,158,11,0.55)] hover:scale-[1.01] active:scale-[0.99] py-2.5 px-3 flex items-center justify-center gap-2 transition-all"
                          >
                            <span>Complete Quests</span>
                            <span className="rounded-md bg-black/15 px-1.5 py-0.5 text-[11px] font-black tracking-normal">
                              {completedTasks}/{totalTasks}
                            </span>
                          </Link>
                        ) : isAlreadyClaimed ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full rounded-xl border border-emerald-500/40 bg-emerald-950/40 text-xs font-semibold text-emerald-300 uppercase tracking-wider flex items-center justify-center gap-2 cursor-not-allowed opacity-95 py-2.5 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                            disabled
                          >
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                            Claimed for Period #{dropData.period.periodIndex} (1/1)
                          </Button>
                        ) : isStockExhausted ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full rounded-xl border border-red-500/30 bg-red-500/10 text-[11px] font-medium text-red-300 uppercase tracking-wider cursor-not-allowed opacity-75 py-2.5"
                            disabled
                          >
                            Period Stock Exhausted
                          </Button>
                        ) : isWindowActive ? (
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full rounded-xl border border-yellow-300/70 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 font-black text-sm uppercase tracking-wider text-black shadow-[0_0_24px_rgba(245,158,11,0.4)] hover:from-amber-300 hover:via-yellow-200 hover:to-amber-400 hover:shadow-[0_0_32px_rgba(245,158,11,0.6)] hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer py-2.5"
                            onClick={handleClaim}
                          >
                            Claim Trait Now
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full rounded-xl border border-[#163B44] bg-[#102B33]/50 text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center justify-center gap-2 cursor-not-allowed py-2.5"
                            disabled
                          >
                            <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                            <span>Opens in {formatRemaining(nextDropRemainingMs)}</span>
                          </Button>
                        )}

                        {hasAllocatedSlot && (
                          <div className="mt-2.5 rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-center space-y-2 shadow-sm">
                            <p className="text-[11px] text-amber-300 font-bold uppercase flex items-center justify-center gap-1.5">
                              <ShieldCheck className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                              <span>Whitelist Allocation Secured</span>
                            </p>
                            <p className="text-[10px] text-gray-300 leading-normal">
                              Trait drops are reserved for participants still qualifying. You can gift duplicate traits to friends from your Backpack.
                            </p>
                            <div className="pt-0.5">
                              <Link
                                href="/profile"
                                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300 hover:bg-cyan-500/25 transition-colors"
                              >
                                <Gift className="h-3.5 w-3.5 text-cyan-400" />
                                <span>Go to Backpack to Gift</span>
                                <ArrowRight className="h-3 w-3 text-cyan-400" />
                              </Link>
                            </div>
                          </div>
                        )}

                        {connectXError && (
                          <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-rose-400">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                            <span>{connectXError}</span>
                          </p>
                        )}
                        {claimMessage && (
                          <div className="mt-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-center shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                            <p className="text-xs font-semibold text-emerald-300">
                              {claimMessage}
                            </p>
                          </div>
                        )}
                        {claimError && !isAlreadyClaimed && !hasAllocatedSlot && (
                          <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-rose-400">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                            <span>{claimError}</span>
                          </p>
                        )}
                        {isAlreadyClaimed && !claimMessage && (
                          <div className="mt-2.5 rounded-xl border border-[#163B44] bg-black/60 px-3 py-1.5 text-center">
                            <span className="text-[10px] text-gray-400 uppercase">
                              You have claimed your 1 trait allocation for Period #{dropData.period.periodIndex}. Next drop cycle begins in {formatRemaining(nextDropRemainingMs)}.
                            </span>
                          </div>
                        )}
                        {!isWindowActive && isUserEligible && !hasAllocatedSlot && (
                          <div className="mt-2.5 rounded-xl border border-[#163B44] bg-black/60 px-3 py-1.5 text-center">
                            <span className="text-[10px] text-gray-400 uppercase">
                              Registered &amp; Ready for Period #{displayPeriodIndex}
                            </span>
                          </div>
                        )}
                      </div>
                  </div>
                </div>

                {/* Trait Inventory Pool */}
                <div className="space-y-4 pt-4 border-t border-[#163B44]">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-base sm:text-lg font-bold tracking-wider text-white uppercase">
                        Drop Pool Inventory ({dropData.stock?.poolItems?.length ?? 0} Available Traits)
                      </h3>
                      <p className="text-xs sm:text-sm text-[#8AA8B2] mt-1">
                        Real-time trait stock and distribution directly from drop service
                      </p>
                    </div>
                  </div>

                  {dropData.stock?.poolItems && dropData.stock.poolItems.length > 0 ? (
                    /* Trait Card Grid */
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      {dropData.stock.poolItems.map((item) => {
                        const rarity = item.rarity?.toUpperCase() || "COMMON";
                        const theme = RARITY_THEME[rarity] || RARITY_THEME.COMMON;
                        const categoryStyle =
                          CATEGORY_BADGE_STYLES[item.category?.toUpperCase()] ||
                          "border-gray-800 bg-gray-900/80 text-gray-400";
                        const isSoldOut = isWindowActive && item.remainingStock <= 0;

                        return (
                          <div
                            key={item.poolItemId}
                            className={`group relative flex flex-col justify-between rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-1.5 overflow-hidden backdrop-blur-md ${theme.border} ${theme.bg} ${theme.glow} ${isSoldOut ? "opacity-75" : ""}`}
                          >
                            {/* Top Luxury Foil Sheen */}
                            <div
                              className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${theme.sheen}`}
                            />

                            {/* Ambient Back Glow on Hover */}
                            <div
                              className={`pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full ${theme.ambientGlow} blur-2xl transition-opacity duration-300 opacity-60 group-hover:opacity-100`}
                            />

                            <div>
                              {/* Card Top: Badges & Drop Probability */}
                              <div className="relative z-10 flex items-center justify-between gap-1.5 pb-2.5 border-b border-[#163B44]">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={`rounded-md border px-2 py-0.5 text-[9px] font-mono uppercase font-bold tracking-wider ${categoryStyle}`}
                                  >
                                    {item.category}
                                  </span>
                                  <span
                                    className={`rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${theme.badgeBg} ${theme.badgeBorder} ${theme.badgeText} shadow-sm`}
                                  >
                                    {theme.prefix}
                                    {rarity}
                                  </span>
                                  {isSoldOut && (
                                    <span
                                      data-testid="badge-sold-out"
                                      className="rounded-md border border-rose-500/60 bg-rose-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.3)]"
                                    >
                                      Sold Out
                                    </span>
                                  )}
                                </div>

                                {/* Probability Drop Rate */}
                                <div className="shrink-0 flex items-center gap-1 rounded-md border border-[#163B44] bg-black/60 px-2 py-0.5 shadow-inner">
                                  <span className="text-[10px] text-amber-400 font-mono">✦</span>
                                  <span className={`font-mono text-xs font-extrabold ${theme.text}`}>
                                    {item.probabilityPercent}%
                                  </span>
                                </div>
                              </div>

                              {/* Showcase Pedestal: Centerpiece Trait Art */}
                              <div
                                className={`relative my-3 flex h-32 w-full items-center justify-center overflow-hidden rounded-xl border ${theme.pedestalBorder} ${theme.pedestalBg} p-2 transition-all duration-300 group-hover:scale-[1.02] shadow-inner`}
                              >
                                {/* Radial Light Halo */}
                                <div
                                  className={`pointer-events-none absolute inset-0 ${theme.halo}`}
                                />

                                {/* Luxury Metallic Corner Brackets */}
                                <div className="absolute top-1.5 left-1.5 h-2 w-2 border-t border-l border-white/20" />
                                <div className="absolute top-1.5 right-1.5 h-2 w-2 border-t border-r border-white/20" />
                                <div className="absolute bottom-1.5 left-1.5 h-2 w-2 border-b border-l border-white/20" />
                                <div className="absolute bottom-1.5 right-1.5 h-2 w-2 border-b border-r border-white/20" />

                                {item.imageUrl ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img
                                    src={item.imageUrl}
                                    alt={item.traitName}
                                    className="relative z-10 h-24 w-24 object-contain [image-rendering:pixelated] transition-transform duration-300 group-hover:scale-110 drop-shadow-[0_8px_16px_rgba(0,0,0,0.8)]"
                                  />
                                ) : (
                                  <Sparkles className="relative z-10 h-8 w-8 text-gray-500" />
                                )}
                              </div>

                              {/* Trait Title */}
                              <div className="relative z-10">
                                <p
                                  className="truncate text-sm font-bold tracking-wide text-white group-hover:text-amber-200 transition-colors"
                                  title={item.traitName}
                                >
                                  {item.traitName}
                                </p>
                              </div>
                            </div>

                            {/* Stock Meter & Counter */}
                            {(() => {
                              const allocated =
                                item.allocatedStock && item.allocatedStock > 0
                                  ? item.allocatedStock
                                  : Math.max(10, item.remainingStock);
                              const currentRemaining = isWindowActive ? item.remainingStock : allocated;
                              const stockPercent = Math.max(
                                0,
                                Math.min(
                                  100,
                                  Math.round((currentRemaining / allocated) * 100)
                                )
                              );
                              const isLowStock =
                                !isSoldOut &&
                                (stockPercent <= 20 || currentRemaining <= 2);

                              return (
                                <div className="relative z-10 mt-3 border-t border-[#163B44] pt-2.5">
                                  <div className="mb-1.5 flex items-center justify-between text-xs sm:text-[13px] font-mono">
                                    <span className="flex items-center gap-1.5">
                                      {isLowStock && (
                                        <span className="h-1.5 w-1.5 animate-ping rounded-full bg-rose-500" />
                                      )}
                                      <span
                                        className={
                                          isSoldOut
                                            ? "font-bold text-rose-400"
                                            : isLowStock
                                              ? "font-bold text-rose-400"
                                              : "text-gray-400 font-semibold"
                                        }
                                      >
                                        {isSoldOut ? "Sold Out" : isLowStock ? "Low Stock" : "Stock"}
                                      </span>
                                    </span>
                                    <span className="text-gray-400">
                                      <span
                                        className={`font-bold ${
                                          isSoldOut
                                            ? "text-rose-400"
                                            : isLowStock
                                              ? "text-rose-300"
                                              : "text-white"
                                        }`}
                                      >
                                        {currentRemaining}
                                      </span>
                                      <span className="text-gray-500 font-medium">
                                        /{allocated} left
                                      </span>
                                    </span>
                                  </div>
                                  <div className="h-2 w-full overflow-hidden rounded-full border border-[#163B44] bg-black/80 p-[1px]">
                                    <div
                                      className={`h-full rounded-full transition-all duration-500 ${
                                        isSoldOut
                                          ? "bg-rose-500/40"
                                          : isLowStock
                                            ? "bg-gradient-to-r from-rose-500 via-amber-500 to-yellow-400 shadow-[0_0_10px_rgba(244,63,94,0.5)]"
                                            : `${theme.barColor} shadow-[0_0_10px_rgba(255,255,255,0.25)]`
                                      }`}
                                      style={{ width: `${stockPercent}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div
                      data-testid="empty-drop-pool"
                      className="relative overflow-hidden rounded-2xl border border-dashed border-[#163B44] bg-gradient-to-b from-white/[0.03] via-transparent to-transparent p-10 text-center backdrop-blur-sm"
                    >
                      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.15)]">
                        <Sparkles className="mx-auto h-7 w-7 text-amber-400 animate-pulse" />
                      </div>
                      <p className="text-base font-bold text-white">
                        No traits currently available in this drop pool
                      </p>
                      <p className="mt-1.5 text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
                        This drop period does not have any items allocated in its pool yet or stock is being prepared for the upcoming cycle.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-[#163B44] bg-white/[0.02] p-8 text-center backdrop-blur-sm">
                <p className="text-sm text-gray-400 uppercase tracking-wider">
                  No active drop event currently in progress. Cycles renew on UTC schedule.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Duplicate Trait Gifting Card */}
        <div className="relative overflow-hidden rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-[#0B2026]/90 via-[#051D22]/95 to-[#04181C]/98 p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(6,182,212,0.15)] backdrop-blur-2xl">
          {/* Top Cyan Accent Sheen */}
          <div className="pointer-events-none absolute inset-x-12 top-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />

          <div className="flex items-center gap-4 border-b border-[#163B44] pb-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/50 bg-gradient-to-br from-cyan-500/20 to-blue-900/30 text-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.3)]">
              <Gift className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-display text-xl uppercase tracking-wider text-white">
                Gifts &amp; Duplicate Trait Exchange
              </h3>
              <p className="text-sm text-[#8AA8B2] mt-1">
                Help fellow community members complete their 5 required trait categories
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-3.5 rounded-2xl border border-[#163B44] bg-[#051D22] p-5 text-sm sm:text-base text-[#DBF2F9] shadow-inner">
            <p className="leading-relaxed">
              Hold duplicate traits? You can gift them to peers directly from your{" "}
              <Link href="/profile" className="font-bold text-[#34B7DD] hover:text-[#6FCDE8] underline underline-offset-4 decoration-[#34B7DD]/50 hover:decoration-[#6FCDE8] transition-colors">
                User Inventory
              </Link>
              . Senders must retain at least 1 trait in the category; limited to 1 gift per wallet per day.
            </p>
          </div>
        </div>
      </div>

      {/* Claim Mystery Pod / Lootbox Reveal Modal */}
      <ClaimLootboxModal
        isOpen={isLootboxOpen}
        onClose={() => setIsLootboxOpen(false)}
        poolItems={dropData?.stock?.poolItems?.map((item) => ({
          poolItemId: item.poolItemId,
          traitName: item.traitName,
          category: item.category,
          rarity: item.rarity,
          imageUrl: item.imageUrl,
        }))}
        claimedItem={claimedLootboxItem}
        isLoading={claimLoading}
        error={lootboxError}
        periodIndex={dropData?.period?.periodIndex}
      />
    </div>
  );
}
