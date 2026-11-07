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
  Download,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useSiweAuth } from "@/hooks/useSiweAuth";
import { useXIdentity } from "@/hooks/useXIdentity";
import { SyndicateShareCardModal, BananaSticker } from "@/components/whitelist/SyndicateShareCardModal";
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

import { XLogo } from "@/components/icons/XLogo";

const TRAIT_CATEGORIES = ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"] as const;

const CATEGORY_THEMES: Record<
  string,
  { heldClass: string; unheldClass: string; checkColor: string }
> = {
  BG: {
    heldClass: "border-cyan-400/40 bg-cyan-950/40 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.15)]",
    unheldClass: "border-[#163B44] bg-[#051D22] text-zinc-500",
    checkColor: "text-cyan-400",
  },
  FUR: {
    heldClass: "border-amber-400/40 bg-amber-950/40 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.15)]",
    unheldClass: "border-[#163B44] bg-[#051D22] text-zinc-500",
    checkColor: "text-amber-400",
  },
  CLOTHING: {
    heldClass: "border-purple-400/40 bg-purple-950/40 text-purple-300 shadow-[0_0_12px_rgba(192,132,252,0.15)]",
    unheldClass: "border-[#163B44] bg-[#051D22] text-zinc-500",
    checkColor: "text-purple-400",
  },
  HEADWEAR: {
    heldClass: "border-emerald-400/40 bg-emerald-950/40 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.15)]",
    unheldClass: "border-[#163B44] bg-[#051D22] text-zinc-500",
    checkColor: "text-emerald-400",
  },
  EYEWEAR: {
    heldClass: "border-pink-400/40 bg-pink-950/40 text-pink-300 shadow-[0_0_12px_rgba(244,114,182,0.15)]",
    unheldClass: "border-[#163B44] bg-[#051D22] text-zinc-500",
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
  const { xName } = useXIdentity();
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

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

  // Check if URL hash explicitly targets a specific step (e.g., #tasks from the Drops page)
  const getHashStep = (): number | null => {
    if (typeof window === "undefined") return null;
    const h = (window.location.hash || "").toLowerCase();
    if (h === "#tasks" || h === "#task") return 3;
    if (h === "#traits" || h === "#trait") return 4;
    if (h === "#status") return 5;
    if (h === "#wallet") return 1;
    if (h === "#x" || h === "#x-sync") return 2;
    return null;
  };

  const [selectedStep, setSelectedStep] = useState<number | null>(() => getHashStep());

  useEffect(() => {
    const handleHash = () => {
      const step = getHashStep();
      setSelectedStep(step);
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

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
    return "https://x.com/Elychimp";
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
      colorClass: "border-[#163B44] bg-zinc-800/60 text-zinc-400 font-medium",
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
  // 1. If explicit hash/step is targeted (e.g. #tasks from Drops page), honor it directly from frame 0.
  // 2. If session in progress and cached step is available, do not flash step 1 while background SIWE/status is resolving.
  // 3. Otherwise, use calculatedStep.
  const activeStepNumber =
    selectedStep !== null
      ? selectedStep
      : (status === "checking" || (isWalletConnected && !statusResult)) && cachedActiveStep
        ? cachedActiveStep
        : calculatedStep;

  // Persist the verified active step once determined
  useEffect(() => {
    if (typeof window !== "undefined" && status !== "checking" && calculatedStep && selectedStep === null) {
      try {
        sessionStorage.setItem("elychimp_wl_active_step", String(calculatedStep));
        setCachedActiveStep(calculatedStep);
      } catch {}
    }
  }, [calculatedStep, status, selectedStep]);

  // Smooth scroll to target hash section if explicitly requested (e.g. #tasks)
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#tasks") {
      const el = document.getElementById("tasks");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, [activeStepNumber]);

  return (
    <div className="min-h-screen bg-[#04181C] text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* =======================================================================
            HEADER & 5-STEP HORIZONTAL PROGRESS INDICATOR
        ======================================================================= */}
        <header className="rounded-2xl border border-[#163B44] bg-[#0B2026] p-5 sm:p-6 shadow-[0_4px_24px_rgba(0,0,0,0.45)] space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-wider text-white">
                  Whitelist Portal
                </h1>
              </div>
              <p className="text-xs sm:text-sm text-[#8AA8B2]">
                Check allocation eligibility, registration status, and Elychimp Whitelist distribution details.
              </p>
            </div>
          </div>

          {/* Horizontal Five-Step Progress Indicator */}
          <div className="border-t border-[#163B44] pt-4">
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
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStep(step.num);
                        const targetHash =
                          step.num === 3
                            ? "#tasks"
                            : step.num === 4
                              ? "#traits"
                              : step.num === 5
                                ? "#status"
                                : step.num === 2
                                  ? "#x"
                                  : "#wallet";
                        if (typeof window !== "undefined") {
                          window.history.replaceState(null, "", targetHash);
                        }
                      }}
                      className={`flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-xl border transition-all text-xs cursor-pointer hover:border-amber-400/80 ${
                        step.done
                          ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300 font-medium"
                          : isActive
                            ? "border-amber-400/60 bg-amber-950/40 text-amber-300 font-medium shadow-[0_0_12px_rgba(251,191,36,0.2)]"
                            : "border-[#163B44] bg-[#051D22] text-zinc-400 hover:text-white hover:border-zinc-500"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-medium ${
                          step.done
                            ? "bg-emerald-500 text-black font-medium"
                            : isActive
                              ? "bg-amber-400 text-black font-medium"
                              : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {step.done ? <Check className="h-2.5 w-2.5 stroke-[3]" /> : step.num}
                      </span>
                      <span className="tracking-wide uppercase">{step.label}</span>
                    </button>
                    {idx < 4 && (
                      <div
                        className={`hidden sm:block flex-1 h-0.5 min-w-3 ${
                          step.done ? "bg-emerald-500/50" : "bg-zinc-700/60"
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
          <div className="rounded-2xl border border-[#163B44] bg-[#0B2026] p-6 sm:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.45)] max-w-2xl mx-auto space-y-6">
            <div className="flex items-center justify-between border-b border-[#163B44] pb-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#F59E0B] font-semibold">
                  Step 1 of 5
                </span>
                <h2 className="font-display text-xl uppercase tracking-wider text-white">
                  Connect EVM Wallet
                </h2>
              </div>
              <Badge variant="outline" className="border-amber-400/40 bg-amber-950/40 text-amber-300 text-xs font-bold uppercase">
                Active Step
              </Badge>
            </div>

            {/* Notice / Instructions */}
            <div className="rounded-xl border border-[#163B44] bg-[#051D22] p-4 text-xs space-y-1.5">
              <p className="font-bold text-[#F8F7F4] text-sm">
                A signature, not a transaction.
              </p>
              <p className="text-zinc-400 leading-relaxed text-xs">
                We only verify your public address. Signing in is an off-chain message that costs zero gas and cannot move any funds.
              </p>
            </div>

            {authError && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-300">
                <span className="truncate">{authError}</span>
                {dismissError && (
                  <button
                    onClick={dismissError}
                    className="shrink-0 text-[11px] font-medium underline text-rose-400 hover:text-rose-300"
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
                  <p className="text-xs text-[#8AA8B2]">
                    Connected address: {address ? shortenAddress(address) : "—"}
                  </p>
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => void login?.()}
                    className="w-full rounded-xl font-bold uppercase tracking-wider py-3.5 text-base bg-[#34B7DD] text-[#04181C] hover:bg-[#6FCDE8] shadow-[0_0_20px_rgba(52,183,221,0.25)] cursor-pointer"
                  >
                    Sign In with Ethereum
                  </Button>
                </div>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleConnectWallet}
                  className="w-full rounded-xl font-bold uppercase tracking-wider py-3.5 text-base bg-[#34B7DD] text-[#04181C] hover:bg-[#6FCDE8] shadow-[0_0_20px_rgba(52,183,221,0.25)] cursor-pointer"
                >
                  Connect Wallet
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* =======================================================================
            STEP 2 ACTIVE VIEW — SYNC X (TWITTER) ACCOUNT
            Visible when activeStepNumber === 2
        ======================================================================= */}
        <div className={activeStepNumber === 2 ? "block" : "hidden"}>
          <div className="rounded-2xl border border-[#163B44] bg-[#0B2026] p-6 sm:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.45)] max-w-2xl mx-auto space-y-6">
            <div className="flex items-center justify-between border-b border-[#163B44] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-400 border border-cyan-400/30">
                  <XLogo className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#34B7DD] font-semibold">
                    Step 2 of 5
                  </span>
                  <h2 className="font-display text-xl uppercase tracking-wider text-white">
                    X (Twitter) Identity
                  </h2>
                </div>
              </div>
              <Badge variant="outline" className="border-cyan-500/40 bg-cyan-950/40 text-cyan-300 text-xs font-bold uppercase">
                Active Step
              </Badge>
            </div>

            {/* Completed Step 1 Chip */}
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-xs text-emerald-300">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>
                Step 1 Completed: EVM Wallet <strong className="font-mono text-white">{address ? shortenAddress(address) : "—"}</strong> verified via SIWE.
              </span>
            </div>

            {/* Notice & Instructions */}
            <div className="rounded-xl border border-[#163B44] bg-[#051D22] p-4 text-xs space-y-2">
              <p className="font-bold text-[#F8F7F4] text-sm">
                Connect X (Twitter) Account
              </p>
              <p className="text-zinc-400 leading-relaxed text-[13px]">
                Link your X (Twitter) profile to establish your social identity and unlock campaign tasks.
              </p>
            </div>

            {/* Direct Connect X Action */}
            <div className="pt-2 space-y-3">
              {xConnectError && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-500/40 bg-rose-950/50 p-3 text-xs text-rose-300 flex items-start gap-2"
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
                className="w-full rounded-xl bg-white text-black hover:bg-zinc-200 font-bold uppercase tracking-wider py-3.5 text-base shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
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

            <div className="border-t border-[#163B44]/80 pt-3 text-center">
              <p className="text-xs text-[#8AA8B2]">
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
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#163B44] bg-[#0B2026] p-4 shadow-[0_4px_24px_rgba(0,0,0,0.45)] text-xs">
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
              <Badge variant="outline" className="border-amber-400/40 bg-amber-950/40 text-amber-300 text-[11px] font-bold uppercase">
                Step 3 of 5 — Campaign Tasks Active
              </Badge>
            </div>

            {/* Campaign Tasks Section */}
            <div id="tasks" className="rounded-2xl border border-[#163B44] bg-[#0B2026] p-5 sm:p-6 shadow-[0_4px_24px_rgba(0,0,0,0.45)] space-y-5 scroll-mt-24">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[#163B44] pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-400/10 text-amber-400 border border-amber-400/30">
                    <Flame className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl uppercase tracking-wider text-white">
                      Campaigns & Quests
                    </h2>
                    <p className="text-xs text-[#8AA8B2]">
                      Community missions to earn Whitelist allocation
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadTasks}
                  disabled={tasksLoading}
                  className="rounded-xl self-start sm:self-auto text-xs text-[#DBF2F9] border-[#163B44] bg-zinc-900/60 hover:bg-zinc-800 hover:text-white"
                >
                  <RefreshCw
                    className={`mr-1.5 h-3 w-3 ${tasksLoading ? "animate-spin text-zinc-400" : ""}`}
                  />
                  {tasksLoading ? "Refreshing..." : "Refresh Tasks"}
                </Button>
              </div>

              {/* Tasks List */}
              {tasksLoading && campaigns.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#8AA8B2]">
                  Loading campaigns & tasks...
                </div>
              ) : tasksError ? (
                <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-4 text-xs text-rose-300 space-y-2">
                  <p className="font-semibold text-rose-200">Failed to load campaigns:</p>
                  <p>{tasksError}</p>
                  <Button variant="outline" size="sm" className="rounded-xl text-xs border-rose-500/40 bg-rose-950/60 text-rose-200" onClick={loadTasks}>
                    Retry
                  </Button>
                </div>
              ) : campaigns.length === 0 ? (
                <p className="text-xs text-[#8AA8B2] py-4">
                  No active campaigns currently open for Whitelist.
                </p>
              ) : (
                campaigns.map((campaign) => (
                  <div key={campaign.id} className="space-y-4">
                    {/* Campaign Title & Instructions */}
                    <div className="rounded-xl bg-[#051D22] border border-[#163B44] p-3.5 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-sm tracking-wide uppercase text-white">
                          {campaign.title}
                        </h3>
                        <Badge variant="default" className="text-[10px] bg-zinc-800 text-zinc-300 border-[#163B44]">
                          {campaign.status}
                        </Badge>
                      </div>
                      {campaign.description && (
                        <p className="text-xs text-[#8AA8B2]">
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
                              className="flex flex-col justify-between gap-3.5 rounded-xl border border-[#163B44] bg-[#051D22] p-4 hover:border-zinc-500 md:flex-row md:items-center transition-all"
                            >
                              <div className="flex min-w-0 flex-1 items-start gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#163B44] bg-[#0B2026] mt-0.5">
                                  {taskMeta.icon}
                                </div>
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <h4 className="text-xs sm:text-sm font-bold text-[#F8F7F4]">
                                      {task.title}
                                    </h4>
                                    <span className="text-[10px] font-semibold text-[#8AA8B2] uppercase">
                                      {taskMeta.label}
                                    </span>
                                    <span className="text-xs font-bold text-emerald-400">
                                      +{task.points} Pts
                                    </span>
                                  </div>
                                  {task.description && (
                                    <p className="text-xs text-[#8AA8B2] line-clamp-1">
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
                                          className="w-full rounded-xl border border-[#163B44] bg-black/60 pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:border-amber-400 focus:outline-none"
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
                                    <div className="mt-1.5 rounded-xl border border-rose-500/40 bg-rose-950/40 p-2 text-xs text-rose-300 space-y-0.5">
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

                                  {errorMsg && <p className="pt-1 text-[11px] text-rose-400">{errorMsg}</p>}
                                  {successMsg && <p className="pt-1 text-[11px] text-emerald-400">{successMsg}</p>}
                                </div>
                              </div>

                              {/* Action Buttons & Status */}
                              <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 border-t border-[#163B44] md:border-t-0 md:pt-0">
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
                                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#163B44] bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition-colors"
                                >
                                  <span>OPEN X</span>
                                  <ExternalLink className="h-3 w-3 text-zinc-400" />
                                </a>

                                {taskStatus.key === "APPROVED" ? (
                                  <button
                                    disabled
                                    className="inline-flex cursor-not-allowed items-center justify-center gap-1 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-1.5 text-xs font-medium text-emerald-300"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                    <span>DONE</span>
                                  </button>
                                ) : isCountingDown ? (
                                  <button
                                    disabled
                                    className="inline-flex cursor-not-allowed items-center justify-center gap-1 rounded-xl border border-amber-500/50 bg-amber-950/50 px-3 py-1.5 text-xs font-medium text-amber-300 animate-pulse"
                                  >
                                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-400" />
                                    <span>VERIFYING ({countdownSeconds}s)...</span>
                                  </button>
                                ) : !isTaskOpened ? (
                                  <button
                                    disabled
                                    title="Please click 'OPEN X' first"
                                    className="inline-flex cursor-not-allowed items-center justify-center gap-1 rounded-xl border border-[#163B44] bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-600 opacity-60"
                                  >
                                    <span>VERIFY TASK</span>
                                    <ArrowRight className="h-3 w-3 text-zinc-600" />
                                  </button>
                                ) : isProofRequired && !taskInput.payload.trim() ? (
                                  <button
                                    disabled
                                    title="Paste your reply or quote link first"
                                    className="inline-flex cursor-not-allowed items-center justify-center gap-1 rounded-xl border border-[#163B44] bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-600 opacity-60"
                                  >
                                    <span>VERIFY TASK</span>
                                    <ArrowRight className="h-3 w-3 text-zinc-600" />
                                  </button>
                                ) : status !== "authenticated" ? (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    className="gap-1 rounded-xl text-xs bg-[#34B7DD] text-[#04181C] hover:bg-[#6FCDE8] font-bold shadow-[0_0_15px_rgba(52,183,221,0.25)]"
                                    onClick={() => login()}
                                  >
                                    <span>CONNECT WALLET TO VERIFY</span>
                                    <ArrowRight className="h-3 w-3" />
                                  </Button>
                                ) : (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    className="gap-1 rounded-xl text-xs bg-[#34B7DD] text-[#04181C] hover:bg-[#6FCDE8] font-bold shadow-[0_0_15px_rgba(52,183,221,0.25)]"
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
                            className="space-y-3 rounded-xl border border-[#163B44] bg-[#051D22] p-4"
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <h4 className="text-xs sm:text-sm font-bold text-[#F8F7F4]">
                                    {task.title}
                                  </h4>
                                  <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/40 bg-emerald-950/30">
                                    +{task.points} Pts
                                  </Badge>
                                  <span className="text-[10px] text-zinc-500 uppercase">
                                    {task.taskType}
                                  </span>
                                </div>
                                {task.description && (
                                  <p className="text-xs text-[#8AA8B2]">{task.description}</p>
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
                              <div className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-950/40 p-3 text-xs text-amber-300">
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
                              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3 text-xs text-emerald-300">
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
                              <div className="space-y-1 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-300">
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
                                  <p className="text-xs text-zinc-500 italic">
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
                                      className="flex-1 rounded-xl border border-[#163B44] bg-black/60 px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:border-amber-400 focus:outline-none"
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
                                      className="rounded-xl border border-[#163B44] bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 focus:border-amber-400 focus:outline-none"
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
                                      className="rounded-xl text-xs bg-[#34B7DD] text-[#04181C] hover:bg-[#6FCDE8] font-bold shadow-[0_0_15px_rgba(52,183,221,0.25)]"
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
                                {errorMsg && <p className="text-xs text-rose-400 mt-1">{errorMsg}</p>}
                                {successMsg && <p className="text-xs text-emerald-400 mt-1">{successMsg}</p>}
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
              <div className="relative rounded-3xl border-2 border-gray-800 bg-gradient-to-b from-[#0B2026] via-[#0B2026] to-[#08090e] p-5 sm:p-6 shadow-[0_12px_40px_rgba(0,0,0,0.6)] space-y-5 overflow-hidden backdrop-blur-md">
                {/* Luxury Foil Sheen Top Edge */}
                <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400/80 to-transparent" />

                {/* Ambient Back Glows */}
                <div className="pointer-events-none absolute -top-20 -right-20 h-48 w-48 rounded-full bg-amber-500/10 blur-[80px]" />
                <div className="pointer-events-none absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-cyan-500/10 blur-[80px]" />

                {/* Character Preview Header */}
                <div className="relative flex items-center justify-between border-b border-gray-800/80 pb-3.5">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                    <h3 className="font-display text-sm tracking-wide uppercase text-white">
                      Character &amp; Wardrobe
                    </h3>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase ${
                      isTraitsComplete
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                        : "border-gray-700 bg-gray-800/60 text-gray-300"
                    }`}
                  >
                    {isTraitsComplete ? "Full Color ✨" : "In Progress"}
                  </span>
                </div>

                {/* Character Pixel-Art Preview Frame */}
                <div className="relative flex flex-col items-center justify-center rounded-2xl border border-gray-800/80 bg-gradient-to-b from-[#071F24]/95 via-[#051D22] to-[#06070a] p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)] overflow-hidden">
                  {/* Radial Spotlight Halo behind avatar */}
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(251,191,36,0.12),transparent_70%)]" />

                  <div className="relative">
                    <UserAvatar
                      identifier={address}
                      hasInventory={inventoryItems.length > 0}
                      size="xl"
                      className={`border-2 rounded-2xl shadow-sm [image-rendering:pixelated] transition-all duration-300 ${
                        isTraitsComplete
                          ? "border-amber-400 shadow-[0_0_35px_rgba(251,191,36,0.3)] ring-2 ring-amber-400/20"
                          : "border-gray-700 shadow-sm"
                      }`}
                    />
                    {isTraitsComplete && (
                      <div className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 text-black shadow-[0_0_12px_rgba(251,191,36,0.5)]">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>

                  {/* Clean Prestige Pill (replaces bulky share button) */}
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-gradient-to-r from-amber-500/15 via-yellow-400/10 to-amber-500/15 px-3 py-1 shadow-[0_0_15px_rgba(251,191,36,0.12)]">
                    <span className="relative flex h-2 w-2">
                      {isTraitsComplete && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                      )}
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                      {isTraitsComplete ? "Full Outfit Assembled" : "Trait Assembly In-Progress"}
                    </span>
                  </div>

                  <h4 className="mt-2.5 font-display text-sm tracking-wide text-white uppercase text-center">
                    {isTraitsComplete ? "Elychimp Outfit Complete!" : "Elychimp In-Progress Avatar"}
                  </h4>
                  <p className="mt-0.5 text-[11px] text-[#8AA8B2] text-center">
                    <span className="text-amber-400 font-bold">{heldCategories.length}</span> of 5 Distinct Categories Collected
                  </p>
                </div>

                {/* Five Trait Categories (Owned in Color, Missing in Grayscale) */}
                {statusResult?.status?.phase !== "REVOKED" && (
                  <div className="space-y-2.5">
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between border-b border-gray-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-xs tracking-wider uppercase text-white font-bold">
                          Required Trait Categories (5 of 5)
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 self-start sm:self-auto">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-300 shadow-sm">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                          <span>{heldCategories.length} / 5 Collected</span>
                        </span>
                      </div>
                    </div>

                    {/* Micro Progress Bar */}
                    <div className="h-1.5 w-full bg-black/80 rounded-full overflow-hidden border border-gray-800/80">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-400 via-amber-400 to-yellow-300 transition-all duration-500 rounded-full"
                        style={{ width: `${(heldCategories.length / 5) * 100}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                      {TRAIT_CATEGORIES.map((cat) => {
                        const isHeld = heldCategories.includes(cat);
                        const theme = CATEGORY_THEMES[cat];
                        return (
                          <div
                            key={cat}
                            className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all ${
                              isHeld
                                ? `${theme.heldClass} font-bold backdrop-blur-xs`
                                : "border-gray-800/80 bg-[#090b10] text-gray-500 grayscale opacity-50"
                            }`}
                          >
                            <div className="mb-1">
                              {isHeld ? (
                                <CheckCircle2 className={`h-3.5 w-3.5 ${theme.checkColor}`} />
                              ) : (
                                <XCircle className="h-3.5 w-3.5 text-gray-600" />
                              )}
                            </div>
                            <span className="text-[10px] sm:text-[11px] font-bold tracking-tight">
                              {cat}
                            </span>
                            <span className="text-[9px] mt-0.5 opacity-90">
                              {isHeld ? "Owned ✓" : "Missing"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Inventory Summary (Total items and duplicates) */}
                <div className="rounded-2xl border border-gray-800/80 bg-gradient-to-b from-[#071F24]/90 to-[#08090e]/95 p-4 space-y-3 text-sm text-[#DBF2F9] shadow-inner">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl border border-gray-800/90 bg-black/50 p-2.5 text-center">
                      <span className="block text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                        Total Items
                      </span>
                      <span className="font-display text-xl font-bold text-white mt-0.5 block">
                        {inventoryItems.length}
                      </span>
                    </div>
                    <div className="rounded-xl border border-gray-800/90 bg-black/50 p-2.5 text-center">
                      <span className="block text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                        Duplicates / Extra
                      </span>
                      <span className="font-display text-xl font-bold text-cyan-300 mt-0.5 block">
                        {duplicateCount}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 leading-relaxed border-t border-gray-800/80 pt-2.5">
                    Duplicates remain in your backpack. Qualification requires 1 item in each of the 5 distinct categories.
                  </p>
                </div>

                {/* Trait Lootbox Drops CTA */}
                <div className="relative rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-[#0e1018] to-amber-500/5 p-4 flex items-center justify-between gap-3 overflow-hidden shadow-sm">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <p className="font-display text-xs uppercase tracking-wider text-white truncate">
                        Trait Lootbox Drops
                      </p>
                    </div>
                    <p className="text-[11px] text-gray-400 truncate">
                      Need more traits to complete your collection?
                    </p>
                  </div>
                  <Link href="/drops" className="shrink-0">
                    <Button
                      variant="primary"
                      size="sm"
                      className="rounded-xl border border-yellow-300/60 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-xs font-bold uppercase tracking-wider text-black shadow-[0_0_15px_rgba(245,158,11,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      <span>Go to Drops</span>
                      <ExternalLink className="ml-1.5 h-3 w-3" />
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
              <div className="rounded-2xl border border-[#163B44] bg-[#0B2026] p-5 sm:p-6 shadow-[0_4px_24px_rgba(0,0,0,0.45)] space-y-5">
                <div className="flex items-center justify-between border-b border-[#163B44] pb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-sm tracking-wide uppercase text-white">
                      Whitelist Status & Allocation
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Phase Badges */}
                    {statusResult?.status?.phase === "SLOT_ALLOCATED" && (
                      <Badge variant="default" className="border-emerald-500/40 bg-emerald-950/60 text-emerald-300 font-bold text-xs uppercase">
                        GTD SLOT ALLOCATED
                      </Badge>
                    )}
                    {statusResult?.status?.phase === "FCFS_REGISTERED" && (
                      <Badge variant="default" className="border-cyan-500/40 bg-cyan-950/60 text-cyan-300 font-bold text-xs">
                        FCFS Directory (Registered)
                      </Badge>
                    )}
                    <Badge variant="outline" className={`text-xs font-bold ${qualificationState.badgeClass}`}>
                      {qualificationState.title}
                    </Badge>
                  </div>
                </div>

                {/* Steps 1 to 5 Status Overview */}
                <div className="space-y-3 text-sm text-[#DBF2F9]">
                  {/* Step 1: Wallet Connection */}
                  <div className="flex items-center justify-between rounded-xl border border-[#163B44] bg-[#051D22] p-3 text-xs">
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
                  <div className="flex items-center justify-between rounded-xl border border-[#163B44] bg-[#051D22] p-3 text-xs">
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
                  <div className="rounded-xl border border-[#163B44] bg-[#051D22] p-3 text-xs space-y-2">
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
                          className="flex items-center text-[10px] font-medium text-zinc-400 hover:text-white"
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
                      <div className="mt-2 pt-2 border-t border-[#163B44] space-y-2">
                        {campaigns.flatMap((c) => c.tasks).map((t) => {
                          const st = getTaskStatus(t);
                          return (
                            <div
                              key={t.id}
                              className="flex items-center justify-between text-[11px] bg-black/40 p-2 rounded-lg border border-[#163B44]"
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="font-semibold text-zinc-200 truncate">{t.title}</span>
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
                  <div className="flex items-center justify-between rounded-xl border border-[#163B44] bg-[#051D22] p-3 text-xs">
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
                          : "border-[#163B44] bg-zinc-800/40 text-zinc-400"
                      }`}
                    >
                      {isTraitsComplete ? "All 5 Complete ✓" : "In Progress"}
                    </Badge>
                  </div>

                  {/* Step 5: Whitelist Qualification & Real Allocation Status */}
                  <div className="rounded-xl border border-[#163B44] bg-[#051D22] p-3.5 text-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-black font-extrabold text-[10px]">
                          5
                        </div>
                        <span className="font-semibold text-white text-xs">
                          Whitelist Allocation
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-semibold text-zinc-400 border-[#163B44] bg-zinc-800/40">
                        Allocation Details
                      </Badge>
                    </div>

                    {/* Detailed Backend Qualification Results */}
                    {statusResult?.status?.phase === "SLOT_ALLOCATED" && (() => {
                       const review = getGtdReviewDetails(statusResult.status.reviewStatus);
                       const ReviewIcon = review.icon;
                       const slotNum = statusResult.status.slotNumber;
                       const paddedSlot = slotNum ? String(slotNum).padStart(4, "0") : "0001";
                       const gtdXUsername = statusResult?.status?.details?.xUsername;
                       const tweetText = encodeURIComponent(
                         `Just secured Guaranteed Whitelist Slot #${slotNum} in the @Elychimp Syndicate! 🐒🔥\n\n5/5 Outfit Fit assembled on @Enter_elysium (Hyperliquid L2).\n\nRule the streets:`
                       );
                       const shareUrl = typeof window !== "undefined" ? window.location.origin : "https://elychimp.xyz";
                       const tweetHref = `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(shareUrl)}`;
                       const displayName = xName || (gtdXUsername ? `@${gtdXUsername}` : address ? shortenAddress(address) : "Syndicate Member");
                       const operatorHandle = gtdXUsername ? `@${gtdXUsername}` : "—";
                       const allocatedDate = statusResult.status.allocatedAt
                         ? new Date(statusResult.status.allocatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                         : "—";
                       const gtdAvatarUrl = address ? `/api/renders/avatar/${encodeURIComponent(address)}` : undefined;

                       return (
                         <div className="space-y-3">
                           {/* Lanyard ID Badge Card (Image 2 style) */}
                           <div className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#a3a7c8] to-[#bcc0dc] p-2.5 sm:p-4 shadow-xl select-none">
                             {/* Translucent Acrylic Sleeve */}
                             <div className="relative mx-auto rounded-[18px] border-2 border-white/80 bg-white/40 p-1.5 sm:p-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.18)] backdrop-blur-sm">
                               {/* Top Lanyard Slot */}
                               <div className="mx-auto mb-2 h-2.5 w-20 rounded-full border border-white/80 bg-[#7b809d] shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]" />

                               {/* Inner White Paper Card */}
                               <div className="relative overflow-hidden rounded-xl border border-black/10 bg-[#fafafd] shadow-sm">
                                 {/* Header: Forest Green Syndicate Band */}
                                 <div className="flex items-center justify-between bg-[#16452d] px-3 sm:px-4 py-2 sm:py-2.5 text-white border-b-2 border-[#2d704c]">
                                   <div className="flex items-center gap-2">
                                     {/* eslint-disable-next-line @next/next/no-img-element */}
                                     <img
                                       src="/images/elychimp-logo.png"
                                       alt="Elychimp Logo"
                                       className="h-7 sm:h-9 w-auto object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.3)]"
                                     />
                                     <div>
                                       <h4 className="font-display text-xs sm:text-sm uppercase tracking-wide leading-none text-white">
                                         Elychimp Syndicate
                                       </h4>
                                       <span className="text-[7px] sm:text-[9px] text-emerald-200 tracking-wider font-semibold">
                                         Official Syndicate ID Badge
                                       </span>
                                     </div>
                                   </div>

                                   {/* Slot No. Tag */}
                                   <div className="-rotate-2 rounded-sm bg-emerald-300/90 px-2 sm:px-2.5 py-0.5 sm:py-1 font-mono text-[9px] sm:text-[11px] text-emerald-950 shadow-sm border border-emerald-400/80 font-bold">
                                     <span className="block text-[6px] uppercase tracking-widest text-emerald-900 leading-none">SLOT NO.</span>
                                     <span>#{paddedSlot}</span>
                                   </div>
                                 </div>

                                 {/* Main Body */}
                                 <div className="p-3 sm:p-4 flex flex-col sm:flex-row gap-3 sm:gap-5 items-start">
                                   {/* Photo ID */}
                                   <div className="flex flex-col items-center shrink-0 mx-auto sm:mx-0">
                                     <div className="relative p-1 sm:p-1.5 bg-white rounded-md border border-black/15 shadow-sm">
                                       {/* eslint-disable-next-line @next/next/no-img-element */}
                                       <img
                                         src={gtdAvatarUrl || "/images/chimp-base-bw.png"}
                                         alt="Elychimp Character"
                                         className="h-24 w-24 sm:h-32 sm:w-32 object-contain [image-rendering:pixelated] rounded"
                                         onError={(e) => { (e.target as HTMLImageElement).src = "/images/chimp-base-bw.png"; }}
                                       />
                                       {/* Red Verification Stamp */}
                                       <div className="absolute -bottom-2 -left-2 pointer-events-none -rotate-12 border-[1.5px] border-red-600/85 rounded-full text-center text-red-600 font-display leading-none bg-white/80 shadow-sm">
                                         <div className="rounded-full border border-red-600/60 p-1 sm:p-1.5 flex flex-col items-center justify-center w-14 sm:w-16 h-14 sm:h-16">
                                           <span className="text-[5px] sm:text-[6px] font-mono font-bold tracking-widest text-red-600">★ ELYCHIMP ★</span>
                                           <span className="text-[7px] sm:text-[8px] font-black tracking-wider my-0.5 text-red-600">GUARANTEED</span>
                                           <span className="text-[4px] sm:text-[5px] font-mono text-red-600/80">CLEARANCE</span>
                                         </div>
                                       </div>
                                     </div>
                                     <div className="mt-2 w-full rounded bg-[#111827] px-2 py-0.5 text-center text-white font-display text-[7px] sm:text-[9px] tracking-wider shadow-sm uppercase">
                                       Guaranteed Minter Pass
                                     </div>
                                   </div>

                                   {/* Info Fields */}
                                   <div className="flex-1 min-w-0 space-y-1.5 sm:space-y-2 text-sm text-[#DBF2F9] text-left w-full">
                                     <div>
                                       <span className="text-[7px] sm:text-[8px] font-bold text-gray-500 uppercase tracking-widest block">NAME</span>
                                       <p className="font-display text-sm sm:text-lg uppercase tracking-wider text-gray-900 leading-tight truncate">
                                         {displayName}
                                       </p>
                                     </div>
                                     <div>
                                       <span className="text-[7px] sm:text-[8px] font-bold text-gray-500 uppercase tracking-widest block">ACCOUNT</span>
                                       <p className="font-mono text-[10px] sm:text-xs font-semibold text-gray-800 truncate">
                                         {operatorHandle}
                                       </p>
                                     </div>
                                     <div>
                                       <span className="text-[7px] sm:text-[8px] font-bold text-gray-500 uppercase tracking-widest block">WALLET ADDRESS</span>
                                       <p className="font-mono text-[9px] sm:text-[11px] font-semibold text-gray-600 truncate">
                                         {address ? shortenAddress(address) : "0x0000...0000"}
                                       </p>
                                     </div>
                                     <div>
                                       <span className="text-[7px] sm:text-[8px] font-bold text-gray-500 uppercase tracking-widest block">VISITING SINCE</span>
                                       <p className="text-[9px] sm:text-[11px] font-medium text-gray-900 truncate">
                                         {allocatedDate} • HYPERLIQUID L2
                                       </p>
                                     </div>
                                     {/* Barcode */}
                                     <div className="relative pt-0.5 h-7 sm:h-9">
                                       <div className="h-full w-full bg-[repeating-linear-gradient(90deg,#18181b,#18181b_2px,transparent_2px,transparent_4px,#18181b_4px,#18181b_7px,transparent_7px,transparent_9px)] opacity-80 rounded" />
                                       <div className="absolute inset-0 flex items-center justify-center">
                                         <span className="rounded border border-black/40 bg-white px-2 sm:px-3 py-0.5 font-mono text-[8px] sm:text-[9px] font-bold text-gray-900 shadow-sm">
                                           elychimp.xyz
                                         </span>
                                       </div>
                                     </div>
                                   </div>
                                 </div>

                                 {/* Bottom Serial Strip */}
                                 <div className="border-t border-zinc-200 bg-[#edeef2] px-3 sm:px-4 py-1.5 sm:py-2 text-center font-mono text-[9px] sm:text-[11px] font-semibold tracking-wider text-zinc-700 select-all uppercase">
                                   SERIAL: ELY-GTD-{paddedSlot} &bull; ELYCHIMP.XYZ
                                 </div>
                               </div>

                               {/* Banana Stickers */}
                               <BananaSticker className="absolute top-8 sm:top-10 right-20 sm:right-28 w-14 sm:w-20 h-7 sm:h-10 -rotate-12" />
                               <BananaSticker className="absolute top-28 sm:top-36 -right-2 sm:right-1 w-12 sm:w-16 h-6 sm:h-8 rotate-24" />
                               <BananaSticker className="absolute bottom-6 sm:bottom-8 right-6 sm:right-10 w-16 sm:w-22 h-8 sm:h-11 rotate-6" />

                               {/* Plastic Glare */}
                               <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent rounded-[16px]" />
                             </div>
                           </div>

                           {/* Review Note */}
                           <div className="flex items-start gap-2.5 rounded-xl border border-[#163B44] bg-[#051D22] p-3 text-[11px] text-[#8AA8B2]">
                             <ReviewIcon className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                             <div className="space-y-0.5 min-w-0">
                               <div className="flex items-center gap-2">
                                 <Badge variant={review.badgeVariant} className={`text-[10px] ${review.colorClass}`}>
                                   {review.label}
                                 </Badge>
                                 <span className="text-zinc-300 font-semibold">{review.subtext}</span>
                               </div>
                               <p className="text-zinc-400 text-[10px] leading-relaxed pt-0.5">
                                 Your Guaranteed Whitelist slot is locked in the syndicate registry. Keep this wallet and X account connected for snapshot export.
                               </p>
                             </div>
                           </div>

                           {/* Action Buttons */}
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                             <Button
                               type="button"
                               onClick={() => setIsShareModalOpen(true)}
                               variant="outline"
                               size="lg"
                               className="w-full gap-2 rounded-xl border-amber-400/50 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40 hover:border-amber-400 font-bold text-xs uppercase tracking-wider py-3.5 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]"
                             >
                               <Download className="h-4 w-4 text-amber-400" />
                               <span>Download Pass Card</span>
                             </Button>
                             <a href={tweetHref} target="_blank" rel="noopener noreferrer" className="block w-full">
                               <Button
                                 variant="primary"
                                 size="lg"
                                 className="w-full gap-2 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-[#04181C] font-bold text-xs uppercase tracking-wider py-3.5 shadow-[0_0_20px_rgba(245,158,11,0.25)] cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]"
                               >
                                 <XLogo className="h-3.5 w-3.5 fill-black" />
                                 <span>Share on X</span>
                                 <ExternalLink className="h-3 w-3" />
                               </Button>
                             </a>
                           </div>
                         </div>
                       );
                     })()}

                    {statusResult?.status?.phase === "FCFS_REGISTERED" && (() => {
                       const queueNum = statusResult.status.queueNumber;
                       const paddedQueue = queueNum ? String(queueNum).padStart(4, "0") : "0001";
                       const fcfsXUsername = statusResult?.status?.details?.xUsername;
                       const tweetText = encodeURIComponent(
                         `Registered in the @Elychimp FCFS Whitelist Directory #${queueNum}! 🐒💨 Assembled 5/5 traits on @Enter_elysium (Hyperliquid L2).\n\nRule the streets:`
                       );
                       const shareUrl = typeof window !== "undefined" ? window.location.origin : "https://elychimp.xyz";
                       const tweetHref = `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(shareUrl)}`;
                       const displayName = xName || (fcfsXUsername ? `@${fcfsXUsername}` : address ? shortenAddress(address) : "Syndicate Member");
                       const fcfsOperator = fcfsXUsername ? `@${fcfsXUsername}` : "—";
                       const joinedDate = statusResult.status.joinedAt
                         ? new Date(statusResult.status.joinedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                         : "—";
                       const fcfsAvatarUrl = address ? `/api/renders/avatar/${encodeURIComponent(address)}` : undefined;

                       return (
                         <div className="space-y-3">
                           {/* Lanyard ID Badge Card — FCFS Teal Variant */}
                           <div className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#9baec8] to-[#b0c4dc] p-2.5 sm:p-4 shadow-xl select-none">
                             {/* Translucent Acrylic Sleeve */}
                             <div className="relative mx-auto rounded-[18px] border-2 border-white/80 bg-white/40 p-1.5 sm:p-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.18)] backdrop-blur-sm">
                               {/* Top Lanyard Slot */}
                               <div className="mx-auto mb-2 h-2.5 w-20 rounded-full border border-white/80 bg-[#7b809d] shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]" />

                               {/* Inner White Paper Card */}
                               <div className="relative overflow-hidden rounded-xl border border-black/10 bg-[#fafafd] shadow-sm">
                                 {/* Header: Teal Syndicate Band */}
                                 <div className="flex items-center justify-between bg-[#134e5e] px-3 sm:px-4 py-2 sm:py-2.5 text-white border-b-2 border-[#1d7d8a]">
                                   <div className="flex items-center gap-2">
                                     {/* eslint-disable-next-line @next/next/no-img-element */}
                                     <img
                                       src="/images/elychimp-logo.png"
                                       alt="Elychimp Logo"
                                       className="h-7 sm:h-9 w-auto object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.3)]"
                                     />
                                     <div>
                                       <h4 className="font-display text-xs sm:text-sm uppercase tracking-wide leading-none text-white">
                                         Elychimp Syndicate
                                       </h4>
                                       <span className="text-[7px] sm:text-[9px] text-cyan-200 tracking-wider font-semibold">
                                         Official Syndicate ID Badge
                                       </span>
                                     </div>
                                   </div>

                                   {/* Queue No. Tag */}
                                   <div className="-rotate-2 rounded-sm bg-cyan-300/90 px-2 sm:px-2.5 py-0.5 sm:py-1 font-mono text-[9px] sm:text-[11px] text-cyan-950 shadow-sm border border-cyan-400/80 font-bold">
                                     <span className="block text-[6px] uppercase tracking-widest text-cyan-900 leading-none">QUEUE NO.</span>
                                     <span>#{paddedQueue}</span>
                                   </div>
                                 </div>

                                 {/* Main Body */}
                                 <div className="p-3 sm:p-4 flex flex-col sm:flex-row gap-3 sm:gap-5 items-start">
                                   {/* Photo ID */}
                                   <div className="flex flex-col items-center shrink-0 mx-auto sm:mx-0">
                                     <div className="relative p-1 sm:p-1.5 bg-white rounded-md border border-black/15 shadow-sm">
                                       {/* eslint-disable-next-line @next/next/no-img-element */}
                                       <img
                                         src={fcfsAvatarUrl || "/images/chimp-base-bw.png"}
                                         alt="Elychimp Character"
                                         className="h-24 w-24 sm:h-32 sm:w-32 object-contain [image-rendering:pixelated] rounded"
                                         onError={(e) => { (e.target as HTMLImageElement).src = "/images/chimp-base-bw.png"; }}
                                       />
                                       {/* Cyan Verification Stamp */}
                                       <div className="absolute -bottom-2 -left-2 pointer-events-none -rotate-12 border-[1.5px] border-cyan-600/85 rounded-full text-center text-cyan-700 font-display leading-none bg-white/80 shadow-sm">
                                         <div className="rounded-full border border-cyan-600/60 p-1 sm:p-1.5 flex flex-col items-center justify-center w-14 sm:w-16 h-14 sm:h-16">
                                           <span className="text-[5px] sm:text-[6px] font-mono font-bold tracking-widest text-cyan-700">★ ELYCHIMP ★</span>
                                           <span className="text-[7px] sm:text-[8px] font-black tracking-wider my-0.5 text-cyan-700">FCFS</span>
                                           <span className="text-[4px] sm:text-[5px] font-mono text-cyan-700/80">CLEARANCE</span>
                                         </div>
                                       </div>
                                     </div>
                                     <div className="mt-2 w-full rounded bg-[#134e5e] px-2 py-0.5 text-center text-white font-display text-[7px] sm:text-[9px] tracking-wider shadow-sm uppercase">
                                       FCFS Clearance Pass
                                     </div>
                                   </div>

                                   {/* Info Fields */}
                                   <div className="flex-1 min-w-0 space-y-1.5 sm:space-y-2 text-sm text-[#DBF2F9] text-left w-full">
                                     <div>
                                       <span className="text-[7px] sm:text-[8px] font-bold text-gray-500 uppercase tracking-widest block">NAME</span>
                                       <p className="font-display text-sm sm:text-lg uppercase tracking-wider text-gray-900 leading-tight truncate">
                                         {displayName}
                                       </p>
                                     </div>
                                     <div>
                                       <span className="text-[7px] sm:text-[8px] font-bold text-gray-500 uppercase tracking-widest block">ACCOUNT</span>
                                       <p className="font-mono text-[10px] sm:text-xs font-semibold text-gray-800 truncate">
                                         {fcfsOperator}
                                       </p>
                                     </div>
                                     <div>
                                       <span className="text-[7px] sm:text-[8px] font-bold text-gray-500 uppercase tracking-widest block">WALLET ADDRESS</span>
                                       <p className="font-mono text-[9px] sm:text-[11px] font-semibold text-gray-600 truncate">
                                         {address ? shortenAddress(address) : "0x0000...0000"}
                                       </p>
                                     </div>
                                     <div>
                                       <span className="text-[7px] sm:text-[8px] font-bold text-gray-500 uppercase tracking-widest block">VISITING SINCE</span>
                                       <p className="text-[9px] sm:text-[11px] font-medium text-gray-900 truncate">
                                         {joinedDate} • HYPERLIQUID L2
                                       </p>
                                     </div>
                                     {/* Barcode */}
                                     <div className="relative pt-0.5 h-7 sm:h-9">
                                       <div className="h-full w-full bg-[repeating-linear-gradient(90deg,#18181b,#18181b_2px,transparent_2px,transparent_4px,#18181b_4px,#18181b_7px,transparent_7px,transparent_9px)] opacity-80 rounded" />
                                       <div className="absolute inset-0 flex items-center justify-center">
                                         <span className="rounded border border-black/40 bg-white px-2 sm:px-3 py-0.5 font-mono text-[8px] sm:text-[9px] font-bold text-gray-900 shadow-sm">
                                           elychimp.xyz
                                         </span>
                                       </div>
                                     </div>
                                   </div>
                                 </div>

                                 {/* Bottom Serial Strip */}
                                 <div className="border-t border-zinc-200 bg-[#edeef2] px-3 sm:px-4 py-1.5 sm:py-2 text-center font-mono text-[9px] sm:text-[11px] font-semibold tracking-wider text-zinc-700 select-all uppercase">
                                   SERIAL: ELY-FCFS-{paddedQueue} &bull; ELYCHIMP.XYZ
                                 </div>
                               </div>

                               {/* Banana Stickers */}
                               <BananaSticker className="absolute top-8 sm:top-10 right-20 sm:right-28 w-14 sm:w-20 h-7 sm:h-10 -rotate-12" />
                               <BananaSticker className="absolute top-28 sm:top-36 -right-2 sm:right-1 w-12 sm:w-16 h-6 sm:h-8 rotate-24" />
                               <BananaSticker className="absolute bottom-6 sm:bottom-8 right-6 sm:right-10 w-16 sm:w-22 h-8 sm:h-11 rotate-6" />

                               {/* Plastic Glare */}
                               <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent rounded-[16px]" />
                             </div>
                           </div>

                           {/* Eligibility Note */}
                           {statusResult.status.isFullyQualified ? (
                             <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3">
                               <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                               <div className="space-y-0.5">
                                 <p className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">All 5 Requirements Satisfied ✓</p>
                                 <p className="text-[#8AA8B2] text-[10px] leading-relaxed">
                                   Your wallet is eligible for inclusion in the OpenSea FCFS allowlist export.
                                 </p>
                               </div>
                             </div>
                           ) : (
                             <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-950/40 p-3">
                               <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                               <div className="space-y-0.5">
                                 <p className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">Action Required — Complete 5/5 Requirements</p>
                                 <p className="text-[#8AA8B2] text-[10px] leading-relaxed">
                                   Complete missing requirements to qualify for the OpenSea FCFS allowlist export.
                                 </p>
                               </div>
                             </div>
                           )}

                           {/* Action Buttons — only if fully qualified */}
                           {statusResult.status.isFullyQualified && (
                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                               <Button
                                 type="button"
                                 onClick={() => setIsShareModalOpen(true)}
                                 variant="outline"
                                 size="lg"
                                 className="w-full gap-2 rounded-xl border-cyan-400/50 bg-cyan-950/30 text-cyan-300 hover:bg-cyan-900/40 hover:border-cyan-400 font-bold text-xs uppercase tracking-wider py-3.5 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]"
                               >
                                 <Download className="h-4 w-4 text-cyan-400" />
                                 <span>Download Pass Card</span>
                               </Button>
                               <a href={tweetHref} target="_blank" rel="noopener noreferrer" className="block w-full">
                                 <Button
                                   variant="primary"
                                   size="lg"
                                   className="w-full gap-2 rounded-xl bg-[#34B7DD] hover:bg-[#6FCDE8] text-[#04181C] font-bold text-xs uppercase tracking-wider py-3.5 shadow-[0_0_20px_rgba(52,183,221,0.25)] cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]"
                                 >
                                   <XLogo className="h-3.5 w-3.5 fill-black" />
                                   <span>Share on X</span>
                                   <ExternalLink className="h-3 w-3" />
                                 </Button>
                               </a>
                             </div>
                           )}

                           {/* Notice */}
                           <div className="text-[10px] text-[#8AA8B2]">
                             Registration is for the OpenSea FCFS allowlist minting stage and does not guarantee allocation.
                           </div>
                         </div>
                       );
                     })()}

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
                      <div className="rounded-xl border border-[#163B44] bg-zinc-900/60 p-3 text-xs text-zinc-400 space-y-1">
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

      {/* Shareable Collectible Avatar & Pass Card Modal */}
      <SyndicateShareCardModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        slotNumber={statusResult?.status?.slotNumber}
        queueNumber={statusResult?.status?.queueNumber}
        phase={statusResult?.status?.phase}
        isFullyQualified={statusResult?.status?.isFullyQualified}
        address={address ?? undefined}
        xUsername={statusResult?.status?.details?.xUsername}
        xName={xName ?? undefined}
        avatarUrl={address ? `/api/renders/avatar/${encodeURIComponent(address)}` : undefined}
        heldCategoriesCount={heldCategories.length}
        allocatedAt={statusResult?.status?.allocatedAt ?? statusResult?.status?.joinedAt}
      />
    </div>
  );
}
