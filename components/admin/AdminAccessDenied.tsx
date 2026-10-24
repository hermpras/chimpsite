"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldAlert, Lock, ArrowLeft, ShieldX, Zap } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { WalletConnectCard } from "@/components/auth/WalletConnectCard";
import { devPromoteToAdmin } from "@/server/admin/dev-promote";

export interface AdminAccessDeniedProps {
  error: {
    error: "UNAUTHORIZED" | "FORBIDDEN";
    status: 401 | 403;
    message: string;
  };
}

export function AdminAccessDenied({ error }: AdminAccessDeniedProps) {
  const router = useRouter();
  const [isPromoting, setIsPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  const isUnauthorized = error.status === 401 || error.error === "UNAUTHORIZED";

  const handleDevPromote = async () => {
    setIsPromoting(true);
    setPromoteError(null);
    try {
      const res = await devPromoteToAdmin();
      if (res.ok) {
        router.refresh();
        window.location.reload();
      } else {
        setPromoteError(res.error || "Failed to activate admin role.");
      }
    } catch (err: unknown) {
      setPromoteError(
        err instanceof Error ? err.message : "Failed to activate admin role.",
      );
    } finally {
      setIsPromoting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <Link href="/">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Button>
        </Link>
        <Badge variant="warning">{error.status} Access Restricted</Badge>
      </div>

      {isUnauthorized ? (
        <div className="space-y-8">
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
                <Lock className="h-7 w-7" />
              </div>
              <CardTitle className="text-2xl font-bold text-white">
                Admin Authentication Required
              </CardTitle>
              <CardDescription className="text-gray-300">
                {error.message ||
                  "This section requires an active Sign-In with Ethereum (SIWE) administrator session."}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center text-sm text-gray-400">
              <p>
                Connect an authorized administrator wallet below and sign the SIWE
                challenge to verify your identity and access the administration console.
              </p>
            </CardContent>
          </Card>

          <div className="mx-auto max-w-md">
            <WalletConnectCard />
          </div>
        </div>
      ) : (
        <Card className="border-rose-500/30 bg-rose-500/5">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 text-rose-400">
              <ShieldX className="h-7 w-7" />
            </div>
            <CardTitle className="text-2xl font-bold text-white">
              Access Forbidden: Insufficient Admin Privileges
            </CardTitle>
            <CardDescription className="text-gray-300">
              {error.message ||
                "Your account is authenticated, but no active administrator role was found in the database."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <div className="rounded-lg border border-gray-800 bg-[#0c0e17] p-4 text-xs text-gray-400">
              <div className="flex items-center justify-center gap-2 text-rose-300">
                <ShieldAlert className="h-4 w-4" />
                <span className="font-semibold">Role Verification Failed</span>
              </div>
              <p className="mt-2 text-gray-400">
                Only accounts with an assigned role (SUPER_ADMIN, ADMIN, MODERATOR, or
                AUDITOR) in the ChimpHood database are permitted to access this route.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-4 pt-2">
              <Button
                variant="primary"
                size="md"
                onClick={handleDevPromote}
                disabled={isPromoting}
                className="gap-2 bg-gradient-to-r from-amber-500 to-emerald-500 font-semibold text-black hover:from-amber-400 hover:to-emerald-400"
              >
                <Zap className="h-4 w-4" />
                {isPromoting ? "Activating Role..." : "Activate Super Admin (Dev)"}
              </Button>
              <Link href="/profile">
                <Button variant="secondary" size="md">
                  View Profile
                </Button>
              </Link>
              <Link href="/">
                <Button variant="outline" size="md">
                  Return to Home
                </Button>
              </Link>
            </div>
            {promoteError && <p className="mt-2 text-xs text-rose-400">{promoteError}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
