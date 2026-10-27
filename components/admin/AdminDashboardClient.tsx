"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AdminSidebar, type AdminTab, ADMIN_NAV_ITEMS } from "./AdminSidebar";
import { AdminOverview } from "./AdminOverview";
import { AdminEvidenceReview } from "./AdminEvidenceReview";
import { AdminCampaigns } from "./AdminCampaigns";
import { AdminWhitelist } from "./AdminWhitelist";
import { AdminUsersBans } from "./AdminUsersBans";
import { AdminDrops } from "./AdminDrops";
import { AdminTraits } from "./AdminTraits";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ShieldAlert, ArrowLeft, ExternalLink } from "lucide-react";

export interface SerializedAdminRole {
  id: string;
  userId: string;
  roleType: string;
  permissions: string[];
  assignedBy?: string | null;
}

export interface SerializedAdminSession {
  sessionId: string;
  userId: string;
  address: string;
  adminRole: SerializedAdminRole;
}

interface AdminDashboardClientProps {
  adminSession: SerializedAdminSession;
}

export function AdminDashboardClient({ adminSession }: AdminDashboardClientProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);

  const { roleType, permissions } = adminSession.adminRole;
  const isSuperAdmin = roleType === "SUPER_ADMIN";
  const hasWildcard = permissions.includes("*");

  function hasPerm(required?: string): boolean {
    if (!required) return true;
    if (isSuperAdmin || hasWildcard) return true;
    return permissions.includes(required);
  }

  const currentNav = ADMIN_NAV_ITEMS.find((item) => item.id === activeTab);
  const isAllowed = hasPerm(currentNav?.requiredPermission);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-[#090a0f] lg:flex-row">
      {/* Sidebar Navigation */}
      <AdminSidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        roleType={roleType}
        address={adminSession.address}
        permissions={permissions}
        mobileOpen={mobileOpen}
        onToggleMobile={() => setMobileOpen(!mobileOpen)}
      />

      {/* Main Content Pane */}
      <main className="flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Top Breadcrumb & Actions Bar */}
          <div className="flex flex-col gap-2 border-b border-gray-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Link href="/" className="transition-colors hover:text-emerald-400">
                ChimpHood
              </Link>
              <span>/</span>
              <span className="text-gray-300">Admin</span>
              <span>/</span>
              <span className="font-semibold text-emerald-400">
                {currentNav?.label ?? "Overview"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Link href="/whitelist">
                <Button variant="ghost" size="sm" className="gap-1 text-xs">
                  Public Portal <ExternalLink className="h-3 w-3" />
                </Button>
              </Link>
              <Link href="/">
                <Button variant="outline" size="sm" className="gap-1 text-xs">
                  <ArrowLeft className="h-3 w-3" /> Home
                </Button>
              </Link>
            </div>
          </div>

          {/* Permission Restricted View (if user lacks specific role grant) */}
          {!isAllowed ? (
            <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-6 text-center">
              <ShieldAlert className="mx-auto h-8 w-8 text-amber-400" />
              <h2 className="text-lg font-bold text-white">
                Permission Required: {currentNav?.requiredPermission}
              </h2>
              <p className="mx-auto max-w-md text-xs leading-relaxed text-amber-200/90">
                Your role ({roleType}) does not possess the &quot;
                {currentNav?.requiredPermission}&quot; permission needed to execute
                operations in this section. Contact a SUPER_ADMIN to request elevated
                permissions.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("overview")}
              >
                Return to Overview
              </Button>
            </div>
          ) : (
            <>
              {activeTab === "overview" && (
                <AdminOverview
                  roleType={roleType}
                  address={adminSession.address}
                  userId={adminSession.userId}
                  permissions={permissions}
                  onNavigateTab={setActiveTab}
                />
              )}
              {activeTab === "evidence" && <AdminEvidenceReview />}
              {activeTab === "campaigns" && <AdminCampaigns />}
              {activeTab === "whitelist" && <AdminWhitelist />}
              {activeTab === "users-bans" && <AdminUsersBans />}
              {activeTab === "drops" && <AdminDrops />}
              {activeTab === "traits" && <AdminTraits />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
