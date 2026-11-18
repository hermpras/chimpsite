import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import React from "react";
import {
  ClaimLootboxModal,
  type WonTraitData,
  type PoolPreviewItem,
} from "@/components/drops/ClaimLootboxModal";

const { mockEquipUserTrait } = vi.hoisted(() => ({
  mockEquipUserTrait: vi.fn(),
}));

vi.mock("@/lib/inventory/client", () => ({
  equipUserTrait: mockEquipUserTrait,
}));

const MOCK_POOL_ITEMS: PoolPreviewItem[] = [
  {
    poolItemId: "pool-1",
    traitName: "Golden Katana",
    category: "WEAPON",
    rarity: "LEGENDARY",
    imageUrl: "/images/traits/katana.png",
  },
  {
    poolItemId: "pool-2",
    traitName: "Cyber Helmet",
    category: "HEADWEAR",
    rarity: "EPIC",
    imageUrl: "/images/traits/helmet.png",
  },
];

const MOCK_WON_ITEM: WonTraitData = {
  id: "inv-item-123",
  edition: 42,
  trait: {
    id: "trait-katana",
    name: "Golden Katana",
    category: "WEAPON",
    rarity: "LEGENDARY",
    imageUrl: "/images/traits/katana.png",
    description: "Forged in the cyber fires of neo Tokyo.",
  },
};

describe("ClaimLootboxModal Component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <ClaimLootboxModal isOpen={false} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders rolling state with suspense message and pool previews when opened", () => {
    render(
      <ClaimLootboxModal
        isOpen={true}
        onClose={() => {}}
        poolItems={MOCK_POOL_ITEMS}
        isLoading={true}
        periodIndex={3597}
      />,
    );

    expect(screen.getByText("PERIOD #3597 DROP CAPSULE")).toBeInTheDocument();
    expect(screen.getByText("Unlocking Mystery Trait")).toBeInTheDocument();
    expect(
      screen.getByText("Calculating transparent RNG on Elysium"),
    ).toBeInTheDocument();
  });

  it("transitions to REVEAL state after minimum suspense timer and receiving claimed item", () => {
    const { rerender } = render(
      <ClaimLootboxModal
        isOpen={true}
        onClose={() => {}}
        poolItems={MOCK_POOL_ITEMS}
        isLoading={true}
        periodIndex={3597}
      />,
    );

    // Initial rolling state
    expect(screen.getByText("Unlocking Mystery Trait")).toBeInTheDocument();

    // Pass minimum roll delay (2200ms) and provide won item
    act(() => {
      vi.advanceTimersByTime(2500);
    });

    rerender(
      <ClaimLootboxModal
        isOpen={true}
        onClose={() => {}}
        poolItems={MOCK_POOL_ITEMS}
        claimedItem={MOCK_WON_ITEM}
        isLoading={false}
        periodIndex={3597}
      />,
    );

    // Verifies reveal phase
    expect(screen.getByText("LEGENDARY UNLOCKED")).toBeInTheDocument();
    expect(screen.getByText("Golden Katana")).toBeInTheDocument();
    expect(screen.getByText("Edition #42")).toBeInTheDocument();
    expect(screen.getByText("Added to Your Inventory")).toBeInTheDocument();
    expect(
      screen.getByText("Forged in the cyber fires of neo Tokyo."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Equip in Profile/i })).toHaveAttribute(
      "href",
      "/profile",
    );
    expect(screen.getByRole("link", { name: /Share on X/i })).toHaveAttribute(
      "target",
      "_blank",
    );
  });

  it("handles sound toggle muting/unmuting and persists to localStorage", () => {
    localStorage.clear();
    render(
      <ClaimLootboxModal
        isOpen={true}
        onClose={() => {}}
        poolItems={MOCK_POOL_ITEMS}
      />,
    );

    const soundBtn = screen.getByTitle("Mute SFX");
    expect(soundBtn).toBeInTheDocument();

    fireEvent.click(soundBtn);
    expect(screen.getByTitle("Unmute SFX")).toBeInTheDocument();
    expect(localStorage.getItem("elychimp_drops_sound_enabled")).toBe("false");

    fireEvent.click(screen.getByTitle("Unmute SFX"));
    expect(localStorage.getItem("elychimp_drops_sound_enabled")).toBe("true");
  });

  it("allows direct 1-click equipping from reveal phase and updates button state", async () => {
    mockEquipUserTrait.mockResolvedValue({
      success: true,
      itemId: MOCK_WON_ITEM.id,
      category: "WEAPON",
    });
    const handleEquipSuccess = vi.fn();

    render(
      <ClaimLootboxModal
        isOpen={true}
        onClose={() => {}}
        claimedItem={MOCK_WON_ITEM}
        isLoading={false}
        onEquipSuccess={handleEquipSuccess}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    const equipBtn = screen.getByTestId("lootbox-direct-equip-btn");
    expect(equipBtn).toBeInTheDocument();
    expect(equipBtn).toHaveTextContent("EQUIP NOW");

    await act(async () => {
      fireEvent.click(equipBtn);
    });

    expect(mockEquipUserTrait).toHaveBeenCalledWith(MOCK_WON_ITEM.id);
    expect(handleEquipSuccess).toHaveBeenCalledWith(MOCK_WON_ITEM.id);
    expect(equipBtn).toHaveTextContent("EQUIPPED TO AVATAR");
    expect(equipBtn).toBeDisabled();
  });

  it("handles equip error gracefully and shows error notice", async () => {
    mockEquipUserTrait.mockRejectedValue(new Error("Network connection lost"));

    render(
      <ClaimLootboxModal
        isOpen={true}
        onClose={() => {}}
        claimedItem={MOCK_WON_ITEM}
        isLoading={false}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    const equipBtn = screen.getByTestId("lootbox-direct-equip-btn");
    await act(async () => {
      fireEvent.click(equipBtn);
    });

    expect(screen.getByText("Network connection lost")).toBeInTheDocument();
    expect(equipBtn).toHaveTextContent("EQUIP NOW");
    expect(equipBtn).not.toBeDisabled();
  });

  it("verifies enhanced Share on X tweet URL parameters with drops path and hashtags", () => {
    render(
      <ClaimLootboxModal
        isOpen={true}
        onClose={() => {}}
        claimedItem={MOCK_WON_ITEM}
        isLoading={false}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    const shareLink = screen.getByRole("link", { name: /Share on X/i });
    const href = shareLink.getAttribute("href") || "";
    expect(href).toContain("twitter.com/intent/tweet");
    expect(href).toContain(encodeURIComponent("Golden Katana"));
    expect(href).toContain(encodeURIComponent("LEGENDARY #42"));
    expect(href).toContain(encodeURIComponent("@Elychimp"));
    expect(href).toContain(encodeURIComponent("@Enter_elysium"));
    expect(href).toContain("hashtags=Elychimp,Elysium,NFT");
    expect(href).toContain("%2Fdrops");
  });

  it("renders error state when error is provided", () => {
    render(
      <ClaimLootboxModal
        isOpen={true}
        onClose={() => {}}
        error="You have already claimed your 1 trait allocation for this period."
      />,
    );

    expect(screen.getByText("Claim Failed")).toBeInTheDocument();
    expect(
      screen.getByText(
        "You have already claimed your 1 trait allocation for this period.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("calls onClose when Collect & Close is clicked in reveal phase", () => {
    const handleClose = vi.fn();
    render(
      <ClaimLootboxModal
        isOpen={true}
        onClose={handleClose}
        claimedItem={MOCK_WON_ITEM}
        isLoading={false}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    const closeBtn = screen.getByRole("button", { name: "Collect & Close" });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("supports scrollability on short viewports with overflow classes", () => {
    render(
      <ClaimLootboxModal
        isOpen={true}
        onClose={() => {}}
        claimedItem={MOCK_WON_ITEM}
        isLoading={false}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("overflow-y-auto");

    // Modal container inside dialog
    const modalContainer = dialog.querySelector(".max-h-\\[90vh\\]");
    expect(modalContainer).toBeInTheDocument();
    expect(modalContainer).toHaveClass("overflow-y-auto");
  });

  it("triggers mobile haptic rumble on reveal when sound is enabled", () => {
    const mockVibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      value: mockVibrate,
      writable: true,
      configurable: true,
    });
    localStorage.setItem("elychimp_drops_sound_enabled", "true");

    render(
      <ClaimLootboxModal
        isOpen={true}
        onClose={() => {}}
        claimedItem={MOCK_WON_ITEM}
        isLoading={false}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(mockVibrate).toHaveBeenCalledWith([40, 30, 80]);
  });

  it("does not trigger mobile haptics when sound is muted", () => {
    const mockVibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      value: mockVibrate,
      writable: true,
      configurable: true,
    });
    localStorage.setItem("elychimp_drops_sound_enabled", "false");

    render(
      <ClaimLootboxModal
        isOpen={true}
        onClose={() => {}}
        claimedItem={MOCK_WON_ITEM}
        isLoading={false}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(mockVibrate).not.toHaveBeenCalled();
  });
});
