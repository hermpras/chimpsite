"use client";

import React from "react";
import { Badge } from "@/components/ui/Badge";

export type AdminTab =
  | "overview"
  | "evidence"
  | "campaigns"
  | "whitelist"
  | "users-bans"
  | "abuse-flags"
  | "drops"
  | "traits"
  | "audit-log";

export interface NavItem {
  id: AdminTab;
  label: string;
  requiredPermission?: string;
  superAdminOnly?: boolean;
}

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview" },
  {
    id: "evidence",
    label: "Evidence Review",
    requiredPermission: "REVIEW_EVIDENCE",
  },
  {
    id: "campaigns",
    label: "Campaigns",
    requiredPermission: "MANAGE_CAMPAIGNS",
  },
  {
    id: "whitelist",
    label: "Whitelist",
    requiredPermission: "MANAGE_WL",
  },
  {
    id: "users-bans",
    label: "Users & Bans",
    requiredPermission: "MANAGE_BANS",
  },
  {
    id: "abuse-flags",
    label: "Abuse Flags",
    requiredPermission: "REVIEW_FLAGS",
  },
  {
    id: "drops",
    label: "Drops",
    requiredPermission: "MANAGE_DROPS",
  },
  {
    id: "traits",
    label: "Trait Manager",
    requiredPermission: "MANAGE_DROPS",
  },
  {
    id: "audit-log",
    label: "Audit Log",
    superAdminOnly: true,
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

  const navSections = [
    {
      title: "Operations",
      items: ADMIN_NAV_ITEMS.filter((item) =>
        ["overview", "evidence", "campaigns", "whitelist"].includes(item.id)
      ),
    },
    {
      title: "Ecosystem",
      items: ADMIN_NAV_ITEMS.filter((item) =>
        ["users-bans", "abuse-flags", "drops", "traits"].includes(item.id)
      ),
    },
    ...(isSuperAdmin
      ? [
          {
            title: "Governance",
            items: ADMIN_NAV_ITEMS.filter((item) => item.id === "audit-log"),
          },
        ]
      : []),
  ];

  const renderNavLinks = () => (
    <nav className="space-y-4 px-3 py-3">
      {navSections.map((section) => (
        <div key={section.title} className="space-y-1">
          <div className="px-3 pt-2 pb-1 text-xs font-mono font-bold uppercase tracking-wider text-[#34B7DD]/60">
            {section.title}
          </div>
          {section.items.map((item) => {
            const isActive = activeTab === item.id;
            const allowed = hasPerm(item.requiredPermission);

            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id);
                  if (mobileOpen) onToggleMobile();
                }}
                className={`relative group flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-amber-400/15 via-amber-400/5 to-transparent border border-amber-400/35 text-white font-semibold shadow-sm"
                    : "text-gray-400 hover:text-white hover:bg-[#102B33]/50 border border-transparent"
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 shadow-[0_0_10px_rgba(251,191,36,0.6)]" />
                )}
                <div className="flex items-center">
                  <span>{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {item.id === "evidence" && pendingEvidenceCount > 0 && (
                    <span className="rounded-full border border-amber-400/40 bg-amber-400/20 px-2 py-0.5 text-xs font-mono font-bold text-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.25)]">
                      {pendingEvidenceCount}
                    </span>
                  )}
                  {!allowed && (
                    <span
                      title="Permission restricted"
                      className="rounded border border-[#163B44] bg-[#04181C] px-2 py-0.5 text-xs font-mono font-medium text-gray-500"
                    >
                      Locked
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="flex items-center justify-between border-b border-[#163B44] bg-[#06181C] px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2.5">
          <span className="font-display text-lg font-black uppercase tracking-wider text-white">
            ELY<span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500">CHIMP</span>
          </span>
          <span className="rounded-md border border-amber-500/40 bg-amber-400/10 px-2 py-0.5 text-xs font-mono font-bold tracking-wider text-amber-300">
            ADMIN
          </span>
        </div>
        <button
          onClick={onToggleMobile}
          className="rounded px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-gray-300 hover:bg-[#102B33] hover:text-white border border-[#163B44]"
          aria-label="Toggle admin sidebar"
        >
          {mobileOpen ? "Close" : "Menu"}
        </button>
      </div>

      {/* Mobile Backdrop & Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-md"
            onClick={onToggleMobile}
          />
          <div className="fixed inset-y-0 left-0 w-72 border-r border-[#163B44]/80 bg-gradient-to-b from-[#06181C] via-[#082026] to-[#041418] shadow-2xl flex flex-col justify-between">
            <div>
              <div className="flex h-16 items-center justify-between border-b border-[#163B44]/80 px-4">
                <div className="flex items-center gap-2.5">
                  <span className="font-display font-bold text-white uppercase tracking-wider">
                    ELY<span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500">CHIMP</span> Admin
                  </span>
                  <Badge variant={isSuperAdmin ? "default" : "warning"} className="text-xs font-mono">
                    {roleType}
                  </Badge>
                </div>
                <button
                  onClick={onToggleMobile}
                  className="rounded-lg border border-[#163B44] bg-[#04181C] px-2.5 py-1 text-xs font-mono font-bold text-gray-400 hover:text-white"
                >
                  Close
                </button>
              </div>
              <div className="overflow-y-auto max-h-[calc(100vh-10rem)]">
                {renderNavLinks()}
              </div>
            </div>

            <div className="border-t border-[#163B44]/80 p-3.5">
              <div className="rounded-xl border border-[#163B44] bg-gradient-to-b from-[#08232A]/90 to-[#04181C]/95 p-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-white">{shortAddress}</span>
                  <span className="font-mono text-xs text-emerald-400">Elysium</span>
                </div>
                <p className="mt-1 text-xs text-gray-400 font-mono">Role: {roleType}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Persistent Sidebar */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-[#163B44]/80 bg-gradient-to-b from-[#06181C] via-[#082026] to-[#041418] backdrop-blur-2xl shadow-2xl lg:block relative">
        {/* Subtle Ambient Radial Glow */}
        <div className="absolute top-0 left-0 right-0 h-36 bg-gradient-to-b from-[#34B7DD]/5 via-transparent to-transparent pointer-events-none" />

        <div className="flex h-full flex-col justify-between relative">
          <div>
            {/* Header Branding */}
            <div className="border-b border-[#163B44]/80 px-5 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="font-display text-xl font-black uppercase tracking-wider text-white">
                    ELY<span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500">CHIMP</span>
                  </span>
                  <span className="rounded-md border border-amber-500/40 bg-amber-400/10 px-2 py-0.5 text-xs font-mono font-bold tracking-wider text-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.15)]">
                    ADMIN
                  </span>
                </div>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs font-mono tracking-widest text-[#34B7DD]/70 uppercase">
                <span>Elysium Protocol</span>
                <span className="text-gray-500 font-semibold text-xs">v2.4</span>
              </div>
            </div>

            {/* Navigation links grouped by sections */}
            {renderNavLinks()}
          </div>

          {/* Luxury Operator HUD Card Footer */}
          <div className="border-t border-[#163B44]/80 p-3.5">
            <div className="rounded-xl border border-[#163B44] bg-gradient-to-b from-[#08232A]/90 to-[#04181C]/95 p-3.5 shadow-xl shadow-black/30 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-white tracking-wider">
                  {shortAddress}
                </span>
                <Badge variant={isSuperAdmin ? "default" : "warning"} className="text-xs font-bold font-mono">
                  {roleType}
                </Badge>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1 border-t border-[#163B44]/60 pt-2">
                {permissions.slice(0, 3).map((perm) => (
                  <span
                    key={perm}
                    className="rounded border border-[#163B44] bg-[#04181C] px-1.5 py-0.5 text-xs text-[#34B7DD] font-mono font-medium"
                  >
                    {perm}
                  </span>
                ))}
                {permissions.length > 3 && (
                  <span className="rounded border border-[#163B44] bg-[#04181C] px-1.5 py-0.5 text-xs text-gray-400 font-mono">
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
