import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { TraitGrid } from "@/components/inventory/TraitGrid";
import ProfilePage from "@/app/profile/page";
import { Providers } from "@/components/providers";
import type { InventoryItemData } from "@/lib/inventory/client";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/profile",
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@/lib/whitelist/client", () => ({
  fetchWhitelistStatus: vi.fn().mockResolvedValue({
    configured: true,
    authenticated: true,
    status: null,
  }),
}));

const mockFetchUserInventory = vi.fn();
vi.mock("@/lib/inventory/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/inventory/client")>();
  return {
    ...actual,
    fetchUserInventory: (...args: any[]) => mockFetchUserInventory(...args),
  };
});

const mockUseSiweAuth = vi.fn();
vi.mock("@/hooks/useSiweAuth", () => ({
  useSiweAuth: () => mockUseSiweAuth(),
}));

describe("TraitGrid Component & Profile Inventory States", () => {
  const sampleItems: InventoryItemData[] = [
    {
      id: "item-1",
      edition: 1,
      acquiredVia: "CLAIM",
      acquiredAt: "2026-10-15T10:00:00.000Z",
      isLocked: false,
      lockReason: null,
      trait: {
        id: "t-1",
        name: "Diamond Grill",
        category: "FUR",
        rarity: "LEGENDARY",
        imageUrl: "https://assets.chimphood.io/traits/grill.png",
      },
    },
    {
      id: "item-2",
      edition: 3,
      acquiredVia: "GIFT",
      acquiredAt: "2026-10-15T11:00:00.000Z",
      isLocked: true,
      lockReason: "PENDING_GIFT",
      trait: {
        id: "t-2",
        name: "Pilot Cap",
        category: "HEADWEAR",
        rarity: "RARE",
        imageUrl: "",
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSiweAuth.mockReturnValue({
      status: "unauthenticated",
      sessionAddress: null,
      walletAddress: null,
    });
  });

  describe("TraitGrid", () => {
    it("renders items with name, category, rarity, edition and locked badges", () => {
      render(<TraitGrid items={sampleItems} />);

      expect(screen.getByText("Diamond Grill")).toBeInTheDocument();
      expect(screen.getByText("FUR")).toBeInTheDocument();
      expect(screen.getByText("LEGENDARY")).toBeInTheDocument();
      expect(screen.getByText("#1")).toBeInTheDocument();
      expect(screen.getByText("Via claim")).toBeInTheDocument();

      expect(screen.getByText("Pilot Cap")).toBeInTheDocument();
      expect(screen.getByText("HEADWEAR")).toBeInTheDocument();
      expect(screen.getByText("RARE")).toBeInTheDocument();
      expect(screen.getByText("#3")).toBeInTheDocument();
      expect(screen.getByText("Via gift")).toBeInTheDocument();

      expect(screen.getByTestId("locked-badge")).toBeInTheDocument();
      expect(screen.getByText("Locked")).toBeInTheDocument();
    });

    it("renders Gift button only on duplicate items when onGiftItem is provided", () => {
      const duplicateCopy: InventoryItemData = {
        id: "item-1-dup",
        edition: 2,
        acquiredVia: "DROP",
        acquiredAt: "2026-10-15T12:00:00.000Z",
        isLocked: false,
        lockReason: null,
        trait: {
          id: "t-1",
          name: "Diamond Grill",
          category: "FUR",
          rarity: "LEGENDARY",
          imageUrl: "https://assets.chimphood.io/traits/grill.png",
        },
      };

      const onGiftSpy = vi.fn();
      render(
        <TraitGrid items={[...sampleItems, duplicateCopy]} onGiftItem={onGiftSpy} />,
      );

      // t-1 has 2 copies (item-1 and item-1-dup):
      // item-1 is equipped on profile -> protected from gifting
      expect(screen.getByTestId("equipped-action-item-1")).toBeInTheDocument();
      expect(screen.queryByTestId("gift-button-item-1")).not.toBeInTheDocument();

      // item-1-dup is the extra copy -> has Gift button
      expect(screen.getByTestId("gift-button-item-1-dup")).toBeInTheDocument();

      // t-2 has only 1 copy (item-2) -> does NOT have Gift button
      expect(screen.queryByTestId("gift-button-item-2")).not.toBeInTheDocument();
    });
  });

  describe("ProfilePage Inventory States", () => {
    it("renders empty state when wallet is not connected", () => {
      render(
        <Providers>
          <ProfilePage />
        </Providers>,
      );

      expect(screen.getByText("Inventory Empty")).toBeInTheDocument();
      expect(screen.getByTestId("inventory-empty")).toBeInTheDocument();
      expect(
        screen.getByText("No items or traits found in your inventory"),
      ).toBeInTheDocument();
    });

    it("renders loading state when fetching inventory", () => {
      mockUseSiweAuth.mockReturnValue({
        status: "authenticated",
        sessionAddress: "0x1234567890123456789012345678901234567890",
        walletAddress: "0x1234567890123456789012345678901234567890",
      });

      // Never resolving promise to assert loading state
      mockFetchUserInventory.mockReturnValue(new Promise(() => {}));

      render(
        <Providers>
          <ProfilePage />
        </Providers>,
      );

      expect(screen.getByTestId("inventory-loading")).toBeInTheDocument();
      expect(screen.getByText("Loading your inventory...")).toBeInTheDocument();
      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    it("renders error state when inventory fetch fails", async () => {
      mockUseSiweAuth.mockReturnValue({
        status: "authenticated",
        sessionAddress: "0x1234567890123456789012345678901234567890",
        walletAddress: "0x1234567890123456789012345678901234567890",
      });

      mockFetchUserInventory.mockRejectedValueOnce(new Error("Network timeout"));

      render(
        <Providers>
          <ProfilePage />
        </Providers>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("inventory-error")).toBeInTheDocument();
        expect(screen.getByText("Unable to load inventory")).toBeInTheDocument();
        expect(screen.getByText("Network timeout")).toBeInTheDocument();
        expect(screen.getByText("Inventory Error")).toBeInTheDocument();
      });
    });

    it("renders TraitGrid when inventory items are fetched successfully", async () => {
      mockUseSiweAuth.mockReturnValue({
        status: "authenticated",
        sessionAddress: "0x1234567890123456789012345678901234567890",
        walletAddress: "0x1234567890123456789012345678901234567890",
      });

      mockFetchUserInventory.mockResolvedValueOnce({
        items: sampleItems,
      });

      render(
        <Providers>
          <ProfilePage />
        </Providers>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("trait-grid")).toBeInTheDocument();
        expect(screen.getByText("Diamond Grill")).toBeInTheDocument();
        expect(screen.getByText("Pilot Cap")).toBeInTheDocument();
        expect(screen.getByText("2 Items")).toBeInTheDocument();
      });
    });
  });
});
