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
  Plus,
  Calendar,
  Settings2,
  X,
  ChevronRight,
  ShieldCheck,
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
  fetchCurrentDrop,
  emergencyCloseDropWindow,
  type CurrentDropResponse,
} from "@/lib/drops/client";
import {
  adminListDrops,
  adminGetDrop,
  adminCreateDrop,
  adminUpdateDrop,
  adminConfigurePeriodStock,
  adminActivateDropPeriod,
  adminListTraits,
  type AdminDropRecord,
  type AdminTraitRecord,
  type TraitStockItemInput,
} from "@/lib/admin/client";

export function AdminDrops() {
  const [dropData, setDropData] = useState<CurrentDropResponse | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(true);
  const [currentError, setCurrentError] = useState<string | null>(null);

  // Drops list & detail state
  const [drops, setDrops] = useState<AdminDropRecord[]>([]);
  const [selectedDropId, setSelectedDropId] = useState<string | null>(null);
  const [selectedDropDetail, setSelectedDropDetail] = useState<any | null>(null);
  const [loadingDrops, setLoadingDrops] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [dropsError, setDropsError] = useState<string | null>(null);

  // Traits catalog
  const [traits, setTraits] = useState<AdminTraitRecord[]>([]);

  // Create Drop modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createStartsAt, setCreateStartsAt] = useState("");
  const [createEndsAt, setCreateEndsAt] = useState("");
  const [createStatus, setCreateStatus] = useState("SCHEDULED");
  const [autoGeneratePeriods, setAutoGeneratePeriods] = useState(true);
  const [creatingDrop, setCreatingDrop] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Stock Configuration modal state
  const [configuringPeriod, setConfiguringPeriod] = useState<any | null>(null);
  const [stockItems, setStockItems] = useState<TraitStockItemInput[]>([]);
  const [selectedTraitToAdd, setSelectedTraitToAdd] = useState("");
  const [savingStock, setSavingStock] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [stockSuccess, setStockSuccess] = useState<string | null>(null);

  // Period Activation state
  const [activatingPeriodId, setActivatingPeriodId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Emergency close state
  const [emergencyReason, setEmergencyReason] = useState("");
  const [closing, setClosing] = useState(false);
  const [emergencyResult, setEmergencyResult] = useState<any>(null);
  const [emergencyError, setEmergencyError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // 1. Fetch current live drop monitor
  useEffect(() => {
    let isMounted = true;
    fetchCurrentDrop()
      .then((data) => {
        if (isMounted) {
          setDropData(data);
          setCurrentError(null);
          setLoadingCurrent(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setCurrentError((err as Error).message || "Failed to load drop data.");
          setLoadingCurrent(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  // 2. Fetch all drops and traits
  useEffect(() => {
    let isMounted = true;

    Promise.all([adminListDrops({ limit: 50 }), adminListTraits()])
      .then(([dropsRes, traitsRes]) => {
        if (isMounted) {
          setDrops(dropsRes.drops);
          setTraits(traitsRes.traits);
          setDropsError(null);
          setLoadingDrops(false);

          // Select first drop if none selected
          setSelectedDropId((prev) => prev || (dropsRes.drops[0]?.id ?? null));
        }
      })
      .catch((err) => {
        if (isMounted) {
          setDropsError((err as Error).message || "Failed to load admin drops.");
          setLoadingDrops(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  // 3. Fetch selected drop details when selectedDropId changes
  useEffect(() => {
    if (!selectedDropId) return;
    let isMounted = true;

    adminGetDrop(selectedDropId)
      .then((res) => {
        if (isMounted) {
          setSelectedDropDetail(res.drop);
          setLoadingDetail(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setDropsError((err as Error).message || "Failed to load drop details.");
          setLoadingDetail(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedDropId, reloadKey]);

  // Handle Emergency Close
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

  // Handle Create Drop
  const handleCreateDrop = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);

    if (!createTitle.trim() || createTitle.trim().length < 3) {
      setCreateError("Title must be at least 3 characters.");
      return;
    }
    if (!createSlug.trim() || !/^[a-z0-9-]+$/.test(createSlug.trim())) {
      setCreateError("Slug must be lowercase alphanumeric and hyphens only.");
      return;
    }
    if (!createStartsAt || !createEndsAt) {
      setCreateError("Both startsAt and endsAt dates are required.");
      return;
    }

    const parseUtcInput = (dt: string) => {
      if (!dt) return new Date(NaN);
      if (dt.endsWith("Z")) return new Date(dt);
      return new Date(`${dt}:00.000Z`);
    };

    const startDate = parseUtcInput(createStartsAt);
    const endDate = parseUtcInput(createEndsAt);
    if (endDate <= startDate) {
      setCreateError("endsAt must be strictly after startsAt.");
      return;
    }

    // Check 2-hour UTC cycle alignment
    if (
      startDate.getUTCMinutes() !== 0 ||
      startDate.getUTCSeconds() !== 0 ||
      startDate.getUTCHours() % 2 !== 0
    ) {
      setCreateError(
        "startsAt must align with global 2-hour UTC cycle boundaries (00:00, 02:00, 04:00, etc. UTC).",
      );
      return;
    }

    setCreatingDrop(true);
    try {
      const res = await adminCreateDrop({
        title: createTitle.trim(),
        slug: createSlug.trim(),
        description: createDescription.trim() || null,
        startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(),
        status: createStatus,
        generatePeriods: autoGeneratePeriods,
      });

      setCreateSuccess(`Drop "${res.drop.title}" created successfully!`);
      setShowCreateModal(false);
      // Reset form
      setCreateTitle("");
      setCreateSlug("");
      setCreateDescription("");
      setCreateStartsAt("");
      setCreateEndsAt("");
      setSelectedDropId(res.drop.id);
      setReloadKey((k) => k + 1);
    } catch (err: unknown) {
      setCreateError((err as Error).message || "Failed to create drop.");
    } finally {
      setCreatingDrop(false);
    }
  };

  // Open Stock Modal for a Period
  const handleOpenStockModal = (period: any) => {
    setConfiguringPeriod(period);
    setStockError(null);
    setStockSuccess(null);

    // Populate existing stock or empty
    if (period.poolItems && period.poolItems.length > 0) {
      setStockItems(
        period.poolItems.map((p: any) => ({
          traitId: p.traitId,
          stock: p.allocatedStock,
          weight: p.weight ?? 100,
        })),
      );
    } else {
      // Default: empty list, admin selects traits to allocate
      setStockItems([]);
    }
  };

  // Add Trait to Stock List
  const handleAddTraitToStock = () => {
    if (!selectedTraitToAdd) return;
    if (stockItems.some((item) => item.traitId === selectedTraitToAdd)) {
      setStockError("Trait is already in the stock allocation list.");
      return;
    }

    setStockItems((prev) => [
      ...prev,
      {
        traitId: selectedTraitToAdd,
        stock: 10, // reasonable default input for the admin to adjust
        weight: 100, // equal probability by default
      },
    ]);
    setSelectedTraitToAdd("");
    setStockError(null);
  };

  // Remove Trait from Stock List
  const handleRemoveTraitFromStock = (traitId: string) => {
    setStockItems((prev) => prev.filter((item) => item.traitId !== traitId));
  };

  // Update Stock or Weight
  const handleUpdateStockItem = (
    traitId: string,
    field: "stock" | "weight",
    val: number,
  ) => {
    setStockItems((prev) =>
      prev.map((item) => (item.traitId === traitId ? { ...item, [field]: val } : item)),
    );
  };

  // Save Stock Configuration
  const handleSaveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configuringPeriod || !selectedDropId) return;

    if (stockItems.length === 0) {
      setStockError("You must allocate stock to at least one trait.");
      return;
    }

    const totalAllocated = stockItems.reduce((acc, i) => acc + i.stock, 0);
    if (totalAllocated <= 0) {
      setStockError("Total allocated stock must be greater than zero.");
      return;
    }

    for (const item of stockItems) {
      if (!Number.isInteger(item.stock) || item.stock < 0) {
        setStockError("Stock values must be non-negative integers.");
        return;
      }
    }

    setSavingStock(true);
    setStockError(null);
    setStockSuccess(null);

    try {
      await adminConfigurePeriodStock(selectedDropId, configuringPeriod.id, stockItems);
      setStockSuccess("Trait pool stock successfully configured!");
      setTimeout(() => {
        setConfiguringPeriod(null);
      }, 1000);
      setReloadKey((k) => k + 1);
    } catch (err: unknown) {
      setStockError((err as Error).message || "Failed to configure stock.");
    } finally {
      setSavingStock(false);
    }
  };

  // Activate Period
  const handleActivatePeriod = async (periodId: string) => {
    if (!selectedDropId) return;

    const confirmed = window.confirm(
      "Are you sure you want to activate this Drop Period? Once active, stock is locked and claims are opened.",
    );
    if (!confirmed) return;

    setActivatingPeriodId(periodId);
    setActionError(null);
    setActionSuccess(null);

    try {
      await adminActivateDropPeriod(selectedDropId, periodId);
      setActionSuccess("Period activated successfully!");
      setReloadKey((k) => k + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message || "Failed to activate period.");
    } finally {
      setActivatingPeriodId(null);
    }
  };

  // Helper: check if period can be configured right now
  const canPeriodBeConfigured = (period: any) => {
    if (
      period.status === "ACTIVE" ||
      period.status === "ENDED" ||
      period.status === "CANCELLED"
    ) {
      return { allowed: false, reason: `Status is ${period.status}` };
    }
    if (period.isStockLocked) {
      return { allowed: false, reason: "Stock is locked" };
    }
    const now = new Date();
    const startsAt = new Date(period.startsAt);
    const configLockAt = new Date(period.configLockAt);
    if (now >= startsAt) {
      return { allowed: false, reason: "Period already started" };
    }
    if (now >= configLockAt) {
      return { allowed: false, reason: "In 15-min freeze window" };
    }
    return { allowed: true };
  };

  // Calculate total stock in modal
  const totalModalStock = stockItems.reduce((acc, i) => acc + (i.stock || 0), 0);
  const totalModalWeight = stockItems.reduce((acc, i) => acc + (i.weight || 100), 0);

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
            Configure drop seasons, 2-hour UTC cycles, trait pool stock allocations, and
            manage claim operations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus className="h-4 w-4" />
            Create Drop
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="gap-2 self-start sm:self-auto"
            onClick={() => {
              setLoadingCurrent(true);
              setLoadingDrops(true);
              setReloadKey((k) => k + 1);
            }}
            disabled={loadingCurrent || loadingDrops}
          >
            <RefreshCw
              className={`h-4 w-4 ${loadingCurrent || loadingDrops ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Action / Global Alerts */}
      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-rose-400" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* SECTION 1: Active Live Drop Window & Stock Monitor */}
      <Card className="border-gray-800 bg-[#0c0e17]/90">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-400" />
              <CardTitle className="text-base text-white">
                Live Drop Monitor & Claim Window
              </CardTitle>
            </div>
            {dropData?.period && (
              <Badge variant="outline">
                Period #{dropData.period.periodIndex} ({dropData.period.status})
              </Badge>
            )}
          </div>
          <CardDescription className="text-xs text-gray-400">
            Real-time status of current active trait allocation cycle, claim window
            countdown, and inventory pools.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingCurrent ? (
            <div className="py-8 text-center text-xs text-gray-400">
              <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-emerald-400" />
              Loading current drop status...
            </div>
          ) : !dropData?.drop ? (
            <div className="rounded-lg border border-gray-800/80 bg-gray-900/30 p-8 text-center text-xs text-gray-500">
              No drop event is currently active in the system.
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
                  Live Pool Trait Allocations
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

      {/* SECTION 2: Drops & Periods Configuration */}
      <Card className="border-gray-800 bg-[#0c0e17]/90">
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-emerald-400" />
              <CardTitle className="text-base text-white">
                Drop Seasons & Period Configurations
              </CardTitle>
            </div>
            {drops.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Select Drop:</span>
                <select
                  value={selectedDropId ?? ""}
                  onChange={(e) => setSelectedDropId(e.target.value)}
                  className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-white focus:border-emerald-500 focus:outline-none"
                >
                  {drops.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} ({d.status})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <CardDescription className="text-xs text-gray-400">
            Configure 2-hour UTC cycles, trait stock allocations per period, and enforce
            freeze timing rules.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingDrops ? (
            <div className="py-8 text-center text-xs text-gray-400">
              <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-emerald-400" />
              Loading drop list...
            </div>
          ) : drops.length === 0 ? (
            <div className="rounded-lg border border-gray-800/80 bg-gray-900/30 p-8 text-center text-xs text-gray-500">
              No drops created yet. Click &quot;+ Create Drop&quot; to create your first
              drop event.
            </div>
          ) : !selectedDropDetail ? (
            <div className="py-8 text-center text-xs text-gray-400">
              <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-emerald-400" />
              Loading drop details...
            </div>
          ) : (
            <div className="space-y-6">
              {/* Selected Drop Meta Overview */}
              <div className="flex flex-col gap-2 rounded-lg border border-gray-800 bg-gray-900/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-white">
                      {selectedDropDetail.title}
                    </h2>
                    <Badge variant="outline" className="text-[10px]">
                      {selectedDropDetail.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">
                    Slug:{" "}
                    <span className="font-mono text-gray-300">
                      {selectedDropDetail.slug}
                    </span>{" "}
                    | Timeline: {new Date(selectedDropDetail.startsAt).toUTCString()}{" "}
                    &rarr; {new Date(selectedDropDetail.endsAt).toUTCString()}
                  </p>
                </div>
                <div className="text-xs text-gray-400">
                  Total Periods:{" "}
                  <span className="font-semibold text-white">
                    {selectedDropDetail.periods?.length ?? 0}
                  </span>
                </div>
              </div>

              {/* Periods Table */}
              <div>
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-gray-300">
                  <Clock className="h-3.5 w-3.5 text-emerald-400" />
                  2-Hour UTC Cycle Periods & Stock Status
                </h3>
                <div className="overflow-x-auto rounded-lg border border-gray-800">
                  <table className="w-full text-left text-xs text-gray-300">
                    <thead className="border-b border-gray-800 bg-gray-900/60 text-[11px] text-gray-400">
                      <tr>
                        <th className="px-3 py-2.5">Period</th>
                        <th className="px-3 py-2.5">UTC Window</th>
                        <th className="px-3 py-2.5">Claim Window (30m)</th>
                        <th className="px-3 py-2.5">Config Freeze (15m Lead)</th>
                        <th className="px-3 py-2.5">Stock Status</th>
                        <th className="px-3 py-2.5">Status</th>
                        <th className="px-3 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60">
                      {selectedDropDetail.periods?.map((p: any) => {
                        const configCheck = canPeriodBeConfigured(p);
                        const totalStock = p.poolItems?.reduce(
                          (acc: number, item: any) => acc + item.allocatedStock,
                          0,
                        );
                        const canActivate =
                          p.status === "CONFIGURED" &&
                          p.isStockConfigured &&
                          totalStock > 0 &&
                          new Date() >= new Date(p.startsAt) &&
                          new Date() <= new Date(p.endsAt);

                        return (
                          <tr key={p.id} className="hover:bg-gray-900/30">
                            <td className="px-3 py-2.5 font-medium text-white">
                              #{p.periodIndex}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[11px] text-gray-300">
                              {new Date(p.startsAt).toISOString().substring(11, 16)}{" "}
                              &ndash; {new Date(p.endsAt).toISOString().substring(11, 16)}{" "}
                              UTC
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[11px] text-gray-400">
                              {new Date(p.startsAt).toISOString().substring(11, 16)}{" "}
                              &ndash;{" "}
                              {new Date(new Date(p.startsAt).getTime() + 30 * 60 * 1000)
                                .toISOString()
                                .substring(11, 16)}{" "}
                              UTC
                            </td>
                            <td className="px-3 py-2.5 text-[11px]">
                              <span
                                className={`font-mono ${
                                  p.isStockLocked ? "text-rose-400" : "text-emerald-400"
                                }`}
                              >
                                {new Date(p.configLockAt).toISOString().substring(11, 16)}{" "}
                                UTC
                              </span>{" "}
                              {p.isStockLocked ? "(Locked)" : "(Open)"}
                            </td>
                            <td className="px-3 py-2.5">
                              {p.isStockConfigured && totalStock > 0 ? (
                                <span className="inline-flex items-center gap-1 text-emerald-400">
                                  <CheckCircle2 className="h-3 w-3" />
                                  {totalStock} items ({p.poolItems?.length} traits)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-amber-400">
                                  <AlertCircle className="h-3 w-3" />
                                  Unconfigured
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <Badge
                                variant={
                                  p.status === "ACTIVE"
                                    ? "success"
                                    : p.status === "CONFIGURED"
                                      ? "default"
                                      : p.status === "CANCELLED"
                                        ? "warning"
                                        : "warning"
                                }
                                className="text-[10px]"
                              >
                                {p.status}
                              </Badge>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-[11px]"
                                  onClick={() => handleOpenStockModal(p)}
                                  disabled={!configCheck.allowed}
                                  title={
                                    !configCheck.allowed
                                      ? configCheck.reason
                                      : "Configure trait stock"
                                  }
                                >
                                  <Settings2 className="mr-1 h-3 w-3" />
                                  Configure Stock
                                </Button>

                                {p.status === "CONFIGURED" && (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    className="h-7 bg-emerald-600 text-[11px] text-white hover:bg-emerald-500"
                                    onClick={() => handleActivatePeriod(p.id)}
                                    disabled={!canActivate || activatingPeriodId === p.id}
                                    title={
                                      !canActivate
                                        ? "Period can only be activated when time window arrives and stock is valid"
                                        : "Activate period now"
                                    }
                                  >
                                    <Flame className="mr-1 h-3 w-3" />
                                    {activatingPeriodId === p.id
                                      ? "Activating..."
                                      : "Activate"}
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTION 3: Emergency Close Controls */}
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

      {/* MODAL 1: Create Drop Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-gray-800 bg-[#0f111a] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-emerald-400" />
                <h2 className="text-base font-semibold text-white">Create New Drop</h2>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDrop} className="mt-4 space-y-4">
              {createError && (
                <div className="rounded border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-300">
                  {createError}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">
                  Drop Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. ChimpHood Season 1 Trait Drop"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  required
                  className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">
                  Unique Slug * (lowercase alphanumeric and hyphens)
                </label>
                <input
                  type="text"
                  placeholder="e.g. chimphood-season-1"
                  value={createSlug}
                  onChange={(e) => setCreateSlug(e.target.value)}
                  required
                  className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-400">
                    Starts At (UTC) *
                  </label>
                  <input
                    type="datetime-local"
                    value={createStartsAt}
                    onChange={(e) => setCreateStartsAt(e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="mt-1 block text-[10px] text-gray-500">
                    Must align to 2h UTC cycle (00:00, 02:00, etc.)
                  </span>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-400">
                    Ends At (UTC) *
                  </label>
                  <input
                    type="datetime-local"
                    value={createEndsAt}
                    onChange={(e) => setCreateEndsAt(e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional description of the drop campaign..."
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">
                  Initial Status
                </label>
                <select
                  value={createStatus}
                  onChange={(e) => setCreateStatus(e.target.value)}
                  className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="DRAFT">DRAFT</option>
                  <option value="SCHEDULED">SCHEDULED</option>
                  <option value="ACTIVE">ACTIVE</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="auto-gen"
                  checked={autoGeneratePeriods}
                  onChange={(e) => setAutoGeneratePeriods(e.target.checked)}
                  className="rounded border-gray-700 bg-gray-900 text-emerald-500 focus:ring-0"
                />
                <label htmlFor="auto-gen" className="text-xs text-gray-300">
                  Auto-generate 2-Hour UTC Periods across timeline
                </label>
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-800 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateModal(false)}
                  disabled={creatingDrop}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-500"
                  disabled={creatingDrop}
                >
                  {creatingDrop ? "Creating..." : "Create Drop"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Configure Stock per Trait Modal */}
      {configuringPeriod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-xl border border-gray-800 bg-[#0f111a] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-emerald-400" />
                  <h2 className="text-base font-semibold text-white">
                    Configure Trait Pool Stock &ndash; Period #
                    {configuringPeriod.periodIndex}
                  </h2>
                </div>
                <p className="mt-0.5 text-xs text-gray-400">
                  Window:{" "}
                  {new Date(configuringPeriod.startsAt).toISOString().substring(11, 16)}{" "}
                  &ndash;{" "}
                  {new Date(configuringPeriod.endsAt).toISOString().substring(11, 16)} UTC
                  | Freeze Deadline:{" "}
                  <span className="font-mono text-amber-300">
                    {new Date(configuringPeriod.configLockAt)
                      .toISOString()
                      .substring(11, 16)}{" "}
                    UTC
                  </span>
                </p>
              </div>
              <button
                onClick={() => setConfiguringPeriod(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Protocol Rules Reminder */}
            <div className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/10 p-2.5 text-[11px] text-amber-200/90">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-amber-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                Drop Protocol Rules
              </div>
              <ul className="list-disc space-y-0.5 pl-4 text-[11px]">
                <li>Stock must be set at least 15 minutes before period start.</li>
                <li>Stock cannot be modified after period starts.</li>
                <li>Equal probability (weight 100) applied by default across traits.</li>
              </ul>
            </div>

            <form onSubmit={handleSaveStock} className="mt-4 space-y-4">
              {stockError && (
                <div className="rounded border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-300">
                  {stockError}
                </div>
              )}

              {stockSuccess && (
                <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-300">
                  {stockSuccess}
                </div>
              )}

              {/* Add Trait Row */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedTraitToAdd}
                  onChange={(e) => setSelectedTraitToAdd(e.target.value)}
                  className="flex-1 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">-- Select Trait to Allocate --</option>
                  {traits
                    .filter((t) => !stockItems.some((si) => si.traitId === t.id))
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.category} &bull; {t.rarity})
                      </option>
                    ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddTraitToStock}
                  disabled={!selectedTraitToAdd}
                  className="gap-1 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Trait
                </Button>
              </div>

              {/* Trait Allocations List */}
              <div className="max-h-60 overflow-y-auto rounded-lg border border-gray-800">
                <table className="w-full text-left text-xs text-gray-300">
                  <thead className="sticky top-0 border-b border-gray-800 bg-gray-900/60 text-[11px] text-gray-400">
                    <tr>
                      <th className="px-3 py-2">Trait Name</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Allocated Stock</th>
                      <th className="px-3 py-2">RNG Weight</th>
                      <th className="px-3 py-2">Probability</th>
                      <th className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {stockItems.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-6 text-center text-xs text-gray-500"
                        >
                          No traits added to pool yet. Select a trait above and click
                          &quot;Add Trait&quot;.
                        </td>
                      </tr>
                    ) : (
                      stockItems.map((item) => {
                        const traitMeta = traits.find((t) => t.id === item.traitId);
                        const weight = item.weight || 100;
                        const probability =
                          totalModalWeight > 0
                            ? ((weight / totalModalWeight) * 100).toFixed(1)
                            : "0.0";

                        return (
                          <tr key={item.traitId} className="hover:bg-gray-900/30">
                            <td className="px-3 py-2 font-medium text-white">
                              {traitMeta?.name ?? item.traitId}
                            </td>
                            <td className="px-3 py-2 text-gray-400">
                              <Badge variant="outline" className="text-[10px]">
                                {traitMeta?.category ?? "UNKNOWN"}
                              </Badge>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={item.stock}
                                onChange={(e) =>
                                  handleUpdateStockItem(
                                    item.traitId,
                                    "stock",
                                    parseInt(e.target.value, 10) || 0,
                                  )
                                }
                                className="w-20 rounded border border-gray-700 bg-gray-900 px-2 py-1 font-mono text-xs text-white focus:border-emerald-500 focus:outline-none"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={item.weight ?? 100}
                                onChange={(e) =>
                                  handleUpdateStockItem(
                                    item.traitId,
                                    "weight",
                                    parseInt(e.target.value, 10) || 100,
                                  )
                                }
                                className="w-16 rounded border border-gray-700 bg-gray-900 px-2 py-1 font-mono text-xs text-white focus:border-emerald-500 focus:outline-none"
                              />
                            </td>
                            <td className="px-3 py-2 font-mono text-gray-300">
                              {probability}%
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoveTraitFromStock(item.traitId)}
                                className="text-gray-400 hover:text-rose-400"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pool Total Summary */}
              <div className="flex items-center justify-between pt-1 text-xs text-gray-400">
                <span>
                  Total Traits:{" "}
                  <strong className="text-white">{stockItems.length}</strong>
                </span>
                <span>
                  Total Stock Allocated:{" "}
                  <strong className="text-emerald-400">{totalModalStock} items</strong>
                </span>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 border-t border-gray-800 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfiguringPeriod(null)}
                  disabled={savingStock}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-500"
                  disabled={
                    savingStock || stockItems.length === 0 || totalModalStock <= 0
                  }
                >
                  {savingStock ? "Saving Stock..." : "Save Stock Configuration"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
