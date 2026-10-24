"use client";

import React, { useState, useEffect } from "react";
import {
  Shield,
  RefreshCw,
  XCircle,
  Search,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ListOrdered,
  Plus,
  Layers,
  Sparkles,
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
  adminReconcileQueue,
  adminRevokeSlot,
  adminListSlots,
  adminListWLPrograms,
  adminCreateWLProgram,
  adminUpdateWLProgram,
  type AdminRevokeSlotInput,
  type AdminReconcileQueueResponse,
  type AdminSlotRecord,
  type AdminWLProgramRecord,
} from "@/lib/admin/client";
import {
  fetchWhitelistStatus,
  type WhitelistStatusResponse,
} from "@/lib/whitelist/client";
import { shortenAddress } from "@/lib/auth/address";

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

  // WL Programs State
  const [programs, setPrograms] = useState<AdminWLProgramRecord[]>([]);
  const [loadingPrograms, setLoadingPrograms] = useState(true);
  const [programsError, setProgramsError] = useState<string | null>(null);
  const [reloadProgramsKey, setReloadProgramsKey] = useState(0);

  // Create Program Form State
  const [showCreateProgram, setShowCreateProgram] = useState(false);
  const [newProgName, setNewProgName] = useState("");
  const [newProgSlug, setNewProgSlug] = useState("");
  const [newProgCapacity, setNewProgCapacity] = useState("");
  const [newProgStatus, setNewProgStatus] = useState("UPCOMING");
  const [newProgStartsAt, setNewProgStartsAt] = useState("");
  const [newProgEndsAt, setNewProgEndsAt] = useState("");
  const [newProgDescription, setNewProgDescription] = useState("");
  const [creatingProgram, setCreatingProgram] = useState(false);
  const [createProgramError, setCreateProgramError] = useState<string | null>(null);
  const [createProgramSuccess, setCreateProgramSuccess] = useState<string | null>(null);

  // Updating program status state
  const [updatingProgId, setUpdatingProgId] = useState<string | null>(null);
  const [progUpdateMsg, setProgUpdateMsg] = useState<{
    id: string;
    text: string;
    error?: boolean;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    adminListWLPrograms()
      .then((res) => {
        if (isMounted) {
          setPrograms(res.programs || []);
          setProgramsError(null);
          setLoadingPrograms(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setProgramsError(
            (err as Error).message || "Failed to load whitelist programs.",
          );
          setLoadingPrograms(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [reloadProgramsKey]);

  // Allocated Slots Registry State
  const [slots, setSlots] = useState<AdminSlotRecord[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [slotsPage, setSlotsPage] = useState(1);
  const [slotsTotal, setSlotsTotal] = useState(0);
  const [slotSearchQuery, setSlotSearchQuery] = useState("");
  const [slotProgramFilter, setSlotProgramFilter] = useState("");
  const [slotStatusFilter, setSlotStatusFilter] = useState("");
  const [reloadSlotsKey, setReloadSlotsKey] = useState(0);
  const slotsLimit = 10;

  useEffect(() => {
    let isMounted = true;
    adminListSlots({
      search: slotSearchQuery.trim() || undefined,
      programId: slotProgramFilter.trim() || undefined,
      status: slotStatusFilter.trim() || undefined,
      limit: slotsLimit,
      offset: (slotsPage - 1) * slotsLimit,
    })
      .then((res) => {
        if (isMounted) {
          setSlots(res.slots);
          setSlotsTotal(res.total);
          setSlotsError(null);
          setLoadingSlots(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setSlotsError((err as Error).message || "Failed to load whitelist slots.");
          setLoadingSlots(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [slotsPage, reloadSlotsKey, slotSearchQuery, slotProgramFilter, slotStatusFilter]);

  const handleSlotsFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingSlots(true);
    setSlotsPage(1);
    setReloadSlotsKey((k) => k + 1);
  };

  const handleReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconcileProgramId.trim()) return;
    setReconciling(true);
    setReconcileError(null);
    setReconcileResult(null);
    try {
      const res = await adminReconcileQueue({ programId: reconcileProgramId.trim() });
      setReconcileResult(res);
      // Refresh slots table after reconciliation
      setReloadSlotsKey((k) => k + 1);
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
      // Refresh slots table after revocation
      setReloadSlotsKey((k) => k + 1);
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

  const handleProgNameChange = (name: string) => {
    setNewProgName(name);
    const generatedSlug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setNewProgSlug(generatedSlug);
  };

  const handleCreateProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateProgramError(null);
    setCreateProgramSuccess(null);

    if (!newProgName.trim()) {
      setCreateProgramError("Program Name is required.");
      return;
    }
    if (!newProgSlug.trim()) {
      setCreateProgramError("Program Slug is required.");
      return;
    }
    const capNum = parseInt(newProgCapacity, 10);
    if (!newProgCapacity || isNaN(capNum) || capNum <= 0) {
      setCreateProgramError(
        "Explicit capacity (Total Slots) is required and must be an integer > 0.",
      );
      return;
    }
    if (!newProgStartsAt) {
      setCreateProgramError("Starts At timestamp is required.");
      return;
    }

    setCreatingProgram(true);
    try {
      const startsAtIso = new Date(newProgStartsAt).toISOString();
      const endsAtIso = newProgEndsAt ? new Date(newProgEndsAt).toISOString() : null;

      await adminCreateWLProgram({
        name: newProgName.trim(),
        slug: newProgSlug.trim().toLowerCase(),
        totalSlots: capNum,
        status: newProgStatus,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
        description: newProgDescription.trim() || null,
      });

      setCreateProgramSuccess(`WL Program "${newProgName}" created successfully!`);
      setShowCreateProgram(false);
      setNewProgName("");
      setNewProgSlug("");
      setNewProgCapacity("");
      setNewProgStatus("UPCOMING");
      setNewProgStartsAt("");
      setNewProgEndsAt("");
      setNewProgDescription("");
      setReloadProgramsKey((k) => k + 1);
    } catch (err: unknown) {
      setCreateProgramError(
        (err as Error).message || "Failed to create whitelist program.",
      );
    } finally {
      setCreatingProgram(false);
    }
  };

  const handleUpdateProgramStatus = async (programId: string, newStatus: string) => {
    setUpdatingProgId(programId);
    setProgUpdateMsg(null);
    try {
      await adminUpdateWLProgram(programId, { status: newStatus });
      setProgUpdateMsg({ id: programId, text: `Status updated to ${newStatus}` });
      setReloadProgramsKey((k) => k + 1);
    } catch (err: unknown) {
      setProgUpdateMsg({
        id: programId,
        text: (err as Error).message || "Update failed",
        error: true,
      });
    } finally {
      setUpdatingProgId(null);
    }
  };

  const totalSlotPages = Math.max(1, Math.ceil(slotsTotal / slotsLimit));

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
          Execute FIFO queue reconciliation, inspect allocated whitelist slots, enforce
          manual slot revocations, and check user qualification tiers.
        </p>
      </div>

      {/* Whitelist Programs Management */}
      <Card className="border-gray-800 bg-[#0c0e17]/90">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-emerald-400" />
              <CardTitle className="text-base text-white">Whitelist Programs</CardTitle>
              <Badge variant="default" className="text-xs">
                {programs.length} Registered
              </Badge>
            </div>
            <CardDescription className="text-xs text-gray-400">
              Create and manage Whitelist Programs, explicit slot capacities, and
              lifecycle statuses.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setLoadingPrograms(true);
                setReloadProgramsKey((k) => k + 1);
              }}
              disabled={loadingPrograms}
              className="gap-1.5 text-xs"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loadingPrograms ? "animate-spin" : ""}`}
              />
              <span>Refresh</span>
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                setShowCreateProgram(!showCreateProgram);
                setCreateProgramError(null);
                setCreateProgramSuccess(null);
              }}
              className="gap-1.5 text-xs"
            >
              <Plus className="h-4 w-4" />
              <span>{showCreateProgram ? "Cancel" : "New Program"}</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {createProgramSuccess && (
            <div className="flex items-center gap-2 rounded border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-300">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span>{createProgramSuccess}</span>
            </div>
          )}

          {/* Create Program Form */}
          {showCreateProgram && (
            <form
              onSubmit={handleCreateProgram}
              className="space-y-4 rounded-lg border border-gray-800 bg-gray-900/40 p-4"
            >
              <h3 className="text-sm font-semibold text-white">
                Create New Whitelist Program
              </h3>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="prog-name"
                    className="mb-1 block text-xs font-medium text-gray-400"
                  >
                    Program Name *
                  </label>
                  <input
                    id="prog-name"
                    type="text"
                    placeholder="e.g. Genesis Whitelist Program"
                    value={newProgName}
                    onChange={(e) => handleProgNameChange(e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="prog-slug"
                    className="mb-1 block text-xs font-medium text-gray-400"
                  >
                    Slug *
                  </label>
                  <input
                    id="prog-slug"
                    type="text"
                    placeholder="e.g. genesis-wl-program"
                    value={newProgSlug}
                    onChange={(e) => setNewProgSlug(e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="prog-capacity"
                    className="mb-1 block text-xs font-medium text-gray-400"
                  >
                    Capacity (Total Slots) *
                  </label>
                  <input
                    id="prog-capacity"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="e.g. 500"
                    value={newProgCapacity}
                    onChange={(e) => setNewProgCapacity(e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-gray-500">
                    Explicit slot limit. Must be greater than 0.
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="prog-status"
                    className="mb-1 block text-xs font-medium text-gray-400"
                  >
                    Initial Status
                  </label>
                  <select
                    id="prog-status"
                    value={newProgStatus}
                    onChange={(e) => setNewProgStatus(e.target.value)}
                    className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="UPCOMING">UPCOMING</option>
                    <option value="OPEN">OPEN</option>
                    <option value="PAUSED">PAUSED</option>
                    <option value="FINALIZED">FINALIZED</option>
                    <option value="CLOSED">CLOSED</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="prog-starts"
                    className="mb-1 block text-xs font-medium text-gray-400"
                  >
                    Starts At *
                  </label>
                  <input
                    id="prog-starts"
                    type="datetime-local"
                    value={newProgStartsAt}
                    onChange={(e) => setNewProgStartsAt(e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="prog-ends"
                    className="mb-1 block text-xs font-medium text-gray-400"
                  >
                    Ends At (optional)
                  </label>
                  <input
                    id="prog-ends"
                    type="datetime-local"
                    value={newProgEndsAt}
                    onChange={(e) => setNewProgEndsAt(e.target.value)}
                    className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="prog-desc"
                  className="mb-1 block text-xs font-medium text-gray-400"
                >
                  Description (optional)
                </label>
                <textarea
                  id="prog-desc"
                  rows={2}
                  placeholder="Program overview and qualification criteria..."
                  value={newProgDescription}
                  onChange={(e) => setNewProgDescription(e.target.value)}
                  className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {createProgramError && (
                <div className="flex items-center gap-2 rounded border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{createProgramError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateProgram(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={creatingProgram}
                >
                  {creatingProgram ? "Creating..." : "Create Program"}
                </Button>
              </div>
            </form>
          )}

          {/* Programs Error Alert */}
          {programsError && (
            <div className="flex items-center gap-2 rounded border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{programsError}</span>
            </div>
          )}

          {/* Programs List Table */}
          <div className="overflow-x-auto rounded-lg border border-gray-800">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-800 bg-gray-900/60 text-gray-400">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Program</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Capacity (Slots)</th>
                  <th className="px-3 py-2.5 font-medium">Schedule</th>
                  <th className="px-3 py-2.5 font-medium">Campaigns</th>
                  <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 bg-[#0c0e17]/40 text-gray-300">
                {loadingPrograms && programs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-emerald-400" />
                      Loading whitelist programs...
                    </td>
                  </tr>
                ) : programs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      No whitelist programs registered yet. Click &quot;New Program&quot;
                      above to create one.
                    </td>
                  </tr>
                ) : (
                  programs.map((p) => {
                    const pct =
                      p.totalSlots > 0
                        ? Math.min(
                            100,
                            Math.round((p.allocatedSlotsCount / p.totalSlots) * 100),
                          )
                        : 0;
                    return (
                      <tr key={p.id} className="transition-colors hover:bg-gray-800/30">
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-white">{p.name}</div>
                          <div className="font-mono text-[11px] text-gray-400">
                            slug: {p.slug}
                          </div>
                          <div className="font-mono text-[10px] text-gray-500">
                            ID: {p.id}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                p.status === "OPEN"
                                  ? "success"
                                  : p.status === "PAUSED"
                                    ? "warning"
                                    : p.status === "CLOSED"
                                      ? "outline"
                                      : "default"
                              }
                              className="text-[10px]"
                            >
                              {p.status}
                            </Badge>
                            <select
                              aria-label={`Change status for ${p.name}`}
                              value={p.status}
                              disabled={updatingProgId === p.id}
                              onChange={(e) =>
                                handleUpdateProgramStatus(p.id, e.target.value)
                              }
                              className="rounded border border-gray-700 bg-gray-900 px-1.5 py-0.5 text-[10px] text-gray-300 focus:border-emerald-500 focus:outline-none"
                            >
                              <option value="UPCOMING">UPCOMING</option>
                              <option value="OPEN">OPEN</option>
                              <option value="PAUSED">PAUSED</option>
                              <option value="FINALIZED">FINALIZED</option>
                              <option value="CLOSED">CLOSED</option>
                            </select>
                          </div>
                          {progUpdateMsg?.id === p.id && (
                            <p
                              className={`mt-1 text-[10px] ${
                                progUpdateMsg.error ? "text-rose-400" : "text-emerald-400"
                              }`}
                            >
                              {progUpdateMsg.text}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-mono text-xs text-white">
                            {p.allocatedSlotsCount} / {p.totalSlots}
                          </div>
                          <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-gray-800">
                            <div
                              className="h-full bg-emerald-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-500">{pct}% filled</span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-400">
                          <div>From: {new Date(p.startsAt).toLocaleDateString()}</div>
                          {p.endsAt && (
                            <div>To: {new Date(p.endsAt).toLocaleDateString()}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-gray-300">
                          {p.campaignsCount ?? 0}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[11px]"
                              onClick={() => {
                                setReconcileProgramId(p.id);
                                const el = document.getElementById("rec-prog-id");
                                el?.scrollIntoView({ behavior: "smooth" });
                              }}
                            >
                              Reconcile
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[11px]"
                              onClick={() => {
                                setSlotProgramFilter(p.id);
                                setSlotSearchQuery("");
                                setLoadingSlots(true);
                                setSlotsPage(1);
                                setReloadSlotsKey((k) => k + 1);
                              }}
                            >
                              Slots
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
        </CardContent>
      </Card>

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
                  placeholder="e.g. clabc123456789 (or select from Allocated Slots table below)"
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

      {/* Tool 4: Allocated Whitelist Slots Registry */}
      <Card className="border-gray-800 bg-[#0c0e17]/90">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListOrdered className="h-5 w-5 text-emerald-400" />
              <CardTitle className="text-base text-white">
                Allocated Whitelist Slots
              </CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLoadingSlots(true);
                setReloadSlotsKey((k) => k + 1);
              }}
              disabled={loadingSlots}
              className="gap-1.5 text-xs"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loadingSlots ? "animate-spin" : ""}`}
              />
              <span>Refresh</span>
            </Button>
          </div>
          <CardDescription className="text-xs text-gray-400">
            Browse allocated whitelist slots across programs with live statuses, wallet
            addresses, and allocation timestamps. Click &quot;Revoke&quot; to populate the
            revocation form above.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters Form */}
          <form
            onSubmit={handleSlotsFilterSubmit}
            className="grid grid-cols-1 gap-2 sm:grid-cols-4"
          >
            <div className="sm:col-span-2">
              <input
                type="text"
                placeholder="Search by wallet (0x...), User ID, or Slot ID..."
                value={slotSearchQuery}
                onChange={(e) => setSlotSearchQuery(e.target.value)}
                className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <input
                type="text"
                placeholder="Program ID..."
                value={slotProgramFilter}
                onChange={(e) => setSlotProgramFilter(e.target.value)}
                className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={slotStatusFilter}
                onChange={(e) => setSlotStatusFilter(e.target.value)}
                className="flex-1 rounded-md border border-gray-700 bg-gray-900/60 px-2 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="">All Statuses</option>
                <option value="ALLOCATED">ALLOCATED</option>
                <option value="CONFIRMED">CONFIRMED</option>
                <option value="REVOKED_MANUAL_ADMIN">REVOKED</option>
              </select>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={loadingSlots}
                className="text-xs"
              >
                Filter
              </Button>
            </div>
          </form>

          {slotsError && (
            <div className="flex items-center gap-2 rounded border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{slotsError}</span>
            </div>
          )}

          {/* Slots Table */}
          <div className="overflow-x-auto rounded-lg border border-gray-800">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-800 bg-gray-900/60 text-gray-400">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Slot #</th>
                  <th className="px-3 py-2.5 font-medium">Program</th>
                  <th className="px-3 py-2.5 font-medium">Wallet Address</th>
                  <th className="px-3 py-2.5 font-medium">User ID</th>
                  <th className="px-3 py-2.5 font-medium">Allocated At</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 bg-[#0c0e17]/40 text-gray-300">
                {loadingSlots && slots.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-500">
                      Loading allocated slots...
                    </td>
                  </tr>
                ) : slots.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-500">
                      No whitelist slots found.
                    </td>
                  </tr>
                ) : (
                  slots.map((s) => (
                    <tr key={s.id} className="transition-colors hover:bg-gray-800/30">
                      <td className="px-3 py-2.5 font-semibold text-white">
                        #{s.slotNumber}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-gray-300">
                          {s.programName ?? s.programSlug ?? s.programId}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-emerald-400">
                        {s.walletAddress ? (
                          <span title={s.walletAddress}>
                            {shortenAddress(s.walletAddress)}
                          </span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-gray-400">
                        <span title={s.userId}>{s.userId}</span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-400">
                        {new Date(s.allocatedAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge
                          variant={
                            s.status === "CONFIRMED"
                              ? "success"
                              : s.status === "ALLOCATED"
                                ? "default"
                                : "warning"
                          }
                          className="text-[10px]"
                        >
                          {s.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {s.status !== "REVOKED_MANUAL_ADMIN" && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[11px] hover:text-rose-300"
                            onClick={() => {
                              setRevokeSlotId(s.id);
                              setRevokeProgramId(s.programId);
                              setRevokeUserId(s.userId);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-1 text-xs text-gray-400">
            <span>
              Showing {slots.length > 0 ? (slotsPage - 1) * slotsLimit + 1 : 0} to{" "}
              {Math.min(slotsPage * slotsLimit, slotsTotal)} of {slotsTotal} slots
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                aria-label="Previous slots page"
                disabled={slotsPage <= 1 || loadingSlots}
                onClick={() => {
                  setLoadingSlots(true);
                  setSlotsPage((p) => p - 1);
                }}
                className="h-7 px-2"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="px-2 text-gray-300">
                Page {slotsPage} of {totalSlotPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                aria-label="Next slots page"
                disabled={slotsPage >= totalSlotPages || loadingSlots}
                onClick={() => {
                  setLoadingSlots(true);
                  setSlotsPage((p) => p + 1);
                }}
                className="h-7 px-2"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
