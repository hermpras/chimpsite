"use client";

import React, { useEffect, useState } from "react";
import {
  FileCheck2,
  Sparkles,
  Shield,
  Users,
  Flame,
  ShieldAlert,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Terminal,
  Activity,
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
import {
  adminListEvidence,
  adminListCampaigns,
  adminListWLPrograms,
  adminListAbuseFlags,
  type AdminWLProgramRecord,
} from "@/lib/admin/client";
import { fetchCurrentDrop, type CurrentDropResponse } from "@/lib/drops/client";
import type { AdminTab } from "./AdminSidebar";
import { shortenAddress } from "@/lib/auth/address";

interface AdminOverviewProps {
  roleType: string;
  address: string;
  userId: string;
  permissions: string[];
  onNavigateTab: (tab: AdminTab) => void;
}

export function AdminOverview({
  roleType,
  address,
  userId,
  permissions,
  onNavigateTab,
}: AdminOverviewProps) {
  const [loading, setLoading] = useState(true);
  const [pendingEvidenceCount, setPendingEvidenceCount] = useState<number | null>(null);
  const [campaignsCount, setCampaignsCount] = useState<number | null>(null);
  const [dropData, setDropData] = useState<CurrentDropResponse | null>(null);
  const [wlProgram, setWlProgram] = useState<AdminWLProgramRecord | null>(null);
  const [openFlagsCount, setOpenFlagsCount] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [copiedWallet, setCopiedWallet] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadMetrics = async () => {
      // Run all metric queries in parallel
      const results = await Promise.allSettled([
        adminListEvidence({ status: "PENDING_REVIEW", limit: 1 }),
        adminListCampaigns(),
        fetchCurrentDrop(),
        adminListWLPrograms({ limit: 1 }),
        adminListAbuseFlags({ status: "OPEN", limit: 1 }),
      ]);

      if (!isMounted) return;

      // 1. Evidence
      if (results[0].status === "fulfilled") {
        setPendingEvidenceCount(results[0].value.total ?? results[0].value.submissions?.length ?? 0);
      } else {
        setPendingEvidenceCount(null);
      }

      // 2. Campaigns
      if (results[1].status === "fulfilled") {
        setCampaignsCount(results[1].value.total ?? results[1].value.campaigns?.length ?? 0);
      } else {
        setCampaignsCount(null);
      }

      // 3. Drop
      if (results[2].status === "fulfilled") {
        setDropData(results[2].value);
      } else {
        setDropData(null);
      }

      // 4. Whitelist Program
      if (results[3].status === "fulfilled") {
        setWlProgram(results[3].value.programs?.[0] || null);
      } else {
        setWlProgram(null);
      }

      // 5. Abuse Flags
      if (results[4].status === "fulfilled") {
        setOpenFlagsCount(results[4].value.total ?? results[4].value.flags?.length ?? 0);
      } else {
        setOpenFlagsCount(null);
      }

      setLoading(false);
    };

    loadMetrics();

    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  const handleCopyWallet = () => {
    if (!address) return;
    if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(address).catch(() => {});
    }
    setCopiedWallet(true);
    setTimeout(() => setCopiedWallet(false), 2000);
  };

  const isSuperAdmin = roleType === "SUPER_ADMIN";
  const allocatedSlots = wlProgram?.slotsCount ?? 0;
  const totalSlots = wlProgram?.totalSlots ?? 1000;
  const fillPercentage = Math.min(100, Math.round((allocatedSlots / (totalSlots || 1)) * 100));

  return (
    <div className="space-y-8">
      {/* Top Banner & Refresh Action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-[#163B44] pb-5">
        <div className="space-y-2">
          {/* Eyebrow status */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wider">
            <span className="inline-flex items-center gap-1.5 border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 font-bold text-amber-300">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
              COMMAND CONSOLE
            </span>
            <span className="border border-[#163B44] bg-[#0B2026] px-2.5 py-0.5 font-bold text-[#34B7DD]">
              Elysium L2
            </span>
            <span className="border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-0.5 font-bold text-emerald-300">
              Real-time Invariant Surveillance
            </span>
          </div>

          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-wider text-white">
              Admin Overview
            </h1>
            <Badge
              variant={isSuperAdmin ? "default" : "warning"}
              className="text-xs font-bold uppercase tracking-wider"
            >
              {roleType}
            </Badge>
          </div>
          <p className="max-w-2xl text-xs sm:text-sm text-gray-400">
            Operations control center for Whitelist programs, campaigns, evidence reviews, bans, and drop allocations.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="border-2 border-[#163B44] bg-[#0B2026] text-xs text-gray-300 hover:border-amber-400 hover:text-white transition-colors"
            onClick={() => {
              setLoading(true);
              setRefreshKey((k) => k + 1);
            }}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-amber-400" : ""}`} />
            <span>Refresh Data</span>
          </Button>
        </div>
      </div>

      {/* Operator Identity HUD Ribbon (Compact Tactical Bar) */}
      <div className="rounded-2xl border-2 border-[#163B44] bg-[#0B2026] p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Operator Wallet:</span>
              <button
                onClick={handleCopyWallet}
                className="group flex items-center gap-1.5 rounded-lg border border-[#163B44] bg-[#0B2026] px-2.5 py-1 text-white hover:border-amber-400 transition-colors"
                title="Click to copy full address"
              >
                <span className="font-medium text-amber-300">{shortenAddress(address || "0x0000000000000000000000000000000000000000")}</span>
                {copiedWallet ? (
                  <Check className="h-3 w-3 text-emerald-400" />
                ) : (
                  <Copy className="h-3 w-3 text-gray-500 group-hover:text-amber-400" />
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-gray-400">User ID:</span>
              <span className="font-mono text-gray-300 bg-[#0B2026] px-2 py-0.5 rounded border border-[#163B44] text-[11px]">
                {userId}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-gray-400">Grants:</span>
              <Badge variant="outline" className="text-[10px] font-bold text-cyan-300 border-cyan-500/40 bg-cyan-950/30">
                {permissions.includes("*") ? "All Permissions (*)" : `${permissions.length} Grants`}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 text-xs">
            <span className="inline-flex items-center gap-1.5 border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-1 text-[11px] font-bold text-emerald-300 rounded-lg">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Node: Elysium L2
            </span>
          </div>
        </div>

        {/* Active grants pill row */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[#163B44] pt-3">
          <span className="text-[10px] uppercase font-bold text-gray-500 mr-1">
            Active Grants:
          </span>
          {permissions.length === 0 ? (
            <span className="text-[10px] text-gray-500">None assigned</span>
          ) : (
            permissions.map((p) => (
              <span
                key={p}
                className="rounded border border-[#163B44] bg-[#04181C] px-2 py-0.5 text-[10px] text-gray-300"
              >
                {p}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Module Quick Metric Cards — The "Sekali Lihat Langsung Paham" HUD */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Evidence Card */}
        <Card className="border-2 border-[#163B44] bg-[#0B2026] transition-all hover:border-amber-400/60 shadow-sm flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                Action Queue
              </span>
              <CardTitle className="font-display text-lg uppercase tracking-wider text-white">
                Evidence Reviews
              </CardTitle>
            </div>
            <div className="flex h-10 w-10 items-center justify-center border border-amber-400/40 bg-amber-400/10 text-amber-400 rounded-xl">
              <FileCheck2 className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <div className="font-display text-3xl font-black text-white">
                {pendingEvidenceCount !== null ? pendingEvidenceCount : "-"}
              </div>
              {pendingEvidenceCount !== null && pendingEvidenceCount > 0 ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 border border-amber-500/40 bg-amber-950/40 px-2 py-0.5 rounded-full">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
                  Action Needed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 border border-emerald-500/40 bg-emerald-950/40 px-2 py-0.5 rounded-full">
                  All Caught Up ✓
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Submissions awaiting moderator review
            </p>
            <div className="pt-2 border-t border-[#163B44]">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between text-xs border border-[#163B44] bg-[#0B2026] hover:border-amber-400 hover:text-white"
                onClick={() => onNavigateTab("evidence")}
              >
                <span>Review Submissions</span>
                <ArrowRight className="h-3.5 w-3.5 text-amber-400" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 2. Whitelist Allocation Card */}
        <Card className="border-2 border-[#163B44] bg-[#0B2026] transition-all hover:border-emerald-400/60 shadow-sm flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                Allowlist Quota
              </span>
              <CardTitle className="font-display text-lg uppercase tracking-wider text-white">
                Whitelist Allocation
              </CardTitle>
            </div>
            <div className="flex h-10 w-10 items-center justify-center border border-emerald-400/40 bg-emerald-400/10 text-emerald-400 rounded-xl">
              <Shield className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <div className="font-display text-3xl font-black text-white">
                {allocatedSlots} <span className="text-xs text-gray-500 font-normal">/ {totalSlots}</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-300 border border-emerald-500/40 bg-emerald-950/40 px-2 py-0.5 rounded-full">
                {fillPercentage}% Full
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-[#102B33] h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-400 h-full transition-all duration-500"
                style={{ width: `${fillPercentage}%` }}
              />
            </div>

            <p className="text-xs text-gray-400 leading-relaxed">
              {Math.max(0, totalSlots - allocatedSlots)} GTD slots remaining on Elysium
            </p>
            <div className="pt-2 border-t border-[#163B44]">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between text-xs border border-[#163B44] bg-[#0B2026] hover:border-emerald-400 hover:text-white"
                onClick={() => onNavigateTab("whitelist")}
              >
                <span>Manage Whitelist</span>
                <ArrowRight className="h-3.5 w-3.5 text-emerald-400" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 3. Drops Card */}
        <Card className="border-2 border-[#163B44] bg-[#0B2026] transition-all hover:border-orange-400/60 shadow-sm flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">
                Contraband Engine
              </span>
              <CardTitle className="font-display text-lg uppercase tracking-wider text-white">
                Drop System Status
              </CardTitle>
            </div>
            <div className="flex h-10 w-10 items-center justify-center border border-orange-400/40 bg-orange-400/10 text-orange-400 rounded-xl">
              <Flame className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <div className="font-display text-2xl font-black text-white">
                {dropData?.active ? "Active" : "Closed"}
              </div>
              <Badge variant={dropData?.active ? "success" : "warning"} className="text-[10px]">
                {dropData?.period ? `Period #${dropData.period.periodIndex}` : "Idle"}
              </Badge>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              {dropData?.stock
                ? `${dropData.stock.totalRemaining} of ${dropData.stock.totalAllocated} traits available`
                : "No active claiming period"}
            </p>
            <div className="pt-2 border-t border-[#163B44]">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between text-xs border border-[#163B44] bg-[#0B2026] hover:border-orange-400 hover:text-white"
                onClick={() => onNavigateTab("drops")}
              >
                <span>Inspect Drops &amp; Emergency</span>
                <ArrowRight className="h-3.5 w-3.5 text-orange-400" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 4. Security & Abuse Flags Card */}
        <Card className="border-2 border-[#163B44] bg-[#0B2026] transition-all hover:border-rose-400/60 shadow-sm flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">
                Sybil Surveillance
              </span>
              <CardTitle className="font-display text-lg uppercase tracking-wider text-white">
                Security &amp; Abuse
              </CardTitle>
            </div>
            <div className="flex h-10 w-10 items-center justify-center border border-rose-400/40 bg-rose-400/10 text-rose-400 rounded-xl">
              <ShieldAlert className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <div className="font-display text-3xl font-black text-white">
                {openFlagsCount !== null ? openFlagsCount : "0"}
              </div>
              {openFlagsCount !== null && openFlagsCount > 0 ? (
                <span className="text-[10px] font-bold text-rose-300 border border-rose-500/40 bg-rose-950/40 px-2 py-0.5 rounded-full">
                  Investigate
                </span>
              ) : (
                <span className="text-[10px] font-bold text-emerald-300 border border-emerald-500/40 bg-emerald-950/40 px-2 py-0.5 rounded-full">
                  Shield Nominal ✓
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Open Sybil cluster flags &amp; bot signals
            </p>
            <div className="pt-2 border-t border-[#163B44]">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between text-xs border border-[#163B44] bg-[#0B2026] hover:border-rose-400 hover:text-white"
                onClick={() => onNavigateTab("abuse-flags")}
              >
                <span>Review Abuse Flags</span>
                <ArrowRight className="h-3.5 w-3.5 text-rose-400" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaigns quick status strip */}
      <div className="flex items-center justify-between border-2 border-[#163B44] bg-[#0B2026] p-4 rounded-xl text-xs shadow-sm">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-emerald-400 shrink-0" />
          <div>
            <span className="font-bold text-white uppercase">Campaigns &amp; Quests:</span>
            <span className="ml-2 text-gray-300">
              {campaignsCount !== null ? `${campaignsCount} Promo campaigns registered in system` : "Loading campaigns..."}
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border border-[#163B44] bg-[#0B2026] text-xs text-gray-300 hover:border-emerald-400 hover:text-white"
          onClick={() => onNavigateTab("campaigns")}
        >
          <span>Manage Campaigns</span>
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Quick Action Navigation Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-[#163B44] pb-2">
          <h2 className="font-display text-xl uppercase tracking-wider text-white">
            Operations Modules
          </h2>
          <span className="text-xs text-gray-500 uppercase">
            Click to navigate
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div
            onClick={() => onNavigateTab("evidence")}
            className="group cursor-pointer rounded-xl border-2 border-[#163B44] bg-[#0B2026] p-5 transition-all hover:border-amber-400 hover:shadow-sm hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileCheck2 className="h-5 w-5 text-amber-400" />
                <span className="font-display text-base uppercase tracking-wider text-white group-hover:text-amber-300">
                  Evidence Review
                </span>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-600 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <p className="mt-2 text-xs text-gray-400 leading-relaxed">
              Review and approve or reject proof of work submitted by community members for quest points.
            </p>
          </div>

          <div
            onClick={() => onNavigateTab("campaigns")}
            className="group cursor-pointer rounded-xl border-2 border-[#163B44] bg-[#0B2026] p-5 transition-all hover:border-emerald-400 hover:shadow-sm hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-emerald-400" />
                <span className="font-display text-base uppercase tracking-wider text-white group-hover:text-emerald-300">
                  Campaigns
                </span>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-600 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <p className="mt-2 text-xs text-gray-400 leading-relaxed">
              Create campaigns, transition campaign lifecycle (draft, active, paused), and inspect version tasks.
            </p>
          </div>

          <div
            onClick={() => onNavigateTab("whitelist")}
            className="group cursor-pointer rounded-xl border-2 border-[#163B44] bg-[#0B2026] p-5 transition-all hover:border-cyan-400 hover:shadow-sm hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-cyan-400" />
                <span className="font-display text-base uppercase tracking-wider text-white group-hover:text-cyan-300">
                  Whitelist
                </span>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-600 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <p className="mt-2 text-xs text-gray-400 leading-relaxed">
              Trigger FIFO queue reconciliation, revoke allocated slots, and query address whitelist qualification.
            </p>
          </div>

          <div
            onClick={() => onNavigateTab("users-bans")}
            className="group cursor-pointer rounded-xl border-2 border-[#163B44] bg-[#0B2026] p-5 transition-all hover:border-rose-400 hover:shadow-sm hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-rose-400" />
                <span className="font-display text-base uppercase tracking-wider text-white group-hover:text-rose-300">
                  Users &amp; Bans
                </span>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-600 group-hover:text-rose-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <p className="mt-2 text-xs text-gray-400 leading-relaxed">
              Enforce targeted account bans across scopes (Full, Claim, Gift, WL) or revoke existing ban penalties.
            </p>
          </div>

          <div
            onClick={() => onNavigateTab("drops")}
            className="group cursor-pointer rounded-xl border-2 border-[#163B44] bg-[#0B2026] p-5 transition-all hover:border-orange-400 hover:shadow-sm hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Flame className="h-5 w-5 text-orange-400" />
                <span className="font-display text-base uppercase tracking-wider text-white group-hover:text-orange-300">
                  Drops
                </span>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-600 group-hover:text-orange-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <p className="mt-2 text-xs text-gray-400 leading-relaxed">
              Monitor active trait drop windows and execute emergency close procedures when required.
            </p>
          </div>

          <div
            onClick={() => onNavigateTab("abuse-flags")}
            className="group cursor-pointer rounded-xl border-2 border-[#163B44] bg-[#0B2026] p-5 transition-all hover:border-pink-400 hover:shadow-sm hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldAlert className="h-5 w-5 text-pink-400" />
                <span className="font-display text-base uppercase tracking-wider text-white group-hover:text-pink-300">
                  Abuse Flags
                </span>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-600 group-hover:text-pink-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <p className="mt-2 text-xs text-gray-400 leading-relaxed">
              Review flagged Sybil clusters, bot activities, and manage abuse investigation statuses.
            </p>
          </div>
        </div>
      </div>

      {/* Operational Governance Cheat Sheet (Replaces blank notice) */}
      <div className="rounded-2xl border-2 border-[#163B44] bg-gradient-to-r from-[#0B2026] via-[#102B33] to-[#0B2026] p-5 sm:p-6 shadow-sm space-y-4 text-xs">
        <div className="flex items-center gap-2.5 text-amber-400 border-b border-[#163B44] pb-3">
          <Terminal className="h-5 w-5" />
          <h3 className="font-display text-base uppercase tracking-wider text-white">
            Operational Governance Cheat Sheet
          </h3>
          <span className="ml-auto text-[10px] text-gray-500 uppercase">
            Protocol Ground Truth
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-gray-300">
          <div className="border border-[#163B44] bg-[#04181C] p-3 rounded-xl space-y-1">
            <span className="font-bold text-emerald-400 uppercase">1. GTD Hard Cap</span>
            <p className="text-gray-400 text-[11px] leading-relaxed">
              Strictly 1,000 slots. Concurrency protected by database row locks. Auto-allocated upon meeting 5 requirements.
            </p>
          </div>

          <div className="border border-[#163B44] bg-[#04181C] p-3 rounded-xl space-y-1">
            <span className="font-bold text-amber-400 uppercase">2. Drop Clock Cycle</span>
            <p className="text-gray-400 text-[11px] leading-relaxed">
              2-hour UTC cycles. First 30 minutes open for claims. Strictly 1 claim per period per wallet.
            </p>
          </div>

          <div className="border border-[#163B44] bg-[#04181C] p-3 rounded-xl space-y-1">
            <span className="font-bold text-pink-400 uppercase">3. Gifting Guard</span>
            <p className="text-gray-400 text-[11px] leading-relaxed">
              Sender must retain ≥ 1 trait in category. Equipped avatar traits cannot be transferred.
            </p>
          </div>

          <div className="border border-[#163B44] bg-[#04181C] p-3 rounded-xl space-y-1">
            <span className="font-bold text-rose-400 uppercase">4. Anti-Sybil Policy</span>
            <p className="text-gray-400 text-[11px] leading-relaxed">
              Strict 1:1 EVM to X binding. Slot revocation results in permanent disqualification (DEC-022).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
