"use client";

import React, { useState } from "react";
import { ShieldCheck, Search, Gift, Clock, Flame } from "lucide-react";
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

export default function WhitelistPage() {
  const [addressInput, setAddressInput] = useState("");

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Whitelist Portal
          </h1>
          <Badge variant="warning">Placeholder</Badge>
        </div>
        <p className="text-gray-400">
          Check allocation eligibility, registration status, and ChimpHood Whitelist
          distribution details.
        </p>
      </div>

      <div className="mb-8">
        <PlaceholderNotice
          title="Claim Engine & Allocation Engine Disabled"
          description="Verification logic, Whitelist quota calculations, and gift claims are intentionally disabled until Stage 2/3 implementation."
          phase="Stage 1 Placeholder"
        />
      </div>

      <div className="space-y-6">
        {/* Whitelist Checker Tool (Placeholder) */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
                <Search className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Check Whitelist Allocation Status</CardTitle>
                <CardDescription>
                  Enter an EVM wallet address or X handle to check allocation status
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                placeholder="0x... or @handle (UI Placeholder)"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                className="flex-1 rounded-lg border border-gray-700 bg-gray-900/60 px-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
              />
              <Button
                variant="primary"
                onClick={() =>
                  alert(
                    "Allocation check is not active yet (Stage 1 Placeholder). Awaiting live allocation query implementation.",
                  )
                }
              >
                Check Eligibility (Placeholder)
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              * Actual allocation data will be sourced from PostgreSQL database records in
              subsequent stages.
            </p>
          </CardContent>
        </Card>

        {/* Campaign & Tasks Placeholder */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400">
                  <Flame className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Campaigns & Quests</CardTitle>
                  <CardDescription>
                    Community missions to earn Whitelist allocation
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-900/40 p-4 text-sm text-gray-400">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                  <span>Early Bird Community Quest</span>
                  <Badge variant="outline">Upcoming</Badge>
                </div>
                <div className="flex items-center justify-between border-b border-gray-800 py-2">
                  <span>X Creative Content Campaign</span>
                  <Badge variant="outline">Upcoming</Badge>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span>ChimpHood Referral Mission</span>
                  <Badge variant="outline">Upcoming</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-teal-500/10 p-2 text-teal-400">
                  <Gift className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Gifts & Referral Allocation</CardTitle>
                  <CardDescription>Reward and gift distribution</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-900/40 p-4 text-sm text-gray-400">
                <p>
                  Peer-to-peer gift distribution (Gift Engine) is currently:{" "}
                  <span className="font-semibold text-amber-300">STAGE PLACEHOLDER</span>.
                </p>
                <Button variant="outline" size="sm" className="w-full" disabled>
                  Claim Gift (Inactive)
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
