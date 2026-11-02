import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ProfilePage from "@/app/profile/page";
import * as whitelistClient from "@/lib/whitelist/client";
import * as inventoryClient from "@/lib/inventory/client";
import * as giftClient from "@/lib/inventory/gift-client";
import * as siweHook from "@/hooks/useSiweAuth";
import { Providers } from "@/components/providers";

// Mock dependencies
vi.mock("next/navigation", () => ({
  usePathname: () => "/profile",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/whitelist/client");
vi.mock("@/lib/inventory/client");
vi.mock("@/lib/inventory/gift-client");
vi.mock("@/hooks/useSiweAuth");

const MOCK_ADDRESS = "0x1234567890123456789012345678901234567890";

describe("Profile Page Whitelist Status UI Integration (Phase 7 Task 7.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(inventoryClient.fetchUserInventory).mockResolvedValue({
      items: [],
    } as any);

    vi.mocked(giftClient.fetchUserGifts).mockResolvedValue({
      sentGifts: [],
      receivedGifts: [],
    } as any);

    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "authenticated",
      sessionAddress: MOCK_ADDRESS,
      walletAddress: MOCK_ADDRESS,
    } as any);
  });

  // 1. Profile Overview (Wallet address, X identity, WL status summary)
  it("renders profile overview with connected wallet address, X identity, and Whitelist status summary", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      address: MOCK_ADDRESS,
      status: {
        qualified: true,
        isFullyQualified: true,
        phase: "SLOT_ALLOCATED",
        slotNumber: 77,
        reviewStatus: "VALID",
        allocatedAt: "2026-10-25T12:00:00.000Z",
        missingRequirements: [],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          xUsername: "chimpmaster",
          heldCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
          missingCategories: [],
          completedMandatoryTasksCount: 3,
          totalMandatoryTasksCount: 3,
          isBanned: false,
        },
      },
    });

    render(
      <Providers>
        <ProfilePage />
      </Providers>,
    );

    await waitFor(() => {
      // Wallet address overview (both in header and wallet card)
      expect(screen.getAllByText("0x1234...7890").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByTitle(MOCK_ADDRESS)).toBeInTheDocument();
      // X identity overview
      expect(screen.getAllByText(/chimpmaster/).length).toBeGreaterThanOrEqual(1);
      // Whitelist summary badge in header
      expect(screen.getByText("WL Status: Guaranteed Slot #77")).toBeInTheDocument();
    });
  });

  // 2. Status: GTD Slot Holder (Active) with Review Status
  it("renders GTD active status with slot number, review status (VALID), and allocated date", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      address: MOCK_ADDRESS,
      status: {
        qualified: true,
        isFullyQualified: true,
        phase: "SLOT_ALLOCATED",
        slotNumber: 42,
        reviewStatus: "VALID",
        allocatedAt: "2026-10-18T10:00:00.000Z",
        missingRequirements: [],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          xUsername: "chimphood_og",
          heldCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
          missingCategories: [],
          completedMandatoryTasksCount: 2,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      },
    });

    render(
      <Providers>
        <ProfilePage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("gtd-status-card")).toBeInTheDocument();
    });

    expect(
      screen.getByText("Guaranteed Whitelist Slot #42 (Active)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(
      screen.getByText("Verified — All criteria confirmed by team."),
    ).toBeInTheDocument();
    expect(screen.getByText("Secured on Oct 18, 2026")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Your Guaranteed Whitelist slot is locked and active. Make sure your connected wallet and linked X account remain connected./,
      ),
    ).toBeInTheDocument();
  });

  it("renders GTD review status UNDER_REVIEW correctly", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      address: MOCK_ADDRESS,
      status: {
        qualified: true,
        isFullyQualified: true,
        phase: "SLOT_ALLOCATED",
        slotNumber: 88,
        reviewStatus: "UNDER_REVIEW",
        missingRequirements: [],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          xUsername: "chimp_audited",
          heldCategories: ["BG", "FUR"],
          missingCategories: ["CLOTHING", "HEADWEAR", "EYEWEAR"],
          completedMandatoryTasksCount: 1,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      },
    });

    render(
      <Providers>
        <ProfilePage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText("Under Verification")).toBeInTheDocument();
      expect(
        screen.getByText("Under Verification — Account details being audited."),
      ).toBeInTheDocument();
    });
  });

  it("renders GTD review status FLAGGED correctly", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      address: MOCK_ADDRESS,
      status: {
        qualified: true,
        isFullyQualified: false,
        phase: "SLOT_ALLOCATED",
        slotNumber: 99,
        reviewStatus: "FLAGGED",
        missingRequirements: [],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          heldCategories: ["BG"],
          missingCategories: ["FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
          completedMandatoryTasksCount: 0,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      },
    });

    render(
      <Providers>
        <ProfilePage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText("Notice / Action Required")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Notice — Please review your linked accounts and task requirements. Slot remains active.",
        ),
      ).toBeInTheDocument();
    });
  });

  // 3. Status: FCFS_REGISTERED (Incomplete and Fully Qualified)
  it("renders FCFS_REGISTERED with queue number, registration date, and incomplete qualification notice", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      address: MOCK_ADDRESS,
      status: {
        qualified: false,
        isFullyQualified: false,
        phase: "FCFS_REGISTERED",
        queueNumber: 105,
        joinedAt: "2026-10-20T14:30:00.000Z",
        missingRequirements: ["Missing trait categories: CLOTHING, EYEWEAR."],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          xUsername: "fcfs_chimp",
          heldCategories: ["BG", "FUR", "HEADWEAR"],
          missingCategories: ["CLOTHING", "EYEWEAR"],
          completedMandatoryTasksCount: 1,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      },
    });

    render(
      <Providers>
        <ProfilePage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("fcfs-status-card")).toBeInTheDocument();
    });

    expect(
      screen.getByText("FCFS Directory Participant #105"),
    ).toBeInTheDocument();
    expect(screen.getByText("Registered on Oct 20, 2026")).toBeInTheDocument();
    expect(
      screen.getByText("Action Required — Incomplete Requirements"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "You are registered in the directory, but must satisfy all 5 requirements below to be included in the OpenSea FCFS allowlist export.",
      ),
    ).toBeInTheDocument();

    // Clear DEC-018 Explanatory Notice
    expect(screen.getByText("FCFS Directory Notice")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Registration is for the OpenSea FCFS allowlist minting stage and does NOT guarantee a Guaranteed \(GTD\) slot or an allocation\. GTD slots are never automatically filled\./,
      ),
    ).toBeInTheDocument();

    // Progress Section
    expect(screen.getByText("3 / 5 Collected")).toBeInTheDocument();
    expect(screen.getByText("1 / 2 Completed")).toBeInTheDocument();
    expect(screen.getByText("Missing trait categories: CLOTHING, EYEWEAR.")).toBeInTheDocument();
  });

  it("renders FCFS_REGISTERED when fully qualified for OpenSea FCFS Allowlist", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      address: MOCK_ADDRESS,
      status: {
        qualified: true,
        isFullyQualified: true,
        phase: "FCFS_REGISTERED",
        queueNumber: 42,
        joinedAt: "2026-10-21T08:00:00.000Z",
        missingRequirements: [],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          xUsername: "fcfs_master",
          heldCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
          missingCategories: [],
          completedMandatoryTasksCount: 2,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      },
    });

    render(
      <Providers>
        <ProfilePage />
      </Providers>,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Eligible for OpenSea FCFS Allowlist"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "All 5 qualification requirements are satisfied! Your wallet will be included in the OpenSea FCFS allowlist export.",
        ),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("5 / 5 Collected")).toBeInTheDocument();
    expect(screen.getByText("2 / 2 Completed")).toBeInTheDocument();
    expect(screen.getByText("Complete")).toBeInTheDocument();
  });

  // 4. Status: REVOKED (Disqualification)
  it("renders REVOKED status with clear disqualification warning per DEC-022 and hides progress checklist", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      address: MOCK_ADDRESS,
      status: {
        qualified: false,
        isFullyQualified: false,
        phase: "REVOKED",
        missingRequirements: ["Slot revoked by admin for Sybil behavior."],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          heldCategories: [],
          missingCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
          completedMandatoryTasksCount: 0,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      },
    });

    render(
      <Providers>
        <ProfilePage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("revoked-status-card")).toBeInTheDocument();
    });

    expect(screen.getByText("Whitelist Status Revoked")).toBeInTheDocument();
    expect(
      screen.getByText("Slot revoked by admin for Sybil behavior."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /In accordance with ChimpHood program policies \(DEC-022\), slot revocation results in full disqualification from this Whitelist program\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Revoked participants are not eligible for Guaranteed \(GTD\) slots and are excluded from the OpenSea FCFS allowlist export\./,
      ),
    ).toBeInTheDocument();

    // Progress section should NOT be rendered when revoked
    expect(
      screen.queryByTestId("whitelist-progress-section"),
    ).not.toBeInTheDocument();
  });

  // 5. Status: NONE (Not Registered in FCFS Directory)
  it("renders NONE status with clear notice that user is not registered in FCFS Directory and link to Whitelist portal", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      address: MOCK_ADDRESS,
      status: {
        qualified: false,
        isFullyQualified: false,
        phase: "NONE",
        missingRequirements: [
          "Linked X (Twitter) account required.",
          "Missing trait categories: BG, FUR, CLOTHING, HEADWEAR, EYEWEAR.",
        ],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: false,
          heldCategories: [],
          missingCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
          completedMandatoryTasksCount: 0,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      },
    });

    render(
      <Providers>
        <ProfilePage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("none-status-card")).toBeInTheDocument();
      expect(screen.getByText(/0 \/ 2 Completed/)).toBeInTheDocument();
    });

    expect(
      screen.getByText("Not Registered in FCFS Directory"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /You are not currently registered in the FCFS Directory\. Connect your EVM wallet and X \(Twitter\) account to automatically register in the FCFS Directory/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Whitelist Portal" })).toHaveAttribute(
      "href",
      "/whitelist",
    );

    // Progress checklist should still be rendered for NONE phase
    expect(screen.getByTestId("whitelist-progress-section")).toBeInTheDocument();
    expect(screen.getByText("0 / 5 Collected")).toBeInTheDocument();
    expect(screen.getByText(/0 \/ 2 Completed/)).toBeInTheDocument();
  });

  // 6. Strict Exclusion of IN_QUEUE, queueRank, and auto-promotion language
  it("never renders IN_QUEUE, queueRank, or auto-promotion language", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      address: MOCK_ADDRESS,
      status: {
        qualified: false,
        isFullyQualified: false,
        phase: "FCFS_REGISTERED",
        queueNumber: 50,
        joinedAt: "2026-10-22T10:00:00.000Z",
        missingRequirements: [],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          xUsername: "clean_chimp",
          heldCategories: ["BG", "FUR"],
          missingCategories: ["CLOTHING", "HEADWEAR", "EYEWEAR"],
          completedMandatoryTasksCount: 1,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      },
    });

    const { container } = render(
      <Providers>
        <ProfilePage />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("fcfs-status-card")).toBeInTheDocument();
    });

    const content = container.textContent || "";
    expect(content).not.toMatch(/IN_QUEUE/i);
    expect(content).not.toMatch(/queueRank/i);
    expect(content).not.toMatch(/Queue Rank/i);
    expect(content).not.toMatch(/auto-promot/i);
    expect(content).not.toMatch(/automatically promoted/i);
  });

  // 7. Profile Tab Navigation (Slice 2)
  it("renders semantic tab navigation and toggles active panels while keeping all panels mounted", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      address: MOCK_ADDRESS,
      status: {
        qualified: true,
        isFullyQualified: true,
        phase: "SLOT_ALLOCATED",
        slotNumber: 1,
        reviewStatus: "VALID",
        missingRequirements: [],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          xUsername: "tab_tester",
          heldCategories: ["BG"],
          missingCategories: [],
          completedMandatoryTasksCount: 1,
          totalMandatoryTasksCount: 1,
          isBanned: false,
        },
      },
    });

    render(
      <Providers>
        <ProfilePage />
      </Providers>,
    );

    // Verify tablist and 3 tabs exist
    const tablist = screen.getByRole("tablist", { name: "Profile navigation" });
    expect(tablist).toBeInTheDocument();

    const overviewTab = screen.getByRole("tab", { name: /Overview/i });
    const collectionTab = screen.getByRole("tab", { name: /Collection/i });
    const giftsTab = screen.getByRole("tab", { name: /Gifts/i });

    expect(overviewTab).toHaveAttribute("aria-selected", "true");
    expect(collectionTab).toHaveAttribute("aria-selected", "false");
    expect(giftsTab).toHaveAttribute("aria-selected", "false");

    // Overview panel is active (not hidden)
    const overviewPanel = screen.getByRole("tabpanel", { name: /Overview/i });
    const collectionPanel = screen.getByRole("tabpanel", { name: /Collection/i });
    const giftsPanel = screen.getByRole("tabpanel", { name: /Gifts/i });

    expect(overviewPanel).toHaveClass("block");
    expect(collectionPanel).toHaveClass("hidden");
    expect(giftsPanel).toHaveClass("hidden");

    // Click Collection tab
    fireEvent.click(collectionTab);
    expect(collectionTab).toHaveAttribute("aria-selected", "true");
    expect(overviewTab).toHaveAttribute("aria-selected", "false");
    expect(collectionPanel).toHaveClass("block");
    expect(overviewPanel).toHaveClass("hidden");
    expect(giftsPanel).toHaveClass("hidden");

    // Click Gifts tab
    fireEvent.click(giftsTab);
    expect(giftsTab).toHaveAttribute("aria-selected", "true");
    expect(collectionTab).toHaveAttribute("aria-selected", "false");
    expect(giftsPanel).toHaveClass("block");
    expect(collectionPanel).toHaveClass("hidden");
    expect(overviewPanel).toHaveClass("hidden");

    // Click Overview tab to return
    fireEvent.click(overviewTab);
    expect(overviewTab).toHaveAttribute("aria-selected", "true");
    expect(overviewPanel).toHaveClass("block");
    expect(collectionPanel).toHaveClass("hidden");
    expect(giftsPanel).toHaveClass("hidden");
  });
});
