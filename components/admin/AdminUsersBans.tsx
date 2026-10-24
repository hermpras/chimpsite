"use client";

import React, { useState } from "react";
import {
  Users,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Clock,
  UserX,
  UserCheck,
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
import {
  adminBanUser,
  adminRevokeBan,
  type AdminBanRequestInput,
  type AdminRevokeBanInput,
} from "@/lib/admin/client";

export function AdminUsersBans() {
  // Ban User Form State
  const [banUserId, setBanUserId] = useState("");
  const [banReason, setBanReason] = useState("");
  const [banType, setBanType] = useState<
    "PERMANENT" | "TEMPORARY" | "SHADOWBAN" | "FEATURE_RESTRICTION"
  >("PERMANENT");
  const [banScope, setBanScope] = useState<
    "FULL_SYSTEM" | "CLAIM_RESTRICTED" | "GIFT_RESTRICTED" | "WL_DISQUALIFIED"
  >("FULL_SYSTEM");
  const [banEvidence, setBanEvidence] = useState("");
  const [banExpiresAt, setBanExpiresAt] = useState("");
  const [banning, setBanning] = useState(false);
  const [banResult, setBanResult] = useState<any>(null);
  const [banError, setBanError] = useState<string | null>(null);

  // Revoke Ban Form State
  const [revokeBanId, setRevokeBanId] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [revokeResult, setRevokeResult] = useState<any>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const handleBanUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!banUserId.trim() || !banReason.trim()) {
      setBanError("User ID and Reason are required.");
      return;
    }

    setBanning(true);
    setBanError(null);
    setBanResult(null);
    try {
      const input: AdminBanRequestInput = {
        userId: banUserId.trim(),
        reason: banReason.trim(),
        banType,
        scope: banScope,
        evidence: banEvidence.trim() || null,
        expiresAt: banExpiresAt ? new Date(banExpiresAt).toISOString() : null,
      };
      const res = await adminBanUser(input);
      setBanResult(res);
      setBanUserId("");
      setBanReason("");
      setBanEvidence("");
      setBanExpiresAt("");
    } catch (err: unknown) {
      setBanError((err as Error).message || "Failed to execute user ban.");
    } finally {
      setBanning(false);
    }
  };

  const handleRevokeBan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokeBanId.trim()) {
      setRevokeError("Ban ID is required.");
      return;
    }

    setRevoking(true);
    setRevokeError(null);
    setRevokeResult(null);
    try {
      const input: AdminRevokeBanInput = {
        banId: revokeBanId.trim(),
        reason: revokeReason.trim() || null,
      };
      const res = await adminRevokeBan(input);
      setRevokeResult(res);
      setRevokeBanId("");
      setRevokeReason("");
    } catch (err: unknown) {
      setRevokeError((err as Error).message || "Failed to revoke user ban.");
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Users & Bans
          </h1>
          <Badge variant="warning">Enforcement Engine</Badge>
        </div>
        <p className="mt-1 text-sm text-gray-400">
          Enforce targeted account bans, apply scoped feature restrictions, and revoke
          penalties with audit logging.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Tool 1: Ban User Form */}
        <Card className="border-gray-800 bg-[#0c0e17]/90">
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserX className="h-5 w-5 text-rose-400" />
              <CardTitle className="text-base text-white">Ban Account</CardTitle>
            </div>
            <CardDescription className="text-xs text-gray-400">
              Impose an immediate ban or specific operational restriction on a user
              account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleBanUser} className="space-y-3">
              <div>
                <label
                  htmlFor="ban-user-id"
                  className="mb-1 block text-xs font-medium text-gray-400"
                >
                  Target User ID *
                </label>
                <input
                  id="ban-user-id"
                  type="text"
                  placeholder="e.g. clx123abc456"
                  value={banUserId}
                  onChange={(e) => setBanUserId(e.target.value)}
                  required
                  className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="ban-reason"
                  className="mb-1 block text-xs font-medium text-gray-400"
                >
                  Reason for Ban *
                </label>
                <input
                  id="ban-reason"
                  type="text"
                  placeholder="e.g. Sybil farming detected via bot activity"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  required
                  className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="ban-type"
                    className="mb-1 block text-xs font-medium text-gray-400"
                  >
                    Ban Type
                  </label>
                  <select
                    id="ban-type"
                    value={banType}
                    onChange={(e) => setBanType(e.target.value as any)}
                    className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-2.5 py-1.5 text-xs text-white focus:border-rose-500 focus:outline-none"
                  >
                    <option value="PERMANENT">PERMANENT</option>
                    <option value="TEMPORARY">TEMPORARY</option>
                    <option value="SHADOWBAN">SHADOWBAN</option>
                    <option value="FEATURE_RESTRICTION">FEATURE_RESTRICTION</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="ban-scope"
                    className="mb-1 block text-xs font-medium text-gray-400"
                  >
                    Enforcement Scope
                  </label>
                  <select
                    id="ban-scope"
                    value={banScope}
                    onChange={(e) => setBanScope(e.target.value as any)}
                    className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-2.5 py-1.5 text-xs text-white focus:border-rose-500 focus:outline-none"
                  >
                    <option value="FULL_SYSTEM">FULL_SYSTEM</option>
                    <option value="CLAIM_RESTRICTED">CLAIM_RESTRICTED</option>
                    <option value="GIFT_RESTRICTED">GIFT_RESTRICTED</option>
                    <option value="WL_DISQUALIFIED">WL_DISQUALIFIED</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="ban-evidence"
                    className="mb-1 block text-xs font-medium text-gray-400"
                  >
                    Evidence Link / Proof (optional)
                  </label>
                  <input
                    id="ban-evidence"
                    type="text"
                    placeholder="https://... or note"
                    value={banEvidence}
                    onChange={(e) => setBanEvidence(e.target.value)}
                    className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-rose-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="ban-expires"
                    className="mb-1 block text-xs font-medium text-gray-400"
                  >
                    Expires At (for temporary bans)
                  </label>
                  <input
                    id="ban-expires"
                    type="datetime-local"
                    value={banExpiresAt}
                    onChange={(e) => setBanExpiresAt(e.target.value)}
                    className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-rose-500 focus:outline-none"
                  />
                </div>
              </div>

              {banError && (
                <div className="flex items-center gap-2 rounded border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{banError}</span>
                </div>
              )}

              {banResult &&
                (banResult.alreadyBanned ? (
                  <div className="space-y-1 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                    <div className="flex items-center gap-2 font-semibold">
                      <ShieldAlert className="h-4 w-4" />
                      <span>Account Already Banned</span>
                    </div>
                    <p className="text-[11px] text-amber-200">
                      An active ban with the same or encompassing scope already exists.
                      Existing Ban ID:{" "}
                      {banResult.banRecord?.id ?? banResult.banId ?? "Registered"} (Scope:{" "}
                      {banResult.banRecord?.scope ?? banScope})
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1 rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                    <div className="flex items-center gap-2 font-semibold">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Ban Applied Successfully</span>
                    </div>
                    <p className="text-[11px] text-emerald-200">
                      Ban ID: {banResult.banRecord?.id ?? banResult.banId ?? "Registered"}{" "}
                      (Scope: {banResult.banRecord?.scope ?? banScope})
                    </p>
                  </div>
                ))}

              <Button
                type="submit"
                variant="secondary"
                size="sm"
                className="w-full text-xs text-rose-300 hover:bg-rose-900/40 hover:text-rose-200"
                disabled={banning}
              >
                {banning ? "Applying Ban..." : "Execute Account Ban"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Tool 2: Revoke Ban Form */}
        <Card className="border-gray-800 bg-[#0c0e17]/90">
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-emerald-400" />
              <CardTitle className="text-base text-white">Revoke Ban</CardTitle>
            </div>
            <CardDescription className="text-xs text-gray-400">
              Restore an account by revoking an existing ban record and clearing
              restrictions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRevokeBan} className="space-y-4">
              <div>
                <label
                  htmlFor="rev-ban-id"
                  className="mb-1 block text-xs font-medium text-gray-400"
                >
                  Ban Record ID *
                </label>
                <input
                  id="rev-ban-id"
                  type="text"
                  placeholder="e.g. ban_cm123abc456"
                  value={revokeBanId}
                  onChange={(e) => setRevokeBanId(e.target.value)}
                  required
                  className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="rev-ban-reason"
                  className="mb-1 block text-xs font-medium text-gray-400"
                >
                  Revocation Reason (optional)
                </label>
                <input
                  id="rev-ban-reason"
                  type="text"
                  placeholder="e.g. Successful appeal / false positive verified"
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  className="w-full rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {revokeError && (
                <div className="flex items-center gap-2 rounded border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{revokeError}</span>
                </div>
              )}

              {revokeResult && (
                <div className="space-y-1 rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Ban Revoked Successfully</span>
                  </div>
                  <p className="text-[11px] text-emerald-200">
                    User account restored. Audit Log ID: {revokeResult.auditLogId}
                  </p>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="sm"
                className="w-full text-xs"
                disabled={revoking}
              >
                {revoking ? "Revoking Ban..." : "Revoke Ban Record"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Backend Notice */}
      <PlaceholderNotice
        title="User Directory & Ban Audit Listing"
        description="Global user search and audit table endpoints are not yet available in current backend (GET /api/admin/users and GET /api/admin/ban return 405 Method Not Allowed). Enforcement actions (Ban Account and Revoke Ban) are fully functional above using user and ban record IDs."
        phase="Upcoming Feature"
      />
    </div>
  );
}
