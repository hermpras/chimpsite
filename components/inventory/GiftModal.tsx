import React, { useState } from "react";
import { X, Gift, AlertTriangle, CheckCircle2, ShieldAlert, Search, UserCheck, Loader2 } from "lucide-react";
import type { InventoryItemData } from "@/lib/inventory/client";
import { sendGiftRequest, lookupGiftRecipient, type GiftRecipientInfo } from "@/lib/inventory/client";
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
  const [receiverInput, setReceiverInput] = useState("");
  const [verifiedRecipient, setVerifiedRecipient] = useState<GiftRecipientInfo | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !item) return null;

  const handleClose = () => {
    setReceiverInput("");
    setVerifiedRecipient(null);
    setIsSearching(false);
    setSearchError(null);
    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(false);
    onClose();
  };

  const trimmed = receiverInput.trim();
  const isAddressFormat = trimmed.startsWith("0x");

  // Immediate format, equipped, and self-validation
  let clientValidationError: string | null = null;
  if (item.isEquipped) {
    clientValidationError = "This trait is currently equipped on your Profile and cannot be gifted.";
  } else if (!trimmed) {
    clientValidationError = "Recipient X username or wallet address is required.";
  } else if (isAddressFormat) {
    if (!isValidAddress(trimmed)) {
      clientValidationError =
        "Invalid EVM wallet address format (must be 0x followed by 40 hex characters).";
    } else if (senderAddress && trimmed.toLowerCase() === senderAddress.toLowerCase()) {
      clientValidationError = "You cannot send a gift to yourself.";
    }
  }

  // Recipient search handler for X usernames or addresses
  const handleSearchRecipient = async () => {
    if (!trimmed || clientValidationError) {
      if (clientValidationError) setSearchError(clientValidationError);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setError(null);

    try {
      const res = await lookupGiftRecipient(trimmed, item.trait.id);
      if (res.success && res.recipient) {
        setVerifiedRecipient(res.recipient);

        // Pre-flight check feedbacks
        if (res.recipient.isSelf) {
          setSearchError("You cannot send a gift to yourself.");
        } else if (res.recipient.alreadyOwnsTrait) {
          setSearchError(
            "Recipient already owns this trait. Gifts cannot duplicate a trait already in recipient inventory.",
          );
        } else if (res.recipient.isWlAllocated) {
          setSearchError("Wallets with an allocated Whitelist slot cannot receive gifts.");
        } else if (res.recipient.isBanned) {
          setSearchError("Recipient account is restricted from receiving gifts.");
        } else if (!res.recipient.address) {
          setSearchError("Recipient does not have a verified wallet address connected.");
        }
      }
    } catch (err: unknown) {
      setVerifiedRecipient(null);
      let msg = err instanceof Error ? err.message : "Failed to find recipient.";
      if (
        msg.includes("JSON") ||
        msg.includes("Unexpected token") ||
        msg.includes("SyntaxError") ||
        msg.includes("fetch failed")
      ) {
        msg = "Unable to connect to the server. Please try again later.";
      }
      setSearchError(msg);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (clientValidationError) {
      setError(clientValidationError);
      return;
    }

    // Determine target recipient address: verified recipient wallet address or direct valid address
    const targetAddress = verifiedRecipient?.address || (isAddressFormat && isValidAddress(trimmed) ? trimmed : null);

    if (!targetAddress) {
      if (!verifiedRecipient && !isAddressFormat) {
        setError("Please search and verify the recipient's X account before sending.");
      } else {
        setError("Recipient address could not be resolved.");
      }
      return;
    }

    if (verifiedRecipient && !verifiedRecipient.canReceive) {
      if (verifiedRecipient.isSelf) {
        setError("You cannot send a gift to yourself.");
      } else if (verifiedRecipient.alreadyOwnsTrait) {
        setError("Recipient already owns this trait.");
      } else if (verifiedRecipient.isWlAllocated) {
        setError("Wallets with an allocated Whitelist slot cannot receive gifts.");
      } else if (verifiedRecipient.isBanned) {
        setError("Recipient is restricted from receiving gifts.");
      }
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await sendGiftRequest(targetAddress, item.id);
      const recipientName = verifiedRecipient?.xUsername
        ? `@${verifiedRecipient.xUsername}`
        : shortenAddress(targetAddress);
      setSuccessMessage(
        `Gift sent successfully! Trait "${item.trait.name}" (#${item.edition}) is now pending acceptance. It will remain active until accepted or cancelled.`,
      );
      onGiftSuccess();
    } catch (err: unknown) {
      let msg = err instanceof Error ? err.message : "Failed to send gift.";
      if (
        msg.includes("JSON") ||
        msg.includes("Unexpected token") ||
        msg.includes("SyntaxError") ||
        msg.includes("fetch failed")
      ) {
        msg = "Unable to connect to the server. Please try again later.";
      }
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Determine if submit is ready:
  // - Address mode: valid address and not self
  // - X username mode: verified recipient with canReceive = true
  const isSubmitDisabled =
    isSubmitting ||
    Boolean(clientValidationError) ||
    (!isAddressFormat && (!verifiedRecipient || !verifiedRecipient.canReceive));

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
              Gift Trait
            </h2>
            <p className="text-xs text-gray-400">
              Transfer an extra item in this category to another ChimpHood holder
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
            <li>You must retain at least 1 item in the {item.trait.category} category.</li>
            <li>Maximum 1 gift sent per wallet per UTC day.</li>
            <li>Recipient must not already own this trait.</li>
            <li>Pending gifts remain active until accepted or cancelled.</li>
            <li>Wallets with an allocated Whitelist slot cannot receive gifts.</li>
          </ul>
        </div>

        {/* Alerts */}
        {(error || searchError) && (
          <div
            role="alert"
            data-testid="gift-send-error"
            className="mb-4 flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-400" />
            <div className="flex-1">{error || searchError}</div>
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
                Recipient X (Twitter) Username or Wallet Address
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    id="receiver-address-input"
                    type="text"
                    data-testid="gift-receiver-input"
                    placeholder="@username or 0x1234...5678"
                    value={receiverInput}
                    onChange={(e) => {
                      setReceiverInput(e.target.value);
                      if (error) setError(null);
                      if (searchError) setSearchError(null);
                      if (verifiedRecipient) setVerifiedRecipient(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !isAddressFormat && !verifiedRecipient) {
                        e.preventDefault();
                        handleSearchRecipient();
                      }
                    }}
                    disabled={isSubmitting || isSearching}
                    className="w-full rounded-lg border border-gray-700 bg-gray-900/80 px-3.5 py-2.5 font-mono text-sm text-white placeholder-gray-500 transition-colors focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none disabled:opacity-50"
                  />
                </div>
                {!isAddressFormat && trimmed && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    data-testid="search-recipient-btn"
                    onClick={handleSearchRecipient}
                    disabled={isSearching || !trimmed}
                    className="h-10 border-teal-500/30 text-teal-300 hover:bg-teal-500/10"
                  >
                    {isSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    <span className="ml-1.5 hidden sm:inline">Verify</span>
                  </Button>
                )}
              </div>

              {trimmed && clientValidationError && (
                <p
                  data-testid="gift-validation-message"
                  className="mt-1.5 text-[11px] text-amber-400"
                >
                  {clientValidationError}
                </p>
              )}

              {/* Verified Recipient Confirmation Card */}
              {verifiedRecipient && (
                <div
                  data-testid="recipient-confirmation-card"
                  className={`mt-3 flex items-center justify-between rounded-xl border p-3 ${
                    verifiedRecipient.canReceive
                      ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-200"
                      : "border-amber-500/40 bg-amber-950/20 text-amber-200"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full border border-gray-700 bg-gray-800">
                      {verifiedRecipient.profileImageUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={verifiedRecipient.profileImageUrl}
                          alt={verifiedRecipient.xUsername || "Recipient"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-500">
                          <UserCheck className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-white text-sm">
                          {verifiedRecipient.xName || verifiedRecipient.xUsername}
                        </span>
                        {verifiedRecipient.xUsername && (
                          <span className="text-xs text-teal-400">
                            @{verifiedRecipient.xUsername}
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-[10px] text-gray-400">
                        {verifiedRecipient.address
                          ? shortenAddress(verifiedRecipient.address)
                          : "No wallet"}
                      </p>
                    </div>
                  </div>

                  <div>
                    {verifiedRecipient.canReceive ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-400">
                        Ineligible
                      </span>
                    )}
                  </div>
                </div>
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
                disabled={isSubmitDisabled}
                className="bg-teal-600 hover:bg-teal-500 active:bg-teal-700"
              >
                {isSubmitting ? "Sending..." : "Confirm & Send Gift"}
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
