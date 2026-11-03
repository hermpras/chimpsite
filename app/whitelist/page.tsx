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
    heldClass: "border-cyan-400/40 bg-cyan-950/40 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.15)]",
    unheldClass: "border-zinc-800 bg-zinc-900/40 text-zinc-500",
    checkColor: "text-cyan-400",
  },
  FUR: {
    heldClass: "border-amber-400/40 bg-amber-950/40 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.15)]",
    unheldClass: "border-zinc-800 bg-zinc-900/40 text-zinc-500",
    checkColor: "text-amber-400",
  },
  CLOTHING: {
    heldClass: "border-purple-400/40 bg-purple-950/40 text-purple-300 shadow-[0_0_12px_rgba(192,132,252,0.15)]",
    unheldClass: "border-zinc-800 bg-zinc-900/40 text-zinc-500",
    checkColor: "text-purple-400",
  },
  HEADWEAR: {
    heldClass: "border-emerald-400/40 bg-emerald-950/40 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.15)]",
    unheldClass: "border-zinc-800 bg-zinc-900/40 text-zinc-500",
    checkColor: "text-emerald-400",
  },
  EYEWEAR: {
    heldClass: "border-pink-400/40 bg-pink-950/40 text-pink-300 shadow-[0_0_12px_rgba(244,114,182,0.15)]",
    unheldClass: "border-zinc-800 bg-zinc-900/40 text-zinc-500",
    checkColor: "text-pink-400",
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

  // Restore cached Whitelist status immediately to eliminate initial render step jump / flicker
  const [statusResult, setStatusResult] = useState<WhitelistStatusResponse | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("elychimp_wl_status_cache");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.status) return parsed;
        }
      } catch {
        // ignore
      }
    }
    return null;
  });

  // Cached active step fallback to prevent flash of Step 1 during background SIWE / status resolution
  const [cachedActiveStep, setCachedActiveStep] = useState<number | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("elychimp_wl_active_step");
        if (saved) {
          const n = parseInt(saved, 10);
          if (n >= 1 && n <= 5) return n;
        }
      } catch {
        // ignore
      }
    }
    return null;
  });

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
    if (address && (status === "authenticated" || status === "wallet-only")) {
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
    } else if (status === "signed-out") {
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
        icon: <XLogo className="h-4 w-4 text-zinc-300" />,
      };
    }

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
        icon: <XLogo className="h-4 w-4 text-zinc-300" />,
      };
    }

    return {
      label: "SOCIAL / ONCE",
      icon: <XLogo className="h-4 w-4 text-zinc-300" />,
    };
  }

  const updateStatusResult = useCallback((data: WhitelistStatusResponse | null) => {
    setStatusResult(data);
    if (typeof window !== "undefined") {
      try {
        if (data) {
          sessionStorage.setItem("elychimp_wl_status_cache", JSON.stringify(data));
          if (data.address) {
            sessionStorage.setItem("elychimp_wl_address_cache", data.address.toLowerCase());
          }
        } else {
          sessionStorage.removeItem("elychimp_wl_status_cache");
        }
      } catch {}
    }
  }, []);

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
            fetchWhitelistStatus(address).then(updateStatusResult).catch(console.error);
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

  // Fast auto-fetch: Query status immediately whenever an address is available (do not wait for sequential SIWE check)
  useEffect(() => {
    const targetAddress =
      address ||
      (typeof window !== "undefined"
        ? sessionStorage.getItem("elychimp_wl_address_cache")
        : null);

    if (targetAddress && (status === "authenticated" || status === "wallet-only")) {
      let isMounted = true;
      setStatusLoading(true);
      setStatusError(null);
      fetchWhitelistStatus(targetAddress)
        .then((data) => {
          if (isMounted) updateStatusResult(data);
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
    } else if (status === "signed-out") {
      updateStatusResult(null);
      if (typeof window !== "undefined") {
        try {
          sessionStorage.removeItem("elychimp_wl_status_cache");
          sessionStorage.removeItem("elychimp_wl_active_step");
          sessionStorage.removeItem("elychimp_wl_address_cache");
        } catch {}
      }
      setStatusLoading(false);
    }
  }, [status, address, updateStatusResult]);

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
        fetchWhitelistStatus(address).then(updateStatusResult).catch(console.error);
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
          colorClass: "border-emerald-500/40 bg-emerald-950/50 text-emerald-300",
          icon: CheckCircle2,
        };
      case "UNDER_REVIEW":
        return {
          label: "Under Verification",
          subtext: "Under Verification — Account details being audited.",
          badgeVariant: "warning" as const,
          colorClass: "border-amber-500/40 bg-amber-950/50 text-amber-300",
          icon: Clock,
        };
      case "FLAGGED":
        return {
          label: "Notice / Action Required",
          subtext:
            "Notice — Please review your linked accounts and task requirements. Slot remains active.",
          badgeVariant: "warning" as const,
          colorClass: "border-rose-500/40 bg-rose-950/50 text-rose-300",
          icon: AlertCircle,
        };
      case "NOT_REVIEWED":
      default:
        return {
          label: "Pending Routine Review",
          subtext: "Slot Confirmed — Routine verification in progress.",
          badgeVariant: "outline" as const,
          colorClass: "border-cyan-500/40 bg-cyan-950/50 text-cyan-300",
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
        colorClass: "border-emerald-500/40 bg-emerald-950/50 text-emerald-300 font-medium",
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
        colorClass: "border-amber-500/40 bg-amber-950/50 text-amber-300 font-medium",
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
        colorClass: "border-rose-500/40 bg-rose-950/50 text-rose-300 font-medium",
      };
    }
    return {
      key: "NOT_SUBMITTED",
      label: "Not Submitted",
      badgeVariant: "outline",
      colorClass: "border-zinc-700 bg-zinc-800/60 text-zinc-400 font-medium",
    };
  }

  // --- Automatic View Transition Logic ---
  const { allMandatoryTasks, areAllMandatoryApproved } = useMemo(() => {
    const allMandatory = campaigns.flatMap((c) => (c.tasks || []).filter((t) => t.isRequired));

    let approved = false;
    if (status === "authenticated" || statusResult?.status) {
      if (statusResult?.status?.phase === "REVOKED") {
        approved = false;
      } else if (statusResult?.status?.phase === "SLOT_ALLOCATED") {
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
        badgeClass: "bg-rose-950/60 text-rose-300 border-rose-500/40",
      };
    }
    if (phase === "SLOT_ALLOCATED") {
      return {
        key: "Whitelisted" as const,
        title: "Whitelisted",
        badgeClass: "bg-emerald-950/60 text-emerald-300 border-emerald-500/40",
      };
    }
    if (phase === "IN_QUEUE") {
      return {
        key: "Queued" as const,
        title: "Queued",
        badgeClass: "bg-cyan-950/60 text-cyan-300 border-cyan-500/40",
      };
    }
    if (statusResult?.status?.isFullyQualified || phase === "QUALIFIED") {
      return {
        key: "Qualified" as const,
        title: "Qualified",
        badgeClass: "bg-teal-950/60 text-teal-300 border-teal-500/40",
      };
    }
    return {
      key: "Incomplete" as const,
      title: "Incomplete",
      badgeClass: "bg-amber-950/60 text-amber-300 border-amber-500/40",
    };
  }, [statusResult]);

  // Robust connection checks
  const isWalletConnected =
    status === "authenticated" ||
    status === "wallet-only" ||
    Boolean(address) ||
    Boolean(statusResult?.status?.details?.hasVerifiedWallet);

  const isXLinked = Boolean(statusResult?.status?.details?.hasLinkedX);
  const isTasksComplete = areAllMandatoryApproved;
  const isTraitsComplete = heldCategories.length === 5;
  const isWhitelistSecured =
    statusResult?.status?.phase === "SLOT_ALLOCATED" || Boolean(statusResult?.status?.isFullyQualified);

  const isRevoked = statusResult?.status?.phase === "REVOKED";

  // Calculate immediate step from live states
  const calculatedStep = isRevoked
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

  // Active step computation:
  // If we have an existing connected wallet or session in progress and cached step is available,
  // do not flash step 1 while background SIWE/status is resolving.
  const activeStepNumber =
    (status === "checking" || (isWalletConnected && !statusResult)) && cachedActiveStep
      ? cachedActiveStep
      : calculatedStep;

  // Persist the verified active step once determined
  useEffect(() => {
    if (typeof window !== "undefined" && status !== "checking" && calculatedStep) {
      try {
        sessionStorage.setItem("elychimp_wl_active_step", String(calculatedStep));
        setCachedActiveStep(calculatedStep);
      } catch {}
    }
  }, [calculatedStep, status]);

  return (
    <div className="min-h-screen bg-[#08090d] text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* =======================================================================
            HEADER & 5-STEP HORIZONTAL PROGRESS INDICATOR
        ======================================================================= */}
        <header className="rounded-2xl border border-zinc-800 bg-[#0c0d15] p-5 sm:p-6 shadow-brutal-sm space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-400/10 text-amber-400 border border-amber-400/30">
                  <Palette className="h-4 w-4" />
                </div>
                <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-wider text-white">
                  Whitelist Portal
                </h1>
                <Badge variant="outline" className="border-cyan-500/40 bg-cyan-950/40 text-cyan-300 font-mono-street text-[11px] font-bold tracking-wider">
                  ALLOWLIST LIVE
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-zinc-400 font-mono-street">
                Check allocation eligibility, registration status, and Elychimp Whitelist distribution details.
              </p>
            </div>

            {statusResult?.program && (
              <div className="self-start sm:self-auto rounded-xl border border-zinc-800 bg-zinc-900/80 px-3.5 py-1.5 text-right font-mono-street text-xs text-zinc-300">
                <span className="font-bold text-amber-400">
                  GTD Allocation: {statusResult.program.allocatedSlotsCount.toLocaleString()} /{" "}
                  {statusResult.program.totalSlots.toLocaleString()} Slots
                </span>
              </div>
            )}
          </div>

          {/* Horizontal Five-Step Progress Indicator */}
          <div className="border-t border-zinc-800/80 pt-4">
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
                      className={`flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-xl border transition-all font-mono-street text-xs ${
                        step.done
                          ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300 font-semibold"
                          : isActive
                            ? "border-amber-400/60 bg-amber-950/40 text-amber-300 font-bold shadow-[0_0_12px_rgba(251,191,36,0.2)]"
                            : "border-zinc-800 bg-zinc-900/40 text-zinc-500"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                          step.done
                            ? "bg-emerald-500 text-black font-extrabold"
                            : isActive
                              ? "bg-amber-400 text-black font-extrabold"
                              : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {step.done ? <Check className="h-2.5 w-2.5 stroke-[3]" /> : step.num}
                      </span>
                      <span className="tracking-wide uppercase">{step.label}</span>
                    </div>
                    {idx < 4 && (
                      <div
                        className={`hidden sm:block flex-1 h-0.5 min-w-3 ${
                          step.done ? "bg-emerald-500/40" : "bg-zinc-800"
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
          <div className="rounded-2xl border border-zinc-800 bg-[#0c0d15] p-6 sm:p-8 shadow-brutal-sm max-w-2xl mx-auto space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/10 text-amber-400 border border-amber-400/30">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 font-mono-street">
                    Step 1 of 5
                  </span>
                  <h2 className="font-display text-xl uppercase tracking-wider text-white">
                    Connect EVM Wallet
                  </h2>
                </div>
              </div>
              <Badge variant="outline" className="border-amber-400/40 bg-amber-950/40 text-amber-300 font-mono-street text-xs font-bold uppercase">
                Active Step
              </Badge>
            </div>

            {/* Notice / Instructions */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-zinc-200 font-mono-street">
                <AlertCircle className="h-4 w-4 text-amber-400" />
                <span>Wallet Not Authenticated</span>
              </div>
              <p className="text-zinc-400 leading-relaxed font-mono-street text-[13px]">
                Connect your Web3 wallet via Sign in with Ethereum (SIWE) above to view your real-time Whitelist allocation status and trait checklist.
              </p>
            </div>

            {authError && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-300 font-mono-street">
                <span className="truncate">{authError}</span>
                {dismissError && (
                  <button
                    onClick={dismissError}
                    className="shrink-0 text-[11px] font-semibold underline text-rose-400 hover:text-rose-300"
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
                  <p className="text-xs text-zinc-400 font-mono-street">
                    Connected address: {address ? shortenAddress(address) : "—"}
                  </p>
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => void login?.()}
                    className="w-full rounded-xl font-display uppercase tracking-wider py-3.5 text-base bg-amber-400 text-black hover:bg-amber-300 shadow-brutal-sm cursor-pointer"
                  >
                    Sign In with Ethereum
                  </Button>
                </div>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleConnectWallet}
                  className="w-full rounded-xl font-display uppercase tracking-wider py-3.5 text-base bg-amber-400 text-black hover:bg-amber-300 shadow-brutal-sm cursor-pointer"
                >
                  Connect Wallet
                </Button>
              )}
            </div>

            <div className="border-t border-zinc-800/80 pt-3 text-center">
              <p className="text-xs text-zinc-500 font-mono-street">
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
          <div className="rounded-2xl border border-zinc-800 bg-[#0c0d15] p-6 sm:p-8 shadow-brutal-sm max-w-2xl mx-auto space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-400 border border-cyan-400/30">
                  <XLogo className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 font-mono-street">
                    Step 2 of 5
                  </span>
                  <h2 className="font-display text-xl uppercase tracking-wider text-white">
                    X (Twitter) Identity
                  </h2>
                </div>
              </div>
              <Badge variant="outline" className="border-cyan-500/40 bg-cyan-950/40 text-cyan-300 font-mono-street text-xs font-bold uppercase">
                Active Step
              </Badge>
            </div>

            {/* Completed Step 1 Chip */}
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-xs text-emerald-300 font-mono-street">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>
                Step 1 Completed: EVM Wallet <strong className="font-mono text-white">{address ? shortenAddress(address) : "—"}</strong> verified via SIWE.
              </span>
            </div>

            {/* Notice & Instructions */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-xs space-y-2">
              <p className="font-bold text-white font-mono-street text-sm">
                Connect X (Twitter) Account
              </p>
              <p className="text-zinc-400 leading-relaxed font-mono-street text-[13px]">
                Link your X (Twitter) profile to establish your social identity and unlock campaign tasks.
              </p>
            </div>

            {/* Direct Connect X Action */}
            <div className="pt-2 space-y-3">
              {xConnectError && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-500/40 bg-rose-950/50 p-3 text-xs text-rose-300 flex items-start gap-2 font-mono-street"
                >
                  <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-rose-200">Failed to connect X</p>
                    <p className="text-[11px] text-rose-400 mt-0.5">{xConnectError}</p>
                  </div>
                </div>
              )}

              <Button
                size="lg"
                disabled={isConnectingX}
                onClick={handleDirectConnectX}
                className="w-full rounded-xl bg-white text-black hover:bg-zinc-200 font-display uppercase tracking-wider py-3.5 text-base shadow-brutal-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {isConnectingX ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin text-zinc-600" />
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

            <div className="border-t border-zinc-800/80 pt-3 text-center">
              <p className="text-xs text-zinc-500 font-mono-street">
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
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-[#0c0d15] p-4 shadow-brutal-sm text-xs font-mono-street">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>Wallet: <strong className="font-mono text-white">{address ? shortenAddress(address) : "—"}</strong></span>
                </div>
                <div className="flex items-center gap-1.5 text-cyan-400 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-cyan-400" />
                  <span>X Sync: <strong className="font-mono text-white">{statusResult?.status?.details?.xUsername ? `x/${statusResult.status.details.xUsername}` : "Linked"}</strong></span>
                </div>
              </div>
              <Badge variant="outline" className="border-amber-400/40 bg-amber-950/40 text-amber-300 text-[11px] font-bold font-mono-street uppercase">
                Step 3 of 5 — Campaign Tasks Active
              </Badge>
            </div>

            {/* Campaign Tasks Section */}
            <div className="rounded-2xl border border-zinc-800 bg-[#0c0d15] p-5 sm:p-6 shadow-brutal-sm space-y-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-400/10 text-amber-400 border border-amber-400/30">
                    <Flame className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl uppercase tracking-wider text-white">
                      Campaigns & Quests
                    </h2>
                    <p className="text-xs text-zinc-400 font-mono-street">
                      Community missions to earn Whitelist allocation
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadTasks}
                  disabled={tasksLoading}
                  className="rounded-xl self-start sm:self-auto text-xs font-mono-street text-zinc-300 border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800 hover:text-white"
                >
                  <RefreshCw
                    className={`mr-1.5 h-3 w-3 ${tasksLoading ? "animate-spin text-zinc-400" : ""}`}
                  />
                  {tasksLoading ? "Refreshing..." : "Refresh Tasks"}
                </Button>
              </div>

              {/* Tasks List */}
              {tasksLoading && campaigns.length === 0 ? (
                <div className="py-8 text-center text-xs font-mono-street text-zinc-500">
                  Loading campaigns & tasks...
                </div>
              ) : tasksError ? (
                <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-4 text-xs text-rose-300 font-mono-street space-y-2">
                  <p className="font-semibold text-rose-200">Failed to load campaigns:</p>
                  <p>{tasksError}</p>
                  <Button variant="outline" size="sm" className="rounded-xl text-xs font-mono-street border-rose-500/40 bg-rose-950/60 text-rose-200" onClick={loadTasks}>
                    Retry
                  </Button>
                </div>
              ) : campaigns.length === 0 ? (
                <p className="text-xs font-mono-street text-zinc-500 py-4">
                  No active campaigns currently open for Whitelist.
                </p>
              ) : (
                campaigns.map((campaign) => (
                  <div key={campaign.id} className="space-y-4">
                    {/* Campaign Title & Instructions */}
                    <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-3.5 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-sm tracking-wide uppercase text-white">
                          {campaign.title}
                        </h3>
                        <Badge variant="default" className="text-[10px] bg-zinc-800 text-zinc-300 border-zinc-700 font-mono-street">
                          {campaign.status}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] bg-amber-950/40 text-amber-300 border-amber-500/40 font-mono-street font-semibold">
                          Mandatory for WL
                        </Badge>
                      </div>
                      {campaign.description && (
                        <p className="text-xs text-zinc-400 font-mono-street">
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
                              className="flex flex-col justify-between gap-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 hover:border-zinc-700 md:flex-row md:items-center transition-all"
                            >
                              <div className="flex min-w-0 flex-1 items-start gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 mt-0.5">
                                  {taskMeta.icon}
                                </div>
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <h4 className="text-xs sm:text-sm font-bold text-white font-mono-street">
                                      {task.title}
                                    </h4>
                                    <span className="font-mono-street text-[10px] font-semibold text-zinc-500 uppercase">
                                      {taskMeta.label}
                                    </span>
                                    {task.isRequired ? (
                                      <Badge variant="default" className="border-amber-500/40 bg-amber-950/40 text-[10px] text-amber-300 font-mono-street font-semibold">
                                        Mandatory
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-[10px] text-zinc-400 border-zinc-700 bg-zinc-800/40 font-mono-street">
                                        Optional
                                      </Badge>
                                    )}
                                    <span className="font-mono-street text-xs font-bold text-emerald-400">
                                      +{task.points} Pts
                                    </span>
                                  </div>
                                  {task.description && (
                                    <p className="text-xs text-zinc-400 font-mono-street line-clamp-1">
                                      {task.description}
                                    </p>
                                  )}

                                  {/* Proof input for Quote/Reply tasks */}
                                  {isProofRequired && isTaskOpened && taskStatus.key !== "APPROVED" && (
                                    <div className="pt-2 max-w-md">
                                      <div className="relative">
                                        <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
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
                                          className="w-full rounded-xl border border-zinc-700 bg-black/60 pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:border-amber-400 focus:outline-none font-mono-street"
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {/* Submitted Proof Display for Approved Tasks */}
                                  {isProofRequired && taskStatus.key === "APPROVED" && task.latestSubmission?.payload && (
                                    <p className="pt-1 text-[11px] text-zinc-400 font-mono truncate">
                                      Proof: <span className="text-zinc-200">{task.latestSubmission.payload}</span>
                                    </p>
                                  )}

                                  {/* Rejection Note */}
                                  {taskStatus.key === "REJECTED" && (
                                    <div className="mt-1.5 rounded-xl border border-rose-500/40 bg-rose-950/40 p-2 text-xs text-rose-300 font-mono-street space-y-0.5">
                                      <span className="font-bold text-rose-200">Rejected: </span>
                                      <span>
                                        {task.latestSubmission?.reviewerNotes ||
                                          "Submission was not approved."}
                                      </span>
                                      <p className="text-zinc-400">
                                        You can correct and resubmit your evidence below.
                                      </p>
                                    </div>
                                  )}

                                  {errorMsg && <p className="pt-1 text-[11px] text-rose-400 font-mono-street">{errorMsg}</p>}
                                  {successMsg && <p className="pt-1 text-[11px] text-emerald-400 font-mono-street">{successMsg}</p>}
                                </div>
                              </div>

                              {/* Action Buttons & Status */}
                              <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 border-t border-zinc-800 md:border-t-0 md:pt-0">
                                {taskStatus.key !== "NOT_SUBMITTED" && (
                                  <Badge variant={taskStatus.badgeVariant} className={`text-xs px-2.5 py-1 font-mono-street ${taskStatus.colorClass}`}>
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
                                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-mono-street font-bold text-zinc-200 hover:bg-zinc-700 transition-colors"
                                >
                                  <span>OPEN X</span>
                                  <ExternalLink className="h-3 w-3 text-zinc-400" />
                                </a>

                                {taskStatus.key === "APPROVED" ? (
                                  <button
                                    disabled
                                    className="inline-flex cursor-not-allowed items-center justify-center gap-1 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-1.5 text-xs font-mono-street font-bold text-emerald-300"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                    <span>DONE</span>
                                  </button>
                                ) : isCountingDown ? (
                                  <button
                                    disabled
                                    className="inline-flex cursor-not-allowed items-center justify-center gap-1 rounded-xl border border-amber-500/50 bg-amber-950/50 px-3 py-1.5 text-xs font-mono-street font-bold text-amber-300 animate-pulse"
                                  >
                                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-400" />
                                    <span>VERIFYING ({countdownSeconds}s)...</span>
                                  </button>
                                ) : !isTaskOpened ? (
                                  <button
                                    disabled
                                    title="Please click 'OPEN X' first"
                                    className="inline-flex cursor-not-allowed items-center justify-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-mono-street font-bold text-zinc-600 opacity-60"
                                  >
                                    <span>VERIFY TASK</span>
                                    <ArrowRight className="h-3 w-3 text-zinc-600" />
                                  </button>
                                ) : isProofRequired && !taskInput.payload.trim() ? (
                                  <button
                                    disabled
                                    title="Paste your reply or quote link first"
                                    className="inline-flex cursor-not-allowed items-center justify-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-mono-street font-bold text-zinc-600 opacity-60"
                                  >
                                    <span>VERIFY TASK</span>
                                    <ArrowRight className="h-3 w-3 text-zinc-600" />
                                  </button>
                                ) : status !== "authenticated" ? (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    className="gap-1 rounded-xl text-xs font-mono-street font-bold bg-amber-400 text-black hover:bg-amber-300"
                                    onClick={() => login()}
                                  >
                                    <span>CONNECT WALLET TO VERIFY</span>
                                    <ArrowRight className="h-3 w-3" />
                                  </Button>
                                ) : (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    className="gap-1 rounded-xl text-xs font-mono-street font-bold bg-amber-400 text-black hover:bg-amber-300"
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
                            className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <h4 className="text-xs sm:text-sm font-bold text-white font-mono-street">
                                    {task.title}
                                  </h4>
                                  {task.isRequired ? (
                                    <Badge variant="default" className="border-amber-500/40 bg-amber-950/40 text-[10px] text-amber-300 font-mono-street font-semibold">
                                      Mandatory
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] text-zinc-400 border-zinc-700 bg-zinc-800/40 font-mono-street">
                                      Optional
                                    </Badge>
                                  )}
                                  <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/40 bg-emerald-950/30 font-mono-street">
                                    +{task.points} Pts
                                  </Badge>
                                  <span className="text-[10px] text-zinc-500 uppercase font-mono-street">
                                    {task.taskType}
                                  </span>
                                </div>
                                {task.description && (
                                  <p className="text-xs text-zinc-400 font-mono-street">{task.description}</p>
                                )}
                              </div>

                              <div className="flex shrink-0 items-center gap-1">
                                <Badge variant={taskStatus.badgeVariant} className={`text-xs font-mono-street ${taskStatus.colorClass}`}>
                                  {taskStatus.key === "APPROVED" && <CheckCircle2 className="mr-1 h-3 w-3 shrink-0" />}
                                  {taskStatus.key === "PENDING" && <Clock className="mr-1 h-3 w-3 shrink-0" />}
                                  {taskStatus.key === "REJECTED" && <XCircle className="mr-1 h-3 w-3 shrink-0" />}
                                  {taskStatus.label}
                                </Badge>
                              </div>
                            </div>

                            {/* Pending Moderator Review info */}
                            {taskStatus.key === "PENDING" && (
                              <div className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-950/40 p-3 text-xs text-amber-300 font-mono-street">
                                <p className="flex items-center gap-1.5 font-bold text-amber-200">
                                  <Clock className="h-3.5 w-3.5 text-amber-400" />
                                  Pending Moderator Review
                                </p>
                                <p className="font-mono text-[11px] truncate text-zinc-300">
                                  Submitted Proof: {task.latestSubmission?.payload}
                                </p>
                                <p className="text-zinc-400 text-[11px]">
                                  Your submission has been recorded and is awaiting review. Tasks are only counted as completed once approved.
                                </p>
                              </div>
                            )}

                            {/* Approved Info */}
                            {taskStatus.key === "APPROVED" && (
                              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3 text-xs text-emerald-300 font-mono-street">
                                <p className="flex items-center gap-1.5 font-bold text-emerald-200">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                  Verified & Approved
                                </p>
                                {task.latestSubmission?.payload && (
                                  <p className="mt-1 font-mono text-[11px] truncate text-emerald-200">
                                    Approved Proof: {task.latestSubmission.payload}
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Rejected Info */}
                            {taskStatus.key === "REJECTED" && (
                              <div className="space-y-1 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-300 font-mono-street">
                                <p className="flex items-center gap-1.5 font-bold text-rose-200">
                                  <XCircle className="h-3.5 w-3.5 text-rose-400" />
                                  Evidence Rejected
                                </p>
                                <p className="text-rose-200 font-medium">
                                  {task.latestSubmission?.reviewerNotes ||
                                    "Your submission was rejected by the moderator."}
                                </p>
                                <p className="text-zinc-400 text-[11px]">
                                  You can correct and resubmit your evidence below.
                                </p>
                              </div>
                            )}

                            {/* Evidence Input Form (Not Submitted or Rejected) */}
                            {(taskStatus.key === "NOT_SUBMITTED" || taskStatus.key === "REJECTED") && (
                              <div className="pt-1">
                                {status !== "authenticated" ? (
                                  <p className="text-xs text-zinc-500 italic font-mono-street">
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
                                      className="flex-1 rounded-xl border border-zinc-700 bg-black/60 px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:border-amber-400 focus:outline-none font-mono-street"
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
                                      className="rounded-xl border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 focus:border-amber-400 focus:outline-none font-mono-street"
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
                                      className="rounded-xl text-xs font-mono-street font-bold bg-amber-400 text-black hover:bg-amber-300"
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
                                {errorMsg && <p className="text-xs text-rose-400 mt-1 font-mono-street">{errorMsg}</p>}
                                {successMsg && <p className="text-xs text-emerald-400 mt-1 font-mono-street">{successMsg}</p>}
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
              <div className="rounded-2xl border border-zinc-800 bg-[#0c0d15] p-5 shadow-brutal-sm space-y-5">
                {/* Character Preview Header */}
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400/10 text-amber-400 border border-amber-400/30">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <h3 className="font-display text-sm tracking-wide uppercase text-white">
                      Character & Wardrobe
                    </h3>
                  </div>
                  <Badge
                    variant={isTraitsComplete ? "default" : "outline"}
                    className={`text-[10px] font-mono-street font-bold ${
                      isTraitsComplete
                        ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/40"
                        : "bg-zinc-800 text-zinc-300 border-zinc-700"
                    }`}
                  >
                    {isTraitsComplete ? "Full Color ✨" : "In Progress"}
                  </Badge>
                </div>

                {/* Character Pixel-Art Preview Frame */}
                <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-radial from-zinc-900 to-[#08090d] p-6 shadow-inner relative overflow-hidden">
                  <div className="relative">
                    <UserAvatar
                      identifier={address}
                      hasInventory={inventoryItems.length > 0}
                      size="xl"
                      className="border-2 border-amber-400/50 rounded-2xl shadow-brutal-sm [image-rendering:pixelated]"
                    />
                    {isTraitsComplete && (
                      <div className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-black shadow-xs">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>
                  <p className="mt-3 font-mono-street text-xs font-bold text-white uppercase tracking-wider">
                    {isTraitsComplete ? "Elychimp Outfit Complete!" : "Elychimp In-Progress Avatar"}
                  </p>
                  <p className="text-[11px] text-zinc-400 font-mono-street">
                    {heldCategories.length} / 5 Categories Completed
                  </p>
                </div>

                {/* Five Trait Categories (Owned in Color, Missing in Grayscale) */}
                {statusResult?.status?.phase !== "REVOKED" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono-street">
                      <span className="font-bold uppercase tracking-wider text-zinc-400">
                        Required Trait Categories (5 of 5)
                      </span>
                      <span className="font-bold text-amber-400">
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
                            className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                              isHeld
                                ? `${theme.heldClass} font-bold`
                                : "border-zinc-800 bg-zinc-900/40 text-zinc-600 grayscale opacity-40"
                            }`}
                          >
                            <div className="mb-1">
                              {isHeld ? (
                                <CheckCircle2 className={`h-4 w-4 ${theme.checkColor}`} />
                              ) : (
                                <XCircle className="h-4 w-4 text-zinc-600" />
                              )}
                            </div>
                            <span className="text-[11px] font-mono-street font-bold">{cat}</span>
                            <span className="text-[9px] font-mono-street mt-0.5">
                              {isHeld ? "Owned ✓" : "Missing"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Inventory Summary (Total items and duplicates) */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5 space-y-1.5 text-xs font-mono-street">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400 font-medium">Total Inventory Items:</span>
                    <span className="font-mono font-bold text-white">
                      {inventoryItems.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400 font-medium">Extra / Duplicate Copies:</span>
                    <span className="font-mono font-bold text-white">
                      {duplicateCount}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 pt-1 border-t border-zinc-800">
                    Duplicates remain in your backpack. Qualification requires 1 item in each of the 5 distinct categories.
                  </p>
                </div>

                {/* Trait Lootbox Drops CTA */}
                <div className="rounded-xl border border-amber-400/30 bg-amber-950/20 p-3.5 flex items-center justify-between gap-2 text-xs font-mono-street">
                  <div>
                    <p className="font-bold text-white">Trait Lootbox Drops</p>
                    <p className="text-[11px] text-zinc-400">Need more traits to complete your collection?</p>
                  </div>
                  <Link href="/drops">
                    <Button variant="primary" size="sm" className="rounded-xl text-xs font-display uppercase tracking-wider bg-amber-400 text-black hover:bg-amber-300 shrink-0">
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
              <div className="rounded-2xl border border-zinc-800 bg-[#0c0d15] p-5 sm:p-6 shadow-brutal-sm space-y-5">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-400 border border-emerald-400/30">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <h3 className="font-display text-sm tracking-wide uppercase text-white">
                      Whitelist Status & Allocation
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Phase Badges */}
                    {statusResult?.status?.phase === "SLOT_ALLOCATED" && (
                      <Badge variant="default" className="border-emerald-500/40 bg-emerald-950/60 text-emerald-300 font-mono-street font-bold text-xs uppercase">
                        GTD SLOT ALLOCATED
                      </Badge>
                    )}
                    {statusResult?.status?.phase === "FCFS_REGISTERED" && (
                      <Badge variant="default" className="border-cyan-500/40 bg-cyan-950/60 text-cyan-300 font-mono-street font-bold text-xs">
                        FCFS Directory (Registered)
                      </Badge>
                    )}
                    <Badge variant="outline" className={`text-xs font-mono-street font-bold ${qualificationState.badgeClass}`}>
                      {qualificationState.title}
                    </Badge>
                  </div>
                </div>

                {/* Steps 1 to 5 Status Overview */}
                <div className="space-y-3 font-mono-street">
                  {/* Step 1: Wallet Connection */}
                  <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-black font-extrabold text-[10px]">
                        1
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-400">EVM Wallet</span>
                        <span className="ml-2 font-mono text-white font-bold">
                          {address ? shortenAddress(address) : "—"}
                        </span>
                      </div>
                    </div>
                    <Badge variant="default" className="border-emerald-500/40 bg-emerald-950/50 text-emerald-300 text-[10px] font-semibold">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Verified
                    </Badge>
                  </div>

                  {/* Step 2: X Account Sync */}
                  <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-400 text-black font-extrabold text-[10px]">
                        2
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-400">X Social Identity</span>
                        <span className="ml-2 font-mono text-white font-bold">
                          {statusResult?.status?.details?.xUsername
                            ? `@${statusResult.status.details.xUsername}`
                            : "Linked"}
                        </span>
                      </div>
                    </div>
                    <Badge variant="default" className="border-cyan-500/40 bg-cyan-950/50 text-cyan-300 text-[10px] font-semibold">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Connected
                    </Badge>
                  </div>

                  {/* Step 3: Campaign Tasks Completion */}
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-black font-extrabold text-[10px]">
                          3
                        </div>
                        <div>
                          <span className="font-semibold text-zinc-400">Campaign Tasks:</span>
                          <span className="ml-2 font-bold text-amber-400">
                            {statusResult?.status?.details?.completedMandatoryTasksCount ?? 0} /{" "}
                            {statusResult?.status?.details?.totalMandatoryTasksCount ?? 0} Completed
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="border-emerald-500/40 bg-emerald-950/50 text-emerald-300 text-[10px] font-semibold">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Verified ✓
                        </Badge>
                        <button
                          onClick={() => setShowTasksInViewB((prev) => !prev)}
                          className="flex items-center text-[10px] font-semibold text-zinc-400 hover:text-white"
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
                      <div className="mt-2 pt-2 border-t border-zinc-800 space-y-2">
                        {campaigns.flatMap((c) => c.tasks).map((t) => {
                          const st = getTaskStatus(t);
                          return (
                            <div
                              key={t.id}
                              className="flex items-center justify-between text-[11px] bg-black/40 p-2 rounded-lg border border-zinc-800"
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="font-semibold text-zinc-200 truncate">{t.title}</span>
                                {t.isRequired && (
                                  <span className="text-[9px] text-amber-300 bg-amber-950/40 px-1 py-0.5 rounded border border-amber-500/40">
                                    Mandatory
                                  </span>
                                )}
                              </div>
                              <span className="font-semibold text-emerald-400 shrink-0">
                                {st.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Step 4: Trait Collection Progress */}
                  <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-400 text-black font-extrabold text-[10px]">
                        4
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-400">Trait Categories</span>
                        <span className="ml-2 font-mono text-white font-bold">
                          {heldCategories.length} Categories Complete
                        </span>
                      </div>
                    </div>
                    <Badge
                      variant={isTraitsComplete ? "default" : "outline"}
                      className={`text-[10px] font-semibold ${
                        isTraitsComplete
                          ? "border-emerald-500/40 bg-emerald-950/50 text-emerald-300"
                          : "border-zinc-700 bg-zinc-800/40 text-zinc-400"
                      }`}
                    >
                      {isTraitsComplete ? "All 5 Complete ✓" : "In Progress"}
                    </Badge>
                  </div>

                  {/* Step 5: Whitelist Qualification & Real Allocation Status */}
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 text-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-black font-extrabold text-[10px]">
                          5
                        </div>
                        <span className="font-semibold text-white text-xs">
                          Whitelist Allocation
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-semibold text-zinc-400 border-zinc-700 bg-zinc-800/40">
                        Allocation Details
                      </Badge>
                    </div>

                    {/* Detailed Backend Qualification Results */}
                    {statusResult?.status?.phase === "SLOT_ALLOCATED" && (() => {
                      const review = getGtdReviewDetails(statusResult.status.reviewStatus);
                      const ReviewIcon = review.icon;
                      return (
                        <div className="space-y-2 rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3 text-xs text-emerald-200">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="font-bold text-emerald-300">
                              Guaranteed Slot #{statusResult.status.slotNumber} (Active)
                            </span>
                            {statusResult.status.allocatedAt && (
                              <span className="text-[11px] text-emerald-400">
                                Secured on {formatRegistrationDate(statusResult.status.allocatedAt)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 pt-1">
                            <Badge variant={review.badgeVariant} className={`text-[10px] ${review.colorClass}`}>
                              <ReviewIcon className="mr-1 h-3 w-3 shrink-0" />
                              {review.label}
                            </Badge>
                            <span className="text-[11px] text-zinc-400">{review.subtext}</span>
                          </div>
                          <p className="text-xs text-zinc-400">
                            Your Guaranteed Whitelist slot is locked and active. Make sure your connected wallet and linked X account remain connected.
                          </p>
                        </div>
                      );
                    })()}

                    {statusResult?.status?.phase === "FCFS_REGISTERED" && (
                      <div className="space-y-2 rounded-xl border border-cyan-500/40 bg-cyan-950/40 p-3 text-xs text-cyan-200">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">
                            Participant #{statusResult.status.queueNumber}
                          </span>
                          {statusResult.status.joinedAt && (
                            <span className="text-zinc-400">
                              • Registered on {formatRegistrationDate(statusResult.status.joinedAt)}
                            </span>
                          )}
                        </div>
                        {statusResult.status.isFullyQualified ? (
                          <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 p-2 text-[11px] text-emerald-200">
                            <p className="font-bold text-emerald-300">Eligible for OpenSea FCFS Allowlist</p>
                            <p className="mt-1 text-zinc-300">
                              All 5 qualification requirements are satisfied! Your wallet will be included in the OpenSea FCFS allowlist export.
                            </p>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-amber-500/40 bg-amber-950/50 p-2 text-[11px] text-amber-200">
                            <p className="font-bold text-amber-300">Action Required — Incomplete Requirements</p>
                            <p className="mt-1 text-zinc-300">
                              You are registered in the directory, but must satisfy all 5 requirements below to be included in the OpenSea FCFS allowlist export.
                            </p>
                          </div>
                        )}
                        <div className="text-[11px] text-zinc-400 pt-1">
                          <p className="font-medium text-zinc-300">FCFS Directory Notice</p>
                          <p className="mt-0.5 text-zinc-500">
                            Registration is for the OpenSea FCFS allowlist minting stage and does NOT guarantee a Guaranteed (GTD) slot or an allocation.
                          </p>
                        </div>
                      </div>
                    )}

                    {statusResult?.status?.phase === "REVOKED" && (
                      <div className="space-y-1.5 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-200">
                        <div className="flex items-center gap-1.5 font-bold text-rose-300">
                          <XCircle className="h-4 w-4 text-rose-400" />
                          Whitelist Status Revoked
                        </div>
                        <p className="text-rose-200 font-medium text-[11px]">
                          {statusResult.status.missingRequirements[0] || "Whitelist qualification has been revoked."}
                        </p>
                        <p className="text-zinc-400 text-[11px]">
                          In accordance with ChimpHood program policies (DEC-022), slot revocation results in full disqualification from this Whitelist program. Revoked participants are not eligible for Guaranteed (GTD) slots and are excluded from the OpenSea FCFS allowlist export.
                        </p>
                      </div>
                    )}

                    {statusResult?.status?.phase === "NONE" && (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-400 space-y-1">
                        <span className="font-bold text-white">Not Registered / Ineligible</span>
                        <p className="text-[11px] text-zinc-400">
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
                        <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-2.5 text-xs text-amber-200 space-y-0.5">
                          <span className="font-bold text-amber-300">Missing Requirements:</span>
                          <ul className="list-inside list-disc text-[11px] text-amber-200 space-y-0.5">
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
