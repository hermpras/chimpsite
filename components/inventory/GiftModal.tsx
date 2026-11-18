import React, { useState } from "react";
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

const CATEGORY_BADGE_STYLES: Record<string, string> = {
  BG: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  FUR: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  CLOTHING: "border-violet-500/30 bg-violet-500/10 text-violet-400",
  HEADWEAR: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  EYEWEAR: "border-teal-500/30 bg-teal-500/10 text-teal-400",
};

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
    >
      <div className="relative w-full max-w-lg rounded-3xl border border-[#34B7DD]/40 bg-[#071F27]/95 p-6 sm:p-7 shadow-[0_0_50px_rgba(0,0,0,0.8),0_0_24px_rgba(52,183,221,0.15)] backdrop-blur-2xl">
        {/* Close Button */}
        <button
          onClick={handleClose}
          disabled={isSubmitting}
          data-testid="gift-modal-close"
          className="absolute top-4 right-4 rounded-xl border border-[#34B7DD]/40 bg-[#07242C]/70 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider text-cyan-300 hover:border-cyan-400 hover:text-white hover:bg-[#0E3A47]/80 cursor-pointer transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] disabled:opacity-50"
          aria-label="Close modal"
        >
          CLOSE
        </button>

        {/* Modal Header */}
        <div className="mb-5">
          <h2 id="gift-modal-title" className="text-xl sm:text-2xl font-black uppercase tracking-wide text-white">
            Gift Trait
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-[#8AA8B2]">
            Transfer an extra item in this category to another Elychimp holder on Elysium
          </p>
        </div>

        {/* Selected Trait Preview */}
        <div className="mb-5 flex items-center gap-4 rounded-2xl border border-[#163B44] bg-[#0B2026]/90 p-4">
          <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-[#102B33] border border-[#163B44]">
            {item.trait.imageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={item.trait.imageUrl}
                alt={item.trait.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs font-mono font-bold uppercase text-gray-400">
                {item.trait.category}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold tracking-wider uppercase ${
                  CATEGORY_BADGE_STYLES[item.trait.category] || "border-[#163B44] bg-[#102B33] text-gray-300"
                }`}
              >
                {item.trait.category}
              </span>
              <span className="rounded-md bg-[#102B33] px-2 py-0.5 font-mono text-xs text-gray-300">
                #{item.edition}
              </span>
            </div>
            <p className="mt-1 truncate text-sm sm:text-base font-semibold text-white">{item.trait.name}</p>
          </div>
        </div>

        {/* Established Gifting Rules Banner */}
        <div className="mb-5 space-y-2 rounded-2xl border border-purple-500/30 bg-purple-950/20 p-4 text-xs sm:text-sm text-purple-200">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-xs sm:text-sm text-purple-300">
            <span>Gifting Invariants & Rules:</span>
          </div>
          <ul className="list-inside list-disc space-y-1 text-xs sm:text-sm text-gray-300 leading-relaxed">
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
            className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs sm:text-sm text-rose-300"
          >
            <div className="flex-1">{error || searchError}</div>
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            data-testid="gift-send-success"
            className="mb-4 flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs sm:text-sm text-emerald-300"
          >
            <div className="flex-1">{successMessage}</div>
          </div>
        )}

        {/* Recipient Form */}
        {!successMessage ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="receiver-address-input"
                className="mb-1.5 block text-xs sm:text-sm font-semibold text-gray-300"
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
                    className="w-full rounded-xl border border-[#163B44] bg-[#051D22]/90 px-4 py-2.5 font-mono text-sm text-white placeholder-gray-500 transition-colors focus:border-[#34B7DD] focus:ring-1 focus:ring-[#34B7DD] focus:outline-none disabled:opacity-50"
                  />
                </div>
                {!isAddressFormat && trimmed && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    data-testid="search-recipient-btn"
                    onClick={handleSearchRecipient}
                    disabled={isSearching || !trimmed}
                    className="h-11 px-4 rounded-xl text-xs sm:text-sm font-extrabold uppercase tracking-wider"
                  >
                    <span>{isSearching ? "Verifying..." : "Verify"}</span>
                  </Button>
                )}
              </div>

              {trimmed && clientValidationError && (
                <p
                  data-testid="gift-validation-message"
                  className="mt-1.5 text-xs sm:text-sm text-amber-400 font-medium"
                >
                  {clientValidationError}
                </p>
              )}

              {/* Verified Recipient Confirmation Card */}
              {verifiedRecipient && (
                <div
                  data-testid="recipient-confirmation-card"
                  className={`mt-3 flex items-center justify-between rounded-2xl border p-3.5 ${
                    verifiedRecipient.canReceive
                      ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-200"
                      : "border-amber-500/40 bg-amber-950/20 text-amber-200"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full border border-[#163B44] bg-[#102B33]">
                      {verifiedRecipient.profileImageUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={verifiedRecipient.profileImageUrl}
                          alt={verifiedRecipient.xUsername || "Recipient"}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center font-mono text-xs font-bold text-teal-400">
                          @
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
                      <p className="font-mono text-xs text-gray-400">
                        {verifiedRecipient.address
                          ? shortenAddress(verifiedRecipient.address)
                          : "No wallet"}
                      </p>
                    </div>
                  </div>

                  <div>
                    {verifiedRecipient.canReceive ? (
                      <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                        Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-400">
                        Ineligible
                      </span>
                    )}
                  </div>
                </div>
              )}

              {senderAddress && (
                <p className="mt-1 text-xs sm:text-sm text-gray-400">
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
                className="rounded-xl border-[#34B7DD]/40 bg-[#07242C]/70 text-cyan-300 hover:border-cyan-400 hover:bg-[#0E3A47]/80 hover:text-white font-extrabold text-xs sm:text-sm tracking-wider"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                data-testid="send-gift-submit"
                disabled={isSubmitDisabled}
                className="rounded-xl font-black text-xs sm:text-sm tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Sending..." : "Confirm & Send Gift"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              variant="primary"
              data-testid="gift-success-done"
              onClick={handleClose}
              className="rounded-xl font-black text-xs sm:text-sm tracking-wider px-6"
            >
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
