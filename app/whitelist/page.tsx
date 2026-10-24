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
    </div>
  );
}
