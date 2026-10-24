"use client";

import React, { useState } from "react";
import {
  Shield,
  RefreshCw,
  XCircle,
  Search,
  CheckCircle2,
  AlertCircle,
  Sliders,
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
  adminReconcileQueue,
  adminRevokeSlot,
  type AdminRevokeSlotInput,
  type AdminReconcileQueueResponse,
} from "@/lib/admin/client";
import {
  fetchWhitelistStatus,
  type WhitelistStatusResponse,
} from "@/lib/whitelist/client";

export function AdminWhitelist() {
  // Reconcile state
  const [reconcileProgramId, setReconcileProgramId] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] =
    useState<AdminReconcileQueueResponse | null>(null);
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  // Revoke slot state
  const [revokeSlotId, setRevokeSlotId] = useState("");
  const [revokeProgramId, setRevokeProgramId] = useState("");
  const [revokeUserId, setRevokeUserId] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [revokeResult, setRevokeResult] = useState<any>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // Address lookup state
  const [lookupAddress, setLookupAddress] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<WhitelistStatusResponse | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const handleReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconcileProgramId.trim()) return;
    setReconciling(true);
    setReconcileError(null);
    setReconcileResult(null);
    try {
      const res = await adminReconcileQueue({ programId: reconcileProgramId.trim() });
      setReconcileResult(res);
    } catch (err: unknown) {
      setReconcileError((err as Error).message || "Queue reconciliation failed.");
    } finally {
      setReconciling(false);
    }
  };

  const handleRevokeSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokeSlotId.trim() && (!revokeProgramId.trim() || !revokeUserId.trim())) {
      setRevokeError("Either Slot ID or both Program ID and User ID are required.");
      return;
    }
    setRevoking(true);
    setRevokeError(null);
    setRevokeResult(null);
    try {
      const input: AdminRevokeSlotInput = {
        slotId: revokeSlotId.trim() || undefined,
        programId: revokeProgramId.trim() || undefined,
        userId: revokeUserId.trim() || undefined,
        reason: revokeReason.trim() || null,
      };
      const res = await adminRevokeSlot(input);
      setRevokeResult(res);
      setRevokeSlotId("");
      setRevokeReason("");
    } catch (err: unknown) {
      setRevokeError((err as Error).message || "Slot revocation failed.");
    } finally {
      setRevoking(false);
    }
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupAddress.trim()) return;
    setLookingUp(true);
    setLookupError(null);
    setLookupResult(null);
    try {
      const res = await fetchWhitelistStatus(lookupAddress.trim());
      setLookupResult(res);
    } catch (err: unknown) {
      setLookupError((err as Error).message || "Failed to check whitelist status.");
    } finally {
      setLookingUp(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Whitelist Operations
          </h1>
          <Badge variant="default">Stage 3 WL Engine</Badge>
        </div>
        <p className="mt-1 text-sm text-gray-400">
          Execute FIFO queue reconciliation, enforce manual slot revocations, and inspect
          user qualification tiers.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Tool 1: Queue Reconciliation */}
        <Card className="border-gray-800 bg-[#0c0e17]/90">
          <CardHeader>
            <div className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-emerald-400" />
              <CardTitle className="text-base text-white">Queue Reconciliation</CardTitle>
            </div>
            <CardDescription className="text-xs text-gray-400">
              Triggers the FIFO queue reconcile engine for a program to fill vacated slot
              capacities.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleReconcile} className="space-y-4">
              <div>
                <label
                  htmlFor="rec-prog-id"
                  className="mb-1 block text-xs font-medium text-gray-400"
                >
                  Whitelist Program ID *
                </label>
                <input
                  id="rec-prog-id"
                  type="text"
                  placeholder="e.g. wl-program-genesis"
                  value={reconcileProgramId}
                  onChange={(e) => setReconcileProgramId(e.target.value)}
                  required
                  className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {reconcileError && (
                <div className="flex items-center gap-2 rounded border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{reconcileError}</span>
                </div>
              )}

              {reconcileResult && (
                <div className="space-y-1 rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Reconciliation Succeeded</span>
                  </div>
                  <p className="text-[11px] text-emerald-200">
                    Reconciled {reconcileResult.slotsFilled ?? 0} slots (Remaining:{" "}
                    {reconcileResult.openSlotsRemaining ?? 0})
                  </p>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="sm"
                className="w-full gap-2 text-xs"
                disabled={reconciling}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${reconciling ? "animate-spin" : ""}`}
                />
                {reconciling ? "Reconciling..." : "Reconcile Program Queue"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Tool 2: Whitelist Slot Revocation */}
        <Card className="border-gray-800 bg-[#0c0e17]/90">
          <CardHeader>
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-amber-400" />
              <CardTitle className="text-base text-white">
                Revoke Whitelist Slot
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-gray-400">
              Manually revoke an allocated whitelist slot due to policy violations or
              disqualification.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRevokeSlot} className="space-y-3">
              <div>
                <label
                  htmlFor="rev-slot-id"
                  className="mb-1 block text-xs font-medium text-gray-400"
                >
                  Slot ID (preferred)
                </label>
                <input
                  id="rev-slot-id"
                  type="text"
                  placeholder="e.g. clabc123456789"
                  value={revokeSlotId}
                  onChange={(e) => setRevokeSlotId(e.target.value)}
                  className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="rev-prog-id"
                    className="mb-1 block text-xs font-medium text-gray-400"
                  >
                    Program ID (alt)
                  </label>
                  <input
                    id="rev-prog-id"
                    type="text"
                    placeholder="e.g. wl-program-genesis"
                    value={revokeProgramId}
                    onChange={(e) => setRevokeProgramId(e.target.value)}
                    className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="rev-user-id"
                    className="mb-1 block text-xs font-medium text-gray-400"
                  >
                    User ID (alt)
                  </label>
                  <input
                    id="rev-user-id"
                    type="text"
                    placeholder="e.g. user-cuid"
                    value={revokeUserId}
                    onChange={(e) => setRevokeUserId(e.target.value)}
                    className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="rev-reason"
                  className="mb-1 block text-xs font-medium text-gray-400"
                >
                  Revocation Reason
                </label>
                <input
                  id="rev-reason"
                  type="text"
                  placeholder="e.g. Sybil evidence confirmed during audit"
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {revokeError && (
                <div className="flex items-center gap-2 rounded border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{revokeError}</span>
                </div>
              )}

              {revokeResult && (
                <div className="space-y-1 rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Slot Revoked Successfully</span>
                  </div>
                  <p className="text-[11px] text-emerald-200">
                    Slot ID: {revokeResult.slotId} (Audit Log: {revokeResult.auditLogId})
                  </p>
                </div>
              )}

              <Button
                type="submit"
                variant="secondary"
                size="sm"
                className="w-full text-xs text-rose-300 hover:bg-rose-900/30 hover:text-rose-200"
                disabled={revoking}
              >
                {revoking ? "Revoking..." : "Revoke Whitelist Slot"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Tool 3: Whitelist Address Lookup */}
      <Card className="border-gray-800 bg-[#0c0e17]/90">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-teal-400" />
            <CardTitle className="text-base text-white">
              Address Whitelist Lookup
            </CardTitle>
          </div>
          <CardDescription className="text-xs text-gray-400">
            Check the live qualification tier, points balance, and slot allocation for any
            wallet address.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLookup} className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                placeholder="0x... EVM wallet address"
                value={lookupAddress}
                onChange={(e) => setLookupAddress(e.target.value)}
                required
                className="flex-1 rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
              />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="gap-2 text-xs"
                disabled={lookingUp}
              >
                <Search className="h-3.5 w-3.5" />
                {lookingUp ? "Searching..." : "Lookup Status"}
              </Button>
            </div>

            {lookupError && (
              <div className="flex items-center gap-2 rounded border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{lookupError}</span>
              </div>
            )}

            {lookupResult && (
              <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-900/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-2">
                  <span className="font-mono text-xs font-semibold text-emerald-400">
                    {lookupAddress}
                  </span>
                  <Badge
                    variant={
                      lookupResult.status?.qualified
                        ? "success"
                        : lookupResult.status?.phase === "SLOT_ALLOCATED"
                          ? "default"
                          : "outline"
                    }
                  >
                    {lookupResult.status?.phase ??
                      (lookupResult.status?.qualified ? "QUALIFIED" : "UNQUALIFIED")}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div>
                    <span className="block text-gray-500">Program:</span>
                    <span className="font-semibold text-white">
                      {lookupResult.program?.name ?? lookupResult.program?.slug ?? "None"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-gray-500">Phase:</span>
                    <span className="font-semibold text-emerald-400">
                      {lookupResult.status?.phase ?? "NONE"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-gray-500">Allocated Slot:</span>
                    <span className="font-semibold text-white">
                      {lookupResult.status?.slotNumber
                        ? `#${lookupResult.status.slotNumber}`
                        : "None"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-gray-500">Queue Position:</span>
                    <span className="font-semibold text-white">
                      {lookupResult.status?.queueNumber
                        ? `#${lookupResult.status.queueNumber}`
                        : "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Backend Notice */}
      <PlaceholderNotice
        title="Full Slot Registry & CSV Bulk Export"
        description="Comprehensive slot registry query and CSV batch export APIs are not yet available in current backend. Targeted Slot Revocation, Queue Reconciliation, and Individual Address Lookup tools above operate on live database records."
        phase="Upcoming Feature"
      />
    </div>
  );
}
