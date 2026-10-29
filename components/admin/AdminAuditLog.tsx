"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ScrollText,
  Search,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  ShieldAlert,
  Calendar,
  Filter,
  User,
  Layers,
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
  adminListAuditLogs,
  type AdminAuditLogRecord,
} from "@/lib/admin/client";
import { isValidAddress, shortenAddress } from "@/lib/auth/address";

function formatSafeJson(val: unknown): string {
  if (val === null || val === undefined) return "None";
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return isoString;
  }
}

export function AdminAuditLog() {
  const [logs, setLogs] = useState<AdminAuditLogRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState<boolean>(false);

  // Pagination
  const [limit, setLimit] = useState<number>(25);
  const [offset, setOffset] = useState<number>(0);

  // Filters
  const [actionInput, setActionInput] = useState<string>("");
  const [entityTypeInput, setEntityTypeInput] = useState<string>("");
  const [actorIdInput, setActorIdInput] = useState<string>("");
  const [fromInput, setFromInput] = useState<string>("");
  const [toInput, setToInput] = useState<string>("");

  // Applied filter state
  const [appliedFilters, setAppliedFilters] = useState<{
    action?: string;
    entityType?: string;
    actorId?: string;
    from?: string;
    to?: string;
  }>({});

  // Detail Modal
  const [selectedLog, setSelectedLog] = useState<AdminAuditLogRecord | null>(null);

  const fetchLogs = useCallback(
    async (targetOffset: number, targetLimit: number, filters = appliedFilters) => {
      setLoading(true);
      setError(null);
      setAccessDenied(false);

      try {
        const res = await adminListAuditLogs({
          action: filters.action?.trim() || undefined,
          entityType: filters.entityType?.trim() || undefined,
          actorId: filters.actorId?.trim() || undefined,
          from: filters.from ? new Date(filters.from).toISOString() : undefined,
          to: filters.to ? new Date(filters.to).toISOString() : undefined,
          limit: targetLimit,
          offset: targetOffset,
        });

        setLogs(res.logs);
        setTotalCount(res.total);
        setOffset(res.offset);
        setLimit(res.limit);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load audit logs.";
        setError(msg);
        if (
          msg.includes("403") ||
          msg.includes("FORBIDDEN") ||
          msg.includes("Super admin") ||
          msg.includes("Insufficient role")
        ) {
          setAccessDenied(true);
        }
      } finally {
        setLoading(false);
      }
    },
    [appliedFilters],
  );

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (active) {
        await fetchLogs(offset, limit, appliedFilters);
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [fetchLogs, offset, limit, appliedFilters]);

  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    const newFilters = {
      action: actionInput.trim() || undefined,
      entityType: entityTypeInput.trim() || undefined,
      actorId: actorIdInput.trim() || undefined,
      from: fromInput || undefined,
      to: toInput || undefined,
    };
    setAppliedFilters(newFilters);
    setOffset(0);
  };

  const handleResetFilters = () => {
    setActionInput("");
    setEntityTypeInput("");
    setActorIdInput("");
    setFromInput("");
    setToInput("");
    setAppliedFilters({});
    setOffset(0);
  };

  const handlePrevPage = () => {
    if (offset > 0) {
      const nextOffset = Math.max(0, offset - limit);
      setOffset(nextOffset);
    }
  };

  const handleNextPage = () => {
    if (offset + limit < totalCount) {
      setOffset(offset + limit);
    }
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setOffset(0);
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="border-gray-800 bg-[#0c0e17]">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-emerald-400" />
              <CardTitle className="text-xl font-bold text-white">
                Audit Log
              </CardTitle>
              <Badge variant="default" className="text-[10px]">
                SUPER_ADMIN ONLY
              </Badge>
              <Badge variant="outline" className="text-[10px] text-gray-400">
                READ-ONLY
              </Badge>
            </div>
            <CardDescription className="text-xs text-gray-400">
              Immutable chronological record of sensitive operations, whitelist changes,
              and administrative actions.
            </CardDescription>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchLogs(offset, limit)}
            disabled={loading}
            className="flex items-center gap-1.5 self-start text-xs sm:self-auto"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>
      </Card>

      {/* Access Denied Banner */}
      {accessDenied && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-red-400" />
          <h3 className="mt-2 text-base font-bold text-white">Access Denied</h3>
          <p className="mt-1 text-xs text-red-200">
            Only SUPER_ADMIN accounts are authorized to read system audit logs.
          </p>
        </div>
      )}

      {/* Error Notice */}
      {!accessDenied && error && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-300">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span className="text-xs font-medium">{error}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchLogs(offset, limit)}
              className="text-xs"
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Filters Form */}
      <Card className="border-gray-800 bg-[#0c0e17]">
        <CardContent className="pt-6">
          <form onSubmit={handleApplyFilters} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {/* Action Filter */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-300">
                  Action
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={actionInput}
                    onChange={(e) => setActionInput(e.target.value)}
                    placeholder="e.g. BAN_USER"
                    className="w-full rounded-md border border-gray-800 bg-gray-900/60 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Entity Type Filter */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-300">
                  Entity Type
                </label>
                <input
                  type="text"
                  value={entityTypeInput}
                  onChange={(e) => setEntityTypeInput(e.target.value)}
                  placeholder="e.g. User, WLSlot"
                  className="w-full rounded-md border border-gray-800 bg-gray-900/60 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {/* Actor ID Filter */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-300">
                  Actor ID
                </label>
                <input
                  type="text"
                  value={actorIdInput}
                  onChange={(e) => setActorIdInput(e.target.value)}
                  placeholder="User ID..."
                  className="w-full rounded-md border border-gray-800 bg-gray-900/60 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {/* Date From */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-300">
                  From Date
                </label>
                <input
                  type="date"
                  value={fromInput}
                  onChange={(e) => setFromInput(e.target.value)}
                  className="w-full rounded-md border border-gray-800 bg-gray-900/60 px-3 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {/* Date To */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-300">
                  To Date
                </label>
                <input
                  type="date"
                  value={toInput}
                  onChange={(e) => setToInput(e.target.value)}
                  className="w-full rounded-md border border-gray-800 bg-gray-900/60 px-3 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Filter Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-800/80">
              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  size="sm"
                  className="flex items-center gap-1.5 text-xs"
                >
                  <Filter className="h-3.5 w-3.5" />
                  Apply Filters
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResetFilters}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Reset
                </Button>
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>Page size:</span>
                <select
                  value={limit}
                  onChange={(e) => handleLimitChange(Number(e.target.value))}
                  aria-label="Audit log page size"
                  className="rounded border border-gray-800 bg-gray-900 px-2 py-1 text-xs text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Logs Table Card */}
      <Card className="border-gray-800 bg-[#0c0e17]">
        <CardContent className="p-0">
          {loading && logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <RefreshCw className="h-8 w-8 animate-spin text-emerald-400" />
              <p className="mt-3 text-xs text-gray-400">Loading audit log entries...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ScrollText className="h-10 w-10 text-gray-600 mb-2" />
              <p className="text-sm font-medium text-gray-300">No audit logs found</p>
              <p className="mt-1 text-xs text-gray-500">
                Try adjusting your filter criteria or date range.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-gray-800 bg-gray-900/40 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Entity Type</th>
                    <th className="px-4 py-3">Entity ID</th>
                    <th className="px-4 py-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60 font-mono">
                  {logs.map((log) => {
                    const actorAddr = log.actor?.wallet?.address;
                    const actorDisplay = actorAddr && isValidAddress(actorAddr)
                      ? shortenAddress(actorAddr)
                      : log.actorId
                      ? log.actorId
                      : "System";

                    return (
                      <tr
                        key={log.id}
                        className="transition-colors hover:bg-gray-800/30"
                      >
                        {/* Timestamp */}
                        <td className="whitespace-nowrap px-4 py-3 text-gray-300 font-sans">
                          {formatDate(log.createdAt)}
                        </td>

                        {/* Actor */}
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-emerald-400">
                              {actorDisplay}
                            </span>
                            {log.actor?.role && (
                              <Badge
                                variant={
                                  log.actor.role === "ADMIN" ||
                                  log.actor.role === "SUPER_ADMIN"
                                    ? "warning"
                                    : "outline"
                                }
                                className="text-[9px] px-1 py-0"
                              >
                                {log.actor.role}
                              </Badge>
                            )}
                          </div>
                          {log.actorId && (
                            <div className="text-[10px] text-gray-500 truncate max-w-[120px]" title={log.actorId}>
                              ID: {log.actorId}
                            </div>
                          )}
                        </td>

                        {/* Action */}
                        <td className="whitespace-nowrap px-4 py-3 font-sans">
                          <Badge variant="default" className="text-[10px]">
                            {log.action}
                          </Badge>
                        </td>

                        {/* Entity Type */}
                        <td className="whitespace-nowrap px-4 py-3 text-gray-300 font-sans">
                          <span className="rounded bg-gray-800/80 px-1.5 py-0.5 text-[11px] text-gray-300">
                            {log.entityType}
                          </span>
                        </td>

                        {/* Entity ID */}
                        <td className="whitespace-nowrap px-4 py-3 text-gray-400">
                          <span className="truncate max-w-[140px] inline-block align-middle" title={log.entityId}>
                            {log.entityId}
                          </span>
                        </td>

                        {/* Action Details Button */}
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedLog(log)}
                            className="h-7 px-2.5 text-[11px] gap-1 font-sans"
                          >
                            <Eye className="h-3 w-3" />
                            Details
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {totalCount > 0 && (
            <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-800 px-4 py-3 sm:flex-row">
              <div className="text-xs text-gray-400">
                Showing{" "}
                <span className="font-medium text-white">
                  {totalCount === 0 ? 0 : offset + 1}
                </span>{" "}
                to{" "}
                <span className="font-medium text-white">
                  {Math.min(offset + limit, totalCount)}
                </span>{" "}
                of <span className="font-medium text-white">{totalCount}</span> entries
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevPage}
                  disabled={offset === 0 || loading}
                  className="h-8 gap-1 text-xs"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Previous
                </Button>
                <span className="text-xs text-gray-400 px-1">
                  Page {Math.floor(offset / limit) + 1} of{" "}
                  {Math.max(1, Math.ceil(totalCount / limit))}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={offset + limit >= totalCount || loading}
                  className="h-8 gap-1 text-xs"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-detail-title"
        >
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-gray-800 bg-[#0f111a] p-6 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-gray-800 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="text-xs">
                    {selectedLog.action}
                  </Badge>
                  <h3 id="audit-detail-title" className="text-lg font-bold text-white">
                    Audit Log Details
                  </h3>
                </div>
                <p className="text-xs text-gray-400">
                  Log ID: <span className="font-mono text-gray-300">{selectedLog.id}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
                aria-label="Close details modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="mt-5 space-y-5">
              {/* Metadata Grid */}
              <div className="grid grid-cols-1 gap-3 rounded-lg border border-gray-800/80 bg-gray-900/40 p-4 text-xs sm:grid-cols-2">
                <div>
                  <span className="text-gray-400">Created At:</span>{" "}
                  <span className="font-semibold text-white">
                    {formatDate(selectedLog.createdAt)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Entity Type:</span>{" "}
                  <span className="font-semibold text-emerald-400">
                    {selectedLog.entityType}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Entity ID:</span>{" "}
                  <span className="font-mono text-white break-all">
                    {selectedLog.entityId}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Actor ID:</span>{" "}
                  <span className="font-mono text-white">
                    {selectedLog.actorId || "None (System)"}
                  </span>
                </div>
                {selectedLog.actor?.wallet?.address && (
                  <div className="sm:col-span-2">
                    <span className="text-gray-400">Actor Address:</span>{" "}
                    <span className="font-mono text-emerald-300">
                      {selectedLog.actor.wallet.address}
                    </span>
                  </div>
                )}
              </div>

              {/* Old Values */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-300">
                    Old Values (Before Operation)
                  </span>
                </div>
                <pre className="max-h-56 overflow-x-auto rounded-lg border border-gray-800 bg-gray-950 p-3 font-mono text-xs text-gray-300">
                  {formatSafeJson(selectedLog.oldValues)}
                </pre>
              </div>

              {/* New Values */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-300">
                    New Values (After Operation)
                  </span>
                </div>
                <pre className="max-h-56 overflow-x-auto rounded-lg border border-gray-800 bg-gray-950 p-3 font-mono text-xs text-emerald-300">
                  {formatSafeJson(selectedLog.newValues)}
                </pre>
              </div>

              {/* Metadata */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-300">
                    Context Metadata
                  </span>
                </div>
                <pre className="max-h-56 overflow-x-auto rounded-lg border border-gray-800 bg-gray-950 p-3 font-mono text-xs text-amber-300">
                  {formatSafeJson(selectedLog.metadata)}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="mt-6 flex justify-end border-t border-gray-800 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedLog(null)}
                className="text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
