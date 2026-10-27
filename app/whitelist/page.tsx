"use client";

import React, { useState, useEffect, useCallback } from "react";
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
  Send,
  RefreshCw,
  ExternalLink,
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
  fetchWhitelistStatus,
  submitWhitelistQualification,
  type WhitelistStatusResponse,
} from "@/lib/whitelist/client";
import {
  fetchCurrentDrop,
  claimDropItem,
  type CurrentDropResponse,
} from "@/lib/drops/client";
import {
  fetchActiveTasks,
  submitTaskEvidence,
  type ActiveCampaignItem,
  type ActiveCampaignTask,
} from "@/lib/tasks/client";
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

const RARITY_WEIGHT_ORDER: Record<string, number> = {
  LEGENDARY: 5,
  EPIC: 4,
  RARE: 3,
  UNCOMMON: 2,
  COMMON: 1,
};

export default function WhitelistPage() {
  const { status, sessionAddress, walletAddress } = useSiweAuth();
  const address = sessionAddress || walletAddress;
  const [addressInput, setAddressInput] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusResult, setStatusResult] = useState<WhitelistStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Qualification evaluation state
  const [qualifyLoading, setQualifyLoading] = useState(false);
  const [qualifyMessage, setQualifyMessage] = useState<string | null>(null);
  const [qualifyError, setQualifyError] = useState<string | null>(null);

  // Drop status state
  const [dropData, setDropData] = useState<CurrentDropResponse | null>(null);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [poolRarityFilter, setPoolRarityFilter] = useState<string>("ALL");
  const [isLootboxOpen, setIsLootboxOpen] = useState(false);
  const [claimedLootboxItem, setClaimedLootboxItem] = useState<WonTraitData | null>(null);
  const [lootboxError, setLootboxError] = useState<string | null>(null);
  const [claimedPeriodId, setClaimedPeriodId] = useState<string | null>(null);

  // Campaigns & Tasks state
  const [campaigns, setCampaigns] = useState<ActiveCampaignItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);

  // Evidence submission state per task
  const [evidenceInputs, setEvidenceInputs] = useState<
    Record<string, { payload: string; submissionType: string }>
  >({});
  const [submittingTaskId, setSubmittingTaskId] = useState<string | null>(null);
  const [taskErrors, setTaskErrors] = useState<Record<string, string | null>>({});
  const [taskSuccess, setTaskSuccess] = useState<Record<string, string | null>>({});

  // Load current drop data on mount
  useEffect(() => {
    fetchCurrentDrop()
      .then(setDropData)
      .catch((err) => console.error("Failed to load drop:", err));
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
      fetchCurrentDrop().then(setDropData).catch(console.error);
    } else if (!isWindowActive && nextDropRemainingMs === 0 && periodEndsMs > 0) {
      fetchCurrentDrop().then(setDropData).catch(console.error);
    }
  }, [claimRemainingMs, nextDropRemainingMs, isWindowActive, dropData?.active, periodEndsMs]);

  // Fetch active campaigns and tasks
  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    setTasksError(null);
    try {
      const res = await fetchActiveTasks();
      setCampaigns(res.campaigns || []);
    } catch (err: unknown) {
      setTasksError((err as Error).message || "Failed to load active tasks.");
    } finally {
      setTasksLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks, status]);

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
    setQualifyMessage(null);
    setQualifyError(null);
    try {
      const data = await fetchWhitelistStatus(target);
      setStatusResult(data);
    } catch (err: unknown) {
      setStatusError((err as Error).message || "Failed to check status.");
    } finally {
      setStatusLoading(false);
    }
  }

  async function handleQualify() {
    setQualifyLoading(true);
    setQualifyError(null);
    setQualifyMessage(null);
    try {
      const res = await submitWhitelistQualification();
      if (res.result) {
        setStatusResult((prev) => ({
          configured: true,
          program: prev?.program,
          address: address || undefined,
          status: res.result,
        }));

        if (res.result.phase === "SLOT_ALLOCATED") {
          setQualifyMessage(
            `Congratulations! Whitelist Slot #${res.result.slotNumber} has been allocated.`,
          );
        } else if (res.result.phase === "IN_QUEUE") {
          setQualifyMessage(
            `You are in the queue at rank #${res.result.queueRank ?? res.result.queueNumber}.`,
          );
        } else if (res.result.qualified) {
          setQualifyMessage("You meet all qualification requirements!");
        } else {
          setQualifyMessage(
            "Evaluation complete. Please review the missing requirements below.",
          );
        }
      }
      // Refresh tasks
      loadTasks();
    } catch (err: unknown) {
      setQualifyError((err as Error).message || "Failed to evaluate qualification.");
    } finally {
      setQualifyLoading(false);
    }
  }

  async function handleEvidenceSubmit(task: ActiveCampaignTask) {
    const inputState = evidenceInputs[task.id] || {
      payload: "",
      submissionType:
        task.taskType === "IMAGE_URL" ||
        task.taskType === "TEXT_PROOF" ||
        task.taskType === "OAUTH_VERIFICATION"
          ? task.taskType
          : "URL",
    };

    const trimmedPayload = inputState.payload.trim();
    if (!trimmedPayload) {
      setTaskErrors((prev) => ({
        ...prev,
        [task.id]: "Evidence payload cannot be empty.",
      }));
      return;
    }

    if (trimmedPayload.length > 2048) {
      setTaskErrors((prev) => ({
        ...prev,
        [task.id]: "Evidence payload must not exceed 2048 characters.",
      }));
      return;
    }

    const type = inputState.submissionType || "URL";
    if (type === "URL" || type === "IMAGE_URL") {
      try {
        const parsed = new URL(trimmedPayload);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          throw new Error();
        }
      } catch {
        setTaskErrors((prev) => ({
          ...prev,
          [task.id]: `Please enter a valid HTTP or HTTPS URL for ${type}.`,
        }));
        return;
      }
    }

    setSubmittingTaskId(task.id);
    setTaskErrors((prev) => ({ ...prev, [task.id]: null }));
    setTaskSuccess((prev) => ({ ...prev, [task.id]: null }));

    try {
      await submitTaskEvidence(task.id, {
        submissionType: type as any,
        payload: trimmedPayload,
      });

      setTaskSuccess((prev) => ({
        ...prev,
        [task.id]: "Evidence submitted! Status is now Pending Review.",
      }));

      // Clear payload input
      setEvidenceInputs((prev) => ({
        ...prev,
        [task.id]: { payload: "", submissionType: type },
      }));

      // Reload tasks to reflect latest backend submission status
      await loadTasks();

      // Refresh Whitelist status if user is signed in
      if (address) {
        fetchWhitelistStatus(address).then(setStatusResult).catch(console.error);
      }
    } catch (err: unknown) {
      setTaskErrors((prev) => ({
        ...prev,
        [task.id]: (err as Error).message || "Failed to submit evidence.",
      }));
    } finally {
      setSubmittingTaskId(null);
    }
  }

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
        `Successfully claimed ${res.inventoryItem.trait.name} (Edition #${res.inventoryItem.edition})!`,
      );
      // Refresh drop info
      fetchCurrentDrop().then(setDropData).catch(console.error);
    } catch (err: unknown) {
      const msg = (err as Error).message || "Failed to claim drop.";
      setClaimError(msg);
      setLootboxError(msg);
    } finally {
      setClaimLoading(false);
    }
  }

  function getTaskStatus(task: ActiveCampaignTask): {
    key: "APPROVED" | "PENDING" | "REJECTED" | "NOT_SUBMITTED";
    label: string;
    badgeVariant: "default" | "warning" | "outline";
    colorClass: string;
  } {
    if (
      task.progress?.status === "VERIFIED" ||
      task.latestSubmission?.status === "APPROVED"
    ) {
      return {
        key: "APPROVED",
        label: "Approved",
        badgeVariant: "default",
        colorClass: "border-emerald-500/30 bg-emerald-500/20 text-emerald-300",
      };
    }
    if (
      task.latestSubmission?.status === "PENDING" ||
      task.progress?.status === "SUBMITTED"
    ) {
      return {
        key: "PENDING",
        label: "Pending Review",
        badgeVariant: "warning",
        colorClass: "border-amber-500/30 bg-amber-500/20 text-amber-300",
      };
    }
    if (
      task.latestSubmission?.status === "REJECTED" ||
      task.progress?.status === "REJECTED"
    ) {
      return {
        key: "REJECTED",
        label: "Rejected",
        badgeVariant: "outline",
        colorClass: "border-rose-500/30 bg-rose-500/20 text-rose-300",
      };
    }
    return {
      key: "NOT_SUBMITTED",
      label: "Not Submitted",
      badgeVariant: "outline",
      colorClass: "border-gray-700 bg-gray-800/40 text-gray-400",
    };
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
              {status === "authenticated" && (
                <Button
                  variant="outline"
                  onClick={handleQualify}
                  disabled={qualifyLoading}
                >
                  {qualifyLoading ? "Evaluating..." : "Qualify / Claim Slot"}
                </Button>
              )}
            </div>

            {statusError && <p className="text-xs text-rose-400">{statusError}</p>}
            {qualifyError && <p className="text-xs text-rose-400">{qualifyError}</p>}
            {qualifyMessage && (
              <p className="rounded border border-emerald-800/40 bg-emerald-950/30 p-2.5 text-xs text-emerald-400">
                {qualifyMessage}
              </p>
            )}

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
                      <Badge
                        variant="default"
                        className="border-emerald-500/30 bg-emerald-500/20 text-emerald-300"
                      >
                        QUALIFIED
                      </Badge>
                    )}
                    {statusResult.status.phase === "REVOKED" && (
                      <Badge
                        variant="outline"
                        className="border-rose-500/30 bg-rose-500/20 text-rose-300"
                      >
                        REVOKED
                      </Badge>
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

                {/* Mandatory Tasks Progress */}
                {statusResult.status.details && (
                  <div className="flex items-center justify-between rounded border border-gray-800 bg-gray-900/40 p-2.5 text-xs">
                    <span className="text-gray-400">Mandatory Whitelist Tasks:</span>
                    <span
                      className={`font-semibold ${
                        statusResult.status.details.completedMandatoryTasksCount >=
                        statusResult.status.details.totalMandatoryTasksCount
                          ? "text-emerald-400"
                          : "text-amber-400"
                      }`}
                    >
                      {statusResult.status.details.completedMandatoryTasksCount} /{" "}
                      {statusResult.status.details.totalMandatoryTasksCount} Completed
                    </span>
                  </div>
                )}

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

        {/* Campaigns & Quests Section */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
              <Button
                variant="outline"
                size="sm"
                onClick={loadTasks}
                disabled={tasksLoading}
                className="self-start sm:self-auto"
              >
                <RefreshCw
                  className={`mr-1.5 h-3.5 w-3.5 ${tasksLoading ? "animate-spin" : ""}`}
                />
                {tasksLoading ? "Refreshing..." : "Refresh Tasks"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {tasksLoading && campaigns.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                Loading campaigns & tasks...
              </div>
            ) : tasksError ? (
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-400">
                <p className="font-medium">Failed to load campaigns:</p>
                <p className="text-xs">{tasksError}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={loadTasks}>
                  Retry
                </Button>
              </div>
            ) : campaigns.length === 0 ? (
              <p className="text-sm text-gray-400">
                No active campaigns currently open for Whitelist.
              </p>
            ) : (
              campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="space-y-4 rounded-lg border border-gray-800 bg-gray-900/40 p-4"
                >
                  {/* Campaign Header */}
                  <div className="flex flex-col gap-2 border-b border-gray-800 pb-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white">{campaign.title}</h3>
                        <Badge variant="default" className="text-xs">
                          {campaign.status}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="border-amber-500/30 text-xs text-amber-400"
                        >
                          Mandatory for WL
                        </Badge>
                      </div>
                      {campaign.description && (
                        <p className="mt-1 text-xs text-gray-400">
                          {campaign.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Task List */}
                  <div className="space-y-4">
                    {campaign.tasks.length === 0 ? (
                      <p className="text-xs text-gray-500">
                        No tasks configured for this campaign.
                      </p>
                    ) : (
                      campaign.tasks.map((task) => {
                        const taskStatus = getTaskStatus(task);
                        const isSubmitting = submittingTaskId === task.id;
                        const taskInput = evidenceInputs[task.id] || {
                          payload: "",
                          submissionType:
                            task.taskType === "IMAGE_URL" ||
                            task.taskType === "TEXT_PROOF" ||
                            task.taskType === "OAUTH_VERIFICATION"
                              ? task.taskType
                              : "URL",
                        };
                        const errorMsg = taskErrors[task.id];
                        const successMsg = taskSuccess[task.id];

                        return (
                          <div
                            key={task.id}
                            className="space-y-3 rounded-lg border border-gray-800 bg-gray-900/60 p-4"
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-sm font-medium text-gray-200">
                                    {task.title}
                                  </h4>
                                  {task.isRequired ? (
                                    <Badge
                                      variant="default"
                                      className="border-amber-500/30 bg-amber-500/20 text-xs text-amber-300"
                                    >
                                      Mandatory
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="text-xs text-gray-400"
                                    >
                                      Optional
                                    </Badge>
                                  )}
                                  <Badge
                                    variant="outline"
                                    className="text-xs text-gray-400"
                                  >
                                    +{task.points} Pts
                                  </Badge>
                                  <span className="text-[10px] text-gray-500 uppercase">
                                    {task.taskType}
                                  </span>
                                </div>
                                {task.description && (
                                  <p className="text-xs text-gray-400">
                                    {task.description}
                                  </p>
                                )}
                              </div>

                              {/* Task Status Badge */}
                              <div className="flex shrink-0 items-center gap-1.5">
                                <Badge
                                  variant={taskStatus.badgeVariant}
                                  className={`text-xs ${taskStatus.colorClass}`}
                                >
                                  {taskStatus.key === "APPROVED" && (
                                    <CheckCircle2 className="mr-1 h-3 w-3 shrink-0" />
                                  )}
                                  {taskStatus.key === "PENDING" && (
                                    <Clock className="mr-1 h-3 w-3 shrink-0" />
                                  )}
                                  {taskStatus.key === "REJECTED" && (
                                    <XCircle className="mr-1 h-3 w-3 shrink-0" />
                                  )}
                                  {taskStatus.key === "NOT_SUBMITTED" && (
                                    <AlertCircle className="mr-1 h-3 w-3 shrink-0" />
                                  )}
                                  {taskStatus.label}
                                </Badge>
                              </div>
                            </div>

                            {/* Rejection alert box */}
                            {taskStatus.key === "REJECTED" && (
                              <div className="space-y-1 rounded border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                                <p className="flex items-center gap-1.5 font-semibold">
                                  <XCircle className="h-3.5 w-3.5 text-rose-400" />
                                  Evidence Rejected
                                </p>
                                <p className="text-rose-200">
                                  {task.latestSubmission?.reviewerNotes ||
                                    "Your submission was rejected by the moderator."}
                                </p>
                                <p className="text-rose-300/70">
                                  You can correct and resubmit your evidence below.
                                </p>
                              </div>
                            )}

                            {/* Pending review info box */}
                            {taskStatus.key === "PENDING" && (
                              <div className="space-y-1 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                                <p className="flex items-center gap-1.5 font-semibold">
                                  <Clock className="h-3.5 w-3.5 text-amber-400" />
                                  Pending Moderator Review
                                </p>
                                <p className="truncate font-mono text-[11px] text-amber-200">
                                  Submitted Proof: {task.latestSubmission?.payload}
                                </p>
                                <p className="text-amber-300/70">
                                  Your submission has been recorded and is awaiting
                                  review. Tasks are only counted as completed once
                                  approved.
                                </p>
                              </div>
                            )}

                            {/* Approved info box */}
                            {taskStatus.key === "APPROVED" && (
                              <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                                <p className="flex items-center gap-1.5 font-semibold">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                  Verified & Approved
                                </p>
                                {task.latestSubmission?.payload && (
                                  <p className="mt-1 truncate font-mono text-[11px] text-emerald-200">
                                    Approved Proof: {task.latestSubmission.payload}
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Evidence Submission / Resubmission Form */}
                            {(taskStatus.key === "NOT_SUBMITTED" ||
                              taskStatus.key === "REJECTED") && (
                              <div className="space-y-2 pt-1">
                                {status !== "authenticated" ? (
                                  <p className="text-xs text-gray-500 italic">
                                    Sign in with Ethereum to submit evidence for this
                                    task.
                                  </p>
                                ) : (
                                  <div className="space-y-2">
                                    <div className="flex flex-col gap-2 sm:flex-row">
                                      <input
                                        type="text"
                                        placeholder={
                                          task.taskType === "TEXT_PROOF"
                                            ? "Enter proof text or details..."
                                            : "https://x.com/your_post_url..."
                                        }
                                        value={taskInput.payload}
                                        onChange={(e) =>
                                          setEvidenceInputs((prev) => ({
                                            ...prev,
                                            [task.id]: {
                                              ...taskInput,
                                              payload: e.target.value,
                                            },
                                          }))
                                        }
                                        className="flex-1 rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                                      />
                                      <select
                                        value={taskInput.submissionType}
                                        onChange={(e) =>
                                          setEvidenceInputs((prev) => ({
                                            ...prev,
                                            [task.id]: {
                                              ...taskInput,
                                              submissionType: e.target.value,
                                            },
                                          }))
                                        }
                                        className="rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-300 focus:border-emerald-500 focus:outline-none"
                                      >
                                        <option value="URL">URL</option>
                                        <option value="IMAGE_URL">IMAGE_URL</option>
                                        <option value="TEXT_PROOF">TEXT_PROOF</option>
                                      </select>
                                      <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() => handleEvidenceSubmit(task)}
                                        disabled={
                                          isSubmitting || !taskInput.payload.trim()
                                        }
                                      >
                                        <Send className="mr-1 h-3 w-3" />
                                        {isSubmitting
                                          ? "Submitting..."
                                          : taskStatus.key === "REJECTED"
                                            ? "Resubmit Evidence"
                                            : "Submit Evidence"}
                                      </Button>
                                    </div>

                                    {errorMsg && (
                                      <p className="text-xs text-rose-400">{errorMsg}</p>
                                    )}
                                    {successMsg && (
                                      <p className="text-xs text-emerald-400">
                                        {successMsg}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ))
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
                    {dropData?.drop?.cycleDurationHours === 5
                      ? "5-hour hype control cycle with a 30-minute claim window"
                      : "2-hour drop cycles with a 30-minute claim window"}
                  </CardDescription>
                </div>
              </div>
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
                  <Clock className="h-3 w-3 text-amber-400" />
                  Next Drop in {formatRemaining(nextDropRemainingMs)}
                </Badge>
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
                    <span className="text-xs text-gray-500">
                      {isWindowActive ? "Claim Window Status" : "Next Drop Window"}
                    </span>
                    <p
                      className={`mt-0.5 font-mono text-sm font-medium ${
                        isWindowActive ? "text-emerald-400" : "text-amber-300"
                      }`}
                    >
                      {isWindowActive
                        ? `${formatRemaining(claimRemainingMs)} remaining`
                        : `Opens in ${formatRemaining(nextDropRemainingMs)}`}
                    </p>
                    {!isWindowActive && periodEndsMs > 0 && (
                      <span className="mt-0.5 block text-[10px] text-gray-500">
                        Cycle starts at{" "}
                        {new Date(periodEndsMs).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Transparent pool probabilities */}
                {dropData.stock?.poolItems && dropData.stock.poolItems.length > 0 && (() => {
                  // Sort by rarity rank (Legendary first) then by probability descending
                  const sortedPool = [...dropData.stock.poolItems].sort((a, b) => {
                    const rankA = RARITY_WEIGHT_ORDER[a.rarity?.toUpperCase()] ?? 1;
                    const rankB = RARITY_WEIGHT_ORDER[b.rarity?.toUpperCase()] ?? 1;
                    if (rankB !== rankA) return rankB - rankA;
                    return b.probabilityPercent - a.probabilityPercent;
                  });

                  const filteredPool =
                    poolRarityFilter === "ALL"
                      ? sortedPool
                      : sortedPool.filter(
                          (item) => item.rarity?.toUpperCase() === poolRarityFilter
                        );

                  const legendaryCount = sortedPool.filter(
                    (p) => p.rarity?.toUpperCase() === "LEGENDARY"
                  ).length;
                  const epicCount = sortedPool.filter(
                    (p) => p.rarity?.toUpperCase() === "EPIC"
                  ).length;
                  const rareCount = sortedPool.filter(
                    (p) => p.rarity?.toUpperCase() === "RARE"
                  ).length;
                  const uncommonCount = sortedPool.filter(
                    (p) => p.rarity?.toUpperCase() === "UNCOMMON"
                  ).length;
                  const commonCount = sortedPool.filter(
                    (p) => p.rarity?.toUpperCase() === "COMMON"
                  ).length;

                  return (
                    <div className="space-y-3 pt-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h5 className="text-xs font-bold tracking-wider text-white uppercase flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                            Drop Pool Probability Distribution ({sortedPool.length} Traits)
                          </h5>
                          <p className="text-[11px] text-gray-400">
                            Transparent RNG weights sorted by rarity tier
                          </p>
                        </div>
                        {dropData.stock && (
                          <div className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/60 px-2.5 py-1 text-[11px] font-mono">
                            <span className="text-gray-400">Pool Stock:</span>
                            <span className="font-bold text-emerald-400">
                              {dropData.stock.totalRemaining} / {dropData.stock.totalAllocated}
                            </span>
                            <div className="h-1.5 w-16 rounded-full bg-gray-950 overflow-hidden border border-gray-800 ml-1">
                              <div
                                className="h-full bg-emerald-400 transition-all duration-500"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Math.round(
                                      (dropData.stock.totalRemaining /
                                        Math.max(1, dropData.stock.totalAllocated)) *
                                        100,
                                    ),
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setPoolRarityFilter("ALL")}
                            className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                              poolRarityFilter === "ALL"
                                ? "bg-gray-800 text-white border border-gray-700"
                                : "text-gray-400 hover:text-gray-200"
                            }`}
                          >
                            All ({sortedPool.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setPoolRarityFilter("LEGENDARY")}
                            className={`rounded px-2 py-0.5 text-[10px] font-bold transition-colors ${
                              poolRarityFilter === "LEGENDARY"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/50"
                                : "text-amber-400/70 hover:text-amber-300"
                            }`}
                          >
                            ★ Legendary ({legendaryCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => setPoolRarityFilter("EPIC")}
                            className={`rounded px-2 py-0.5 text-[10px] font-bold transition-colors ${
                              poolRarityFilter === "EPIC"
                                ? "bg-purple-500/20 text-purple-300 border border-purple-500/50"
                                : "text-purple-400/70 hover:text-purple-300"
                            }`}
                          >
                            Epic ({epicCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => setPoolRarityFilter("RARE")}
                            className={`rounded px-2 py-0.5 text-[10px] font-bold transition-colors ${
                              poolRarityFilter === "RARE"
                                ? "bg-sky-500/20 text-sky-300 border border-sky-500/50"
                                : "text-sky-400/70 hover:text-sky-300"
                            }`}
                          >
                            Rare ({rareCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => setPoolRarityFilter("UNCOMMON")}
                            className={`rounded px-2 py-0.5 text-[10px] font-bold transition-colors ${
                              poolRarityFilter === "UNCOMMON"
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50"
                                : "text-emerald-400/70 hover:text-emerald-300"
                            }`}
                          >
                            Uncommon ({uncommonCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => setPoolRarityFilter("COMMON")}
                            className={`rounded px-2 py-0.5 text-[10px] font-bold transition-colors ${
                              poolRarityFilter === "COMMON"
                                ? "bg-gray-800 text-gray-300 border border-gray-700"
                                : "text-gray-400 hover:text-gray-200"
                            }`}
                          >
                            Common ({commonCount})
                          </button>
                        </div>

                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                        {filteredPool.map((item) => {
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
                                  className={`relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border bg-[#0a0d14] flex items-center justify-center ${
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
                                <div className="flex-1 min-w-0">
                                  <p
                                    className="truncate text-xs font-bold text-white tracking-wide"
                                    title={item.traitName}
                                  >
                                    {item.traitName}
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="rounded bg-gray-900/80 px-1.5 py-0.5 text-[8px] font-mono text-gray-400 uppercase border border-gray-800">
                                      {item.category}
                                    </span>
                                    <span
                                      className={`rounded px-1.5 py-0.5 text-[8px] font-bold uppercase border ${theme.badgeBg} ${theme.badgeBorder} ${theme.badgeText}`}
                                    >
                                      {theme.prefix}
                                      {rarity}
                                    </span>
                                  </div>
                                </div>

                                {/* Probability */}
                                <div className="text-right shrink-0">
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
                                    Math.round(
                                      (item.remainingStock / allocated) * 100,
                                    ),
                                  ),
                                );
                                const isLowStock =
                                  item.remainingStock > 0 &&
                                  (stockPercent <= 20 || item.remainingStock <= 2);

                                return (
                                  <div className="mt-2.5 pt-1.5 border-t border-gray-800/60">
                                    <div className="flex items-center justify-between text-[9px] font-mono mb-1">
                                      <span className="flex items-center gap-1">
                                        {isLowStock && (
                                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />
                                        )}
                                        <span
                                          className={
                                            isLowStock
                                              ? "text-rose-400 font-bold"
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
                                    <div className="h-1.5 w-full rounded-full bg-gray-950/80 border border-gray-800/80 overflow-hidden">
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
                  );
                })()}

                {claimMessage && (
                  <p className="flex items-center gap-2 rounded border border-emerald-800/40 bg-emerald-950/30 p-2.5 text-xs text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{claimMessage}</span>
                  </p>
                )}
                {claimError && !isAlreadyClaimed && (
                  <p className="rounded border border-rose-800/40 bg-rose-950/30 p-2.5 text-xs text-rose-400">
                    {claimError}
                  </p>
                )}
                {isAlreadyClaimed && !claimMessage && (
                  <div className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/50 p-2.5 text-xs text-gray-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span>
                      You have already claimed your 1 trait allocation for Period #{dropData.period.periodIndex}. Next drop cycle begins in {formatRemaining(nextDropRemainingMs)}.
                    </span>
                  </div>
                )}

                <Button
                  variant={isAlreadyClaimed ? "outline" : "primary"}
                  className={`w-full font-medium sm:w-auto ${
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
                    "Claiming..."
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
            ) : (
              <p className="text-sm text-gray-400">
                No active drop event currently in progress. Cycles renew on UTC schedule.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Gifts & Referral Section */}
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
