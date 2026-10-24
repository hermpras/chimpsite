"use client";

import React, { useEffect, useState } from "react";
import {
  FileCheck2,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Filter,
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
import { PlaceholderNotice } from "@/components/ui/PlaceholderNotice";
import {
  adminListEvidence,
  adminReviewEvidence,
  type AdminListEvidenceInput,
} from "@/lib/admin/client";

interface EvidenceSubmissionItem {
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
  evidenceData?: {
    type?: string;
    url?: string;
    text?: string;
    description?: string;
    submittedProof?: string;
    [key: string]: unknown;
  } | null;
}

export function AdminEvidenceReview() {
  const [filterStatus, setFilterStatus] = useState<
    "ALL" | "PENDING_REVIEW" | "APPROVED" | "REJECTED"
  >("PENDING_REVIEW");
  const [submissions, setSubmissions] = useState<EvidenceSubmissionItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Review action in progress
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const input: AdminListEvidenceInput = {
      limit: 50,
    };
    if (filterStatus !== "ALL") {
      input.status = filterStatus;
    }

    adminListEvidence(input)
      .then((res) => {
        if (isMounted) {
          setSubmissions(res.submissions || []);
          setTotalCount(res.total ?? res.submissions?.length ?? 0);
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
  }, [filterStatus, reloadKey]);

  const handleReview = async (
    submissionId: string,
    decision: "APPROVED" | "REJECTED",
  ) => {
    setReviewingId(submissionId);
    setError(null);
    setActionSuccess(null);
    try {
      const notes = reviewNotes[submissionId] || null;
      await adminReviewEvidence(submissionId, {
        status: decision,
        reviewerNotes: notes,
      });
      setActionSuccess(
        `Submission ${submissionId.slice(0, 8)} successfully ${decision.toLowerCase()}!`,
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Evidence Review
            </h1>
            <Badge variant="warning">{totalCount} Found</Badge>
          </div>
          <p className="mt-1 text-sm text-gray-400">
            Moderate quest evidence submissions, verify user task proofs, and approve
            point allocations.
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
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-800 pb-3">
        <span className="mr-2 flex items-center gap-1 text-xs font-medium text-gray-400">
          <Filter className="h-3.5 w-3.5" /> Filter:
        </span>
        {(["PENDING_REVIEW", "APPROVED", "REJECTED", "ALL"] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filterStatus === status
                ? "border border-emerald-500/30 bg-emerald-500/20 text-emerald-400"
                : "text-gray-400 hover:bg-gray-800/60 hover:text-white"
            }`}
          >
            {status === "ALL" ? "All Submissions" : status.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Submissions List */}
      {loading ? (
        <div className="rounded-lg border border-gray-800 bg-[#0c0e17] p-12 text-center text-sm text-gray-400">
          <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin text-emerald-400" />
          Loading evidence submissions...
        </div>
      ) : submissions.length === 0 ? (
        <Card className="border-gray-800 bg-[#0c0e17]">
          <CardContent className="p-12 text-center">
            <FileCheck2 className="mx-auto mb-3 h-10 w-10 text-gray-600" />
            <h3 className="text-base font-semibold text-gray-300">
              No Submissions Found
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              There are no evidence records matching the current filter ({filterStatus}).
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {submissions.map((sub) => {
            const isPending = sub.status === "PENDING_REVIEW";
            const isApproved = sub.status === "APPROVED";
            const isRejected = sub.status === "REJECTED";
            const isBusy = reviewingId === sub.id;

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
                className="border-gray-800 bg-[#0c0e17]/90 transition-all hover:border-gray-700/80"
              >
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-emerald-400">
                          ID: {sub.id}
                        </span>
                        <Badge
                          variant={
                            isApproved ? "success" : isRejected ? "warning" : "outline"
                          }
                        >
                          {sub.status.replace("_", " ")}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 gap-2 text-xs text-gray-400 sm:grid-cols-2">
                        <div>
                          <span className="text-gray-500">Task ID:</span>{" "}
                          <span className="font-mono text-gray-300">{sub.taskId}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">User ID:</span>{" "}
                          <span className="font-mono text-gray-300">{sub.userId}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Submitted:</span>{" "}
                          <span className="text-gray-300">{formattedSubmittedDate}</span>
                        </div>
                        {sub.reviewedAt && (
                          <div>
                            <span className="text-gray-500">Reviewed:</span>{" "}
                            <span className="text-gray-300">
                              {new Date(sub.reviewedAt).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Evidence Payload */}
                      <div className="mt-3 rounded-lg border border-gray-800/80 bg-gray-900/40 p-3">
                        <span className="mb-1 block text-[11px] font-semibold text-gray-400">
                          Submitted Evidence Content:
                        </span>
                        {proofUrl && (
                          <div className="mb-2">
                            <a
                              href={proofUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1.5 text-xs break-all text-emerald-400 hover:underline"
                            >
                              <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
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

                      {/* Reviewer Notes (if already reviewed) */}
                      {sub.reviewerNotes && (
                        <div className="rounded-lg border border-gray-800 bg-gray-900/20 p-2.5 text-xs text-gray-400">
                          <span className="font-semibold text-gray-300">
                            Reviewer Notes:
                          </span>{" "}
                          {sub.reviewerNotes}
                        </div>
                      )}
                    </div>

                    {/* Review Controls */}
                    <div className="w-full flex-shrink-0 space-y-3 border-t border-gray-800 pt-2 md:w-72 md:border-t-0 md:border-l md:pt-0 md:pl-4">
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
                            isPending
                              ? "Optional reason or feedback..."
                              : "Review completed"
                          }
                          value={reviewNotes[sub.id] ?? sub.reviewerNotes ?? ""}
                          onChange={(e) =>
                            setReviewNotes((prev) => ({
                              ...prev,
                              [sub.id]: e.target.value,
                            }))
                          }
                          disabled={isBusy || !isPending}
                          className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          className="flex-1 gap-1 text-xs"
                          onClick={() => handleReview(sub.id, "APPROVED")}
                          disabled={isBusy || !isPending}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1 gap-1 text-xs text-rose-300 hover:bg-rose-900/30 hover:text-rose-200"
                          onClick={() => handleReview(sub.id, "REJECTED")}
                          disabled={isBusy || !isPending}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                      </div>

                      {!isPending && (
                        <span className="block text-center text-[11px] text-gray-500 italic">
                          Previously {sub.status.toLowerCase()}
                        </span>
                      )}
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
