import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import WhitelistPage from "@/app/whitelist/page";
import * as tasksClient from "@/lib/tasks/client";
import * as whitelistClient from "@/lib/whitelist/client";
import * as dropsClient from "@/lib/drops/client";
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

vi.mock("@/hooks/useSiweAuth", () => ({
  useSiweAuth: vi.fn(),
}));

describe("Whitelist Tasks & Evidence UI (app/whitelist/page.tsx)", () => {
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
          description: "Follow @ChimpHood and paste post URL.",
          taskType: "URL",
          points: 50,
          isRequired: true,
          sortOrder: 1,
          progress: null,
          latestSubmission: null,
        },
        {
          id: "task-optional-2",
          versionId: "ver-1",
          campaignId: "camp-1",
          taskCode: "COMMUNITY_ART",
          title: "Community Art Contest",
          description: "Submit fan art image link.",
          taskType: "IMAGE_URL",
          points: 100,
          isRequired: false,
          sortOrder: 2,
          progress: null,
          latestSubmission: null,
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dropsClient.fetchCurrentDrop).mockResolvedValue(mockDrop as any);
    vi.mocked(tasksClient.fetchActiveTasks).mockResolvedValue({
      configured: true,
      campaigns: mockActiveCampaigns,
    });
    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValue({
      configured: true,
      program: {
        id: "prog-1",
        slug: "chimphood-wl-main",
        name: "Main WL",
        totalSlots: 100,
        allocatedSlotsCount: 42,
        status: "OPEN",
      },
    });
    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "unauthenticated",
      sessionAddress: null,
      walletAddress: null,
    } as any);
  });

  // 1. Fetching & dynamic campaigns (no hardcoding)
  it("fetches and renders campaigns and tasks dynamically without hardcoded tasks", async () => {
    render(<WhitelistPage />);

    expect(screen.getByText("Loading campaigns & tasks...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Genesis ChimpHood Campaign")).toBeInTheDocument();
    });

    expect(screen.getByText("Follow Official X Handle")).toBeInTheDocument();
    expect(screen.getByText("Community Art Contest")).toBeInTheDocument();
    expect(screen.getByText("Mandatory")).toBeInTheDocument();
    expect(screen.getByText("Optional")).toBeInTheDocument();
    expect(screen.getByText("+50 Pts")).toBeInTheDocument();
    expect(screen.getByText("+100 Pts")).toBeInTheDocument();

    // Verify old hardcoded tasks are gone
    expect(screen.queryByText("Early Bird Community Quest")).not.toBeInTheDocument();
    expect(screen.queryByText("X Creative Content Campaign")).not.toBeInTheDocument();
  });

  // 2. Loading and error states with Retry
  it("renders error state when fetchActiveTasks fails and retries on button click", async () => {
    vi.mocked(tasksClient.fetchActiveTasks)
      .mockRejectedValueOnce(new Error("Network error fetching tasks"))
      .mockResolvedValueOnce({
        configured: true,
        campaigns: mockActiveCampaigns,
      });

    render(<WhitelistPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load campaigns:")).toBeInTheDocument();
      expect(screen.getByText("Network error fetching tasks")).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole("button", { name: "Retry" });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText("Genesis ChimpHood Campaign")).toBeInTheDocument();
    });
  });

  // 3. Status rendering: Not Submitted, Pending Review, Approved, Rejected
  it("renders correct status badges and information for each evidence status", async () => {
    const campaignsWithMixedStatuses: tasksClient.ActiveCampaignItem[] = [
      {
        ...mockActiveCampaigns[0],
        tasks: [
          {
            ...mockActiveCampaigns[0].tasks[0],
            id: "task-not-submitted",
            title: "Task Not Submitted",
            progress: null,
            latestSubmission: null,
          },
          {
            ...mockActiveCampaigns[0].tasks[0],
            id: "task-pending",
            title: "Task Pending",
            progress: {
              id: "tp-1",
              status: "SUBMITTED",
              verifiedAt: null,
              completedAt: null,
            },
            latestSubmission: {
              id: "ev-1",
              submissionType: "URL",
              payload: "https://x.com/chimphood/status/123",
              status: "PENDING",
              reviewerNotes: null,
              reviewedAt: null,
              createdAt: "2026-10-24T12:00:00Z",
            },
          },
          {
            ...mockActiveCampaigns[0].tasks[0],
            id: "task-approved",
            title: "Task Approved",
            progress: {
              id: "tp-2",
              status: "VERIFIED",
              verifiedAt: "2026-10-24T13:00:00Z",
              completedAt: "2026-10-24T13:00:00Z",
            },
            latestSubmission: {
              id: "ev-2",
              submissionType: "URL",
              payload: "https://x.com/chimphood/status/456",
              status: "APPROVED",
              reviewerNotes: "Looks good!",
              reviewedAt: "2026-10-24T13:00:00Z",
              createdAt: "2026-10-24T12:00:00Z",
            },
          },
          {
            ...mockActiveCampaigns[0].tasks[0],
            id: "task-rejected",
            title: "Task Rejected",
            progress: {
              id: "tp-3",
              status: "REJECTED",
              verifiedAt: null,
              completedAt: null,
            },
            latestSubmission: {
              id: "ev-3",
              submissionType: "URL",
              payload: "https://x.com/chimphood/status/bad",
              status: "REJECTED",
              reviewerNotes: "Tweet link is inaccessible or deleted.",
              reviewedAt: "2026-10-24T14:00:00Z",
              createdAt: "2026-10-24T12:00:00Z",
            },
          },
        ],
      },
    ];

    vi.mocked(tasksClient.fetchActiveTasks).mockResolvedValue({
      configured: true,
      campaigns: campaignsWithMixedStatuses,
    });

    render(<WhitelistPage />);

    await waitFor(() => {
      expect(screen.getByText("Task Not Submitted")).toBeInTheDocument();
    });

    expect(screen.getByText("Not Submitted")).toBeInTheDocument();
    expect(screen.getByText("Pending Review")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();

    // Pending review information
    expect(screen.getByText("Pending Moderator Review")).toBeInTheDocument();
    expect(
      screen.getByText(/Submitted Proof: https:\/\/x\.com\/chimphood\/status\/123/),
    ).toBeInTheDocument();

    // Approved information
    expect(screen.getByText("Verified & Approved")).toBeInTheDocument();

    // Rejected information
    expect(
      screen.getByText("Tweet link is inaccessible or deleted."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You can correct and resubmit your evidence below."),
    ).toBeInTheDocument();
  });

  // 4. Client validation for evidence payload
  it("validates empty payload and URL format on evidence submission", async () => {
    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "authenticated",
      sessionAddress: "0x1111111111111111111111111111111111111111",
      walletAddress: "0x1111111111111111111111111111111111111111",
    } as any);

    render(<WhitelistPage />);

    await waitFor(() => {
      expect(screen.getByText("Follow Official X Handle")).toBeInTheDocument();
    });

    const submitButtons = screen.getAllByRole("button", { name: "Submit Evidence" });
    const firstSubmitBtn = submitButtons[0];
    const inputs = screen.getAllByPlaceholderText("https://x.com/your_post_url...");
    const firstInput = inputs[0];

    // Invalid URL format
    fireEvent.change(firstInput, { target: { value: "not-a-valid-url" } });
    fireEvent.click(firstSubmitBtn);

    expect(
      screen.getByText("Please enter a valid HTTP or HTTPS URL for URL."),
    ).toBeInTheDocument();
    expect(tasksClient.submitTaskEvidence).not.toHaveBeenCalled();
  });

  // 5. Successful evidence submission transitions to Pending Review (Rule 8)
  it("submits evidence successfully, shows success banner, and sets status to Pending Review (not marked completed)", async () => {
    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "authenticated",
      sessionAddress: "0x1111111111111111111111111111111111111111",
      walletAddress: "0x1111111111111111111111111111111111111111",
    } as any);

    vi.mocked(tasksClient.submitTaskEvidence).mockResolvedValueOnce({
      success: true,
      submission: {
        id: "ev-new",
        status: "PENDING",
      },
      taskProgress: {
        status: "SUBMITTED",
      },
    } as any);

    render(<WhitelistPage />);

    await waitFor(() => {
      expect(screen.getByText("Follow Official X Handle")).toBeInTheDocument();
    });

    const input = screen.getAllByPlaceholderText("https://x.com/your_post_url...")[0];
    const submitBtn = screen.getAllByRole("button", { name: "Submit Evidence" })[0];

    fireEvent.change(input, { target: { value: "https://x.com/post/999" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(tasksClient.submitTaskEvidence).toHaveBeenCalledWith("task-mandatory-1", {
        submissionType: "URL",
        payload: "https://x.com/post/999",
      });
    });

    await waitFor(() => {
      expect(
        screen.getByText("Evidence submitted! Status is now Pending Review."),
      ).toBeInTheDocument();
    });
  });

  // 6. Resubmission of rejected evidence
  it("allows resubmission of rejected evidence with Resubmit Evidence button", async () => {
    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "authenticated",
      sessionAddress: "0x1111111111111111111111111111111111111111",
      walletAddress: "0x1111111111111111111111111111111111111111",
    } as any);

    const rejectedCampaigns: tasksClient.ActiveCampaignItem[] = [
      {
        ...mockActiveCampaigns[0],
        tasks: [
          {
            ...mockActiveCampaigns[0].tasks[0],
            progress: {
              id: "tp-rej",
              status: "REJECTED",
              verifiedAt: null,
              completedAt: null,
            },
            latestSubmission: {
              id: "ev-rej",
              submissionType: "URL",
              payload: "https://x.com/bad",
              status: "REJECTED",
              reviewerNotes: "Broken link. Please provide working URL.",
              reviewedAt: "2026-10-24T12:00:00Z",
              createdAt: "2026-10-24T10:00:00Z",
            },
          },
        ],
      },
    ];

    vi.mocked(tasksClient.fetchActiveTasks).mockResolvedValue({
      configured: true,
      campaigns: rejectedCampaigns,
    });

    vi.mocked(tasksClient.submitTaskEvidence).mockResolvedValueOnce({
      success: true,
      submission: { id: "ev-fixed", status: "PENDING" },
      taskProgress: { status: "SUBMITTED" },
    } as any);

    render(<WhitelistPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Broken link. Please provide working URL."),
      ).toBeInTheDocument();
    });

    const resubmitBtn = screen.getByRole("button", { name: "Resubmit Evidence" });
    const input = screen.getByPlaceholderText("https://x.com/your_post_url...");

    fireEvent.change(input, { target: { value: "https://x.com/working-link" } });
    fireEvent.click(resubmitBtn);

    await waitFor(() => {
      expect(tasksClient.submitTaskEvidence).toHaveBeenCalledWith("task-mandatory-1", {
        submissionType: "URL",
        payload: "https://x.com/working-link",
      });
    });
  });

  // 7. Check Eligibility / Qualify action & Results display
  it("calls submitWhitelistQualification and displays qualification results, missing requirements, and queue rank", async () => {
    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "authenticated",
      sessionAddress: "0x1111111111111111111111111111111111111111",
      walletAddress: "0x1111111111111111111111111111111111111111",
    } as any);

    vi.mocked(whitelistClient.submitWhitelistQualification).mockResolvedValueOnce({
      success: true,
      programId: "prog-1",
      result: {
        qualified: false,
        phase: "NONE",
        missingRequirements: [
          "Missing trait categories: CLOTHING, EYEWEAR.",
          'Incomplete task: "Follow Official X Handle".',
        ],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          heldCategories: ["BG", "FUR", "HEADWEAR"],
          missingCategories: ["CLOTHING", "EYEWEAR"],
          completedMandatoryTasksCount: 0,
          totalMandatoryTasksCount: 1,
          isBanned: false,
        },
      },
    } as any);

    render(<WhitelistPage />);

    const qualifyBtn = screen.getByRole("button", { name: "Qualify / Claim Slot" });
    fireEvent.click(qualifyBtn);

    await waitFor(() => {
      expect(whitelistClient.submitWhitelistQualification).toHaveBeenCalled();
    });

    expect(screen.getByText("INELIGIBLE")).toBeInTheDocument();
    expect(
      screen.getByText("Missing trait categories: CLOTHING, EYEWEAR."),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Incomplete task: "Follow Official X Handle".'),
    ).toBeInTheDocument();
    expect(screen.getByText("0 / 1 Completed")).toBeInTheDocument();
  });

  it("displays SLOT_ALLOCATED and slot number when user qualifies directly into a slot", async () => {
    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "authenticated",
      sessionAddress: "0x1111111111111111111111111111111111111111",
      walletAddress: "0x1111111111111111111111111111111111111111",
    } as any);

    vi.mocked(whitelistClient.submitWhitelistQualification).mockResolvedValueOnce({
      success: true,
      programId: "prog-1",
      result: {
        qualified: true,
        phase: "SLOT_ALLOCATED",
        slotNumber: 7,
        missingRequirements: [],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          heldCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
          missingCategories: [],
          completedMandatoryTasksCount: 1,
          totalMandatoryTasksCount: 1,
          isBanned: false,
        },
      },
    } as any);

    render(<WhitelistPage />);

    const qualifyBtn = screen.getByRole("button", { name: "Qualify / Claim Slot" });
    fireEvent.click(qualifyBtn);

    await waitFor(() => {
      expect(screen.getByText("SLOT ALLOCATED #7")).toBeInTheDocument();
    });

    expect(
      screen.getByText("Congratulations! Whitelist Slot #7 has been allocated."),
    ).toBeInTheDocument();
  });

  it("displays IN_QUEUE and queue rank when capacity is exhausted", async () => {
    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "authenticated",
      sessionAddress: "0x1111111111111111111111111111111111111111",
      walletAddress: "0x1111111111111111111111111111111111111111",
    } as any);

    vi.mocked(whitelistClient.submitWhitelistQualification).mockResolvedValueOnce({
      success: true,
      programId: "prog-1",
      result: {
        qualified: true,
        phase: "IN_QUEUE",
        queueNumber: 15,
        queueRank: 3,
        missingRequirements: [],
        details: {
          hasVerifiedWallet: true,
          hasLinkedX: true,
          heldCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
          missingCategories: [],
          completedMandatoryTasksCount: 1,
          totalMandatoryTasksCount: 1,
          isBanned: false,
        },
      },
    } as any);

    render(<WhitelistPage />);

    const qualifyBtn = screen.getByRole("button", { name: "Qualify / Claim Slot" });
    fireEvent.click(qualifyBtn);

    await waitFor(() => {
      expect(screen.getByText("IN QUEUE (Rank #3)")).toBeInTheDocument();
    });

    expect(screen.getByText("You are in the queue at rank #3.")).toBeInTheDocument();
  });
});
