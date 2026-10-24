"use client";

import React, { useEffect, useState } from "react";
import {
  Flame,
  AlertTriangle,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Package,
  Layers,
  Lock,
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
  fetchCurrentDrop,
  emergencyCloseDropWindow,
  type CurrentDropResponse,
} from "@/lib/drops/client";

export function AdminDrops() {
  const [dropData, setDropData] = useState<CurrentDropResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Emergency close state
  const [emergencyReason, setEmergencyReason] = useState("");
  const [closing, setClosing] = useState(false);
  const [emergencyResult, setEmergencyResult] = useState<any>(null);
  const [emergencyError, setEmergencyError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    fetchCurrentDrop()
      .then((data) => {
        if (isMounted) {
          setDropData(data);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError((err as Error).message || "Failed to load drop data.");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  const handleEmergencyClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dropData?.period?.id) {
      setEmergencyError("No active drop period to close.");
      return;
    }
    if (!emergencyReason.trim() || emergencyReason.trim().length < 5) {
      setEmergencyError("Emergency reason must be at least 5 characters.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to EMERGENCY CLOSE Drop Period #${dropData.period.periodIndex}? This action cannot be undone.`,
    );
    if (!confirmed) return;

    setClosing(true);
    setEmergencyError(null);
    setEmergencyResult(null);
    try {
      const res = await emergencyCloseDropWindow(
        dropData.period.id,
        dropData.drop?.id,
        emergencyReason.trim(),
      );
      setEmergencyResult(res);
      setEmergencyReason("");
      setReloadKey((k) => k + 1);
    } catch (err: unknown) {
      setEmergencyError((err as Error).message || "Emergency close failed.");
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Drop Operations
            </h1>
            <Badge variant={dropData?.active ? "success" : "warning"}>
              {dropData?.active ? "Live Period" : "Closed"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-gray-400">
            Monitor active trait drop windows, inventory stock allocations, and trigger
            emergency close protocols.
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

      {/* Notifications */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Active Drop Status & Pool Monitor */}
      <Card className="border-gray-800 bg-[#0c0e17]/90">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-400" />
              <CardTitle className="text-base text-white">
                Active Drop Window & Stock Monitor
              </CardTitle>
            </div>
            {dropData?.period && (
              <Badge variant="outline">
                Period #{dropData.period.periodIndex} ({dropData.period.status})
              </Badge>
            )}
          </div>
          <CardDescription className="text-xs text-gray-400">
            Real-time status of current trait allocation period, inventory pools, and
            claim window countdown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-xs text-gray-400">
              <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-emerald-400" />
              Loading current drop status...
            </div>
          ) : !dropData?.drop ? (
            <div className="rounded-lg border border-gray-800/80 bg-gray-900/30 p-8 text-center text-xs text-gray-500">
              No active drop configured in system at this time.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Drop Metadata Bar */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
                  <span className="block text-[11px] text-gray-400">Drop Title</span>
                  <span className="text-sm font-semibold text-white">
                    {dropData.drop.title}
                  </span>
                  <span className="block font-mono text-[10px] text-gray-500">
                    {dropData.drop.slug}
                  </span>
                </div>

                <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
                  <span className="block text-[11px] text-gray-400">Claim Window</span>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        dropData.claimWindow?.isActive
                          ? "animate-pulse bg-emerald-400"
                          : "bg-gray-500"
                      }`}
                    />
                    <span className="text-sm font-semibold text-white">
                      {dropData.claimWindow?.isActive ? "Active (Open)" : "Closed"}
                    </span>
                  </div>
                  {dropData.claimWindow && (
                    <span className="block text-[10px] text-gray-400">
                      {Math.max(
                        0,
                        Math.round((dropData.claimWindow.timeRemainingMs ?? 0) / 60000),
                      )}{" "}
                      min remaining
                    </span>
                  )}
                </div>

                <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
                  <span className="block text-[11px] text-gray-400">Total Remaining</span>
                  <span className="text-sm font-semibold text-emerald-400">
                    {dropData.stock?.totalRemaining ?? 0} /{" "}
                    {dropData.stock?.totalAllocated ?? 0}
                  </span>
                  <span className="block text-[10px] text-gray-400">
                    {dropData.stock?.isExhausted ? "Stock Exhausted" : "Available"}
                  </span>
                </div>

                <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
                  <span className="block text-[11px] text-gray-400">Stock Lock</span>
                  <span className="text-sm font-semibold text-white">
                    {dropData.period?.isStockLocked ? "Locked" : "Unlocked"}
                  </span>
                  <span className="block text-[10px] text-gray-400">
                    Period: {dropData.period?.status ?? "N/A"}
                  </span>
                </div>
              </div>

              {/* Pool Items Table */}
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-300">
                  <Package className="h-3.5 w-3.5 text-emerald-400" />
                  Drop Pool Trait Allocations
                </h3>
                {dropData.stock?.poolItems && dropData.stock.poolItems.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-gray-800">
                    <table className="w-full text-left text-xs text-gray-300">
                      <thead className="border-b border-gray-800 bg-gray-900/60 text-[11px] text-gray-400">
                        <tr>
                          <th className="px-3 py-2">Trait Name</th>
                          <th className="px-3 py-2">Category</th>
                          <th className="px-3 py-2">Rarity</th>
                          <th className="px-3 py-2">Remaining Stock</th>
                          <th className="px-3 py-2">Weight</th>
                          <th className="px-3 py-2">Probability</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/60">
                        {dropData.stock.poolItems.map((item) => (
                          <tr key={item.poolItemId} className="hover:bg-gray-900/30">
                            <td className="px-3 py-2 font-medium text-white">
                              {item.traitName}
                            </td>
                            <td className="px-3 py-2 text-gray-400">{item.category}</td>
                            <td className="px-3 py-2">
                              <Badge variant="outline" className="text-[10px]">
                                {item.rarity}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 font-mono text-emerald-400">
                              {item.remainingStock}
                            </td>
                            <td className="px-3 py-2 font-mono text-gray-400">
                              {item.weight}
                            </td>
                            <td className="px-3 py-2 font-mono text-gray-300">
                              {item.probabilityPercent.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded border border-gray-800/80 bg-gray-900/30 p-4 text-center text-xs text-gray-500">
                    No pool items configured for this drop.
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Emergency Close Controls */}
      <Card className="border-rose-500/30 bg-[#0c0e17]/90">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-400" />
            <CardTitle className="text-base text-white">
              Emergency Close Drop Window
            </CardTitle>
          </div>
          <CardDescription className="text-xs text-rose-300/80">
            Critical administrative override: instantly terminates the active claim
            window, locks remaining inventory, and records an audit incident.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleEmergencyClose} className="space-y-4">
            <div>
              <label
                htmlFor="em-reason"
                className="mb-1 block text-xs font-medium text-gray-400"
              >
                Emergency Incident Reason * (min 5 characters)
              </label>
              <input
                id="em-reason"
                type="text"
                placeholder="e.g. Critical exploit detected in contract or bot attack identified"
                value={emergencyReason}
                onChange={(e) => setEmergencyReason(e.target.value)}
                disabled={closing || !dropData?.period}
                required
                className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-rose-500 focus:outline-none"
              />
            </div>

            {emergencyError && (
              <div className="flex items-center gap-2 rounded border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{emergencyError}</span>
              </div>
            )}

            {emergencyResult && (
              <div className="space-y-1 rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Drop Period Closed Successfully</span>
                </div>
                <p className="text-[11px] text-emerald-200">
                  Closed Period:{" "}
                  {emergencyResult.periodId ?? emergencyResult.period?.id ?? "Terminated"}{" "}
                  (Audit Log: {emergencyResult.auditLogId})
                </p>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-gray-500">
                Target Period ID: {dropData?.period?.id ?? "None active"}
              </span>
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                className="gap-2 text-xs text-rose-300 transition-colors hover:bg-rose-600 hover:text-white"
                disabled={closing || !dropData?.period}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {closing ? "Closing Window..." : "Execute Emergency Close"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Backend Notice */}
      <PlaceholderNotice
        title="Drop Creation, Batch Scheduling & Pool Configuration"
        description="Endpoints for creating new drop seasons, configuring weighted drop rates, or scheduling recurring calendar windows are not yet available in current backend. Active drop monitoring and emergency killswitch are operational above."
        phase="Upcoming Feature"
      />
    </div>
  );
}
