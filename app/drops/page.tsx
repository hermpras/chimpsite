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

export default function DropsPage() {
  const { status } = useSiweAuth();

  // Drop status state
  const [dropData, setDropData] = useState<CurrentDropResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [claimLoading, setClaimLoading] = useState<boolean>(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [isLootboxOpen, setIsLootboxOpen] = useState<boolean>(false);
  const [claimedLootboxItem, setClaimedLootboxItem] = useState<WonTraitData | null>(null);
  const [lootboxError, setLootboxError] = useState<string | null>(null);
  const [claimedPeriodId, setClaimedPeriodId] = useState<string | null>(null);

  // Fetch current drop data
  const loadDropData = useCallback(async () => {
    try {
      const data = await fetchCurrentDrop();
      setDropData(data);
    } catch (err) {
      console.error("Failed to load drop:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    fetchCurrentDrop()
      .then((data) => {
        if (isMounted) {
          setDropData(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load drop:", err);
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

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

  // Calculate live countdowns
  const claimWindowEndsMs = dropData?.claimWindow?.endsAt
    ? new Date(dropData.claimWindow.endsAt).getTime()
    : 0;
  const periodEndsMs = dropData?.period?.endsAt
    ? new Date(dropData.period.endsAt).getTime()
    : dropData?.nextCycle?.startsAt
      ? new Date(dropData.nextCycle.startsAt).getTime()
      : 0;

  const isWindowActive = Boolean(
    dropData?.claimWindow?.isActive && claimWindowEndsMs > currentTime
  );
  const claimRemainingMs = Math.max(0, claimWindowEndsMs - currentTime);
  const nextDropRemainingMs = Math.max(0, periodEndsMs - currentTime);

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
    Boolean(dropData?.userHasClaimed) ||
    Boolean(claimedPeriodId && claimedPeriodId === dropData?.period?.id) ||
    Boolean(claimMessage && claimedPeriodId === dropData?.period?.id);

  // Auto-refresh when a timer reaches 0
  useEffect(() => {
    if (!dropData?.active) return;
    if (isWindowActive && claimRemainingMs === 0) {
      loadDropData();
    } else if (!isWindowActive && nextDropRemainingMs === 0 && periodEndsMs > 0) {
      loadDropData();
    }
  }, [claimRemainingMs, nextDropRemainingMs, isWindowActive, dropData?.active, periodEndsMs, loadDropData]);

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
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Hero Banner */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
              Trait Drops & Lootbox Engine
            </h1>
            <Badge variant="default" className="border-emerald-500/30 bg-emerald-500/20 text-emerald-300">
              Stage 1 Live
            </Badge>
          </div>
          <p className="max-w-2xl text-sm text-gray-400">
            Claim periodic lootbox mystery pods to collect trait items across all 5 categories
            (Background, Fur, Clothing, Headwear, Eyewear) required for ChimpHood Whitelist qualification.
          </p>
        </div>

        {/* Quick Links */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Link href="/whitelist">
            <Button variant="outline" size="sm" className="gap-1.5 border-gray-700 text-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              Whitelist Status
            </Button>
          </Link>
          <Link href="/profile">
            <Button variant="outline" size="sm" className="gap-1.5 border-gray-700 text-xs">
              <Layers className="h-3.5 w-3.5 text-sky-400" />
              My Inventory
            </Button>
          </Link>
        </div>
      </div>

      <div className="space-y-6">
        {/* Drops Cycle Status Card */}
        <Card className="border-emerald-500/30 bg-[#090b12]">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-400">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-lg">Periodic Drop Cycle</CardTitle>
                  <CardDescription>
                    {dropData?.drop?.cycleDurationHours === 5
                      ? "5-hour hype control cycle with a 30-minute claim window"
                      : "2-hour drop cycles with a 30-minute claim window"}
                  </CardDescription>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadDropData}
                  disabled={isLoading}
                  className="border-gray-800 text-xs text-gray-400 hover:text-white"
                  title="Refresh Drop Status"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                </Button>

                {isWindowActive ? (
                  <Badge
                    variant="default"
                    className="flex items-center gap-1.5 border-emerald-500/30 bg-emerald-500/20 font-mono text-xs text-emerald-300"
                  >
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                    Claim Window Open ({formatRemaining(claimRemainingMs)})
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="flex items-center gap-1.5 border-amber-500/40 bg-amber-500/10 font-mono text-xs text-amber-300"
                  >
                    <Clock className="h-3.5 w-3.5 text-amber-400" />
                    Next Drop in {formatRemaining(nextDropRemainingMs)}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {isLoading && !dropData ? (
              <div className="py-12 text-center text-sm text-gray-400">
                <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin text-emerald-400" />
                Loading drop event and stock data...
              </div>
            ) : dropData?.active && dropData.period ? (
              <div className="space-y-6">
                {/* 3 Metric Cards */}
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                  <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Period Cycle
                    </span>
                    <p className="mt-1 text-xl font-bold text-gray-100">
                      #{dropData.period.periodIndex}
                    </p>
                    <span className="mt-1 block text-[11px] text-gray-500">
                      Standard UTC interval
                    </span>
                  </div>

                  <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Remaining Stock
                    </span>
                    <p className="mt-1 text-xl font-bold text-emerald-400">
                      {dropData.stock?.totalRemaining ?? 0}{" "}
                      <span className="text-xs font-normal text-gray-500">
                        / {dropData.stock?.totalAllocated ?? 0} Units
                      </span>
                    </p>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-gray-950 overflow-hidden border border-gray-800">
                      <div
                        className="h-full bg-emerald-400 transition-all duration-500"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              ((dropData.stock?.totalRemaining ?? 0) /
                                Math.max(1, dropData.stock?.totalAllocated ?? 1)) *
                                100
                            )
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {isWindowActive ? "Claim Window Status" : "Next Drop Window"}
                    </span>
                    <p
                      className={`mt-1 font-mono text-xl font-bold ${
                        isWindowActive ? "text-emerald-400" : "text-amber-300"
                      }`}
                    >
                      {isWindowActive
                        ? `${formatRemaining(claimRemainingMs)} left`
                        : `Opens in ${formatRemaining(nextDropRemainingMs)}`}
                    </p>
                    {!isWindowActive && periodEndsMs > 0 && (
                      <span className="mt-1 block text-[11px] text-gray-500">
                        Cycle starts at{" "}
                        {new Date(periodEndsMs).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Drop Action & Status */}
                <div className="rounded-xl border border-gray-800/80 bg-gradient-to-r from-gray-900/80 via-[#0c0f18] to-gray-900/80 p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-white">
                        Lootbox Mystery Pod Claim
                      </h4>
                      <p className="text-xs text-gray-400">
                        1 claim per EVM wallet per period cycle. Items are distributed with provable off-chain RNG and unique serial editions.
                      </p>
                    </div>

                    <div className="shrink-0">
                      <Button
                        variant={isAlreadyClaimed ? "outline" : "primary"}
                        size="lg"
                        className={`w-full font-semibold sm:w-auto ${
                          isAlreadyClaimed
                            ? "border-gray-800 bg-gray-900/60 text-gray-400 opacity-60 cursor-not-allowed hover:bg-gray-900/60"
                            : ""
                        }`}
                        onClick={handleClaim}
                        disabled={
                          !isWindowActive ||
                          claimLoading ||
                          status !== "authenticated" ||
                          isAlreadyClaimed
                        }
                      >
                        {claimLoading ? (
                          <span className="flex items-center gap-2">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Claiming...
                          </span>
                        ) : status !== "authenticated" ? (
                          "Sign In to Claim"
                        ) : isAlreadyClaimed ? (
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            Claimed for Period #{dropData.period.periodIndex} (1/1)
                          </span>
                        ) : isWindowActive ? (
                          `Claim Trait Now (${formatRemaining(claimRemainingMs)})`
                        ) : (
                          `Next Drop in ${formatRemaining(nextDropRemainingMs)}`
                        )}
                      </Button>
                    </div>
                  </div>

                  {claimMessage && (
                    <p className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-800/40 bg-emerald-950/30 p-3 text-xs text-emerald-400">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      <span>{claimMessage}</span>
                    </p>
                  )}
                  {claimError && !isAlreadyClaimed && (
                    <p className="mt-4 flex items-center gap-2 rounded-lg border border-rose-800/40 bg-rose-950/30 p-3 text-xs text-rose-400">
                      <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                      <span>{claimError}</span>
                    </p>
                  )}
                  {isAlreadyClaimed && !claimMessage && (
                    <div className="mt-4 flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/50 p-3 text-xs text-gray-400">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      <span>
                        You have claimed your 1 trait allocation for Period #{dropData.period.periodIndex}. Next drop cycle begins in {formatRemaining(nextDropRemainingMs)}.
                      </span>
                    </div>
                  )}
                </div>

                {/* Trait Inventory Pool */}
                {dropData.stock?.poolItems && dropData.stock.poolItems.length > 0 && (
                  <div className="space-y-4 pt-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-white uppercase">
                          <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                          Drop Pool Inventory ({dropData.stock.poolItems.length} Available Traits)
                        </h3>
                        <p className="text-[11px] text-gray-400">
                          Real-time trait stock and distribution directly from drop service
                        </p>
                      </div>

                      {dropData.stock && (
                        <div className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/60 px-2.5 py-1 text-[11px] font-mono">
                          <span className="text-gray-400">Pool Stock:</span>
                          <span className="font-bold text-emerald-400">
                            {dropData.stock.totalRemaining} / {dropData.stock.totalAllocated}
                          </span>
                          <div className="ml-1 h-1.5 w-16 overflow-hidden rounded-full border border-gray-800 bg-gray-950">
                            <div
                              className="h-full bg-emerald-400 transition-all duration-500"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.round(
                                    (dropData.stock.totalRemaining /
                                      Math.max(1, dropData.stock.totalAllocated)) *
                                      100
                                  )
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Trait Card Grid */}
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      {dropData.stock.poolItems.map((item) => {
                        const rarity = item.rarity?.toUpperCase() || "COMMON";
                        const theme = RARITY_THEME[rarity] || RARITY_THEME.COMMON;

                        return (
                          <div
                            key={item.poolItemId}
                            className={`group relative flex flex-col justify-between rounded-xl border p-2.5 transition-all hover:scale-[1.01] ${theme.border} ${theme.bg} ${theme.glow}`}
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
                                <div className="mt-0.5 flex items-center gap-1.5">
                                  <span className="rounded border border-gray-800 bg-gray-900/80 px-1.5 py-0.5 text-[8px] font-mono uppercase text-gray-400">
                                    {item.category}
                                  </span>
                                  <span
                                    className={`rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase ${theme.badgeBg} ${theme.badgeBorder} ${theme.badgeText}`}
                                  >
                                    {theme.prefix}
                                    {rarity}
                                  </span>
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
                              const stockPercent = Math.max(
                                0,
                                Math.min(
                                  100,
                                  Math.round((item.remainingStock / allocated) * 100)
                                )
                              );
                              const isLowStock =
                                item.remainingStock > 0 &&
                                (stockPercent <= 20 || item.remainingStock <= 2);

                              return (
                                <div className="mt-2.5 border-t border-gray-800/60 pt-1.5">
                                  <div className="mb-1 flex items-center justify-between text-[9px] font-mono">
                                    <span className="flex items-center gap-1">
                                      {isLowStock && (
                                        <span className="h-1.5 w-1.5 animate-ping rounded-full bg-rose-500" />
                                      )}
                                      <span
                                        className={
                                          isLowStock
                                            ? "font-bold text-rose-400"
                                            : "text-gray-400"
                                        }
                                      >
                                        {isLowStock ? "Low Stock" : "Stock"}
                                      </span>
                                    </span>
                                    <span className="text-gray-400">
                                      <span
                                        className={`font-semibold ${
                                          isLowStock
                                            ? "text-rose-300"
                                            : "text-gray-200"
                                        }`}
                                      >
                                        {item.remainingStock}
                                      </span>
                                      <span className="text-gray-500">
                                        /{allocated} left
                                      </span>
                                    </span>
                                  </div>
                                  <div className="h-1.5 w-full overflow-hidden rounded-full border border-gray-800/80 bg-gray-950/80">
                                    <div
                                      className={`h-full rounded-full transition-all duration-500 ${
                                        isLowStock
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
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                No active drop event currently in progress. Cycles renew on UTC schedule.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Duplicate Trait Gifting Card */}
        <Card className="border-gray-800 bg-[#090b12]">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-teal-500/10 p-2.5 text-teal-400">
                <Gift className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Gifts & Duplicate Trait Exchange</CardTitle>
                <CardDescription>
                  Help fellow community members complete their 5 required trait categories
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-900/40 p-4 text-sm text-gray-400">
              <p>
                Hold duplicate traits? You can gift them to peers directly from your{" "}
                <Link href="/profile" className="text-emerald-400 underline hover:text-emerald-300">
                  User Inventory
                </Link>
                . Senders must retain at least 1 trait in the category; limited to 1 gift per wallet per UTC day.
              </p>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Gift Resolution Window</span>
                <span>24 Hours UTC (Lazy validation upon acceptance)</span>
              </div>
            </div>
          </CardContent>
        </Card>
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
