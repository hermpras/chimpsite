import React, { useState, useEffect } from "react";
import { X, Gift, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import type { InventoryItemData } from "@/lib/inventory/client";
import { sendGiftRequest } from "@/lib/inventory/client";
import { isValidAddress, shortenAddress } from "@/lib/auth/address";
import { Button } from "@/components/ui/Button";

interface GiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: InventoryItemData | null;
  senderAddress?: string | null;
  onGiftSuccess: () => void;
}

export function GiftModal({
  isOpen,
  onClose,
  item,
  senderAddress,
  onGiftSuccess,
}: GiftModalProps) {
  const [receiverAddress, setReceiverAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !item) return null;

  const handleClose = () => {
    setReceiverAddress("");
    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(false);
    onClose();
  };

  // Validation logic
  const trimmed = receiverAddress.trim();
  let clientValidationError: string | null = null;
  if (!trimmed) {
    clientValidationError = "Recipient wallet address is required.";
  } else if (!isValidAddress(trimmed)) {
    clientValidationError =
      "Invalid EVM wallet address format (must be 0x followed by 40 hex characters).";
  } else if (senderAddress && trimmed.toLowerCase() === senderAddress.toLowerCase()) {
    clientValidationError = "You cannot send a gift to yourself.";
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (clientValidationError) {
      setError(clientValidationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await sendGiftRequest(trimmed, item.id);
      setSuccessMessage(
        `Gift sent successfully! Trait "${item.trait.name}" (#${item.edition}) is now pending acceptance. It will expire after 24 hours if unaccepted.`,
      );
      onGiftSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send gift.";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gift-modal-title"
      data-testid="gift-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-gray-800 bg-[#0d111c] p-6 shadow-2xl">
        {/* Close Button */}
        <button
          onClick={handleClose}
          disabled={isSubmitting}
          data-testid="gift-modal-close"
          className="absolute top-4 right-4 rounded-lg p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-lg bg-teal-500/10 p-2.5 text-teal-400">
            <Gift className="h-6 w-6" />
          </div>
          <div>
            <h2 id="gift-modal-title" className="text-xl font-bold text-white">
              Gift Duplicate Trait
            </h2>
            <p className="text-xs text-gray-400">
              Transfer an extra copy of this trait to another ChimpHood holder
            </p>
          </div>
        </div>

        {/* Selected Trait Preview */}
        <div className="mb-5 flex items-center gap-4 rounded-xl border border-gray-800 bg-gray-900/60 p-3.5">
          <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-gray-800">
            {item.trait.imageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={item.trait.imageUrl}
                alt={item.trait.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-gray-500">
                <Gift className="h-6 w-6" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold tracking-wider text-gray-400 uppercase">
                {item.trait.category}
              </span>
              <span className="rounded bg-gray-800 px-1.5 py-0.5 font-mono text-[10px] text-gray-300">
                #{item.edition}
              </span>
            </div>
            <p className="truncate font-semibold text-white">{item.trait.name}</p>
            <p className="text-xs text-gray-400">Rarity: {item.trait.rarity}</p>
          </div>
        </div>

        {/* Established Gifting Rules Banner */}
        <div className="mb-5 space-y-1.5 rounded-lg border border-teal-500/20 bg-teal-950/20 p-3 text-xs text-teal-200">
          <div className="flex items-center gap-1.5 font-semibold text-teal-400">
            <ShieldAlert className="h-4 w-4" />
            <span>Gifting Invariants & Rules:</span>
          </div>
          <ul className="list-inside list-disc space-y-0.5 text-[11px] text-gray-300">
            <li>You must retain at least 1 copy of the trait.</li>
            <li>Maximum 1 gift sent per wallet per UTC day.</li>
            <li>Recipient must not already own this trait.</li>
            <li>Pending gifts expire after 24 hours if unaccepted.</li>
            <li>Wallets with an allocated Whitelist slot cannot receive gifts.</li>
          </ul>
        </div>

        {/* Alerts */}
        {error && (
          <div
            role="alert"
            data-testid="gift-send-error"
            className="mb-4 flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-400" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            data-testid="gift-send-success"
            className="mb-4 flex items-start gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
            <div className="flex-1">{successMessage}</div>
          </div>
        )}

        {/* Recipient Form */}
        {!successMessage ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="receiver-address-input"
                className="mb-1.5 block text-xs font-medium text-gray-300"
              >
                Recipient Wallet Address (EVM)
              </label>
              <input
                id="receiver-address-input"
                type="text"
                data-testid="gift-receiver-input"
                placeholder="0x1234...5678"
                value={receiverAddress}
                onChange={(e) => {
                  setReceiverAddress(e.target.value);
                  if (error) setError(null);
                }}
                disabled={isSubmitting}
                className="w-full rounded-lg border border-gray-700 bg-gray-900/80 px-3.5 py-2.5 font-mono text-sm text-white placeholder-gray-500 transition-colors focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none disabled:opacity-50"
              />
              {trimmed && clientValidationError && (
                <p
                  data-testid="gift-validation-message"
                  className="mt-1.5 text-[11px] text-amber-400"
                >
                  {clientValidationError}
                </p>
              )}
              {senderAddress && (
                <p className="mt-1 text-[11px] text-gray-500">
                  Sending from: {shortenAddress(senderAddress)}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                data-testid="send-gift-submit"
                disabled={isSubmitting || Boolean(clientValidationError)}
                className="bg-teal-600 hover:bg-teal-500 active:bg-teal-700"
              >
                {isSubmitting ? "Sending..." : "Send Gift"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              data-testid="gift-success-done"
              onClick={handleClose}
            >
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
