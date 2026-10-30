"use client";

import React, { useState, useEffect, Suspense } from "react";
import { User, Shield, AlertTriangle, Sparkles, CheckCircle2 } from "lucide-react";
import * as navigation from "next/navigation";

function XLogo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 23.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
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
import { useSiweAuth } from "@/hooks/useSiweAuth";
import {
  fetchWhitelistStatus,
  type WhitelistStatusResponse,
} from "@/lib/whitelist/client";
import * as inventoryClient from "@/lib/inventory/client";
import type { InventoryItemData } from "@/lib/inventory/client";
import * as giftClient from "@/lib/inventory/gift-client";
import type { GiftItemData } from "@/lib/inventory/gift-client";
import { TraitGrid } from "@/components/inventory/TraitGrid";
import { GiftsSection } from "@/components/inventory/GiftsSection";
import { GiftModal } from "@/components/inventory/GiftModal";
import { UserAvatar } from "@/components/inventory/UserAvatar";
import { shortenAddress } from "@/lib/auth/address";

const TRAIT_CATEGORIES = ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"] as const;

function getNavigationSearchParams(): URLSearchParams | null {
  try {
    const nav = navigation as { useSearchParams?: () => URLSearchParams };
    if (nav && typeof nav.useSearchParams === "function") {
      return nav.useSearchParams();
    }
  } catch {
    // Fallback for test environments where useSearchParams is not in next/navigation mock
  }
  if (typeof window !== "undefined") {
    return new URLSearchParams(window.location.search);
  }
  return null;
}

function ProfileContent() {
  const searchParams = getNavigationSearchParams();
  const xLinked = searchParams?.get("x_linked");
  const xError = searchParams?.get("x_error") || searchParams?.get("error");

  const { status, sessionAddress, walletAddress } = useSiweAuth();
  const address = sessionAddress || walletAddress;
  const [wlData, setWlData] = useState<WhitelistStatusResponse | null>(null);
  const [loadedAddress, setLoadedAddress] = useState<string | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemData[]>([]);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [xActionError, setXActionError] = useState<string | null>(null);

  // Gifting state (I-1)
  const [sentGifts, setSentGifts] = useState<GiftItemData[]>([]);
  const [receivedGifts, setReceivedGifts] = useState<GiftItemData[]>([]);
  const [isGiftsLoading, setIsGiftsLoading] = useState(false);
  const [selectedItemForGift, setSelectedItemForGift] =
    useState<InventoryItemData | null>(null);
  const [isGiftModalOpen, setIsGiftModalOpen] = useState(false);

  // Avatar state (I-3)
  const [avatarVersion, setAvatarVersion] = useState<number>(() => Date.now());
  const ownedCategories = new Set(inventoryItems.map((item) => item.trait.category));

  const xErrorMessage =
    xActionError ||
    (xError
      ? xError === "access_denied"
        ? "Authorization was denied by user. Please try connecting your X account again."
        : `Failed to link X account (${xError}). Please try again.`
      : null);

  const handleLinkX = () => {
    if (status !== "authenticated") {
      setXActionError("Please connect and authenticate your Web3 wallet first.");
      return;
    }

    setIsLinking(true);
    setXActionError(null);
    fetch("/api/social/x/connect")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || "Failed to initiate X connection.");
        }
        return data;
      })
      .then((data) => {
        if (data.url) {
          window.location.href = data.url;
        } else {
          throw new Error(
            data.message || "X OAuth is not configured in this environment.",
          );
        }
      })
      .catch((err) => {
        setIsLinking(false);
        setXActionError(err.message || "X OAuth is not configured in this environment.");
      });
  };

  const isInventoryLoading = Boolean(
    address && loadedAddress !== address && !inventoryError,
  );

  const refreshInventory = React.useCallback(
    async (targetAddress?: string) => {
      const addr = targetAddress || address;
      if (!addr) return;
      try {
        const data = await inventoryClient.fetchUserInventory(addr);
        setInventoryItems(data.items || []);
        setLoadedAddress(addr);
        setInventoryError(null);
        setAvatarVersion(Date.now());
      } catch (err: unknown) {
        console.error("Error fetching profile inventory:", err);
        const msg = err instanceof Error ? err.message : "Failed to load inventory.";
        setInventoryError(msg);
        setLoadedAddress(addr);
      }
    },
    [address],
  );

  const refreshGifts = React.useCallback(async () => {
    // If inventoryClient is mocked in tests without gifting, skip fetching gifts
    if (!("fetchUserGifts" in inventoryClient)) return;
    setIsGiftsLoading(true);
    try {
      const data = await giftClient.fetchUserGifts();
      setSentGifts(data.sentGifts || []);
      setReceivedGifts(data.receivedGifts || []);
    } catch (err: unknown) {
      console.error("Error fetching profile gifts:", err);
    } finally {
      setIsGiftsLoading(false);
    }
  }, []);

  const handleRefreshAll = React.useCallback(async () => {
    await Promise.all([refreshInventory(), refreshGifts()]);
    setAvatarVersion(Date.now());
  }, [refreshInventory, refreshGifts]);

  const handleOpenGiftModal = (item: InventoryItemData) => {
    setSelectedItemForGift(item);
    setIsGiftModalOpen(true);
  };

  useEffect(() => {
    if (status === "authenticated" && address) {
      fetchWhitelistStatus(address)
        .then(setWlData)
        .catch((err) => console.error("Error fetching profile WL status:", err));
    }
  }, [status, address, xLinked]);

  useEffect(() => {
    let ignore = false;
    if (address) {
      inventoryClient
        .fetchUserInventory(address)
        .then((data) => {
          if (!ignore) {
            setInventoryItems(data.items || []);
            setLoadedAddress(address);
            setInventoryError(null);
          }
        })
        .catch((err: unknown) => {
          if (!ignore) {
            console.error("Error fetching profile inventory:", err);
            const msg = err instanceof Error ? err.message : "Failed to load inventory.";
            setInventoryError(msg);
            setLoadedAddress(address);
          }
        });
    }
    return () => {
      ignore = true;
    };
  }, [address]);

  useEffect(() => {
    let ignore = false;
    if (status === "authenticated" && "fetchUserGifts" in inventoryClient) {
      giftClient
        .fetchUserGifts()
        .then((data) => {
          if (!ignore) {
            setSentGifts(data.sentGifts || []);
            setReceivedGifts(data.receivedGifts || []);
          }
        })
        .catch((err: unknown) => {
          if (!ignore) {
            console.error("Error fetching profile gifts:", err);
          }
        });
    }
    return () => {
      ignore = true;
    };
  }, [status]);

  const isXConnected = Boolean(wlData?.status?.details?.hasLinkedX);
  const currentXUsername = wlData?.status?.details?.xUsername;
  const currentXProfileImg = wlData?.status?.details?.xProfileImageUrl;

  // Track which specific URL failed so the error flag auto-resets when the URL changes
  const [failedXAvatarUrl, setFailedXAvatarUrl] = React.useState<string | null>(null);
  const xAvatarError = failedXAvatarUrl !== null && failedXAvatarUrl === currentXProfileImg;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Page Header with User Profile (Twitter PFP / Fallback) */}
      <div className="mb-8 flex flex-col items-start gap-5 rounded-2xl border border-gray-800 bg-[#0c0e17]/60 p-6 backdrop-blur sm:flex-row sm:items-center">
        {currentXProfileImg && !xAvatarError ? (
          <img
            src={currentXProfileImg}
            alt={currentXUsername || "User Profile"}
            className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl border-2 border-emerald-500/30 object-cover shadow-lg"
            onError={() => setFailedXAvatarUrl(currentXProfileImg ?? null)}
          />
        ) : (
          <UserAvatar
            identifier={address}
            hasInventory={inventoryItems.length > 0}
            version={avatarVersion}
            size="xl"
            showRefreshButton={status === "authenticated" && inventoryItems.length > 0}
            onRefresh={handleRefreshAll}
          />
        )}
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-white">User Profile</h1>
            <Badge variant="default">Stage 3</Badge>
          </div>
          <p className="text-sm text-gray-400">
            {currentXUsername
              ? `Connected via X (@${currentXUsername}) and Web3 Wallet.`
              : "Integrated identity management for Web3 Wallets and X (Twitter) accounts."}
          </p>
          {address && (
            <p className="font-mono text-xs text-gray-400">
              Connected:{" "}
              <span className="text-emerald-400">{shortenAddress(address)}</span>
            </p>
          )}
        </div>
      </div>

      {/* Callback / Status Feedback Alerts */}
      {xLinked && (
        <div
          role="status"
          data-testid="x-link-success-banner"
          className="mb-8 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-400" />
            <div>
              <p className="font-semibold text-emerald-400">
                X Account Successfully Linked
              </p>
              <p className="mt-0.5 text-sm text-gray-300">
                Your X (Twitter) profile has been verified and connected to your account.
              </p>
            </div>
          </div>
        </div>
      )}

      {xErrorMessage && (
        <div
          role="alert"
          data-testid="x-link-error-banner"
          className="mb-8 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-rose-200"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-400" />
            <div>
              <p className="font-semibold text-rose-400">X Authentication Failed</p>
              <p className="mt-0.5 text-sm text-gray-300">{xErrorMessage}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Wallet Connection Section — live SIWE login (Stage 2) */}
        <WalletConnectCard />

        {/* X (Twitter) Account Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-sky-500/10 p-2 text-sky-400">
                <XLogo className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>X (Twitter) Identity</CardTitle>
                <CardDescription>Social account verification status</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-dashed border-gray-700 bg-gray-900/40 p-4 text-center">
              {isXConnected && currentXProfileImg && !xAvatarError ? (
                <div className="flex items-center justify-center gap-3 py-1">
                  <img
                    src={currentXProfileImg}
                    alt={currentXUsername || "X Profile"}
                    className="h-10 w-10 rounded-full border border-sky-400/30 object-cover shadow"
                    onError={() => setFailedXAvatarUrl(currentXProfileImg ?? null)}
                  />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-white">
                      Status: Connected (@{currentXUsername})
                    </p>
                    <p className="mt-0.5 text-xs text-sky-400">
                      @{currentXUsername} &bull;{" "}
                      <span className="font-medium text-emerald-400">Verified</span>
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-400">
                    {isXConnected
                      ? `Status: Connected (@${currentXUsername})`
                      : "Status: Not Connected"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {currentXUsername
                      ? `@${currentXUsername}`
                      : "No X account linked"}
                  </p>
                </>
              )}
            </div>
            <Button
              variant={isXConnected ? "outline" : "primary"}
              className="w-full"
              disabled={isLinking || isXConnected}
              onClick={handleLinkX}
            >
              {isLinking
                ? "Connecting..."
                : isXConnected
                  ? "X Account Connected"
                  : "Link X Account"}
            </Button>
          </CardContent>
        </Card>

        {/* Tier & Allocation Overview */}
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-500/10 p-2 text-purple-400">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Community Tier & Whitelist Status</CardTitle>
                  <CardDescription>
                    Membership tier and Whitelist allocation associated with your account
                  </CardDescription>
                </div>
              </div>
              {wlData?.status?.phase === "SLOT_ALLOCATED" ? (
                <Badge variant="default" className="bg-emerald-500/20 text-emerald-300">
                  WL Slot #{wlData.status.slotNumber}
                </Badge>
              ) : wlData?.status?.phase === "IN_QUEUE" ? (
                <Badge variant="warning" className="bg-amber-500/20 text-amber-300">
                  Queue Rank #{wlData.status.queueRank ?? wlData.status.queueNumber}
                </Badge>
              ) : (
                <Badge variant="outline">Tier Unassigned</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-900/60 p-4 text-sm text-gray-400">
              <p>
                Tier status, reward points, and Whitelist balances will be displayed here
                once Stage 2 authentication and allocation engines are linked.
              </p>
              {wlData?.status && (
                <div className="border-t border-gray-800 pt-2 text-xs text-gray-300">
                  <span className="font-semibold text-emerald-400">
                    Live Stage 3 Status:
                  </span>{" "}
                  Phase: {wlData.status.phase} | Categories:{" "}
                  {wlData.status.details?.heldCategories?.length ?? 0}/5 Held | Tasks:{" "}
                  {wlData.status.details?.completedMandatoryTasksCount ?? 0}/
                  {wlData.status.details?.totalMandatoryTasksCount ?? 0} Verified
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Collection & Inventory Overview */}
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Collection & Inventory</CardTitle>
                  <CardDescription>
                    Collected ChimpHood Traits, items, and ecosystem collectibles
                  </CardDescription>
                </div>
              </div>
              {isInventoryLoading ? (
                <Badge variant="outline">Loading...</Badge>
              ) : inventoryError ? (
                <Badge variant="warning">Inventory Error</Badge>
              ) : inventoryItems.length > 0 ? (
                <Badge variant="default">
                  {inventoryItems.length} {inventoryItems.length === 1 ? "Item" : "Items"}
                </Badge>
              ) : (
                <Badge variant="outline">Inventory Empty</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isInventoryLoading ? (
              <div
                data-testid="inventory-loading"
                className="rounded-lg border border-gray-800 bg-gray-900/40 p-6 text-center"
              >
                <p className="text-sm font-medium text-gray-400">
                  Loading your inventory...
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Fetching collected traits and items.
                </p>
              </div>
            ) : inventoryError ? (
              <div
                data-testid="inventory-error"
                className="rounded-lg border border-rose-900/30 bg-rose-950/20 p-6 text-center"
              >
                <p className="text-sm font-medium text-rose-400">
                  Unable to load inventory
                </p>
                <p className="mt-1 text-xs text-gray-400">{inventoryError}</p>
              </div>
            ) : inventoryItems.length > 0 ? (
              <div className="space-y-6">
                {/* 5-Category Trait Collection Overview */}
                <div
                  className="rounded-lg border border-gray-800 bg-gray-950/60 p-4"
                  data-testid="trait-collection-summary"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-xs font-semibold tracking-wider text-gray-400 uppercase">
                      Trait Collection (
                      {TRAIT_CATEGORIES.filter((c) => ownedCategories.has(c)).length}/5
                      Categories Owned)
                    </h4>
                    <span className="text-xs text-gray-400">
                      {TRAIT_CATEGORIES.every((c) => ownedCategories.has(c))
                        ? "Full Character Set Complete"
                        : "Collect all 5 categories to complete avatar"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {TRAIT_CATEGORIES.map((category) => {
                      const isHeld = ownedCategories.has(category);
                      return (
                        <div
                          key={category}
                          data-testid={`collection-category-${category.toLowerCase()}`}
                          className={`flex items-center gap-2 rounded-lg border p-2.5 text-xs transition-colors ${
                            isHeld
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 shadow-sm"
                              : "border-gray-800 bg-gray-900/30 text-gray-500 opacity-60 grayscale"
                          }`}
                        >
                          {isHeld ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                          ) : (
                            <div className="h-4 w-4 shrink-0 rounded-full border border-gray-600 bg-gray-800" />
                          )}
                          <span className="font-semibold tracking-wide">{category}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <TraitGrid items={inventoryItems} onGiftItem={handleOpenGiftModal} />
              </div>
            ) : (
              <div data-testid="inventory-empty" className="space-y-6">
                {/* 5-Category Trait Collection Overview */}
                <div
                  className="rounded-lg border border-gray-800 bg-gray-950/60 p-4"
                  data-testid="trait-collection-summary"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-xs font-semibold tracking-wider text-gray-400 uppercase">
                      Trait Collection (0/5 Categories Owned)
                    </h4>
                    <span className="text-xs text-amber-400/80">
                      Collect all 5 categories to assemble your Chimp
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {TRAIT_CATEGORIES.map((category) => (
                      <div
                        key={category}
                        data-testid={`collection-category-${category.toLowerCase()}`}
                        className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/30 p-2.5 text-xs text-gray-500 opacity-60 grayscale transition-colors"
                      >
                        <div className="h-4 w-4 shrink-0 rounded-full border border-gray-600 bg-gray-800" />
                        <span className="font-semibold tracking-wide">{category}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Base Chimp Character Showcase */}
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-800 bg-gray-900/40 p-8 text-center sm:flex-row sm:gap-10 sm:text-left">
                  <div className="relative mb-6 flex-shrink-0 sm:mb-0">
                    <div className="h-52 w-52 overflow-hidden rounded-3xl border-2 border-dashed border-gray-700 bg-[#0c0e17] shadow-2xl sm:h-60 sm:w-60">
                      <img
                        src="/images/chimp-base-bw.png"
                        alt="Unrevealed Base Chimp"
                        className="h-full w-full object-cover [image-rendering:pixelated]"
                      />
                    </div>
                    <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-gray-700 bg-gray-900 px-3 py-1 text-xs font-semibold text-gray-300 uppercase tracking-wider shadow-md">
                      Base Chimp
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-base font-semibold text-white">
                      No items or traits found in your inventory
                    </h3>
                    <p className="max-w-md text-xs text-gray-400 leading-relaxed">
                      This is your Base Chimp canvas. Claim traits during active drops or receive gifts from peers to reveal your colored ChimpHood avatar and qualify for the Whitelist!
                    </p>
                    <div className="pt-2">
                      <a
                        href="/whitelist"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                      >
                        Go to Drops & Claim
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gifting & Peer Transfers Section (I-1) */}
        {status === "authenticated" && (
          <GiftsSection
            sentGifts={sentGifts}
            receivedGifts={receivedGifts}
            isLoading={isGiftsLoading}
            isWlAllocated={wlData?.status?.phase === "SLOT_ALLOCATED"}
            onRefresh={handleRefreshAll}
          />
        )}
      </div>

      {/* Gift Modal for Sending Duplicate Traits */}
      <GiftModal
        isOpen={isGiftModalOpen}
        onClose={() => setIsGiftModalOpen(false)}
        item={selectedItemForGift}
        senderAddress={address}
        onGiftSuccess={handleRefreshAll}
      />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-4 py-12 text-gray-400 sm:px-6 lg:px-8">
          Loading profile...
        </div>
      }
    >
      <ProfileContent />
    </Suspense>
  );
}
