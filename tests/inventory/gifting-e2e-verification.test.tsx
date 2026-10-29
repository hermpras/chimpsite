import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import ProfilePage from "@/app/profile/page";
import { Providers } from "@/components/providers";
import type { InventoryItemData } from "@/lib/inventory/client";
import type { GiftItemData } from "@/lib/inventory/gift-client";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/profile",
  useRouter: () => ({
    push: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

const mockFetchWhitelistStatus = vi.fn();
vi.mock("@/lib/whitelist/client", () => ({
  fetchWhitelistStatus: (...args: unknown[]) => mockFetchWhitelistStatus(...args),
}));

const mockFetchUserInventory = vi.fn();
vi.mock("@/lib/inventory/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/inventory/client")>();
  return {
    ...actual,
    fetchUserInventory: (...args: unknown[]) => mockFetchUserInventory(...args),
  };
});

const mockFetchUserGifts = vi.fn();
const mockSendGiftRequest = vi.fn();
const mockResolveGiftRequest = vi.fn();
const mockLookupGiftRecipient = vi.fn();
vi.mock("@/lib/inventory/gift-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/inventory/gift-client")>();
  return {
    ...actual,
    fetchUserGifts: (...args: unknown[]) => mockFetchUserGifts(...args),
    sendGiftRequest: (...args: unknown[]) => mockSendGiftRequest(...args),
    resolveGiftRequest: (...args: unknown[]) => mockResolveGiftRequest(...args),
    lookupGiftRecipient: (...args: unknown[]) => mockLookupGiftRecipient(...args),
  };
});

const mockUseSiweAuth = vi.fn();
vi.mock("@/hooks/useSiweAuth", () => ({
  useSiweAuth: () => mockUseSiweAuth(),
}));

describe("Profile Page Gift UI - End-to-End Verification", () => {
  const userAddress = "0x1111111111111111111111111111111111111111";
  const recipientAddress = "0x2222222222222222222222222222222222222222";

  const singleCopyItem: InventoryItemData = {
    id: "item-unique-1",
    edition: 1,
    acquiredVia: "CLAIM",
    acquiredAt: "2026-10-15T10:00:00.000Z",
    isLocked: false,
    lockReason: null,
    trait: {
      id: "trait-unique-gold",
      name: "Golden Crown",
      category: "HEADWEAR",
      rarity: "LEGENDARY",
      imageUrl: "https://assets.chimphood.io/crown.png",
    },
  };

  const duplicateItem1: InventoryItemData = {
    id: "item-dup-1",
    edition: 5,
    acquiredVia: "DROP",
    acquiredAt: "2026-10-16T10:00:00.000Z",
    isLocked: false,
    lockReason: null,
    trait: {
      id: "trait-dup-visor",
      name: "Neon Visor",
      category: "EYEWEAR",
      rarity: "RARE",
      imageUrl: "https://assets.chimphood.io/visor.png",
    },
  };

  const duplicateItem2: InventoryItemData = {
    id: "item-dup-2",
    edition: 6,
    acquiredVia: "DROP",
    acquiredAt: "2026-10-16T11:00:00.000Z",
    isLocked: false,
    lockReason: null,
    trait: {
      id: "trait-dup-visor",
      name: "Neon Visor",
      category: "EYEWEAR",
      rarity: "RARE",
      imageUrl: "https://assets.chimphood.io/visor.png",
    },
  };

  const incomingPendingGift: GiftItemData = {
    id: "gift-incoming-1",
    senderId: "user-sender-99",
    receiverId: "user-current",
    inventoryItemId: "item-inc-1",
    status: "PENDING",
    expiresAt: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    inventoryItem: {
      id: "item-inc-1",
      edition: 42,
      trait: {
        id: "trait-laser",
        name: "Laser Eyes",
        category: "EYES",
        rarity: "EPIC",
        imageUrl: "https://assets.chimphood.io/laser.png",
      },
    },
    sender: {
      id: "user-sender-99",
      wallet: { address: "0x3333333333333333333333333333333333333333" },
      xIdentity: {
        username: "cryptochimp_x",
        name: "Crypto Chimp",
        profileImageUrl: null,
      },
    },
  };

  const outgoingPendingGift: GiftItemData = {
    id: "gift-outgoing-1",
    senderId: "user-current",
    receiverId: "user-receiver-88",
    inventoryItemId: "item-dup-2",
    status: "PENDING",
    expiresAt: new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    inventoryItem: {
      id: "item-dup-2",
      edition: 6,
      trait: {
        id: "trait-dup-visor",
        name: "Neon Visor",
        category: "EYEWEAR",
        rarity: "RARE",
        imageUrl: "https://assets.chimphood.io/visor.png",
      },
    },
    receiver: {
      id: "user-receiver-88",
      wallet: { address: "0x4444444444444444444444444444444444444444" },
      xIdentity: {
        username: "queen_chimphood",
        name: "Queen Chimp",
        profileImageUrl: null,
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSiweAuth.mockReturnValue({
      status: "authenticated",
      sessionAddress: userAddress,
      walletAddress: userAddress,
    });
    mockFetchWhitelistStatus.mockResolvedValue({
      configured: true,
      authenticated: true,
      status: {
        phase: "QUALIFIED",
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          heldCategories: ["HEADWEAR", "EYEWEAR"],
          missingCategories: [],
          completedMandatoryTasksCount: 1,
          totalMandatoryTasksCount: 1,
          isBanned: false,
        },
      },
    });
    mockFetchUserInventory.mockResolvedValue({
      items: [singleCopyItem, duplicateItem1, duplicateItem2],
    });
    mockFetchUserGifts.mockResolvedValue({
      sentGifts: [outgoingPendingGift],
      receivedGifts: [incomingPendingGift],
    });
  });

  it("verifies full end-to-end Gift UI flow on Profile page", async () => {
    render(
      <Providers>
        <ProfilePage />
      </Providers>,
    );

    // 1. Tombol Gift Trait terlihat pada item duplikat ekstra (duplicateItem2), sementara item equipped (duplicateItem1) dilindungi
    await waitFor(() => {
      // duplicateItem1 (ed 5) is equipped on Profile
      expect(screen.getByTestId(`equipped-badge-${duplicateItem1.id}`)).toHaveTextContent("Equipped");
      expect(screen.getByTestId(`equipped-action-${duplicateItem1.id}`)).toHaveTextContent("In Use on Profile");
      expect(screen.queryByTestId(`gift-button-${duplicateItem1.id}`)).not.toBeInTheDocument();

      // duplicateItem2 (ed 6) is the extra duplicate eligible for gifting
      expect(screen.getByTestId(`gift-button-${duplicateItem2.id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`gift-button-${duplicateItem2.id}`)).toHaveTextContent("Gift Trait");
      expect(screen.getByTestId(`duplicate-badge-${duplicateItem2.id}`)).toHaveTextContent("Duplicate (2x)");
    });

    // 2. Item tunggal menampilkan keterangan bahwa item harus disimpan
    expect(screen.queryByTestId(`gift-button-${singleCopyItem.id}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`single-copy-badge-${singleCopyItem.id}`)).toHaveTextContent(
      "Keep 1 in HEADWEAR (Category minimum)",
    );

    // 3. Modal Gift bisa dibuka dari item ekstra, username X dicari, dan penerima dikonfirmasi
    fireEvent.click(screen.getByTestId(`gift-button-${duplicateItem2.id}`));
    const modal = screen.getByTestId("gift-modal");
    expect(modal).toBeInTheDocument();
    expect(within(modal).getByText("Gift Trait")).toBeInTheDocument();
    expect(within(modal).getByText("Neon Visor")).toBeInTheDocument();
    expect(within(modal).getByText("#6")).toBeInTheDocument();

    mockLookupGiftRecipient.mockResolvedValueOnce({
      success: true,
      recipient: {
        userId: "user-target-id",
        address: recipientAddress,
        xUsername: "target_chimp",
        xName: "Target Chimp User",
        profileImageUrl: "https://example.com/target.png",
        isSelf: false,
        isBanned: false,
        isWlAllocated: false,
        alreadyOwnsTrait: false,
        canReceive: true,
      },
    });

    const receiverInput = screen.getByTestId("gift-receiver-input");
    fireEvent.change(receiverInput, { target: { value: "@target_chimp" } });

    const searchBtn = screen.getByTestId("search-recipient-btn");
    fireEvent.click(searchBtn);

    await waitFor(() => {
      expect(mockLookupGiftRecipient).toHaveBeenCalledWith("@target_chimp", duplicateItem2.trait.id);
      expect(screen.getByTestId("recipient-confirmation-card")).toBeInTheDocument();
      expect(screen.getByText("@target_chimp")).toBeInTheDocument();
      expect(screen.getByText("Target Chimp User")).toBeInTheDocument();
      expect(screen.getByText("0x2222...2222")).toBeInTheDocument();
      expect(screen.getByText("Verified")).toBeInTheDocument();
    });

    // 4. Pengiriman Gift berjalan melalui backend yang sudah ada
    mockSendGiftRequest.mockResolvedValueOnce({
      success: true,
      gift: { id: "g-new-transferred" } as any,
    });

    const submitBtn = screen.getByTestId("send-gift-submit");
    expect(submitBtn).toBeEnabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockSendGiftRequest).toHaveBeenCalledWith(recipientAddress, duplicateItem2.id);
      expect(screen.getByTestId("gift-send-success")).toBeInTheDocument();
    });

    // 5. Bagian Incoming dan Outgoing menampilkan status serta aksi yang sesuai
    expect(screen.getByTestId("gifts-section")).toBeInTheDocument();

    // Incoming gift displays X username and Accept/Reject buttons
    expect(screen.getByTestId(`incoming-gift-${incomingPendingGift.id}`)).toBeInTheDocument();
    expect(screen.getByText(/From: @cryptochimp_x \(0x3333\.\.\.3333\)/i)).toBeInTheDocument();
    const acceptBtn = screen.getByTestId(`accept-gift-${incomingPendingGift.id}`);
    const rejectBtn = screen.getByTestId(`reject-gift-${incomingPendingGift.id}`);
    expect(acceptBtn).toBeInTheDocument();
    expect(rejectBtn).toBeInTheDocument();

    // Outgoing gift displays X username and Cancel button
    expect(screen.getByTestId(`outgoing-gift-${outgoingPendingGift.id}`)).toBeInTheDocument();
    expect(screen.getByText(/To: @queen_chimphood \(0x4444\.\.\.4444\)/i)).toBeInTheDocument();
    const cancelBtn = screen.getByTestId(`cancel-gift-${outgoingPendingGift.id}`);
    expect(cancelBtn).toBeInTheDocument();

    // Execute Accept on incoming gift
    mockResolveGiftRequest.mockResolvedValueOnce({ success: true, result: {} });
    fireEvent.click(acceptBtn);
    await waitFor(() => {
      expect(mockResolveGiftRequest).toHaveBeenCalledWith(incomingPendingGift.id, "ACCEPT");
      expect(screen.getByTestId("gift-action-success")).toBeInTheDocument();
      expect(
        screen.getByText(/Gift accepted! "Laser Eyes" \(#42\) has been added to your inventory/i),
      ).toBeInTheDocument();
    });
  });

  it("enforces category-based eligibility: two different traits in the same category allow gifting either one while single category item cannot be gifted", async () => {
    const duskItem: InventoryItemData = {
      id: "item-bg-dusk",
      edition: 1,
      acquiredVia: "CLAIM",
      acquiredAt: "2026-10-15T10:00:00.000Z",
      isLocked: false,
      trait: {
        id: "trait-bg-dusk",
        name: "DUSK",
        category: "BG",
        rarity: "COMMON",
        imageUrl: "https://assets.chimphood.io/dusk.png",
      },
    };

    const skyItem: InventoryItemData = {
      id: "item-bg-sky",
      edition: 1,
      acquiredVia: "CLAIM",
      acquiredAt: "2026-10-15T11:00:00.000Z",
      isLocked: false,
      trait: {
        id: "trait-bg-sky",
        name: "SKY",
        category: "BG",
        rarity: "UNCOMMON",
        imageUrl: "https://assets.chimphood.io/sky.png",
      },
    };

    const solitaryFurItem: InventoryItemData = {
      id: "item-fur-graphite",
      edition: 1,
      acquiredVia: "CLAIM",
      acquiredAt: "2026-10-15T12:00:00.000Z",
      isLocked: false,
      trait: {
        id: "trait-fur-graphite",
        name: "GRAPHITE",
        category: "FUR",
        rarity: "COMMON",
        imageUrl: "https://assets.chimphood.io/graphite.png",
      },
    };

    mockFetchUserInventory.mockResolvedValue({
      items: [duskItem, skyItem, solitaryFurItem],
    });

    render(
      <Providers>
        <ProfilePage />
      </Providers>,
    );

    // BG category has 2 items: duskItem is equipped (protected), skyItem is extra available (giftable)
    await waitFor(() => {
      expect(screen.getByTestId(`equipped-badge-${duskItem.id}`)).toHaveTextContent("Equipped");
      expect(screen.getByTestId(`equipped-action-${duskItem.id}`)).toHaveTextContent("In Use on Profile");
      expect(screen.queryByTestId(`gift-button-${duskItem.id}`)).not.toBeInTheDocument();

      expect(screen.getByTestId(`gift-button-${skyItem.id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`duplicate-badge-${skyItem.id}`)).toHaveTextContent("Extra BG (2 avail)");
    });

    // FUR category only has 1 item -> Gift button is NOT present, category minimum badge shown
    expect(screen.queryByTestId(`gift-button-${solitaryFurItem.id}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`single-copy-badge-${solitaryFurItem.id}`)).toHaveTextContent(
      "Keep 1 in FUR (Category minimum)",
    );

    // Gifting unequipped extra SKY opens modal and confirms BG category requirement
    fireEvent.click(screen.getByTestId(`gift-button-${skyItem.id}`));
    const modal = screen.getByTestId("gift-modal");
    expect(modal).toBeInTheDocument();
    expect(within(modal).getByText("SKY")).toBeInTheDocument();
    expect(
      within(modal).getByText(/You must retain at least 1 item in the BG category/i),
    ).toBeInTheDocument();
  });
});
