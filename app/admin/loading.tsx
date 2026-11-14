import React from "react";
import { ElychimpSpinner } from "@/components/ui/ElychimpSpinner";

export default function AdminLoading() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-[#04181C] lg:flex-row animate-in fade-in duration-150">
      {/* Sidebar Skeleton (Desktop) */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-[#163B44]/80 bg-gradient-to-b from-[#06181C] via-[#082026] to-[#041418] lg:block">
        <div className="flex h-full flex-col justify-between p-5 space-y-6">
          <div>
            <div className="border-b border-[#163B44]/80 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="font-display text-xl font-black uppercase tracking-wider text-white">
                  ELY<span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500">CHIMP</span>
                </span>
                <span className="rounded-md border border-amber-500/40 bg-amber-400/10 px-2 py-0.5 text-xs font-mono font-bold tracking-wider text-amber-300">
                  ADMIN
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs font-mono tracking-widest text-[#34B7DD]/70 uppercase">
                <span>Elysium Protocol</span>
                <span className="text-gray-500 font-semibold text-xs">v2.4</span>
              </div>
            </div>

            {/* Nav links skeleton */}
            <div className="mt-5 space-y-3">
              <div className="h-3 w-20 rounded bg-[#102B33]/60 animate-pulse" />
              <div className="space-y-1.5">
                <div className="h-9 w-full rounded-xl bg-amber-400/10 border border-amber-400/20 animate-pulse" />
                <div className="h-9 w-full rounded-xl bg-[#0B2026] border border-[#163B44]/50 animate-pulse" />
                <div className="h-9 w-full rounded-xl bg-[#0B2026] border border-[#163B44]/50 animate-pulse" />
                <div className="h-9 w-full rounded-xl bg-[#0B2026] border border-[#163B44]/50 animate-pulse" />
              </div>

              <div className="pt-3 h-3 w-20 rounded bg-[#102B33]/60 animate-pulse" />
              <div className="space-y-1.5">
                <div className="h-9 w-full rounded-xl bg-[#0B2026] border border-[#163B44]/50 animate-pulse" />
                <div className="h-9 w-full rounded-xl bg-[#0B2026] border border-[#163B44]/50 animate-pulse" />
                <div className="h-9 w-full rounded-xl bg-[#0B2026] border border-[#163B44]/50 animate-pulse" />
              </div>
            </div>
          </div>

          {/* User profile footer skeleton */}
          <div className="border-t border-[#163B44]/80 pt-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-[#102B33] animate-pulse" />
              <div className="space-y-1 flex-1">
                <div className="h-3.5 w-24 rounded bg-[#102B33] animate-pulse" />
                <div className="h-3 w-16 rounded bg-[#102B33]/60 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Pane Skeleton */}
      <main className="flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Top Breadcrumb & Actions Bar Skeleton */}
          <div className="flex flex-col gap-2 border-b border-[#163B44] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400">Elychimp</span>
              <span className="text-xs text-gray-500">/</span>
              <span className="text-xs text-gray-400">Admin</span>
              <span className="text-xs text-gray-500">/</span>
              <span className="text-xs font-semibold text-amber-400">Loading...</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-24 rounded-lg bg-[#0B2026] border border-[#163B44] animate-pulse" />
              <div className="h-8 w-20 rounded-lg bg-[#0B2026] border border-[#163B44] animate-pulse" />
            </div>
          </div>

          {/* Centered Loading Indicator Card */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-[#163B44] bg-[#071F24]/80 p-8 shadow-xl backdrop-blur-xl">
            <ElychimpSpinner size="md" />
            <p className="mt-4 font-mono text-xs font-bold uppercase tracking-wider text-[#34B7DD]">
              Synchronizing Admin Mission Control...
            </p>
            <p className="mt-1 text-xs text-[#8AA8B2]">
              Verifying session authority on Elysium network
            </p>
          </div>

          {/* Stat Cards Skeleton */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-[#163B44] bg-[#071F24]/60 p-5 space-y-3"
              >
                <div className="h-3 w-24 rounded bg-[#102B33] animate-pulse" />
                <div className="h-8 w-16 rounded bg-[#102B33]/80 animate-pulse" />
                <div className="h-2.5 w-32 rounded bg-[#102B33]/40 animate-pulse" />
              </div>
            ))}
          </div>

          {/* Content Pane Skeleton */}
          <div className="rounded-2xl border border-[#163B44] bg-[#071F24]/60 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#163B44] pb-4">
              <div className="h-5 w-40 rounded bg-[#102B33] animate-pulse" />
              <div className="h-8 w-28 rounded-lg bg-[#0B2026] border border-[#163B44] animate-pulse" />
            </div>
            <div className="space-y-3 pt-2">
              <div className="h-10 w-full rounded-xl bg-[#0B2026]/80 border border-[#163B44]/50 animate-pulse" />
              <div className="h-10 w-full rounded-xl bg-[#0B2026]/60 border border-[#163B44]/50 animate-pulse" />
              <div className="h-10 w-full rounded-xl bg-[#0B2026]/40 border border-[#163B44]/50 animate-pulse" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
