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
  Layers,
  Flame,
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
  }
> = {
  LEGENDARY: {
    border: "border-amber-500/50 hover:border-amber-400",
    bg: "bg-gradient-to-r from-amber-950/40 via-amber-900/15 to-[#0c0e17]",
    text: "text-amber-300 font-extrabold",
    badgeBg: "bg-amber-500/20",
    badgeBorder: "border-amber-500/50",
    badgeText: "text-amber-300 font-bold",
    glow: "shadow-sm shadow-amber-500/20",
    prefix: "★ ",
    barColor: "bg-gradient-to-r from-amber-500 to-yellow-300",
  },
  EPIC: {
    border: "border-purple-500/40 hover:border-purple-400/80",
    bg: "bg-gradient-to-r from-purple-950/35 via-purple-900/15 to-[#0c0e17]",
    text: "text-purple-300 font-bold",
    badgeBg: "bg-purple-500/20",
    badgeBorder: "border-purple-500/40",
    badgeText: "text-purple-300 font-semibold",
    glow: "shadow-sm shadow-purple-500/15",
    prefix: "◆ ",
    barColor: "bg-gradient-to-r from-purple-500 to-fuchsia-400",
  },
  RARE: {
    border: "border-sky-500/40 hover:border-sky-400/80",
    bg: "bg-gradient-to-r from-sky-950/30 via-sky-900/10 to-[#0c0e17]",
    text: "text-sky-300 font-semibold",
    badgeBg: "bg-sky-500/20",
    badgeBorder: "border-sky-500/40",
    badgeText: "text-sky-300 font-semibold",
    glow: "shadow-sm shadow-sky-500/10",
    prefix: "▲ ",
    barColor: "bg-gradient-to-r from-sky-500 to-cyan-300",
  },
  UNCOMMON: {
    border: "border-emerald-500/30 hover:border-emerald-400/70",
    bg: "bg-gradient-to-r from-emerald-950/25 via-emerald-900/10 to-[#0c0e17]",
    text: "text-emerald-300 font-medium",
    badgeBg: "bg-emerald-500/15",
    badgeBorder: "border-emerald-500/30",
    badgeText: "text-emerald-400",
    glow: "",
    prefix: "● ",
    barColor: "bg-gradient-to-r from-emerald-500 to-teal-400",
  },
  COMMON: {
    border: "border-gray-800 hover:border-gray-700",
    bg: "bg-gray-900/50",
    text: "text-gray-400 font-medium",
    badgeBg: "bg-gray-800/80",
    badgeBorder: "border-gray-700",
    badgeText: "text-gray-400",
    glow: "",
    prefix: "",
    barColor: "bg-gradient-to-r from-gray-500 to-gray-400",
  },
};

const CATEGORY_BADGE_STYLES: Record<string, string> = {
  BG: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  FUR: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  CLOTHING: "border-violet-500/30 bg-violet-500/10 text-violet-400",
  HEADWEAR: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  EYEWEAR: "border-teal-500/30 bg-teal-500/10 text-teal-400",
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

          <div className="flex flex-wrap items-center gap-2.5 pt-1 font-mono-street text-[11px] uppercase tracking-wider">
            <span className="inline-flex items-center gap-1.5 border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 font-bold text-amber-300">
              <span className="text-amber-400">⚡</span>
              {dropData?.drop?.cycleDurationHours === 5
                ? "5-Hour Hype Control Cycle"
                : "2-Hour Drop Cycles"}
            </span>
            <span className="inline-flex items-center gap-1.5 border border-gray-700 bg-gray-900/80 px-2.5 py-1 font-bold text-gray-300">
              <Clock className="h-3.5 w-3.5 text-cyan-400" />
              30-Minute Claim Window
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {/* Drops Cycle Status Card */}
        <div className="relative border-2 border-gray-800 bg-gradient-to-b from-[#11131c] via-[#0c0d15] to-[#08090d] p-6 sm:p-8 shadow-brutal transition-all">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-800 pb-5">
            <div>
              <h2 className="font-display text-2xl uppercase tracking-wider text-white">
                Periodic Drop Cycle
              </h2>
              <p className="font-mono-street text-xs text-gray-400 uppercase tracking-wide mt-0.5">
                1 claim per EVM wallet per period cycle. Distributed with provable off-chain RNG and unique serial editions.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={loadDropData}
                disabled={isLoading}
                className="flex items-center justify-center border-2 border-gray-800 bg-gray-900 p-2.5 text-gray-400 hover:border-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50"
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
                className="flex flex-col gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 sm:flex-row sm:items-center sm:justify-between text-xs text-rose-300"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{fetchError}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadDropData()}
                  disabled={isLoading}
                  className="border-rose-500/40 text-xs text-rose-300 hover:bg-rose-500/20 shrink-0"
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
              <div className="py-16 text-center text-sm text-gray-400 flex flex-col items-center justify-center">
                <ElychimpSpinner size="lg" className="mb-4 filter drop-shadow-[0_0_20px_rgba(251,191,36,0.35)]" />
                <span className="font-mono-street text-xs uppercase tracking-wider text-amber-400 animate-pulse">
                  Loading drop event and stock data...
                </span>
              </div>
            ) : fetchError && !dropData ? (
              <div
                role="alert"
                className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-8 text-center"
              >
                <AlertCircle className="mx-auto mb-3 h-8 w-8 text-rose-400" />
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
                    className="gap-2 font-semibold"
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
                  <div className="border-2 border-gray-800 bg-[#090b12] p-5 shadow-brutal-sm flex flex-col justify-center items-center text-center">
                    <span className="font-mono-street text-xs font-bold text-gray-400 uppercase tracking-widest">
                      Period Cycle
                    </span>
                    <p className="my-1.5 font-display text-4xl font-black text-amber-400">
                      #{displayPeriodIndex}
                    </p>
                    <span className="block font-mono-street text-[10px] text-gray-400 uppercase">
                      UTC Interval Synchronized
                    </span>
                  </div>

                  <div className="border-2 border-gray-800 bg-[#090b12] p-5 shadow-brutal-sm flex flex-col justify-center items-center text-center">
                    <span className="font-mono-street text-xs font-bold text-gray-400 uppercase tracking-widest">
                      Remaining Stock
                    </span>
                    <p className="my-1.5 font-mono-street text-2xl sm:text-3xl font-black text-cyan-300">
                      {displayRemainingStock}{" "}
                      <span className="text-xs font-normal text-gray-400">
                        / {displayAllocatedStock} Units
                      </span>
                    </p>
                    <div className="mt-2 h-2 w-full max-w-[220px] bg-black overflow-hidden border border-gray-800">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-amber-400 transition-all duration-500"
                        style={{
                          width: `${displayStockPercentage}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="border-2 border-gray-800 bg-[#090b12] p-5 shadow-brutal-sm flex flex-col justify-between text-center">
                    <div>
                      <div className="flex items-center justify-center gap-2">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            isWindowActive ? "bg-amber-400 animate-ping" : "bg-cyan-400"
                          }`}
                        />
                        <span className="font-mono-street text-xs font-bold text-gray-400 uppercase tracking-widest">
                          {isWindowActive ? "Claim Window Active" : "Next Drop Window"}
                        </span>
                      </div>
                      <p
                        className={`my-1.5 font-mono-street text-2xl sm:text-3xl font-black ${
                          isWindowActive ? "text-amber-400" : "text-amber-300"
                        }`}
                      >
                        {isWindowActive
                          ? `${formatRemaining(claimRemainingMs)} left`
                          : `Opens in ${formatRemaining(nextDropRemainingMs)}`}
                      </p>
                      {isWindowActive && dropData.claimWindow?.endsAt && (
                        <span className="block font-mono-street text-[10px] text-gray-400 uppercase">
                          Closes at {formatTimeWithUtc(dropData.claimWindow.endsAt)}
                        </span>
                      )}
                      {!isWindowActive && periodEndsMs > 0 && (
                        <span className="block font-mono-street text-[10px] text-gray-400 uppercase">
                          Cycle starts at {formatTimeWithUtc(periodEndsMs)}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-800/80">
                      {claimLoading ? (
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full border border-black bg-amber-400 font-mono-street font-bold text-sm uppercase tracking-wider text-black shadow-brutal-sm"
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
                            className="w-full border border-black bg-amber-400 font-mono-street font-bold text-sm uppercase tracking-wider text-black shadow-brutal-sm"
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
                            className="w-full border border-black bg-amber-400 font-mono-street font-bold text-sm uppercase tracking-wider text-black shadow-brutal-sm hover:bg-amber-300"
                            onClick={() => void login()}
                          >
                            Sign In with Ethereum
                          </Button>
                        ) : status !== "authenticated" ? (
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full border border-black bg-amber-400 font-mono-street font-bold text-sm uppercase tracking-wider text-black shadow-brutal-sm hover:bg-amber-300"
                            onClick={() => void login()}
                          >
                            Connect Wallet to Register
                          </Button>
                        ) : isCheckingEligibility ? (
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full border border-black bg-amber-400 font-mono-street font-bold text-sm uppercase tracking-wider text-black shadow-brutal-sm cursor-wait"
                            disabled
                          >
                            <span className="flex items-center justify-center gap-2">
                              <ElychimpSpinner size="xs" />
                              Verifying Registration...
                            </span>
                          </Button>
                        ) : !hasLinkedX ? (
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full border border-black bg-cyan-400 font-mono-street font-bold text-sm uppercase tracking-wider text-black shadow-brutal-sm hover:bg-cyan-300 flex items-center justify-center gap-2"
                            onClick={handleConnectX}
                            disabled={isConnectingX}
                          >
                            <XLogo className="h-4 w-4 shrink-0" />
                            <span>{isConnectingX ? "Connecting X..." : "Link X (Twitter) to Register"}</span>
                          </Button>
                        ) : !areTasksDone ? (
                          <Link
                            href="/whitelist#tasks"
                            className="w-full inline-flex items-center justify-center gap-1.5 border border-black bg-amber-400 font-mono-street font-bold text-xs uppercase tracking-wider text-black shadow-brutal-sm hover:bg-amber-300 py-2 px-3 text-center"
                          >
                            <Flame className="h-4 w-4 text-black shrink-0" />
                            <span>Complete Quests on Whitelist ({completedTasks}/{totalTasks})</span>
                          </Link>
                        ) : isAlreadyClaimed ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full border border-emerald-500/40 bg-emerald-950/30 font-mono-street text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center justify-center gap-2 cursor-not-allowed opacity-90 py-2.5"
                            disabled
                          >
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                            Claimed for Period #{dropData.period.periodIndex} (1/1)
                          </Button>
                        ) : isStockExhausted ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full border border-red-500/30 bg-red-500/10 font-mono-street text-[11px] font-bold text-red-300 uppercase tracking-wider cursor-not-allowed opacity-70"
                            disabled
                          >
                            Period Stock Exhausted
                          </Button>
                        ) : isWindowActive ? (
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full border border-black bg-amber-400 font-mono-street font-bold text-sm uppercase tracking-wider text-black shadow-brutal-sm hover:bg-amber-300 cursor-pointer"
                            onClick={handleClaim}
                          >
                            Claim Trait Now
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full border border-gray-800 bg-gray-900/60 font-mono-street text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center justify-center gap-2 cursor-not-allowed py-2.5"
                            disabled
                          >
                            <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                            <span>Opens in {formatRemaining(nextDropRemainingMs)}</span>
                          </Button>
                        )}

                        {connectXError && (
                          <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-rose-400 font-mono-street">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                            <span>{connectXError}</span>
                          </p>
                        )}
                        {claimMessage && (
                          <div className="mt-2.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center">
                            <p className="font-mono-street text-xs font-semibold text-emerald-300">
                              {claimMessage}
                            </p>
                          </div>
                        )}
                        {claimError && !isAlreadyClaimed && (
                          <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-rose-400 font-mono-street">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                            <span>{claimError}</span>
                          </p>
                        )}
                        {isAlreadyClaimed && !claimMessage && (
                          <div className="mt-2.5 rounded border border-gray-800 bg-gray-900/60 px-3 py-1.5 text-center">
                            <span className="font-mono-street text-[10px] text-gray-400 uppercase">
                              You have claimed your 1 trait allocation for Period #{dropData.period.periodIndex}. Next drop cycle begins in {formatRemaining(nextDropRemainingMs)}.
                            </span>
                          </div>
                        )}
                        {!isWindowActive && isUserEligible && (
                          <div className="mt-2.5 rounded border border-gray-800 bg-gray-900/60 px-3 py-1.5 text-center">
                            <span className="font-mono-street text-[10px] text-gray-400 uppercase">
                              Registered &amp; Ready for Period #{displayPeriodIndex}
                            </span>
                          </div>
                        )}
                      </div>
                  </div>
                </div>

                {/* Trait Inventory Pool */}
                <div className="space-y-4 pt-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-xs font-bold tracking-wider text-white uppercase">
                        Drop Pool Inventory ({dropData.stock?.poolItems?.length ?? 0} Available Traits)
                      </h3>
                      <p className="text-[11px] text-gray-400">
                        Real-time trait stock and distribution directly from drop service
                      </p>
                    </div>
                  </div>

                  {dropData.stock?.poolItems && dropData.stock.poolItems.length > 0 ? (
                    /* Trait Card Grid */
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
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
                            className={`group relative flex flex-col justify-between rounded-xl border p-2.5 transition-all hover:scale-[1.01] ${theme.border} ${theme.bg} ${theme.glow} ${isSoldOut ? "opacity-75" : ""}`}
                          >
                            <div className="flex items-center gap-2.5">
                              {/* Trait Thumbnail Preview */}
                              <div
                                className={`relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-[#0a0d14] ${
                                  rarity === "LEGENDARY"
                                    ? "border-amber-500/40"
                                    : rarity === "EPIC"
                                      ? "border-purple-500/30"
                                      : rarity === "RARE"
                                        ? "border-sky-500/30"
                                        : rarity === "UNCOMMON"
                                          ? "border-emerald-500/30"
                                          : "border-gray-800"
                                }`}
                              >
                                {item.imageUrl ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img
                                    src={item.imageUrl}
                                    alt={item.traitName}
                                    className="h-full w-full object-contain [image-rendering:pixelated] transition-transform group-hover:scale-110"
                                  />
                                ) : (
                                  <Sparkles className="h-5 w-5 text-gray-600" />
                                )}
                              </div>

                              {/* Trait Info & Badges */}
                              <div className="min-w-0 flex-1">
                                <p
                                  className="truncate text-xs font-bold tracking-wide text-white"
                                  title={item.traitName}
                                >
                                  {item.traitName}
                                </p>
                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={`rounded border px-1.5 py-0.5 text-[8px] font-mono uppercase font-semibold ${categoryStyle}`}
                                  >
                                    {item.category}
                                  </span>
                                  <span
                                    className={`rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase ${theme.badgeBg} ${theme.badgeBorder} ${theme.badgeText}`}
                                  >
                                    {theme.prefix}
                                    {rarity}
                                  </span>
                                  {isSoldOut && (
                                    <span
                                      data-testid="badge-sold-out"
                                      className="rounded border border-rose-500/40 bg-rose-500/20 px-1.5 py-0.5 text-[8px] font-bold uppercase text-rose-300"
                                    >
                                      Sold Out
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Probability */}
                              <div className="shrink-0 text-right">
                                <span className={`font-mono text-xs ${theme.text}`}>
                                  {item.probabilityPercent}%
                                </span>
                              </div>
                            </div>

                            {/* Stock Progress Bar */}
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
                                <div className="mt-2.5 border-t border-gray-800/60 pt-1.5">
                                  <div className="mb-1 flex items-center justify-between text-[9px] font-mono">
                                    <span className="flex items-center gap-1">
                                      {isLowStock && (
                                        <span className="h-1.5 w-1.5 animate-ping rounded-full bg-rose-500" />
                                      )}
                                      <span
                                        className={
                                          isSoldOut
                                            ? "font-bold text-rose-400"
                                            : isLowStock
                                              ? "font-bold text-rose-400"
                                              : "text-gray-400"
                                        }
                                      >
                                        {isSoldOut ? "Sold Out" : isLowStock ? "Low Stock" : "Stock"}
                                      </span>
                                    </span>
                                    <span className="text-gray-400">
                                      <span
                                        className={`font-semibold ${
                                          isSoldOut
                                            ? "text-rose-400"
                                            : isLowStock
                                              ? "text-rose-300"
                                              : "text-gray-200"
                                        }`}
                                      >
                                        {currentRemaining}
                                      </span>
                                      <span className="text-gray-500">
                                        /{allocated} left
                                      </span>
                                    </span>
                                  </div>
                                  <div className="h-1.5 w-full overflow-hidden rounded-full border border-gray-800/80 bg-gray-950/80">
                                    <div
                                      className={`h-full rounded-full transition-all duration-500 ${
                                        isSoldOut
                                          ? "bg-rose-500/40"
                                          : isLowStock
                                            ? "bg-gradient-to-r from-rose-500 to-amber-500"
                                            : theme.barColor
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
                      className="rounded-xl border border-dashed border-gray-800 bg-gray-900/30 p-8 text-center"
                    >
                      <Sparkles className="mx-auto mb-2 h-6 w-6 text-gray-500" />
                      <p className="text-sm font-semibold text-gray-300">
                        No traits currently available in this drop pool
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        This drop period does not have any items allocated in its pool yet or stock is being prepared for the upcoming cycle.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="font-mono-street text-sm text-gray-400 uppercase">
                No active drop event currently in progress. Cycles renew on UTC schedule.
              </p>
            )}
          </div>
        </div>

        {/* Duplicate Trait Gifting Card */}
        <div className="border-2 border-gray-800 bg-[#0b0d14] p-6 shadow-brutal">
          <div className="flex items-center gap-3.5 border-b border-gray-800 pb-4">
            <div className="flex h-10 w-10 items-center justify-center border border-cyan-400/30 bg-cyan-400/10 text-cyan-400">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-lg uppercase tracking-wider text-white">
                Gifts &amp; Duplicate Trait Exchange
              </h3>
              <p className="font-mono-street text-[11px] text-gray-400 uppercase">
                Help fellow community members complete their 5 required trait categories
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-3 border border-gray-800/80 bg-black/60 p-4 text-xs font-mono-street text-gray-300">
            <p className="leading-relaxed">
              Hold duplicate traits? You can gift them to peers directly from your{" "}
              <Link href="/profile" className="text-amber-400 underline hover:text-amber-300 font-bold">
                User Inventory
              </Link>
              . Senders must retain at least 1 trait in the category; limited to 1 gift per wallet per UTC day.
            </p>
            <div className="flex items-center justify-between border-t border-gray-800/80 pt-2 text-[10px] text-gray-400 uppercase">
              <span>Gift Resolution Window</span>
              <span>24 Hours UTC (Lazy validation upon acceptance)</span>
            </div>
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
