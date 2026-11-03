"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  Check,
  ChevronDown,
  ChevronUp,
  Palette,
} from "lucide-react";

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
import {
  fetchUserInventory,
  type InventoryItemData,
} from "@/lib/inventory/client";
import { UserAvatar } from "@/components/inventory/UserAvatar";
import { shortenAddress } from "@/lib/auth/address";

function XLogo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 23.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const TRAIT_CATEGORIES = ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"] as const;

const CATEGORY_THEMES: Record<
  string,
  { heldClass: string; unheldClass: string; checkColor: string }
> = {
  BG: {
    heldClass: "border-sky-300 bg-sky-50 text-sky-800",
    unheldClass: "border-slate-200 bg-slate-50 text-slate-400",
    checkColor: "text-sky-600",
  },
  FUR: {
    heldClass: "border-amber-300 bg-amber-50 text-amber-800",
    unheldClass: "border-slate-200 bg-slate-50 text-slate-400",
    checkColor: "text-amber-600",
  },
  CLOTHING: {
    heldClass: "border-violet-300 bg-violet-50 text-violet-800",
    unheldClass: "border-slate-200 bg-slate-50 text-slate-400",
    checkColor: "text-violet-600",
  },
  HEADWEAR: {
    heldClass: "border-emerald-300 bg-emerald-50 text-emerald-800",
    unheldClass: "border-slate-200 bg-slate-50 text-slate-400",
    checkColor: "text-emerald-600",
  },
  EYEWEAR: {
    heldClass: "border-teal-300 bg-teal-50 text-teal-800",
    unheldClass: "border-slate-200 bg-slate-50 text-slate-400",
    checkColor: "text-teal-600",
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

  const handleConnectWallet = () => {
    login?.();
  };

  const [statusLoading, setStatusLoading] = useState(false);
  const [statusResult, setStatusResult] = useState<WhitelistStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  // X OAuth Connect direct state
  const [isConnectingX, setIsConnectingX] = useState(false);
  const [xConnectError, setXConnectError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        const err = params.get("x_error") || params.get("error");
        if (err) {
          setXConnectError(
            err === "access_denied"
              ? "Authorization was denied on X. Please try connecting again."
              : `Failed to link X account (${err}). Please try again.`,
          );
        }
      } catch {
        // ignore
      }
    }
  }, []);

  const handleDirectConnectX = async () => {
    if (status !== "authenticated") {
      setXConnectError("Please connect and sign in with your Web3 wallet first.");
      return;
    }

    try {
      setIsConnectingX(true);
      setXConnectError(null);
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem("x_connect_source", "whitelist");
        } catch {
          // ignore
        }
      }

      const res = await fetch("/api/social/x/connect");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to initiate X connection.");
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.message || "X OAuth is not configured in this environment.");
      }
    } catch (err: unknown) {
      setIsConnectingX(false);
      setXConnectError(
        err instanceof Error ? err.message : "Failed to initiate X connection.",
      );
    }
  };

  // Campaigns & Tasks state
  const [campaigns, setCampaigns] = useState<ActiveCampaignItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);

  // Inventory & Trait state
  const [inventoryItems, setInventoryItems] = useState<InventoryItemData[]>([]);
  const [showTasksInViewB, setShowTasksInViewB] = useState(false);

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
        sessionStorage.removeItem("chimphood_opened_tasks");
      } catch {}
    }

    setEvidenceInputs({});
    setTaskErrors({});
    setTaskSuccess({});
    setCountdownTasks({});

    if (!address) {
      setOpenedTasks({});
      setInventoryItems([]);
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

  // Load Inventory for Character & Wardrobe
  useEffect(() => {
    if (address && status === "authenticated") {
      let active = true;
      fetchUserInventory(address)
        .then((res) => {
          if (active && res.items) {
            setInventoryItems(res.items);
          }
        })
        .catch(() => {
          if (active) setInventoryItems([]);
        });
      return () => {
        active = false;
      };
    } else {
      setInventoryItems([]);
    }
  }, [address, status]);

  const markTaskOpened = (taskId: string) => {
    setOpenedTasks((prev) => {
      const next = { ...prev, [taskId]: true };
      if (typeof window !== "undefined" && address) {
        try {
          sessionStorage.setItem(
            `chimphood_opened_tasks_${address.toLowerCase()}`,
            JSON.stringify(next),
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
        icon: <MessageSquare className="h-4 w-4 text-sky-500" />,
      };
    }
    if (t === "SOCIAL_X_QUOTE") {
      return {
        label: "QUOTE / ONCE",
        icon: <MessageSquare className="h-4 w-4 text-purple-500" />,
      };
    }
    if (t === "SOCIAL_X_LIKE") {
      return {
        label: "LIKE / ONCE",
        icon: <Heart className="h-4 w-4 text-rose-500" />,
      };
    }
    if (t === "SOCIAL_X_REPOST") {
      return {
        label: "REPOST / ONCE",
        icon: <Repeat className="h-4 w-4 text-emerald-500" />,
      };
    }
    if (t === "SOCIAL_X_FOLLOW") {
      if (code.includes("REPLY") || title.includes("REPLY")) {
        return {
          label: "REPLY / ONCE",
          icon: <MessageSquare className="h-4 w-4 text-sky-500" />,
        };
      }
      if (code.includes("QUOTE") || title.includes("QUOTE")) {
        return {
          label: "QUOTE / ONCE",
          icon: <MessageSquare className="h-4 w-4 text-purple-500" />,
        };
      }
      return {
        label: "FOLLOW / ONCE",
        icon: <XLogo className="h-4 w-4 text-slate-700" />,
      };
    }

    // 2. Fallbacks based on code or title
    if (code.includes("REPLY") || title.includes("REPLY")) {
      return {
        label: "REPLY / ONCE",
        icon: <MessageSquare className="h-4 w-4 text-sky-500" />,
      };
    }
    if (code.includes("QUOTE") || title.includes("QUOTE")) {
      return {
        label: "QUOTE / ONCE",
        icon: <MessageSquare className="h-4 w-4 text-purple-500" />,
      };
    }
    if (code.includes("COMMENT") || title.includes("COMMENT")) {
      return {
        label: "COMMENT / ONCE",
        icon: <MessageSquare className="h-4 w-4 text-sky-500" />,
      };
    }
    if (code.includes("REPOST") || code.includes("RETWEET") || title.includes("REPOST")) {
      return {
        label: "REPOST / ONCE",
        icon: <Repeat className="h-4 w-4 text-emerald-500" />,
      };
    }
    if (code.includes("LIKE") || title.includes("LIKE")) {
      return {
        label: "LIKE / ONCE",
        icon: <Heart className="h-4 w-4 text-rose-500" />,
      };
    }
    if (code.includes("FOLLOW") || title.includes("FOLLOW")) {
      return {
        label: "FOLLOW / ONCE",
        icon: <XLogo className="h-4 w-4 text-slate-700" />,
      };
    }

    return {
      label: "SOCIAL / ONCE",
      icon: <XLogo className="h-4 w-4 text-slate-700" />,
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

      setEvidenceInputs((prev) => ({
        ...prev,
        [task.id]: { payload: "", submissionType: type },
      }));

      await loadTasks();

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
          colorClass: "border-emerald-300 bg-emerald-50 text-emerald-800",
          icon: CheckCircle2,
        };
      case "UNDER_REVIEW":
        return {
          label: "Under Verification",
          subtext: "Under Verification — Account details being audited.",
          badgeVariant: "warning" as const,
          colorClass: "border-amber-300 bg-amber-50 text-amber-800",
          icon: Clock,
        };
      case "FLAGGED":
        return {
          label: "Notice / Action Required",
          subtext:
            "Notice — Please review your linked accounts and task requirements. Slot remains active.",
          badgeVariant: "warning" as const,
          colorClass: "border-rose-300 bg-rose-50 text-rose-800",
          icon: AlertCircle,
        };
      case "NOT_REVIEWED":
      default:
        return {
          label: "Pending Routine Review",
          subtext: "Slot Confirmed — Routine verification in progress.",
          badgeVariant: "outline" as const,
          colorClass: "border-blue-300 bg-blue-50 text-blue-800",
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
        colorClass: "border-emerald-300 bg-emerald-50 text-emerald-800 font-medium",
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
        colorClass: "border-amber-300 bg-amber-50 text-amber-800 font-medium",
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
        colorClass: "border-rose-300 bg-rose-50 text-rose-800 font-medium",
      };
    }
    return {
      key: "NOT_SUBMITTED",
      label: "Not Submitted",
      badgeVariant: "outline",
      colorClass: "border-slate-300 bg-slate-100 text-slate-600 font-medium",
    };
  }

  // --- Automatic View Transition Logic ---
  const { allMandatoryTasks, areAllMandatoryApproved } = useMemo(() => {
    const allMandatory = campaigns.flatMap((c) => (c.tasks || []).filter((t) => t.isRequired));

    let approved = false;
    if (status === "authenticated") {
      // Disqualified / revoked users are never considered approved for active portal
      if (statusResult?.status?.phase === "REVOKED") {
        approved = false;
      } else if (statusResult?.status?.phase === "SLOT_ALLOCATED") {
        // GTD slot allocated users are verified and approved
        approved = true;
      } else if (
        statusResult?.status?.details &&
        statusResult.status.details.totalMandatoryTasksCount > 0
      ) {
        approved =
          statusResult.status.details.completedMandatoryTasksCount >=
          statusResult.status.details.totalMandatoryTasksCount;
      } else if (allMandatory.length > 0) {
        approved = allMandatory.every((t) => {
          const st = getTaskStatus(t);
          return st.key === "APPROVED";
        });
      }
    }

    return { allMandatoryTasks: allMandatory, areAllMandatoryApproved: approved };
  }, [campaigns, status, statusResult]);

  // Trait calculation from inventory and backend details
  const { heldCategories, duplicateCount } = useMemo(() => {
    const held = new Set<string>();
    if (statusResult?.status?.details?.heldCategories) {
      for (const cat of statusResult.status.details.heldCategories) {
        held.add(cat);
      }
    }
    for (const item of inventoryItems) {
      if (item.trait?.category) {
        held.add(item.trait.category);
      }
    }

    const heldArr = Array.from(held);
    const dupCount = Math.max(0, inventoryItems.length - heldArr.length);

    return {
      heldCategories: heldArr,
      duplicateCount: dupCount,
    };
  }, [statusResult, inventoryItems]);

  // Whitelist qualification status text mapped to the 4 strict requirements
  const qualificationState = useMemo(() => {
    const phase = statusResult?.status?.phase;
    if (phase === "REVOKED") {
      return {
        key: "REVOKED" as const,
        title: "REVOKED",
        badgeClass: "bg-rose-100 text-rose-800 border-rose-300",
      };
    }
    if (phase === "SLOT_ALLOCATED") {
      return {
        key: "Whitelisted" as const,
        title: "Whitelisted",
        badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300",
      };
    }
    if (phase === "IN_QUEUE") {
      return {
        key: "Queued" as const,
        title: "Queued",
        badgeClass: "bg-sky-100 text-sky-800 border-sky-300",
      };
    }
    if (statusResult?.status?.isFullyQualified || phase === "QUALIFIED") {
      return {
        key: "Qualified" as const,
        title: "Qualified",
        badgeClass: "bg-teal-100 text-teal-800 border-teal-300",
      };
    }
    return {
      key: "Incomplete" as const,
      title: "Incomplete",
      badgeClass: "bg-amber-100 text-amber-800 border-amber-300",
    };
  }, [statusResult]);

  // Stepper helper
  const isWalletConnected =
    status === "authenticated" || Boolean(statusResult?.status?.details?.hasVerifiedWallet);
  const isXLinked = Boolean(statusResult?.status?.details?.hasLinkedX);
  const isTasksComplete = areAllMandatoryApproved;
  const isTraitsComplete = heldCategories.length === 5;
  const isWhitelistSecured =
    statusResult?.status?.phase === "SLOT_ALLOCATED" || Boolean(statusResult?.status?.isFullyQualified);

  const isRevoked = statusResult?.status?.phase === "REVOKED";

  const activeStepNumber = isRevoked
    ? 5
    : !isWalletConnected
      ? 1
      : !isXLinked
        ? 2
        : !isTasksComplete
          ? 3
          : !isTraitsComplete
            ? 4
            : 5;

  return (
    <div className="min-h-screen bg-[#f7faf8] text-slate-800 py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* =======================================================================
            HEADER & 5-STEP HORIZONTAL PROGRESS INDICATOR
        ======================================================================= */}
        <header className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
                  <Palette className="h-4 w-4" />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                  Whitelist Portal
                </h1>
                <Badge variant="default" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold">
                  Stage 3 Live
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-slate-500">
                Check allocation eligibility, registration status, and ChimpHood Whitelist distribution details.
              </p>
            </div>

            {statusResult?.program && (
              <div className="self-start sm:self-auto rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-right font-mono text-xs text-slate-600">
                <span className="font-semibold text-slate-700">
                  GTD Allocation: {statusResult.program.allocatedSlotsCount.toLocaleString()} /{" "}
                  {statusResult.program.totalSlots.toLocaleString()} Slots
                </span>
              </div>
            )}
          </div>

          {/* Horizontal Five-Step Progress Indicator */}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between gap-1 sm:gap-2 overflow-x-auto pb-1 text-xs">
              {[
                { num: 1, label: "WALLET", done: isWalletConnected },
                { num: 2, label: "X SYNC", done: isXLinked },
                { num: 3, label: "TASKS", done: isTasksComplete },
                { num: 4, label: "TRAITS", done: isTraitsComplete },
                { num: 5, label: "STATUS", done: isWhitelistSecured },
              ].map((step, idx) => {
                const isActive = activeStepNumber === step.num;
                return (
                  <React.Fragment key={step.label}>
                    <div
                      className={`flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-xl border transition-all ${
                        step.done
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800 font-semibold"
                          : isActive
                            ? "border-amber-300 bg-amber-50 text-amber-900 font-bold shadow-xs"
                            : "border-slate-200 bg-slate-50/60 text-slate-400"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                          step.done
                            ? "bg-emerald-600 text-white"
                            : isActive
                              ? "bg-amber-500 text-white"
                              : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {step.done ? <Check className="h-2.5 w-2.5 stroke-[3]" /> : step.num}
                      </span>
                      <span className="tracking-wide">{step.label}</span>
                    </div>
                    {idx < 4 && (
                      <div
                        className={`hidden sm:block flex-1 h-0.5 min-w-3 ${
                          step.done ? "bg-emerald-300" : "bg-slate-200"
                        }`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </header>

        {/* =======================================================================
            STRICTLY SEQUENTIAL FIVE-STEP VIEWS
            - STEP 1 (WALLET): Only EVM Wallet connection active
            - STEP 2 (X SYNC): Only X account connection active
            - STEP 3 (TASKS): Campaign tasks active until all mandatory approved
            - STEPS 4 & 5: Main Whitelist Layout (Left: Traits, Right: Status)
        ======================================================================= */}

        {/* =======================================================================
            STEP 1 ACTIVE VIEW — CONNECT EVM WALLET
            Visible when activeStepNumber === 1
        ======================================================================= */}
        <div className={activeStepNumber === 1 ? "block" : "hidden"}>
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-xs max-w-2xl mx-auto space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 font-mono">
                    Step 1 of 5
                  </span>
                  <h2 className="text-lg font-bold text-slate-900">
                    Connect EVM Wallet
                  </h2>
                </div>
              </div>
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold">
                Active Step
              </Badge>
            </div>

            {/* Notice / Instructions */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <AlertCircle className="h-4 w-4 text-slate-500" />
                <span>Wallet Not Authenticated</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Connect your Web3 wallet via Sign in with Ethereum (SIWE) above to view your real-time Whitelist allocation status and trait checklist.
              </p>
            </div>

            {authError && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                <span className="truncate">{authError}</span>
                {dismissError && (
                  <button
                    onClick={dismissError}
                    className="shrink-0 text-[11px] font-semibold underline text-rose-800 hover:text-rose-900"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            )}

            {/* Connection Actions */}
            <div className="pt-2">
              {status === "wallet-only" ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500 font-mono">
                    Connected address: {address ? shortenAddress(address) : "—"}
                  </p>
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => void login?.()}
                    className="w-full rounded-xl font-bold py-3 text-sm shadow-sm"
                  >
                    Sign In with Ethereum
                  </Button>
                </div>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleConnectWallet}
                  className="w-full rounded-xl font-bold py-3 text-sm shadow-sm"
                >
                  Connect Wallet
                </Button>
              )}
            </div>

            <div className="border-t border-slate-100 pt-3 text-center">
              <p className="text-xs text-slate-400">
                Step 2 (X Account Sync) and Step 3 (Campaign Tasks) will become accessible immediately after your wallet is authenticated.
              </p>
            </div>
          </div>
        </div>

        {/* =======================================================================
            STEP 2 ACTIVE VIEW — SYNC X (TWITTER) ACCOUNT
            Visible when activeStepNumber === 2
        ======================================================================= */}
        <div className={activeStepNumber === 2 ? "block" : "hidden"}>
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-xs max-w-2xl mx-auto space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 border border-sky-200">
                  <XLogo className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-sky-600 font-mono">
                    Step 2 of 5
                  </span>
                  <h2 className="text-lg font-bold text-slate-900">
                    X (Twitter) Identity
                  </h2>
                </div>
              </div>
              <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700 text-xs font-semibold">
                Active Step
              </Badge>
            </div>

            {/* Completed Step 1 Chip */}
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                Step 1 Completed: EVM Wallet <strong className="font-mono">{address ? shortenAddress(address) : "—"}</strong> verified via SIWE.
              </span>
            </div>

            {/* Notice & Instructions */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-xs space-y-2">
              <p className="font-bold text-slate-800">
                Connect X (Twitter) Account
              </p>
              <p className="text-slate-600 leading-relaxed">
                Link your X (Twitter) profile to establish your social identity and unlock campaign tasks.
              </p>
            </div>

            {/* Direct Connect X Action */}
            <div className="pt-2 space-y-3">
              {xConnectError && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-xs text-rose-700 flex items-start gap-2"
                >
                  <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold">Failed to connect X</p>
                    <p className="text-[11px] text-rose-600 mt-0.5">{xConnectError}</p>
                  </div>
                </div>
              )}

              <Button
                size="lg"
                disabled={isConnectingX}
                onClick={handleDirectConnectX}
                className="w-full rounded-xl bg-slate-900 text-white hover:bg-slate-800 font-bold py-3 text-sm shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {isConnectingX ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin text-slate-300" />
                    <span>Connecting to X...</span>
                  </>
                ) : (
                  <>
                    <XLogo className="h-4 w-4 fill-current" />
                    <span>Connect X Account</span>
                  </>
                )}
              </Button>
            </div>

            <div className="border-t border-slate-100 pt-3 text-center">
              <p className="text-xs text-slate-400">
                Step 3 (Campaign Tasks) will unlock immediately once your X account is connected.
              </p>
            </div>
          </div>
        </div>

        {/* =======================================================================
            STEP 3 ACTIVE VIEW — CAMPAIGN TASKS
            Visible when activeStepNumber === 3
        ======================================================================= */}
        <div className={activeStepNumber === 3 ? "block" : "hidden"}>
          <div className="space-y-6">
            {/* Step 1 & 2 Completed Summary Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs text-xs">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Wallet: <strong className="font-mono text-slate-800">{address ? shortenAddress(address) : "—"}</strong></span>
                </div>
                <div className="flex items-center gap-1.5 text-sky-700 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-sky-600" />
                  <span>X Sync: <strong className="font-mono text-slate-800">{statusResult?.status?.details?.xUsername ? `x/${statusResult.status.details.xUsername}` : "Linked"}</strong></span>
                </div>
              </div>
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[11px] font-bold">
                Step 3 of 5 — Campaign Tasks Active
              </Badge>
            </div>

            {/* Campaign Tasks Section */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs space-y-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                    <Flame className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Campaigns & Quests
                    </h2>
                    <p className="text-xs text-slate-500">
                      Community missions to earn Whitelist allocation
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadTasks}
                  disabled={tasksLoading}
                  className="rounded-xl self-start sm:self-auto text-xs text-slate-600 border-slate-200"
                >
                  <RefreshCw
                    className={`mr-1.5 h-3 w-3 ${tasksLoading ? "animate-spin text-slate-500" : ""}`}
                  />
                  {tasksLoading ? "Refreshing..." : "Refresh Tasks"}
                </Button>
              </div>

              {/* Tasks List */}
              {tasksLoading && campaigns.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Loading campaigns & tasks...
                </div>
              ) : tasksError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 space-y-2">
                  <p className="font-semibold">Failed to load campaigns:</p>
                  <p>{tasksError}</p>
                  <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={loadTasks}>
                    Retry
                  </Button>
                </div>
              ) : campaigns.length === 0 ? (
                <p className="text-xs text-slate-400 py-4">
                  No active campaigns currently open for Whitelist.
                </p>
              ) : (
                campaigns.map((campaign) => (
                  <div key={campaign.id} className="space-y-4">
                    {/* Campaign Title & Instructions */}
                    <div className="rounded-xl bg-slate-50/80 border border-slate-200/70 p-3.5 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-slate-800">
                          {campaign.title}
                        </h3>
                        <Badge variant="default" className="text-[10px] bg-slate-100 text-slate-600 border-slate-200">
                          {campaign.status}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 font-semibold">
                          Mandatory for WL
                        </Badge>
                      </div>
                      {campaign.description && (
                        <p className="text-xs text-slate-500">
                          {campaign.description}
                        </p>
                      )}
                    </div>

                    {/* Compact Task List */}
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
                              className="flex flex-col justify-between gap-3.5 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-slate-300 md:flex-row md:items-center"
                            >
                              <div className="flex min-w-0 flex-1 items-start gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 mt-0.5">
                                  {taskMeta.icon}
                                </div>
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <h4 className="text-xs sm:text-sm font-bold text-slate-800">
                                      {task.title}
                                    </h4>
                                    <span className="font-mono text-[10px] font-semibold text-slate-400 uppercase">
                                      {taskMeta.label}
                                    </span>
                                    {task.isRequired ? (
                                      <Badge variant="default" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700 font-semibold">
                                        Mandatory
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-[10px] text-slate-500">
                                        Optional
                                      </Badge>
                                    )}
                                    <span className="font-mono text-xs font-bold text-emerald-600">
                                      +{task.points} Pts
                                    </span>
                                  </div>
                                  {task.description && (
                                    <p className="text-xs text-slate-500 line-clamp-1">
                                      {task.description}
                                    </p>
                                  )}

                                  {/* Proof input for Quote/Reply tasks */}
                                  {isProofRequired && isTaskOpened && taskStatus.key !== "APPROVED" && (
                                    <div className="pt-2 max-w-md">
                                      <div className="relative">
                                        <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
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
                                          className="w-full rounded-xl border border-slate-300 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none"
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {/* Submitted Proof Display for Approved Tasks */}
                                  {isProofRequired && taskStatus.key === "APPROVED" && task.latestSubmission?.payload && (
                                    <p className="pt-1 text-[11px] text-slate-500 font-mono truncate">
                                      Proof: <span className="text-slate-700">{task.latestSubmission.payload}</span>
                                    </p>
                                  )}

                                  {/* Rejection Note */}
                                  {taskStatus.key === "REJECTED" && (
                                    <div className="mt-1.5 rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 space-y-0.5">
                                      <span className="font-bold">Rejected: </span>
                                      <span>
                                        {task.latestSubmission?.reviewerNotes ||
                                          "Submission was not approved."}
                                      </span>
                                      <p className="text-slate-500">
                                        You can correct and resubmit your evidence below.
                                      </p>
                                    </div>
                                  )}

                                  {errorMsg && <p className="pt-1 text-[11px] text-rose-600">{errorMsg}</p>}
                                  {successMsg && <p className="pt-1 text-[11px] text-emerald-600">{successMsg}</p>}
                                </div>
                              </div>

                              {/* Action Buttons & Status */}
                              <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 border-t border-slate-100 md:border-t-0 md:pt-0">
                                {taskStatus.key !== "NOT_SUBMITTED" && (
                                  <Badge variant={taskStatus.badgeVariant} className={`text-xs px-2.5 py-1 ${taskStatus.colorClass}`}>
                                    {taskStatus.key === "APPROVED" && <CheckCircle2 className="mr-1 h-3 w-3 shrink-0" />}
                                    {taskStatus.key === "PENDING" && <Clock className="mr-1 h-3 w-3 shrink-0" />}
                                    {taskStatus.key === "REJECTED" && <XCircle className="mr-1 h-3 w-3 shrink-0" />}
                                    {taskStatus.key === "APPROVED" ? "Done" : taskStatus.label}
                                  </Badge>
                                )}

                                <a
                                  href={destinationUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() => markTaskOpened(task.id)}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                >
                                  <span>OPEN X</span>
                                  <ExternalLink className="h-3 w-3 text-slate-400" />
                                </a>

                                {taskStatus.key === "APPROVED" ? (
                                  <button
                                    disabled
                                    className="inline-flex cursor-not-allowed items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                    <span>DONE</span>
                                  </button>
                                ) : isCountingDown ? (
                                  <button
                                    disabled
                                    className="inline-flex cursor-not-allowed items-center justify-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 animate-pulse"
                                  >
                                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-600" />
                                    <span>VERIFYING ({countdownSeconds}s)...</span>
                                  </button>
                                ) : !isTaskOpened ? (
                                  <button
                                    disabled
                                    title="Please click 'OPEN X' first"
                                    className="inline-flex cursor-not-allowed items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-400 opacity-60"
                                  >
                                    <span>VERIFY TASK</span>
                                    <ArrowRight className="h-3 w-3 text-slate-400" />
                                  </button>
                                ) : isProofRequired && !taskInput.payload.trim() ? (
                                  <button
                                    disabled
                                    title="Paste your reply or quote link first"
                                    className="inline-flex cursor-not-allowed items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-400 opacity-60"
                                  >
                                    <span>VERIFY TASK</span>
                                    <ArrowRight className="h-3 w-3 text-slate-400" />
                                  </button>
                                ) : status !== "authenticated" ? (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    className="gap-1 rounded-xl text-xs font-semibold"
                                    onClick={() => login()}
                                  >
                                    <span>CONNECT WALLET TO VERIFY</span>
                                    <ArrowRight className="h-3 w-3" />
                                  </Button>
                                ) : (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    className="gap-1 rounded-xl text-xs font-semibold"
                                    onClick={() => handleSocialVerify(task)}
                                    disabled={isSubmitting || isCountingDown}
                                  >
                                    {isSubmitting ? (
                                      <>
                                        <RefreshCw className="h-3 w-3 animate-spin" />
                                        <span>COMPLETING...</span>
                                      </>
                                    ) : (
                                      <>
                                        <span>
                                          {taskStatus.key === "REJECTED" ? "RETRY VERIFY" : "VERIFY TASK"}
                                        </span>
                                        <ArrowRight className="h-3 w-3" />
                                      </>
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        }

                        // Standard Evidence Submission Task
                        return (
                          <div
                            key={task.id}
                            className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs"
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <h4 className="text-xs sm:text-sm font-bold text-slate-800">
                                    {task.title}
                                  </h4>
                                  {task.isRequired ? (
                                    <Badge variant="default" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700 font-semibold">
                                      Mandatory
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] text-slate-500">
                                      Optional
                                    </Badge>
                                  )}
                                  <Badge variant="outline" className="text-[10px] text-slate-600 font-mono">
                                    +{task.points} Pts
                                  </Badge>
                                  <span className="text-[10px] text-slate-400 uppercase font-mono">
                                    {task.taskType}
                                  </span>
                                </div>
                                {task.description && (
                                  <p className="text-xs text-slate-500">{task.description}</p>
                                )}
                              </div>

                              <div className="flex shrink-0 items-center gap-1">
                                <Badge variant={taskStatus.badgeVariant} className={`text-xs ${taskStatus.colorClass}`}>
                                  {taskStatus.key === "APPROVED" && <CheckCircle2 className="mr-1 h-3 w-3 shrink-0" />}
                                  {taskStatus.key === "PENDING" && <Clock className="mr-1 h-3 w-3 shrink-0" />}
                                  {taskStatus.key === "REJECTED" && <XCircle className="mr-1 h-3 w-3 shrink-0" />}
                                  {taskStatus.label}
                                </Badge>
                              </div>
                            </div>

                            {/* Pending Moderator Review info */}
                            {taskStatus.key === "PENDING" && (
                              <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800">
                                <p className="flex items-center gap-1.5 font-bold">
                                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                                  Pending Moderator Review
                                </p>
                                <p className="font-mono text-[11px] truncate">
                                  Submitted Proof: {task.latestSubmission?.payload}
                                </p>
                                <p className="text-slate-600 text-[11px]">
                                  Your submission has been recorded and is awaiting review. Tasks are only counted as completed once approved.
                                </p>
                              </div>
                            )}

                            {/* Approved Info */}
                            {taskStatus.key === "APPROVED" && (
                              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800">
                                <p className="flex items-center gap-1.5 font-bold">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                  Verified & Approved
                                </p>
                                {task.latestSubmission?.payload && (
                                  <p className="mt-1 font-mono text-[11px] truncate text-emerald-900">
                                    Approved Proof: {task.latestSubmission.payload}
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Rejected Info */}
                            {taskStatus.key === "REJECTED" && (
                              <div className="space-y-1 rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-800">
                                <p className="flex items-center gap-1.5 font-bold">
                                  <XCircle className="h-3.5 w-3.5 text-rose-600" />
                                  Evidence Rejected
                                </p>
                                <p className="text-rose-900 font-medium">
                                  {task.latestSubmission?.reviewerNotes ||
                                    "Your submission was rejected by the moderator."}
                                </p>
                                <p className="text-slate-600 text-[11px]">
                                  You can correct and resubmit your evidence below.
                                </p>
                              </div>
                            )}

                            {/* Evidence Input Form (Not Submitted or Rejected) */}
                            {(taskStatus.key === "NOT_SUBMITTED" || taskStatus.key === "REJECTED") && (
                              <div className="pt-1">
                                {status !== "authenticated" ? (
                                  <p className="text-xs text-slate-400 italic">
                                    Sign in with Ethereum to submit evidence for this task.
                                  </p>
                                ) : (
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
                                      className="flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none"
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
                                      className="rounded-xl border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 focus:border-emerald-500 focus:bg-white focus:outline-none"
                                    >
                                      <option value="URL">URL</option>
                                      <option value="IMAGE_URL">IMAGE_URL</option>
                                      <option value="TEXT_PROOF">TEXT_PROOF</option>
                                    </select>
                                    <Button
                                      variant="primary"
                                      size="sm"
                                      onClick={() => handleEvidenceSubmit(task)}
                                      disabled={isSubmitting || !taskInput.payload.trim()}
                                      className="rounded-xl text-xs font-semibold"
                                    >
                                      <Send className="mr-1 h-3 w-3" />
                                      {isSubmitting
                                        ? "Submitting..."
                                        : taskStatus.key === "REJECTED"
                                          ? "Resubmit Evidence"
                                          : "Submit Evidence"}
                                    </Button>
                                  </div>
                                )}
                                {errorMsg && <p className="text-xs text-rose-600 mt-1">{errorMsg}</p>}
                                {successMsg && <p className="text-xs text-emerald-600 mt-1">{successMsg}</p>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* =======================================================================
            STEPS 4 & 5 ACTIVE VIEW — MAIN WHITELIST LAYOUT
            Visible when activeStepNumber >= 4
            - Left Column (Step 4): Character Pixel-Art Preview & 5 Trait Categories
            - Right Column (Step 5): Whitelist Status & Allocation Panel
        ======================================================================= */}
        <div className={activeStepNumber >= 4 ? "block" : "hidden"}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ===================================================================
                LEFT COLUMN: CHARACTER AND INVENTORY (5 Cols on LG)
            =================================================================== */}
            <div className="lg:col-span-5 space-y-5">
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-5">
                {/* Character Preview Header */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <h3 className="font-bold text-sm text-slate-900">
                      Character & Wardrobe
                    </h3>
                  </div>
                  <Badge
                    variant={isTraitsComplete ? "default" : "outline"}
                    className={`text-[10px] font-bold ${
                      isTraitsComplete
                        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                        : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    {isTraitsComplete ? "Full Color ✨" : "In Progress"}
                  </Badge>
                </div>

                {/* Character Pixel-Art Preview Frame */}
                <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-100 bg-gradient-to-b from-[#f0fdf4] to-white p-6 shadow-inner relative overflow-hidden">
                  <div className="relative">
                    <UserAvatar
                      identifier={address}
                      hasInventory={inventoryItems.length > 0}
                      size="xl"
                      className="border-2 border-emerald-200 rounded-2xl shadow-sm [image-rendering:pixelated]"
                    />
                    {isTraitsComplete && (
                      <div className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-white shadow-xs">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>
                  <p className="mt-3 font-mono text-xs font-bold text-slate-700">
                    {isTraitsComplete ? "ChimpHood Outfit Complete!" : "ChimpHood In-Progress Avatar"}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {heldCategories.length} / 5 Categories Completed
                  </p>
                </div>

                {/* Five Trait Categories (Owned in Color, Missing in Grayscale) */}
                {statusResult?.status?.phase !== "REVOKED" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold uppercase tracking-wider text-slate-500">
                        Required Trait Categories (5 of 5)
                      </span>
                      <span className="font-semibold text-slate-600">
                        {heldCategories.length} / 5 Collected
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                      {TRAIT_CATEGORIES.map((cat) => {
                        const isHeld = heldCategories.includes(cat);
                        const theme = CATEGORY_THEMES[cat];
                        return (
                          <div
                            key={cat}
                            className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all ${
                              isHeld
                                ? `${theme.heldClass} shadow-2xs font-bold`
                                : "border-slate-200 bg-slate-50 text-slate-400 grayscale opacity-50"
                            }`}
                          >
                            <div className="mb-1">
                              {isHeld ? (
                                <CheckCircle2 className={`h-4 w-4 ${theme.checkColor}`} />
                              ) : (
                                <XCircle className="h-4 w-4 text-slate-400" />
                              )}
                            </div>
                            <span className="text-[11px]">{cat}</span>
                            <span className="text-[9px] font-mono mt-0.5">
                              {isHeld ? "Owned ✓" : "Missing"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Inventory Summary (Total items and duplicates) */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-medium">Total Inventory Items:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {inventoryItems.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-medium">Extra / Duplicate Copies:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {duplicateCount}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
                    Duplicates remain in your backpack. Qualification requires 1 item in each of the 5 distinct categories.
                  </p>
                </div>

                {/* Trait Lootbox Drops CTA */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 flex items-center justify-between gap-2 text-xs">
                  <div>
                    <p className="font-bold text-slate-800">Trait Lootbox Drops</p>
                    <p className="text-[11px] text-slate-500">Need more traits to complete your collection?</p>
                  </div>
                  <Link href="/drops">
                    <Button variant="primary" size="sm" className="rounded-xl text-xs font-semibold shrink-0">
                      Go to Drops
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            {/* ===================================================================
                RIGHT COLUMN: ACTIVE STEP PANEL (7 Cols on LG)
                Compact information panel: Step 1-5
            =================================================================== */}
            <div className="lg:col-span-7 space-y-5">
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <h3 className="font-bold text-sm text-slate-900">
                      Whitelist Status & Allocation
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Phase Badges */}
                    {statusResult?.status?.phase === "SLOT_ALLOCATED" && (
                      <Badge variant="default" className="border-emerald-300 bg-emerald-100 text-emerald-800 font-bold text-xs">
                        GTD SLOT ALLOCATED
                      </Badge>
                    )}
                    {statusResult?.status?.phase === "FCFS_REGISTERED" && (
                      <Badge variant="default" className="border-sky-300 bg-sky-100 text-sky-800 font-bold text-xs">
                        FCFS Directory (Registered)
                      </Badge>
                    )}
                    <Badge variant="outline" className={`text-xs font-bold ${qualificationState.badgeClass}`}>
                      {qualificationState.title}
                    </Badge>
                  </div>
                </div>

                {/* Steps 1 to 5 Status Overview */}
                <div className="space-y-3">
                  {/* Step 1: Wallet Connection */}
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px]">
                        1
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700">EVM Wallet</span>
                        <span className="ml-2 font-mono text-slate-800 font-bold">
                          {address ? shortenAddress(address) : "—"}
                        </span>
                      </div>
                    </div>
                    <Badge variant="default" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] font-semibold">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Verified
                    </Badge>
                  </div>

                  {/* Step 2: X Account Sync */}
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-sky-700 font-bold text-[10px]">
                        2
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700">X Social Identity</span>
                        <span className="ml-2 font-mono text-slate-800 font-bold">
                          {statusResult?.status?.details?.xUsername
                            ? `@${statusResult.status.details.xUsername}`
                            : "Linked"}
                        </span>
                      </div>
                    </div>
                    <Badge variant="default" className="border-sky-200 bg-sky-50 text-sky-700 text-[10px] font-semibold">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Connected
                    </Badge>
                  </div>

                  {/* Step 3: Campaign Tasks Completion */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700 font-bold text-[10px]">
                          3
                        </div>
                        <div>
                          <span className="font-semibold text-slate-700">Campaign Tasks:</span>
                          <span className="ml-2 font-bold text-emerald-700">
                            {statusResult?.status?.details?.completedMandatoryTasksCount ?? 0} /{" "}
                            {statusResult?.status?.details?.totalMandatoryTasksCount ?? 0} Completed
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] font-semibold">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Verified ✓
                        </Badge>
                        <button
                          onClick={() => setShowTasksInViewB((prev) => !prev)}
                          className="flex items-center text-[10px] font-semibold text-slate-500 hover:text-slate-800"
                        >
                          {showTasksInViewB ? (
                            <>
                              <span>Hide</span>
                              <ChevronUp className="h-3 w-3 ml-0.5" />
                            </>
                          ) : (
                            <>
                              <span>View</span>
                              <ChevronDown className="h-3 w-3 ml-0.5" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Toggleable Task Proof Checklist in View B */}
                    {showTasksInViewB && (
                      <div className="mt-2 pt-2 border-t border-slate-200/60 space-y-2">
                        {campaigns.flatMap((c) => c.tasks).map((t) => {
                          const st = getTaskStatus(t);
                          return (
                            <div
                              key={t.id}
                              className="flex items-center justify-between text-[11px] bg-white p-2 rounded-lg border border-slate-200"
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="font-semibold text-slate-800 truncate">{t.title}</span>
                                {t.isRequired && (
                                  <span className="text-[9px] text-amber-700 bg-amber-50 px-1 py-0.5 rounded border border-amber-200">
                                    Mandatory
                                  </span>
                                )}
                              </div>
                              <span className="font-semibold text-emerald-600 shrink-0">
                                {st.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Step 4: Trait Collection Progress */}
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-violet-700 font-bold text-[10px]">
                        4
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700">Trait Categories</span>
                        <span className="ml-2 font-mono text-slate-800 font-bold">
                          {heldCategories.length} Categories Complete
                        </span>
                      </div>
                    </div>
                    <Badge
                      variant={isTraitsComplete ? "default" : "outline"}
                      className={`text-[10px] font-semibold ${
                        isTraitsComplete
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-300 bg-white text-slate-600"
                      }`}
                    >
                      {isTraitsComplete ? "All 5 Complete ✓" : "In Progress"}
                    </Badge>
                  </div>

                  {/* Step 5: Whitelist Qualification & Real Allocation Status */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 text-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white font-bold text-[10px]">
                          5
                        </div>
                        <span className="font-semibold text-slate-800 text-xs">
                          Whitelist Allocation
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-semibold text-slate-600 border-slate-200 bg-white">
                        Allocation Details
                      </Badge>
                    </div>

                    {/* Detailed Backend Qualification Results */}
                    {statusResult?.status?.phase === "SLOT_ALLOCATED" && (() => {
                      const review = getGtdReviewDetails(statusResult.status.reviewStatus);
                      const ReviewIcon = review.icon;
                      return (
                        <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-xs text-emerald-900">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="font-bold text-emerald-800">
                              Guaranteed Slot #{statusResult.status.slotNumber} (Active)
                            </span>
                            {statusResult.status.allocatedAt && (
                              <span className="text-[11px] text-emerald-700">
                                Secured on {formatRegistrationDate(statusResult.status.allocatedAt)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 pt-1">
                            <Badge variant={review.badgeVariant} className={`text-[10px] ${review.colorClass}`}>
                              <ReviewIcon className="mr-1 h-3 w-3 shrink-0" />
                              {review.label}
                            </Badge>
                            <span className="text-[11px] text-slate-600">{review.subtext}</span>
                          </div>
                          <p className="text-xs text-slate-500">
                            Your Guaranteed Whitelist slot is locked and active. Make sure your connected wallet and linked X account remain connected.
                          </p>
                        </div>
                      );
                    })()}

                    {statusResult?.status?.phase === "FCFS_REGISTERED" && (
                      <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-xs text-sky-900">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">
                            Participant #{statusResult.status.queueNumber}
                          </span>
                          {statusResult.status.joinedAt && (
                            <span className="text-slate-500">
                              • Registered on {formatRegistrationDate(statusResult.status.joinedAt)}
                            </span>
                          )}
                        </div>
                        {statusResult.status.isFullyQualified ? (
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-[11px] text-emerald-800">
                            <p className="font-bold">Eligible for OpenSea FCFS Allowlist</p>
                            <p className="mt-1">
                              All 5 qualification requirements are satisfied! Your wallet will be included in the OpenSea FCFS allowlist export.
                            </p>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
                            <p className="font-bold">Action Required — Incomplete Requirements</p>
                            <p className="mt-1">
                              You are registered in the directory, but must satisfy all 5 requirements below to be included in the OpenSea FCFS allowlist export.
                            </p>
                          </div>
                        )}
                        <div className="text-[11px] text-slate-500 pt-1">
                          <p className="font-medium text-gray-300">FCFS Directory Notice</p>
                          <p className="mt-0.5 text-gray-400">
                            Registration is for the OpenSea FCFS allowlist minting stage and does NOT guarantee a Guaranteed (GTD) slot or an allocation.
                          </p>
                        </div>
                      </div>
                    )}

                    {statusResult?.status?.phase === "REVOKED" && (
                      <div className="space-y-1.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                        <div className="flex items-center gap-1.5 font-bold text-rose-900">
                          <XCircle className="h-4 w-4 text-rose-600" />
                          Whitelist Status Revoked
                        </div>
                        <p className="text-rose-900 font-medium text-[11px]">
                          {statusResult.status.missingRequirements[0] || "Whitelist qualification has been revoked."}
                        </p>
                        <p className="text-slate-600 text-[11px]">
                          In accordance with ChimpHood program policies (DEC-022), slot revocation results in full disqualification from this Whitelist program. Revoked participants are not eligible for Guaranteed (GTD) slots and are excluded from the OpenSea FCFS allowlist export.
                        </p>
                      </div>
                    )}

                    {statusResult?.status?.phase === "NONE" && (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 space-y-1">
                        <span className="font-bold text-slate-800">Not Registered / Ineligible</span>
                        <p className="text-[11px] text-slate-500">
                          Connect your EVM wallet and X (Twitter) account to automatically register in the FCFS Directory, and complete the 5 trait categories and mandatory tasks to qualify for the OpenSea FCFS allowlist.
                        </p>
                      </div>
                    )}

                    {/* Missing requirements listing if incomplete */}
                    {statusResult?.status?.missingRequirements &&
                      statusResult.status.missingRequirements.length > 0 &&
                      !statusResult.status.isFullyQualified &&
                      statusResult.status.phase !== "SLOT_ALLOCATED" &&
                      statusResult.status.phase !== "REVOKED" && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 space-y-0.5">
                          <span className="font-bold">Missing Requirements:</span>
                          <ul className="list-inside list-disc text-[11px] text-amber-900 space-y-0.5">
                            {statusResult.status.missingRequirements.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
