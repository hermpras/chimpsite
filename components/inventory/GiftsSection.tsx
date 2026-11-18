import React, { useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/Card";
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
  const [historyFilter, setHistoryFilter] = useState<"ALL" | "RECEIVED" | "SENT">("ALL");

  // Filter only pending gifts for incoming and outgoing queues
  const pendingIncoming = receivedGifts.filter((g) => g.status === "PENDING");
  const pendingOutgoing = sentGifts.filter((g) => g.status === "PENDING");

  const receivedHistory = receivedGifts
    .filter((g) => g.status !== "PENDING")
    .map((g) => ({ ...g, direction: "RECEIVED" as const }));
  const sentHistory = sentGifts
    .filter((g) => g.status !== "PENDING")
    .map((g) => ({ ...g, direction: "SENT" as const }));

  const allHistory = [...receivedHistory, ...sentHistory].sort((a, b) => {
    const timeA = new Date(a.decidedAt || a.createdAt).getTime();
    const timeB = new Date(b.decidedAt || b.createdAt).getTime();
    return timeB - timeA;
  });

  const filteredHistory =
    historyFilter === "ALL"
      ? allHistory
      : historyFilter === "RECEIVED"
        ? receivedHistory
        : sentHistory;

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

  return (
    <Card className="md:col-span-2" data-testid="gifts-section">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Gifts & Peer Transfers</CardTitle>
            <CardDescription>
              Review incoming trait gifts and manage your outgoing transfers
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onRefresh()}
              disabled={isLoading}
              title="Refresh gifts"
              aria-label="Refresh gifts"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#34B7DD]/40 bg-[#07242C]/70 text-cyan-300 hover:border-cyan-400 hover:text-white hover:bg-[#0E3A47]/80 disabled:opacity-50 cursor-pointer transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
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
            className="flex items-start justify-between gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs sm:text-sm text-rose-300"
          >
            <div className="flex-1">{actionError}</div>
            <button
              onClick={() => setActionError(null)}
              className="text-rose-400 hover:text-rose-200 font-extrabold uppercase text-xs tracking-wider"
            >
              Dismiss
            </button>
          </div>
        )}

        {actionSuccess && (
          <div
            role="status"
            data-testid="gift-action-success"
            className="flex items-start justify-between gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs sm:text-sm text-emerald-300"
          >
            <div className="flex-1">{actionSuccess}</div>
            <button
              onClick={() => setActionSuccess(null)}
              className="text-emerald-400 hover:text-emerald-200 font-extrabold uppercase text-xs tracking-wider"
            >
              Dismiss
            </button>
          </div>
        )}

        {isWlAllocated && (
          <div
            data-testid="wl-allocated-gift-notice"
            className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs sm:text-sm text-amber-200"
          >
            <div className="space-y-1">
              <p className="font-bold text-amber-400">WL Allocated Wallet Notice</p>
              <p className="text-gray-300 leading-relaxed">
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
            <div className="flex items-center text-sm sm:text-base font-bold text-white tracking-wide">
              <span>Pending Incoming Gifts ({pendingIncoming.length})</span>
            </div>

            {isLoading && pendingIncoming.length === 0 ? (
              <div className="rounded-2xl border border-[#163B44] bg-[#051D22]/60 p-5 text-center text-xs sm:text-sm text-gray-400">
                Checking for incoming gifts...
              </div>
            ) : pendingIncoming.length === 0 ? (
              <div
                data-testid="no-incoming-gifts"
                className="rounded-2xl border border-dashed border-[#163B44] bg-[#051D22]/50 p-6 text-center text-xs sm:text-sm text-gray-400"
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
                      className="flex flex-col gap-3 rounded-2xl border border-[#163B44] bg-[#0B2026] p-4 transition-colors sm:flex-row sm:items-center sm:justify-between"
                    >
                      {/* Trait Thumbnail & Details */}
                      <div className="flex items-center gap-3.5">
                        <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-[#051D22] border border-[#163B44]">
                          {gift.inventoryItem.trait.imageUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={gift.inventoryItem.trait.imageUrl}
                              alt={gift.inventoryItem.trait.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs font-mono font-bold uppercase text-gray-400">
                              {gift.inventoryItem.trait.category}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                              {gift.inventoryItem.trait.category}
                            </span>
                            <span className="font-mono text-xs text-cyan-300/80">
                              #{gift.inventoryItem.edition}
                            </span>
                          </div>
                          <p className="line-clamp-1 text-sm sm:text-base font-semibold text-white">
                            {gift.inventoryItem.trait.name}
                          </p>
                          <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-300 font-medium">
                            <span title={senderAddr}>
                              From: {gift.sender?.xIdentity?.username ? `@${gift.sender.xIdentity.username} (${shortenAddress(senderAddr)})` : shortenAddress(senderAddr)}
                            </span>
                            <span className="text-gray-600">•</span>
                            <span className="text-teal-400">
                              Pending acceptance
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
                          className="h-8 sm:h-9 rounded-xl border border-emerald-400/80 bg-gradient-to-b from-[#059669] via-[#10B981] to-[#047857] text-[#021A13] font-black text-xs uppercase tracking-wider shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.7),0_4px_14px_rgba(16,185,129,0.3)] hover:from-[#34D399] hover:via-[#10B981] hover:to-[#059669] disabled:opacity-40"
                          title={
                            isWlAllocated
                              ? "Wallets with an allocated Whitelist slot cannot receive gifts"
                              : "Accept this trait into your inventory"
                          }
                        >
                          {isActing ? "Accepting..." : "Accept"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`reject-gift-${gift.id}`}
                          disabled={isActing}
                          onClick={() => handleResolve(gift, "REJECT")}
                          className="h-8 sm:h-9 rounded-xl border border-rose-500/40 bg-rose-950/40 text-xs font-extrabold uppercase tracking-wider text-rose-300 hover:border-rose-400 hover:bg-rose-900/50 hover:text-white"
                        >
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
            <div className="flex items-center text-sm sm:text-base font-bold text-white tracking-wide">
              <span>Pending Outgoing Gifts ({pendingOutgoing.length})</span>
            </div>

            {isLoading && pendingOutgoing.length === 0 ? (
              <div className="rounded-2xl border border-[#163B44] bg-[#051D22]/60 p-5 text-center text-xs sm:text-sm text-gray-400">
                Checking outgoing gifts...
              </div>
            ) : pendingOutgoing.length === 0 ? (
              <div
                data-testid="no-outgoing-gifts"
                className="rounded-2xl border border-dashed border-[#163B44] bg-[#051D22]/50 p-6 text-center text-xs sm:text-sm text-gray-400"
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
                      className="flex flex-col gap-3 rounded-2xl border border-[#163B44] bg-[#0B2026] p-4 transition-colors sm:flex-row sm:items-center sm:justify-between"
                    >
                      {/* Trait Thumbnail & Details */}
                      <div className="flex items-center gap-3.5">
                        <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-[#051D22] border border-[#163B44]">
                          {gift.inventoryItem.trait.imageUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={gift.inventoryItem.trait.imageUrl}
                              alt={gift.inventoryItem.trait.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs font-mono font-bold uppercase text-gray-400">
                              {gift.inventoryItem.trait.category}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                              {gift.inventoryItem.trait.category}
                            </span>
                            <span className="font-mono text-xs text-cyan-300/80">
                              #{gift.inventoryItem.edition}
                            </span>
                          </div>
                          <p className="line-clamp-1 text-sm sm:text-base font-semibold text-white">
                            {gift.inventoryItem.trait.name}
                          </p>
                          <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-300 font-medium">
                            <span title={receiverAddr}>
                              To: {gift.receiver?.xIdentity?.username ? `@${gift.receiver.xIdentity.username} (${shortenAddress(receiverAddr)})` : shortenAddress(receiverAddr)}
                            </span>
                            <span className="text-gray-600">•</span>
                            <span className="text-sky-400">
                              Pending receiver
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
                          className="h-8 sm:h-9 rounded-xl border border-amber-500/40 bg-amber-950/40 text-xs font-extrabold uppercase tracking-wider text-amber-300 hover:border-amber-400 hover:bg-amber-900/50 hover:text-white"
                          title="Cancel gift and unlock item back into your inventory"
                        >
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

        {/* SECTION 3: Gift History Log */}
        <div
          data-testid="gift-history-section"
          className="border-t border-[#163B44] pt-6 space-y-3"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm sm:text-base font-bold text-white tracking-wide">
              <span>Gift Transfer History ({allHistory.length})</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(["ALL", "RECEIVED", "SENT"] as const).map((filterType) => {
                const isSelected = historyFilter === filterType;
                const count =
                  filterType === "ALL"
                    ? allHistory.length
                    : filterType === "RECEIVED"
                      ? receivedHistory.length
                      : sentHistory.length;

                return (
                  <button
                    key={filterType}
                    type="button"
                    data-testid={`gift-history-filter-${filterType}`}
                    onClick={() => setHistoryFilter(filterType)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                      isSelected
                        ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-200 shadow-[0_0_12px_rgba(52,183,221,0.2)]"
                        : "border-[#163B44] bg-[#07242C]/40 text-[#8AA8B2] hover:border-cyan-500/40 hover:text-white"
                    }`}
                  >
                    {`${filterType} (${count})`}
                  </button>
                );
              })}
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div
              data-testid="no-gift-history"
              className="rounded-2xl border border-dashed border-[#163B44] bg-[#051D22]/40 p-6 text-center text-xs sm:text-sm text-gray-400"
            >
              No completed or cancelled gift transfers recorded yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredHistory.map((gift) => {
                const isReceived = gift.direction === "RECEIVED";
                const peerAddr = isReceived
                  ? gift.sender?.wallet?.address || gift.senderId
                  : gift.receiver?.wallet?.address || gift.receiverId;
                const peerX = isReceived
                  ? gift.sender?.xIdentity?.username
                  : gift.receiver?.xIdentity?.username;
                const peerLabel = peerX
                  ? `@${peerX} (${shortenAddress(peerAddr)})`
                  : shortenAddress(peerAddr);
                const timestamp = new Date(
                  gift.decidedAt || gift.createdAt,
                ).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });

                const statusStyles: Record<string, string> = {
                  ACCEPTED:
                    "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
                  REJECTED:
                    "border-rose-500/40 bg-rose-500/15 text-rose-300",
                  CANCELLED:
                    "border-amber-500/40 bg-amber-500/15 text-amber-300",
                  EXPIRED:
                    "border-zinc-500/40 bg-zinc-500/15 text-zinc-400",
                };

                return (
                  <div
                    key={`${gift.direction}-${gift.id}`}
                    data-testid={`gift-history-item-${gift.id}`}
                    className="flex flex-col gap-2.5 rounded-2xl border border-[#163B44]/80 bg-[#051D22]/60 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-xl bg-[#0B2026] border border-[#163B44]">
                        {gift.inventoryItem.trait.imageUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={gift.inventoryItem.trait.imageUrl}
                            alt={gift.inventoryItem.trait.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs font-mono font-bold uppercase text-gray-400">
                            {gift.inventoryItem.trait.category}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-lg border px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${
                              isReceived
                                ? "border-teal-500/40 bg-teal-500/15 text-teal-300"
                                : "border-sky-500/40 bg-sky-500/15 text-sky-300"
                            }`}
                          >
                            {gift.direction}
                          </span>
                          <span className="text-sm sm:text-base font-semibold text-white">
                            {`${gift.inventoryItem.trait.name} (#${gift.inventoryItem.edition})`}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-gray-300">
                          <span title={peerAddr}>
                            {isReceived ? `From: ${peerLabel}` : `To: ${peerLabel}`}
                          </span>
                          <span className="text-gray-600">•</span>
                          <span className="text-gray-400">{timestamp}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:self-center">
                      <span
                        data-testid={`gift-history-status-${gift.id}`}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider ${
                          statusStyles[gift.status] || statusStyles.EXPIRED
                        }`}
                      >
                        {gift.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
