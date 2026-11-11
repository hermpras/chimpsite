import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import WhitelistPage from "@/app/whitelist/page";
import * as tasksClient from "@/lib/tasks/client";
import * as whitelistClient from "@/lib/whitelist/client";
import * as dropsClient from "@/lib/drops/client";
import * as inventoryClient from "@/lib/inventory/client";
import * as siweHook from "@/hooks/useSiweAuth";

vi.mock("@/lib/tasks/client", () => ({
  fetchActiveTasks: vi.fn(),
  submitTaskEvidence: vi.fn(),
  getTaskEvidence: vi.fn(),
}));

vi.mock("@/lib/whitelist/client", () => ({
  fetchWhitelistStatus: vi.fn(),
  submitWhitelistQualification: vi.fn(),
}));

vi.mock("@/lib/drops/client", () => ({
  fetchCurrentDrop: vi.fn(),
  claimDropItem: vi.fn(),
}));

vi.mock("@/lib/inventory/client", () => ({
  fetchUserInventory: vi.fn(),
}));

vi.mock("@/hooks/useSiweAuth", () => ({
  useSiweAuth: vi.fn(),
}));

describe("Whitelist Stepper Navigation & Access Guard (app/whitelist/page.tsx)", () => {
  const mockDrop = {
    active: true,
    drop: { id: "drop-1" },
    period: { id: "period-1", periodIndex: 1 },
    stock: { totalRemaining: 10, totalAllocated: 100, poolItems: [] },
    claimWindow: { isActive: false, timeRemainingMs: 0 },
  };

  const mockActiveCampaigns: tasksClient.ActiveCampaignItem[] = [
    {
      id: "camp-1",
      slug: "genesis-campaign",
      title: "Genesis ChimpHood Campaign",
      description: "Complete mandatory community missions to earn WL.",
      status: "ACTIVE",
      wlProgramId: "prog-1",
      version: {
        id: "ver-1",
        versionNumber: 1,
        startsAt: "2026-10-20T00:00:00Z",
        endsAt: null,
      },
      tasks: [
        {
          id: "task-mandatory-1",
          versionId: "ver-1",
          campaignId: "camp-1",
          taskCode: "FOLLOW_X",
          title: "Follow Official X Handle",
          description: "Follow @ChimpHood.",
          taskType: "URL",
          points: 50,
          isRequired: true,
          sortOrder: 1,
          progress: null,
          latestSubmission: null,
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof window !== "undefined") {
      sessionStorage.clear();
      window.location.hash = "";
    }
    vi.mocked(dropsClient.fetchCurrentDrop).mockResolvedValue(mockDrop as any);
    vi.mocked(inventoryClient.fetchUserInventory).mockResolvedValue({ items: [] } as any);
    vi.mocked(tasksClient.fetchActiveTasks).mockResolvedValue({
      configured: true,
      campaigns: mockActiveCampaigns,
    });
  });

  it("disables steps 2, 3, 4, and 5 when wallet is not connected", async () => {
    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "signed-out",
      sessionAddress: null,
      walletAddress: null,
    } as any);

    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      program: null,
    } as any);

    render(<WhitelistPage />);

    // Query stepper buttons by text label
    const step1Btn = screen.getByRole("button", { name: /1\s*WALLET/i });
    const step2Btn = screen.getByRole("button", { name: /2\s*X SYNC/i });
    const step3Btn = screen.getByRole("button", { name: /3\s*TASKS/i });
    const step4Btn = screen.getByRole("button", { name: /4\s*TRAITS/i });
    const step5Btn = screen.getByRole("button", { name: /5\s*STATUS/i });

    expect(step1Btn).not.toBeDisabled();
    expect(step2Btn).toBeDisabled();
    expect(step3Btn).toBeDisabled();
    expect(step4Btn).toBeDisabled();
    expect(step5Btn).toBeDisabled();

    // Clicking step 3 should do nothing
    fireEvent.click(step3Btn);
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
    expect(screen.getByText("Connect EVM Wallet")).toBeInTheDocument();
  });

  it("enables steps 1 and 2, but disables steps 3, 4, and 5 when wallet is connected but X is not linked", async () => {
    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "authenticated",
      sessionAddress: "0x1111111111111111111111111111111111111111",
      walletAddress: "0x1111111111111111111111111111111111111111",
    } as any);

    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      address: "0x1111111111111111111111111111111111111111",
      status: {
        qualified: false,
        isFullyQualified: false,
        phase: "NONE",
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: false,
          heldCategories: [],
          completedMandatoryTasksCount: 0,
          totalMandatoryTasksCount: 1,
        },
      },
    } as any);

    render(<WhitelistPage />);

    await waitFor(() => {
      expect(screen.getByText("Step 2 of 5")).toBeInTheDocument();
    });

    const step1Btn = screen.getByRole("button", { name: /1\s*WALLET/i });
    const step2Btn = screen.getByRole("button", { name: /2\s*X SYNC/i });
    const step3Btn = screen.getByRole("button", { name: /3\s*TASKS/i });
    const step4Btn = screen.getByRole("button", { name: /4\s*TRAITS/i });
    const step5Btn = screen.getByRole("button", { name: /5\s*STATUS/i });

    expect(step1Btn).not.toBeDisabled();
    expect(step2Btn).not.toBeDisabled();
    expect(step3Btn).toBeDisabled();
    expect(step4Btn).toBeDisabled();
    expect(step5Btn).toBeDisabled();

    // User can navigate backwards to Step 1
    fireEvent.click(step1Btn);
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
    // In Step 1, when already connected, do not show "Connect Wallet" button; show "Wallet Already Connected"
    expect(screen.getByText("Wallet Already Connected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect Wallet" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue to Step 2/i })).toBeInTheDocument();

    // User can navigate back forward to Step 2
    fireEvent.click(step2Btn);
    expect(screen.getByText("Step 2 of 5")).toBeInTheDocument();

    // Clicking step 3 or 4 should not work
    fireEvent.click(step3Btn);
    expect(screen.getByText("Step 2 of 5")).toBeInTheDocument();
  });

  it("shows already connected states and hides connect buttons when navigating back to step 1 and step 2", async () => {
    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "authenticated",
      sessionAddress: "0x1111111111111111111111111111111111111111",
      walletAddress: "0x1111111111111111111111111111111111111111",
    } as any);

    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      address: "0x1111111111111111111111111111111111111111",
      status: {
        qualified: false,
        isFullyQualified: false,
        phase: "NONE",
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          xUsername: "testchimp",
          heldCategories: ["BG", "FUR"],
          completedMandatoryTasksCount: 1,
          totalMandatoryTasksCount: 1,
        },
      },
    } as any);

    render(<WhitelistPage />);

    await waitFor(() => {
      expect(screen.getByText("Character & Wardrobe")).toBeInTheDocument();
    });

    const step1Btn = screen.getByRole("button", { name: /1\s*WALLET/i });
    const step2Btn = screen.getByRole("button", { name: /2\s*X SYNC/i });

    // 1. Back to Step 1
    fireEvent.click(step1Btn);
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
    expect(screen.getByText("Wallet Already Connected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect Wallet" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue to Step 2/i })).toBeInTheDocument();

    // 2. Back to Step 2
    fireEvent.click(step2Btn);
    expect(screen.getByText("Step 2 of 5")).toBeInTheDocument();
    expect(screen.getByText("X Account Already Linked")).toBeInTheDocument();
    expect(screen.getAllByText("@testchimp").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("button", { name: "Connect X Account" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue to Step 3/i })).toBeInTheDocument();
  });

  it("enables steps 1, 2, and 3 when X is linked, and allows backward navigation from step 4 to step 3", async () => {
    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "authenticated",
      sessionAddress: "0x1111111111111111111111111111111111111111",
      walletAddress: "0x1111111111111111111111111111111111111111",
    } as any);

    // Initial status: tasks complete (user is at Step 4)
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      address: "0x1111111111111111111111111111111111111111",
      status: {
        qualified: false,
        isFullyQualified: false,
        phase: "NONE",
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          xUsername: "testchimp",
          heldCategories: ["BG", "FUR"],
          completedMandatoryTasksCount: 1,
          totalMandatoryTasksCount: 1,
        },
      },
    } as any);

    render(<WhitelistPage />);

    await waitFor(() => {
      // User is at Step 4/5 view
      expect(screen.getByText("Character & Wardrobe")).toBeInTheDocument();
    });

    const step3Btn = screen.getByRole("button", { name: /3\s*TASKS/i });
    const step4Btn = screen.getByRole("button", { name: /4\s*TRAITS/i });

    // Step 3 should be enabled for backward navigation (e.g. to inspect task rules or version 2)
    expect(step3Btn).not.toBeDisabled();
    expect(step4Btn).not.toBeDisabled();

    // User clicks step 3 to go BACK to tasks
    fireEvent.click(step3Btn);

    await waitFor(() => {
      expect(screen.getByText("Step 3 of 5 — Campaign Tasks")).toBeInTheDocument();
      expect(screen.getByText("All Campaign Tasks Completed")).toBeInTheDocument();
    });

    // From step 3, user can click the Continue to Step 4 CTA button to go back forward
    const continueToStep4Btn = screen.getByRole("button", {
      name: /Continue to Step 4 \(Traits\)/i,
    });
    fireEvent.click(continueToStep4Btn);

    await waitFor(() => {
      expect(screen.getByText("Character & Wardrobe")).toBeInTheDocument();
    });
  });

  it("keeps user on Step 1 when status is wallet-only (not yet SIWE authenticated) and shows busyMessage during signing", async () => {
    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "wallet-only",
      sessionAddress: null,
      walletAddress: "0x1111111111111111111111111111111111111111",
      busyMessage: null,
      login: vi.fn(),
    } as any);

    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      address: "0x1111111111111111111111111111111111111111",
      status: {
        qualified: false,
        isFullyQualified: false,
        phase: "NONE",
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: false,
          heldCategories: [],
          completedMandatoryTasksCount: 0,
          totalMandatoryTasksCount: 1,
        },
      },
    } as any);

    const { rerender } = render(<WhitelistPage />);

    const step1Btn = screen.getByRole("button", { name: /1\s*WALLET/i });
    const step2Btn = screen.getByRole("button", { name: /2\s*X SYNC/i });

    // Must remain on Step 1 until SIWE authenticated
    expect(step1Btn).not.toBeDisabled();
    expect(step2Btn).toBeDisabled();
    expect(screen.getByRole("button", { name: /Sign In with Ethereum/i })).toBeInTheDocument();

    // When signing is in progress, button shows busyMessage and is disabled
    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "signing",
      sessionAddress: null,
      walletAddress: "0x1111111111111111111111111111111111111111",
      busyMessage: "Waiting for your signature…",
      login: vi.fn(),
    } as any);

    rerender(<WhitelistPage />);

    const busyBtn = screen.getByRole("button", { name: /Waiting for your signature…/i });
    expect(busyBtn).toBeDisabled();
  });

  it("displays statusError banner when fetchWhitelistStatus fails and retries on clicking Retry Status", async () => {
    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "authenticated",
      sessionAddress: "0x1111111111111111111111111111111111111111",
      walletAddress: "0x1111111111111111111111111111111111111111",
    } as any);

    vi.mocked(whitelistClient.fetchWhitelistStatus)
      .mockRejectedValueOnce(new Error("Status endpoint unavailable"))
      .mockResolvedValueOnce({
        configured: true,
        address: "0x1111111111111111111111111111111111111111",
        status: {
          qualified: false,
          isFullyQualified: false,
          phase: "NONE",
          details: {
            hasVerifiedWallet: true,
            hasLinkedX: false,
            heldCategories: [],
            completedMandatoryTasksCount: 0,
            totalMandatoryTasksCount: 1,
          },
        },
      } as any);

    render(<WhitelistPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load Whitelist status:")).toBeInTheDocument();
      expect(screen.getByText("Status endpoint unavailable")).toBeInTheDocument();
    });

    const retryStatusBtn = screen.getByRole("button", { name: "Retry Status" });
    fireEvent.click(retryStatusBtn);

    await waitFor(() => {
      expect(screen.queryByText("Failed to load Whitelist status:")).not.toBeInTheDocument();
    });
  });

  it("guards against unauthorized direct hash access (e.g. #tasks when unauthenticated)", async () => {
    if (typeof window !== "undefined") {
      window.location.hash = "#tasks";
    }

    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "signed-out",
      sessionAddress: null,
      walletAddress: null,
    } as any);

    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      program: null,
    } as any);

    render(<WhitelistPage />);

    // Since step 3 is not accessible, activeStepNumber must fall back to calculatedStep (1)
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
    expect(screen.getByText("Connect EVM Wallet")).toBeInTheDocument();
  });
});
