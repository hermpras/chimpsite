"use client";

import React from "react";
import {
  LayoutDashboard,
  FileCheck2,
  Flame,
  ShieldAlert,
  Users,
  Sparkles,
  Shield,
  X,
  Menu,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";

export type AdminTab =
  "overview" | "evidence" | "campaigns" | "whitelist" | "users-bans" | "drops";

export interface NavItem {
  id: AdminTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredPermission?: string;
}

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  {
    id: "evidence",
    label: "Evidence Review",
    icon: FileCheck2,
    requiredPermission: "REVIEW_EVIDENCE",
  },
  {
    id: "campaigns",
    label: "Campaigns",
    icon: Sparkles,
    requiredPermission: "MANAGE_CAMPAIGNS",
  },
  {
    id: "whitelist",
    label: "Whitelist",
    icon: Shield,
    requiredPermission: "MANAGE_WL",
  },
  {
    id: "users-bans",
    label: "Users & Bans",
    icon: Users,
    requiredPermission: "MANAGE_BANS",
  },
  {
    id: "drops",
    label: "Drops",
    icon: Flame,
    requiredPermission: "MANAGE_DROPS",
  },
];

interface AdminSidebarProps {
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  roleType: string;
  address: string;
  permissions: string[];
  pendingEvidenceCount?: number;
  mobileOpen: boolean;
  onToggleMobile: () => void;
}

export function AdminSidebar({
  activeTab,
  onSelectTab,
  roleType,
  address,
  permissions,
  pendingEvidenceCount = 0,
  mobileOpen,
  onToggleMobile,
}: AdminSidebarProps) {
  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "0xUnknown";

  const isSuperAdmin = roleType === "SUPER_ADMIN";
  const hasWildcard = permissions.includes("*");

  function hasPerm(required?: string): boolean {
    if (!required) return true;
    if (isSuperAdmin || hasWildcard) return true;
    return permissions.includes(required);
  }

  const renderNavLinks = () => (
    <nav className="space-y-1 px-3 py-4">
      {ADMIN_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        const allowed = hasPerm(item.requiredPermission);

        return (
          <button
            key={item.id}
            onClick={() => {
              onSelectTab(item.id);
              if (mobileOpen) onToggleMobile();
            }}
            className={`group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                : "text-gray-300 hover:bg-gray-800/60 hover:text-white"
            }`}
          >
            <div className="flex items-center gap-3">
              <Icon
                className={`h-5 w-5 transition-colors ${
                  isActive
                    ? "text-emerald-400"
                    : "text-gray-400 group-hover:text-gray-200"
                }`}
              />
              <span>{item.label}</span>
            </div>

            <div className="flex items-center gap-1.5">
              {item.id === "evidence" && pendingEvidenceCount > 0 && (
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
                  {pendingEvidenceCount}
                </span>
              )}
              {!allowed && (
                <span
                  title="Permission restricted"
                  className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-500"
                >
                  Locked
                </span>
              )}
            </div>
          </button>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="flex items-center justify-between border-b border-gray-800 bg-[#0c0e17] px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <span className="text-lg font-black tracking-tight text-emerald-400">
            CHIMP<span className="text-white">HOOD</span>
          </span>
          <Badge variant="warning" className="text-[10px]">
            ADMIN
          </Badge>
        </div>
        <button
          onClick={onToggleMobile}
          className="rounded p-1.5 text-gray-300 hover:bg-gray-800 hover:text-white"
          aria-label="Toggle admin sidebar"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile Backdrop & Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onToggleMobile}
          />
          <div className="fixed inset-y-0 left-0 w-72 border-r border-gray-800 bg-[#0c0e17] shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-gray-800 px-4">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">ChimpHood Admin</span>
                <Badge variant="default">{roleType}</Badge>
              </div>
              <button onClick={onToggleMobile} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            {renderNavLinks()}
            <div className="border-t border-gray-800 p-4 text-xs text-gray-400">
              <p className="font-semibold text-gray-300">{shortAddress}</p>
              <p className="mt-1 text-[11px] text-gray-500">Role: {roleType}</p>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Persistent Sidebar */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-gray-800 bg-[#0c0e17]/80 backdrop-blur lg:block">
        <div className="flex h-full flex-col justify-between">
          <div>
            {/* Header branding */}
            <div className="border-b border-gray-800 px-6 py-5">
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight text-emerald-400">
                  CHIMP<span className="text-white">HOOD</span>
                </span>
                <Badge variant="warning" className="text-[10px]">
                  ADMIN
                </Badge>
              </div>
              <p className="mt-1 text-xs text-gray-400">Administration & Operations</p>
            </div>

            {/* Navigation links */}
            {renderNavLinks()}
          </div>

          {/* Admin user info footer */}
          <div className="border-t border-gray-800 p-4">
            <div className="rounded-lg border border-gray-800/80 bg-gray-900/40 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-300">
                  {shortAddress}
                </span>
                <Badge variant={isSuperAdmin ? "default" : "warning"}>{roleType}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {permissions.slice(0, 3).map((perm) => (
                  <span
                    key={perm}
                    className="rounded bg-gray-800 px-1.5 py-0.5 text-[9px] text-gray-400"
                  >
                    {perm}
                  </span>
                ))}
                {permissions.length > 3 && (
                  <span className="rounded bg-gray-800 px-1 py-0.5 text-[9px] text-gray-500">
                    +{permissions.length - 3}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
