import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import DropsPage from "@/app/drops/page";
import * as dropsClient from "@/lib/drops/client";
import * as siweHook from "@/hooks/useSiweAuth";

vi.mock("@/lib/drops/client", () => ({
  fetchCurrentDrop: vi.fn(),
  claimDropItem: vi.fn(),
}));

vi.mock("@/hooks/useSiweAuth", () => ({
  useSiweAuth: vi.fn(),
}));

// Mock ClaimLootboxModal to assert props cleanly
vi.mock("@/components/drops/ClaimLootboxModal", () => ({
  ClaimLootboxModal: (props: {
    isOpen: boolean;
    onClose: () => void;
    claimedItem?: { id: string; edition: number; trait: { name: string } } | null;
    isLoading?: boolean;
    error?: string | null;
    periodIndex?: number;
  }) => {
    if (!props.isOpen) return null;
    return (
      <div data-testid="mock-lootbox-modal">
        <p>Modal Open - Period #{props.periodIndex}</p>
        {props.isLoading && <p>Lootbox Rolling...</p>}
        {props.error && <p>Modal Error: {props.error}</p>}
        {props.claimedItem && (
          <p>
            Won: {props.claimedItem.trait.name} #{props.claimedItem.edition}
          </p>
        )}
        <button onClick={props.onClose}>Close Modal</button>
      </div>
    );
  },
}));

describe("DropsPage Component (app/drops/page.tsx)", () => {
  const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const pastDate = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const mockActiveDrop: dropsClient.CurrentDropResponse = {
    active: true,
    drop: {
      id: "drop-test-1",
      slug: "genesis-drops",
      title: "ChimpHood Genesis Drops",
      description: "2-hour drop cycles with a 30-minute claim window",
      status: "ACTIVE",
      cycleDurationHours: 2,
    },
    period: {
      id: "period-test-1",
      periodIndex: 1,
      startsAt: pastDate,
      endsAt: futureDate,
      status: "OPEN",
      isStockLocked: false,
    },
    claimWindow: {
      isActive: true,
      startsAt: pastDate,
      endsAt: futureDate,
      timeRemainingMs: 3600000,
    },
    nextCycle: {
      startsAt: futureDate,
      endsAt: new Date(Date.now() + 120 * 60 * 1000).toISOString(),
    },
    stock: {
      totalAllocated: 200,
      totalRemaining: 150,
      isExhausted: false,
      poolItems: [
        {
          poolItemId: "pool-item-1",
          traitId: "trait-katana",
          traitName: "Golden Katana",
          category: "CLOTHING",
          rarity: "LEGENDARY",
          imageUrl: "/images/katana.png",
          remainingStock: 5,
          allocatedStock: 10,
          weight: 10,
          probabilityPercent: 5.0,
        },
        {
          poolItemId: "pool-item-2",
          traitId: "trait-helmet",
          traitName: "Cyber Helmet",
          category: "HEADWEAR",
          rarity: "EPIC",
          imageUrl: "/images/helmet.png",
          remainingStock: 25,
          allocatedStock: 30,
          weight: 20,
          probabilityPercent: 15.0,
        },
        {
          poolItemId: "pool-item-3",
          traitId: "trait-shades",
          traitName: "Neon Shades",
          category: "EYEWEAR",
          rarity: "RARE",
          imageUrl: "/images/shades.png",
          remainingStock: 1, // Low stock <= 2
          allocatedStock: 20,
          weight: 30,
          probabilityPercent: 20.0,
        },
        {
          poolItemId: "pool-item-4",
          traitId: "trait-fur",
          traitName: "Golden Fur",
          category: "FUR",
          rarity: "UNCOMMON",
          imageUrl: "/images/fur.png",
          remainingStock: 40,
          allocatedStock: 50,
          weight: 40,
          probabilityPercent: 25.0,
        },
        {
          poolItemId: "pool-item-5",
          traitId: "trait-bg",
          traitName: "Jungle Mist",
          category: "BG",
          rarity: "COMMON",
          imageUrl: "/images/bg.png",
          remainingStock: 79,
          allocatedStock: 90,
          weight: 50,
          probabilityPercent: 35.0,
        },
      ],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dropsClient.fetchCurrentDrop).mockResolvedValue(mockActiveDrop);
    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "authenticated",
      sessionAddress: "0x1111111111111111111111111111111111111111",
      walletAddress: "0x1111111111111111111111111111111111111111",
      userId: "user-1",
      error: null,
      busyMessage: null,
      login: vi.fn(),
      logout: vi.fn(),
      dismissError: vi.fn(),
    });
  });

  describe("1. Render & Initialization", () => {
    it("renders page header, description, and navigation links", async () => {
      render(<DropsPage />);

      expect(screen.getByText("Trait Drops & Lootbox Engine")).toBeInTheDocument();
      expect(screen.getByText("Stage 1 Live")).toBeInTheDocument();
      expect(screen.getByText(/Claim periodic lootbox mystery pods/i)).toBeInTheDocument();
      expect(screen.getByText("Whitelist Status")).toBeInTheDocument();
      expect(screen.getByText("My Inventory")).toBeInTheDocument();

      await waitFor(() => {
        expect(dropsClient.fetchCurrentDrop).toHaveBeenCalledTimes(1);
      });
    });

    it("displays period index and stock metric cards", async () => {
      render(<DropsPage />);

      await waitFor(() => {
        expect(screen.getByText("#1")).toBeInTheDocument();
        expect(screen.getByText("Period Cycle")).toBeInTheDocument();
        expect(screen.getAllByText(/150/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/\/ 200 Units/)).toBeInTheDocument();
        expect(
          screen.getByText("2-hour drop cycles with a 30-minute claim window"),
        ).toBeInTheDocument();
      });
    });

    it("renders 5-hour hype control cycle description when cycleDurationHours is 5", async () => {
      const hypeDrop: dropsClient.CurrentDropResponse = {
        ...mockActiveDrop,
        drop: {
          ...mockActiveDrop.drop!,
          cycleDurationHours: 5,
        },
      };
      vi.mocked(dropsClient.fetchCurrentDrop).mockResolvedValueOnce(hypeDrop);

      render(<DropsPage />);

      await waitFor(() => {
        expect(
          screen.getByText("5-hour hype control cycle with a 30-minute claim window"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("2. Transparent RNG Drop Pool Distribution", () => {
    it("renders all pool items with traits, categories, and backend-provided probabilities", async () => {
      render(<DropsPage />);

      await waitFor(() => {
        expect(
          screen.getByText(/Drop Pool Inventory \(5 Available Traits\)/i)
        ).toBeInTheDocument();
        expect(screen.getByText("Golden Katana")).toBeInTheDocument();
        expect(screen.getByText("Cyber Helmet")).toBeInTheDocument();
        expect(screen.getByText("Neon Shades")).toBeInTheDocument();
        expect(screen.getByText("Golden Fur")).toBeInTheDocument();
        expect(screen.getByText("Jungle Mist")).toBeInTheDocument();
      });

      // Low stock tag for Neon Shades (remainingStock: 1)
      expect(screen.getByText("Low Stock")).toBeInTheDocument();

      // Probabilities from backend data
      expect(screen.getByText("5%")).toBeInTheDocument();
      expect(screen.getByText("15%")).toBeInTheDocument();
      expect(screen.getByText("20%")).toBeInTheDocument();
      expect(screen.getByText("25%")).toBeInTheDocument();
      expect(screen.getByText("35%")).toBeInTheDocument();

      // Category tags from backend data
      expect(screen.getByText("CLOTHING")).toBeInTheDocument();
      expect(screen.getByText("HEADWEAR")).toBeInTheDocument();
      expect(screen.getByText("EYEWEAR")).toBeInTheDocument();
      expect(screen.getByText("FUR")).toBeInTheDocument();
      expect(screen.getByText("BG")).toBeInTheDocument();
    });
  });

  describe("3. Authentication Guard", () => {
    it("shows actionable 'Connect Wallet' button when user is signed-out and calls login on click", async () => {
      const mockLogin = vi.fn();
      vi.mocked(siweHook.useSiweAuth).mockReturnValue({
        status: "signed-out",
        sessionAddress: null,
        walletAddress: null,
        userId: null,
        error: null,
        busyMessage: null,
        login: mockLogin,
        logout: vi.fn(),
        dismissError: vi.fn(),
      });

      render(<DropsPage />);

      let connectBtn: HTMLElement | null = null;
      await waitFor(() => {
        connectBtn = screen.getByRole("button", { name: /Connect Wallet/i });
        expect(connectBtn).toBeInTheDocument();
        expect(connectBtn).not.toBeDisabled();
      });

      fireEvent.click(connectBtn!);
      expect(mockLogin).toHaveBeenCalledTimes(1);
    });

    it("shows actionable 'Sign In with Ethereum' button when status is wallet-only and calls login on click", async () => {
      const mockLogin = vi.fn();
      vi.mocked(siweHook.useSiweAuth).mockReturnValue({
        status: "wallet-only",
        sessionAddress: null,
        walletAddress: "0x1111111111111111111111111111111111111111",
        userId: null,
        error: null,
        busyMessage: null,
        login: mockLogin,
        logout: vi.fn(),
        dismissError: vi.fn(),
      });

      render(<DropsPage />);

      let siweBtn: HTMLElement | null = null;
      await waitFor(() => {
        siweBtn = screen.getByRole("button", { name: /Sign In with Ethereum/i });
        expect(siweBtn).toBeInTheDocument();
        expect(siweBtn).not.toBeDisabled();
      });

      fireEvent.click(siweBtn!);
      expect(mockLogin).toHaveBeenCalledTimes(1);
    });

    it("shows loading state when status is signing", async () => {
      vi.mocked(siweHook.useSiweAuth).mockReturnValue({
        status: "signing",
        sessionAddress: null,
        walletAddress: "0x1111111111111111111111111111111111111111",
        userId: null,
        error: null,
        busyMessage: "Waiting for signature…",
        login: vi.fn(),
        logout: vi.fn(),
        dismissError: vi.fn(),
      });

      render(<DropsPage />);

      await waitFor(() => {
        const signingBtn = screen.getByRole("button", { name: /Waiting for signature…/i });
        expect(signingBtn).toBeInTheDocument();
        expect(signingBtn).toBeDisabled();
      });
    });
  });

  describe("4. Active Claim Window & Lootbox Claim Flow", () => {
    it("allows authenticated user to claim lootbox and shows modal with won item", async () => {
      vi.mocked(dropsClient.claimDropItem).mockResolvedValue({
        success: true,
        inventoryItem: {
          id: "inv-katana-1",
          edition: 1,
          trait: {
            id: "trait-katana",
            name: "Golden Katana",
            category: "CLOTHING",
            rarity: "LEGENDARY",
          },
        },
      });

      render(<DropsPage />);

      let claimBtn: HTMLElement | null = null;
      await waitFor(() => {
        claimBtn = screen.getByRole("button", { name: /Claim Trait Now/i });
        expect(claimBtn).toBeInTheDocument();
        expect(claimBtn).not.toBeDisabled();
      });

      fireEvent.click(claimBtn!);

      expect(dropsClient.claimDropItem).toHaveBeenCalledWith("drop-test-1", "period-test-1");

      await waitFor(() => {
        expect(screen.getByTestId("mock-lootbox-modal")).toBeInTheDocument();
        expect(screen.getByText("Won: Golden Katana #1")).toBeInTheDocument();
        expect(
          screen.getByText(/Successfully claimed Golden Katana \(Edition #1\)!/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe("5. Already Claimed State", () => {
    it("disables claim button and displays claimed message when user already claimed", async () => {
      vi.mocked(dropsClient.fetchCurrentDrop).mockResolvedValue({
        ...mockActiveDrop,
        userHasClaimed: true,
      });

      render(<DropsPage />);

      await waitFor(() => {
        const claimedIndicator = screen.getByText(/Claimed for Period #1 \(1\/1\)/i);
        expect(claimedIndicator).toBeInTheDocument();

        const claimBtn = screen.getByRole("button", {
          name: /Claimed for Period #1 \(1\/1\)/i,
        });
        expect(claimBtn).toBeDisabled();
        expect(
          screen.getByText(/You have claimed your 1 trait allocation for Period #1/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe("6. Claim Failure & Error Handling", () => {
    it("handles claim failure cleanly and displays error alert", async () => {
      vi.mocked(dropsClient.claimDropItem).mockRejectedValue(
        new Error("Rate limit exceeded. Please wait 120 seconds.")
      );

      render(<DropsPage />);

      let claimBtn: HTMLElement | null = null;
      await waitFor(() => {
        claimBtn = screen.getByRole("button", { name: /Claim Trait Now/i });
        expect(claimBtn).not.toBeDisabled();
      });

      fireEvent.click(claimBtn!);

      await waitFor(() => {
        expect(
          screen.getByText("Rate limit exceeded. Please wait 120 seconds.")
        ).toBeInTheDocument();
        expect(
          screen.getByText("Modal Error: Rate limit exceeded. Please wait 120 seconds.")
        ).toBeInTheDocument();
      });
    });
  });

  describe("7. Drop Status Refresh", () => {
    it("refetches drop status when refresh button is clicked", async () => {
      render(<DropsPage />);

      await waitFor(() => {
        expect(dropsClient.fetchCurrentDrop).toHaveBeenCalledTimes(1);
      });

      const refreshBtn = screen.getByTitle("Refresh Drop Status");
      fireEvent.click(refreshBtn);

      await waitFor(() => {
        expect(dropsClient.fetchCurrentDrop).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("8. Inactive Drop Event", () => {
    it("renders fallback text when no drop event is active", async () => {
      vi.mocked(dropsClient.fetchCurrentDrop).mockResolvedValue({
        active: false,
        message: "No drops active",
      });

      render(<DropsPage />);

      await waitFor(() => {
        expect(
          screen.getByText(
            "No active drop event currently in progress. Cycles renew on UTC schedule."
          )
        ).toBeInTheDocument();
      });
    });
  });

  describe("9. Period Stock Exhausted State", () => {
    it("disables claim button and shows 'Period Stock Exhausted' when total remaining stock is 0", async () => {
      vi.mocked(dropsClient.fetchCurrentDrop).mockResolvedValue({
        ...mockActiveDrop,
        stock: {
          totalAllocated: 200,
          totalRemaining: 0,
          isExhausted: true,
          poolItems: [],
        },
      });

      render(<DropsPage />);

      await waitFor(() => {
        const exhaustedBtn = screen.getByRole("button", {
          name: /Period Stock Exhausted/i,
        });
        expect(exhaustedBtn).toBeInTheDocument();
        expect(exhaustedBtn).toBeDisabled();
      });
    });
  });

  describe("10. Time Formatting with UTC & Local Timezone", () => {
    it("displays closing time with UTC in metric card when claim window is active", async () => {
      render(<DropsPage />);

      await waitFor(() => {
        expect(screen.getByText(/Closes at.*UTC/i)).toBeInTheDocument();
      });
    });

    it("displays cycle start time with UTC in metric card when claim window is closed", async () => {
      vi.mocked(dropsClient.fetchCurrentDrop).mockResolvedValue({
        ...mockActiveDrop,
        claimWindow: {
          isActive: false,
          startsAt: pastDate,
          endsAt: pastDate,
          timeRemainingMs: 0,
        },
      });

      render(<DropsPage />);

      await waitFor(() => {
        expect(screen.getByText(/Cycle starts at.*UTC/i)).toBeInTheDocument();
      });
    });
  });

  describe("11. Auth Status Reactive Sync", () => {
    it("re-fetches drop data when auth status transitions to authenticated", async () => {
      vi.mocked(siweHook.useSiweAuth).mockReturnValue({
        status: "signed-out",
        sessionAddress: null,
        walletAddress: null,
        userId: null,
        error: null,
        busyMessage: null,
        login: vi.fn(),
        logout: vi.fn(),
        dismissError: vi.fn(),
      });

      const { rerender } = render(<DropsPage />);

      await waitFor(() => {
        expect(dropsClient.fetchCurrentDrop).toHaveBeenCalledTimes(1);
      });

      // User connects and authenticates
      vi.mocked(siweHook.useSiweAuth).mockReturnValue({
        status: "authenticated",
        sessionAddress: "0x1111111111111111111111111111111111111111",
        walletAddress: "0x1111111111111111111111111111111111111111",
        userId: "user-1",
        error: null,
        busyMessage: null,
        login: vi.fn(),
        logout: vi.fn(),
        dismissError: vi.fn(),
      });

      rerender(<DropsPage />);

      await waitFor(() => {
        expect(dropsClient.fetchCurrentDrop).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("12. Slice 2: Error State API & Recovery", () => {
    it("renders clear error state and Try Again button when fetch fails on initial mount", async () => {
      vi.mocked(dropsClient.fetchCurrentDrop).mockRejectedValueOnce(
        new Error("Network connection lost. Failed to contact drop service.")
      );

      render(<DropsPage />);

      await waitFor(() => {
        expect(screen.getByText("Failed to Load Drop Event")).toBeInTheDocument();
      });

      expect(
        screen.getByText("Network connection lost. Failed to contact drop service.")
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Try Again/i })).toBeInTheDocument();
      expect(
        screen.queryByText(/No active drop event currently in progress/i)
      ).not.toBeInTheDocument();
    });

    it("retries fetch and recovers when user clicks Try Again", async () => {
      vi.mocked(dropsClient.fetchCurrentDrop)
        .mockRejectedValueOnce(new Error("500 Internal Server Error"))
        .mockResolvedValueOnce(mockActiveDrop);

      render(<DropsPage />);

      await waitFor(() => {
        expect(screen.getByText("Failed to Load Drop Event")).toBeInTheDocument();
      });

      const tryAgainButton = screen.getByRole("button", { name: /Try Again/i });
      fireEvent.click(tryAgainButton);

      await waitFor(() => {
        expect(screen.getByText("#1")).toBeInTheDocument();
        expect(screen.getByText("Golden Katana")).toBeInTheDocument();
      });

      expect(screen.queryByText("Failed to Load Drop Event")).not.toBeInTheDocument();
    });

    it("does not display 'No active drop' message when an error occurred", async () => {
      vi.mocked(dropsClient.fetchCurrentDrop).mockRejectedValueOnce(
        new Error("API rate limit exceeded")
      );

      render(<DropsPage />);

      await waitFor(() => {
        expect(screen.getByText("Failed to Load Drop Event")).toBeInTheDocument();
      });

      expect(
        screen.queryByText(/No active drop event currently in progress/i)
      ).not.toBeInTheDocument();
    });

    it("renders error banner with Try Again when manual refresh fails after successful initial load", async () => {
      render(<DropsPage />);

      await waitFor(() => {
        expect(screen.getByText("Golden Katana")).toBeInTheDocument();
      });

      // Subsequent refresh fails
      vi.mocked(dropsClient.fetchCurrentDrop).mockRejectedValueOnce(
        new Error("Temporary service disruption")
      );

      const refreshBtn = screen.getByTitle("Refresh Drop Status");
      fireEvent.click(refreshBtn);

      await waitFor(() => {
        expect(screen.getByText("Temporary service disruption")).toBeInTheDocument();
      });

      // Existing content remains visible
      expect(screen.getByText("Golden Katana")).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /Try Again/i }).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("13. Slice 2: Drop Pool Empty State", () => {
    it("renders informative empty state when active drop has no pool items without hiding pool section", async () => {
      const dropWithoutPool: dropsClient.CurrentDropResponse = {
        ...mockActiveDrop,
        stock: {
          totalAllocated: 0,
          totalRemaining: 0,
          isExhausted: true,
          poolItems: [],
        },
      };

      vi.mocked(dropsClient.fetchCurrentDrop).mockResolvedValueOnce(dropWithoutPool);

      render(<DropsPage />);

      await waitFor(() => {
        expect(screen.getByText(/Drop Pool Inventory \(0 Available Traits\)/i)).toBeInTheDocument();
      });

      expect(screen.getByTestId("empty-drop-pool")).toBeInTheDocument();
      expect(
        screen.getByText("No traits currently available in this drop pool")
      ).toBeInTheDocument();
      expect(
        screen.getByText(/This drop period does not have any items allocated in its pool yet/i)
      ).toBeInTheDocument();
    });
  });

  describe("14. Slice 2: Category Palette Consistency & Sold Out Badge", () => {
    it("applies category color palette for BG, FUR, CLOTHING, HEADWEAR, EYEWEAR", async () => {
      render(<DropsPage />);

      await waitFor(() => {
        expect(screen.getByText("Golden Katana")).toBeInTheDocument();
      });

      // Category text elements with their respective styles
      const bgBadge = screen.getByText("BG");
      expect(bgBadge.className).toContain("text-sky-400");

      const furBadge = screen.getByText("FUR");
      expect(furBadge.className).toContain("text-amber-400");

      const clothingBadge = screen.getByText("CLOTHING");
      expect(clothingBadge.className).toContain("text-violet-400");

      const headwearBadge = screen.getByText("HEADWEAR");
      expect(headwearBadge.className).toContain("text-emerald-400");

      const eyewearBadge = screen.getByText("EYEWEAR");
      expect(eyewearBadge.className).toContain("text-teal-400");
    });

    it("displays 'Sold Out' badge when an item has remaining stock of 0", async () => {
      const dropWithSoldOutItem: dropsClient.CurrentDropResponse = {
        ...mockActiveDrop,
        stock: {
          totalAllocated: 200,
          totalRemaining: 150,
          isExhausted: false,
          poolItems: [
            {
              poolItemId: "pool-item-sold-out",
              traitId: "trait-katana-sold-out",
              traitName: "Ancient Katana",
              category: "CLOTHING",
              rarity: "LEGENDARY",
              imageUrl: "/images/katana.png",
              remainingStock: 0, // SOLD OUT
              allocatedStock: 10,
              weight: 10,
              probabilityPercent: 5.0,
            },
            {
              poolItemId: "pool-item-available",
              traitId: "trait-helmet",
              traitName: "Cyber Helmet",
              category: "HEADWEAR",
              rarity: "EPIC",
              imageUrl: "/images/helmet.png",
              remainingStock: 15, // IN STOCK
              allocatedStock: 30,
              weight: 20,
              probabilityPercent: 15.0,
            },
          ],
        },
      };

      vi.mocked(dropsClient.fetchCurrentDrop).mockResolvedValueOnce(dropWithSoldOutItem);

      render(<DropsPage />);

      await waitFor(() => {
        expect(screen.getByText("Ancient Katana")).toBeInTheDocument();
      });

      // Exactly 1 sold-out badge
      const soldOutBadges = screen.getAllByTestId("badge-sold-out");
      expect(soldOutBadges).toHaveLength(1);
      expect(soldOutBadges[0]).toHaveTextContent("Sold Out");

      // Cyber Helmet should not have a sold out badge
      expect(screen.getByText("Cyber Helmet")).toBeInTheDocument();
      expect(screen.getByText("Ancient Katana").closest(".group")?.querySelector('[data-testid="badge-sold-out"]')).toBeInTheDocument();
      expect(screen.getByText("Cyber Helmet").closest(".group")?.querySelector('[data-testid="badge-sold-out"]')).toBeNull();
    });
  });

  describe("15. Slice 2: Responsive Visual QA Layout Structure", () => {
    it("renders responsive mobile & desktop container classes correctly across all drop sections", async () => {
      render(<DropsPage />);

      await waitFor(() => {
        expect(screen.getByText("Golden Katana")).toBeInTheDocument();
      });

      // Hero banner has flex-col for mobile and sm:flex-row for desktop
      const heroContainer = screen.getByText("Trait Drops & Lootbox Engine").closest(".flex-col");
      expect(heroContainer?.className).toContain("sm:flex-row");

      // Metrics grid is 1 column on mobile and 3 columns on desktop
      const metricsGrid = screen.getByText("Period Cycle").closest(".grid-cols-1");
      expect(metricsGrid?.className).toContain("sm:grid-cols-3");

      // Pool inventory grid is 1 col on mobile, 2 on sm, 3 on md, 4 on lg
      const poolGrid = screen.getByText("Golden Katana").closest(".grid-cols-1");
      expect(poolGrid?.className).toContain("sm:grid-cols-2");
      expect(poolGrid?.className).toContain("md:grid-cols-3");
      expect(poolGrid?.className).toContain("lg:grid-cols-4");
    });
  });
});
