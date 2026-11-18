import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import WhitelistPage from "@/app/whitelist/page";
import * as whitelistClient from "@/lib/whitelist/client";
import * as tasksClient from "@/lib/tasks/client";
import * as siweHook from "@/hooks/useSiweAuth";

// Mock client modules
vi.mock("@/lib/whitelist/client");
vi.mock("@/lib/tasks/client");
vi.mock("@/hooks/useSiweAuth");

const defaultProgram = {
  id: "prog-chimphood",
  slug: "chimphood-wl-main",
  name: "ChimpHood Genesis",
  totalSlots: 1000,
  allocatedSlotsCount: 450,
  status: "OPEN",
};

describe("Whitelist Page Status UI Integration (Phase 7 Task 7.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();

    vi.mocked(tasksClient.fetchActiveTasks).mockResolvedValue({
      configured: true,
      campaigns: [],
    });

    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      program: defaultProgram,
      address: "0x1111111111111111111111111111111111111111",
      status: {
        qualified: false,
        isFullyQualified: false,
        phase: "NONE",
        missingRequirements: [],
        details: {
          hasVerifiedWallet: false,
          hasLinkedX: false,
          heldCategories: [],
          missingCategories: [],
          completedMandatoryTasksCount: 0,
          totalMandatoryTasksCount: 0,
          isBanned: false,
        },
      },
    });

    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "authenticated",
      sessionAddress: "0x1111111111111111111111111111111111111111",
      walletAddress: "0x1111111111111111111111111111111111111111",
    } as any);
  });

  // 1. Status: NONE (Ineligible / In Progress)
  it("renders NONE status with In Progress badge and registration instructions", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      program: defaultProgram,
      address: "0x1111111111111111111111111111111111111111",
      status: {
        qualified: false,
        isFullyQualified: false,
        phase: "NONE",
        missingRequirements: [
          "Missing trait categories: CLOTHING, EYEWEAR.",
        ],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          heldCategories: ["BG", "FUR", "HEADWEAR"],
          missingCategories: ["CLOTHING", "EYEWEAR"],
          completedMandatoryTasksCount: 2,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      },
    });

    render(<WhitelistPage />);

    await waitFor(() => {
      expect(screen.getByText("3 / 5 Categories Collected")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Trait Categories").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("HEADWEAR")).toBeInTheDocument();

    // Switch to step 5 to view status panel
    const statusTab = screen.getByRole("button", { name: /STATUS/i });
    fireEvent.click(statusTab);

    expect(screen.getByText("Qualification In Progress")).toBeInTheDocument();
    expect(screen.getByText("Missing trait categories: CLOTHING, EYEWEAR.")).toBeInTheDocument();
  });

  // 2. Status: FCFS_REGISTERED (Incomplete / Action Required)
  it("renders FCFS_REGISTERED incomplete with action required banner and notice", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      program: defaultProgram,
      address: "0x1111111111111111111111111111111111111111",
      status: {
        qualified: false,
        isFullyQualified: false,
        phase: "FCFS_REGISTERED",
        queueNumber: 42,
        joinedAt: "2026-10-18T14:30:00.000Z",
        missingRequirements: ["Missing trait categories: EYEWEAR."],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          xUsername: "chimp_enthusiast",
          heldCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR"],
          missingCategories: ["EYEWEAR"],
          completedMandatoryTasksCount: 2,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      },
    });

    render(<WhitelistPage />);

    await waitFor(() => {
      expect(screen.getByText("Qualification In Progress")).toBeInTheDocument();
    });

    expect(screen.getByText("Action Needed:")).toBeInTheDocument();
    expect(screen.getByText("Missing trait categories: EYEWEAR.")).toBeInTheDocument();
  });

  // 3. Status: FCFS_REGISTERED (Fully Qualified)
  it("renders FCFS_REGISTERED qualified with unified Whitelisted Minter Pass", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      program: defaultProgram,
      address: "0x1111111111111111111111111111111111111111",
      status: {
        qualified: true,
        isFullyQualified: true,
        phase: "FCFS_REGISTERED",
        queueNumber: 77,
        joinedAt: "2026-10-19T09:15:00.000Z",
        missingRequirements: [],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          xUsername: "alpha_chimp",
          heldCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
          missingCategories: [],
          completedMandatoryTasksCount: 2,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      },
    });

    render(<WhitelistPage />);

    await waitFor(() => {
      expect(screen.getByText("Whitelisted Minter Pass")).toBeInTheDocument();
    });

    expect(screen.getByText("SERIAL: ELY-WL-0077 • ELYCHIMP.XYZ")).toBeInTheDocument();
    expect(screen.queryByText("Check Eligibility")).not.toBeInTheDocument();
  });

  // 4. Status: SLOT_ALLOCATED with reviewStatus = NOT_REVIEWED
  it("renders SLOT_ALLOCATED with NOT_REVIEWED sub-indicator", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      program: defaultProgram,
      address: "0x1111111111111111111111111111111111111111",
      status: {
        qualified: true,
        isFullyQualified: true,
        phase: "SLOT_ALLOCATED",
        slotNumber: 108,
        reviewStatus: "NOT_REVIEWED",
        allocatedAt: "2026-10-15T12:00:00.000Z",
        missingRequirements: [],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          xUsername: "genesis_holder",
          heldCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
          missingCategories: [],
          completedMandatoryTasksCount: 2,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      },
    });

    render(<WhitelistPage />);

    await waitFor(() => {
      expect(screen.getByText("Whitelisted Minter Pass")).toBeInTheDocument();
    });

    expect(screen.getByText("Pending Routine Review")).toBeInTheDocument();
    expect(
      screen.getByText("Slot Confirmed — Routine verification in progress."),
    ).toBeInTheDocument();
    expect(screen.getByText("SERIAL: ELY-WL-0108 • ELYCHIMP.XYZ")).toBeInTheDocument();
  });

  // 5. Status: SLOT_ALLOCATED with reviewStatus = UNDER_REVIEW
  it("renders SLOT_ALLOCATED with UNDER_REVIEW sub-indicator", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      program: defaultProgram,
      address: "0x1111111111111111111111111111111111111111",
      status: {
        qualified: true,
        isFullyQualified: true,
        phase: "SLOT_ALLOCATED",
        slotNumber: 55,
        reviewStatus: "UNDER_REVIEW",
        allocatedAt: "2026-10-15T12:00:00.000Z",
        missingRequirements: [],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          xUsername: "audited_user",
          heldCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
          missingCategories: [],
          completedMandatoryTasksCount: 2,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      },
    });

    render(<WhitelistPage />);

    await waitFor(() => {
      expect(screen.getByText("Whitelisted Minter Pass")).toBeInTheDocument();
    });

    expect(screen.getByText("Under Verification")).toBeInTheDocument();
    expect(
      screen.getByText("Under Verification — Account details being audited."),
    ).toBeInTheDocument();
    expect(screen.getByText("SERIAL: ELY-WL-0055 • ELYCHIMP.XYZ")).toBeInTheDocument();
  });

  // 6. Status: SLOT_ALLOCATED with reviewStatus = VALID
  it("renders SLOT_ALLOCATED with VALID verified sub-indicator", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      program: defaultProgram,
      address: "0x1111111111111111111111111111111111111111",
      status: {
        qualified: true,
        isFullyQualified: true,
        phase: "SLOT_ALLOCATED",
        slotNumber: 12,
        reviewStatus: "VALID",
        allocatedAt: "2026-10-15T12:00:00.000Z",
        missingRequirements: [],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          xUsername: "verified_vip",
          heldCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
          missingCategories: [],
          completedMandatoryTasksCount: 2,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      },
    });

    render(<WhitelistPage />);

    await waitFor(() => {
      expect(screen.getByText("Whitelisted Minter Pass")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Verified").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText("Verified — All criteria confirmed by team."),
    ).toBeInTheDocument();
    expect(screen.getByText("SERIAL: ELY-WL-0012 • ELYCHIMP.XYZ")).toBeInTheDocument();
  });

  // 7. Status: SLOT_ALLOCATED with reviewStatus = FLAGGED (Slot remains active per DEC-015)
  it("renders SLOT_ALLOCATED with FLAGGED sub-indicator notice while slot remains active", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      program: defaultProgram,
      address: "0x1111111111111111111111111111111111111111",
      status: {
        qualified: true,
        isFullyQualified: true,
        phase: "SLOT_ALLOCATED",
        slotNumber: 99,
        reviewStatus: "FLAGGED",
        allocatedAt: "2026-10-15T12:00:00.000Z",
        missingRequirements: [],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          xUsername: "flagged_chimp",
          heldCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
          missingCategories: [],
          completedMandatoryTasksCount: 2,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      },
    });

    render(<WhitelistPage />);

    await waitFor(() => {
      expect(screen.getByText("Whitelisted Minter Pass")).toBeInTheDocument();
    });

    expect(screen.getByText("Notice / Action Required")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Notice — Please review your linked accounts and task requirements. Slot remains active.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("SERIAL: ELY-WL-0099 • ELYCHIMP.XYZ")).toBeInTheDocument();
  });

  // 8. Status: REVOKED (DEC-022: Terminal Disqualification)
  it("renders REVOKED status with full disqualification banner and disables qualify CTA", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      program: defaultProgram,
      address: "0x1111111111111111111111111111111111111111",
      status: {
        qualified: false,
        isFullyQualified: false,
        phase: "REVOKED",
        missingRequirements: [
          "Whitelist qualification revoked: Multi-accounting sybil detection.",
        ],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          heldCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
          missingCategories: [],
          completedMandatoryTasksCount: 2,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      },
    });

    render(<WhitelistPage />);

    await waitFor(() => {
      expect(screen.getByText("REVOKED")).toBeInTheDocument();
    });

    expect(screen.getByText("Whitelist Status Revoked")).toBeInTheDocument();
    expect(
      screen.getByText("Whitelist qualification revoked: Multi-accounting sybil detection."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /In accordance with Elysium program policies \(DEC-022\), whitelist revocation results in full disqualification from this Whitelist program and exclusion from the allowlist export\./,
      ),
    ).toBeInTheDocument();

    // Qualify button and Check Eligibility must not be present
    expect(screen.queryByText("Check Eligibility")).not.toBeInTheDocument();
    expect(screen.queryByText("Qualify / Claim Slot")).not.toBeInTheDocument();
    expect(screen.queryByText("Revoked / Disqualified")).not.toBeInTheDocument();

    // Must NOT render FCFS registered badges or false hope checklists
    expect(screen.queryByText("FCFS Directory (Registered)")).not.toBeInTheDocument();
    expect(screen.queryByText("Eligible for OpenSea FCFS Allowlist")).not.toBeInTheDocument();
  });

  // 9. Fully Automated UI: Never renders manual address input or Lookup button
  it("does not render manual address input or Lookup button, showing prompt when unauthenticated", async () => {
    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "unauthenticated",
      sessionAddress: null,
      walletAddress: null,
      userId: null,
      logout: vi.fn(),
      login: vi.fn(),
    } as any);

    render(<WhitelistPage />);

    expect(screen.getByText("Connect EVM Wallet")).toBeInTheDocument();
    expect(screen.getByText("A signature, not a transaction.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect Wallet" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("0x... EVM wallet address")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lookup" })).not.toBeInTheDocument();
  });

  // 10. Direct Authentication Button in Status Card: wallet-only vs signed-out
  it("renders Sign In with Ethereum when status is wallet-only and triggers login on click", async () => {
    const mockLogin = vi.fn();
    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "wallet-only",
      sessionAddress: null,
      walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
      userId: null,
      login: mockLogin,
      logout: vi.fn(),
    } as any);

    render(<WhitelistPage />);

    const signInBtn = screen.getByRole("button", { name: "Sign In" });
    expect(signInBtn).toBeInTheDocument();
    fireEvent.click(signInBtn);
    expect(mockLogin).toHaveBeenCalledTimes(1);
  });

  // 11. Auth Error state and dismissal in Status Card
  it("renders auth error and dismiss button when authError is present", async () => {
    const mockDismiss = vi.fn();
    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "signed-out",
      sessionAddress: null,
      walletAddress: null,
      userId: null,
      error: "User rejected connection request.",
      dismissError: mockDismiss,
      login: vi.fn(),
    } as any);

    render(<WhitelistPage />);

    expect(screen.getByText("User rejected connection request.")).toBeInTheDocument();
    const dismissBtn = screen.getByRole("button", { name: "Dismiss" });
    expect(dismissBtn).toBeInTheDocument();
    fireEvent.click(dismissBtn);
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  // 12. Direct Connect X Account button when X identity is required
  it("renders direct Connect X Account button when X is not linked", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      program: defaultProgram,
      address: "0x1111111111111111111111111111111111111111",
      status: {
        qualified: false,
        isFullyQualified: false,
        phase: "NONE",
        missingRequirements: ["Linked X (Twitter) account required."],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: false,
          heldCategories: ["BG"],
          missingCategories: ["FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
          completedMandatoryTasksCount: 0,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      },
    });

    render(<WhitelistPage />);

    await waitFor(() => {
      expect(screen.getByText("X (Twitter) Identity")).toBeInTheDocument();
    });

    const directConnectXBtn = screen.getByRole("button", { name: /^Connect X Account$/i });
    expect(directConnectXBtn).toBeInTheDocument();
  });

  // 13. Whitelist portal header and color-themed trait category checklist
  it("renders Whitelist portal header and trait category checklist with responsive grid classes", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      program: {
        ...defaultProgram,
        totalSlots: 1000,
        allocatedSlotsCount: 450,
      },
      address: "0x1111111111111111111111111111111111111111",
      status: {
        qualified: false,
        isFullyQualified: false,
        phase: "NONE",
        missingRequirements: [],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          heldCategories: ["BG", "FUR"],
          missingCategories: ["CLOTHING", "HEADWEAR", "EYEWEAR"],
          completedMandatoryTasksCount: 0,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      },
    });

    render(<WhitelistPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Whitelist Portal/i })).toBeInTheDocument();
      expect(screen.queryByText(/GTD Allocation/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText("BG")).toBeInTheDocument();
    expect(screen.getByText("FUR")).toBeInTheDocument();
    expect(screen.getByText("CLOTHING")).toBeInTheDocument();
    expect(screen.getByText("HEADWEAR")).toBeInTheDocument();
    expect(screen.getByText("EYEWEAR")).toBeInTheDocument();
  });
});
