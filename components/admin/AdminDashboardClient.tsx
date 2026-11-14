"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AdminSidebar, type AdminTab, ADMIN_NAV_ITEMS } from "./AdminSidebar";
import { AdminOverview } from "./AdminOverview";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ElychimpSpinner } from "@/components/ui/ElychimpSpinner";
import { adminListEvidence } from "@/lib/admin/client";

function AdminTabFallback() {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-[#163B44] bg-[#071F24]/60 p-8 backdrop-blur-md">
      <ElychimpSpinner size="md" />
      <span className="mt-3 font-mono text-xs font-bold uppercase tracking-wider text-[#34B7DD]">
        Loading Section...
      </span>
    </div>
  );
}

// Code-split heavy sub-panels to dramatically optimize initial admin bundle size
const AdminEvidenceReview = dynamic(
  () => import("./AdminEvidenceReview").then((m) => m.AdminEvidenceReview),
  { loading: AdminTabFallback }
);
const AdminCampaigns = dynamic(
  () => import("./AdminCampaigns").then((m) => m.AdminCampaigns),
  { loading: AdminTabFallback }
);
const AdminWhitelist = dynamic(
  () => import("./AdminWhitelist").then((m) => m.AdminWhitelist),
  { loading: AdminTabFallback }
);
const AdminUsersBans = dynamic(
  () => import("./AdminUsersBans").then((m) => m.AdminUsersBans),
  { loading: AdminTabFallback }
);
const AdminAbuseFlags = dynamic(
  () => import("./AdminAbuseFlags").then((m) => m.AdminAbuseFlags),
  { loading: AdminTabFallback }
);
const AdminDrops = dynamic(
  () => import("./AdminDrops").then((m) => m.AdminDrops),
  { loading: AdminTabFallback }
);
const AdminTraits = dynamic(
  () => import("./AdminTraits").then((m) => m.AdminTraits),
  { loading: AdminTabFallback }
);
const AdminAuditLog = dynamic(
  () => import("./AdminAuditLog").then((m) => m.AdminAuditLog),
  { loading: AdminTabFallback }
);

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
  const [pendingEvidenceCount, setPendingEvidenceCount] = useState<number>(0);

  useEffect(() => {
    adminListEvidence({ status: "PENDING_REVIEW", limit: 1 })
      .then((res) => {
        setPendingEvidenceCount(res.total ?? res.submissions?.length ?? 0);
      })
      .catch(() => {});
  }, []);

  const { roleType, permissions } = adminSession.adminRole;
  const isSuperAdmin = roleType === "SUPER_ADMIN";
  const hasWildcard = permissions.includes("*");

  function hasPerm(required?: string): boolean {
    if (!required) return true;
    if (isSuperAdmin || hasWildcard) return true;
    return permissions.includes(required);
  }

  const currentNav = ADMIN_NAV_ITEMS.find((item) => item.id === activeTab);
  const isAllowed = currentNav?.superAdminOnly
    ? isSuperAdmin
    : hasPerm(currentNav?.requiredPermission);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-[#04181C] lg:flex-row">
      {/* Sidebar Navigation */}
      <AdminSidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        roleType={roleType}
        address={adminSession.address}
        permissions={permissions}
        pendingEvidenceCount={pendingEvidenceCount}
        mobileOpen={mobileOpen}
        onToggleMobile={() => setMobileOpen(!mobileOpen)}
      />

      {/* Main Content Pane */}
      <main className="flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Top Breadcrumb & Actions Bar */}
          <div className="flex flex-col gap-2 border-b border-[#163B44] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Link href="/" className="transition-colors hover:text-amber-400 font-bold">
                Elychimp
              </Link>
              <span>/</span>
              <span className="text-gray-300">Admin</span>
              <span>/</span>
              <span className="font-semibold text-amber-400">
                {currentNav?.label ?? "Overview"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Link href="/whitelist">
                <Button variant="ghost" size="sm" className="text-xs text-gray-300 hover:text-white">
                  Public Portal
                </Button>
              </Link>
              <Link href="/">
                <Button variant="outline" size="sm" className="text-xs border-[#163B44] bg-[#0B2026] text-gray-300 hover:border-amber-400 hover:text-white">
                  Site Home
                </Button>
              </Link>
            </div>
          </div>

          {/* Permission Restricted View (if user lacks specific role grant) */}
          {!isAllowed ? (
            <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-6 text-center">
              <div className="mx-auto mb-2 font-mono text-xs uppercase tracking-widest text-amber-400 font-bold">
                Access Restricted
              </div>
              <h2 className="text-lg font-bold text-white">
                {currentNav?.superAdminOnly
                  ? "Access Restricted: SUPER_ADMIN Role Required"
                  : `Permission Required: ${currentNav?.requiredPermission}`}
              </h2>
              <p className="mx-auto max-w-md text-xs leading-relaxed text-amber-200/90">
                {currentNav?.superAdminOnly
                  ? `Your role (${roleType}) does not have access to this section. Only SUPER_ADMIN accounts are authorized to view Audit Logs.`
                  : `Your role (${roleType}) does not possess the "${currentNav?.requiredPermission}" permission needed to execute operations in this section. Contact a SUPER_ADMIN to request elevated permissions.`}
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
              {activeTab === "abuse-flags" && <AdminAbuseFlags />}
              {activeTab === "drops" && <AdminDrops />}
              {activeTab === "traits" && <AdminTraits />}
              {activeTab === "audit-log" && <AdminAuditLog />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
