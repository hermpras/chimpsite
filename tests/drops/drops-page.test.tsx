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
    it("shows 'Sign In to Claim' when user is unauthenticated", async () => {
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

      render(<DropsPage />);

      await waitFor(() => {
        const claimBtn = screen.getByRole("button", { name: /Sign In to Claim/i });
        expect(claimBtn).toBeInTheDocument();
        expect(claimBtn).toBeDisabled();
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
});
