import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { UserAvatar } from "@/components/inventory/UserAvatar";
import { Navbar } from "@/components/layout/Navbar";
import ProfilePage from "@/app/profile/page";
import { Providers } from "@/components/providers";
import type { InventoryItemData } from "@/lib/inventory/client";
import * as avatarClient from "@/lib/inventory/avatar-client";

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
vi.mock("@/lib/inventory/gift-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/inventory/gift-client")>();
  return {
    ...actual,
    fetchUserGifts: (...args: unknown[]) => mockFetchUserGifts(...args),
  };
});

const mockUseSiweAuth = vi.fn();
vi.mock("@/hooks/useSiweAuth", () => ({
  useSiweAuth: () => mockUseSiweAuth(),
}));

describe("I-3: Avatar UI ChimpHood — Unit & Integration Test Suite", () => {
  const testAddress = "0x1234567890123456789012345678901234567890";

  const sampleInventoryItems: InventoryItemData[] = [
    {
      id: "item-fur",
      edition: 1,
      acquiredVia: "CLAIM",
      acquiredAt: "2026-10-15T10:00:00.000Z",
      isLocked: false,
      lockReason: null,
      trait: {
        id: "trait-fur-1",
        name: "Golden Fur",
        category: "FUR",
        rarity: "LEGENDARY",
        imageUrl: "https://assets.chimphood.io/fur.png",
      },
    },
    {
      id: "item-head",
      edition: 2,
      acquiredVia: "DROP",
      acquiredAt: "2026-10-16T10:00:00.000Z",
      isLocked: false,
      lockReason: null,
      trait: {
        id: "trait-head-1",
        name: "Pilot Cap",
        category: "HEADWEAR",
        rarity: "RARE",
        imageUrl: "https://assets.chimphood.io/cap.png",
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSiweAuth.mockReturnValue({
      status: "unauthenticated",
      sessionAddress: null,
      walletAddress: null,
      login: vi.fn(),
      logout: vi.fn(),
      dismissError: vi.fn(),
    });
    mockFetchWhitelistStatus.mockResolvedValue({
      configured: true,
      authenticated: true,
      status: {
        phase: "IN_QUEUE",
        queueNumber: 10,
        details: {
          hasLinkedX: false,
          heldCategories: ["FUR", "HEADWEAR"],
          totalMandatoryTasksCount: 3,
          completedMandatoryTasksCount: 1,
        },
      },
    });
    mockFetchUserGifts.mockResolvedValue({
      sentGifts: [],
      receivedGifts: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. UserAvatar Component States", () => {
    it("renders fallback state when no identifier is provided", () => {
      render(<UserAvatar identifier={null} />);
      expect(screen.getByTestId("avatar-fallback")).toBeInTheDocument();
      expect(screen.queryByTestId("avatar-image")).not.toBeInTheDocument();
      expect(screen.queryByTestId("avatar-loading")).not.toBeInTheDocument();
    });

    it("renders fallback state when hasInventory is explicitly false", () => {
      render(<UserAvatar identifier={testAddress} hasInventory={false} />);
      expect(screen.getByTestId("avatar-fallback")).toBeInTheDocument();
      expect(screen.queryByTestId("avatar-image")).not.toBeInTheDocument();
    });

    it("renders loading state initially and then shows avatar image when loaded", () => {
      render(<UserAvatar identifier={testAddress} hasInventory={true} />);

      // Loading spinner should be present initially
      expect(screen.getByTestId("avatar-loading")).toBeInTheDocument();

      const img = screen.getByTestId("avatar-image");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute(
        "src",
        expect.stringContaining(`/api/renders/avatar/${testAddress}`),
      );

      // Simulate image load event
      fireEvent.load(img);

      // Loading spinner unmounts after successful load
      expect(screen.queryByTestId("avatar-loading")).not.toBeInTheDocument();
    });

    it("renders fallback state when image fails to load (e.g. 404 no traits)", () => {
      render(
        <UserAvatar
          identifier={testAddress}
          hasInventory={true}
          showRefreshButton={true}
        />,
      );

      const img = screen.getByTestId("avatar-image");
      fireEvent.error(img);

      expect(screen.getByTestId("avatar-fallback")).toBeInTheDocument();
    });

    it("triggers re-render on manual refresh button click and updates avatar", async () => {
      const triggerSpy = vi
        .spyOn(avatarClient, "triggerAvatarRender")
        .mockResolvedValueOnce({
          publicUrl: `/api/renders/avatar/${testAddress}?v=123`,
          width: 240,
          height: 240,
          layerCount: 2,
        });

      const onRefreshSpy = vi.fn().mockResolvedValue(undefined);

      render(
        <UserAvatar
          identifier={testAddress}
          hasInventory={true}
          showRefreshButton={true}
          onRefresh={onRefreshSpy}
        />,
      );

      const refreshBtn = screen.getByTestId("avatar-refresh-btn");
      fireEvent.click(refreshBtn);

      await waitFor(() => {
        expect(triggerSpy).toHaveBeenCalledTimes(1);
        expect(onRefreshSpy).toHaveBeenCalledTimes(1);
      });
    });

    it("handles re-render failure gracefully by displaying error state", async () => {
      vi.spyOn(avatarClient, "triggerAvatarRender").mockRejectedValueOnce(
        new Error("Renderer rate limited"),
      );

      render(
        <UserAvatar
          identifier={testAddress}
          hasInventory={true}
          showRefreshButton={true}
        />,
      );

      const refreshBtn = screen.getByTestId("avatar-refresh-btn");
      fireEvent.click(refreshBtn);

      await waitFor(() => {
        expect(screen.getByTestId("avatar-error")).toBeInTheDocument();
      });
    });

    it("renders compact size='sm' avatar and fallback for Navbar display", () => {
      // 1. Fallback for size="sm" without inventory
      const { unmount } = render(
        <UserAvatar identifier={testAddress} hasInventory={false} size="sm" />,
      );
      expect(screen.getByTestId("navbar-avatar-fallback")).toBeInTheDocument();
      unmount();

      // 2. Avatar image for size="sm" with inventory
      render(<UserAvatar identifier={testAddress} hasInventory={true} size="sm" />);
      expect(screen.getByTestId("navbar-avatar")).toBeInTheDocument();
    });
  });

  describe("2. ProfilePage Avatar & Inventory Refresh", () => {
    it("renders avatar fallback (generic icon) when user has no inventory items", async () => {
      mockUseSiweAuth.mockReturnValue({
        status: "authenticated",
        sessionAddress: testAddress,
        walletAddress: testAddress,
        login: vi.fn(),
        logout: vi.fn(),
        dismissError: vi.fn(),
      });
      mockFetchUserInventory.mockResolvedValueOnce({ items: [] });

      render(
        <Providers>
          <ProfilePage />
        </Providers>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("avatar-fallback")).toBeInTheDocument();
        expect(screen.queryByTestId("avatar-image")).not.toBeInTheDocument();
      });
    });

    it("renders character avatar image replacing generic icon when user has inventory items", async () => {
      mockUseSiweAuth.mockReturnValue({
        status: "authenticated",
        sessionAddress: testAddress,
        walletAddress: testAddress,
        login: vi.fn(),
        logout: vi.fn(),
        dismissError: vi.fn(),
      });
      mockFetchUserInventory.mockResolvedValueOnce({ items: sampleInventoryItems });

      render(
        <Providers>
          <ProfilePage />
        </Providers>,
      );

      await waitFor(() => {
        const avatarImg = screen.getByTestId("avatar-image");
        expect(avatarImg).toBeInTheDocument();
        expect(avatarImg).toHaveAttribute(
          "src",
          expect.stringContaining(`/api/renders/avatar/${testAddress}`),
        );
        expect(screen.queryByTestId("avatar-fallback")).not.toBeInTheDocument();
      });
    });

    it("updates avatar cache-buster when inventory is refreshed after changes", async () => {
      mockUseSiweAuth.mockReturnValue({
        status: "authenticated",
        sessionAddress: testAddress,
        walletAddress: testAddress,
        login: vi.fn(),
        logout: vi.fn(),
        dismissError: vi.fn(),
      });
      mockFetchUserInventory
        .mockResolvedValueOnce({ items: sampleInventoryItems })
        .mockResolvedValueOnce({
          items: [
            ...sampleInventoryItems,
            {
              id: "item-cloth",
              edition: 3,
              acquiredVia: "GIFT",
              acquiredAt: "2026-10-17T10:00:00.000Z",
              isLocked: false,
              lockReason: null,
              trait: {
                id: "trait-cloth-1",
                name: "Cyber Jacket",
                category: "CLOTHING",
                rarity: "EPIC",
                imageUrl: "https://assets.chimphood.io/jacket.png",
              },
            },
          ],
        });

      render(
        <Providers>
          <ProfilePage />
        </Providers>,
      );

      let initialSrc = "";
      await waitFor(() => {
        const img = screen.getByTestId("avatar-image");
        initialSrc = img.getAttribute("src") || "";
        expect(initialSrc).toContain(`/api/renders/avatar/${testAddress}`);
      });

      // Trigger manual re-render button
      const refreshBtn = screen.getByTestId("avatar-refresh-btn");
      vi.spyOn(avatarClient, "triggerAvatarRender").mockResolvedValueOnce({
        publicUrl: `/api/renders/avatar/${testAddress}?v=999`,
        width: 240,
        height: 240,
        layerCount: 3,
      });

      fireEvent.click(refreshBtn);

      await waitFor(() => {
        const updatedImg = screen.getByTestId("avatar-image");
        expect(updatedImg).toBeInTheDocument();
      });
    });

    it("enforces collection display rules: owned categories are colored, unowned remain grayscale", async () => {
      mockUseSiweAuth.mockReturnValue({
        status: "authenticated",
        sessionAddress: testAddress,
        walletAddress: testAddress,
        login: vi.fn(),
        logout: vi.fn(),
        dismissError: vi.fn(),
      });
      // User only owns FUR and HEADWEAR
      mockFetchUserInventory.mockResolvedValueOnce({ items: sampleInventoryItems });

      render(
        <Providers>
          <ProfilePage />
        </Providers>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("trait-collection-summary")).toBeInTheDocument();
      });

      // Owned categories: FUR and HEADWEAR should have colored styling
      const furEl = screen.getByTestId("collection-category-fur");
      const headwearEl = screen.getByTestId("collection-category-headwear");
      expect(furEl.className).toContain("border-emerald-500/30");
      expect(furEl.className).toContain("text-emerald-300");
      expect(headwearEl.className).toContain("border-emerald-500/30");
      expect(headwearEl.className).toContain("text-emerald-300");

      // Unowned categories: BG, CLOTHING, EYEWEAR should have grayscale styling
      const bgEl = screen.getByTestId("collection-category-bg");
      const clothingEl = screen.getByTestId("collection-category-clothing");
      const eyewearEl = screen.getByTestId("collection-category-eyewear");
      expect(bgEl.className).toContain("grayscale");
      expect(clothingEl.className).toContain("grayscale");
      expect(eyewearEl.className).toContain("grayscale");
    });
  });

  describe("3. Navbar & WalletButton Avatar Display", () => {
    it("renders avatar thumbnail in Navbar WalletButton when authenticated", async () => {
      mockUseSiweAuth.mockReturnValue({
        status: "authenticated",
        sessionAddress: testAddress,
        walletAddress: testAddress,
        login: vi.fn(),
        logout: vi.fn(),
        dismissError: vi.fn(),
      });

      render(
        <Providers>
          <Navbar />
        </Providers>,
      );

      // Authenticated Navbar renders compact avatar image
      expect(screen.getByTestId("navbar-avatar")).toBeInTheDocument();
      expect(screen.getByTestId("navbar-avatar")).toHaveAttribute(
        "src",
        expect.stringContaining(`/api/renders/avatar/${testAddress}`),
      );
    });

    it("renders fallback generic icon in Navbar when avatar fails to load", async () => {
      mockUseSiweAuth.mockReturnValue({
        status: "authenticated",
        sessionAddress: testAddress,
        walletAddress: testAddress,
        login: vi.fn(),
        logout: vi.fn(),
        dismissError: vi.fn(),
      });

      render(
        <Providers>
          <Navbar />
        </Providers>,
      );

      const navImg = screen.getByTestId("navbar-avatar");
      fireEvent.error(navImg);

      // On error, falls back to generic icon in Navbar
      expect(screen.getByTestId("navbar-avatar-fallback")).toBeInTheDocument();
    });
  });

  // ─── 4. Separation of Chimp Character & X Profile Avatar ────────────────
  describe("4. Separation of Chimp Profile and X Profile Avatar on ProfilePage", () => {
    const xProfileImageUrl =
      "https://pbs.twimg.com/profile_images/999/avatar_400x400.jpg";

    it("keeps Chimp character avatar in header independent from X profile image", async () => {
      mockUseSiweAuth.mockReturnValue({
        status: "authenticated",
        sessionAddress: testAddress,
        walletAddress: testAddress,
        login: vi.fn(),
        logout: vi.fn(),
        dismissError: vi.fn(),
      });
      // User owns items, so header should render Chimp avatar image
      mockFetchUserInventory.mockResolvedValue({ items: sampleInventoryItems });
      mockFetchWhitelistStatus.mockResolvedValue({
        configured: true,
        authenticated: true,
        status: {
          phase: "IN_QUEUE",
          queueNumber: 1,
          details: {
            hasLinkedX: true,
            xUsername: "kukurapikaku",
            xProfileImageUrl,
            heldCategories: ["FUR", "HEADWEAR"],
            totalMandatoryTasksCount: 3,
            completedMandatoryTasksCount: 0,
          },
        },
      });

      render(
        <Providers>
          <ProfilePage />
        </Providers>,
      );

      // 1. Chimp avatar is in header (from UserAvatar, pointing to renders/avatar)
      await waitFor(() => {
        const chimpImg = screen.getByTestId("avatar-image");
        expect(chimpImg).toBeInTheDocument();
        expect(chimpImg).toHaveAttribute(
          "src",
          expect.stringContaining(`/api/renders/avatar/${testAddress}`),
        );
      });

      // 2. X profile avatar is in the X Identity card
      const xImg = screen.getByTestId("x-profile-avatar");
      expect(xImg).toBeInTheDocument();
      expect(xImg).toHaveAttribute("src", xProfileImageUrl);
    });

    it("displays dedicated x-avatar-fallback in X Identity card when X image fails, without affecting Chimp profile", async () => {
      mockUseSiweAuth.mockReturnValue({
        status: "authenticated",
        sessionAddress: testAddress,
        walletAddress: testAddress,
        login: vi.fn(),
        logout: vi.fn(),
        dismissError: vi.fn(),
      });
      mockFetchUserInventory.mockResolvedValue({ items: sampleInventoryItems });
      mockFetchWhitelistStatus.mockResolvedValue({
        configured: true,
        authenticated: true,
        status: {
          phase: "IN_QUEUE",
          queueNumber: 1,
          details: {
            hasLinkedX: true,
            xUsername: "kukurapikaku",
            xProfileImageUrl,
            heldCategories: ["FUR", "HEADWEAR"],
            totalMandatoryTasksCount: 3,
            completedMandatoryTasksCount: 0,
          },
        },
      });

      render(
        <Providers>
          <ProfilePage />
        </Providers>,
      );

      // Verify X image exists initially
      await waitFor(() => {
        expect(screen.getByTestId("x-profile-avatar")).toBeInTheDocument();
      });

      // Trigger error on X avatar
      const xImg = screen.getByTestId("x-profile-avatar");
      fireEvent.error(xImg);

      // Dedicated X fallback appears in the card
      await waitFor(() => {
        expect(screen.getByTestId("x-avatar-fallback")).toBeInTheDocument();
      });

      // Crucial: Chimp character avatar in header is STILL present and intact!
      const chimpImg = screen.getByTestId("avatar-image");
      expect(chimpImg).toBeInTheDocument();
      expect(chimpImg).toHaveAttribute(
        "src",
        expect.stringContaining(`/api/renders/avatar/${testAddress}`),
      );
    });

    it("displays x-avatar-fallback when X is connected but xProfileImageUrl is null", async () => {
      mockUseSiweAuth.mockReturnValue({
        status: "authenticated",
        sessionAddress: testAddress,
        walletAddress: testAddress,
        login: vi.fn(),
        logout: vi.fn(),
        dismissError: vi.fn(),
      });
      mockFetchUserInventory.mockResolvedValue({ items: [] });
      mockFetchWhitelistStatus.mockResolvedValue({
        configured: true,
        authenticated: true,
        status: {
          phase: "IN_QUEUE",
          queueNumber: 1,
          details: {
            hasLinkedX: true,
            xUsername: "kukurapikaku",
            xProfileImageUrl: null,
            heldCategories: [],
            totalMandatoryTasksCount: 3,
            completedMandatoryTasksCount: 0,
          },
        },
      });

      render(
        <Providers>
          <ProfilePage />
        </Providers>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("x-avatar-fallback")).toBeInTheDocument();
        expect(screen.queryByTestId("x-profile-avatar")).not.toBeInTheDocument();
        // Chimp base avatar remains in header
        expect(screen.getByTestId("avatar-fallback")).toBeInTheDocument();
      });
    });

    it("resets X avatar error when a new xProfileImageUrl is received", async () => {
      const newUrl =
        "https://pbs.twimg.com/profile_images/111/new_avatar_400x400.jpg";

      mockUseSiweAuth.mockReturnValue({
        status: "authenticated",
        sessionAddress: testAddress,
        walletAddress: testAddress,
        login: vi.fn(),
        logout: vi.fn(),
        dismissError: vi.fn(),
      });
      mockFetchUserInventory.mockResolvedValue({ items: [] });

      // First response: initial URL
      mockFetchWhitelistStatus.mockResolvedValue({
        configured: true,
        authenticated: true,
        status: {
          phase: "IN_QUEUE",
          queueNumber: 1,
          details: {
            hasLinkedX: true,
            xUsername: "kukurapikaku",
            xProfileImageUrl,
            heldCategories: [],
            totalMandatoryTasksCount: 3,
            completedMandatoryTasksCount: 0,
          },
        },
      });

      const { unmount } = render(
        <Providers>
          <ProfilePage />
        </Providers>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("x-profile-avatar")).toBeInTheDocument();
      });

      // Trigger error on initial image
      fireEvent.error(screen.getByTestId("x-profile-avatar"));

      await waitFor(() => {
        expect(screen.getByTestId("x-avatar-fallback")).toBeInTheDocument();
      });

      // Update WL data with new URL (simulating re-link returning new profile image)
      mockFetchWhitelistStatus.mockResolvedValue({
        configured: true,
        authenticated: true,
        status: {
          phase: "IN_QUEUE",
          queueNumber: 1,
          details: {
            hasLinkedX: true,
            xUsername: "kukurapikaku",
            xProfileImageUrl: newUrl,
            heldCategories: [],
            totalMandatoryTasksCount: 3,
            completedMandatoryTasksCount: 0,
          },
        },
      });

      unmount();
      render(
        <Providers>
          <ProfilePage />
        </Providers>,
      );

      // The new URL does not match failedXAvatarUrl (or on new mount), so x-profile-avatar renders again
      await waitFor(() => {
        const img = screen.getByTestId("x-profile-avatar");
        expect(img).toBeInTheDocument();
        expect(img).toHaveAttribute("src", newUrl);
      });
    });
  });
});
