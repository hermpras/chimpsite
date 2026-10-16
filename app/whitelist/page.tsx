"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Search,
  Gift,
  Clock,
  Flame,
  CheckCircle2,
  XCircle,
  Sparkles,
  AlertCircle,
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
import { useSiweAuth } from "@/hooks/useSiweAuth";
import {
  fetchWhitelistStatus,
  submitWhitelistQualification,
  type WhitelistStatusResponse,
} from "@/lib/whitelist/client";
import {
  fetchCurrentDrop,
  claimDropItem,
  type CurrentDropResponse,
} from "@/lib/drops/client";

export default function WhitelistPage() {
  const { status, sessionAddress, walletAddress } = useSiweAuth();
  const address = sessionAddress || walletAddress;
  const [addressInput, setAddressInput] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusResult, setStatusResult] = useState<WhitelistStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Drop status state
  const [dropData, setDropData] = useState<CurrentDropResponse | null>(null);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Load current drop data on mount
  useEffect(() => {
    fetchCurrentDrop()
      .then(setDropData)
      .catch((err) => console.error("Failed to load drop:", err));
  }, []);

  // Auto-fetch Whitelist status if user is authenticated
  useEffect(() => {
    if (status === "authenticated" && address) {
      let isMounted = true;
      fetchWhitelistStatus(address)
        .then((data) => {
          if (isMounted) setStatusResult(data);
        })
        .catch((err) => {
          if (isMounted)
            setStatusError((err as Error).message || "Failed to check status.");
        });
      return () => {
        isMounted = false;
      };
    }
  }, [status, address]);

  async function handleCheck(queryAddress?: string) {
    const target = queryAddress || addressInput.trim() || address || "";
    if (!target) return;
    setStatusLoading(true);
    setStatusError(null);
    try {
      const data = await fetchWhitelistStatus(target);
      setStatusResult(data);
    } catch (err: unknown) {
      setStatusError((err as Error).message || "Failed to check status.");
    } finally {
      setStatusLoading(false);
    }
  }

  async function handleClaim() {
    if (!dropData?.drop || !dropData?.period) return;
    setClaimLoading(true);
    setClaimMessage(null);
    setClaimError(null);
    try {
      const res = await claimDropItem(dropData.drop.id, dropData.period.id);
      setClaimMessage(
        `Successfully claimed ${res.inventoryItem.trait.name} (Edition #${res.inventoryItem.edition})!`,
      );
      // Refresh drop info
      fetchCurrentDrop().then(setDropData).catch(console.error);
    } catch (err: unknown) {
      setClaimError((err as Error).message || "Failed to claim drop.");
    } finally {
      setClaimLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Whitelist Portal
          </h1>
          <Badge variant="default">Stage 3 Live</Badge>
        </div>
        <p className="text-gray-400">
          Check allocation eligibility, registration status, and ChimpHood Whitelist
          distribution details.
        </p>
      </div>

      <div className="space-y-6">
        {/* Whitelist Checker Tool */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
                <Search className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Check Whitelist Allocation Status</CardTitle>
                <CardDescription>
                  Enter an EVM wallet address or check your connected wallet
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                placeholder="0x... EVM wallet address"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                className="flex-1 rounded-lg border border-gray-700 bg-gray-900/60 px-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
              />
              <Button
                variant="primary"
                onClick={() => handleCheck()}
                disabled={statusLoading}
              >
                {statusLoading ? "Checking..." : "Check Eligibility"}
              </Button>
            </div>

            {statusError && <p className="text-xs text-rose-400">{statusError}</p>}

            {/* Results display */}
            {statusResult?.status && (
              <div className="mt-4 space-y-4 rounded-lg border border-gray-800 bg-gray-900/60 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-300">Phase:</span>
                    {statusResult.status.phase === "SLOT_ALLOCATED" && (
                      <Badge
                        variant="default"
                        className="border-emerald-500/30 bg-emerald-500/20 text-emerald-300"
                      >
                        SLOT ALLOCATED #{statusResult.status.slotNumber}
                      </Badge>
                    )}
                    {statusResult.status.phase === "IN_QUEUE" && (
                      <Badge
                        variant="warning"
                        className="border-amber-500/30 bg-amber-500/20 text-amber-300"
                      >
                        IN QUEUE (Rank #
                        {statusResult.status.queueRank ?? statusResult.status.queueNumber}
                        )
                      </Badge>
                    )}
                    {statusResult.status.phase === "QUALIFIED" && (
                      <Badge variant="default">QUALIFIED</Badge>
                    )}
                    {statusResult.status.phase === "NONE" && (
                      <Badge variant="outline" className="text-gray-400">
                        INELIGIBLE
                      </Badge>
                    )}
                  </div>
                  {statusResult.program && (
                    <span className="text-xs text-gray-500">
                      Capacity: {statusResult.program.allocatedSlotsCount} /{" "}
                      {statusResult.program.totalSlots} Slots
                    </span>
                  )}
                </div>

                {/* 5-Category Checklist */}
                <div>
                  <h4 className="mb-2 text-xs font-semibold tracking-wider text-gray-400 uppercase">
                    Required Trait Categories (5 of 5)
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                    {["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"].map((cat) => {
                      const isHeld =
                        statusResult.status?.details.heldCategories.includes(cat);
                      return (
                        <div
                          key={cat}
                          className={`flex items-center gap-1.5 rounded border p-2 ${
                            isHeld
                              ? "border-emerald-800/40 bg-emerald-950/20 text-emerald-300"
                              : "border-gray-800 bg-gray-800/20 text-gray-500"
                          }`}
                        >
                          {isHeld ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 shrink-0 text-gray-600" />
                          )}
                          <span>{cat}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Missing requirements summary */}
                {statusResult.status.missingRequirements.length > 0 && (
                  <div className="space-y-1 rounded border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300">
                    <p className="font-semibold">Missing Requirements:</p>
                    <ul className="list-inside list-disc space-y-0.5 text-amber-200/80">
                      {statusResult.status.missingRequirements.map((req, i) => (
                        <li key={i}>{req}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Drops & Claim Engine Section */}
        <Card className="border-emerald-500/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Hourly Drop & Trait Claim Engine</CardTitle>
                  <CardDescription>
                    Two-hour drop cycles with a 30-minute claim window
                  </CardDescription>
                </div>
              </div>
              {dropData?.claimWindow?.isActive ? (
                <Badge
                  variant="default"
                  className="border-emerald-500/30 bg-emerald-500/20 text-emerald-300"
                >
                  Claim Window Open
                </Badge>
              ) : (
                <Badge variant="outline">Claim Window Closed</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {dropData?.active && dropData.period ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                  <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
                    <span className="text-xs text-gray-500">Period Index</span>
                    <p className="font-medium text-gray-200">
                      #{dropData.period.periodIndex}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
                    <span className="text-xs text-gray-500">Remaining Stock</span>
                    <p className="font-medium text-emerald-400">
                      {dropData.stock?.totalRemaining} / {dropData.stock?.totalAllocated}{" "}
                      Units
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
                    <span className="text-xs text-gray-500">Window Status</span>
                    <p className="font-medium text-gray-200">
                      {dropData.claimWindow?.isActive
                        ? `${Math.ceil((dropData.claimWindow.timeRemainingMs || 0) / 60000)}m remaining`
                        : "Next window starting soon"}
                    </p>
                  </div>
                </div>

                {/* Transparent pool probabilities */}
                {dropData.stock?.poolItems && dropData.stock.poolItems.length > 0 && (
                  <div className="space-y-1.5">
                    <h5 className="text-xs font-semibold tracking-wider text-gray-400 uppercase">
                      Pool Transparent Probability Distribution
                    </h5>
                    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      {dropData.stock.poolItems.map((item) => (
                        <div
                          key={item.poolItemId}
                          className="flex justify-between rounded border border-gray-800 bg-gray-900/60 p-2"
                        >
                          <span className="truncate text-gray-300">{item.traitName}</span>
                          <span className="font-semibold text-emerald-400">
                            {item.probabilityPercent}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {claimMessage && (
                  <p className="rounded border border-emerald-800/40 bg-emerald-950/30 p-2.5 text-xs text-emerald-400">
                    {claimMessage}
                  </p>
                )}
                {claimError && (
                  <p className="rounded border border-rose-800/40 bg-rose-950/30 p-2.5 text-xs text-rose-400">
                    {claimError}
                  </p>
                )}

                <Button
                  variant="primary"
                  className="w-full sm:w-auto"
                  onClick={handleClaim}
                  disabled={
                    !dropData.claimWindow?.isActive ||
                    claimLoading ||
                    status !== "authenticated"
                  }
                >
                  {claimLoading
                    ? "Claiming..."
                    : status !== "authenticated"
                      ? "Sign In to Claim"
                      : dropData.claimWindow?.isActive
                        ? "Claim Trait Now"
                        : "Window Closed"}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                No active drop event currently in progress. Cycles renew on UTC schedule.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Campaign & Tasks */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400">
                  <Flame className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Campaigns & Quests</CardTitle>
                  <CardDescription>
                    Community missions to earn Whitelist allocation
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-900/40 p-4 text-sm text-gray-400">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                  <span>Early Bird Community Quest</span>
                  <Badge variant="default" className="text-xs">
                    Active
                  </Badge>
                </div>
                <div className="flex items-center justify-between border-b border-gray-800 py-2">
                  <span>X Creative Content Campaign</span>
                  <Badge variant="outline" className="text-xs">
                    Manual Review
                  </Badge>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span>ChimpHood Referral Mission</span>
                  <Badge variant="outline" className="text-xs">
                    Peer Evidence
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-teal-500/10 p-2 text-teal-400">
                  <Gift className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Gifts & Referral Allocation</CardTitle>
                  <CardDescription>Duplicate trait transfer workflow</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-900/40 p-4 text-sm text-gray-400">
                <p>
                  Peer-to-peer duplicate gifting is active. Senders must retain at least 1
                  copy; 1 gift per wallet per UTC day.
                </p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Pending Gift Window</span>
                  <span>24 Hours UTC</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
