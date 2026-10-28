"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Eye,
  X,
  UserCheck,
  UserX,
  Clock,
  FileText,
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
import {
  adminListAbuseFlags,
  adminUpdateAbuseFlag,
  type AdminListAbuseFlagsInput,
} from "@/lib/admin/client";
import { shortenAddress } from "@/lib/auth/address";

export interface AdminAbuseFlagRecord {
  id: string;
  userId: string;
  flagType:
    | "SYBIL_WALLET_CLUSTER"
    | "BOT_ACTIVITY"
    | "X_ACCOUNT_MISMATCH"
    | "RAPID_CLAIM_ATTEMPT"
    | "SUSPICIOUS_GIFT_LOOP"
    | "OTHER"
    | string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | string;
  status: "OPEN" | "UNDER_REVIEW" | "DISMISSED" | "CONFIRMED_ACTION_TAKEN" | string;
  details?: Record<string, unknown> | null;
  reviewedById?: string | null;
  reviewedAt?: string | null;
  resolutionNotes?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    isBanned: boolean;
    role: string;
    wallet?: { address: string } | null;
    xIdentity?: { username: string } | null;
  } | null;
  reviewedBy?: {
    id: string;
    role: string;
    wallet?: { address: string } | null;
  } | null;
}

export function AdminAbuseFlags() {
  const [flags, setFlags] = useState<AdminAbuseFlagRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Filters & Pagination State
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [flagTypeFilter, setFlagTypeFilter] = useState<string>("ALL");
  const [userQuery, setUserQuery] = useState<string>("");
  const [appliedUserQuery, setAppliedUserQuery] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const pageSize = 10;
  const [reloadKey, setReloadKey] = useState<number>(0);

  // Review / Inspection Modal State
  const [selectedFlag, setSelectedFlag] = useState<AdminAbuseFlagRecord | null>(null);
  const [inspectModalOpen, setInspectModalOpen] = useState<boolean>(false);
  const [updateStatus, setUpdateStatus] = useState<string>("OPEN");
  const [updateNotes, setUpdateNotes] = useState<string>("");
  const [updating, setUpdating] = useState<boolean>(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const fetchFlags = useCallback(() => {
    setLoading(true);
    const input: AdminListAbuseFlagsInput = {
      limit: pageSize,
      offset: (page - 1) * pageSize,
    };

    if (statusFilter !== "ALL") input.status = statusFilter;
    if (severityFilter !== "ALL") input.severity = severityFilter;
    if (flagTypeFilter !== "ALL") input.flagType = flagTypeFilter;
    if (appliedUserQuery.trim()) input.userId = appliedUserQuery.trim();

    adminListAbuseFlags(input)
      .then((res) => {
        setFlags(res.flags || []);
        setTotalCount(res.total ?? (res.flags ? res.flags.length : 0));
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        setError((err as Error).message || "Failed to load abuse flags.");
        setLoading(false);
      });
  }, [page, statusFilter, severityFilter, flagTypeFilter, appliedUserQuery, pageSize]);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags, reloadKey]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setAppliedUserQuery(userQuery);
  };

  const handleClearFilters = () => {
    setStatusFilter("ALL");
    setSeverityFilter("ALL");
    setFlagTypeFilter("ALL");
    setUserQuery("");
    setAppliedUserQuery("");
    setPage(1);
  };

  const handleOpenInspect = (flag: AdminAbuseFlagRecord) => {
    setSelectedFlag(flag);
    setUpdateStatus(flag.status);
    setUpdateNotes(flag.resolutionNotes || "");
    setUpdateError(null);
    setInspectModalOpen(true);
  };

  const handleCloseInspect = () => {
    setSelectedFlag(null);
    setInspectModalOpen(false);
    setUpdateError(null);
  };

  const handleUpdateStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFlag) return;

    setUpdating(true);
    setUpdateError(null);

    try {
      const res = await adminUpdateAbuseFlag({
        flagId: selectedFlag.id,
        status: updateStatus,
        resolutionNotes: updateNotes.trim() ? updateNotes.trim() : null,
      });

      setActionSuccess(
        `Abuse flag ${selectedFlag.id} status updated to ${updateStatus}.`,
      );
      setInspectModalOpen(false);
      setSelectedFlag(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setUpdateError((err as Error).message || "Failed to update abuse flag status.");
    } finally {
      setUpdating(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Severity color formatting
  const renderSeverityBadge = (severity: string) => {
    switch (severity?.toUpperCase()) {
      case "CRITICAL":
        return (
          <span className="inline-flex items-center rounded-full border border-rose-500/30 bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-300">
            CRITICAL
          </span>
        );
      case "HIGH":
        return (
          <span className="inline-flex items-center rounded-full border border-orange-500/30 bg-orange-500/15 px-2 py-0.5 text-[11px] font-semibold text-orange-300">
            HIGH
          </span>
        );
      case "MEDIUM":
        return (
          <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
            MEDIUM
          </span>
        );
      case "LOW":
      default:
        return (
          <span className="inline-flex items-center rounded-full border border-gray-600/40 bg-gray-800/40 px-2 py-0.5 text-[11px] font-semibold text-gray-300">
            LOW
          </span>
        );
    }
  };

  // Status color formatting
  const renderStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case "OPEN":
        return (
          <span className="inline-flex items-center rounded-full border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-300">
            OPEN
          </span>
        );
      case "UNDER_REVIEW":
        return (
          <span className="inline-flex items-center rounded-full border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-[11px] font-semibold text-purple-300">
            UNDER REVIEW
          </span>
        );
      case "CONFIRMED_ACTION_TAKEN":
        return (
          <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
            CONFIRMED
          </span>
        );
      case "DISMISSED":
      default:
        return (
          <span className="inline-flex items-center rounded-full border border-gray-600/40 bg-gray-800/40 px-2 py-0.5 text-[11px] font-semibold text-gray-400">
            DISMISSED
          </span>
        );
    }
  };

  const formatFlagType = (type: string) => {
    switch (type) {
      case "SYBIL_WALLET_CLUSTER":
        return "Sybil Wallet Cluster";
      case "BOT_ACTIVITY":
        return "Bot Activity";
      case "X_ACCOUNT_MISMATCH":
        return "X Account Mismatch";
      case "RAPID_CLAIM_ATTEMPT":
        return "Rapid Claim Attempt";
      case "SUSPICIOUS_GIFT_LOOP":
        return "Suspicious Gift Loop";
      default:
        return type || "Other";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-emerald-400" />
            <h1 className="text-xl font-bold tracking-tight text-white">
              Abuse Flags & Sybil Signals
            </h1>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Investigate automated sybil signals, cluster detections, and suspicious
            activities. Update investigation status and record resolution rationale.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setReloadKey((k) => k + 1);
          }}
          disabled={loading}
          className="gap-1.5 self-start text-xs sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Action Success Alert */}
      {actionSuccess && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-emerald-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Global Error Alert */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filters and Controls Card */}
      <Card className="border-gray-800 bg-[#0c0e17]/90">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-emerald-400" />
            <CardTitle className="text-sm font-semibold text-white">
              Filters & Search
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Status Filter */}
            <div>
              <label
                htmlFor="filter-status"
                className="mb-1 block text-xs font-medium text-gray-400"
              >
                Status
              </label>
              <select
                id="filter-status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">OPEN</option>
                <option value="UNDER_REVIEW">UNDER_REVIEW</option>
                <option value="CONFIRMED_ACTION_TAKEN">CONFIRMED_ACTION_TAKEN</option>
                <option value="DISMISSED">DISMISSED</option>
              </select>
            </div>

            {/* Severity Filter */}
            <div>
              <label
                htmlFor="filter-severity"
                className="mb-1 block text-xs font-medium text-gray-400"
              >
                Severity
              </label>
              <select
                id="filter-severity"
                value={severityFilter}
                onChange={(e) => {
                  setSeverityFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </div>

            {/* Flag Type Filter */}
            <div>
              <label
                htmlFor="filter-type"
                className="mb-1 block text-xs font-medium text-gray-400"
              >
                Signal Type
              </label>
              <select
                id="filter-type"
                value={flagTypeFilter}
                onChange={(e) => {
                  setFlagTypeFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="ALL">All Signal Types</option>
                <option value="SYBIL_WALLET_CLUSTER">Sybil Wallet Cluster</option>
                <option value="BOT_ACTIVITY">Bot Activity</option>
                <option value="X_ACCOUNT_MISMATCH">X Account Mismatch</option>
                <option value="RAPID_CLAIM_ATTEMPT">Rapid Claim Attempt</option>
                <option value="SUSPICIOUS_GIFT_LOOP">Suspicious Gift Loop</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            {/* User ID Search */}
            <div>
              <label
                htmlFor="filter-user-id"
                className="mb-1 block text-xs font-medium text-gray-400"
              >
                User ID Filter
              </label>
              <form onSubmit={handleSearchSubmit} className="flex gap-1.5">
                <input
                  id="filter-user-id"
                  type="text"
                  placeholder="Filter by User CUID..."
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                />
                <Button type="submit" variant="primary" size="sm" className="px-2.5 text-xs">
                  <Search className="h-3.5 w-3.5" />
                </Button>
              </form>
            </div>
          </div>

          {(statusFilter !== "ALL" ||
            severityFilter !== "ALL" ||
            flagTypeFilter !== "ALL" ||
            appliedUserQuery) && (
            <div className="flex items-center justify-between border-t border-gray-800/60 pt-2 text-xs">
              <span className="text-gray-400">
                Filtered view active ({totalCount} matching flags)
              </span>
              <button
                type="button"
                onClick={handleClearFilters}
                className="font-medium text-emerald-400 hover:underline"
              >
                Reset All Filters
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Flags List Table Card */}
      <Card className="border-gray-800 bg-[#0c0e17]/90">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base text-white">Investigation Records</CardTitle>
            <CardDescription className="text-xs text-gray-400">
              Total {totalCount} flag{totalCount === 1 ? "" : "s"} logged in database
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
              <RefreshCw className="mb-2 h-6 w-6 animate-spin text-emerald-400" />
              <p className="text-xs">Loading abuse flags...</p>
            </div>
          ) : flags.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-800 py-12 text-center">
              <ShieldAlert className="mb-3 h-10 w-10 text-gray-600" />
              <p className="text-sm font-semibold text-gray-300">
                No abuse flags found
              </p>
              <p className="mt-1 max-w-sm text-xs text-gray-500">
                No abuse flags matched your current status, severity, or filter criteria.
              </p>
              {(statusFilter !== "ALL" ||
                severityFilter !== "ALL" ||
                flagTypeFilter !== "ALL" ||
                appliedUserQuery) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearFilters}
                  className="mt-4 text-xs"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-lg border border-gray-800">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-gray-800 bg-gray-900/50 text-[11px] font-semibold text-gray-400 uppercase">
                    <tr>
                      <th className="px-4 py-3">Flag & Time</th>
                      <th className="px-4 py-3">User & Account</th>
                      <th className="px-4 py-3">Signal Type</th>
                      <th className="px-4 py-3">Severity</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50 text-gray-300">
                    {flags.map((flag) => {
                      const formattedDate = flag.createdAt
                        ? new Date(flag.createdAt).toLocaleString()
                        : "-";
                      const address = flag.user?.wallet?.address;
                      const shortAddr = address ? shortenAddress(address) : "No Wallet";
                      const xUsername = flag.user?.xIdentity?.username;

                      return (
                        <tr
                          key={flag.id}
                          className="transition-colors hover:bg-gray-800/30"
                        >
                          <td className="px-4 py-3">
                            <div className="font-mono text-[11px] text-white">
                              {flag.id}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500">
                              <Clock className="h-3 w-3" />
                              <span>{formattedDate}</span>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-white">
                                {shortAddr}
                              </span>
                              {flag.user?.isBanned && (
                                <span className="rounded bg-rose-500/20 px-1 py-0.2 text-[9px] font-bold text-rose-300">
                                  BANNED
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 text-[11px] text-gray-400">
                              {xUsername ? `@${xUsername}` : `ID: ${flag.userId.slice(0, 10)}...`}
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <span className="font-medium text-gray-200">
                              {formatFlagType(flag.flagType)}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            {renderSeverityBadge(flag.severity)}
                          </td>

                          <td className="px-4 py-3">
                            {renderStatusBadge(flag.status)}
                          </td>

                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenInspect(flag)}
                              className="gap-1 px-2.5 py-1 text-xs hover:border-emerald-500/40 hover:text-emerald-300"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>Review</span>
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-800 pt-3 text-xs sm:flex-row">
                  <span className="text-gray-400">
                    Showing {(page - 1) * pageSize + 1} to{" "}
                    {Math.min(page * pageSize, totalCount)} of {totalCount} records
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="gap-1 text-xs"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" /> Previous
                    </Button>
                    <span className="px-2 text-gray-400">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="gap-1 text-xs"
                    >
                      Next <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review & Update Modal */}
      {inspectModalOpen && selectedFlag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={handleCloseInspect}
          />
          <div className="relative w-full max-w-xl rounded-xl border border-gray-800 bg-[#0c0e17] p-6 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">
                  Investigate Abuse Flag
                </h3>
              </div>
              <button
                onClick={handleCloseInspect}
                className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="mt-4 max-h-[70vh] space-y-4 overflow-y-auto pr-1 text-xs">
              {updateError && (
                <div className="flex items-center gap-2 rounded border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{updateError}</span>
                </div>
              )}

              {/* Target Account Summary */}
              <div className="rounded-lg border border-gray-800/80 bg-gray-900/40 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-300">Target Account</span>
                  {selectedFlag.user?.isBanned ? (
                    <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
                      ACCOUNT BANNED
                    </span>
                  ) : (
                    <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                      ACTIVE USER
                    </span>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-gray-400">
                  <div>
                    <span className="text-gray-500">Wallet:</span>{" "}
                    <span className="font-mono text-gray-200">
                      {selectedFlag.user?.wallet?.address || "None"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">X Handle:</span>{" "}
                    <span className="text-gray-200">
                      {selectedFlag.user?.xIdentity?.username
                        ? `@${selectedFlag.user.xIdentity.username}`
                        : "Unlinked"}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500">User ID:</span>{" "}
                    <span className="font-mono text-gray-300">{selectedFlag.userId}</span>
                  </div>
                </div>
              </div>

              {/* Signal Details */}
              <div className="rounded-lg border border-gray-800/80 bg-gray-900/40 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-300">Signal Information</span>
                  <div className="flex items-center gap-1.5">
                    {renderSeverityBadge(selectedFlag.severity)}
                    {renderStatusBadge(selectedFlag.status)}
                  </div>
                </div>
                <div className="mt-2 space-y-1 text-[11px] text-gray-400">
                  <div>
                    <span className="text-gray-500">Flag Type:</span>{" "}
                    <span className="font-medium text-gray-200">
                      {formatFlagType(selectedFlag.flagType)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Flag ID:</span>{" "}
                    <span className="font-mono text-gray-300">{selectedFlag.id}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Detected At:</span>{" "}
                    <span className="text-gray-300">
                      {selectedFlag.createdAt
                        ? new Date(selectedFlag.createdAt).toLocaleString()
                        : "-"}
                    </span>
                  </div>
                </div>

                {/* Raw Telemetry Details */}
                {selectedFlag.details && (
                  <div className="mt-3">
                    <div className="mb-1 text-[10px] font-semibold text-gray-400 uppercase">
                      Detection Telemetry / Details:
                    </div>
                    <pre className="max-h-36 overflow-x-auto rounded border border-gray-800 bg-gray-950 p-2.5 font-mono text-[11px] text-emerald-400">
                      {JSON.stringify(selectedFlag.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Prior Review Notes if present */}
              {selectedFlag.reviewedAt && (
                <div className="rounded-lg border border-gray-800/80 bg-gray-900/40 p-3 text-[11px]">
                  <div className="flex items-center gap-1.5 font-semibold text-gray-300">
                    <FileText className="h-3.5 w-3.5 text-indigo-400" />
                    <span>Previous Review History</span>
                  </div>
                  <p className="mt-1 text-gray-400">
                    Reviewed on {new Date(selectedFlag.reviewedAt).toLocaleString()}
                    {selectedFlag.reviewedBy?.role ? ` by ${selectedFlag.reviewedBy.role}` : ""}.
                  </p>
                  {selectedFlag.resolutionNotes && (
                    <blockquote className="mt-2 rounded border-l-2 border-indigo-500/50 bg-gray-950/60 p-2 italic text-gray-300">
                      &quot;{selectedFlag.resolutionNotes}&quot;
                    </blockquote>
                  )}
                </div>
              )}

              {/* Status Update Form */}
              <form onSubmit={handleUpdateStatusSubmit} className="space-y-3 pt-2">
                <div>
                  <label
                    htmlFor="update-status-select"
                    className="mb-1 block font-medium text-gray-300"
                  >
                    Investigation Status *
                  </label>
                  <select
                    id="update-status-select"
                    value={updateStatus}
                    onChange={(e) => setUpdateStatus(e.target.value)}
                    className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="OPEN">OPEN (Pending investigation)</option>
                    <option value="UNDER_REVIEW">UNDER_REVIEW (Investigation in progress)</option>
                    <option value="CONFIRMED_ACTION_TAKEN">
                      CONFIRMED_ACTION_TAKEN (Abuse confirmed)
                    </option>
                    <option value="DISMISSED">DISMISSED (False positive / benign)</option>
                  </select>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label
                      htmlFor="update-notes-input"
                      className="font-medium text-gray-300"
                    >
                      Resolution Notes
                    </label>
                    <span className="text-[10px] text-gray-500">
                      {updateNotes.length} / 2048
                    </span>
                  </div>
                  <textarea
                    id="update-notes-input"
                    rows={3}
                    placeholder="Document investigation findings, IP cluster context, or reason for dismissal..."
                    value={updateNotes}
                    maxLength={2048}
                    onChange={(e) => setUpdateNotes(e.target.value)}
                    className="w-full rounded-md border border-gray-700 bg-gray-900 p-2.5 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-gray-800 pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCloseInspect}
                    disabled={updating}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={updating}
                    className="text-xs"
                  >
                    {updating ? "Saving Changes..." : "Save Resolution"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
