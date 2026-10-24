"use client";

import React, { useState, useEffect } from "react";
import { User, Shield, AlertTriangle, Sparkles } from "lucide-react";

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
import { PlaceholderNotice } from "@/components/ui/PlaceholderNotice";
import { WalletConnectCard } from "@/components/auth/WalletConnectCard";
import { useSiweAuth } from "@/hooks/useSiweAuth";
import {
  fetchWhitelistStatus,
  type WhitelistStatusResponse,
} from "@/lib/whitelist/client";
import { fetchUserInventory, type InventoryItemData } from "@/lib/inventory/client";
import { TraitGrid } from "@/components/inventory/TraitGrid";

export default function ProfilePage() {
  const { status, sessionAddress, walletAddress } = useSiweAuth();
  const address = sessionAddress || walletAddress;
  const [wlData, setWlData] = useState<WhitelistStatusResponse | null>(null);
  const [loadedAddress, setLoadedAddress] = useState<string | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemData[]>([]);
  const [inventoryError, setInventoryError] = useState<string | null>(null);

  const isInventoryLoading = Boolean(
    address && loadedAddress !== address && !inventoryError,
  );

  useEffect(() => {
    if (status === "authenticated" && address) {
      fetchWhitelistStatus(address)
        .then(setWlData)
        .catch((err) => console.error("Error fetching profile WL status:", err));
    }
  }, [status, address]);

  useEffect(() => {
    let ignore = false;
    if (address) {
      fetchUserInventory(address)
        .then((data) => {
          if (!ignore) {
            setInventoryItems(data.items || []);
            setLoadedAddress(address);
            setInventoryError(null);
          }
        })
        .catch((err) => {
          if (!ignore) {
            console.error("Error fetching profile inventory:", err);
            setInventoryError(err.message || "Failed to load inventory.");
            setLoadedAddress(address);
          }
        });
    }
    return () => {
      ignore = true;
    };
  }, [address]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="mb-8 space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-white">User Profile</h1>
          <Badge variant="default">Stage 3</Badge>
        </div>
        <p className="text-gray-400">
          Integrated identity management for Web3 Wallets and X (Twitter) accounts.
        </p>
      </div>

      <div className="mb-8">
        <PlaceholderNotice
          title="X OAuth Not Active Yet"
          description="Sign-In with Ethereum (SIWE) is now active — connect your wallet below. X (Twitter) OAuth 2.0 account linking is still pending."
          phase="Stage 2 In Progress"
        />
      </div>

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
              <p className="text-sm font-medium text-gray-400">
                {wlData?.status?.details.hasLinkedX
                  ? `Status: Connected (@${wlData.status.details.xUsername})`
                  : "Status: Not Connected"}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {wlData?.status?.details.xUsername
                  ? `@${wlData.status.details.xUsername}`
                  : "@username (Placeholder)"}
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                fetch("/api/social/x/connect")
                  .then((res) => res.json())
                  .then((data) => {
                    if (data.url) {
                      window.location.href = data.url;
                    } else {
                      alert(
                        data.message || "X OAuth is not configured in this environment.",
                      );
                    }
                  })
                  .catch(() => alert("X OAuth is not configured in this environment."));
              }}
            >
              Link X Account (Placeholder)
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
                  {wlData.status.details.heldCategories.length}/5 Held | Tasks:{" "}
                  {wlData.status.details.completedMandatoryTasksCount}/
                  {wlData.status.details.totalMandatoryTasksCount} Verified
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
              <TraitGrid items={inventoryItems} />
            ) : (
              <div
                data-testid="inventory-empty"
                className="rounded-lg border border-dashed border-gray-800 bg-gray-900/40 p-6 text-center"
              >
                <p className="text-sm font-medium text-gray-400">
                  No items or traits found in your inventory
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Drops, trait claims, and peer-to-peer gifts will appear in your
                  collection once active.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
