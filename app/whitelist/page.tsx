"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Clock,
  Flame,
  CheckCircle2,
  XCircle,
  Sparkles,
  AlertCircle,
  Send,
  RefreshCw,
  ExternalLink,
  Info,
  Heart,
  Repeat,
  MessageSquare,
  ArrowRight,
  Link2,
} from "lucide-react";

function XLogo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 23.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
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
  type WhitelistStatusResponse,
  type WLSlotReviewStatus,
} from "@/lib/whitelist/client";
import {
  fetchActiveTasks,
  submitTaskEvidence,
  type ActiveCampaignItem,
  type ActiveCampaignTask,
} from "@/lib/tasks/client";

const CATEGORY_THEMES: Record<
  string,
  { heldClass: string; unheldClass: string; checkColor: string }
> = {
  BG: {
    heldClass: "border-sky-500/40 bg-sky-500/10 text-sky-300",
    unheldClass: "border-gray-800 bg-gray-900/40 text-gray-500",
    checkColor: "text-sky-400",
  },
  FUR: {
    heldClass: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    unheldClass: "border-gray-800 bg-gray-900/40 text-gray-500",
    checkColor: "text-amber-400",
  },
  CLOTHING: {
    heldClass: "border-violet-500/40 bg-violet-500/10 text-violet-300",
    unheldClass: "border-gray-800 bg-gray-900/40 text-gray-500",
    checkColor: "text-violet-400",
  },
  HEADWEAR: {
    heldClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    unheldClass: "border-gray-800 bg-gray-900/40 text-gray-500",
    checkColor: "text-emerald-400",
  },
  EYEWEAR: {
    heldClass: "border-teal-500/40 bg-teal-500/10 text-teal-300",
    unheldClass: "border-gray-800 bg-gray-900/40 text-gray-500",
    checkColor: "text-teal-400",
  },
};

export default function WhitelistPage() {
  const {
    status,
    sessionAddress,
    walletAddress,
    error: authError,
    busyMessage,
    login,
    dismissError,
  } = useSiweAuth();
  const address = sessionAddress || walletAddress;
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusResult, setStatusResult] = useState<WhitelistStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

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

  // Social Task UX: Open before verify & 10s countdown (scoped per wallet address)
  const [openedTasks, setOpenedTasks] = useState<Record<string, boolean>>({});
  const [countdownTasks, setCountdownTasks] = useState<Record<string, number>>({});

  // Reset or load wallet-scoped opened tasks whenever address changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        // Clear old global un-scoped key to prevent leakage across accounts
        sessionStorage.removeItem("chimphood_opened_tasks");
      } catch {}
    }

    setEvidenceInputs({});
    setTaskErrors({});
    setTaskSuccess({});
    setCountdownTasks({});

    if (!address) {
      setOpenedTasks({});
      return;
    }

    if (typeof window !== "undefined") {
      try {
        const key = `chimphood_opened_tasks_${address.toLowerCase()}`;
        const saved = sessionStorage.getItem(key);
        setOpenedTasks(saved ? JSON.parse(saved) : {});
      } catch {
        setOpenedTasks({});
      }
    } else {
      setOpenedTasks({});
    }
  }, [address]);

  const markTaskOpened = (taskId: string) => {
    setOpenedTasks((prev) => {
      const next = { ...prev, [taskId]: true };
      if (typeof window !== "undefined" && address) {
        try {
          sessionStorage.setItem(
            `chimphood_opened_tasks_${address.toLowerCase()}`,
            JSON.stringify(next)
          );
        } catch {}
      }
      return next;
    });
  };

  function isSocialProofTask(task: ActiveCampaignTask): boolean {
    const t = (task.taskType || "").toUpperCase();
    const code = (task.taskCode || "").toUpperCase();
    const title = (task.title || "").toUpperCase();

    return (
      t === "SOCIAL_X_REPLY" ||
      t === "SOCIAL_X_QUOTE" ||
      code.includes("REPLY") ||
      code.includes("QUOTE") ||
      code.includes("COMMENT") ||
      title.includes("REPLY") ||
      title.includes("QUOTE") ||
      title.includes("COMMENT")
    );
  }

  function isSocialTask(task: ActiveCampaignTask): boolean {
    const t = (task.taskType || "").toUpperCase();
    return t.startsWith("SOCIAL_X_") || isSocialProofTask(task);
  }

  function getTaskDestinationUrl(task: ActiveCampaignTask): string {
    const metaUrl = (task.requirementMetadata?.tweetUrl as string)?.trim();
    if (metaUrl && (metaUrl.startsWith("http://") || metaUrl.startsWith("https://"))) {
      return metaUrl;
    }
    return "https://x.com/chimphoodNFT";
  }

  function getTaskTypeMeta(task: ActiveCampaignTask): { label: string; icon: React.ReactNode } {
    const t = (task.taskType || "").toUpperCase();
    const code = (task.taskCode || "").toUpperCase();
    const title = (task.title || "").toUpperCase();

    // 1. Exact taskType matches first
    if (t === "SOCIAL_X_REPLY") {
      return {
        label: "REPLY / ONCE",
        icon: <MessageSquare className="h-4 w-4 text-sky-400" />,
      };
    }
    if (t === "SOCIAL_X_QUOTE") {
      return {
        label: "QUOTE / ONCE",
        icon: <MessageSquare className="h-4 w-4 text-purple-400" />,
      };
    }
    if (t === "SOCIAL_X_LIKE") {
      return {
        label: "LIKE / ONCE",
        icon: <Heart className="h-4 w-4 text-rose-400" />,
      };
    }
    if (t === "SOCIAL_X_REPOST") {
      return {
        label: "REPOST / ONCE",
        icon: <Repeat className="h-4 w-4 text-emerald-400" />,
      };
    }
    if (t === "SOCIAL_X_FOLLOW") {
      // If user typed REPLY / QUOTE in the title/code, respect that over default FOLLOW
      if (code.includes("REPLY") || title.includes("REPLY")) {
        return {
          label: "REPLY / ONCE",
          icon: <MessageSquare className="h-4 w-4 text-sky-400" />,
        };
      }
      if (code.includes("QUOTE") || title.includes("QUOTE")) {
        return {
          label: "QUOTE / ONCE",
          icon: <MessageSquare className="h-4 w-4 text-purple-400" />,
        };
      }
      return {
        label: "FOLLOW / ONCE",
        icon: <XLogo className="h-4 w-4 text-white" />,
      };
    }

    // 2. Fallbacks based on code or title
    if (code.includes("REPLY") || title.includes("REPLY")) {
      return {
        label: "REPLY / ONCE",
        icon: <MessageSquare className="h-4 w-4 text-sky-400" />,
      };
    }
    if (code.includes("QUOTE") || title.includes("QUOTE")) {
      return {
        label: "QUOTE / ONCE",
        icon: <MessageSquare className="h-4 w-4 text-purple-400" />,
      };
    }
    if (code.includes("COMMENT") || title.includes("COMMENT")) {
      return {
        label: "COMMENT / ONCE",
        icon: <MessageSquare className="h-4 w-4 text-sky-400" />,
      };
    }
    if (code.includes("REPOST") || code.includes("RETWEET") || title.includes("REPOST")) {
      return {
        label: "REPOST / ONCE",
        icon: <Repeat className="h-4 w-4 text-emerald-400" />,
      };
    }
    if (code.includes("LIKE") || title.includes("LIKE")) {
      return {
        label: "LIKE / ONCE",
        icon: <Heart className="h-4 w-4 text-rose-400" />,
      };
    }
    if (code.includes("FOLLOW") || title.includes("FOLLOW")) {
      return {
        label: "FOLLOW / ONCE",
        icon: <XLogo className="h-4 w-4 text-white" />,
      };
    }

    return {
      label: "SOCIAL / ONCE",
      icon: <XLogo className="h-4 w-4 text-white" />,
    };
  }

  async function handleSocialVerify(task: ActiveCampaignTask) {
    if (status !== "authenticated") {
      login();
      return;
    }

    const isProofRequired = isSocialProofTask(task);
    const enteredUrl = (evidenceInputs[task.id]?.payload || "").trim();

    if (isProofRequired) {
      if (!enteredUrl) {
        setTaskErrors((prev) => ({
          ...prev,
          [task.id]: "Please paste your reply or quote link first.",
        }));
        return;
      }
      if (!enteredUrl.startsWith("http://") && !enteredUrl.startsWith("https://")) {
        setTaskErrors((prev) => ({
          ...prev,
          [task.id]: "URL must start with http:// or https://",
        }));
        return;
      }
    }

    // Set countdown to 10s
    setCountdownTasks((prev) => ({ ...prev, [task.id]: 10 }));
    setTaskErrors((prev) => ({ ...prev, [task.id]: null }));
    setTaskSuccess((prev) => ({ ...prev, [task.id]: null }));

    let remaining = 10;
    const interval = setInterval(async () => {
      remaining -= 1;
      if (remaining > 0) {
        setCountdownTasks((prev) => ({ ...prev, [task.id]: remaining }));
      } else {
        clearInterval(interval);
        setCountdownTasks((prev) => {
          const next = { ...prev };
          delete next[task.id];
          return next;
        });

        setSubmittingTaskId(task.id);
        try {
          const destinationUrl = getTaskDestinationUrl(task);
          const userHandle = statusResult?.status?.details?.xUsername;
          const defaultPayload = userHandle ? `https://x.com/${userHandle}` : destinationUrl;
          const payload = isProofRequired ? enteredUrl : defaultPayload;

          await submitTaskEvidence(task.id, {
            submissionType: "URL",
            payload,
            autoApprove: true,
          });

          setTaskSuccess((prev) => ({
            ...prev,
            [task.id]: "Task verified & completed! +PTS awarded.",
          }));

          await loadTasks();

          if (address) {
            fetchWhitelistStatus(address).then(setStatusResult).catch(console.error);
          }
        } catch (err: unknown) {
          setTaskErrors((prev) => ({
            ...prev,
            [task.id]: (err as Error).message || "Failed to verify task.",
          }));
        } finally {
          setSubmittingTaskId(null);
        }
      }
    }, 1000);
  }

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
      setStatusLoading(true);
      setStatusError(null);
      fetchWhitelistStatus(address)
        .then((data) => {
          if (isMounted) setStatusResult(data);
        })
        .catch((err) => {
          if (isMounted)
            setStatusError((err as Error).message || "Failed to check status.");
        })
        .finally(() => {
          if (isMounted) setStatusLoading(false);
        });
      return () => {
        isMounted = false;
      };
    } else {
      setStatusResult(null);
      setStatusLoading(false);
    }
  }, [status, address]);

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

  function getGtdReviewDetails(reviewStatus?: WLSlotReviewStatus) {
    switch (reviewStatus) {
      case "VALID":
        return {
          label: "Verified",
          subtext: "Verified — All criteria confirmed by team.",
          badgeVariant: "default" as const,
          colorClass: "border-emerald-500/30 bg-emerald-500/20 text-emerald-300",
          icon: CheckCircle2,
        };
      case "UNDER_REVIEW":
        return {
          label: "Under Verification",
          subtext: "Under Verification — Account details being audited.",
          badgeVariant: "warning" as const,
          colorClass: "border-amber-500/30 bg-amber-500/20 text-amber-300",
          icon: Clock,
        };
      case "FLAGGED":
        return {
          label: "Notice / Action Required",
          subtext:
            "Notice — Please review your linked accounts and task requirements. Slot remains active.",
          badgeVariant: "warning" as const,
          colorClass: "border-rose-500/30 bg-rose-500/20 text-rose-300",
          icon: AlertCircle,
        };
      case "NOT_REVIEWED":
      default:
        return {
          label: "Pending Routine Review",
          subtext: "Slot Confirmed — Routine verification in progress.",
          badgeVariant: "outline" as const,
          colorClass: "border-blue-500/30 bg-blue-500/10 text-blue-300",
          icon: Info,
        };
    }
  }

  function formatRegistrationDate(dateString?: string): string {
    if (!dateString) return "";
    try {
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return dateString;
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateString;
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
      task.latestSubmission?.status === "PENDING_REVIEW" ||
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
        {/* Whitelist Status & Allocation */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Whitelist Status & Allocation</CardTitle>
                <CardDescription>
                  Real-time qualification status and allocation progress for your wallet
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {status !== "authenticated" ? (
              <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-6 text-center text-sm text-gray-400 space-y-4">
                <div>
                  <p className="font-medium text-gray-300">Wallet Not Authenticated</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Connect your Web3 wallet via Sign in with Ethereum (SIWE) above to view your real-time Whitelist allocation status and trait checklist.
                  </p>
                </div>

                <div className="flex flex-col items-center justify-center gap-2">
                  {status === "wallet-only" ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void login?.()}
                      className="w-full sm:w-auto"
                    >
                      Sign In with Ethereum
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void login?.()}
                      disabled={status === "signing"}
                      className="w-full sm:w-auto"
                    >
                      Connect Wallet
                    </Button>
                  )}

                  {status === "signing" && (
                    <div className="mt-1 flex items-center gap-2 text-xs text-emerald-400">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>{busyMessage ?? "Processing authentication…"}</span>
                    </div>
                  )}

                  {authError && status !== "signing" && (
                    <div className="mt-2 flex w-full max-w-md items-center justify-between gap-2 rounded border border-rose-500/20 bg-rose-500/10 p-2 text-xs text-rose-300">
                      <div className="flex items-center gap-1.5 truncate">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                        <span className="truncate">{authError}</span>
                      </div>
                      {dismissError && (
                        <button
                          onClick={dismissError}
                          className="shrink-0 text-[11px] text-rose-400 underline hover:text-rose-200"
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : statusLoading && !statusResult ? (
              <div className="py-8 text-center text-sm text-gray-400">
                Loading your Whitelist status...
              </div>
            ) : statusError ? (
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-4 text-xs text-rose-400">
                {statusError}
              </div>
            ) : statusResult?.status ? (
              <div className="space-y-4 rounded-lg border border-gray-800 bg-gray-900/60 p-4">
                {/* Header status bar */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-gray-800/80 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-300">Phase:</span>

                    {/* GTD Slot Holder */}
                    {statusResult.status.phase === "SLOT_ALLOCATED" && (
                      <>
                        <Badge
                          variant="default"
                          className="border-emerald-500/30 bg-emerald-500/20 text-emerald-300 font-semibold"
                        >
                          GTD SLOT ALLOCATED
                        </Badge>
                        <Badge
                          variant="default"
                          className="border-emerald-500/30 bg-emerald-500/20 text-emerald-300 font-semibold"
                        >
                          Guaranteed Slot #{statusResult.status.slotNumber} (Active)
                        </Badge>
                      </>
                    )}

                    {/* FCFS Directory Participant */}
                    {statusResult.status.phase === "FCFS_REGISTERED" && (
                      <>
                        {statusResult.status.isFullyQualified && (
                          <Badge
                            variant="default"
                            className="border-emerald-500/30 bg-emerald-500/20 text-emerald-300 font-semibold"
                          >
                            FCFS Qualified
                          </Badge>
                        )}
                        <Badge
                          variant="default"
                          className="border-blue-500/30 bg-blue-500/20 text-blue-300 font-semibold"
                        >
                          FCFS Directory (Registered)
                        </Badge>
                      </>
                    )}

                    {/* Revoked User (Terminal Disqualification per DEC-022) */}
                    {statusResult.status.phase === "REVOKED" && (
                      <Badge
                        variant="outline"
                        className="border-rose-500/40 bg-rose-500/20 text-rose-300 font-semibold"
                      >
                        REVOKED
                      </Badge>
                    )}

                    {/* Legacy QUALIFIED without slot (if any) */}
                    {statusResult.status.phase === "QUALIFIED" && (
                      <Badge
                        variant="default"
                        className="border-emerald-500/30 bg-emerald-500/20 text-emerald-300 font-semibold"
                      >
                        QUALIFIED
                      </Badge>
                    )}

                    {/* Ineligible / Not Registered / Incomplete */}
                    {statusResult.status.phase === "NONE" && (
                      <>
                        <Badge variant="outline" className="border-gray-700 text-gray-400">
                          Incomplete
                        </Badge>
                        <Badge variant="outline" className="text-gray-400">
                          Not Registered / Ineligible
                        </Badge>
                      </>
                    )}
                  </div>

                  {statusResult.program && (
                    <span className="text-xs text-gray-400 font-mono">
                      GTD Allocation: {statusResult.program.allocatedSlotsCount.toLocaleString()} /{" "}
                      {statusResult.program.totalSlots.toLocaleString()} Slots
                    </span>
                  )}
                </div>

                {/* 1. SLOT_ALLOCATED Details & GTD Review Sub-indicator (DEC-015) */}
                {statusResult.status.phase === "SLOT_ALLOCATED" && (() => {
                  const review = getGtdReviewDetails(statusResult.status.reviewStatus);
                  const ReviewIcon = review.icon;
                  return (
                    <div className="space-y-3">
                      <div className="flex flex-col gap-2 rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                              Review Status:
                            </span>
                            <Badge
                              variant={review.badgeVariant}
                              className={`text-xs ${review.colorClass}`}
                            >
                              <ReviewIcon className="mr-1 h-3 w-3 shrink-0" />
                              {review.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-300">{review.subtext}</p>
                        </div>
                        {statusResult.status.allocatedAt && (
                          <span className="text-[11px] text-gray-500">
                            Secured on {formatRegistrationDate(statusResult.status.allocatedAt)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">
                        Your Guaranteed Whitelist slot is locked and active. Make sure your connected wallet and linked X account remain connected.
                      </p>
                    </div>
                  );
                })()}

                {/* 2. FCFS_REGISTERED Details (DEC-013, DEC-017, DEC-018) */}
                {statusResult.status.phase === "FCFS_REGISTERED" && (
                  <div className="space-y-3">
                    {/* Registration sequence and timestamp */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
                      <span className="font-semibold text-white">
                        Participant #{statusResult.status.queueNumber}
                      </span>
                      {statusResult.status.joinedAt && (
                        <>
                          <span className="text-gray-600">•</span>
                          <span className="text-gray-400">
                            Registered on {formatRegistrationDate(statusResult.status.joinedAt)}
                          </span>
                        </>
                      )}
                    </div>

                    {/* OpenSea FCFS Allowlist Eligibility Banner */}
                    {statusResult.status.isFullyQualified ? (
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                        <div className="flex items-center gap-2 font-semibold text-emerald-200">
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                          Eligible for OpenSea FCFS Allowlist
                        </div>
                        <p className="mt-1 text-emerald-300/80">
                          All 5 qualification requirements are satisfied! Your wallet will be included in the OpenSea FCFS allowlist export.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                        <div className="flex items-center gap-2 font-semibold text-amber-200">
                          <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
                          Action Required — Incomplete Requirements
                        </div>
                        <p className="mt-1 text-amber-300/80">
                          You are registered in the directory, but must satisfy all 5 requirements below to be included in the OpenSea FCFS allowlist export.
                        </p>
                      </div>
                    )}

                    {/* Clear Explanatory Notice (DEC-018) */}
                    <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 text-xs text-gray-400">
                      <p className="font-medium text-gray-300">FCFS Directory Notice</p>
                      <p className="mt-0.5 text-gray-400">
                        Registration is for the OpenSea FCFS allowlist minting stage and does NOT guarantee a Guaranteed (GTD) slot or an allocation. GTD slots are never automatically filled.
                      </p>
                    </div>
                  </div>
                )}

                {/* 3. REVOKED Full Disqualification Alert (DEC-022) */}
                {statusResult.status.phase === "REVOKED" && (
                  <div className="space-y-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-200">
                    <div className="flex items-center gap-2 text-sm font-semibold text-rose-300">
                      <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
                      Whitelist Status Revoked
                    </div>
                    <p className="text-rose-200/90 font-medium">
                      {statusResult.status.missingRequirements[0] ||
                        "Whitelist qualification has been revoked by an administrator."}
                    </p>
                    <div className="border-t border-rose-500/20 pt-2 text-rose-300/80 space-y-1">
                      <p>
                        In accordance with ChimpHood program policies (DEC-022), slot revocation results in full disqualification from this Whitelist program.
                      </p>
                      <p className="text-rose-400/90">
                        Revoked participants are not eligible for Guaranteed (GTD) slots and are excluded from the OpenSea FCFS allowlist export.
                      </p>
                    </div>
                  </div>
                )}

                {/* 4. NONE (Ineligible / Not Registered) */}
                {statusResult.status.phase === "NONE" && (
                  <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 text-xs text-gray-400">
                    <p className="font-medium text-gray-300">Not Registered</p>
                    <p className="mt-0.5 text-gray-400">
                      Connect your EVM wallet and X (Twitter) account to automatically register in the FCFS Directory, and complete the 5 trait categories and mandatory tasks to qualify.
                    </p>
                  </div>
                )}

                {/* Checklist & Verification Section (Hidden when REVOKED) */}
                {statusResult.status.phase !== "REVOKED" && (
                  <>
                    {/* Linked Identities Status */}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">
                      <div
                        className={`flex items-center justify-between rounded border p-2.5 ${
                          statusResult.status.details?.hasVerifiedWallet
                            ? "border-emerald-800/40 bg-emerald-950/20 text-emerald-300"
                            : "border-gray-800 bg-gray-800/20 text-gray-500"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {statusResult.status.details?.hasVerifiedWallet ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 shrink-0 text-gray-600" />
                          )}
                          <span>EVM Wallet</span>
                        </div>
                        <span className="font-mono text-[11px] text-gray-400">
                          {statusResult.status.details?.hasVerifiedWallet
                            ? "Verified"
                            : "Required"}
                        </span>
                      </div>

                      <div
                        className={`flex flex-col gap-2 rounded border p-2.5 sm:flex-row sm:items-center sm:justify-between ${
                          statusResult.status.details?.hasLinkedX
                            ? "border-emerald-800/40 bg-emerald-950/20 text-emerald-300"
                            : "border-gray-800 bg-gray-800/20 text-gray-500"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {statusResult.status.details?.hasLinkedX ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 shrink-0 text-gray-600" />
                          )}
                          <span>X (Twitter) Identity</span>
                        </div>
                        {statusResult.status.details?.hasLinkedX ? (
                          <span className="font-mono text-[11px] text-gray-400">
                            {statusResult.status.details.xUsername
                              ? `@${statusResult.status.details.xUsername}`
                              : "Linked"}
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-gray-400">Required</span>
                            <Link href="/profile">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-[10px] border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                              >
                                Connect X on Profile
                                <ExternalLink className="ml-1 h-2.5 w-2.5" />
                              </Button>
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 5-Category Trait Checklist */}
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                          Required Trait Categories (5 of 5)
                        </h4>
                        <span className="text-[11px] text-gray-500">
                          {statusResult.status.details?.heldCategories?.length ?? 0} / 5 Collected
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                        {["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"].map((cat, idx) => {
                          const isHeld =
                            statusResult.status?.details?.heldCategories?.includes(cat);
                          const theme = CATEGORY_THEMES[cat];
                          return (
                            <div
                              key={cat}
                              className={`flex items-center gap-1.5 rounded border p-2 transition-colors ${
                                idx === 4 ? "col-span-2 sm:col-span-1" : ""
                              } ${
                                isHeld ? theme.heldClass : theme.unheldClass
                              }`}
                            >
                              {isHeld ? (
                                <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${theme.checkColor}`} />
                              ) : (
                                <XCircle className="h-3.5 w-3.5 shrink-0 text-gray-600" />
                              )}
                              <span className="font-semibold">{cat}</span>
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
                    {statusResult.status.missingRequirements.length > 0 &&
                      !statusResult.status.isFullyQualified &&
                      statusResult.status.phase !== "SLOT_ALLOCATED" && (
                        <div className="space-y-1 rounded border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300">
                          <p className="font-semibold">Missing Requirements:</p>
                          <ul className="list-inside list-disc space-y-0.5 text-amber-200/80">
                            {statusResult.status.missingRequirements.map((req, i) => (
                              <li key={i}>{req}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </>
                )}
              </div>
            ) : null}
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
                  <div>
                    {campaign.tasks.length === 0 ? (
                      <p className="text-xs text-gray-500">
                        No tasks configured for this campaign.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {campaign.tasks.map((task) => {
                          const taskStatus = getTaskStatus(task);
                          const isSubmitting = submittingTaskId === task.id;
                          const isSocial = isSocialTask(task);
                          const destinationUrl = getTaskDestinationUrl(task);
                          const taskMeta = getTaskTypeMeta(task);
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

                          if (isSocial) {
                            const isProofRequired = isSocialProofTask(task);
                            const isTaskOpened = Boolean(openedTasks[task.id]);
                            const countdownSeconds = countdownTasks[task.id];
                            const isCountingDown =
                              typeof countdownSeconds === "number" && countdownSeconds > 0;

                            return (
                              <div
                                key={task.id}
                                className="flex flex-col justify-between gap-4 rounded-xl border border-gray-800 bg-[#0c0e17] p-4 sm:p-5 transition-all hover:border-gray-700/80 hover:shadow-lg hover:shadow-emerald-950/20 md:flex-row md:items-center"
                              >
                                {/* Left: Icon + Type & Badges + Title & Description */}
                                <div className="flex min-w-0 flex-1 items-start gap-3.5">
                                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 mt-0.5">
                                    {taskMeta.icon}
                                  </div>
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h4 className="text-sm font-bold text-white sm:text-base">
                                        {task.title}
                                      </h4>
                                      <span className="font-mono text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                                        {taskMeta.label}
                                      </span>
                                      {task.isRequired ? (
                                        <Badge
                                          variant="default"
                                          className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-300"
                                        >
                                          Mandatory
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-[10px] text-gray-400">
                                          Optional
                                        </Badge>
                                      )}
                                      <span className="font-mono text-xs font-bold text-emerald-400">
                                        +{task.points} PTS
                                      </span>
                                    </div>
                                    {task.description && (
                                      <p className="text-xs text-gray-400 line-clamp-2 md:line-clamp-1">
                                        {task.description}
                                      </p>
                                    )}

                                    {/* Proof Link Input: Shown for Reply / Quote tasks once opened */}
                                    {isProofRequired && isTaskOpened && taskStatus.key !== "APPROVED" && (
                                      <div className="pt-2 max-w-md">
                                        <div className="relative">
                                          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
                                          <input
                                            type="url"
                                            placeholder="Paste reply or quote URL (https://x.com/...)"
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
                                            disabled={isCountingDown || isSubmitting}
                                            className="w-full rounded-lg border border-gray-700 bg-gray-900/90 pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                                          />
                                        </div>
                                      </div>
                                    )}

                                    {/* Submitted Proof Display for Approved Tasks */}
                                    {isProofRequired && taskStatus.key === "APPROVED" && task.latestSubmission?.payload && (
                                      <p className="pt-1 text-[11px] text-gray-400 font-mono truncate">
                                        Proof: <span className="text-gray-300">{task.latestSubmission.payload}</span>
                                      </p>
                                    )}

                                    {/* Rejection alert box */}
                                    {taskStatus.key === "REJECTED" && (
                                      <div className="mt-2 rounded border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-300">
                                        <span className="font-semibold text-rose-400">Rejected: </span>
                                        <span className="text-rose-200">
                                          {task.latestSubmission?.reviewerNotes ||
                                            "Submission was not approved. You can retry."}
                                        </span>
                                      </div>
                                    )}

                                    {errorMsg && (
                                      <p className="pt-1 text-[11px] text-rose-400">{errorMsg}</p>
                                    )}
                                    {successMsg && (
                                      <p className="pt-1 text-[11px] text-emerald-400">{successMsg}</p>
                                    )}
                                  </div>
                                </div>

                                {/* Right: Status badge & Action Buttons in a horizontal row */}
                                <div className="flex flex-wrap items-center gap-2.5 shrink-0 pt-2 border-t border-gray-800/80 md:border-t-0 md:pt-0">
                                  {/* Task Status Badge */}
                                  <Badge
                                    variant={taskStatus.badgeVariant}
                                    className={`text-xs px-2.5 py-1 ${taskStatus.colorClass}`}
                                  >
                                    {taskStatus.key === "APPROVED" && (
                                      <CheckCircle2 className="mr-1 h-3.5 w-3.5 shrink-0" />
                                    )}
                                    {taskStatus.key === "PENDING" && (
                                      <Clock className="mr-1 h-3.5 w-3.5 shrink-0" />
                                    )}
                                    {taskStatus.key === "REJECTED" && (
                                      <XCircle className="mr-1 h-3.5 w-3.5 shrink-0" />
                                    )}
                                    {taskStatus.key === "NOT_SUBMITTED" && (
                                      <AlertCircle className="mr-1 h-3.5 w-3.5 shrink-0" />
                                    )}
                                    {taskStatus.key === "APPROVED" ? "Done" : taskStatus.label}
                                  </Badge>

                                  {/* 1. Target URL Button: OPEN X -> */}
                                  <a
                                    href={destinationUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => markTaskOpened(task.id)}
                                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800/80 px-3.5 py-1.5 text-xs font-semibold text-white transition-all hover:border-gray-500 hover:bg-gray-700 active:scale-[0.98]"
                                  >
                                    <span>OPEN X</span>
                                    <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
                                  </a>

                                  {/* 2. Verification Action Button */}
                                  {taskStatus.key === "APPROVED" ? (
                                    <button
                                      disabled
                                      className="inline-flex cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-300"
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                      <span>DONE</span>
                                    </button>
                                  ) : isCountingDown ? (
                                    <button
                                      disabled
                                      className="inline-flex cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/20 px-3.5 py-1.5 text-xs font-semibold text-amber-300 animate-pulse"
                                    >
                                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-400" />
                                      <span>VERIFYING ({countdownSeconds}s)...</span>
                                    </button>
                                  ) : !isTaskOpened ? (
                                    <button
                                      disabled
                                      title="Please click 'OPEN X' first"
                                      className="inline-flex cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-gray-800 bg-gray-900/40 px-3.5 py-1.5 text-xs font-semibold text-gray-500 opacity-60"
                                    >
                                      <span>VERIFY TASK</span>
                                      <ArrowRight className="h-3.5 w-3.5 text-gray-600" />
                                    </button>
                                  ) : isProofRequired && !taskInput.payload.trim() ? (
                                    <button
                                      disabled
                                      title="Paste your reply or quote link first"
                                      className="inline-flex cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-gray-800 bg-gray-900/40 px-3.5 py-1.5 text-xs font-semibold text-gray-500 opacity-60"
                                    >
                                      <span>VERIFY TASK</span>
                                      <ArrowRight className="h-3.5 w-3.5 text-gray-600" />
                                    </button>
                                  ) : status !== "authenticated" ? (
                                    <Button
                                      variant="primary"
                                      size="sm"
                                      className="gap-1.5 px-3.5 py-1.5 text-xs font-semibold"
                                      onClick={() => login()}
                                    >
                                      <span>CONNECT WALLET TO VERIFY</span>
                                      <ArrowRight className="h-3.5 w-3.5" />
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="primary"
                                      size="sm"
                                      className="gap-1.5 px-3.5 py-1.5 text-xs font-semibold"
                                      onClick={() => handleSocialVerify(task)}
                                      disabled={isSubmitting || isCountingDown}
                                    >
                                      {isSubmitting ? (
                                        <>
                                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                          <span>COMPLETING...</span>
                                        </>
                                      ) : (
                                        <>
                                          <span>
                                            {taskStatus.key === "REJECTED" ? "RETRY VERIFY" : "VERIFY TASK"}
                                          </span>
                                          <ArrowRight className="h-3.5 w-3.5" />
                                        </>
                                      )}
                                    </Button>
                                  )}
                                </div>
</div>
                            );
                          }

                          return (
                            <div
                              key={task.id}
                              className="space-y-3 rounded-xl border border-gray-800 bg-gray-900/60 p-4 sm:p-5"
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
                      })}
                    </div>
                  )}
                </div>
              </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Trait Lootbox Drops CTA */}
        <Card className="border-emerald-500/20 bg-gradient-to-r from-emerald-950/20 via-gray-900/40 to-[#0c0e17]">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Trait Lootbox Drops</CardTitle>
                  <CardDescription>
                    Collect trait items across all 5 categories in our periodic drops to qualify for Whitelist
                  </CardDescription>
                </div>
              </div>
              <Link href="/drops">
                <Button variant="primary" className="w-full sm:w-auto">
                  Go to Drops
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
