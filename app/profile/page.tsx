"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import {
  User,
  Shield,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Info,
  Gift,
} from "lucide-react";
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
  type WLSlotReviewStatus,
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
import { normalizeXAvatarUrl } from "@/lib/social/x-avatar";

const TRAIT_CATEGORIES = ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"] as const;

const CATEGORY_THEMES: Record<
  string,
  { heldClass: string; unheldClass: string; checkColor: string; badgeClass: string }
> = {
  BG: {
    heldClass: "border-sky-500/40 bg-sky-500/10 text-sky-300",
    unheldClass: "border-gray-800 bg-gray-800/20 text-gray-500",
    checkColor: "text-sky-400",
    badgeClass: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  },
  FUR: {
    heldClass: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    unheldClass: "border-gray-800 bg-gray-800/20 text-gray-500",
    checkColor: "text-amber-400",
    badgeClass: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  },
  CLOTHING: {
    heldClass: "border-violet-500/40 bg-violet-500/10 text-violet-300",
    unheldClass: "border-gray-800 bg-gray-800/20 text-gray-500",
    checkColor: "text-violet-400",
    badgeClass: "border-violet-500/30 bg-violet-500/10 text-violet-400",
  },
  HEADWEAR: {
    heldClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    unheldClass: "border-gray-800 bg-gray-800/20 text-gray-500",
    checkColor: "text-emerald-400",
    badgeClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  },
  EYEWEAR: {
    heldClass: "border-teal-500/40 bg-teal-500/10 text-teal-300",
    unheldClass: "border-gray-800 bg-gray-800/20 text-gray-500",
    checkColor: "text-teal-400",
    badgeClass: "border-teal-500/30 bg-teal-500/10 text-teal-400",
  },
};

function getGtdReviewDetails(reviewStatus?: WLSlotReviewStatus) {
  switch (reviewStatus) {
    case "VALID":
      return {
        label: "Verified",
        subtext: "Verified — All criteria confirmed by team.",
        badgeVariant: "default" as const,
        colorClass: "border-emerald-500/30 bg-emerald-500/20 text-emerald-300",
        icon: CheckCircle2,
      };
    case "UNDER_REVIEW":
      return {
        label: "Under Verification",
        subtext: "Under Verification — Account details being audited.",
        badgeVariant: "warning" as const,
        colorClass: "border-amber-500/30 bg-amber-500/20 text-amber-300",
        icon: Clock,
      };
    case "FLAGGED":
      return {
        label: "Notice / Action Required",
        subtext:
          "Notice — Please review your linked accounts and task requirements. Slot remains active.",
        badgeVariant: "warning" as const,
        colorClass: "border-rose-500/30 bg-rose-500/20 text-rose-300",
        icon: AlertCircle,
      };
    case "NOT_REVIEWED":
    default:
      return {
        label: "Pending Routine Review",
        subtext: "Slot Confirmed — Routine verification in progress.",
        badgeVariant: "outline" as const,
        colorClass: "border-blue-500/30 bg-blue-500/10 text-blue-300",
        icon: Info,
      };
  }
}

function formatRegistrationDate(dateString?: string): string {
  if (!dateString) return "";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateString;
  }
}

function getWhitelistSummaryBadge(
  status?: WhitelistStatusResponse["status"] | null,
  isAuthenticated?: boolean,
) {
  if (!isAuthenticated) {
    return (
      <Badge variant="outline" className="text-gray-400">
        Wallet Not Connected
      </Badge>
    );
  }
  if (!status) {
    return (
      <Badge variant="outline" className="text-gray-400">
        WL Status: Loading...
      </Badge>
    );
  }
  switch (status.phase) {
    case "SLOT_ALLOCATED":
      return (
        <Badge
          variant="default"
          className="border-emerald-500/30 bg-emerald-500/20 text-emerald-300 font-semibold"
        >
          WL Status: Guaranteed Slot #{status.slotNumber}
        </Badge>
      );
    case "FCFS_REGISTERED":
      return (
        <Badge
          variant="default"
          className="border-blue-500/30 bg-blue-500/20 text-blue-300 font-semibold"
        >
          WL Status: FCFS Directory #{status.queueNumber}
        </Badge>
      );
    case "REVOKED":
      return (
        <Badge
          variant="outline"
          className="border-rose-500/40 bg-rose-500/20 text-rose-300 font-semibold"
        >
          WL Status: REVOKED
        </Badge>
      );
    case "NONE":
    default:
      return (
        <Badge variant="outline" className="text-gray-400">
          WL Status: Not Registered
        </Badge>
      );
  }
}

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

type ProfileTab = "overview" | "collection" | "gifts";

function ProfileContent() {
  const searchParams = getNavigationSearchParams();
  const xLinked = searchParams?.get("x_linked");
  const xError = searchParams?.get("x_error") || searchParams?.get("error");

  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");

  const { status, sessionAddress, walletAddress } = useSiweAuth();
  const address = sessionAddress || walletAddress;
  const [wlData, setWlData] = useState<WhitelistStatusResponse | null>(null);
  const [xStatusData, setXStatusData] = useState<{
    connected?: boolean;
    identity?: {
      xId?: string;
      username?: string;
      profileImageUrl?: string | null;
    } | null;
  } | null>(null);
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
    if (status !== "authenticated") {
      return;
    }

    fetch("/api/social/x/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!ignore && data) {
          setXStatusData(data);
        }
      })
      .catch(() => {});

    return () => {
      ignore = true;
    };
  }, [status, xLinked]);

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

  const isXConnected =
    status === "authenticated" &&
    (Boolean(wlData?.status?.details?.hasLinkedX) || Boolean(xStatusData?.connected));
  const currentXUsername =
    status === "authenticated"
      ? wlData?.status?.details?.xUsername || xStatusData?.identity?.username
      : undefined;
  const rawXProfileImg =
    status === "authenticated"
      ? wlData?.status?.details?.xProfileImageUrl || xStatusData?.identity?.profileImageUrl
      : undefined;
  const currentXProfileImg = normalizeXAvatarUrl(rawXProfileImg);

  // Track which specific URL failed so the error flag auto-resets when the URL changes
  const [failedXAvatarUrl, setFailedXAvatarUrl] = React.useState<string | null>(null);
  const xAvatarError = failedXAvatarUrl !== null && failedXAvatarUrl === currentXProfileImg;

  // Whitelist trait and task progress tracking
  const heldCategoriesFromWl = wlData?.status?.details?.heldCategories;
  const heldCategoriesSet = new Set(
    heldCategoriesFromWl ?? inventoryItems.map((item) => item.trait.category),
  );
  const heldCategoriesCount = heldCategoriesFromWl
    ? heldCategoriesFromWl.length
    : TRAIT_CATEGORIES.filter((c) => ownedCategories.has(c)).length;

  const mandatoryTasksCompleted =
    wlData?.status?.details?.completedMandatoryTasksCount ?? 0;
  const mandatoryTasksTotal =
    wlData?.status?.details?.totalMandatoryTasksCount ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Page Header with Character Avatar & Profile Overview */}
      <div className="mb-8 flex flex-col items-start gap-5 rounded-2xl border border-gray-800 bg-[#0c0e17]/60 p-6 backdrop-blur sm:flex-row sm:items-center">
        <UserAvatar
          identifier={address}
          hasInventory={inventoryItems.length > 0}
          version={avatarVersion}
          size="xl"
          showRefreshButton={status === "authenticated" && inventoryItems.length > 0}
          onRefresh={handleRefreshAll}
        />
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-white">User Profile</h1>
            {getWhitelistSummaryBadge(wlData?.status, status === "authenticated")}
          </div>
          <p className="text-sm text-gray-400">
            Integrated identity management for Web3 Wallets and X (Twitter) accounts.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {address ? (
              <p className="font-mono text-gray-400">
                Connected:{" "}
                <span className="text-emerald-400" title={address}>
                  {shortenAddress(address)}
                </span>
              </p>
            ) : (
              <p className="text-gray-500">Wallet: Not Connected</p>
            )}
            <span className="text-gray-600 hidden sm:inline">•</span>
            {isXConnected && currentXUsername ? (
              <p className="text-gray-400">
                X Account:{" "}
                <span className="text-sky-400 font-medium">@{currentXUsername} (Connected)</span>
              </p>
            ) : (
              <p className="text-gray-500">X Account: Not Connected</p>
            )}
          </div>
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
              <div className="mt-2.5">
                <Link
                  href="/whitelist"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                >
                  <span>Continue in Whitelist Portal &rarr;</span>
                </Link>
              </div>
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

      {/* Profile Tab Navigation */}
      <div
        role="tablist"
        aria-label="Profile navigation"
        className="mb-8 border-b border-gray-800"
      >
        <div className="flex gap-2 sm:gap-6 overflow-x-auto">
          <button
            type="button"
            role="tab"
            id="tab-overview"
            aria-controls="panel-overview"
            aria-selected={activeTab === "overview"}
            tabIndex={activeTab === "overview" ? 0 : -1}
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${
              activeTab === "overview"
                ? "border-emerald-400 text-emerald-400"
                : "border-transparent text-gray-400 hover:border-gray-700 hover:text-gray-200"
            }`}
          >
            <User className="h-4 w-4" />
            <span>Overview</span>
          </button>
          <button
            type="button"
            role="tab"
            id="tab-collection"
            aria-controls="panel-collection"
            aria-selected={activeTab === "collection"}
            tabIndex={activeTab === "collection" ? 0 : -1}
            onClick={() => setActiveTab("collection")}
            className={`flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${
              activeTab === "collection"
                ? "border-emerald-400 text-emerald-400"
                : "border-transparent text-gray-400 hover:border-gray-700 hover:text-gray-200"
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span>Collection</span>
          </button>
          <button
            type="button"
            role="tab"
            id="tab-gifts"
            aria-controls="panel-gifts"
            aria-selected={activeTab === "gifts"}
            tabIndex={activeTab === "gifts" ? 0 : -1}
            onClick={() => setActiveTab("gifts")}
            className={`flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${
              activeTab === "gifts"
                ? "border-emerald-400 text-emerald-400"
                : "border-transparent text-gray-400 hover:border-gray-700 hover:text-gray-200"
            }`}
          >
            <Gift className="h-4 w-4" />
            <span>Gifts</span>
          </button>
        </div>
      </div>

      {/* 1. Overview Tab Panel */}
      <div
        role="tabpanel"
        id="panel-overview"
        aria-labelledby="tab-overview"
        className={activeTab === "overview" ? "block" : "hidden"}
      >
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
              {isXConnected ? (
                <div className="flex items-center justify-center gap-3 py-1">
                  {currentXProfileImg && !xAvatarError ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={currentXProfileImg}
                      alt={currentXUsername || "X Profile"}
                      data-testid="x-profile-avatar"
                      referrerPolicy="no-referrer"
                      className="h-10 w-10 rounded-full border border-sky-400/30 object-cover shadow"
                      onError={() => setFailedXAvatarUrl(currentXProfileImg ?? null)}
                    />
                  ) : (
                    <div
                      data-testid="x-avatar-fallback"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sky-400/30 bg-sky-500/10 text-sky-400 shadow"
                      title={currentXUsername ? `@${currentXUsername} (avatar unavailable)` : "X avatar unavailable"}
                    >
                      <XLogo className="h-5 w-5" />
                    </div>
                  )}
                  <div className="text-left">
                    <p className="text-sm font-semibold text-white">
                      Status: Connected
                    </p>
                    <p className="mt-0.5 text-xs text-sky-400">
                      @{currentXUsername}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-400">
                    Status: Not Connected
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
              disabled={isLinking || isXConnected || status !== "authenticated"}
              onClick={handleLinkX}
            >
              {isLinking
                ? "Connecting..."
                : isXConnected
                  ? "X Account Connected"
                  : "Link X Account"}
            </Button>
            {status !== "authenticated" && (
              <p className="text-center text-xs text-gray-400">
                Connect and authenticate your Web3 wallet first to enable X linking.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Tier & Allocation Overview */}
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
              <div>
                {status !== "authenticated" ? (
                  <Badge variant="outline">Tier Unassigned</Badge>
                ) : wlData?.status?.phase === "SLOT_ALLOCATED" ? (
                  <Badge
                    variant="default"
                    className="border-emerald-500/30 bg-emerald-500/20 text-emerald-300 font-semibold"
                  >
                    WL Slot #{wlData.status.slotNumber}
                  </Badge>
                ) : wlData?.status?.phase === "FCFS_REGISTERED" ? (
                  <Badge
                    variant="default"
                    className="border-blue-500/30 bg-blue-500/20 text-blue-300 font-semibold"
                  >
                    FCFS Directory #{wlData.status.queueNumber}
                  </Badge>
                ) : wlData?.status?.phase === "REVOKED" ? (
                  <Badge
                    variant="outline"
                    className="border-rose-500/40 bg-rose-500/20 text-rose-300 font-semibold"
                  >
                    REVOKED
                  </Badge>
                ) : wlData?.status?.phase === "NONE" ? (
                  <Badge variant="outline" className="text-gray-400">
                    Not Registered
                  </Badge>
                ) : (
                  <Badge variant="outline">Tier Unassigned</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {status !== "authenticated" ? (
              <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-5 text-center text-sm text-gray-400">
                <p className="font-medium text-gray-300">Wallet Not Authenticated</p>
                <p className="mt-1 text-xs text-gray-500">
                  Connect and authenticate your Web3 wallet via Sign in with Ethereum (SIWE) above to view your Whitelist allocation status, trait collection progress, and campaign tasks.
                </p>
              </div>
            ) : (
              <>
                {/* 1. SLOT_ALLOCATED (GTD aktif) */}
                {wlData?.status?.phase === "SLOT_ALLOCATED" && (() => {
                  const review = getGtdReviewDetails(wlData.status.reviewStatus);
                  const ReviewIcon = review.icon;
                  return (
                    <div
                      className="space-y-3 rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-4"
                      data-testid="gtd-status-card"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                              Allocation:
                            </span>
                            <span className="text-sm font-bold text-emerald-300">
                              Guaranteed Whitelist Slot #{wlData.status.slotNumber} (Active)
                            </span>
                          </div>
                          <p className="text-xs text-gray-400">
                            Your Guaranteed Whitelist slot is locked and active. Make sure your connected wallet and linked X account remain connected.
                          </p>
                        </div>
                        {wlData.status.allocatedAt && (
                          <span className="text-[11px] text-gray-500">
                            Secured on {formatRegistrationDate(wlData.status.allocatedAt)}
                          </span>
                        )}
                      </div>

                      {/* Review Status Indicator (DEC-015) */}
                      <div className="border-t border-emerald-500/20 pt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                              Review Status:
                            </span>
                            <Badge
                              variant={review.badgeVariant}
                              className={`text-xs ${review.colorClass}`}
                            >
                              <ReviewIcon className="mr-1 h-3 w-3 shrink-0" />
                              {review.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-300">{review.subtext}</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* 2. FCFS_REGISTERED */}
                {wlData?.status?.phase === "FCFS_REGISTERED" && (
                  <div
                    className="space-y-3 rounded-lg border border-blue-500/20 bg-blue-950/20 p-4"
                    data-testid="fcfs-status-card"
                  >
                    {/* Registration sequence & timestamp */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
                      <span className="font-semibold text-white">
                        FCFS Directory Participant #{wlData.status.queueNumber}
                      </span>
                      {wlData.status.joinedAt && (
                        <>
                          <span className="text-gray-600">•</span>
                          <span className="text-gray-400">
                            Registered on {formatRegistrationDate(wlData.status.joinedAt)}
                          </span>
                        </>
                      )}
                    </div>

                    {/* OpenSea FCFS Allowlist Qualification Progress Banner */}
                    {wlData.status.isFullyQualified ? (
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                        <div className="flex items-center gap-2 font-semibold text-emerald-200">
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                          Eligible for OpenSea FCFS Allowlist
                        </div>
                        <p className="mt-1 text-emerald-300/80">
                          All 5 qualification requirements are satisfied! Your wallet will be included in the OpenSea FCFS allowlist export.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                        <div className="flex items-center gap-2 font-semibold text-amber-200">
                          <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
                          Action Required — Incomplete Requirements
                        </div>
                        <p className="mt-1 text-amber-300/80">
                          You are registered in the directory, but must satisfy all 5 requirements below to be included in the OpenSea FCFS allowlist export.
                        </p>
                      </div>
                    )}

                    {/* Explanatory Notice (DEC-018) */}
                    <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 text-xs text-gray-400">
                      <p className="font-medium text-gray-300">FCFS Directory Notice</p>
                      <p className="mt-0.5 text-gray-400">
                        Registration is for the OpenSea FCFS allowlist minting stage and does NOT guarantee a Guaranteed (GTD) slot or an allocation. GTD slots are never automatically filled.
                      </p>
                    </div>
                  </div>
                )}

                {/* 3. REVOKED Full Disqualification Alert (DEC-022) */}
                {wlData?.status?.phase === "REVOKED" && (
                  <div
                    className="space-y-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-200"
                    data-testid="revoked-status-card"
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-rose-300">
                      <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
                      Whitelist Status Revoked
                    </div>
                    <p className="text-rose-200/90 font-medium">
                      {wlData.status.missingRequirements?.[0] ||
                        "Whitelist qualification has been revoked by an administrator."}
                    </p>
                    <div className="border-t border-rose-500/20 pt-2 text-rose-300/80 space-y-1">
                      <p>
                        In accordance with ChimpHood program policies (DEC-022), slot revocation results in full disqualification from this Whitelist program.
                      </p>
                      <p className="text-rose-400/90">
                        Revoked participants are not eligible for Guaranteed (GTD) slots and are excluded from the OpenSea FCFS allowlist export.
                      </p>
                    </div>
                  </div>
                )}

                {/* 4. NONE (Not Registered in FCFS Directory) */}
                {(!wlData?.status || wlData?.status?.phase === "NONE") && (
                  <div
                    className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 text-xs text-gray-400 space-y-2"
                    data-testid="none-status-card"
                  >
                    <p className="font-semibold text-gray-300">Not Registered in FCFS Directory</p>
                    <p className="text-gray-400 leading-relaxed">
                      You are not currently registered in the FCFS Directory. Connect your EVM wallet and X (Twitter) account to automatically register in the FCFS Directory, and complete the 5 trait categories and mandatory tasks to qualify for the OpenSea FCFS allowlist.
                    </p>
                    <div className="pt-1">
                      <Link
                        href="/whitelist"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                      >
                        Go to Whitelist Portal
                      </Link>
                    </div>
                  </div>
                )}

                {/* Progress Section: 5 Trait Categories & Mandatory Campaign Tasks (Hidden when REVOKED) */}
                {wlData?.status?.phase !== "REVOKED" && (
                  <div
                    className="space-y-4 border-t border-gray-800 pt-4"
                    data-testid="whitelist-progress-section"
                  >
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Whitelist Qualification Progress
                    </h3>

                    {/* 5 Trait Categories Checklist */}
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs text-gray-400">
                          Required Trait Categories (5 of 5)
                        </span>
                        <span className="text-xs font-mono text-gray-300">
                          {heldCategoriesCount} / 5 Collected
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                        {TRAIT_CATEGORIES.map((cat) => {
                          const isHeld = heldCategoriesSet.has(cat);
                          const theme = CATEGORY_THEMES[cat];
                          return (
                            <div
                              key={cat}
                              data-testid={`profile-trait-${cat.toLowerCase()}`}
                              className={`flex items-center gap-1.5 rounded border p-2 transition-colors ${
                                isHeld
                                  ? theme?.heldClass || "border-emerald-800/40 bg-emerald-950/20 text-emerald-300"
                                  : theme?.unheldClass || "border-gray-800 bg-gray-800/20 text-gray-500"
                              }`}
                            >
                              {isHeld ? (
                                <CheckCircle2
                                  className={`h-3.5 w-3.5 shrink-0 ${theme?.checkColor || "text-emerald-400"}`}
                                />
                              ) : (
                                <XCircle className="h-3.5 w-3.5 shrink-0 text-gray-600" />
                              )}
                              <span className="font-medium">{cat}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Mandatory Campaign Tasks Progress */}
                    <div className="flex flex-col gap-2 rounded-lg border border-gray-800 bg-gray-900/40 p-3 sm:flex-row sm:items-center sm:justify-between text-xs">
                      <div>
                        <span className="font-medium text-gray-300">Mandatory Campaign Tasks</span>
                        <p className="text-[11px] text-gray-500">
                          Complete all mandatory campaign quests to maintain whitelist eligibility
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono font-semibold ${
                            mandatoryTasksCompleted >= mandatoryTasksTotal && mandatoryTasksTotal > 0
                              ? "text-emerald-400"
                              : "text-amber-400"
                          }`}
                        >
                          {mandatoryTasksCompleted} / {mandatoryTasksTotal} Completed
                        </span>
                        {mandatoryTasksCompleted >= mandatoryTasksTotal && mandatoryTasksTotal > 0 ? (
                          <Badge
                            variant="default"
                            className="border-emerald-500/30 bg-emerald-500/20 text-emerald-300 text-[10px]"
                          >
                            Complete
                          </Badge>
                        ) : (
                          <Badge
                            variant="warning"
                            className="border-amber-500/30 bg-amber-500/20 text-amber-300 text-[10px]"
                          >
                            Incomplete
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Missing Requirements List */}
                    {wlData?.status?.missingRequirements &&
                      wlData.status.missingRequirements.length > 0 &&
                      !wlData.status.isFullyQualified &&
                      wlData.status.phase !== "SLOT_ALLOCATED" && (
                        <div className="space-y-1 rounded border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300">
                          <p className="font-semibold">Missing Requirements:</p>
                          <ul className="list-inside list-disc space-y-0.5 text-amber-200/80">
                            {wlData.status.missingRequirements.map((req, i) => (
                              <li key={i}>{req}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>

    {/* 2. Collection Tab Panel */}
    <div
      role="tabpanel"
      id="panel-collection"
      aria-labelledby="tab-collection"
      className={activeTab === "collection" ? "block" : "hidden"}
    >
      {/* Collection & Inventory Overview */}
      <Card className="w-full">
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
                  className="space-y-3 pb-6 border-b border-gray-800"
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
                      const theme = CATEGORY_THEMES[category];
                      return (
                        <div
                          key={category}
                          data-testid={`collection-category-${category.toLowerCase()}`}
                          className={`flex items-center gap-2 rounded-lg border p-2.5 text-xs transition-colors ${
                            isHeld
                              ? `${theme?.heldClass || "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"} shadow-sm`
                              : "border-gray-800 bg-gray-900/30 text-gray-500 opacity-60 grayscale"
                          }`}
                        >
                          {isHeld ? (
                            <CheckCircle2
                              className={`h-4 w-4 shrink-0 ${theme?.checkColor || "text-emerald-400"}`}
                            />
                          ) : (
                            <div className="h-4 w-4 shrink-0 rounded-full border border-gray-600 bg-gray-800" />
                          )}
                          <span className="font-semibold tracking-wide">{category}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-start gap-1.5 text-xs text-gray-400">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500" />
                    <p>
                      Your avatar automatically equips the lowest edition trait in each category. Equipped traits cannot be transferred as gifts.
                    </p>
                  </div>
                </div>

                <TraitGrid items={inventoryItems} onGiftItem={handleOpenGiftModal} />
              </div>
            ) : (
              <div data-testid="inventory-empty" className="space-y-6">
                {/* 5-Category Trait Collection Overview */}
                <div
                  className="space-y-3 pb-6 border-b border-gray-800"
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
                  <div className="mt-3 flex items-start gap-1.5 text-xs text-gray-400">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500" />
                    <p>
                      Your avatar automatically equips the lowest edition trait in each category. Equipped traits cannot be transferred as gifts.
                    </p>
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
      </div>

      {/* 3. Gifts Tab Panel */}
      <div
        role="tabpanel"
        id="panel-gifts"
        aria-labelledby="tab-gifts"
        className={activeTab === "gifts" ? "block" : "hidden"}
      >
        {status === "authenticated" ? (
          <GiftsSection
            sentGifts={sentGifts}
            receivedGifts={receivedGifts}
            isLoading={isGiftsLoading}
            isWlAllocated={wlData?.status?.phase === "SLOT_ALLOCATED"}
            onRefresh={handleRefreshAll}
          />
        ) : (
          <Card className="w-full" data-testid="gifts-unauthenticated">
            <CardHeader>
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
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-5 text-center text-sm text-gray-400">
                <p className="font-medium text-gray-300">Wallet Not Authenticated</p>
                <p className="mt-1 text-xs text-gray-500">
                  Connect and authenticate your Web3 wallet via Sign in with Ethereum (SIWE) above to view and manage trait gifts.
                </p>
              </div>
            </CardContent>
          </Card>
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
