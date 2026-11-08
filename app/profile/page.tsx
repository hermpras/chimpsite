"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  AlertCircle,
  Info,
} from "lucide-react";
import * as navigation from "next/navigation";
import { XLogo } from "@/components/icons/XLogo";
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
import { useXIdentity } from "@/hooks/useXIdentity";
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
    heldClass: "border-sky-500/40 bg-sky-950/40 text-sky-300 shadow-[0_0_12px_rgba(6,182,212,0.15)]",
    unheldClass: "border-[#163B44] bg-[#051D22]/60 text-zinc-500",
    checkColor: "text-sky-400",
    badgeClass: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  },
  FUR: {
    heldClass: "border-amber-500/40 bg-amber-950/40 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.15)]",
    unheldClass: "border-[#163B44] bg-[#051D22]/60 text-zinc-500",
    checkColor: "text-amber-400",
    badgeClass: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  },
  CLOTHING: {
    heldClass: "border-violet-500/40 bg-violet-950/40 text-violet-300 shadow-[0_0_12px_rgba(192,132,252,0.15)]",
    unheldClass: "border-[#163B44] bg-[#051D22]/60 text-zinc-500",
    checkColor: "text-violet-400",
    badgeClass: "border-violet-500/30 bg-violet-500/10 text-violet-400",
  },
  HEADWEAR: {
    heldClass: "border-emerald-500/40 bg-emerald-950/40 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.15)]",
    unheldClass: "border-[#163B44] bg-[#051D22]/60 text-zinc-500",
    checkColor: "text-emerald-400",
    badgeClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  },
  EYEWEAR: {
    heldClass: "border-teal-500/40 bg-teal-950/40 text-teal-300 shadow-[0_0_12px_rgba(244,114,182,0.15)]",
    unheldClass: "border-[#163B44] bg-[#051D22]/60 text-zinc-500",
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
        colorClass: "border-emerald-500/40 bg-emerald-950/50 text-emerald-300",
        icon: CheckCircle2,
      };
    case "UNDER_REVIEW":
      return {
        label: "Under Verification",
        subtext: "Under Verification — Account details being audited.",
        badgeVariant: "warning" as const,
        colorClass: "border-amber-500/40 bg-amber-950/50 text-amber-300",
        icon: Clock,
      };
    case "FLAGGED":
      return {
        label: "Notice / Action Required",
        subtext:
          "Notice — Please review your linked accounts and task requirements. Slot remains active.",
        badgeVariant: "warning" as const,
        colorClass: "border-rose-500/40 bg-rose-950/50 text-rose-300",
        icon: AlertCircle,
      };
    case "NOT_REVIEWED":
    default:
      return {
        label: "Pending Routine Review",
        subtext: "Slot Confirmed — Routine verification in progress.",
        badgeVariant: "outline" as const,
        colorClass: "border-cyan-500/40 bg-cyan-950/50 text-cyan-300",
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
      <Badge variant="outline" className="border-[#163B44] bg-[#102B33]/40 text-zinc-400 text-xs">
        Wallet Not Connected
      </Badge>
    );
  }
  if (!status) {
    return (
      <Badge variant="outline" className="border-[#163B44] bg-[#102B33]/40 text-zinc-400 text-xs">
        WL Status: Loading...
      </Badge>
    );
  }
  switch (status.phase) {
    case "SLOT_ALLOCATED":
      return (
        <Badge
          variant="default"
          className="border-emerald-500/40 bg-emerald-950/60 text-emerald-300 font-bold text-xs uppercase tracking-wide"
        >
          {`WL Status: Guaranteed Slot #${status.slotNumber}`}
        </Badge>
      );
    case "FCFS_REGISTERED":
      return status.isFullyQualified ? (
        <Badge
          variant="default"
          className="border-emerald-500/40 bg-emerald-950/60 text-emerald-300 font-bold text-xs uppercase tracking-wide"
        >
          WL Status: Whitelisted
        </Badge>
      ) : (
        <Badge
          variant="default"
          className="border-cyan-500/40 bg-cyan-950/60 text-cyan-300 font-bold text-xs tracking-wide"
        >
          WL Status: In Progress
        </Badge>
      );
    case "REVOKED":
      return (
        <Badge
          variant="outline"
          className="border-rose-500/40 bg-rose-950/60 text-rose-300 font-bold text-xs"
        >
          WL Status: REVOKED
        </Badge>
      );
    case "NONE":
    default:
      return (
        <Badge variant="outline" className="border-[#163B44] bg-[#102B33]/40 text-zinc-400 text-xs">
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
  const tabListRef = React.useRef<HTMLDivElement>(null);

  const handleSelectTab = (tab: ProfileTab) => {
    setActiveTab(tab);
    if (typeof window !== "undefined" && tabListRef.current) {
      const rect = tabListRef.current.getBoundingClientRect();
      if (rect.top < 64 && typeof tabListRef.current.scrollIntoView === "function") {
        tabListRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  const { status, sessionAddress, walletAddress } = useSiweAuth();
  const { xName, xUsername: hookXUsername } = useXIdentity();
  const address = sessionAddress || walletAddress;
  const [wlData, setWlData] = useState<WhitelistStatusResponse | null>(null);
  const [xStatusData, setXStatusData] = useState<{
    connected?: boolean;
    identity?: {
      xId?: string;
      username?: string;
      name?: string;
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
  const [equippingItemId, setEquippingItemId] = useState<string | null>(null);
  const [equipError, setEquipError] = useState<string | null>(null);
  const ownedCategories = new Set(inventoryItems.map((item) => item.trait.category));

  const xErrorMessage =
    xActionError ||
    (xError
      ? xError === "access_denied"
        ? "Authorization was denied by user. Please try connecting your X account again."
        : xError === "X_ACCOUNT_ALREADY_LINKED"
          ? "This X account is already linked to another ChimpHood profile. Each X account can only be linked to a single wallet."
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

  const handleEquipItem = async (item: InventoryItemData) => {
    if (equippingItemId || item.isLocked || item.isEquipped) return;
    setEquippingItemId(item.id);
    setEquipError(null);

    // Optimistic UI update: mark this item as equipped and other items in same category as unequipped
    const previousItems = [...inventoryItems];
    const category = item.trait.category;
    setInventoryItems((prev) =>
      prev.map((it) => {
        if (it.trait.category === category) {
          return { ...it, isEquipped: it.id === item.id };
        }
        return it;
      }),
    );

    try {
      await inventoryClient.equipUserTrait(item.id);
      // Bust avatar cache and trigger immediate visual update
      setAvatarVersion(Date.now());
      // Refresh inventory in the background to ensure consistency
      if (address) {
        inventoryClient
          .fetchUserInventory(address)
          .then((data) => {
            if (data.items) {
              setInventoryItems(data.items);
            }
          })
          .catch(() => {});
      }
    } catch (err: unknown) {
      console.error("Error equipping trait:", err);
      // Revert optimistic update
      setInventoryItems(previousItems);
      const msg = err instanceof Error ? err.message : "Failed to equip trait.";
      setEquipError(msg);
    } finally {
      setEquippingItemId(null);
    }
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
  const currentXName =
    status === "authenticated"
      ? xName || xStatusData?.identity?.name
      : undefined;
  const currentXUsername =
    status === "authenticated"
      ? hookXUsername || wlData?.status?.details?.xUsername || xStatusData?.identity?.username
      : undefined;
  const displayName = isXConnected
    ? currentXName || (currentXUsername ? `@${currentXUsername}` : "Chimp Member")
    : address
      ? shortenAddress(address)
      : "User Profile";
  const rawXProfileImg =
    status === "authenticated"
      ? wlData?.status?.details?.xProfileImageUrl || xStatusData?.identity?.profileImageUrl
      : undefined;
  const currentXProfileImg = normalizeXAvatarUrl(rawXProfileImg);

  const [failedXAvatarUrl, setFailedXAvatarUrl] = React.useState<string | null>(null);
  const xAvatarError = failedXAvatarUrl !== null && failedXAvatarUrl === currentXProfileImg;

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
    <div className="min-h-screen bg-[#04181C] text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Page Header with Character Avatar & Profile Overview */}
        <div className="flex flex-col items-start gap-5 rounded-2xl border border-[#163B44] bg-[#0B2026] p-6 shadow-brutal-sm sm:flex-row sm:items-center">
          <UserAvatar
            identifier={address}
            hasInventory={inventoryItems.length > 0}
            version={avatarVersion}
            size="xl"
            showRefreshButton={status === "authenticated" && inventoryItems.length > 0}
            onRefresh={handleRefreshAll}
            className="border-2 border-amber-400/50 rounded-2xl shadow-brutal-sm [image-rendering:pixelated]"
          />
          <div className="space-y-2 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-wider text-white">
                {displayName}
              </h1>
              {getWhitelistSummaryBadge(wlData?.status, status === "authenticated")}
            </div>
            <p className="text-xs sm:text-sm text-zinc-400">
              One account for your X account and wallets; allowlists, trait drops, and gear follow it.
            </p>
          </div>
        </div>

        {/* Callback / Status Feedback Alerts */}
        {xLinked && (
          <div
            role="status"
            data-testid="x-link-success-banner"
            className="rounded-2xl border border-emerald-500/40 bg-emerald-950/40 p-4 text-emerald-200 shadow-brutal-sm"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-400" />
              <div>
                <p className="font-bold text-white font-display uppercase tracking-wide">
                  X Account Successfully Linked
                </p>
                <p className="mt-0.5 text-xs text-zinc-300">
                  Your X (Twitter) profile has been verified and connected to your account.
                </p>
                <div className="mt-2.5">
                  <Link
                    href="/whitelist"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 underline underline-offset-2 uppercase tracking-wide"
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
            className="rounded-2xl border border-rose-500/40 bg-rose-950/40 p-4 text-rose-200 shadow-brutal-sm"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-400" />
              <div>
                <p className="font-bold text-white font-display uppercase tracking-wide">X Authentication Failed</p>
                <p className="mt-0.5 text-xs text-zinc-300">{xErrorMessage}</p>
              </div>
            </div>
          </div>
        )}

        {/* Profile Tab Navigation */}
        <div
          ref={tabListRef}
          role="tablist"
          aria-label="Profile navigation"
          className="border-b border-[#163B44] scroll-mt-20"
        >
          <div className="flex gap-2 sm:gap-6 overflow-x-auto">
            <button
              type="button"
              role="tab"
              id="tab-overview"
              aria-controls="panel-overview"
              aria-selected={activeTab === "overview"}
              tabIndex={activeTab === "overview" ? 0 : -1}
              onClick={() => handleSelectTab("overview")}
              className={`flex items-center border-b-2 px-3 py-3 text-sm font-display uppercase tracking-wider transition-colors cursor-pointer ${
                activeTab === "overview"
                  ? "border-amber-400 text-amber-400"
                  : "border-transparent text-zinc-500 hover:border-[#163B44] hover:text-zinc-300"
              }`}
            >
              <span>Overview</span>
            </button>
            <button
              type="button"
              role="tab"
              id="tab-collection"
              aria-controls="panel-collection"
              aria-selected={activeTab === "collection"}
              tabIndex={activeTab === "collection" ? 0 : -1}
              onClick={() => handleSelectTab("collection")}
              className={`flex items-center border-b-2 px-3 py-3 text-sm font-display uppercase tracking-wider transition-colors cursor-pointer ${
                activeTab === "collection"
                  ? "border-amber-400 text-amber-400"
                  : "border-transparent text-zinc-500 hover:border-[#163B44] hover:text-zinc-300"
              }`}
            >
              <span>Collection</span>
            </button>
            <button
              type="button"
              role="tab"
              id="tab-gifts"
              aria-controls="panel-gifts"
              aria-selected={activeTab === "gifts"}
              tabIndex={activeTab === "gifts" ? 0 : -1}
              onClick={() => handleSelectTab("gifts")}
              className={`flex items-center border-b-2 px-3 py-3 text-sm font-display uppercase tracking-wider transition-colors cursor-pointer ${
                activeTab === "gifts"
                  ? "border-amber-400 text-amber-400"
                  : "border-transparent text-zinc-500 hover:border-[#163B44] hover:text-zinc-300"
              }`}
            >
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
            {/* Wallet Connection Section */}
            <WalletConnectCard />

            {/* X (Twitter) Account Section */}
            <Card className="rounded-2xl border-[#163B44] bg-[#0B2026] shadow-brutal-sm p-4 sm:p-5">
              <CardHeader className="mb-3 space-y-0.5">
                <div>
                  <CardTitle className="font-display text-lg uppercase tracking-wider text-white">X (Twitter) Identity</CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-[#8AA8B2] mt-0.5">Social account verification status</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-0">
                {isXConnected ? (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-[#163B44] bg-[#0B2026]/80 p-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {currentXProfileImg && !xAvatarError ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={currentXProfileImg}
                          alt={currentXUsername || "X Profile"}
                          data-testid="x-profile-avatar"
                          referrerPolicy="no-referrer"
                          className="h-8 w-8 rounded-full border border-cyan-400/40 object-cover shadow shrink-0"
                          onError={() => setFailedXAvatarUrl(currentXProfileImg ?? null)}
                        />
                      ) : (
                        <div
                          data-testid="x-avatar-fallback"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-400/10 text-cyan-400 shadow"
                          title={currentXUsername ? `@${currentXUsername} (avatar unavailable)` : "X avatar unavailable"}
                        >
                          <XLogo className="h-4 w-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <span className="font-bold text-white text-sm sm:text-base truncate block">
                          @{currentXUsername}
                        </span>
                        <p className="text-xs sm:text-[13px] text-zinc-400 mt-0.5">
                          Status: Connected
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="rounded-lg text-xs sm:text-sm font-semibold border-cyan-500/30 bg-cyan-950/40 text-cyan-300 shrink-0 self-start sm:self-auto cursor-default opacity-80"
                    >
                      X Account Connected
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-[#163B44] bg-[#0B2026]/80 p-3.5">
                    <div>
                      <p className="text-sm font-bold text-zinc-300">Status: Not Connected</p>
                      <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                        {currentXUsername ? `@${currentXUsername}` : "No X account linked"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={isLinking || status !== "authenticated"}
                      onClick={handleLinkX}
                      className="group relative overflow-hidden rounded-xl border border-yellow-300/70 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 px-4 py-2 font-display text-xs sm:text-sm font-black uppercase tracking-wider text-black shadow-[0_0_24px_rgba(245,158,11,0.35)] transition-all duration-300 hover:from-amber-300 hover:via-yellow-200 hover:to-amber-400 hover:shadow-[0_0_32px_rgba(245,158,11,0.6)] hover:scale-[1.02] active:scale-[0.98] shrink-0 self-start sm:self-auto cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-none"
                    >
                      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent transition-transform duration-700 ease-in-out group-hover:translate-x-full" />
                      <span>{isLinking ? "Connecting..." : "Link X Account"}</span>
                    </Button>
                  </div>
                )}
                {status !== "authenticated" && (
                  <p className="text-center text-xs sm:text-sm text-zinc-400 pt-0.5">
                    Connect and authenticate your Web3 wallet first to enable X linking.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Tier & Allocation Overview */}
            <Card className="rounded-2xl border-[#163B44] bg-[#0B2026] shadow-brutal-sm md:col-span-2">
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="font-display text-xl uppercase tracking-wider text-white">Community Tier & Whitelist Status</CardTitle>
                    <CardDescription className="text-sm text-[#8AA8B2] mt-1">
                      Membership tier and Whitelist allocation associated with your account
                    </CardDescription>
                  </div>
                  <div>
                    {status !== "authenticated" ? null : wlData?.status?.phase === "SLOT_ALLOCATED" ? (
                      <Badge
                        variant="default"
                        className="border-emerald-500/40 bg-emerald-950/60 text-emerald-300 font-bold text-xs sm:text-sm uppercase"
                      >
                        WL Slot #{wlData.status.slotNumber}
                      </Badge>
                    ) : wlData?.status?.phase === "FCFS_REGISTERED" ? (
                      wlData.status.isFullyQualified ? (
                        <Badge
                          variant="default"
                          className="border-emerald-500/40 bg-emerald-950/60 text-emerald-300 font-bold text-xs sm:text-sm uppercase tracking-wide"
                        >
                          Whitelisted
                        </Badge>
                      ) : (
                        <Badge
                          variant="default"
                          className="border-cyan-500/40 bg-cyan-950/60 text-cyan-300 font-bold text-xs sm:text-sm tracking-wide"
                        >
                          In Progress
                        </Badge>
                      )
                    ) : wlData?.status?.phase === "REVOKED" ? (
                      <Badge
                        variant="outline"
                        className="border-rose-500/40 bg-rose-950/60 text-rose-300 font-bold text-xs sm:text-sm"
                      >
                        REVOKED
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {status !== "authenticated" ? (
                  <div className="rounded-xl border border-[#163B44] bg-[#0B2026]/80 p-5 text-center text-sm sm:text-base text-zinc-300">
                    <p className="font-bold text-white text-base sm:text-lg">Wallet Not Authenticated</p>
                    <p className="mt-1 text-xs sm:text-sm text-[#8AA8B2]">
                      Sign in with your Web3 wallet above to view your Whitelist allocation status, trait collection progress, and campaign tasks.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* 1. SLOT_ALLOCATED (GTD aktif) */}
                    {wlData?.status?.phase === "SLOT_ALLOCATED" && (() => {
                      const review = getGtdReviewDetails(wlData.status.reviewStatus);
                      return (
                        <div
                          className="space-y-3 rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-4 text-emerald-200"
                          data-testid="gtd-status-card"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-zinc-400">
                                  Allocation:
                                </span>
                                <span className="text-sm sm:text-base font-bold text-emerald-300">
                                  Guaranteed Whitelist Slot #{wlData.status.slotNumber} (Active)
                                </span>
                              </div>
                              <p className="text-xs sm:text-sm text-zinc-300">
                                Your Guaranteed Whitelist slot is locked and active. Make sure your connected wallet and linked X account remain connected.
                              </p>
                            </div>
                            {wlData.status.allocatedAt && (
                              <span className="text-xs sm:text-sm text-zinc-400 font-mono">
                                Secured on {formatRegistrationDate(wlData.status.allocatedAt)}
                              </span>
                            )}
                          </div>

                          {/* Review Status Indicator (DEC-015) */}
                          <div className="border-t border-emerald-500/20 pt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-zinc-400">
                                  Review Status:
                                </span>
                                <Badge
                                  variant={review.badgeVariant}
                                  className={`text-xs sm:text-sm font-semibold ${review.colorClass}`}
                                >
                                  {review.label}
                                </Badge>
                              </div>
                              <p className="text-xs sm:text-sm text-zinc-300">{review.subtext}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* 2. FCFS_REGISTERED */}
                    {wlData?.status?.phase === "FCFS_REGISTERED" && (
                      <div
                        className="space-y-3 rounded-xl border border-cyan-500/40 bg-cyan-950/40 p-4"
                        data-testid="fcfs-status-card"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-sm sm:text-base text-zinc-200">
                          <span className="font-bold text-white">
                            {wlData.status.isFullyQualified
                              ? "Whitelist Application Approved"
                              : "Whitelist Application in Progress"}
                          </span>
                          {wlData.status.joinedAt && (
                            <>
                              <span className="text-zinc-600">•</span>
                              <span className="text-zinc-400 text-xs sm:text-sm">
                                Registered on {formatRegistrationDate(wlData.status.joinedAt)}
                              </span>
                            </>
                          )}
                        </div>

                        {wlData.status.isFullyQualified ? (
                          <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 p-3.5 text-xs sm:text-sm text-emerald-200">
                            <div className="font-bold text-emerald-300 text-sm sm:text-base">
                              Whitelist Qualified
                            </div>
                            <p className="mt-1 text-zinc-300">
                              All 5 qualification requirements are satisfied! Your wallet will be included in the official allowlist for minting.
                            </p>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-amber-500/40 bg-amber-950/50 p-3.5 text-xs sm:text-sm text-amber-200">
                            <div className="font-bold text-amber-300 text-sm sm:text-base">
                              Action Required — Incomplete Requirements
                            </div>
                            <p className="mt-1 text-zinc-300">
                              Complete all 5 requirements below to qualify for the official allowlist.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 3. REVOKED Full Disqualification Alert (DEC-022) */}
                    {wlData?.status?.phase === "REVOKED" && (
                      <div
                        className="space-y-3 rounded-xl border border-rose-500/40 bg-rose-950/40 p-4 text-xs sm:text-sm text-rose-200"
                        data-testid="revoked-status-card"
                      >
                        <div className="text-base sm:text-lg font-bold text-rose-300">
                          Whitelist Status Revoked
                        </div>
                        <p className="text-rose-200 font-medium text-sm sm:text-base">
                          {wlData.status.missingRequirements?.[0] ||
                            "Whitelist qualification has been revoked by an administrator."}
                        </p>
                        <div className="border-t border-rose-500/20 pt-2 text-zinc-400 space-y-1 text-xs sm:text-sm">
                          <p>
                            In accordance with ChimpHood program policies (DEC-022), slot revocation results in full disqualification from this Whitelist program.
                          </p>
                          <p className="text-rose-400 font-semibold">
                            Revoked participants are not eligible for Guaranteed (GTD) slots and are excluded from the allowlist export.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* 4. NONE (Not Registered) */}
                    {(!wlData?.status || wlData?.status?.phase === "NONE") && (
                      <div
                        className="rounded-xl border border-[#163B44] bg-[#0B2026]/80 p-5 text-sm sm:text-base text-zinc-300 space-y-2.5"
                        data-testid="none-status-card"
                      >
                        <p className="font-bold text-white text-base sm:text-lg">Whitelist Application</p>
                        <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
                          Connect your EVM wallet and X (Twitter) account, and complete the 5 trait categories and mandatory tasks to qualify for the allowlist.
                        </p>
                        <div className="pt-2">
                          <Link
                            href="/whitelist"
                            className="group relative overflow-hidden inline-flex items-center rounded-xl border border-yellow-300/70 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-black px-4 py-2 text-xs sm:text-sm font-black uppercase tracking-wider shadow-[0_0_20px_rgba(245,158,11,0.35)] hover:from-amber-300 hover:via-yellow-200 hover:to-amber-400 hover:shadow-[0_0_28px_rgba(245,158,11,0.55)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                          >
                            <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent transition-transform duration-700 ease-in-out group-hover:translate-x-full" />
                            <span>Go to Whitelist Portal</span>
                          </Link>
                        </div>
                      </div>
                    )}

                    {/* Progress Section: 5 Trait Categories & Mandatory Campaign Tasks (Hidden when REVOKED) */}
                    {wlData?.status?.phase !== "REVOKED" && (
                      <div
                        className="space-y-4 border-t border-[#163B44] pt-4"
                        data-testid="whitelist-progress-section"
                      >
                        <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider text-zinc-200">
                          Whitelist Qualification Progress
                        </h3>

                        {/* 5 Trait Categories Checklist */}
                        <div>
                          <div className="mb-2.5 flex items-center justify-between text-sm sm:text-base">
                            <span className="text-zinc-300 font-medium">
                              Required Trait Categories (5 of 5)
                            </span>
                            <span className="font-bold text-amber-400">
                              {heldCategoriesCount} / 5 Collected
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2.5 text-sm sm:text-base sm:grid-cols-5">
                            {TRAIT_CATEGORIES.map((cat) => {
                              const isHeld = heldCategoriesSet.has(cat);
                              const theme = CATEGORY_THEMES[cat];
                              return (
                                <div
                                  key={cat}
                                  data-testid={`profile-trait-${cat.toLowerCase()}`}
                                  className={`flex items-center justify-center rounded-xl border py-2.5 px-3 text-center transition-colors ${
                                    isHeld
                                      ? theme?.heldClass || "border-emerald-500/40 bg-emerald-950/40 text-emerald-300 font-bold"
                                      : theme?.unheldClass || "border-[#163B44] bg-[#051D22]/60 text-zinc-600 grayscale opacity-40"
                                  }`}
                                >
                                  <span className="font-bold">{cat}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Mandatory Campaign Tasks Progress */}
                        <div className="flex flex-col gap-2.5 rounded-xl border border-[#163B44] bg-[#0B2026]/80 p-4 sm:flex-row sm:items-center sm:justify-between text-sm sm:text-base">
                          <div>
                            <span className="font-bold text-zinc-100 text-sm sm:text-base">Mandatory Campaign Tasks</span>
                            <p className="text-xs sm:text-sm text-[#8AA8B2] mt-0.5">
                              Complete all mandatory campaign quests to maintain whitelist eligibility
                            </p>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`font-mono font-bold text-sm sm:text-base ${
                                mandatoryTasksCompleted >= mandatoryTasksTotal && mandatoryTasksTotal > 0
                                  ? "text-emerald-400"
                                  : "text-amber-400"
                              }`}
                            >
                              {mandatoryTasksCompleted} / {mandatoryTasksTotal} Completed
                            </span>
                          </div>
                        </div>

                        {/* Missing Requirements List */}
                        {wlData?.status?.missingRequirements &&
                          wlData.status.missingRequirements.length > 0 &&
                          !wlData.status.isFullyQualified &&
                          wlData.status.phase !== "SLOT_ALLOCATED" && (
                            <div className="space-y-1.5 rounded-xl border border-amber-500/40 bg-amber-950/40 p-4 text-sm text-amber-200">
                              <p className="font-bold text-amber-300 text-sm sm:text-base">Missing Requirements:</p>
                              <ul className="list-inside list-disc space-y-1 text-amber-200/90 text-xs sm:text-sm leading-relaxed">
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
          <Card className="rounded-2xl border-[#163B44] bg-[#0B2026] shadow-brutal-sm w-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-display text-xl uppercase tracking-wider text-white">Collection &amp; Inventory</CardTitle>
                  <CardDescription className="text-sm text-[#8AA8B2] mt-1">
                    Collected Elychimp Traits, items, and ecosystem collectibles
                  </CardDescription>
                </div>
                {isInventoryLoading ? (
                  <Badge variant="outline" className="border-[#163B44] bg-[#102B33]/40 text-zinc-400 text-xs">Loading...</Badge>
                ) : inventoryError ? (
                  <Badge variant="warning" className="border-rose-500/40 bg-rose-950/50 text-rose-300 text-xs">Inventory Error</Badge>
                ) : inventoryItems.length > 0 ? (
                  <Badge variant="default" className="border-amber-400/40 bg-amber-950/60 text-amber-300 font-bold text-xs">
                    {inventoryItems.length} {inventoryItems.length === 1 ? "Item" : "Items"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-[#163B44] bg-[#102B33]/40 text-zinc-400 text-xs">Inventory Empty</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isInventoryLoading ? (
                <div
                  data-testid="inventory-loading"
                  className="rounded-xl border border-[#163B44] bg-[#0B2026]/80 p-8 text-center"
                >
                  <p className="text-sm font-bold text-white">
                    Loading your inventory...
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Fetching collected traits and items from Elysium L2.
                  </p>
                </div>
              ) : inventoryError ? (
                <div
                  data-testid="inventory-error"
                  className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-6 text-center"
                >
                  <p className="text-sm font-bold text-rose-300">
                    Unable to load inventory
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">{inventoryError}</p>
                </div>
              ) : inventoryItems.length > 0 ? (
                <div className="space-y-6">
                  {/* 5-Category Trait Collection Overview */}
                  <div
                    className="space-y-3 pb-6 border-b border-zinc-800"
                    data-testid="trait-collection-summary"
                  >
                    <div className="mb-3 flex items-center justify-between text-xs sm:text-sm">
                      <h4 className="font-bold tracking-wider text-zinc-300 uppercase">
                        Trait Collection (
                        {TRAIT_CATEGORIES.filter((c) => ownedCategories.has(c)).length}/5
                        Categories Owned)
                      </h4>
                      <span className="text-zinc-400">
                        {TRAIT_CATEGORIES.every((c) => ownedCategories.has(c))
                          ? "Full Character Set Complete ✨"
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
                            className={`flex items-center gap-2 rounded-xl border p-2.5 text-xs sm:text-sm transition-colors ${
                              isHeld
                                ? `${theme?.heldClass || "border-emerald-500/40 bg-emerald-950/40 text-emerald-300"} font-bold`
                                : "border-[#163B44] bg-[#051D22]/60 text-zinc-600 grayscale opacity-40"
                            }`}
                          >
                            {isHeld ? (
                              <CheckCircle2
                                className={`h-4 w-4 shrink-0 ${theme?.checkColor || "text-emerald-400"}`}
                              />
                            ) : (
                              <div className="h-4 w-4 shrink-0 rounded-full border border-[#163B44] bg-[#102B33]" />
                            )}
                            <span className="font-bold tracking-wide">{category}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex items-start gap-1.5 text-xs sm:text-sm text-[#8AA8B2]">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                      <p>
                        Your avatar displays your active equipped traits. Click Equip on any trait to wear it on your avatar. Equipped traits cannot be transferred as gifts.
                      </p>
                    </div>
                  </div>

                  {equipError && (
                    <div
                      role="alert"
                      className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs sm:text-sm text-rose-200 flex items-center justify-between"
                    >
                      <span>{equipError}</span>
                      <button
                        type="button"
                        onClick={() => setEquipError(null)}
                        className="text-xs text-rose-400 hover:text-rose-200 font-bold ml-2 cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  <TraitGrid
                    items={inventoryItems}
                    onGiftItem={handleOpenGiftModal}
                    onEquipItem={handleEquipItem}
                    equippingItemId={equippingItemId}
                  />
                </div>
              ) : (
                <div data-testid="inventory-empty" className="space-y-6">
                  {/* 5-Category Trait Collection Overview */}
                  <div
                    className="space-y-3 pb-6 border-b border-zinc-800"
                    data-testid="trait-collection-summary"
                  >
                    <div className="mb-3 flex items-center justify-between text-xs sm:text-sm">
                      <h4 className="font-bold tracking-wider text-zinc-300 uppercase">
                        Trait Collection (0/5 Categories Owned)
                      </h4>
                      <span className="text-amber-400 font-bold">
                        Collect all 5 categories to assemble your Chimp
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {TRAIT_CATEGORIES.map((category) => (
                        <div
                          key={category}
                          data-testid={`collection-category-${category.toLowerCase()}`}
                          className="flex items-center gap-2 rounded-xl border border-[#163B44] bg-[#051D22]/60 p-2.5 text-xs sm:text-sm text-zinc-600 grayscale opacity-40"
                        >
                          <div className="h-4 w-4 shrink-0 rounded-full border border-[#163B44] bg-[#102B33]" />
                          <span className="font-bold tracking-wide">{category}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-start gap-1.5 text-xs sm:text-sm text-[#8AA8B2]">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                      <p>
                        Your avatar displays your active equipped traits. Collect traits to assemble your Chimp. Equipped traits cannot be transferred as gifts.
                      </p>
                    </div>
                  </div>

                  {/* Base Chimp Character Showcase */}
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-[#163B44] bg-[#051D22]/60 p-8 text-center sm:flex-row sm:gap-10 sm:text-left">
                    <div className="relative mb-6 flex-shrink-0 sm:mb-0">
                      <div className="h-52 w-52 overflow-hidden rounded-3xl border-2 border-[#163B44] bg-[#0B2026] shadow-brutal-sm sm:h-60 sm:w-60">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/images/chimp-base-bw.png"
                          alt="Unrevealed Base Chimp"
                          className="h-full w-full object-cover [image-rendering:pixelated]"
                        />
                      </div>
                      <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-[#163B44] bg-[#0B2026] px-3.5 py-1 text-xs font-bold text-zinc-200 uppercase tracking-wider shadow-md">
                        Base Chimp
                      </span>
                    </div>
                    <div className="space-y-3">
                      <h3 className="font-display text-xl sm:text-2xl uppercase tracking-wider text-white">
                        No items or traits found in your inventory
                      </h3>
                      <p className="max-w-md text-sm sm:text-base text-[#8AA8B2] leading-relaxed">
                        This is your Base Chimp canvas. Claim traits during active drops or receive gifts from peers to reveal your colored Elychimp avatar and qualify for the Whitelist!
                      </p>
                      <div className="pt-2">
                        <Link
                          href="/drops"
                          className="group relative overflow-hidden inline-flex items-center rounded-xl border border-yellow-300/70 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-black px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-black uppercase tracking-wider shadow-[0_0_24px_rgba(245,158,11,0.35)] hover:from-amber-300 hover:via-yellow-200 hover:to-amber-400 hover:shadow-[0_0_32px_rgba(245,158,11,0.6)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                          <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent transition-transform duration-700 ease-in-out group-hover:translate-x-full" />
                          <span>Go to Drops &amp; Claim</span>
                        </Link>
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
            <Card className="rounded-2xl border-[#163B44] bg-[#0B2026] shadow-brutal-sm w-full" data-testid="gifts-unauthenticated">
              <CardHeader>
                <div>
                  <CardTitle className="font-display text-xl uppercase tracking-wider text-white">Gifts &amp; Peer Transfers</CardTitle>
                  <CardDescription className="text-sm text-[#8AA8B2] mt-1">
                    Review incoming trait gifts and manage your outgoing transfers
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-[#163B44] bg-[#0B2026]/80 p-5 text-center text-sm sm:text-base text-zinc-300">
                  <p className="font-bold text-white text-base sm:text-lg">Wallet Not Authenticated</p>
                  <p className="mt-1 text-xs sm:text-sm text-[#8AA8B2]">
                    Sign in with your Web3 wallet above to view and manage trait gifts.
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
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#04181C] text-zinc-400 py-12 px-4 sm:px-6 lg:px-8 text-xs text-center">
          Loading profile...
        </div>
      }
    >
      <ProfileContent />
    </Suspense>
  );
}
