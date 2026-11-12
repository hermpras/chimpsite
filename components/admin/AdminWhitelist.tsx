"use client";

import React, { useState, useEffect, useCallback } from "react";
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
import {
  adminListWLPrograms,
  adminUpdateWLProgram,
  adminExportOpenSeaAllowlist,
  adminListGtdSlotReviews,
  adminUpdateGtdSlotReview,
  adminGetGtdSlotReviewDetail,
  adminListFcfsDirectory,
  adminManualGrantSlot,
  adminRevokeSlot,
  adminGetPreExportSummary,
  type AdminWLProgramRecord,
  type AdminPreExportSummaryResponse,
  type AdminGtdSlotReviewDetailResponse,
  type AdminFcfsDirectoryEntry,
} from "@/lib/admin/client";
import type { GtdSlotReviewItem } from "@/server/admin/slot-review";
import { safeFormatAddress } from "@/lib/auth/address";

export function AdminWhitelist() {
  // Global reload triggers
  const [reloadKey, setReloadKey] = useState(0);

  // ---------------------------------------------------------------------------
  // 1. Permanent Whitelist Program & Summary State
  // ---------------------------------------------------------------------------
  const [program, setProgram] = useState<AdminWLProgramRecord | null>(null);
  const [loadingProgram, setLoadingProgram] = useState(true);
  const [programError, setProgramError] = useState<string | null>(null);
  const [updatingProgStatus, setUpdatingProgStatus] = useState(false);
  const [progStatusSuccess, setProgStatusSuccess] = useState<string | null>(null);

  const [summary, setSummary] = useState<AdminPreExportSummaryResponse | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  // Copy feedback helper
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAddress(text);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  // Fetch single permanent program and pre-export summary
  useEffect(() => {
    let isMounted = true;
    setLoadingProgram(true);
    setLoadingSummary(true);

    adminListWLPrograms()
      .then((res) => {
        if (!isMounted) return;
        const canonicalProg = res.programs?.[0] || null;
        setProgram(canonicalProg);
        setProgramError(null);
        setLoadingProgram(false);

        if (canonicalProg) {
          return adminGetPreExportSummary({ programId: canonicalProg.id });
        }
        return null;
      })
      .then((summaryRes) => {
        if (!isMounted) return;
        if (summaryRes) {
          setSummary(summaryRes);
        }
        setLoadingSummary(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setProgramError((err as Error).message || "Failed to load whitelist program.");
        setLoadingProgram(false);
        setLoadingSummary(false);
      });

    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  const handleUpdateProgramStatus = async (newStatus: "UPCOMING" | "OPEN" | "PAUSED" | "FINALIZED" | "CLOSED") => {
    if (!program) return;
    setUpdatingProgStatus(true);
    setProgStatusSuccess(null);
    try {
      const updated = await adminUpdateWLProgram(program.id, { status: newStatus });
      setProgram(updated.program);
      setProgStatusSuccess(`Program status updated to ${newStatus}.`);
      setReloadKey((k) => k + 1);
      setTimeout(() => setProgStatusSuccess(null), 3000);
    } catch (err: unknown) {
      setProgramError((err as Error).message || "Failed to update program status.");
    } finally {
      setUpdatingProgStatus(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 2. GTD Review Console State (Task 6.3)
  // ---------------------------------------------------------------------------
  const [reviews, setReviews] = useState<GtdSlotReviewItem[]>([]);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [reviewsPage, setReviewsPage] = useState(1);
  const [reviewsTab, setReviewsTab] = useState<
    "ALL" | "NOT_REVIEWED" | "UNDER_REVIEW" | "VALID" | "FLAGGED"
  >("ALL");
  const [reviewSearchQuery, setReviewSearchQuery] = useState("");
  const [reviewSearchSubmitted, setReviewSearchSubmitted] = useState("");
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  const reviewsLimit = 10;

  useEffect(() => {
    let isMounted = true;
    setLoadingReviews(true);

    adminListGtdSlotReviews({
      programId: program?.id,
      reviewStatus: reviewsTab === "ALL" ? undefined : reviewsTab,
      search: reviewSearchSubmitted.trim() || undefined,
      limit: reviewsLimit,
      offset: (reviewsPage - 1) * reviewsLimit,
    })
      .then((res) => {
        if (!isMounted) return;
        setReviews(res.slots as unknown as GtdSlotReviewItem[]);
        setReviewsTotal(res.total);
        setReviewsError(null);
        setLoadingReviews(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setReviewsError((err as Error).message || "Failed to load GTD reviews.");
        setLoadingReviews(false);
      });

    return () => {
      isMounted = false;
    };
  }, [reviewsPage, reviewsTab, reviewSearchSubmitted, reloadKey, program?.id]);

  const handleReviewSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setReviewsPage(1);
    setReviewSearchSubmitted(reviewSearchQuery);
  };

  // ---------------------------------------------------------------------------
  // 3. Review Details Modal State (Task 6.3)
  // ---------------------------------------------------------------------------
  const [selectedReviewSlotId, setSelectedReviewSlotId] = useState<string | null>(null);
  const [reviewDetail, setReviewDetail] = useState<AdminGtdSlotReviewDetailResponse | null>(null);
  const [loadingReviewDetail, setLoadingReviewDetail] = useState(false);
  const [reviewDetailError, setReviewDetailError] = useState<string | null>(null);

  const [editReviewStatus, setEditReviewStatus] = useState<
    "NOT_REVIEWED" | "UNDER_REVIEW" | "VALID" | "FLAGGED"
  >("NOT_REVIEWED");
  const [editReviewNotes, setEditReviewNotes] = useState("");
  const [savingReview, setSavingReview] = useState(false);
  const [saveReviewSuccess, setSaveReviewSuccess] = useState<string | null>(null);
  const [saveReviewError, setSaveReviewError] = useState<string | null>(null);

  const openReviewModal = async (slotId: string) => {
    setSelectedReviewSlotId(slotId);
    setLoadingReviewDetail(true);
    setReviewDetailError(null);
    setSaveReviewSuccess(null);
    setSaveReviewError(null);
    try {
      const detail = await adminGetGtdSlotReviewDetail(slotId);
      setReviewDetail(detail);
      setEditReviewStatus(detail.slot.reviewStatus);
      setEditReviewNotes(detail.slot.reviewNotes || "");
    } catch (err: unknown) {
      setReviewDetailError((err as Error).message || "Failed to fetch review detail.");
    } finally {
      setLoadingReviewDetail(false);
    }
  };

  const closeReviewModal = () => {
    setSelectedReviewSlotId(null);
    setReviewDetail(null);
    setSaveReviewSuccess(null);
    setSaveReviewError(null);
  };

  const handleSaveReview = async () => {
    if (!selectedReviewSlotId) return;
    setSavingReview(true);
    setSaveReviewError(null);
    setSaveReviewSuccess(null);
    try {
      await adminUpdateGtdSlotReview({
        slotId: selectedReviewSlotId,
        reviewStatus: editReviewStatus,
        reviewNotes: editReviewNotes.trim() || null,
      });
      setSaveReviewSuccess("Review updated successfully.");
      setReloadKey((k) => k + 1);
      // Refresh review detail in modal
      const refreshed = await adminGetGtdSlotReviewDetail(selectedReviewSlotId);
      setReviewDetail(refreshed);
      setTimeout(() => setSaveReviewSuccess(null), 3000);
    } catch (err: unknown) {
      setSaveReviewError((err as Error).message || "Failed to update review status.");
    } finally {
      setSavingReview(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 4. FCFS Directory State (Task 6.4)
  // ---------------------------------------------------------------------------
  const [directory, setDirectory] = useState<AdminFcfsDirectoryEntry[]>([]);
  const [directoryTotal, setDirectoryTotal] = useState(0);
  const [directoryPage, setDirectoryPage] = useState(1);
  const [directoryQualifiedOnly, setDirectoryQualifiedOnly] = useState(false);
  const [directorySearchQuery, setDirectorySearchQuery] = useState("");
  const [directorySearchSubmitted, setDirectorySearchSubmitted] = useState("");
  const [loadingDirectory, setLoadingDirectory] = useState(true);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const directoryLimit = 10;

  useEffect(() => {
    let isMounted = true;
    setLoadingDirectory(true);

    adminListFcfsDirectory({
      programId: program?.id,
      search: directorySearchSubmitted.trim() || undefined,
      qualifiedOnly: directoryQualifiedOnly,
      limit: directoryLimit,
      offset: (directoryPage - 1) * directoryLimit,
    })
      .then((res) => {
        if (!isMounted) return;
        setDirectory(res.entries);
        setDirectoryTotal(res.total);
        setDirectoryError(null);
        setLoadingDirectory(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setDirectoryError((err as Error).message || "Failed to load FCFS directory.");
        setLoadingDirectory(false);
      });

    return () => {
      isMounted = false;
    };
  }, [
    directoryPage,
    directoryQualifiedOnly,
    directorySearchSubmitted,
    reloadKey,
    program?.id,
  ]);

  const handleDirectorySearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDirectoryPage(1);
    setDirectorySearchSubmitted(directorySearchQuery);
  };

  // ---------------------------------------------------------------------------
  // 5. Manual GTD Grant Confirmation Modal State (Task 6.4)
  // ---------------------------------------------------------------------------
  const [grantCandidate, setGrantCandidate] = useState<AdminFcfsDirectoryEntry | null>(null);
  const [grantNotes, setGrantNotes] = useState("");
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantSuccess, setGrantSuccess] = useState<string | null>(null);

  const openGrantModal = (candidate: AdminFcfsDirectoryEntry) => {
    setGrantCandidate(candidate);
    setGrantNotes("");
    setGrantError(null);
    setGrantSuccess(null);
  };

  const closeGrantModal = () => {
    setGrantCandidate(null);
    setGrantNotes("");
    setGrantError(null);
    setGrantSuccess(null);
  };

  const handleConfirmGrant = async () => {
    if (!grantCandidate || !program) return;
    setGranting(true);
    setGrantError(null);
    setGrantSuccess(null);
    try {
      const res = await adminManualGrantSlot({
        programId: program.id,
        candidateUserId: grantCandidate.userId,
        notes: grantNotes.trim() || null,
      });
      setGrantSuccess(`Successfully granted GTD slot #${res.slot.slotNumber}!`);
      setReloadKey((k) => k + 1);
      setTimeout(() => {
        closeGrantModal();
      }, 1500);
    } catch (err: unknown) {
      setGrantError((err as Error).message || "Failed to manually grant GTD slot.");
    } finally {
      setGranting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 6. Guarded Revocation Modal State (Task 6.5)
  // ---------------------------------------------------------------------------
  const [revokeTarget, setRevokeTarget] = useState<{
    slotId: string;
    slotNumber: number;
    walletAddress?: string | null;
    username?: string | null;
  } | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokeSuccess, setRevokeSuccess] = useState<string | null>(null);

  const openRevokeModal = (target: {
    slotId: string;
    slotNumber: number;
    walletAddress?: string | null;
    username?: string | null;
  }) => {
    setRevokeTarget(target);
    setRevokeReason("");
    setRevokeError(null);
    setRevokeSuccess(null);
  };

  const closeRevokeModal = () => {
    setRevokeTarget(null);
    setRevokeReason("");
    setRevokeError(null);
    setRevokeSuccess(null);
  };

  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;
    if (revokeReason.trim().length < 5) {
      setRevokeError("Reason must be at least 5 characters long.");
      return;
    }
    setRevoking(true);
    setRevokeError(null);
    setRevokeSuccess(null);
    try {
      await adminRevokeSlot({
        slotId: revokeTarget.slotId,
        reason: revokeReason.trim(),
      });
      setRevokeSuccess(`Slot #${revokeTarget.slotNumber} was successfully revoked.`);
      setReloadKey((k) => k + 1);
      // Close review detail modal if open
      if (selectedReviewSlotId === revokeTarget.slotId) {
        closeReviewModal();
      }
      setTimeout(() => {
        closeRevokeModal();
      }, 1500);
    } catch (err: unknown) {
      setRevokeError((err as Error).message || "Failed to revoke whitelist slot.");
    } finally {
      setRevoking(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 7. OpenSea CSV Export State (Task 6.6)
  // ---------------------------------------------------------------------------
  const [exportingStage, setExportingStage] = useState<"gtd" | "fcfs" | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async (stage: "gtd" | "fcfs") => {
    if (!program) return;
    setExportingStage(stage);
    setExportError(null);
    setExportSuccess(null);
    try {
      const res = await adminExportOpenSeaAllowlist({
        stage,
        programId: program.id,
      });
      setExportSuccess(
        `Successfully exported ${res.count} ${stage.toUpperCase()} wallet(s) to ${res.filename}`,
      );
    } catch (err: unknown) {
      setExportError(
        (err as Error).message || `Failed to export OpenSea ${stage.toUpperCase()} allowlist.`,
      );
    } finally {
      setExportingStage(null);
    }
  };

  // Metrics calculation
  const totalSlots = program?.totalSlots ?? 0;
  const allocatedCount = summary?.gtd.allocatedCount ?? program?.allocatedSlotsCount ?? 0;
  const vacantSlots = Math.max(0, totalSlots - allocatedCount);
  const capacityPercent = totalSlots > 0 ? Math.round((allocatedCount / totalSlots) * 100) : 0;

  const totalDirectoryEntries = summary?.fcfs.totalDirectoryEntries ?? directoryTotal ?? 0;
  const qualifiedReadyCount = summary?.fcfs.qualifiedReadyCount ?? 0;

  const flaggedCount = summary?.gtd.flaggedCount ?? 0;
  const notReviewedCount =
    reviews.filter((r) => r.reviewStatus === "NOT_REVIEWED").length;
  const underReviewCount =
    reviews.filter((r) => r.reviewStatus === "UNDER_REVIEW").length;
  const validCount = reviews.filter((r) => r.reviewStatus === "VALID").length;
  const totalNeedsReview = flaggedCount + notReviewedCount + underReviewCount;

  return (
    <div className="space-y-6">
      {/* --------------------------------------------------------------------- */}
      {/* SECTION 1: PROGRAM OVERVIEW & METRICS CARDS                            */}
      {/* --------------------------------------------------------------------- */}
      <Card className="border border-white/10 bg-slate-900/60 backdrop-blur-sm">
        <CardHeader className="pb-4 border-b border-white/5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <CardTitle className="text-xl font-bold text-white">
                  {program ? program.name : "Permanent Whitelist Program"}
                </CardTitle>
                {program && (
                  <Badge
                    variant={
                      program.status === "OPEN"
                        ? "success"
                        : program.status === "PAUSED"
                        ? "warning"
                        : "default"
                    }
                    className="font-mono text-xs"
                  >
                    {program.status}
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs text-gray-400">
                Single canonical Elysium qualification program (slug:{" "}
                <span className="font-mono text-gray-300">
                  {program?.slug || "loading..."}
                </span>
                )
              </CardDescription>
            </div>

            {/* Quick status controller */}
            {program && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Status:</span>
                <select
                  disabled={updatingProgStatus || program.status === "CLOSED"}
                  value={program.status}
                  onChange={(e) =>
                    handleUpdateProgramStatus(
                      e.target.value as "UPCOMING" | "OPEN" | "PAUSED" | "FINALIZED" | "CLOSED",
                    )
                  }
                  className="rounded bg-slate-800 border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                  title={program.status === "CLOSED" ? "Program is permanently CLOSED and cannot be reopened." : undefined}
                >
                  <option value="UPCOMING">UPCOMING</option>
                  <option value="OPEN">OPEN</option>
                  <option value="PAUSED">PAUSED</option>
                  <option value="FINALIZED">FINALIZED</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loadingProgram || loadingSummary}
                  onClick={() => setReloadKey((k) => k + 1)}
                  className="h-8 w-8 p-0 border-white/10 text-gray-300 hover:text-white"
                  title="Refresh Overview"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${
                      loadingProgram || loadingSummary ? "animate-spin" : ""
                    }`}
                  />
                </Button>
              </div>
            )}
          </div>

          {progStatusSuccess && (
            <div className="mt-3 rounded border border-emerald-500/20 bg-emerald-500/10 p-2 text-xs text-emerald-400">
              <span>{progStatusSuccess}</span>
            </div>
          )}
          {programError && (
            <div className="mt-3 rounded border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-400">
              <span>{programError}</span>
            </div>
          )}
        </CardHeader>

        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. GTD Slots Capacity */}
            <div className="rounded-lg border border-white/5 bg-slate-800/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400">GTD Capacity</span>
                <Badge
                  variant={vacantSlots > 0 ? "success" : "warning"}
                  className="text-[11px]"
                >
                  {vacantSlots > 0 ? `${vacantSlots} Vacant` : "Capacity Full"}
                </Badge>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold text-white tracking-tight">
                  {allocatedCount}{" "}
                  <span className="text-sm font-normal text-gray-400">
                    / {totalSlots}
                  </span>
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      capacityPercent >= 100 ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(100, capacityPercent)}%` }}
                  />
                </div>
              </div>
              <p className="text-[11px] text-gray-400">
                {capacityPercent}% filled. Instant allocation for qualified users.
              </p>
            </div>

            {/* 2. FCFS Directory Total */}
            <div className="rounded-lg border border-white/5 bg-slate-800/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400">FCFS Directory</span>
                <Badge variant="default" className="text-[11px]">
                  EVM + X Linked
                </Badge>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold text-white tracking-tight">
                  {totalDirectoryEntries}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-emerald-400">
                    {qualifiedReadyCount} Qualified
                  </span>
                  <span className="text-gray-500">/</span>
                  <span className="text-gray-400">
                    {Math.max(0, totalDirectoryEntries - qualifiedReadyCount)} Pending
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-gray-400">
                Chronologically ordered registry. Zero auto-promotion queues.
              </p>
            </div>

            {/* 3. Needs Review Counter */}
            <div className="rounded-lg border border-white/5 bg-slate-800/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400">Needs Review</span>
                {flaggedCount > 0 ? (
                  <Badge variant="warning" className="text-[11px]">
                    {flaggedCount} Flagged
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[11px] text-gray-400">
                    Normal
                  </Badge>
                )}
              </div>
              <div className="text-2xl font-bold text-white tracking-tight">
                {totalNeedsReview}{" "}
                <span className="text-sm font-normal text-gray-400">Total</span>
              </div>
              <div className="grid grid-cols-3 gap-1 pt-1 text-[11px]">
                <div className="rounded bg-slate-900/60 p-1 text-center">
                  <div className="text-gray-400">Unreviewed</div>
                  <div className="font-semibold text-gray-300">{notReviewedCount}</div>
                </div>
                <div className="rounded bg-slate-900/60 p-1 text-center">
                  <div className="text-blue-400">In Review</div>
                  <div className="font-semibold text-blue-300">{underReviewCount}</div>
                </div>
                <div className="rounded bg-slate-900/60 p-1 text-center">
                  <div className="text-amber-400">Flagged</div>
                  <div className="font-semibold text-amber-300">{flaggedCount}</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* --------------------------------------------------------------------- */}
      {/* SECTION 2: GTD POST-ALLOCATION REVIEW CONSOLE (Task 6.3)             */}
      {/* --------------------------------------------------------------------- */}
      <Card className="border border-white/10 bg-slate-900/60 backdrop-blur-sm">
        <CardHeader className="pb-3 border-b border-white/5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base text-white">GTD Post-Allocation Review</CardTitle>
              <Badge variant="outline" className="text-xs">
                {reviewsTotal} Allocated Slots
              </Badge>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap gap-1 bg-slate-950/60 p-1 rounded-lg border border-white/5">
              {(
                [
                  { key: "ALL", label: "All" },
                  { key: "NOT_REVIEWED", label: "Not Reviewed" },
                  { key: "UNDER_REVIEW", label: "Under Review" },
                  { key: "VALID", label: "Valid" },
                  { key: "FLAGGED", label: "Flagged" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => {
                    setReviewsTab(tab.key);
                    setReviewsPage(1);
                  }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    reviewsTab === tab.key
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <CardDescription className="text-xs text-gray-400 mt-1">
            Review allocated GTD slots post-qualification. Review status is independent of slot
            active status (DEC-015).
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          {/* Search bar */}
          <form onSubmit={handleReviewSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search GTD slots by wallet (0x...) or X username (@...)"
                value={reviewSearchQuery}
                onChange={(e) => setReviewSearchQuery(e.target.value)}
                className="w-full rounded bg-slate-800/80 border border-white/10 px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <Button type="submit" variant="outline" size="sm" className="text-xs">
              Search
            </Button>
            {reviewSearchSubmitted && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setReviewSearchQuery("");
                  setReviewSearchSubmitted("");
                  setReviewsPage(1);
                }}
                className="text-xs text-gray-400 hover:text-white"
              >
                Clear
              </Button>
            )}
          </form>

          {/* Table */}
          {reviewsError && (
            <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {reviewsError}
            </div>
          )}

          <div className="overflow-x-auto rounded border border-white/5">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-gray-400 border-b border-white/5">
                <tr>
                  <th className="py-2.5 px-3">Slot #</th>
                  <th className="py-2.5 px-3">Participant</th>
                  <th className="py-2.5 px-3">Allocation</th>
                  <th className="py-2.5 px-3">Review Status</th>
                  <th className="py-2.5 px-3">Reviewer</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loadingReviews ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      Loading GTD slots...
                    </td>
                  </tr>
                ) : reviews.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      No GTD slots found matching criteria.
                    </td>
                  </tr>
                ) : (
                  reviews.map((slot) => {
                    const address = slot.user?.wallet?.address;
                    const username = slot.user?.xIdentity?.username;
                    return (
                      <tr key={slot.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-white">
                          #{slot.slotNumber.toString().padStart(3, "0")}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-col gap-0.5">
                            {address ? (
                              <div className="flex items-center gap-1.5 font-mono text-gray-200">
                                <span>{safeFormatAddress(address)}</span>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(address)}
                                  className="text-[10px] text-gray-500 hover:text-white transition-colors"
                                  title="Copy address"
                                >
                                  {copiedAddress === address ? "Copied" : "Copy"}
                                </button>
                              </div>
                            ) : (
                              <span className="text-gray-500">No wallet</span>
                            )}
                            {username ? (
                              <span className="text-[11px] text-blue-400">
                                @{username}
                              </span>
                            ) : (
                              <span className="text-[11px] text-gray-500">No X linked</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-gray-400">
                          <div>{new Date(slot.allocatedAt).toLocaleDateString()}</div>
                          <span className="text-[10px] text-gray-500">
                            {slot.allocatedBy || "SYSTEM"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge
                            variant={
                              slot.reviewStatus === "VALID"
                                ? "success"
                                : slot.reviewStatus === "FLAGGED"
                                ? "warning"
                                : slot.reviewStatus === "UNDER_REVIEW"
                                ? "default"
                                : "outline"
                            }
                            className="text-[10px]"
                          >
                            {slot.reviewStatus}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-gray-400">
                          {safeFormatAddress(slot.reviewedBy)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openReviewModal(slot.id)}
                              className="h-7 text-xs px-2.5 border-white/10"
                            >
                              Review Details
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                openRevokeModal({
                                  slotId: slot.id,
                                  slotNumber: slot.slotNumber,
                                  walletAddress: address,
                                  username,
                                })
                              }
                              className="h-7 text-xs px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                              title="Revoke Slot"
                            >
                              Revoke
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {reviewsTotal > reviewsLimit && (
            <div className="flex items-center justify-between text-xs text-gray-400 pt-2">
              <div>
                Showing {(reviewsPage - 1) * reviewsLimit + 1}–
                {Math.min(reviewsPage * reviewsLimit, reviewsTotal)} of {reviewsTotal}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reviewsPage <= 1}
                  onClick={() => setReviewsPage((p) => Math.max(1, p - 1))}
                  className="h-7 px-2 text-xs"
                >
                  Previous
                </Button>
                <span className="px-2">Page {reviewsPage}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reviewsPage * reviewsLimit >= reviewsTotal}
                  onClick={() => setReviewsPage((p) => p + 1)}
                  className="h-7 px-2 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* --------------------------------------------------------------------- */}
      {/* SECTION 3: FCFS DIRECTORY (ALL PARTICIPANTS) (Task 6.4)               */}
      {/* --------------------------------------------------------------------- */}
      <Card className="border border-white/10 bg-slate-900/60 backdrop-blur-sm">
        <CardHeader className="pb-3 border-b border-white/5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base text-white">
                FCFS Directory (All Participants)
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                {directoryTotal} Total Entries
              </Badge>
            </div>

            {/* Filter Toggle */}
            <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-lg border border-white/5">
              <button
                type="button"
                onClick={() => {
                  setDirectoryQualifiedOnly(false);
                  setDirectoryPage(1);
                }}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  !directoryQualifiedOnly
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                All Participants
              </button>
              <button
                type="button"
                onClick={() => {
                  setDirectoryQualifiedOnly(true);
                  setDirectoryPage(1);
                }}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  directoryQualifiedOnly
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Fully Qualified Only
              </button>
            </div>
          </div>

          <CardDescription className="text-xs text-gray-400 mt-1">
            Ordered strictly chronologically by registration timestamp (joinedAt ASC, queueNumber
            ASC). Under-qualified participants are retained in the directory but excluded from CSV
            export (DEC-013, DEC-017).
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          {/* Search bar */}
          <form onSubmit={handleDirectorySearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search FCFS directory by wallet address or @username..."
                value={directorySearchQuery}
                onChange={(e) => setDirectorySearchQuery(e.target.value)}
                className="w-full rounded bg-slate-800/80 border border-white/10 px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <Button type="submit" variant="outline" size="sm" className="text-xs">
              Search
            </Button>
            {directorySearchSubmitted && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDirectorySearchQuery("");
                  setDirectorySearchSubmitted("");
                  setDirectoryPage(1);
                }}
                className="text-xs text-gray-400 hover:text-white"
              >
                Clear
              </Button>
            )}
          </form>

          {directoryError && (
            <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {directoryError}
            </div>
          )}

          <div className="overflow-x-auto rounded border border-white/5">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-gray-400 border-b border-white/5">
                <tr>
                  <th className="py-2.5 px-3">Join #</th>
                  <th className="py-2.5 px-3">Wallet</th>
                  <th className="py-2.5 px-3">X Handle</th>
                  <th className="py-2.5 px-3">WL Qualification Status</th>
                  <th className="py-2.5 px-3">Registered At</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loadingDirectory ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      Loading FCFS directory...
                    </td>
                  </tr>
                ) : directory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      No participants found.
                    </td>
                  </tr>
                ) : (
                  directory.map((entry) => {
                    const address = entry.user.walletAddress;
                    const username = entry.user.xIdentity?.username;
                    const qual = entry.qualification;
                    const canGrant = qual.isFullyQualified && vacantSlots > 0;

                    let grantDisabledReason = "";
                    if (!qual.isFullyQualified) {
                      grantDisabledReason =
                        qual.missingRequirements?.[0] ||
                        `Missing requirements (${qual.heldCategoriesCount}/5 traits, tasks incomplete)`;
                    } else if (vacantSlots === 0) {
                      grantDisabledReason = "GTD capacity is full (0 vacant slots)";
                    }

                    return (
                      <tr key={entry.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-white">
                          #{entry.queueNumber}
                        </td>
                        <td className="py-2.5 px-3">
                          {address ? (
                            <div className="flex items-center gap-1.5 font-mono text-gray-200">
                              <span>{safeFormatAddress(address)}</span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(address)}
                                className="text-[10px] text-gray-500 hover:text-white transition-colors"
                                title="Copy address"
                              >
                                {copiedAddress === address ? "Copied" : "Copy"}
                              </button>
                            </div>
                          ) : (
                            <span className="text-gray-500">No wallet</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {username ? (
                            <span className="text-blue-400">@{username}</span>
                          ) : (
                            <span className="text-gray-500">No X linked</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* Trait category badge */}
                            <Badge
                              variant={qual.heldCategoriesCount === 5 ? "success" : "default"}
                              className="text-[10px]"
                            >
                              {qual.heldCategoriesCount}/5 Traits
                            </Badge>

                            {/* Campaign tasks badge */}
                            <Badge
                              variant={qual.tasksCompleted ? "success" : "warning"}
                              className="text-[10px]"
                            >
                              {qual.tasksCompleted ? "Tasks Done" : "Tasks Incomplete"}
                            </Badge>

                            {/* Ban status */}
                            {qual.isBanned && (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-red-400 border-red-500/30 bg-red-500/10"
                              >
                                Banned
                              </Badge>
                            )}

                            {/* Fully Qualified highlight */}
                            {qual.isFullyQualified && (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10 font-bold"
                              >
                                Ready
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-gray-400">
                          {new Date(entry.joinedAt).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Button
                            size="sm"
                            disabled={!canGrant}
                            onClick={() => openGrantModal(entry)}
                            title={grantDisabledReason || "Grant Vacant GTD Slot"}
                            className={`h-7 text-xs px-2.5 ${
                              canGrant
                                ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                                : "opacity-40 cursor-not-allowed"
                            }`}
                          >
                            Grant GTD
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {directoryTotal > directoryLimit && (
            <div className="flex items-center justify-between text-xs text-gray-400 pt-2">
              <div>
                Showing {(directoryPage - 1) * directoryLimit + 1}–
                {Math.min(directoryPage * directoryLimit, directoryTotal)} of {directoryTotal}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={directoryPage <= 1}
                  onClick={() => setDirectoryPage((p) => Math.max(1, p - 1))}
                  className="h-7 px-2 text-xs"
                >
                  Previous
                </Button>
                <span className="px-2">Page {directoryPage}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={directoryPage * directoryLimit >= directoryTotal}
                  onClick={() => setDirectoryPage((p) => p + 1)}
                  className="h-7 px-2 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* --------------------------------------------------------------------- */}
      {/* SECTION 4: OPENSEA ALLOWLIST CSV EXPORT (Task 6.6)                    */}
      {/* --------------------------------------------------------------------- */}
      <Card className="border border-white/10 bg-slate-900/60 backdrop-blur-sm">
        <CardHeader className="pb-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base text-white">
              OpenSea SeaDrop Allowlist CSV Export
            </CardTitle>
            <Badge variant="success" className="text-[10px]">
              Strict Disjoint Guarantee
            </Badge>
          </div>
          <CardDescription className="text-xs text-gray-400">
            Generate production allowlist CSV files consumed by OpenSea Studio for SeaDrop Phase 1
            (GTD) and Phase 2 (FCFS). Revoked and banned wallets are strictly excluded.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6 space-y-4">
          {/* Notification Banners */}
          {exportSuccess && (
            <div
              data-testid="export-success-banner"
              className="rounded border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-400"
            >
              <span>{exportSuccess}</span>
            </div>
          )}
          {exportError && (
            <div
              data-testid="export-error-banner"
              className="rounded border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400"
            >
              <span>{exportError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card 1: GTD Allowlist Export */}
            <div className="rounded-lg border border-white/10 bg-slate-800/40 p-5 space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white text-sm">
                    1. Guaranteed Allowlist (GTD)
                  </span>
                  <Badge variant="default" className="text-xs font-mono">
                    {summary?.gtd.allocatedCount ?? allocatedCount} Wallets
                  </Badge>
                </div>
                <p className="text-xs text-gray-400">
                  Active guaranteed slots in slot number order. OpenSea format:{" "}
                  <code className="text-emerald-400">&lt;address&gt;,1</code> without headers.
                </p>

                {/* FLAGGED Slots Pre-Export Warning (DEC-015, DEC-020) */}
                {flaggedCount > 0 && (
                  <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 space-y-1">
                    <div className="font-semibold">
                      <span>Notice: {flaggedCount} FLAGGED slot(s) included</span>
                    </div>
                    <p className="text-[11px] text-amber-200/80 leading-relaxed">
                      Active FLAGGED slots remain in the GTD export because they have not been
                      revoked. To exclude an account, revoke its slot with an official reason before
                      exporting.
                    </p>
                  </div>
                )}
              </div>

              <Button
                data-testid="export-gtd-btn"
                disabled={exportingStage !== null || !program}
                onClick={() => handleExport("gtd")}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center text-xs py-2"
              >
                {exportingStage === "gtd" ? "Generating GTD CSV..." : "Download GTD CSV"}
              </Button>
            </div>

            {/* Card 2: FCFS Allowlist Export */}
            <div className="rounded-lg border border-white/10 bg-slate-800/40 p-5 space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white text-sm">
                    2. FCFS Allowlist
                  </span>
                  <Badge variant="success" className="text-xs font-mono">
                    {summary?.fcfs.qualifiedReadyCount ?? 0} Qualified Wallets
                  </Badge>
                </div>
                <p className="text-xs text-gray-400">
                  Strictly exports participants who meet all 5 WL criteria. Under-qualified
                  directory participants and active GTD holders are excluded (DEC-017, DEC-020).
                </p>

                <div className="rounded border border-white/5 bg-slate-900/50 p-2.5 text-xs text-gray-300 space-y-1">
                  <div className="text-emerald-400 font-medium">
                    <span>Disjoint Set Guarantee</span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Runtime verification ensures zero wallet overlap between GTD and FCFS lists.
                  </p>
                </div>
              </div>

              <Button
                data-testid="export-fcfs-btn"
                disabled={exportingStage !== null || !program}
                onClick={() => handleExport("fcfs")}
                className="w-full bg-teal-600 hover:bg-teal-500 text-white flex items-center justify-center text-xs py-2"
              >
                {exportingStage === "fcfs" ? "Generating FCFS CSV..." : "Download FCFS CSV"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* --------------------------------------------------------------------- */}
      {/* MODAL 1: REVIEW DETAILS MODAL (Task 6.3)                              */}
      {/* --------------------------------------------------------------------- */}
      {selectedReviewSlotId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-xl border border-white/15 bg-slate-900 shadow-2xl overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-950/60">
              <div>
                <h3 className="text-base font-semibold text-white">
                  GTD Slot Review Details — #{reviewDetail?.slot.slotNumber ?? "..."}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeReviewModal}
                className="text-xs font-medium text-gray-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-xs">
              {loadingReviewDetail ? (
                <div className="py-12 text-center text-gray-400 flex items-center justify-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-emerald-400" />
                  <span>Loading review details...</span>
                </div>
              ) : reviewDetailError ? (
                <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-red-400">
                  {reviewDetailError}
                </div>
              ) : reviewDetail ? (
                <>
                  {/* User Profile Info */}
                  <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-800/40 border border-white/5">
                    <div>
                      <span className="text-gray-400">Wallet Address:</span>
                      <div className="flex items-center gap-1 font-mono font-bold text-white mt-0.5">
                        <span>{reviewDetail.slot.user.wallet?.address || "No Wallet"}</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-400">Linked X (Twitter):</span>
                      <div className="text-white font-medium mt-0.5">
                        {reviewDetail.slot.user.xIdentity ? (
                          <span className="text-blue-400">
                            @{reviewDetail.slot.user.xIdentity.username} (
                            {reviewDetail.slot.user.xIdentity.name || "N/A"})
                          </span>
                        ) : (
                          <span className="text-gray-500">Not linked</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 1. Trait Categories Checklist */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">1. Trait Inventory Checklist</span>
                      <Badge
                        variant={
                          reviewDetail.traits.hasAllCategories ? "success" : "default"
                        }
                        className="text-[10px]"
                      >
                        {reviewDetail.traits.heldCategoriesCount}/5 Categories Owned
                      </Badge>
                    </div>
                    <div className="grid grid-cols-5 gap-2 text-center">
                      {(["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"] as const).map(
                        (cat) => {
                          const isHeld = reviewDetail.traits.heldCategories.includes(cat);
                          return (
                            <div
                              key={cat}
                              className={`p-2 rounded border text-xs font-mono font-medium ${
                                isHeld
                                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                                  : "border-white/5 bg-slate-800/30 text-gray-500"
                              }`}
                            >
                              <div>{cat}</div>
                              <div className="text-[10px] mt-1 font-sans">
                                {isHeld ? "Held" : "Missing"}
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>

                  {/* 2. Campaign Tasks Evidence */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">2. Campaign Evidence Submissions</span>
                      <span className="text-gray-400">
                        {reviewDetail.campaigns.completedMandatoryTasksCount} /{" "}
                        {reviewDetail.campaigns.totalMandatoryTasksCount} Tasks Completed
                      </span>
                    </div>
                    {reviewDetail.campaigns.submissions.length === 0 ? (
                      <div className="p-3 rounded bg-slate-800/30 text-gray-400 text-center">
                        No evidence submissions recorded for this user.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {reviewDetail.campaigns.submissions.map((sub) => (
                          <div
                            key={sub.id}
                            className="p-3 rounded bg-slate-800/40 border border-white/5 space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-white">{sub.taskTitle}</span>
                              <Badge
                                variant={sub.status === "APPROVED" ? "success" : "outline"}
                                className={`text-[10px] ${
                                  sub.status === "REJECTED"
                                    ? "text-red-400 border-red-500/30 bg-red-500/10"
                                    : sub.status === "PENDING_REVIEW"
                                    ? "text-amber-400 border-amber-500/30"
                                    : ""
                                }`}
                              >
                                {sub.status}
                              </Badge>
                            </div>
                            <div className="text-gray-400 truncate">
                              Proof: <span className="text-gray-300">{sub.payload}</span>
                            </div>
                            {sub.reviewerNotes && (
                              <div className="text-[11px] text-gray-400">
                                Note: {sub.reviewerNotes}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 3. Status Transition & Notes */}
                  <div className="space-y-3 pt-2 border-t border-white/10">
                    <span className="font-semibold text-white">3. Review Decision</span>
                    <div className="grid grid-cols-4 gap-2">
                      {(
                        [
                          { key: "NOT_REVIEWED", label: "Not Reviewed" },
                          { key: "UNDER_REVIEW", label: "Under Review" },
                          { key: "VALID", label: "Valid" },
                          { key: "FLAGGED", label: "Flagged" },
                        ] as const
                      ).map((s) => (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => setEditReviewStatus(s.key)}
                          className={`py-2 px-3 rounded text-xs font-medium border text-center transition-colors ${
                            editReviewStatus === s.key
                              ? s.key === "VALID"
                                ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                                : s.key === "FLAGGED"
                                ? "border-amber-500 bg-amber-500/20 text-amber-300"
                                : "border-blue-500 bg-blue-500/20 text-blue-300"
                              : "border-white/10 bg-slate-800/40 text-gray-400 hover:text-white"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-1">
                      <label className="text-gray-300 font-medium">Internal Review Notes</label>
                      <textarea
                        rows={3}
                        maxLength={2048}
                        value={editReviewNotes}
                        onChange={(e) => setEditReviewNotes(e.target.value)}
                        placeholder="Internal notes regarding audit findings, Sybil risk, or evidence validation..."
                        className="w-full rounded bg-slate-800 border border-white/10 p-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>

                    {saveReviewSuccess && (
                      <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
                        {saveReviewSuccess}
                      </div>
                    )}
                    {saveReviewError && (
                      <div className="p-2 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                        {saveReviewError}
                      </div>
                    )}
                  </div>

                  {/* 4. Slot Audit History */}
                  <div className="space-y-2 pt-2 border-t border-white/10">
                    <span className="font-semibold text-white">4. Review Audit History</span>
                    {reviewDetail.auditHistory.length === 0 ? (
                      <div className="text-gray-500 text-[11px]">
                        No prior audit log updates for this slot.
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-36 overflow-y-auto">
                        {reviewDetail.auditHistory.map((log) => (
                          <div
                            key={log.id}
                            className="flex items-center justify-between p-2 rounded bg-slate-950/40 border border-white/5 text-[11px]"
                          >
                            <span className="font-mono text-gray-300">{log.action}</span>
                            <span className="text-gray-500">
                              {new Date(log.createdAt).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-slate-950/60">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!reviewDetail) return;
                  openRevokeModal({
                    slotId: reviewDetail.slot.id,
                    slotNumber: reviewDetail.slot.slotNumber,
                    walletAddress: reviewDetail.slot.user.wallet?.address,
                    username: reviewDetail.slot.user.xIdentity?.username,
                  });
                }}
                className="text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
              >
                Revoke Slot
              </Button>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={closeReviewModal} className="text-xs">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={savingReview}
                  onClick={handleSaveReview}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
                >
                  {savingReview ? "Saving..." : "Save Review"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL 2: MANUAL GTD GRANT MODAL (Task 6.4)                            */}
      {/* --------------------------------------------------------------------- */}
      {grantCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg rounded-xl border border-white/15 bg-slate-900 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-semibold text-white">
                  Manually Grant GTD Slot
                </h3>
              </div>
              <button
                type="button"
                onClick={closeGrantModal}
                className="text-xs font-medium text-gray-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded bg-slate-800/50 border border-white/5 space-y-1">
                <div className="text-gray-400">Candidate Wallet:</div>
                <div className="font-mono font-bold text-white">
                  {grantCandidate.user.walletAddress}
                </div>
                {grantCandidate.user.xIdentity?.username && (
                  <div className="text-blue-400">
                    @{grantCandidate.user.xIdentity.username}
                  </div>
                )}
              </div>

              {/* 5 Criteria confirmation checklist */}
              <div className="space-y-1.5 p-3 rounded bg-emerald-500/5 border border-emerald-500/20 text-emerald-300">
                <div className="font-semibold text-emerald-400">
                  Verification Checklist Confirmed:
                </div>
                <div className="space-y-1 text-[11px]">
                  <div>EVM Wallet Connected</div>
                  <div>X (Twitter) Account Linked</div>
                  <div>All 5 Trait Categories Collected</div>
                  <div>Campaign Tasks Completed</div>
                  <div>Clean Account Standing (Not Banned)</div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-gray-300 font-medium">Grant Notes (Optional)</label>
                <input
                  type="text"
                  value={grantNotes}
                  onChange={(e) => setGrantNotes(e.target.value)}
                  placeholder="Reason for manual allocation (e.g. community reward or contest winner)..."
                  className="w-full rounded bg-slate-800 border border-white/10 px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {grantSuccess && (
                <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
                  {grantSuccess}
                </div>
              )}
              {grantError && (
                <div className="p-2.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                  {grantError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
              <Button variant="ghost" size="sm" onClick={closeGrantModal} className="text-xs">
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={granting}
                onClick={handleConfirmGrant}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
              >
                {granting ? "Granting..." : "Confirm Grant GTD"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL 3: GUARDED REVOCATION MODAL (Task 6.5)                          */}
      {/* --------------------------------------------------------------------- */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg rounded-xl border border-red-500/30 bg-slate-900 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="text-red-400">
                <h3 className="text-base font-semibold text-white">
                  Revoke Guaranteed Slot #{revokeTarget.slotNumber}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeRevokeModal}
                className="text-xs font-medium text-gray-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-red-200 space-y-1">
                <div className="font-semibold text-red-400">Permanent Revocation Warning:</div>
                <p className="text-[11px] leading-relaxed">
                  This action will permanently revoke this GTD slot. The slot will be left
                  vacant, decremented from active capacity, and excluded from the OpenSea GTD
                  export. You may subsequently grant the vacant slot to an eligible FCFS
                  candidate.
                </p>
              </div>

              <div className="p-3 rounded bg-slate-800/50 border border-white/5 space-y-1">
                <div className="text-gray-400">Target User:</div>
                <div className="font-mono text-white">
                  {revokeTarget.walletAddress || "Unknown Address"}
                </div>
                {revokeTarget.username && (
                  <div className="text-blue-400">@{revokeTarget.username}</div>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-gray-300 font-medium">
                    Reason for Revocation *
                  </label>
                  <span
                    className={`text-[10px] ${
                      revokeReason.trim().length >= 5 ? "text-emerald-400" : "text-gray-500"
                    }`}
                  >
                    ({revokeReason.trim().length} / 5 min chars)
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="Official reason for revocation (e.g. Account flagged for sybil cluster #12; failed evidence verification)..."
                  className="w-full rounded bg-slate-800 border border-white/10 p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>

              {revokeSuccess && (
                <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
                  {revokeSuccess}
                </div>
              )}
              {revokeError && (
                <div className="p-2.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                  {revokeError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
              <Button variant="ghost" size="sm" onClick={closeRevokeModal} className="text-xs">
                Cancel
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={revoking || revokeReason.trim().length < 5}
                onClick={handleConfirmRevoke}
                className="text-xs text-white bg-red-600 hover:bg-red-500 border-red-500 disabled:opacity-50"
              >
                {revoking ? "Revoking..." : "Confirm Revocation"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
