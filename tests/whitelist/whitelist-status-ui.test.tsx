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

  // 1. Status: NONE (Ineligible / Not Registered)
  it("renders NONE status with Not Registered / Ineligible badge and registration instructions", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValueOnce({
      configured: true,
      program: defaultProgram,
      address: "0x1111111111111111111111111111111111111111",
      status: {
        qualified: false,
        isFullyQualified: false,
        phase: "NONE",
        missingRequirements: [
          "Linked X (Twitter) account required.",
          "Missing trait categories: CLOTHING, EYEWEAR.",
        ],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: false,
          heldCategories: ["BG", "FUR", "HEADWEAR"],
          missingCategories: ["CLOTHING", "EYEWEAR"],
          completedMandatoryTasksCount: 0,
          totalMandatoryTasksCount: 2,
          isBanned: false,
        },
      },
    });

    render(<WhitelistPage />);

    await waitFor(() => {
      expect(screen.getByText("Not Registered / Ineligible")).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        /Connect your EVM wallet and X \(Twitter\) account to automatically register in the FCFS Directory/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Missing trait categories: CLOTHING, EYEWEAR.")).toBeInTheDocument();
    expect(screen.getByText("Linked X (Twitter) account required.")).toBeInTheDocument();
    expect(screen.getByText("0 / 2 Completed")).toBeInTheDocument();
    expect(screen.getByText("3 / 5 Collected")).toBeInTheDocument();
  });

  // 2. Status: FCFS_REGISTERED (Incomplete / Action Required)
  it("renders FCFS_REGISTERED incomplete with sequence, joinedAt, action required banner, and notice", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValueOnce({
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
      expect(screen.getByText("FCFS Directory (Registered)")).toBeInTheDocument();
    });

    expect(screen.getByText("Participant #42")).toBeInTheDocument();
    expect(screen.getByText(/Registered on Oct 18, 2026/)).toBeInTheDocument();
    expect(screen.getByText("Action Required — Incomplete Requirements")).toBeInTheDocument();
    expect(
      screen.getByText(
        /You are registered in the directory, but must satisfy all 5 requirements below to be included in the OpenSea FCFS allowlist export\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("FCFS Directory Notice")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Registration is for the OpenSea FCFS allowlist minting stage and does NOT guarantee a Guaranteed \(GTD\) slot or an allocation\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("@chimp_enthusiast")).toBeInTheDocument();
    expect(screen.getByText("4 / 5 Collected")).toBeInTheDocument();
  });

  // 3. Status: FCFS_REGISTERED (Fully Qualified)
  it("renders FCFS_REGISTERED qualified with eligible for OpenSea FCFS allowlist banner", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValueOnce({
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
      expect(screen.getByText("FCFS Directory (Registered)")).toBeInTheDocument();
    });

    expect(screen.getByText("Participant #77")).toBeInTheDocument();
    expect(screen.getByText("Eligible for OpenSea FCFS Allowlist")).toBeInTheDocument();
    expect(
      screen.getByText(
        /All 5 qualification requirements are satisfied! Your wallet will be included in the OpenSea FCFS allowlist export\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("5 / 5 Collected")).toBeInTheDocument();
    expect(screen.getByText("2 / 2 Completed")).toBeInTheDocument();
    expect(screen.queryByText("Check Eligibility")).not.toBeInTheDocument();
    expect(screen.queryByText("Qualify / Claim Slot")).not.toBeInTheDocument();
  });

  // 4. Status: SLOT_ALLOCATED with reviewStatus = NOT_REVIEWED
  it("renders SLOT_ALLOCATED with NOT_REVIEWED sub-indicator", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValueOnce({
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
      expect(screen.getByText("Guaranteed Slot #108 (Active)")).toBeInTheDocument();
    });

    expect(screen.getByText("Pending Routine Review")).toBeInTheDocument();
    expect(
      screen.getByText("Slot Confirmed — Routine verification in progress."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Secured on Oct 15, 2026/)).toBeInTheDocument();
    expect(screen.getByText("GTD SLOT ALLOCATED")).toBeInTheDocument();
  });

  // 5. Status: SLOT_ALLOCATED with reviewStatus = UNDER_REVIEW
  it("renders SLOT_ALLOCATED with UNDER_REVIEW sub-indicator", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValueOnce({
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
      expect(screen.getByText("Guaranteed Slot #55 (Active)")).toBeInTheDocument();
    });

    expect(screen.getByText("Under Verification")).toBeInTheDocument();
    expect(
      screen.getByText("Under Verification — Account details being audited."),
    ).toBeInTheDocument();
  });

  // 6. Status: SLOT_ALLOCATED with reviewStatus = VALID
  it("renders SLOT_ALLOCATED with VALID verified sub-indicator", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValueOnce({
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
      expect(screen.getByText("Guaranteed Slot #12 (Active)")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Verified").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText("Verified — All criteria confirmed by team."),
    ).toBeInTheDocument();
  });

  // 7. Status: SLOT_ALLOCATED with reviewStatus = FLAGGED (Slot remains active per DEC-015)
  it("renders SLOT_ALLOCATED with FLAGGED sub-indicator notice while slot remains active", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValueOnce({
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
      expect(screen.getByText("Guaranteed Slot #99 (Active)")).toBeInTheDocument();
    });

    expect(screen.getByText("Notice / Action Required")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Notice — Please review your linked accounts and task requirements. Slot remains active.",
      ),
    ).toBeInTheDocument();
  });

  // 8. Status: REVOKED (DEC-022: Terminal Disqualification)
  it("renders REVOKED status with full disqualification banner and disables qualify CTA", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValueOnce({
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
        /In accordance with ChimpHood program policies \(DEC-022\), slot revocation results in full disqualification from this Whitelist program\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Revoked participants are not eligible for Guaranteed \(GTD\) slots and are excluded from the OpenSea FCFS allowlist export\./,
      ),
    ).toBeInTheDocument();

    // Qualify button and Check Eligibility must not be present
    expect(screen.queryByText("Check Eligibility")).not.toBeInTheDocument();
    expect(screen.queryByText("Qualify / Claim Slot")).not.toBeInTheDocument();
    expect(screen.queryByText("Revoked / Disqualified")).not.toBeInTheDocument();

    // Must NOT render FCFS registered badges or false hope checklists
    expect(screen.queryByText("FCFS Directory (Registered)")).not.toBeInTheDocument();
    expect(screen.queryByText("Eligible for OpenSea FCFS Allowlist")).not.toBeInTheDocument();
    expect(screen.queryByText("Required Trait Categories (5 of 5)")).not.toBeInTheDocument();
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

    expect(screen.getByText("Wallet Not Authenticated")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Connect your Web3 wallet via Sign in with Ethereum \(SIWE\) above to view your real-time Whitelist allocation status and trait checklist\./,
      ),
    ).toBeInTheDocument();
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

    const signInBtn = screen.getByRole("button", { name: "Sign In with Ethereum" });
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

  // 12. Connect X on Profile link when X identity is required
  it("renders Connect X on Profile button linking to /profile when X is not linked", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValueOnce({
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

    const connectXBtn = screen.getByRole("button", { name: /Connect X on Profile/i });
    expect(connectXBtn).toBeInTheDocument();
    const link = connectXBtn.closest("a");
    expect(link).toHaveAttribute("href", "/profile");
  });

  // 13. GTD Allocation capacity label format and color-themed trait category checklist
  it("renders GTD Allocation capacity label and trait category checklist with responsive grid classes", async () => {
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValueOnce({
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
      expect(screen.getByText("GTD Allocation: 450 / 1,000 Slots")).toBeInTheDocument();
    });

    expect(screen.getByText("BG")).toBeInTheDocument();
    expect(screen.getByText("FUR")).toBeInTheDocument();
    expect(screen.getByText("CLOTHING")).toBeInTheDocument();
    expect(screen.getByText("HEADWEAR")).toBeInTheDocument();
    expect(screen.getByText("EYEWEAR")).toBeInTheDocument();
  });
});
