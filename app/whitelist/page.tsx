"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { LogIn, RefreshCw, Check } from "lucide-react";

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
import { getAvatarPublicUrl } from "@/lib/inventory/avatar-client";
import { shortenAddress } from "@/lib/auth/address";

const TRAIT_CATEGORIES = ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"] as const;

const CATEGORY_THEMES: Record<
  string,
  { heldClass: string; unheldClass: string; checkColor: string }
> = {
  BG: {
    heldClass: "border-sky-500/40 bg-sky-950/40 text-sky-300 shadow-[0_0_12px_rgba(6,182,212,0.15)]",
    unheldClass: "border-[#163B44] bg-[#051D22] text-zinc-500",
    checkColor: "text-sky-400",
  },
  FUR: {
    heldClass: "border-amber-500/40 bg-amber-950/40 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.15)]",
    unheldClass: "border-[#163B44] bg-[#051D22] text-zinc-500",
    checkColor: "text-amber-400",
  },
  CLOTHING: {
    heldClass: "border-violet-500/40 bg-violet-950/40 text-violet-300 shadow-[0_0_12px_rgba(192,132,252,0.15)]",
    unheldClass: "border-[#163B44] bg-[#051D22] text-zinc-500",
    checkColor: "text-violet-400",
  },
  HEADWEAR: {
    heldClass: "border-emerald-500/40 bg-emerald-950/40 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.15)]",
    unheldClass: "border-[#163B44] bg-[#051D22] text-zinc-500",
    checkColor: "text-emerald-400",
  },
  EYEWEAR: {
    heldClass: "border-teal-500/40 bg-teal-950/40 text-teal-300 shadow-[0_0_12px_rgba(20,184,166,0.15)]",
    unheldClass: "border-[#163B44] bg-[#051D22] text-zinc-500",
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
              : err === "X_ACCOUNT_ALREADY_LINKED"
                ? "This X account is already linked to another Elychimp profile. Each X account can only be linked to a single wallet."
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
  const [avatarVersion, setAvatarVersion] = useState<number>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("chimphood_avatar_version");
        if (stored) return Number(stored);
      } catch {}
    }
    return Date.now();
  });
  const [showTasksInViewB, setShowTasksInViewB] = useState(false);

  // Sync avatar version across components, events, and tabs
  useEffect(() => {
    const handleAvatarUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ version?: number }>;
      if (customEvent.detail?.version) {
        setAvatarVersion(customEvent.detail.version);
      } else {
        setAvatarVersion(Date.now());
      }
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "chimphood_avatar_version" && e.newValue) {
        setAvatarVersion(Number(e.newValue));
      }
    };
    window.addEventListener("avatar-updated", handleAvatarUpdate);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("avatar-updated", handleAvatarUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

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
            setAvatarVersion(Date.now());
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

  function getTaskTypeMeta(task: ActiveCampaignTask): { label: string } {
    const t = (task.taskType || "").toUpperCase();
    const code = (task.taskCode || "").toUpperCase();
    const title = (task.title || "").toUpperCase();

    if (t === "SOCIAL_X_REPLY") {
      return { label: "REPLY / ONCE" };
    }
    if (t === "SOCIAL_X_QUOTE") {
      return { label: "QUOTE / ONCE" };
    }
    if (t === "SOCIAL_X_LIKE") {
      return { label: "LIKE / ONCE" };
    }
    if (t === "SOCIAL_X_REPOST") {
      return { label: "REPOST / ONCE" };
    }
    if (t === "SOCIAL_X_FOLLOW") {
      if (code.includes("REPLY") || title.includes("REPLY")) {
        return { label: "REPLY / ONCE" };
      }
      if (code.includes("QUOTE") || title.includes("QUOTE")) {
        return { label: "QUOTE / ONCE" };
      }
      return { label: "FOLLOW / ONCE" };
    }

    if (code.includes("REPLY") || title.includes("REPLY")) {
      return { label: "REPLY / ONCE" };
    }
    if (code.includes("QUOTE") || title.includes("QUOTE")) {
      return { label: "QUOTE / ONCE" };
    }
    if (code.includes("COMMENT") || title.includes("COMMENT")) {
      return { label: "COMMENT / ONCE" };
    }
    if (code.includes("REPOST") || code.includes("RETWEET") || title.includes("REPOST")) {
      return { label: "REPOST / ONCE" };
    }
    if (code.includes("LIKE") || title.includes("LIKE")) {
      return { label: "LIKE / ONCE" };
    }
    if (code.includes("FOLLOW") || title.includes("FOLLOW")) {
      return { label: "FOLLOW / ONCE" };
    }

    return { label: "SOCIAL / ONCE" };
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
            [task.id]: "Task verified & completed!",
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

  // Fetch Whitelist status (reusable for initial load and manual retry on error)
  const loadWhitelistStatus = useCallback(async () => {
    const targetAddress =
      address ||
      (typeof window !== "undefined"
        ? sessionStorage.getItem("elychimp_wl_address_cache")
        : null);

    if (!targetAddress) return;

    setStatusLoading(true);
    setStatusError(null);
    try {
      const data = await fetchWhitelistStatus(targetAddress);
      updateStatusResult(data);
    } catch (err) {
      setStatusError((err as Error).message || "Failed to check status.");
    } finally {
      setStatusLoading(false);
    }
  }, [address, updateStatusResult]);

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
        };
      case "UNDER_REVIEW":
        return {
          label: "Under Verification",
          subtext: "Under Verification — Account details being audited.",
          badgeVariant: "warning" as const,
          colorClass: "border-amber-500/40 bg-amber-950/50 text-amber-300",
        };
      case "FLAGGED":
        return {
          label: "Notice / Action Required",
          subtext:
            "Notice — Please review your linked accounts and task requirements. Slot remains active.",
          badgeVariant: "warning" as const,
          colorClass: "border-rose-500/40 bg-rose-950/50 text-rose-300",
        };
      case "NOT_REVIEWED":
      default:
        return {
          label: "Pending Routine Review",
          subtext: "Slot Confirmed — Routine verification in progress.",
          badgeVariant: "outline" as const,
          colorClass: "border-cyan-500/40 bg-cyan-950/50 text-cyan-300",
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

  // Whitelist qualification status text mapped to the unified Whitelist goal
  const qualificationState = useMemo(() => {
    const phase = statusResult?.status?.phase;
    if (phase === "REVOKED") {
      return {
        key: "REVOKED" as const,
        title: "REVOKED",
        badgeClass: "bg-rose-950/60 text-rose-300 border-rose-500/40",
      };
    }
    if (
      phase === "SLOT_ALLOCATED" ||
      phase === "IN_QUEUE" ||
      phase === "QUALIFIED" ||
      statusResult?.status?.isFullyQualified
    ) {
      return {
        key: "Whitelisted" as const,
        title: "Whitelisted",
        badgeClass: "bg-emerald-950/60 text-emerald-300 border-emerald-500/40",
      };
    }
    return {
      key: "Incomplete" as const,
      title: "In Progress",
      badgeClass: "bg-amber-950/60 text-amber-300 border-amber-500/40",
    };
  }, [statusResult]);

  // Robust connection checks: Step 1 requires an authenticated SIWE session (or cached verified status during initial session check)
  const isWalletConnected =
    status === "authenticated" ||
    (status === "checking" && Boolean(statusResult?.status?.details?.hasVerifiedWallet));

  const isXLinked = Boolean(statusResult?.status?.details?.hasLinkedX);
  const isTasksComplete = areAllMandatoryApproved;
  const isTraitsComplete = heldCategories.length === 5;
  const isWhitelistSecured =
    statusResult?.status?.phase === "SLOT_ALLOCATED" ||
    statusResult?.status?.phase === "IN_QUEUE" ||
    statusResult?.status?.phase === "QUALIFIED" ||
    Boolean(statusResult?.status?.isFullyQualified);

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

  // Step accessibility check for sequential progression & backward navigation
  const isStepAccessible = useCallback(
    (stepNum: number): boolean => {
      if (isRevoked) return true;
      // Step 1 is always accessible
      if (stepNum === 1) return true;
      // Step 2 requires wallet to be connected
      if (stepNum === 2) return isWalletConnected;
      // Step 3 requires wallet and linked X account
      if (stepNum === 3) return isWalletConnected && isXLinked;
      // Steps 4 and 5 require wallet, linked X, and all mandatory tasks completed
      if (stepNum === 4 || stepNum === 5) {
        return isWalletConnected && isXLinked && isTasksComplete;
      }
      return false;
    },
    [isRevoked, isWalletConnected, isXLinked, isTasksComplete],
  );

  // Determine if selectedStep is accessible; if not, ignore it so it falls back to calculatedStep
  const isSelectedAccessible = selectedStep !== null && isStepAccessible(selectedStep);
  const effectiveSelectedStep = isSelectedAccessible ? selectedStep : null;

  // Active step computation:
  // 1. If explicit hash/step is targeted and accessible, honor it directly.
  // 2. If session in progress and cached step is available, do not flash step 1 while background SIWE/status is resolving.
  // 3. Otherwise, use calculatedStep.
  const activeStepNumber =
    effectiveSelectedStep !== null
      ? effectiveSelectedStep
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

  // Guard URL hash: if hash points to a locked/inaccessible step, redirect to calculatedStep
  useEffect(() => {
    if (status !== "checking" && selectedStep !== null && !isStepAccessible(selectedStep)) {
      setSelectedStep(null);
      if (typeof window !== "undefined") {
        const targetHash =
          calculatedStep === 3
            ? "#tasks"
            : calculatedStep === 4
              ? "#traits"
              : calculatedStep === 5
                ? "#status"
                : calculatedStep === 2
                  ? "#x"
                  : "#wallet";
        window.history.replaceState(null, "", targetHash);
      }
    }
  }, [selectedStep, isStepAccessible, calculatedStep, status]);

  // Smooth scroll to target hash section if explicitly requested (e.g. #tasks, #traits, #status)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const h = (window.location.hash || "").toLowerCase();
      if (h === "#tasks" || h === "#task") {
        const el = document.getElementById("tasks");
        if (el && typeof el.scrollIntoView === "function") {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      } else if (h === "#traits" || h === "#trait") {
        const el = document.getElementById("traits");
        if (el && typeof el.scrollIntoView === "function") {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      } else if (h === "#status") {
        const el = document.getElementById("status");
        if (el && typeof el.scrollIntoView === "function") {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }
  }, [activeStepNumber]);

  return (
    <div className="min-h-screen bg-[#04181C] text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* =======================================================================
            HEADER & 5-STEP HORIZONTAL PROGRESS INDICATOR (Elyzuma Luxury Aesthetic)
        ======================================================================= */}
        <header className="relative overflow-hidden rounded-[28px] sm:rounded-[32px] border border-cyan-500/25 bg-gradient-to-b from-[#0c2831]/90 via-[#071d24]/95 to-[#031116]/98 p-6 sm:p-8 backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),inset_0_0_24px_rgba(52,183,221,0.05),0_24px_50px_-12px_rgba(0,0,0,0.7)] transition-all">
          {/* Top rim highlight line */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />

          {/* Ambient cyan glow orbs */}
          <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-teal-500/10 blur-3xl" />

          <div className="relative z-10 space-y-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-wider text-white">
                    <span className="bg-gradient-to-r from-white via-[#dbf2f9] to-[#6fcde8] bg-clip-text text-transparent drop-shadow-sm">
                      Whitelist Portal
                    </span>
                  </h1>
                </div>
                <p className="text-xs sm:text-sm text-[#8AA8B2]">
                  Check allocation eligibility, registration status, and Elychimp Whitelist distribution details.
                </p>
              </div>
            </div>

            {/* Horizontal Five-Step Progress Indicator */}
            <div className="border-t border-cyan-500/20 pt-4">
              <div className="flex items-center justify-between gap-1 sm:gap-2 overflow-x-auto pb-1 text-xs scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none]">
                {[
                  { num: 1, label: "WALLET", done: isWalletConnected },
                  { num: 2, label: "X SYNC", done: isXLinked },
                  { num: 3, label: "TASKS", done: isTasksComplete },
                  { num: 4, label: "TRAITS", done: isTraitsComplete },
                  { num: 5, label: "STATUS", done: isWhitelistSecured },
                ].map((step, idx) => {
                  const isActive = activeStepNumber === step.num;
                  const isAccessible = isStepAccessible(step.num);
                  const disabledTooltip = !isAccessible
                    ? step.num === 2
                      ? "Connect wallet first"
                      : step.num === 3
                        ? "Link X (Twitter) account first"
                        : "Complete all campaign tasks first"
                    : undefined;

                  return (
                    <React.Fragment key={step.label}>
                      <button
                        type="button"
                        disabled={!isAccessible}
                        aria-disabled={!isAccessible}
                        title={disabledTooltip}
                        onClick={() => {
                          if (!isAccessible) return;
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
                        className={`flex items-center gap-1 sm:gap-1.5 shrink-0 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl border transition-all text-[11px] sm:text-xs ${
                          !isAccessible
                            ? "border-[#163B44]/40 bg-[#051D22]/40 text-zinc-600 cursor-not-allowed opacity-40 select-none"
                            : step.done
                              ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300 font-medium cursor-pointer hover:border-emerald-400"
                              : isActive
                                ? "border-amber-400/60 bg-amber-950/40 text-amber-300 font-medium shadow-[0_0_12px_rgba(251,191,36,0.2)] cursor-pointer hover:border-amber-400/80"
                                : "border-[#163B44] bg-[#051D22] text-zinc-400 cursor-pointer hover:text-white hover:border-cyan-500/50"
                        }`}
                      >
                        <span
                          className={`flex h-4.5 w-4.5 sm:h-5 sm:w-5 items-center justify-center rounded-full text-[10px] sm:text-xs font-bold shrink-0 ${
                            !isAccessible
                              ? "bg-zinc-900 text-zinc-600"
                              : step.done
                                ? "bg-emerald-500 text-black font-bold"
                                : isActive
                                  ? "bg-amber-400 text-black font-bold"
                                  : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {step.num}
                        </span>
                        <span className="tracking-wide uppercase font-semibold">{step.label}</span>
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
          </div>
        </header>

        {/* Global Whitelist Status Loading / Error Feedback */}
        {statusLoading && !statusResult && isWalletConnected && !statusError && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-2xl border border-cyan-500/30 bg-[#071F24]/90 px-4 py-3 text-xs sm:text-sm text-cyan-300 font-medium"
          >
            Syncing Whitelist status...
          </div>
        )}

        {statusError && (
          <div
            role="alert"
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-rose-500/40 bg-rose-950/40 p-4 text-xs sm:text-sm text-rose-300 shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
          >
            <div className="space-y-0.5">
              <p className="font-semibold text-rose-200">Failed to load Whitelist status:</p>
              <p>{statusError}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadWhitelistStatus()}
              disabled={statusLoading}
              className="rounded-xl self-start sm:self-auto shrink-0 text-xs sm:text-sm border-rose-500/40 bg-rose-950/60 text-rose-200 hover:bg-rose-900/60"
            >
              <span>{statusLoading ? "Retrying..." : "Retry Status"}</span>
            </Button>
          </div>
        )}

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
            <div className="border-b border-[#163B44] pb-4">
              <div>
                <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#F59E0B]">
                  Step 1 of 5
                </span>
                <h2 className="font-display text-xl sm:text-2xl uppercase tracking-wider text-white">
                  Connect EVM Wallet
                </h2>
              </div>
            </div>

            {/* Notice / Instructions */}
            <div className="rounded-xl border border-[#163B44] bg-[#051D22] p-4 sm:p-5 space-y-2">
              <p className="font-bold text-[#F8F7F4] text-base sm:text-lg">
                A signature, not a transaction.
              </p>
              <p className="text-[#8AA8B2] leading-relaxed text-sm sm:text-base">
                We only verify your public address. Signing in is an off-chain message that costs zero gas and cannot move any funds.
              </p>
            </div>

            {authError && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3.5 text-xs sm:text-sm text-rose-300">
                <span className="truncate">{authError}</span>
                {dismissError && (
                  <button
                    onClick={dismissError}
                    className="shrink-0 text-xs sm:text-sm font-medium underline text-rose-400 hover:text-rose-300 cursor-pointer"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            )}

            {/* Connection Actions */}
            <div className="pt-2">
              {isWalletConnected && status === "authenticated" ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4 text-xs sm:text-sm">
                    <div className="flex items-center gap-2.5">
                      <div>
                        <span className="font-bold text-white block text-sm">
                          Wallet Already Connected
                        </span>
                        <span className="font-mono text-zinc-300 text-xs">
                          {address ? shortenAddress(address) : "—"}
                        </span>
                      </div>
                    </div>
                    <Badge variant="default" className="border-emerald-500/40 bg-emerald-950/60 text-emerald-300 text-xs font-bold">
                      Verified
                    </Badge>
                  </div>

                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => {
                      setSelectedStep(2);
                      if (typeof window !== "undefined") {
                        window.history.replaceState(null, "", "#x");
                      }
                    }}
                    className="w-full"
                  >
                    <span>Continue to Step 2 (X Sync)</span>
                  </Button>
                </div>
              ) : status === "wallet-only" || (status === "signing" && Boolean(address)) ? (
                <div className="space-y-3">
                  <p className="text-xs sm:text-sm text-[#8AA8B2]">
                    Connected address: {address ? shortenAddress(address) : "—"}
                  </p>
                  <Button
                    variant="primary"
                    size="lg"
                    disabled={status === "signing" || Boolean(busyMessage)}
                    onClick={() => void login?.()}
                    className="w-full gap-2"
                  >
                    <LogIn className="h-4 w-4 shrink-0" />
                    <span>{busyMessage || "Sign In"}</span>
                  </Button>
                </div>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  disabled={status === "signing" || Boolean(busyMessage)}
                  onClick={handleConnectWallet}
                  className="w-full"
                >
                  <span>{busyMessage || "Connect Wallet"}</span>
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
            <div className="border-b border-[#163B44] pb-4">
              <div>
                <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#34B7DD]">
                  Step 2 of 5
                </span>
                <h2 className="font-display text-xl sm:text-2xl uppercase tracking-wider text-white">
                  X (Twitter) Identity
                </h2>
              </div>
            </div>

            {/* Completed Step 1 Chip */}
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3.5 text-xs sm:text-sm text-emerald-300">
              <span>
                Step 1 Completed: EVM Wallet <strong className="font-mono text-white">{address ? shortenAddress(address) : "—"}</strong> verified.
              </span>
            </div>

            {/* Notice & Instructions */}
            <div className="rounded-xl border border-[#163B44] bg-[#051D22] p-4 sm:p-5 space-y-2">
              <p className="font-bold text-[#F8F7F4] text-base sm:text-lg">
                Connect X (Twitter) Account
              </p>
              <p className="text-[#8AA8B2] leading-relaxed text-sm sm:text-base">
                Link your X (Twitter) profile to establish your social identity and unlock campaign tasks.
              </p>
            </div>

            {/* Direct Connect X Action */}
            <div className="pt-2 space-y-3">
              {isXLinked ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl border border-cyan-500/40 bg-cyan-950/30 p-4 text-xs sm:text-sm">
                    <div className="flex items-center gap-2.5">
                      <div>
                        <span className="font-bold text-white block text-sm">
                          X Account Already Linked
                        </span>
                        <span className="font-mono text-cyan-200 text-xs font-semibold">
                          {statusResult?.status?.details?.xUsername
                            ? `@${statusResult.status.details.xUsername}`
                            : xName
                              ? `@${xName}`
                              : "Connected"}
                        </span>
                      </div>
                    </div>
                    <Badge variant="default" className="border-cyan-500/40 bg-cyan-950/60 text-cyan-300 text-xs font-bold">
                      Connected
                    </Badge>
                  </div>

                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => {
                      setSelectedStep(3);
                      if (typeof window !== "undefined") {
                        window.history.replaceState(null, "", "#tasks");
                      }
                    }}
                    className="w-full"
                  >
                    <span>Continue to Step 3 (Tasks)</span>
                  </Button>
                </div>
              ) : (
                <>
                  {xConnectError && (
                    <div
                      role="alert"
                      className="rounded-xl border border-rose-500/40 bg-rose-950/50 p-3.5 text-xs sm:text-sm text-rose-300"
                    >
                      <p className="font-semibold text-rose-200">Failed to connect X</p>
                      <p className="text-xs sm:text-sm text-rose-400 mt-0.5">{xConnectError}</p>
                    </div>
                  )}

                  <Button
                    variant="primary"
                    size="lg"
                    disabled={isConnectingX}
                    onClick={handleDirectConnectX}
                    className="w-full"
                  >
                    {isConnectingX ? (
                      <span>Connecting to X...</span>
                    ) : (
                      <span>Connect X Account</span>
                    )}
                  </Button>
                </>
              )}
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
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#163B44] bg-[#0B2026] p-3.5 sm:p-4 shadow-[0_4px_24px_rgba(0,0,0,0.45)]">
              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                {/* Wallet Info Chip */}
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-[#051D22] px-3 py-1.5 shadow-sm">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                    Wallet
                  </span>
                  <span className="text-zinc-600">|</span>
                  <span className="font-mono text-xs sm:text-sm font-bold text-white tracking-wide">
                    {address ? shortenAddress(address) : "—"}
                  </span>
                </div>

                {/* X Sync Info Chip */}
                <div className="flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-[#051D22] px-3 py-1.5 shadow-sm">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                    X Sync
                  </span>
                  <span className="text-zinc-600">|</span>
                  <span className="font-mono text-xs sm:text-sm font-bold text-white tracking-wide">
                    {statusResult?.status?.details?.xUsername
                      ? `@${statusResult.status.details.xUsername}`
                      : "Linked"}
                  </span>
                </div>
              </div>

              <Badge variant="outline" className="border-amber-400/40 bg-amber-950/40 text-amber-300 text-xs font-bold uppercase tracking-wider px-3 py-1.5">
                Step 3 of 5 — Campaign Tasks
              </Badge>
            </div>

            {/* Step 3 Completed Banner & Continue CTA (for backward navigation) */}
            {isTasksComplete && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-emerald-500/40 bg-emerald-950/30 p-4 sm:p-5 shadow-[0_4px_24px_rgba(0,0,0,0.35)]">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm sm:text-base">
                      All Campaign Tasks Completed
                    </span>
                    <Badge
                      variant="default"
                      className="border-emerald-500/40 bg-emerald-950/60 text-emerald-300 text-xs font-bold"
                    >
                      Completed
                    </Badge>
                  </div>
                  <p className="text-xs sm:text-sm text-[#8AA8B2]">
                    All campaign tasks are verified. You can proceed to check your traits and Whitelist status.
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => {
                    setSelectedStep(4);
                    if (typeof window !== "undefined") {
                      window.history.replaceState(null, "", "#traits");
                    }
                  }}
                  className="w-full sm:w-auto shrink-0"
                >
                  <span>Continue to Step 4 (Traits)</span>
                </Button>
              </div>
            )}

            {/* Campaign Tasks Section */}
            <div id="tasks" className="rounded-2xl border border-[#163B44] bg-[#0B2026] p-5 sm:p-6 shadow-[0_4px_24px_rgba(0,0,0,0.45)] space-y-5 scroll-mt-24">
              <div className="flex items-center justify-between gap-3 border-b border-[#163B44] pb-4">
                <div>
                  <h2 className="font-display text-xl uppercase tracking-wider text-white">
                    Campaigns & Quests
                  </h2>
                  <p className="text-xs sm:text-sm text-[#8AA8B2]">
                    Community missions to earn Whitelist allocation
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadTasks}
                  disabled={tasksLoading}
                  aria-label="Refresh Tasks"
                  title="Refresh Tasks"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#163B44] bg-[#102B33]/50 text-[#DBF2F9] hover:border-[#34B7DD]/60 hover:bg-[#34B7DD]/10 hover:text-white hover:shadow-[0_0_15px_rgba(52,183,221,0.2)] transition-all duration-300 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`h-4 w-4 ${tasksLoading ? "animate-spin" : ""}`} />
                </button>
              </div>

              {/* Tasks List */}
              {tasksLoading && campaigns.length === 0 ? (
                <div className="py-8 text-center text-sm text-[#8AA8B2]">
                  Loading campaigns & tasks...
                </div>
              ) : tasksError ? (
                <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-4 text-xs sm:text-sm text-rose-300 space-y-2">
                  <p className="font-semibold text-rose-200">Failed to load campaigns:</p>
                  <p>{tasksError}</p>
                  <Button variant="outline" size="sm" className="rounded-xl text-xs sm:text-sm border-rose-500/40 bg-rose-950/60 text-rose-200" onClick={loadTasks}>
                    Retry
                  </Button>
                </div>
              ) : campaigns.length === 0 ? (
                <p className="text-sm text-[#8AA8B2] py-4">
                  No active campaigns currently open for Whitelist.
                </p>
              ) : (
                campaigns.map((campaign) => (
                  <div key={campaign.id} className="space-y-4">
                    {/* Campaign Title & Instructions */}
                    <div className="rounded-xl bg-[#051D22] border border-[#163B44] p-3.5 space-y-1">
                      <h3 className="font-display text-sm sm:text-base tracking-wide uppercase text-white font-bold">
                        {campaign.title}
                      </h3>
                      {campaign.description && (
                        <p className="text-xs sm:text-sm text-[#8AA8B2]">
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
                              className="flex flex-col justify-between gap-3.5 rounded-xl border border-[#163B44] bg-[#051D22] p-4 hover:border-[#34B7DD]/60 hover:bg-[#07242B] hover:shadow-[0_0_20px_rgba(52,183,221,0.12)] md:flex-row md:items-center transition-all duration-200"
                            >
                              <div className="flex min-w-0 flex-1 items-start gap-3">
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <h4 className="text-sm sm:text-base font-bold text-[#F8F7F4]">
                                      {task.title}
                                    </h4>
                                    <span className="text-xs font-bold text-[#8AA8B2] uppercase">
                                      {taskMeta.label}
                                    </span>
                                  </div>
                                  {task.description && (
                                    <p className="text-xs sm:text-sm text-[#8AA8B2] leading-relaxed">
                                      {task.description}
                                    </p>
                                  )}

                                  {/* Mobile-friendly visible step hint when VERIFY TASK is locked */}
                                  {taskStatus.key !== "APPROVED" && !isTaskOpened && (
                                    <p className="pt-0.5 text-[11px] sm:text-xs font-medium text-cyan-300/90">
                                      {isProofRequired
                                        ? "Click OPEN X first to post your reply or quote and unlock the link input."
                                        : "Click OPEN X first to unlock task verification."}
                                    </p>
                                  )}

                                  {/* Proof input for Quote/Reply tasks */}
                                  {isProofRequired && isTaskOpened && taskStatus.key !== "APPROVED" && (
                                    <div className="pt-2 max-w-md space-y-1">
                                      <div className="relative">
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
                                          className="w-full rounded-xl border border-[#163B44] bg-black/60 px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:border-amber-400 focus:outline-none"
                                        />
                                      </div>
                                      {!taskInput.payload.trim() && (
                                        <p className="text-[11px] font-medium text-amber-300/90">
                                          Paste your reply or quote link above to enable VERIFY TASK.
                                        </p>
                                      )}
                                    </div>
                                  )}

                                  {/* Submitted Proof Display for Approved Tasks */}
                                  {isProofRequired && taskStatus.key === "APPROVED" && task.latestSubmission?.payload && (
                                    <p className="pt-1 text-xs text-zinc-400 font-mono truncate">
                                      Proof: <span className="text-zinc-200">{task.latestSubmission.payload}</span>
                                    </p>
                                  )}

                                  {/* Rejection Note */}
                                  {taskStatus.key === "REJECTED" && (
                                    <div className="mt-1.5 rounded-xl border border-rose-500/40 bg-rose-950/40 p-2 text-xs sm:text-sm text-rose-300 space-y-0.5">
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

                                  {errorMsg && <p className="pt-1 text-xs sm:text-sm text-rose-400">{errorMsg}</p>}
                                  {successMsg && <p className="pt-1 text-xs sm:text-sm text-emerald-400">{successMsg}</p>}
                                </div>
                              </div>

                              {/* Action Buttons & Status */}
                              <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 border-t border-[#163B44] md:border-t-0 md:pt-0">
                                {taskStatus.key !== "NOT_SUBMITTED" && (
                                  taskStatus.key === "APPROVED" ? (
                                    <span
                                      className="inline-flex items-center justify-center h-7 w-7 rounded-full border border-emerald-500/50 bg-gradient-to-b from-emerald-950/70 to-[#041d18]/90 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.25)] ring-1 ring-emerald-500/20 backdrop-blur-sm transition-all duration-200 hover:border-emerald-400 hover:shadow-[0_0_16px_rgba(16,185,129,0.45)] hover:scale-105"
                                      title="Task Completed"
                                      aria-label="Completed"
                                    >
                                      <Check
                                        className="h-3.5 w-3.5 text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.6)]"
                                        strokeWidth={2.75}
                                      />
                                    </span>
                                  ) : (
                                    <Badge variant={taskStatus.badgeVariant} className={`text-xs px-2.5 py-1 ${taskStatus.colorClass}`}>
                                      {taskStatus.label}
                                    </Badge>
                                  )
                                )}

                                <a
                                  href={destinationUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() => markTaskOpened(task.id)}
                                  className="group relative overflow-hidden inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#34B7DD]/40 bg-[#071F24] px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:border-[#34B7DD] hover:bg-[#102B33] hover:shadow-[0_0_15px_rgba(52,183,221,0.25)] hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                                >
                                  <span>OPEN X</span>
                                </a>

                                {taskStatus.key === "APPROVED" ? (
                                  <button
                                    disabled
                                    className="inline-flex cursor-not-allowed items-center justify-center gap-1 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3.5 py-2 text-xs font-bold text-emerald-300"
                                  >
                                    <span>DONE</span>
                                  </button>
                                ) : isCountingDown ? (
                                  <button
                                    disabled
                                    className="inline-flex cursor-not-allowed items-center justify-center gap-1 rounded-xl border border-amber-500/50 bg-amber-950/50 px-3.5 py-2 text-xs font-bold text-amber-300 animate-pulse"
                                  >
                                    <span>VERIFYING ({countdownSeconds}s)...</span>
                                  </button>
                                ) : !isTaskOpened ? (
                                  <button
                                    disabled
                                    title="Please click 'OPEN X' first"
                                    className="inline-flex cursor-not-allowed items-center justify-center gap-1 rounded-xl border border-[#163B44] bg-zinc-900 px-3.5 py-2 text-xs font-bold text-zinc-600 opacity-60"
                                  >
                                    <span>VERIFY TASK</span>
                                  </button>
                                ) : isProofRequired && !taskInput.payload.trim() ? (
                                  <button
                                    disabled
                                    title="Paste your reply or quote link first"
                                    className="inline-flex cursor-not-allowed items-center justify-center rounded-xl border border-[#163B44] bg-zinc-900 px-3.5 py-2 text-xs font-bold text-zinc-600 opacity-60"
                                  >
                                    <span>VERIFY TASK</span>
                                  </button>
                                ) : status !== "authenticated" ? (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => login()}
                                  >
                                    <span>CONNECT WALLET TO VERIFY</span>
                                  </Button>
                                ) : (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => handleSocialVerify(task)}
                                    disabled={isSubmitting || isCountingDown}
                                  >
                                    {isSubmitting ? (
                                      <span>COMPLETING...</span>
                                    ) : (
                                      <span>
                                        {taskStatus.key === "REJECTED" ? "RETRY VERIFY" : "VERIFY TASK"}
                                      </span>
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
                            className="space-y-3 rounded-xl border border-[#163B44] bg-[#051D22] p-4 hover:border-[#34B7DD]/60 hover:bg-[#07242B] hover:shadow-[0_0_20px_rgba(52,183,221,0.12)] transition-all duration-200"
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <h4 className="text-sm sm:text-base font-bold text-[#F8F7F4]">
                                    {task.title}
                                  </h4>
                                  <span className="text-xs font-bold text-zinc-400 uppercase">
                                    {task.taskType}
                                  </span>
                                </div>
                                {task.description && (
                                  <p className="text-xs sm:text-sm text-[#8AA8B2]">{task.description}</p>
                                )}
                              </div>

                              <div className="flex shrink-0 items-center gap-1">
                                <Badge variant={taskStatus.badgeVariant} className={`text-xs px-2.5 py-1 ${taskStatus.colorClass}`}>
                                  {taskStatus.label}
                                </Badge>
                              </div>
                            </div>

                            {/* Pending Moderator Review info */}
                            {taskStatus.key === "PENDING" && (
                              <div className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-950/40 p-3.5 text-xs sm:text-sm text-amber-300">
                                <p className="flex items-center gap-1.5 font-bold text-amber-200">
                                  Pending Moderator Review
                                </p>
                                <p className="font-mono text-xs sm:text-sm truncate text-zinc-300">
                                  Submitted Proof: {task.latestSubmission?.payload}
                                </p>
                                <p className="text-zinc-400 text-xs sm:text-sm">
                                  Your submission has been recorded and is awaiting review. Tasks are only counted as completed once approved.
                                </p>
                              </div>
                            )}

                            {/* Approved Info */}
                            {taskStatus.key === "APPROVED" && (
                              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3.5 text-xs sm:text-sm text-emerald-300">
                                <p className="flex items-center gap-1.5 font-bold text-emerald-200">
                                  Verified & Approved
                                </p>
                                {task.latestSubmission?.payload && (
                                  <p className="mt-1 font-mono text-xs sm:text-sm truncate text-emerald-200">
                                    Approved Proof: {task.latestSubmission.payload}
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Rejected Info */}
                            {taskStatus.key === "REJECTED" && (
                              <div className="space-y-1 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3.5 text-xs sm:text-sm text-rose-300">
                                <p className="flex items-center gap-1.5 font-bold text-rose-200">
                                  Evidence Rejected
                                </p>
                                <p className="text-rose-200 font-medium">
                                  {task.latestSubmission?.reviewerNotes ||
                                    "Your submission was rejected by the moderator."}
                                </p>
                                <p className="text-zinc-400 text-xs sm:text-sm">
                                  You can correct and resubmit your evidence below.
                                </p>
                              </div>
                            )}

                            {/* Evidence Input Form (Not Submitted or Rejected) */}
                            {(taskStatus.key === "NOT_SUBMITTED" || taskStatus.key === "REJECTED") && (
                              <div className="pt-1">
                                {status !== "authenticated" ? (
                                  <p className="text-xs sm:text-sm text-zinc-500 italic">
                                    Sign in to submit evidence for this task.
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
                                    >
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
            <div
              id="traits"
              className="lg:col-span-5 space-y-5 scroll-mt-24"
            >
              <div
                className={`relative rounded-3xl border bg-gradient-to-b from-[#0B2026] via-[#071F24] to-[#04181C] p-5 sm:p-6 shadow-[0_12px_40px_rgba(0,0,0,0.6)] space-y-5 overflow-hidden backdrop-blur-md transition-colors duration-300 ${
                  activeStepNumber === 4
                    ? "border-amber-400/50"
                    : "border-[#163B44]"
                }`}
              >
                {/* Luxury Foil Sheen Top Edge */}
                <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400/80 to-transparent" />

                {/* Ambient Back Glows */}
                <div className="pointer-events-none absolute -top-20 -right-20 h-48 w-48 rounded-full bg-amber-500/10 blur-[80px]" />
                <div className="pointer-events-none absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-cyan-500/10 blur-[80px]" />

                {/* Character Preview Header */}
                <div className="relative flex items-center justify-between border-b border-[#163B44] pb-3.5">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-sm tracking-wide uppercase text-white">
                      Character &amp; Wardrobe
                    </h3>
                  </div>
                </div>

                {/* Character Pixel-Art Preview Frame */}
                <div className="relative flex flex-col items-center justify-center rounded-2xl border border-[#163B44] bg-gradient-to-b from-[#071F24]/95 via-[#051D22] to-[#04181C] p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)] overflow-hidden">
                  {/* Radial Spotlight Halo behind avatar */}
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(251,191,36,0.12),transparent_70%)]" />

                  <div className="relative">
                    <UserAvatar
                      identifier={address}
                      hasInventory={inventoryItems.length > 0}
                      version={avatarVersion}
                      size="xl"
                      className={`border-2 rounded-2xl shadow-sm [image-rendering:pixelated] transition-all duration-300 ${
                        isTraitsComplete
                          ? "border-amber-400 shadow-[0_0_35px_rgba(251,191,36,0.3)] ring-2 ring-amber-400/20"
                          : "border-[#163B44] shadow-sm"
                      }`}
                    />
                  </div>

                  {/* Clean Prestige Pill */}
                  <div className="mt-4 inline-flex items-center rounded-full border border-amber-400/30 bg-gradient-to-r from-amber-500/15 via-yellow-400/10 to-amber-500/15 px-3.5 py-1 shadow-[0_0_15px_rgba(251,191,36,0.12)]">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                      {isTraitsComplete
                        ? "Full Outfit Assembled • 5/5"
                        : `${heldCategories.length} / 5 Categories Collected`}
                    </span>
                  </div>
                </div>

                {/* Five Trait Categories (Owned in Color, Missing in Grayscale) */}
                {statusResult?.status?.phase !== "REVOKED" && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between border-b border-[#163B44] pb-2">
                      <span className="font-display text-xs tracking-wider uppercase text-white font-bold">
                        Trait Categories
                      </span>
                    </div>

                    {/* Micro Progress Bar */}
                    <div className="h-1.5 w-full bg-[#04181C] rounded-full overflow-hidden border border-[#163B44]">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-400 via-amber-400 to-yellow-300 transition-all duration-500 rounded-full"
                        style={{ width: `${(heldCategories.length / 5) * 100}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-5 gap-1 sm:gap-1.5">
                      {TRAIT_CATEGORIES.map((cat) => {
                        const isHeld = heldCategories.includes(cat);
                        const theme = CATEGORY_THEMES[cat];
                        return (
                          <div
                            key={cat}
                            title={`${cat}: ${isHeld ? "Owned" : "Missing"}`}
                            className={`flex flex-col items-center justify-center min-w-0 py-2 sm:py-2.5 px-0.5 rounded-xl border text-center transition-all ${
                              isHeld
                                ? `${theme.heldClass} font-bold backdrop-blur-xs`
                                : "border-[#163B44] bg-[#051D22] text-zinc-500 grayscale opacity-50"
                            }`}
                          >
                            <span className="text-[9px] min-[360px]:text-[9.5px] sm:text-[10px] xl:text-[10.5px] font-bold tracking-tight whitespace-nowrap leading-tight block">
                              {cat}
                            </span>
                            <span className="text-[8.5px] min-[360px]:text-[9px] sm:text-[9.5px] mt-0.5 opacity-80 font-medium tracking-tight whitespace-nowrap leading-none block">
                              {isHeld ? "Owned" : "Missing"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Inventory Summary (Total items and duplicates) */}
                <div className="rounded-2xl border border-[#163B44] bg-gradient-to-b from-[#071F24]/90 to-[#04181C]/95 p-4 space-y-3 text-sm text-[#DBF2F9] shadow-inner">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl border border-[#163B44] bg-[#051D22]/80 p-2.5 text-center">
                      <span className="block text-xs text-[#8AA8B2] uppercase tracking-wider font-bold">
                        Total Items
                      </span>
                      <span className="font-display text-xl font-bold text-white mt-0.5 block">
                        {inventoryItems.length}
                      </span>
                    </div>
                    <div className="rounded-xl border border-[#163B44] bg-[#051D22]/80 p-2.5 text-center">
                      <span className="block text-xs text-[#8AA8B2] uppercase tracking-wider font-bold">
                        Duplicates / Extra
                      </span>
                      <span className="font-display text-xl font-bold text-cyan-300 mt-0.5 block">
                        {duplicateCount}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs sm:text-sm text-[#8AA8B2] leading-relaxed border-t border-[#163B44] pt-2.5">
                    Duplicates remain in your inventory. Qualification requires 1 item in each of the 5 distinct categories.
                  </p>
                </div>

                {/* Trait Lootbox Drops CTA */}
                <div className="relative rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-cyan-500/10 via-[#071F24] to-cyan-500/5 p-4 flex items-center justify-between gap-3 shadow-sm">
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="font-display text-xs uppercase tracking-wider text-white">
                      Trait Lootbox Drops
                    </p>
                    <p className="text-xs text-[#8AA8B2] leading-snug">
                      Need more traits to complete your collection?
                    </p>
                  </div>
                  <Link href="/drops" className="shrink-0">
                    <Button
                      variant="primary"
                      size="sm"
                    >
                      <span>Go to Drops</span>
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            {/* ===================================================================
                RIGHT COLUMN: ACTIVE STEP PANEL (7 Cols on LG)
                Compact information panel: Step 1-5
            =================================================================== */}
            <div
              id="status"
              className="lg:col-span-7 space-y-5 scroll-mt-24"
            >
              <div
                className={`rounded-2xl border bg-[#0B2026] p-5 sm:p-6 shadow-[0_4px_24px_rgba(0,0,0,0.45)] space-y-5 transition-colors duration-300 ${
                  activeStepNumber === 5
                    ? isWhitelistSecured
                      ? "border-emerald-500/45"
                      : "border-cyan-400/50"
                    : "border-[#163B44]"
                }`}
              >
                <div className="flex items-center justify-between border-b border-[#163B44] pb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-sm tracking-wide uppercase text-white">
                      Whitelist Status & Allocation
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {isWhitelistSecured ? (
                      <Badge variant="default" className="border-emerald-500/40 bg-emerald-950/60 text-emerald-300 font-bold text-xs uppercase">
                        WHITELISTED
                      </Badge>
                    ) : (
                      <Badge variant="outline" className={`text-xs font-bold ${qualificationState.badgeClass}`}>
                        {qualificationState.title}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Steps 1 to 5 Status Overview */}
                <div className="space-y-3 text-sm text-[#DBF2F9]">
                  {/* Step 1: Wallet Connection */}
                  <div className="flex items-center justify-between rounded-xl border border-[#163B44] bg-[#051D22] p-3.5 text-xs sm:text-sm">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-black font-extrabold text-xs">
                        1
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-400">EVM Wallet</span>
                        <span className="ml-2 font-mono text-white font-bold">
                          {address ? shortenAddress(address) : "—"}
                        </span>
                      </div>
                    </div>
                    <Badge variant="default" className="border-emerald-500/40 bg-emerald-950/50 text-emerald-300 text-xs font-bold">
                      Verified
                    </Badge>
                  </div>

                  {/* Step 2: X Account Sync */}
                  <div className="flex items-center justify-between rounded-xl border border-[#163B44] bg-[#051D22] p-3.5 text-xs sm:text-sm">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-400 text-black font-extrabold text-xs">
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
                    <Badge variant="default" className="border-cyan-500/40 bg-cyan-950/50 text-cyan-300 text-xs font-bold">
                      Connected
                    </Badge>
                  </div>

                  {/* Step 3: Campaign Tasks Completion */}
                  <div className="rounded-xl border border-[#163B44] bg-[#051D22] p-3.5 text-xs sm:text-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-black font-extrabold text-xs">
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
                        <Badge variant="default" className="border-emerald-500/40 bg-emerald-950/50 text-emerald-300 text-xs font-bold">
                          Completed
                        </Badge>
                        <button
                          onClick={() => setShowTasksInViewB((prev) => !prev)}
                          className="flex items-center text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer"
                        >
                          <span>{showTasksInViewB ? "Hide" : "View"}</span>
                        </button>
                      </div>
                    </div>

                    {/* Toggleable Task Proof Checklist in View B */}
                    {showTasksInViewB && (
                      <div className="mt-2 pt-2 border-t border-[#163B44] space-y-2">
                        {campaigns.flatMap((c) => c.tasks).map((t) => {
                          const st = getTaskStatus(t);
                          const statusColor =
                            st.key === "APPROVED"
                              ? "text-emerald-400"
                              : st.key === "PENDING"
                                ? "text-amber-300"
                                : st.key === "REJECTED"
                                  ? "text-rose-400"
                                  : "text-zinc-400";
                          return (
                            <div
                              key={t.id}
                              className="flex items-center justify-between text-xs sm:text-sm bg-black/40 p-2.5 rounded-lg border border-[#163B44]"
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="font-semibold text-zinc-200 truncate">{t.title}</span>
                              </div>
                              <span className={`font-bold shrink-0 ${statusColor}`}>
                                {st.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Step 4: Trait Collection Progress */}
                  <div className="flex items-center justify-between rounded-xl border border-[#163B44] bg-[#051D22] p-3.5 text-xs sm:text-sm">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-400 text-black font-extrabold text-xs">
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
                      className={`text-xs font-bold ${
                        isTraitsComplete
                          ? "border-emerald-500/40 bg-emerald-950/50 text-emerald-300"
                          : "border-[#163B44] bg-zinc-800/40 text-zinc-400"
                      }`}
                    >
                      {isTraitsComplete ? "All 5 Complete" : "In Progress"}
                    </Badge>
                  </div>

                  {/* Step 5: Whitelist Qualification & Real Allocation Status */}
                  <div className="rounded-xl border border-[#163B44] bg-[#051D22] p-3.5 text-xs sm:text-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-black font-extrabold text-xs ${
                            isWhitelistSecured
                              ? "bg-emerald-500"
                              : isRevoked
                                ? "bg-rose-500"
                                : "bg-amber-400"
                          }`}
                        >
                          5
                        </div>
                        <span className="font-bold text-white text-xs sm:text-sm">
                          Whitelist Allocation
                        </span>
                      </div>
                    </div>

                    {/* Unified Whitelisted Minter Pass Card (when all 5/5 requirements are met) */}
                    {isWhitelistSecured && statusResult?.status && (() => {
                      const isSlotAllocated = statusResult.status.phase === "SLOT_ALLOCATED";
                      const review = getGtdReviewDetails(statusResult.status.reviewStatus);
                      const passNum = statusResult.status.slotNumber ?? statusResult.status.queueNumber;
                      const paddedPass = passNum ? String(passNum).padStart(4, "0") : "0001";
                      const wlXUsername = statusResult?.status?.details?.xUsername;
                      const tweetText = encodeURIComponent(
                        `Just secured Official Whitelist Pass #${paddedPass} in the @Elychimp Syndicate!\n\n5/5 Outfit Fit assembled on @Enter_elysium (Elysium).\n\nRule the streets:`
                      );
                      const shareUrl = typeof window !== "undefined" ? window.location.origin : "https://elychimp.xyz";
                      const tweetHref = `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(shareUrl)}`;
                      const displayName = xName || (wlXUsername ? `@${wlXUsername}` : address ? shortenAddress(address) : "Syndicate Member");
                      const operatorHandle = wlXUsername ? `@${wlXUsername}` : "—";
                      const rawDate = statusResult.status.allocatedAt ?? statusResult.status.joinedAt;
                      const issuedDate = rawDate
                        ? new Date(rawDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "—";
                      const wlAvatarUrl = address ? getAvatarPublicUrl(address, avatarVersion) : undefined;

                      return (
                        <div className="space-y-3">
                          {/* Unified Lanyard ID Badge Card */}
                          <div className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#a3a7c8] to-[#bcc0dc] p-2 sm:p-4 shadow-xl select-none">
                            {/* Translucent Acrylic Sleeve */}
                            <div className="relative mx-auto rounded-[18px] border-2 border-white/80 bg-white/40 p-1.5 sm:p-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.18)] backdrop-blur-sm">
                              {/* Top Lanyard Slot */}
                              <div className="mx-auto mb-1.5 sm:mb-2 h-2 sm:h-2.5 w-16 sm:w-20 rounded-full border border-white/80 bg-[#7b809d] shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]" />

                              {/* Inner White Paper Card */}
                              <div className="relative overflow-hidden rounded-xl border border-black/10 bg-[#fafafd] shadow-sm">
                                {/* Header: Forest Green Syndicate Band */}
                                <div className="flex items-center justify-between gap-2 bg-[#16452d] px-2.5 sm:px-4 py-2 sm:py-2.5 text-white border-b-2 border-[#2d704c]">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src="/images/elychimp-logo.png"
                                      alt="Elychimp Logo"
                                      className="h-6 sm:h-9 w-auto shrink-0 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.3)]"
                                    />
                                    <div className="min-w-0">
                                      <h4 className="font-display text-[11px] sm:text-sm uppercase tracking-wide leading-none text-white truncate">
                                        Elychimp Syndicate
                                      </h4>
                                      <span className="block text-[6.5px] sm:text-[9px] text-emerald-200 tracking-wider font-semibold truncate mt-0.5">
                                        Official Syndicate ID Badge
                                      </span>
                                    </div>
                                  </div>

                                  {/* Pass No. Tag */}
                                  <div className="shrink-0 -rotate-2 rounded-sm bg-emerald-300/95 px-1.5 sm:px-2.5 py-0.5 sm:py-1 font-mono text-[8.5px] sm:text-[11px] text-emerald-950 shadow-sm border border-emerald-400/80 font-bold leading-tight">
                                    <span className="block text-[5.5px] sm:text-[6px] uppercase tracking-widest text-emerald-900 leading-none">PASS NO.</span>
                                    <span>#{paddedPass}</span>
                                  </div>
                                </div>

                                {/* Main Body — True Horizontal ID Pass Layout on Mobile & Desktop */}
                                <div className="p-2.5 sm:p-4 flex flex-row gap-2.5 sm:gap-5 items-start">
                                  {/* Photo ID Column */}
                                  <div className="flex flex-col items-center shrink-0 w-[92px] sm:w-[136px]">
                                    <div className="relative p-1 sm:p-1.5 bg-white rounded-md border border-black/15 shadow-sm w-full aspect-square flex items-center justify-center">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={wlAvatarUrl || "/images/chimp-base-bw.png"}
                                        alt="Elychimp Character"
                                        className="h-full w-full object-contain [image-rendering:pixelated] rounded"
                                        onError={(e) => { (e.target as HTMLImageElement).src = "/images/chimp-base-bw.png"; }}
                                      />
                                      {/* Red Verification Stamp */}
                                      <div className="absolute -bottom-1.5 -right-1.5 sm:-bottom-2 sm:-left-2 sm:right-auto pointer-events-none -rotate-12 border-[1.5px] border-red-600/85 rounded-full text-center text-red-600 leading-none bg-white/90 shadow-sm p-[1.5px]">
                                        <div className="rounded-full border border-red-600/60 flex flex-col items-center justify-center w-11 h-11 sm:w-14 sm:h-14 px-0.5">
                                          <span className="text-[4.5px] sm:text-[5.5px] font-mono font-bold tracking-wider text-red-600 leading-none">ELYCHIMP</span>
                                          <span className="text-[5px] sm:text-[6.5px] font-sans font-black tracking-tight my-0.5 text-red-600 leading-none">WHITELISTED</span>
                                          <span className="text-[4px] sm:text-[4.5px] font-mono text-red-600/80 leading-none">CLEARANCE</span>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="mt-2 w-full rounded bg-[#111827] px-1 sm:px-2 py-0.5 sm:py-1 text-center text-white font-display text-[6px] sm:text-[8.5px] tracking-wider shadow-sm uppercase leading-tight whitespace-nowrap">
                                      Whitelisted Minter Pass
                                    </div>
                                  </div>

                                  {/* Info Fields Column */}
                                  <div className="flex-1 min-w-0 space-y-1 sm:space-y-2 text-left">
                                    <div>
                                      <span className="text-[6.5px] sm:text-[8px] font-bold text-gray-500 uppercase tracking-widest block leading-none">NAME</span>
                                      <p className="font-display text-xs sm:text-lg uppercase tracking-wider text-gray-900 leading-tight truncate mt-0.5">
                                        {displayName}
                                      </p>
                                    </div>
                                    <div>
                                      <span className="text-[6.5px] sm:text-[8px] font-bold text-gray-500 uppercase tracking-widest block leading-none">ACCOUNT</span>
                                      <p className="font-mono text-[9.5px] sm:text-xs font-semibold text-gray-800 truncate mt-0.5">
                                        {operatorHandle}
                                      </p>
                                    </div>
                                    <div>
                                      <span className="text-[6.5px] sm:text-[8px] font-bold text-gray-500 uppercase tracking-widest block leading-none">WALLET ADDRESS</span>
                                      <p className="font-mono text-[9px] sm:text-[11px] font-semibold text-gray-600 truncate mt-0.5">
                                        {address ? shortenAddress(address) : "0x0000...0000"}
                                      </p>
                                    </div>
                                    <div>
                                      <span className="text-[6.5px] sm:text-[8px] font-bold text-gray-500 uppercase tracking-widest block leading-none">VISITING SINCE</span>
                                      <p className="text-[8.5px] sm:text-[11px] font-medium text-gray-900 truncate mt-0.5">
                                        {issuedDate} • ELYSIUM
                                      </p>
                                    </div>
                                    {/* Barcode */}
                                    <div className="relative pt-0.5 h-6 sm:h-9">
                                      <div className="h-full w-full bg-[repeating-linear-gradient(90deg,#18181b,#18181b_2px,transparent_2px,transparent_4px,#18181b_4px,#18181b_7px,transparent_7px,transparent_9px)] opacity-80 rounded" />
                                      <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="rounded border border-black/40 bg-white px-1.5 sm:px-3 py-0.5 font-mono text-[7.5px] sm:text-[9px] font-bold text-gray-900 shadow-sm leading-none">
                                          elychimp.xyz
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Bottom Serial Strip */}
                                <div className="border-t border-zinc-200 bg-[#edeef2] px-2.5 sm:px-4 py-1.5 sm:py-2 text-center font-mono text-[8px] sm:text-[11px] font-semibold tracking-wider text-zinc-700 select-all uppercase truncate">
                                  SERIAL: ELY-WL-{paddedPass} &bull; ELYCHIMP.XYZ
                                </div>
                              </div>

                              {/* Banana Stickers — Positioned cleanly away from header & serial text */}
                              <BananaSticker className="absolute top-12 sm:top-12 right-2 sm:right-24 w-9 sm:w-18 h-4.5 sm:h-9 -rotate-12 pointer-events-none opacity-95" />
                              <BananaSticker className="hidden sm:block absolute top-28 sm:top-36 -right-2 sm:right-1 w-12 sm:w-16 h-6 sm:h-8 rotate-24 pointer-events-none" />
                              <BananaSticker className="absolute bottom-7 sm:bottom-9 right-2 sm:right-10 w-10 sm:w-20 h-5 sm:h-10 rotate-6 pointer-events-none opacity-95" />

                              {/* Plastic Glare */}
                              <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent rounded-[16px]" />
                            </div>
                          </div>

                          {/* Verification / Eligibility Note */}
                          {isSlotAllocated ? (
                            <div className="rounded-xl border border-[#163B44] bg-[#051D22] p-3.5 text-xs sm:text-sm text-[#8AA8B2]">
                              <div className="space-y-0.5 min-w-0">
                                <div className="flex items-center gap-2">
                                  <Badge variant={review.badgeVariant} className={`text-xs font-bold ${review.colorClass}`}>
                                    {review.label}
                                  </Badge>
                                  <span className="text-zinc-200 font-bold">{review.subtext}</span>
                                </div>
                                <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed pt-0.5">
                                  Your Whitelist status is locked in the syndicate registry. Keep this wallet and X account connected for snapshot export.
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3.5">
                              <div className="space-y-0.5">
                                <p className="text-xs sm:text-sm font-bold text-emerald-300 uppercase tracking-wider">All 5 Requirements Satisfied</p>
                                <p className="text-[#8AA8B2] text-xs sm:text-sm leading-relaxed">
                                  Your wallet is eligible for inclusion in the official allowlist for minting.
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <Button
                              type="button"
                              onClick={() => setIsShareModalOpen(true)}
                              variant="secondary"
                              size="lg"
                              className="w-full"
                            >
                              <span>Download Card</span>
                            </Button>
                            <a href={tweetHref} target="_blank" rel="noopener noreferrer" className="block w-full">
                              <Button
                                variant="primary"
                                size="lg"
                                className="w-full"
                              >
                                <span>Share on X</span>
                              </Button>
                            </a>
                          </div>
                        </div>
                      );
                    })()}

                    {statusResult?.status?.phase === "REVOKED" && (
                      <div className="space-y-1.5 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3.5 text-xs sm:text-sm text-rose-200">
                        <div className="font-bold text-rose-300">
                          Whitelist Status Revoked
                        </div>
                        <p className="text-rose-200 font-medium text-xs sm:text-sm">
                          {statusResult.status.missingRequirements[0] || "Whitelist qualification has been revoked."}
                        </p>
                        <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed">
                          In accordance with Elysium program policies (DEC-022), whitelist revocation results in full disqualification from this Whitelist program and exclusion from the allowlist export.
                        </p>
                      </div>
                    )}

                    {/* Incomplete / In-Progress Whitelist Application State */}
                    {!isWhitelistSecured && statusResult?.status?.phase !== "REVOKED" && (
                      <div className="rounded-xl border border-[#163B44] bg-zinc-900/60 p-4 text-xs sm:text-sm text-zinc-400 space-y-1.5">
                        <span className="font-bold text-white text-sm sm:text-base">Qualification In Progress</span>
                        <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                          You&apos;re almost there! Complete the remaining criteria below to unlock your Official Syndicate Whitelist Pass.
                        </p>
                      </div>
                    )}

                    {/* Missing requirements listing if incomplete */}
                    {statusResult?.status?.missingRequirements &&
                      statusResult.status.missingRequirements.length > 0 &&
                      !isWhitelistSecured &&
                      statusResult.status.phase !== "REVOKED" && (
                        <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-3 text-xs sm:text-sm text-amber-200 space-y-1">
                          <span className="font-bold text-amber-300 text-xs sm:text-sm">Action Needed:</span>
                          <ul className="list-inside list-disc text-xs sm:text-sm text-amber-200 space-y-0.5">
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
        avatarUrl={address ? getAvatarPublicUrl(address, avatarVersion) : undefined}
        heldCategoriesCount={heldCategories.length}
        allocatedAt={statusResult?.status?.allocatedAt ?? statusResult?.status?.joinedAt}
      />
    </div>
  );
}
