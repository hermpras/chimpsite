"use client";

import React, { useEffect, useState, useMemo } from "react";
import { RefreshCw } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PlaceholderNotice } from "@/components/ui/PlaceholderNotice";
import {
  adminListEvidence,
  adminReviewEvidence,
  type AdminListEvidenceInput,
} from "@/lib/admin/client";
import { safeFormatAddress } from "@/lib/auth/address";

export interface EvidenceSubmissionItem {
  id: string;
  taskId: string;
  userId: string;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  submissionType?: string | null;
  payload?: string | null;
  createdAt?: string;
  submittedAt?: string;
  reviewedAt?: string | null;
  reviewerId?: string | null;
  reviewerNotes?: string | null;
  user?: {
    id: string;
    wallet?: { address: string } | null;
    xIdentity?: {
      username: string;
      name?: string | null;
      profileImageUrl?: string | null;
    } | null;
  } | null;
  task?: {
    id: string;
    taskCode: string;
    title: string;
    taskType?: string;
    points?: number;
    isRequired?: boolean;
  } | null;
  evidenceData?: {
    type?: string;
    url?: string;
    text?: string;
    description?: string;
    submittedProof?: string;
    [key: string]: unknown;
  } | null;
}

export function isFollowLikeRepostTask(sub: EvidenceSubmissionItem): boolean {
  // If it has a specific reply or quote status link, it's definitely a proof submission (NOT follow/like/repost)
  if (sub.payload && sub.payload.includes("/status/")) {
    return false;
  }

  const type = (sub.task?.taskType || "").toUpperCase();
  const code = (sub.task?.taskCode || "").toUpperCase();
  const title = (sub.task?.title || "").toUpperCase();

  if (type === "SOCIAL_X_REPLY" || type === "SOCIAL_X_QUOTE") {
    return false;
  }
  if (code.includes("REPLY") || code.includes("QUOTE") || code.includes("COMMENT")) {
    return false;
  }
  if (title.includes("REPLY") || title.includes("QUOTE") || title.includes("COMMENT")) {
    return false;
  }

  if (
    type === "SOCIAL_X_FOLLOW" ||
    type === "SOCIAL_X_LIKE" ||
    type === "SOCIAL_X_REPOST"
  ) {
    return true;
  }
  if (
    code.includes("FOLLOW") ||
    code.includes("LIKE") ||
    code.includes("REPOST") ||
    code.includes("RETWEET")
  ) {
    return true;
  }
  if (
    title.includes("FOLLOW") ||
    title.includes("LIKE") ||
    title.includes("REPOST") ||
    title.includes("RETWEET")
  ) {
    return true;
  }
  // Fallback: If reviewer notes indicate auto-verified and payload is just a user profile URL (not a /status/ tweet)
  if (
    sub.reviewerNotes?.toLowerCase().includes("auto-verified") &&
    sub.payload &&
    !sub.payload.includes("/status/")
  ) {
    return true;
  }
  return false;
}

export type EvidenceAuditStatus = "NEEDS_AUDIT" | "AUDITED" | "REJECTED";

export function getSubmissionAuditStatus(sub: EvidenceSubmissionItem): EvidenceAuditStatus {
  if (sub.status === "REJECTED") {
    return "REJECTED";
  }
  if (sub.status === "PENDING_REVIEW") {
    return "NEEDS_AUDIT";
  }
  const isAutoVerified =
    !sub.reviewerId ||
    Boolean(sub.reviewerNotes?.toLowerCase().startsWith("auto-verified"));

  if (isAutoVerified) {
    return "NEEDS_AUDIT";
  }

  return "AUDITED";
}

export type FilterAuditStatus = "NEEDS_AUDIT" | "AUDITED" | "REJECTED" | "ALL";

export function AdminEvidenceReview() {
  const [filterAuditStatus, setFilterAuditStatus] = useState<FilterAuditStatus>("NEEDS_AUDIT");
  const [taskScopeFilter, setTaskScopeFilter] = useState<
    "ALL" | "REPLY_QUOTE_ONLY"
  >("ALL");
  const [submissions, setSubmissions] = useState<EvidenceSubmissionItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [countsSummary, setCountsSummary] = useState<{
    needsAudit: number;
    audited: number;
    rejected: number;
    all: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [copiedWallet, setCopiedWallet] = useState<string | null>(null);

  // Review action in progress
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const localCounts = useMemo(() => {
    let needsAudit = 0;
    let audited = 0;
    let rejected = 0;
    for (const sub of submissions) {
      const st = getSubmissionAuditStatus(sub);
      if (st === "NEEDS_AUDIT") needsAudit++;
      else if (st === "AUDITED") audited++;
      else if (st === "REJECTED") rejected++;
    }
    return {
      needsAudit,
      audited,
      rejected,
      all: submissions.length,
    };
  }, [submissions]);

  const counts = countsSummary ?? localCounts;

  useEffect(() => {
    let isMounted = true;
    const input: AdminListEvidenceInput = {
      limit: 100,
    };
    if (filterAuditStatus !== "ALL") {
      input.auditStatus = filterAuditStatus;
    }

    adminListEvidence(input)
      .then((res: any) => {
        if (isMounted) {
          setSubmissions(res.submissions || []);
          setTotalCount(res.total ?? res.submissions?.length ?? 0);
          if (res.counts) {
            setCountsSummary(res.counts);
          }
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError((err as Error).message || "Failed to load evidence submissions.");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [filterAuditStatus, reloadKey]);

  const handleReview = async (
    submissionId: string,
    decision: "APPROVED" | "REJECTED",
  ) => {
    setReviewingId(submissionId);
    setError(null);
    setActionSuccess(null);
    try {
      const notes =
        reviewNotes[submissionId] ||
        (decision === "APPROVED"
          ? "Audited & confirmed by admin"
          : "Rejected during admin audit");

      await adminReviewEvidence(submissionId, {
        status: decision,
        reviewerNotes: notes,
      });
      const wasPending =
        submissions.find((s) => s.id === submissionId)?.status === "PENDING_REVIEW";

      setActionSuccess(
        decision === "APPROVED"
          ? wasPending
            ? `Submission ${submissionId.slice(0, 8)} successfully approved!`
            : `Submission ${submissionId.slice(0, 8)} confirmed valid by admin!`
          : `Submission ${submissionId.slice(0, 8)} successfully rejected!`,
      );
      // Trigger reload
      setReloadKey((k) => k + 1);
    } catch (err: unknown) {
      setError(
        (err as Error).message || `Failed to ${decision.toLowerCase()} submission.`,
      );
    } finally {
      setReviewingId(null);
    }
  };

  const handleCopyWallet = (address: string) => {
    if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(address).catch(() => {});
    }
    setCopiedWallet(address);
    setTimeout(() => {
      setCopiedWallet((current) => (current === address ? null : current));
    }, 2000);
  };

  const filteredSubmissions = submissions.filter((sub) => {
    if (filterAuditStatus !== "ALL") {
      const auditStatus = getSubmissionAuditStatus(sub);
      if (auditStatus !== filterAuditStatus) {
        return false;
      }
    }
    if (taskScopeFilter === "REPLY_QUOTE_ONLY") {
      return !isFollowLikeRepostTask(sub);
    }
    return true;
  });
  const hiddenCount = submissions.length - filteredSubmissions.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Evidence Review
            </h1>
            <Badge variant="warning">{filteredSubmissions.length} Found</Badge>
            {hiddenCount > 0 && taskScopeFilter === "REPLY_QUOTE_ONLY" && (
              <span className="text-xs text-gray-500">
                ({hiddenCount} Follow/Like/Repost hidden)
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-400">
            Moderate quest evidence submissions, verify user task proofs, and confirm
            task completion.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-2 self-start sm:self-auto"
          onClick={() => {
            setLoading(true);
            setReloadKey((k) => k + 1);
          }}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-col gap-3 border-b border-[#163B44] pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-2 text-xs font-medium text-gray-400">
            Audit Status:
          </span>
          {[
            { key: "NEEDS_AUDIT", label: "Needs Audit", count: counts.needsAudit },
            { key: "AUDITED", label: "Audited & Verified", count: counts.audited },
            { key: "REJECTED", label: "Rejected", count: counts.rejected },
            { key: "ALL", label: "All Submissions", count: counts.all },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterAuditStatus(key as FilterAuditStatus)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filterAuditStatus === key
                  ? key === "NEEDS_AUDIT"
                    ? "border border-amber-500/40 bg-amber-500/20 text-amber-300"
                    : key === "REJECTED"
                    ? "border border-rose-500/40 bg-rose-500/20 text-rose-300"
                    : "border border-emerald-500/30 bg-emerald-500/20 text-emerald-400"
                  : "text-gray-400 hover:bg-[#102B33]/60 hover:text-white"
              }`}
            >
              {label} ({count})
            </button>
          ))}
        </div>

        {/* Task Proof Scope Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-400">Proof Scope:</span>
          <button
            type="button"
            onClick={() => setTaskScopeFilter("REPLY_QUOTE_ONLY")}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              taskScopeFilter === "REPLY_QUOTE_ONLY"
                ? "border border-emerald-500/30 bg-emerald-500/20 text-emerald-400"
                : "text-gray-400 hover:bg-[#102B33]/60 hover:text-white"
            }`}
          >
            Reply & Quote Only
          </button>
          <button
            type="button"
            onClick={() => setTaskScopeFilter("ALL")}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              taskScopeFilter === "ALL"
                ? "border border-emerald-500/30 bg-emerald-500/20 text-emerald-400"
                : "text-gray-400 hover:bg-[#102B33]/60 hover:text-white"
            }`}
          >
            All Tasks
          </button>
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          <span>{actionSuccess}</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          <span>{error}</span>
        </div>
      )}

      {/* Submissions List */}
      {loading ? (
        <div className="rounded-lg border border-[#163B44] bg-[#0B2026] p-12 text-center text-sm text-gray-400">
          <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin text-emerald-400" />
          Loading evidence submissions...
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <Card className="border-[#163B44] bg-[#0B2026]">
          <CardContent className="p-12 text-center">
            <h3 className="text-base font-semibold text-gray-300">
              No Submissions Found
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              There are no evidence records matching the current filter (
              {filterAuditStatus.replace("_", " ")}
              {taskScopeFilter === "REPLY_QUOTE_ONLY" ? " / Reply & Quote Only" : ""}).
            </p>
            {hiddenCount > 0 && taskScopeFilter === "REPLY_QUOTE_ONLY" && (
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTaskScopeFilter("ALL")}
                  className="text-xs"
                >
                  Show All ({hiddenCount} Follow/Like/Repost hidden)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredSubmissions.map((sub) => {
            const isPending = sub.status === "PENDING_REVIEW";
            const isApproved = sub.status === "APPROVED";
            const isRejected = sub.status === "REJECTED";
            const isBusy = reviewingId === sub.id;
            const isFollowLikeRepost = isFollowLikeRepostTask(sub);
            const auditStatus = getSubmissionAuditStatus(sub);
            const isNeedsAudit = auditStatus === "NEEDS_AUDIT";
            const isAudited = auditStatus === "AUDITED";

            const xUsername =
              sub.user?.xIdentity?.username ||
              (() => {
                if (sub.payload) {
                  const match = sub.payload.match(
                    /https?:\/\/(?:twitter|x)\.com\/([A-Za-z0-9_]+)(?:\/status|\/|$)/,
                  );
                  if (
                    match &&
                    match[1] &&
                    !["chimphoodnft", "chimphood", "elychimp", "elychimpnft"].includes(
                      match[1].toLowerCase(),
                    )
                  ) {
                    return match[1];
                  }
                }
                return null;
              })();

            const walletAddress = sub.user?.wallet?.address || null;

            let proofUrl: string | null = null;
            let proofText: string | null = null;

            // 1. Try parsing sub.payload as JSON in case it was stored as stringified JSON
            if (typeof sub.payload === "string" && sub.payload.trim().startsWith("{")) {
              try {
                const parsed = JSON.parse(sub.payload.trim());
                if (parsed && typeof parsed === "object") {
                  if (typeof parsed.url === "string" && parsed.url.startsWith("http")) {
                    proofUrl = parsed.url;
                  }
                  if (typeof parsed.text === "string") {
                    proofText = parsed.text;
                  } else if (typeof parsed.description === "string") {
                    proofText = parsed.description;
                  }
                }
              } catch {
                // Not valid JSON, ignore
              }
            }

            // 2. Extract from sub.payload as plain string
            if (
              !proofUrl &&
              !proofText &&
              typeof sub.payload === "string" &&
              sub.payload.trim()
            ) {
              const trimmed = sub.payload.trim();
              if (
                sub.submissionType === "URL" ||
                sub.submissionType === "IMAGE_URL" ||
                trimmed.startsWith("http://") ||
                trimmed.startsWith("https://")
              ) {
                proofUrl = trimmed;
              } else {
                proofText = trimmed;
              }
            }

            // 3. Fallback to sub.evidenceData if present
            if (!proofUrl && typeof sub.evidenceData?.url === "string") {
              proofUrl = sub.evidenceData.url;
            } else if (
              !proofUrl &&
              typeof sub.evidenceData?.submittedProof === "string" &&
              sub.evidenceData.submittedProof.startsWith("http")
            ) {
              proofUrl = sub.evidenceData.submittedProof;
            }

            if (!proofText && typeof sub.evidenceData?.text === "string") {
              proofText = sub.evidenceData.text;
            } else if (!proofText && typeof sub.evidenceData?.description === "string") {
              proofText = sub.evidenceData.description;
            } else if (
              !proofText &&
              !proofUrl &&
              typeof sub.evidenceData?.submittedProof === "string"
            ) {
              proofText = sub.evidenceData.submittedProof;
            }

            const rawSubmittedDate = sub.createdAt || sub.submittedAt;
            const formattedSubmittedDate = (() => {
              if (!rawSubmittedDate) return "Unknown";
              const d = new Date(rawSubmittedDate);
              return isNaN(d.getTime()) ? "Unknown" : d.toLocaleString();
            })();

            return (
              <Card
                key={sub.id}
                className="border-[#163B44] bg-[#0B2026]/90 transition-all hover:border-[#163B44]/80"
              >
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex-1 space-y-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-emerald-400">
                          ID: {sub.id}
                        </span>
                        {isNeedsAudit && (
                          <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-500/30">
                            Needs Audit
                          </span>
                        )}
                        {isAudited && (
                          <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-500/30">
                            Audited &amp; Verified
                          </span>
                        )}
                        {isRejected && (
                          <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-300 border border-rose-500/30">
                            Rejected
                          </span>
                        )}
                        {isNeedsAudit && isApproved && (
                          <span className="rounded bg-[#102B33]/80 px-2 py-0.5 text-[10px] text-cyan-300 border border-cyan-500/40">
                            Auto-Approved
                          </span>
                        )}
                        {sub.task?.taskType && (
                          <span className="rounded bg-[#102B33]/80 px-2 py-0.5 text-[11px] font-mono text-gray-300">
                            {sub.task.taskType.replace("SOCIAL_X_", "")}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-2.5 text-xs text-gray-400 sm:grid-cols-2">
                        <div>
                          <span className="text-gray-500">Task:</span>{" "}
                          <span className="font-medium text-gray-200">
                            {sub.task?.title || sub.task?.taskCode || sub.taskId}
                          </span>
                          <div className="mt-0.5 text-[11px] font-mono text-gray-500">
                            Task ID: {sub.taskId}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-500">X (Twitter):</span>{" "}
                            {xUsername ? (
                              <a
                                href={`https://x.com/${xUsername}`}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="font-medium text-sky-400 hover:text-sky-300 hover:underline"
                              >
                                @{xUsername}
                              </a>
                            ) : (
                              <span className="text-gray-500 italic">Not connected</span>
                            )}
                          </div>

                          <div className="mt-1 flex items-center gap-1.5">
                            <span className="text-gray-500">Wallet:</span>{" "}
                            {walletAddress ? (
                              <div className="inline-flex items-center gap-1.5">
                                <span className="font-mono text-gray-200" title={walletAddress}>
                                  {safeFormatAddress(walletAddress)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyWallet(walletAddress)}
                                  className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                                  title="Copy wallet address"
                                >
                                  {copiedWallet === walletAddress ? "Copied" : "Copy"}
                                </button>
                              </div>
                            ) : (
                              <span className="text-gray-500 italic">No wallet</span>
                            )}
                          </div>

                          <div className="mt-0.5 text-[11px] font-mono text-gray-500">
                            User ID: {sub.userId}
                          </div>
                        </div>

                        <div>
                          <span className="text-gray-500">Submitted:</span>{" "}
                          <span className="text-gray-300">{formattedSubmittedDate}</span>
                        </div>
                        {sub.reviewedAt && (
                          <div>
                            <span className="text-gray-500">
                              {isAudited ? "Audited At:" : "Processed:"}
                            </span>{" "}
                            <span className="text-gray-300">
                              {new Date(sub.reviewedAt).toLocaleString()}
                            </span>
                          </div>
                        )}
                        {isAudited && sub.reviewerId && (
                          <div>
                            <span className="text-gray-500">Auditor:</span>{" "}
                            <span className="font-mono text-xs text-gray-300" title={sub.reviewerId}>
                              {sub.reviewerId.length > 12 ? `${sub.reviewerId.slice(0, 10)}...` : sub.reviewerId}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Evidence Payload - Hidden for FOLLOW, LIKE, REPOST */}
                      {!isFollowLikeRepost ? (
                        <div className="mt-3 rounded-lg border border-[#163B44] bg-[#051D22]/60 p-3">
                          <span className="mb-1 block text-[11px] font-semibold text-gray-400">
                            Submitted Evidence Content:
                          </span>
                          {proofUrl && (
                            <div className="mb-2">
                              <a
                                href={proofUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-xs break-all text-emerald-400 hover:underline"
                              >
                                {proofUrl}
                              </a>
                            </div>
                          )}
                          {proofText && (
                            <p className="text-xs leading-relaxed whitespace-pre-wrap text-gray-200">
                              {proofText}
                            </p>
                          )}
                          {!proofUrl && !proofText && (
                            <span className="text-xs text-gray-500 italic">
                              No text or URL provided in payload.
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="mt-2 rounded border border-[#163B44]/50 bg-[#0B2026]/20 px-2.5 py-1.5 text-[11px] text-gray-400">
                          <span>Auto-verified social task — manual proof content hidden</span>
                        </div>
                      )}

                      {/* Reviewer Notes (if already reviewed) */}
                      {sub.reviewerNotes && (
                        <div className="rounded-lg border border-[#163B44] bg-[#0B2026]/20 p-2.5 text-xs text-gray-400">
                          <span className="font-semibold text-gray-300">
                            Reviewer Notes:
                          </span>{" "}
                          {sub.reviewerNotes}
                        </div>
                      )}
                    </div>

                    {/* Review Controls */}
                    <div className="w-full flex-shrink-0 space-y-3 border-t border-[#163B44] pt-2 md:w-72 md:border-t-0 md:border-l md:pt-0 md:pl-4">
                      <div>
                        <label
                          htmlFor={`notes-${sub.id}`}
                          className="mb-1 block text-xs font-medium text-gray-400"
                        >
                          Reviewer Feedback Note:
                        </label>
                        <input
                          id={`notes-${sub.id}`}
                          type="text"
                          placeholder={
                            isNeedsAudit
                              ? "Optional reason or feedback..."
                              : isAudited
                              ? "Reason for rejection if invalid..."
                              : "Reason for re-approval..."
                          }
                          value={reviewNotes[sub.id] ?? (isAudited || isRejected ? sub.reviewerNotes ?? "" : "")}
                          onChange={(e) =>
                            setReviewNotes((prev) => ({
                              ...prev,
                              [sub.id]: e.target.value,
                            }))
                          }
                          disabled={isBusy}
                          className="w-full rounded-md border border-[#163B44] bg-[#0B2026]/80 px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          className="flex-1 text-xs"
                          onClick={() => handleReview(sub.id, "APPROVED")}
                          disabled={isBusy || isAudited}
                        >
                          {isPending
                            ? "Approve"
                            : isAudited
                            ? "Confirmed Valid"
                            : "Confirm Valid"}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1 text-xs text-rose-300 hover:bg-rose-900/30 hover:text-rose-200"
                          onClick={() => handleReview(sub.id, "REJECTED")}
                          disabled={isBusy || isRejected}
                        >
                          Reject
                        </Button>
                      </div>

                      <span className="block text-center text-[11px] text-gray-500 italic">
                        {isNeedsAudit
                          ? "Needs admin audit (Auto-approved by system)"
                          : isAudited
                          ? "Audited & confirmed valid by admin"
                          : "Rejected by admin (Can be re-approved)"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Backend Notice */}
      <PlaceholderNotice
        title="Batch & Automated Proof Verifier"
        description="Automated AI social verification and bulk batch review APIs are not yet available. All decisions submitted above are processed instantly through the verified /api/admin/evidence/[id]/review backend."
        phase="Upcoming Feature"
      />
    </div>
  );
}
