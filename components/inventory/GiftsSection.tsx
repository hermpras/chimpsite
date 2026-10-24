import React, { useState } from "react";
import {
  Gift,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Check,
  X,
  AlertTriangle,
  CheckCircle2,
  Ban,
  RotateCw,
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
import type { GiftItemData } from "@/lib/inventory/client";
import { resolveGiftRequest } from "@/lib/inventory/client";
import { shortenAddress } from "@/lib/auth/address";

interface GiftsSectionProps {
  sentGifts: GiftItemData[];
  receivedGifts: GiftItemData[];
  isLoading: boolean;
  isWlAllocated: boolean;
  onRefresh: () => Promise<void> | void;
}

export function GiftsSection({
  sentGifts,
  receivedGifts,
  isLoading,
  isWlAllocated,
  onRefresh,
}: GiftsSectionProps) {
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Filter only pending gifts for incoming and outgoing queues
  const pendingIncoming = receivedGifts.filter((g) => g.status === "PENDING");
  const pendingOutgoing = sentGifts.filter((g) => g.status === "PENDING");

  const handleResolve = async (
    gift: GiftItemData,
    action: "ACCEPT" | "REJECT" | "CANCEL",
  ) => {
    if (action === "ACCEPT" && isWlAllocated) {
      setActionError("Wallets with an allocated Whitelist slot cannot receive gifts.");
      return;
    }

    setActiveActionId(gift.id);
    setActionError(null);
    setActionSuccess(null);

    try {
      await resolveGiftRequest(gift.id, action);
      if (action === "ACCEPT") {
        setActionSuccess(
          `Gift accepted! "${gift.inventoryItem.trait.name}" (#${gift.inventoryItem.edition}) has been added to your inventory.`,
        );
      } else if (action === "REJECT") {
        setActionSuccess(`Gift rejected. Trait returned to sender.`);
      } else {
        setActionSuccess(
          `Gift cancelled. Trait #${gift.inventoryItem.edition} unlocked in your inventory.`,
        );
      }
      await onRefresh();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : `Failed to ${action.toLowerCase()} gift.`;
      setActionError(msg);
    } finally {
      setActiveActionId(null);
    }
  };

  const formatExpiry = (expiresAtStr: string) => {
    try {
      const expiresAt = new Date(expiresAtStr);
      const now = new Date();
      const diffMs = expiresAt.getTime() - now.getTime();
      if (diffMs <= 0) return "Expired";
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      if (diffHours > 0) {
        return `${diffHours}h ${diffMins}m left`;
      }
      return `${diffMins}m left`;
    } catch {
      return "24h window";
    }
  };

  return (
    <Card className="md:col-span-2" data-testid="gifts-section">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-teal-500/10 p-2 text-teal-400">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Gifts & Peer Transfers</CardTitle>
              <CardDescription>
                Review incoming trait gifts and manage your outgoing transfers
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-teal-500/30 text-teal-300">
              {pendingIncoming.length} Incoming
            </Badge>
            <Badge variant="outline" className="border-sky-500/30 text-sky-300">
              {pendingOutgoing.length} Outgoing
            </Badge>
            <button
              onClick={() => onRefresh()}
              disabled={isLoading}
              title="Refresh gifts"
              className="rounded-lg border border-gray-800 p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-50"
            >
              <RotateCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Action Alert Feedbacks */}
        {actionError && (
          <div
            role="alert"
            data-testid="gift-action-error"
            className="flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-400" />
            <div className="flex-1">{actionError}</div>
            <button
              onClick={() => setActionError(null)}
              className="text-rose-400 hover:text-rose-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {actionSuccess && (
          <div
            role="status"
            data-testid="gift-action-success"
            className="flex items-start gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
            <div className="flex-1">{actionSuccess}</div>
            <button
              onClick={() => setActionSuccess(null)}
              className="text-emerald-400 hover:text-emerald-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* WL Allocation Restriction Notice */}
        {isWlAllocated && (
          <div
            data-testid="wl-allocated-gift-notice"
            className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200"
          >
            <Ban className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
            <div className="space-y-0.5">
              <p className="font-semibold text-amber-400">WL Allocated Wallet Notice</p>
              <p className="text-gray-300">
                Your wallet has an allocated Whitelist slot. As per ecosystem rules, you
                may send duplicate traits to other holders, but you cannot receive new
                gifts into your inventory.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* SECTION 1: Incoming Pending Gifts */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <ArrowDownLeft className="h-4 w-4 text-emerald-400" />
              <span>Pending Incoming Gifts ({pendingIncoming.length})</span>
            </div>

            {isLoading && pendingIncoming.length === 0 ? (
              <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 text-center text-xs text-gray-500">
                Checking for incoming gifts...
              </div>
            ) : pendingIncoming.length === 0 ? (
              <div
                data-testid="no-incoming-gifts"
                className="rounded-lg border border-dashed border-gray-800 bg-gray-900/30 p-5 text-center text-xs text-gray-500"
              >
                No pending incoming gifts.
              </div>
            ) : (
              <div className="space-y-2.5">
                {pendingIncoming.map((gift) => {
                  const isActing = activeActionId === gift.id;
                  const senderAddr = gift.sender?.wallet?.address || gift.senderId;

                  return (
                    <div
                      key={gift.id}
                      data-testid={`incoming-gift-${gift.id}`}
                      className="flex flex-col gap-3 rounded-xl border border-gray-800 bg-[#0d111c] p-3.5 transition-colors sm:flex-row sm:items-center sm:justify-between"
                    >
                      {/* Trait Thumbnail & Details */}
                      <div className="flex items-center gap-3">
                        <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-gray-900">
                          {gift.inventoryItem.trait.imageUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={gift.inventoryItem.trait.imageUrl}
                              alt={gift.inventoryItem.trait.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-gray-600">
                              <Gift className="h-5 w-5" />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase">
                              {gift.inventoryItem.trait.category}
                            </span>
                            <span className="font-mono text-[10px] text-gray-500">
                              #{gift.inventoryItem.edition}
                            </span>
                          </div>
                          <p className="line-clamp-1 text-sm font-semibold text-white">
                            {gift.inventoryItem.trait.name}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-gray-400">
                            <span title={senderAddr}>
                              From: {shortenAddress(senderAddr)}
                            </span>
                            <span className="text-gray-600">•</span>
                            <span className="flex items-center gap-1 text-teal-400">
                              <Clock className="h-3 w-3" />
                              {formatExpiry(gift.expiresAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 sm:self-center">
                        <Button
                          size="sm"
                          variant="primary"
                          data-testid={`accept-gift-${gift.id}`}
                          disabled={isActing || isWlAllocated}
                          onClick={() => handleResolve(gift, "ACCEPT")}
                          className="bg-emerald-600 text-xs hover:bg-emerald-500 disabled:opacity-40"
                          title={
                            isWlAllocated
                              ? "Wallets with an allocated Whitelist slot cannot receive gifts"
                              : "Accept this trait into your inventory"
                          }
                        >
                          <Check className="mr-1 h-3.5 w-3.5" />
                          {isActing ? "Accepting..." : "Accept"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`reject-gift-${gift.id}`}
                          disabled={isActing}
                          onClick={() => handleResolve(gift, "REJECT")}
                          className="border-gray-700 text-xs text-rose-400 hover:border-rose-500/40 hover:bg-rose-500/10"
                        >
                          <X className="mr-1 h-3.5 w-3.5" />
                          {isActing ? "Rejecting..." : "Reject"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION 2: Outgoing Pending Gifts */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <ArrowUpRight className="h-4 w-4 text-sky-400" />
              <span>Pending Outgoing Gifts ({pendingOutgoing.length})</span>
            </div>

            {isLoading && pendingOutgoing.length === 0 ? (
              <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 text-center text-xs text-gray-500">
                Checking outgoing gifts...
              </div>
            ) : pendingOutgoing.length === 0 ? (
              <div
                data-testid="no-outgoing-gifts"
                className="rounded-lg border border-dashed border-gray-800 bg-gray-900/30 p-5 text-center text-xs text-gray-500"
              >
                No pending outgoing gifts.
              </div>
            ) : (
              <div className="space-y-2.5">
                {pendingOutgoing.map((gift) => {
                  const isActing = activeActionId === gift.id;
                  const receiverAddr = gift.receiver?.wallet?.address || gift.receiverId;

                  return (
                    <div
                      key={gift.id}
                      data-testid={`outgoing-gift-${gift.id}`}
                      className="flex flex-col gap-3 rounded-xl border border-gray-800 bg-[#0d111c] p-3.5 transition-colors sm:flex-row sm:items-center sm:justify-between"
                    >
                      {/* Trait Thumbnail & Details */}
                      <div className="flex items-center gap-3">
                        <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-gray-900">
                          {gift.inventoryItem.trait.imageUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={gift.inventoryItem.trait.imageUrl}
                              alt={gift.inventoryItem.trait.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-gray-600">
                              <Gift className="h-5 w-5" />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase">
                              {gift.inventoryItem.trait.category}
                            </span>
                            <span className="font-mono text-[10px] text-gray-500">
                              #{gift.inventoryItem.edition}
                            </span>
                          </div>
                          <p className="line-clamp-1 text-sm font-semibold text-white">
                            {gift.inventoryItem.trait.name}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-gray-400">
                            <span title={receiverAddr}>
                              To: {shortenAddress(receiverAddr)}
                            </span>
                            <span className="text-gray-600">•</span>
                            <span className="flex items-center gap-1 text-sky-400">
                              <Clock className="h-3 w-3" />
                              {formatExpiry(gift.expiresAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Cancel Action — supported by backend */}
                      <div className="flex items-center gap-2 sm:self-center">
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`cancel-gift-${gift.id}`}
                          disabled={isActing}
                          onClick={() => handleResolve(gift, "CANCEL")}
                          className="border-gray-700 text-xs text-amber-300 hover:border-amber-500/40 hover:bg-amber-500/10"
                          title="Cancel gift and unlock item back into your inventory"
                        >
                          <X className="mr-1 h-3.5 w-3.5" />
                          {isActing ? "Cancelling..." : "Cancel Gift"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
