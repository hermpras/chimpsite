import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import { TraitGrid } from "@/components/inventory/TraitGrid";
import { GiftModal } from "@/components/inventory/GiftModal";
import { GiftsSection } from "@/components/inventory/GiftsSection";
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

describe("Gifting UI (I-1) Test Suite", () => {
  const senderAddress = "0x1111111111111111111111111111111111111111";
  const validReceiverAddress = "0x2222222222222222222222222222222222222222";

  // Item 1: Unique trait (only 1 copy)
  const singleItem: InventoryItemData = {
    id: "item-single-1",
    edition: 1,
    acquiredVia: "CLAIM",
    acquiredAt: "2026-10-15T10:00:00.000Z",
    isLocked: false,
    lockReason: null,
    trait: {
      id: "trait-unique",
      name: "Golden Crown",
      category: "HEADWEAR",
      rarity: "LEGENDARY",
      imageUrl: "https://assets.chimphood.io/crown.png",
    },
  };

  // Item 2 & 3: Duplicate traits (2 copies of trait-dup)
  const dupItem1: InventoryItemData = {
    id: "item-dup-1",
    edition: 10,
    acquiredVia: "DROP",
    acquiredAt: "2026-10-16T10:00:00.000Z",
    isLocked: false,
    lockReason: null,
    trait: {
      id: "trait-dup",
      name: "Neon Visor",
      category: "EYEWEAR",
      rarity: "RARE",
      imageUrl: "https://assets.chimphood.io/visor.png",
    },
  };

  const dupItem2: InventoryItemData = {
    id: "item-dup-2",
    edition: 11,
    acquiredVia: "DROP",
    acquiredAt: "2026-10-16T11:00:00.000Z",
    isLocked: false,
    lockReason: null,
    trait: {
      id: "trait-dup",
      name: "Neon Visor",
      category: "EYEWEAR",
      rarity: "RARE",
      imageUrl: "https://assets.chimphood.io/visor.png",
    },
  };

  // Item 4: Locked duplicate item
  const lockedDupItem: InventoryItemData = {
    id: "item-dup-locked",
    edition: 12,
    acquiredVia: "DROP",
    acquiredAt: "2026-10-16T12:00:00.000Z",
    isLocked: true,
    lockReason: "PENDING_GIFT",
    trait: {
      id: "trait-dup",
      name: "Neon Visor",
      category: "EYEWEAR",
      rarity: "RARE",
      imageUrl: "https://assets.chimphood.io/visor.png",
    },
  };

  const samplePendingIncomingGift: GiftItemData = {
    id: "gift-inc-1",
    senderId: "user-sender-1",
    receiverId: "user-receiver-1",
    inventoryItemId: "item-inc-1",
    status: "PENDING",
    expiresAt: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(), // 18h left
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
      id: "user-sender-1",
      wallet: { address: "0x3333333333333333333333333333333333333333" },
    },
  };

  const samplePendingOutgoingGift: GiftItemData = {
    id: "gift-out-1",
    senderId: "user-sender-1",
    receiverId: "user-receiver-2",
    inventoryItemId: "item-out-1",
    status: "PENDING",
    expiresAt: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    inventoryItem: {
      id: "item-out-1",
      edition: 99,
      trait: {
        id: "trait-hoodie",
        name: "Cyber Hoodie",
        category: "CLOTHES",
        rarity: "UNCOMMON",
        imageUrl: "https://assets.chimphood.io/hoodie.png",
      },
    },
    receiver: {
      id: "user-receiver-2",
      wallet: { address: "0x4444444444444444444444444444444444444444" },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSiweAuth.mockReturnValue({
      status: "authenticated",
      sessionAddress: senderAddress,
      walletAddress: senderAddress,
    });
    mockFetchWhitelistStatus.mockResolvedValue({
      configured: true,
      authenticated: true,
      status: {
        phase: "QUALIFIED",
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          heldCategories: ["EYEWEAR"],
          missingCategories: [],
          completedMandatoryTasksCount: 1,
          totalMandatoryTasksCount: 1,
          isBanned: false,
        },
      },
    });
    mockFetchUserInventory.mockResolvedValue({
      items: [singleItem, dupItem1, dupItem2],
    });
    mockFetchUserGifts.mockResolvedValue({
      sentGifts: [],
      receivedGifts: [],
    });
  });

  describe("1. Duplicate Trait Gifting Enforcement (TraitGrid)", () => {
    it("renders Gift button ONLY for duplicate traits, and NOT for unique single-copy traits", () => {
      const onGiftSpy = vi.fn();
      render(
        <TraitGrid items={[singleItem, dupItem1, dupItem2]} onGiftItem={onGiftSpy} />,
      );

      // Single copy trait: Golden Crown (only 1 copy in inventory)
      expect(
        screen.queryByTestId(`gift-button-${singleItem.id}`),
      ).not.toBeInTheDocument();

      // Duplicate copies: Neon Visor (2 copies in inventory)
      const giftButton1 = screen.getByTestId(`gift-button-${dupItem1.id}`);
      const giftButton2 = screen.getByTestId(`gift-button-${dupItem2.id}`);
      expect(giftButton1).toBeInTheDocument();
      expect(giftButton2).toBeInTheDocument();

      // Duplicate badges are visible
      expect(screen.getByTestId(`duplicate-badge-${dupItem1.id}`)).toHaveTextContent(
        "Duplicate (2x)",
      );

      // Clicking opens gift handler
      fireEvent.click(giftButton1);
      expect(onGiftSpy).toHaveBeenCalledWith(dupItem1);
    });

    it("disables Gift button if the duplicate item is already locked in a pending gift", () => {
      const onGiftSpy = vi.fn();
      render(<TraitGrid items={[dupItem1, lockedDupItem]} onGiftItem={onGiftSpy} />);

      const lockedBtn = screen.getByTestId(`gift-button-${lockedDupItem.id}`);
      expect(lockedBtn).toBeDisabled();
      expect(lockedBtn).toHaveTextContent("Locked in Gift");
    });

    it("renders Gift button when user owns two different traits in the same category (e.g. BG DUSK and BG SKY)", () => {
      const bgItem1: InventoryItemData = {
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

      const bgItem2: InventoryItemData = {
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

      const onGiftSpy = vi.fn();
      render(<TraitGrid items={[bgItem1, bgItem2]} onGiftItem={onGiftSpy} />);

      // Both items are eligible because BG category has 2 items
      const btn1 = screen.getByTestId(`gift-button-${bgItem1.id}`);
      const btn2 = screen.getByTestId(`gift-button-${bgItem2.id}`);
      expect(btn1).toBeInTheDocument();
      expect(btn2).toBeInTheDocument();
      expect(screen.getByTestId(`duplicate-badge-${bgItem1.id}`)).toHaveTextContent("Extra BG (2x)");
      expect(screen.getByTestId(`duplicate-badge-${bgItem2.id}`)).toHaveTextContent("Extra BG (2x)");

      fireEvent.click(btn1);
      expect(onGiftSpy).toHaveBeenCalledWith(bgItem1);
    });
  });

  describe("2. Gift Form & Wallet Address Validation (GiftModal)", () => {
    it("validates empty, invalid, and self wallet address formats correctly", async () => {
      const onCloseSpy = vi.fn();
      const onSuccessSpy = vi.fn();

      render(
        <GiftModal
          isOpen={true}
          onClose={onCloseSpy}
          item={dupItem1}
          senderAddress={senderAddress}
          onGiftSuccess={onSuccessSpy}
        />,
      );

      // Shows trait details and invariant rules
      expect(screen.getByText("Neon Visor")).toBeInTheDocument();
      expect(screen.getByText("#10")).toBeInTheDocument();
      expect(
        screen.getByText(/You must retain at least 1 item in the EYEWEAR category/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Pending gifts remain active until accepted or cancelled/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /Wallets with an allocated Whitelist slot cannot receive gifts/i,
        ),
      ).toBeInTheDocument();

      const submitButton = screen.getByTestId("send-gift-submit");
      const input = screen.getByTestId("gift-receiver-input");

      // Initially empty -> button disabled
      expect(submitButton).toBeDisabled();

      // Enter invalid address (not 40 hex chars)
      fireEvent.change(input, { target: { target: input, value: "0x12345" } });
      expect(screen.getByText(/Invalid EVM wallet address format/i)).toBeInTheDocument();
      expect(submitButton).toBeDisabled();

      // Enter self address -> cannot gift to self
      fireEvent.change(input, { target: { target: input, value: senderAddress } });
      expect(screen.getByText(/You cannot send a gift to yourself/i)).toBeInTheDocument();
      expect(submitButton).toBeDisabled();

      // Enter valid EVM address -> button becomes enabled and error clears
      fireEvent.change(input, { target: { target: input, value: validReceiverAddress } });
      expect(screen.queryByText(/Invalid EVM/i)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/You cannot send a gift to yourself/i),
      ).not.toBeInTheDocument();
      expect(submitButton).toBeEnabled();
    });

    it("handles gift submission loading, error messages, and success flow", async () => {
      mockSendGiftRequest.mockResolvedValueOnce({
        success: true,
        gift: { id: "new-gift-1" } as any,
      });

      const onSuccessSpy = vi.fn();
      render(
        <GiftModal
          isOpen={true}
          onClose={vi.fn()}
          item={dupItem1}
          senderAddress={senderAddress}
          onGiftSuccess={onSuccessSpy}
        />,
      );

      const input = screen.getByTestId("gift-receiver-input");
      fireEvent.change(input, { target: { value: validReceiverAddress } });

      const submitButton = screen.getByTestId("send-gift-submit");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockSendGiftRequest).toHaveBeenCalledWith(
          validReceiverAddress,
          dupItem1.id,
        );
        expect(onSuccessSpy).toHaveBeenCalled();
        expect(screen.getByTestId("gift-send-success")).toBeInTheDocument();
        expect(
          screen.getByText(
            /Gift sent successfully! Trait "Neon Visor" \(#10\) is now pending/i,
          ),
        ).toBeInTheDocument();
      });
    });

    it("displays API error from backend (e.g. daily limit exceeded, recipient owns trait)", async () => {
      mockSendGiftRequest.mockRejectedValueOnce(
        new Error("Each wallet may send at most one gift per UTC day."),
      );

      render(
        <GiftModal
          isOpen={true}
          onClose={vi.fn()}
          item={dupItem1}
          senderAddress={senderAddress}
          onGiftSuccess={vi.fn()}
        />,
      );

      const input = screen.getByTestId("gift-receiver-input");
      fireEvent.change(input, { target: { value: validReceiverAddress } });

      const submitButton = screen.getByTestId("send-gift-submit");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByTestId("gift-send-error")).toBeInTheDocument();
        expect(
          screen.getByText("Each wallet may send at most one gift per UTC day."),
        ).toBeInTheDocument();
      });
    });

    it("searches recipient by X username, renders confirmation preview card, and sends to verified address", async () => {
      mockLookupGiftRecipient.mockResolvedValueOnce({
        success: true,
        recipient: {
          userId: "user-2",
          address: validReceiverAddress,
          xUsername: "chimp_master",
          xName: "Master Chimp",
          profileImageUrl: "https://example.com/avatar.png",
          isSelf: false,
          isBanned: false,
          isWlAllocated: false,
          alreadyOwnsTrait: false,
          canReceive: true,
        },
      });

      mockSendGiftRequest.mockResolvedValueOnce({
        success: true,
        gift: { id: "new-gift-x" } as any,
      });

      const onSuccessSpy = vi.fn();
      render(
        <GiftModal
          isOpen={true}
          onClose={vi.fn()}
          item={dupItem1}
          senderAddress={senderAddress}
          onGiftSuccess={onSuccessSpy}
        />,
      );

      const input = screen.getByTestId("gift-receiver-input");
      fireEvent.change(input, { target: { value: "@chimp_master" } });

      const searchBtn = screen.getByTestId("search-recipient-btn");
      fireEvent.click(searchBtn);

      await waitFor(() => {
        expect(mockLookupGiftRecipient).toHaveBeenCalledWith(
          "@chimp_master",
          dupItem1.trait.id,
        );
        expect(screen.getByTestId("recipient-confirmation-card")).toBeInTheDocument();
        expect(screen.getByText("@chimp_master")).toBeInTheDocument();
        expect(screen.getByText("Master Chimp")).toBeInTheDocument();
        expect(screen.getByText("Verified")).toBeInTheDocument();
      });

      const submitButton = screen.getByTestId("send-gift-submit");
      expect(submitButton).toBeEnabled();
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockSendGiftRequest).toHaveBeenCalledWith(
          validReceiverAddress,
          dupItem1.id,
        );
        expect(onSuccessSpy).toHaveBeenCalled();
        expect(screen.getByTestId("gift-send-success")).toBeInTheDocument();
      });
    });

    it("blocks sending when X recipient already owns the trait", async () => {
      mockLookupGiftRecipient.mockResolvedValueOnce({
        success: true,
        recipient: {
          userId: "user-3",
          address: "0x3333333333333333333333333333333333333333",
          xUsername: "duplicate_holder",
          xName: "Duplicate Holder",
          profileImageUrl: null,
          isSelf: false,
          isBanned: false,
          isWlAllocated: false,
          alreadyOwnsTrait: true,
          canReceive: false,
        },
      });

      render(
        <GiftModal
          isOpen={true}
          onClose={vi.fn()}
          item={dupItem1}
          senderAddress={senderAddress}
          onGiftSuccess={vi.fn()}
        />,
      );

      const input = screen.getByTestId("gift-receiver-input");
      fireEvent.change(input, { target: { value: "duplicate_holder" } });

      const searchBtn = screen.getByTestId("search-recipient-btn");
      fireEvent.click(searchBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Recipient already owns this trait/i),
        ).toBeInTheDocument();
        expect(screen.getByTestId("send-gift-submit")).toBeDisabled();
      });
    });

    it("blocks sending when X recipient has allocated Whitelist slot", async () => {
      mockLookupGiftRecipient.mockResolvedValueOnce({
        success: true,
        recipient: {
          userId: "user-4",
          address: "0x4444444444444444444444444444444444444444",
          xUsername: "wl_holder",
          xName: "WL Holder",
          profileImageUrl: null,
          isSelf: false,
          isBanned: false,
          isWlAllocated: true,
          alreadyOwnsTrait: false,
          canReceive: false,
        },
      });

      render(
        <GiftModal
          isOpen={true}
          onClose={vi.fn()}
          item={dupItem1}
          senderAddress={senderAddress}
          onGiftSuccess={vi.fn()}
        />,
      );

      const input = screen.getByTestId("gift-receiver-input");
      fireEvent.change(input, { target: { value: "wl_holder" } });

      const searchBtn = screen.getByTestId("search-recipient-btn");
      fireEvent.click(searchBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Wallets with an allocated Whitelist slot cannot receive gifts/i),
        ).toBeInTheDocument();
        expect(screen.getByTestId("send-gift-submit")).toBeDisabled();
      });
    });

    it("displays error when X recipient account is not found", async () => {
      mockLookupGiftRecipient.mockRejectedValueOnce(
        new Error("No ChimpHood account found linked to @ghost_user."),
      );

      render(
        <GiftModal
          isOpen={true}
          onClose={vi.fn()}
          item={dupItem1}
          senderAddress={senderAddress}
          onGiftSuccess={vi.fn()}
        />,
      );

      const input = screen.getByTestId("gift-receiver-input");
      fireEvent.change(input, { target: { value: "ghost_user" } });

      const searchBtn = screen.getByTestId("search-recipient-btn");
      fireEvent.click(searchBtn);

      await waitFor(() => {
        expect(
          screen.getByText("No ChimpHood account found linked to @ghost_user."),
        ).toBeInTheDocument();
        expect(screen.getByTestId("send-gift-submit")).toBeDisabled();
      });
    });
  });

  describe("3. Pending Incoming Gifts & Accept / Reject Actions (GiftsSection)", () => {
    it("displays pending incoming gifts and triggers Accept action with refresh", async () => {
      mockResolveGiftRequest.mockResolvedValueOnce({ success: true, result: {} });
      const onRefreshSpy = vi.fn();

      render(
        <GiftsSection
          sentGifts={[]}
          receivedGifts={[samplePendingIncomingGift]}
          isLoading={false}
          isWlAllocated={false}
          onRefresh={onRefreshSpy}
        />,
      );

      expect(screen.getByText("Pending Incoming Gifts (1)")).toBeInTheDocument();
      expect(screen.getByText("Laser Eyes")).toBeInTheDocument();
      expect(screen.getByText("#42")).toBeInTheDocument();

      const acceptBtn = screen.getByTestId(`accept-gift-${samplePendingIncomingGift.id}`);
      const rejectBtn = screen.getByTestId(`reject-gift-${samplePendingIncomingGift.id}`);
      expect(acceptBtn).toBeInTheDocument();
      expect(rejectBtn).toBeInTheDocument();

      fireEvent.click(acceptBtn);

      await waitFor(() => {
        expect(mockResolveGiftRequest).toHaveBeenCalledWith(
          samplePendingIncomingGift.id,
          "ACCEPT",
        );
        expect(onRefreshSpy).toHaveBeenCalled();
        expect(screen.getByTestId("gift-action-success")).toBeInTheDocument();
        expect(
          screen.getByText(
            /Gift accepted! "Laser Eyes" \(#42\) has been added to your inventory/i,
          ),
        ).toBeInTheDocument();
      });
    });

    it("triggers Reject action for incoming gift and refreshes state", async () => {
      mockResolveGiftRequest.mockResolvedValueOnce({ success: true, result: {} });
      const onRefreshSpy = vi.fn();

      render(
        <GiftsSection
          sentGifts={[]}
          receivedGifts={[samplePendingIncomingGift]}
          isLoading={false}
          isWlAllocated={false}
          onRefresh={onRefreshSpy}
        />,
      );

      const rejectBtn = screen.getByTestId(`reject-gift-${samplePendingIncomingGift.id}`);
      fireEvent.click(rejectBtn);

      await waitFor(() => {
        expect(mockResolveGiftRequest).toHaveBeenCalledWith(
          samplePendingIncomingGift.id,
          "REJECT",
        );
        expect(onRefreshSpy).toHaveBeenCalled();
        expect(
          screen.getByText(/Gift rejected. Trait returned to sender/i),
        ).toBeInTheDocument();
      });
    });

    it("enforces WL allocated rule: allocated wallets CANNOT accept incoming gifts", () => {
      render(
        <GiftsSection
          sentGifts={[]}
          receivedGifts={[samplePendingIncomingGift]}
          isLoading={false}
          isWlAllocated={true} // Wallet is WL allocated
          onRefresh={vi.fn()}
        />,
      );

      // Warning notice is displayed
      expect(screen.getByTestId("wl-allocated-gift-notice")).toBeInTheDocument();
      expect(screen.getByText(/WL Allocated Wallet Notice/i)).toBeInTheDocument();

      // Accept button is disabled
      const acceptBtn = screen.getByTestId(`accept-gift-${samplePendingIncomingGift.id}`);
      expect(acceptBtn).toBeDisabled();
      expect(acceptBtn).toHaveAttribute(
        "title",
        "Wallets with an allocated Whitelist slot cannot receive gifts",
      );
    });

    it("displays sender X handle alongside wallet address when available", () => {
      const giftWithX: GiftItemData = {
        ...samplePendingIncomingGift,
        sender: {
          id: "user-sender-x",
          wallet: { address: "0x3333333333333333333333333333333333333333" },
          xIdentity: {
            username: "chimpy_sender",
            name: "Chimpy",
            profileImageUrl: null,
          },
        },
      };

      render(
        <GiftsSection
          sentGifts={[]}
          receivedGifts={[giftWithX]}
          isLoading={false}
          isWlAllocated={false}
          onRefresh={vi.fn()}
        />,
      );

      expect(screen.getByText(/From: @chimpy_sender \(0x3333\.\.\.3333\)/i)).toBeInTheDocument();
    });
  });

  describe("4. Pending Outgoing Gifts & Cancel Action (GiftsSection)", () => {
    it("displays pending outgoing gifts and triggers Cancel action with inventory unlock", async () => {
      mockResolveGiftRequest.mockResolvedValueOnce({ success: true, result: {} });
      const onRefreshSpy = vi.fn();

      render(
        <GiftsSection
          sentGifts={[samplePendingOutgoingGift]}
          receivedGifts={[]}
          isLoading={false}
          isWlAllocated={false}
          onRefresh={onRefreshSpy}
        />,
      );

      expect(screen.getByText("Pending Outgoing Gifts (1)")).toBeInTheDocument();
      expect(screen.getByText("Cyber Hoodie")).toBeInTheDocument();
      expect(screen.getByText("#99")).toBeInTheDocument();

      const cancelBtn = screen.getByTestId(`cancel-gift-${samplePendingOutgoingGift.id}`);
      expect(cancelBtn).toBeInTheDocument();

      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(mockResolveGiftRequest).toHaveBeenCalledWith(
          samplePendingOutgoingGift.id,
          "CANCEL",
        );
        expect(onRefreshSpy).toHaveBeenCalled();
        expect(
          screen.getByText(/Gift cancelled. Trait #99 unlocked in your inventory/i),
        ).toBeInTheDocument();
      });
    });

    it("renders empty state messages when there are no incoming or outgoing gifts", () => {
      render(
        <GiftsSection
          sentGifts={[]}
          receivedGifts={[]}
          isLoading={false}
          isWlAllocated={false}
          onRefresh={vi.fn()}
        />,
      );

      expect(screen.getByTestId("no-incoming-gifts")).toHaveTextContent(
        "No pending incoming gifts.",
      );
      expect(screen.getByTestId("no-outgoing-gifts")).toHaveTextContent(
        "No pending outgoing gifts.",
      );
    });
  });

  describe("5. ProfilePage Integrated Gifting Flow & Refresh Consistency", () => {
    it("renders GiftsSection on ProfilePage when authenticated, opens modal from duplicate item, and refreshes both inventory and gifts", async () => {
      mockFetchUserGifts.mockResolvedValue({
        sentGifts: [samplePendingOutgoingGift],
        receivedGifts: [samplePendingIncomingGift],
      });

      render(
        <Providers>
          <ProfilePage />
        </Providers>,
      );

      // TraitGrid rendered with duplicate item
      await waitFor(() => {
        expect(screen.getAllByText("Neon Visor").length).toBeGreaterThanOrEqual(2);
        expect(screen.getByTestId(`gift-button-${dupItem1.id}`)).toBeInTheDocument();
      });

      // Gifts section rendered with incoming and outgoing queues
      expect(screen.getByTestId("gifts-section")).toBeInTheDocument();
      expect(screen.getByText("Pending Incoming Gifts (1)")).toBeInTheDocument();
      expect(screen.getByText("Pending Outgoing Gifts (1)")).toBeInTheDocument();

      // Open Gift modal from duplicate item
      const giftTraitButton = screen.getByTestId(`gift-button-${dupItem1.id}`);
      fireEvent.click(giftTraitButton);

      const modal = screen.getByTestId("gift-modal");
      expect(modal).toBeInTheDocument();
      expect(within(modal).getByText("Gift Trait")).toBeInTheDocument();

      // Send gift from modal
      mockSendGiftRequest.mockResolvedValueOnce({
        success: true,
        gift: { id: "g-new" } as any,
      });

      const receiverInput = screen.getByTestId("gift-receiver-input");
      fireEvent.change(receiverInput, { target: { value: validReceiverAddress } });

      const submitBtn = screen.getByTestId("send-gift-submit");
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockSendGiftRequest).toHaveBeenCalledWith(
          validReceiverAddress,
          dupItem1.id,
        );
        // Refresh was triggered for both inventory and gifts
        expect(mockFetchUserInventory).toHaveBeenCalled();
        expect(mockFetchUserGifts).toHaveBeenCalled();
      });
    });
  });
});
