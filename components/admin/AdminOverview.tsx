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
import { adminListEvidence, adminListCampaigns } from "@/lib/admin/client";
import { fetchCurrentDrop, type CurrentDropResponse } from "@/lib/drops/client";
import type { AdminTab } from "./AdminSidebar";

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
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const loadMetrics = async () => {
      // 1. Pending evidence count
      try {
        const ev = await adminListEvidence({ status: "PENDING_REVIEW", limit: 1 });
        if (isMounted) setPendingEvidenceCount(ev.total ?? 0);
      } catch {
        if (isMounted) setPendingEvidenceCount(null);
      }

      // 2. Campaigns count
      try {
        const camps = await adminListCampaigns();
        if (isMounted) setCampaignsCount(camps.total ?? camps.campaigns?.length ?? 0);
      } catch {
        if (isMounted) setCampaignsCount(null);
      }

      // 3. Current drop
      try {
        const drop = await fetchCurrentDrop();
        if (isMounted) setDropData(drop);
      } catch {
        if (isMounted) setDropData(null);
      }

      if (isMounted) setLoading(false);
    };

    loadMetrics();

    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  return (
    <div className="space-y-8">
      {/* Top Banner / Role Summary */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Admin Overview
            </h1>
            <Badge variant={roleType === "SUPER_ADMIN" ? "default" : "warning"}>
              {roleType}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-gray-400">
            Operations control center for Whitelist programs, campaigns, evidence reviews,
            bans, and drop allocations.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-2 self-start sm:self-auto"
          onClick={() => {
            setLoading(true);
            setRefreshKey((k) => k + 1);
          }}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh Data
        </Button>
      </div>

      {/* Operator Identity Card */}
      <Card className="border-gray-800 bg-[#0c0e17]/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-gray-200">
            Authenticated Administrator Identity
          </CardTitle>
          <CardDescription className="text-xs text-gray-400">
            Verified server-side via cryptographic SIWE session and database AdminRole
            lookup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-800/80 bg-gray-900/40 p-3">
              <span className="text-xs text-gray-400">Connected Wallet</span>
              <p className="mt-1 truncate font-mono text-sm font-semibold text-emerald-400">
                {address || "Not connected"}
              </p>
            </div>
            <div className="rounded-lg border border-gray-800/80 bg-gray-900/40 p-3">
              <span className="text-xs text-gray-400">User Identifier</span>
              <p className="mt-1 truncate font-mono text-xs text-gray-300">{userId}</p>
            </div>
            <div className="rounded-lg border border-gray-800/80 bg-gray-900/40 p-3">
              <span className="text-xs text-gray-400">Assigned Role & Level</span>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-semibold text-white">{roleType}</span>
                <Badge variant="outline">
                  {permissions.includes("*")
                    ? "All Permissions (*)"
                    : `${permissions.length} Grants`}
                </Badge>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-gray-800/60 pt-3">
            <span className="mr-1 text-xs font-medium text-gray-400">Active Grants:</span>
            {permissions.length === 0 ? (
              <span className="text-xs text-gray-500">None assigned</span>
            ) : (
              permissions.map((p) => (
                <span
                  key={p}
                  className="rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-400"
                >
                  {p}
                </span>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Module Quick Metric Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {/* Evidence Card */}
        <Card className="border-gray-800 bg-[#0c0e17]/80 transition-colors hover:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-300">
              Evidence Reviews
            </CardTitle>
            <FileCheck2 className="h-5 w-5 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {pendingEvidenceCount !== null ? pendingEvidenceCount : "-"}
            </div>
            <p className="mt-1 text-xs text-amber-300/90">
              Submissions awaiting moderator review
            </p>
            <div className="mt-4 border-t border-gray-800/80 pt-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 text-xs"
                onClick={() => onNavigateTab("evidence")}
              >
                Review Submissions <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Campaigns Card */}
        <Card className="border-gray-800 bg-[#0c0e17]/80 transition-colors hover:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-300">
              Campaigns & Quests
            </CardTitle>
            <Sparkles className="h-5 w-5 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {campaignsCount !== null ? campaignsCount : "-"}
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Promo campaigns registered in system
            </p>
            <div className="mt-4 border-t border-gray-800/80 pt-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 text-xs"
                onClick={() => onNavigateTab("campaigns")}
              >
                Manage Campaigns <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Drops Card */}
        <Card className="border-gray-800 bg-[#0c0e17]/80 transition-colors hover:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-300">
              Drop System Status
            </CardTitle>
            <Flame className="h-5 w-5 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-white">
                {dropData?.active ? "Active" : "Closed"}
              </span>
              <Badge variant={dropData?.active ? "success" : "warning"}>
                {dropData?.period ? `Period #${dropData.period.periodIndex}` : "Idle"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {dropData?.stock
                ? `${dropData.stock.totalRemaining} of ${dropData.stock.totalAllocated} traits available`
                : "No active claiming period"}
            </p>
            <div className="mt-4 border-t border-gray-800/80 pt-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 text-xs"
                onClick={() => onNavigateTab("drops")}
              >
                Inspect Drops & Emergency <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Action Navigation Grid */}
      <div>
        <h2 className="mb-4 text-lg font-bold text-white">Operations Modules</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div
            onClick={() => onNavigateTab("evidence")}
            className="group cursor-pointer rounded-lg border border-gray-800 bg-[#0c0e17] p-5 transition-all hover:border-emerald-500/40 hover:bg-gray-900/30"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileCheck2 className="h-5 w-5 text-amber-400" />
                <span className="font-semibold text-white transition-colors group-hover:text-emerald-400">
                  Evidence Review
                </span>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-500 transition-colors group-hover:text-emerald-400" />
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Review and approve or reject proof of work submitted by community members
              for quest points.
            </p>
          </div>

          <div
            onClick={() => onNavigateTab("campaigns")}
            className="group cursor-pointer rounded-lg border border-gray-800 bg-[#0c0e17] p-5 transition-all hover:border-emerald-500/40 hover:bg-gray-900/30"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-emerald-400" />
                <span className="font-semibold text-white transition-colors group-hover:text-emerald-400">
                  Campaigns
                </span>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-500 transition-colors group-hover:text-emerald-400" />
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Create campaigns, transition campaign lifecycle (draft, active, paused), and
              inspect version tasks.
            </p>
          </div>

          <div
            onClick={() => onNavigateTab("whitelist")}
            className="group cursor-pointer rounded-lg border border-gray-800 bg-[#0c0e17] p-5 transition-all hover:border-emerald-500/40 hover:bg-gray-900/30"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-teal-400" />
                <span className="font-semibold text-white transition-colors group-hover:text-emerald-400">
                  Whitelist
                </span>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-500 transition-colors group-hover:text-emerald-400" />
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Trigger FIFO queue reconciliation, revoke allocated slots, and query address
              whitelist qualification.
            </p>
          </div>

          <div
            onClick={() => onNavigateTab("users-bans")}
            className="group cursor-pointer rounded-lg border border-gray-800 bg-[#0c0e17] p-5 transition-all hover:border-emerald-500/40 hover:bg-gray-900/30"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-rose-400" />
                <span className="font-semibold text-white transition-colors group-hover:text-emerald-400">
                  Users & Bans
                </span>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-500 transition-colors group-hover:text-emerald-400" />
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Enforce targeted account bans across scopes (Full, Claim, Gift, WL) or
              revoke existing ban penalties.
            </p>
          </div>

          <div
            onClick={() => onNavigateTab("drops")}
            className="group cursor-pointer rounded-lg border border-gray-800 bg-[#0c0e17] p-5 transition-all hover:border-emerald-500/40 hover:bg-gray-900/30"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Flame className="h-5 w-5 text-orange-400" />
                <span className="font-semibold text-white transition-colors group-hover:text-emerald-400">
                  Drops
                </span>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-500 transition-colors group-hover:text-emerald-400" />
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Monitor active trait drop windows and execute emergency close procedures
              when required.
            </p>
          </div>

          <div
            onClick={() => onNavigateTab("abuse-flags")}
            className="group cursor-pointer rounded-lg border border-gray-800 bg-[#0c0e17] p-5 transition-all hover:border-emerald-500/40 hover:bg-gray-900/30"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldAlert className="h-5 w-5 text-rose-400" />
                <span className="font-semibold text-white transition-colors group-hover:text-emerald-400">
                  Abuse Flags
                </span>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-500 transition-colors group-hover:text-emerald-400" />
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Review flagged Sybil clusters, bot activities, and manage abuse investigation
              statuses.
            </p>
          </div>
        </div>
      </div>

      {/* Backend Availability Notice */}
      <PlaceholderNotice
        title="Global Analytics Aggregator"
        description="Cross-module metrics aggregation and historical timeseries charts are not yet implemented in backend. Real-time data displayed above is loaded directly from live module APIs."
        phase="Upcoming Extension"
      />
    </div>
  );
}
