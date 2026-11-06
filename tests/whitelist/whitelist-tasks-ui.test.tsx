import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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
    vi.useRealTimers();
    if (typeof window !== "undefined") {
      sessionStorage.clear();
    }
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
    expect(screen.queryByText("Mandatory")).not.toBeInTheDocument();
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
              status: "PENDING_REVIEW",
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
        status: "PENDING_REVIEW",
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
      submission: { id: "ev-fixed", status: "PENDING_REVIEW" },
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

  // 7. Automatic Eligibility & Status Results display
  it("automatically fetches whitelist status and displays qualification results, missing requirements, and status without manual buttons", async () => {
    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "authenticated",
      sessionAddress: "0x1111111111111111111111111111111111111111",
      walletAddress: "0x1111111111111111111111111111111111111111",
    } as any);

    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValueOnce({
      configured: true,
      program: {
        id: "prog-1",
        slug: "main",
        name: "Genesis",
        totalSlots: 1000,
        allocatedSlotsCount: 10,
        status: "OPEN",
      },
      status: {
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

    await waitFor(() => {
      expect(screen.getByText("Not Registered / Ineligible")).toBeInTheDocument();
    });

    expect(
      screen.getByText("Missing trait categories: CLOTHING, EYEWEAR."),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Incomplete task: "Follow Official X Handle".'),
    ).toBeInTheDocument();
    expect(screen.getByText("0 / 1 Completed")).toBeInTheDocument();
    expect(screen.queryByText("Check Eligibility")).not.toBeInTheDocument();
    expect(screen.queryByText("Qualify / Claim Slot")).not.toBeInTheDocument();
  });

  it("displays SLOT_ALLOCATED and slot number when user status has active slot", async () => {
    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "authenticated",
      sessionAddress: "0x1111111111111111111111111111111111111111",
      walletAddress: "0x1111111111111111111111111111111111111111",
    } as any);

    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValueOnce({
      configured: true,
      program: {
        id: "prog-1",
        slug: "main",
        name: "Genesis",
        totalSlots: 1000,
        allocatedSlotsCount: 10,
        status: "OPEN",
      },
      status: {
        qualified: true,
        phase: "SLOT_ALLOCATED",
        slotNumber: 7,
        reviewStatus: "NOT_REVIEWED",
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

    await waitFor(() => {
      expect(screen.getByText("Guaranteed Minter Pass")).toBeInTheDocument();
    });

    expect(screen.getByText("#0007")).toBeInTheDocument();
    expect(screen.getByText("GTD SLOT ALLOCATED")).toBeInTheDocument();
    expect(
      screen.getByText("Slot Confirmed — Routine verification in progress."),
    ).toBeInTheDocument();
  });

  it("displays FCFS_REGISTERED with participant sequence and allowlist status", async () => {
    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "authenticated",
      sessionAddress: "0x1111111111111111111111111111111111111111",
      walletAddress: "0x1111111111111111111111111111111111111111",
    } as any);

    vi.mocked(whitelistClient.fetchWhitelistStatus).mockResolvedValueOnce({
      configured: true,
      program: {
        id: "prog-1",
        slug: "main",
        name: "Genesis",
        totalSlots: 1000,
        allocatedSlotsCount: 10,
        status: "OPEN",
      },
      status: {
        qualified: true,
        isFullyQualified: true,
        phase: "FCFS_REGISTERED",
        queueNumber: 15,
        joinedAt: "2026-10-20T10:00:00.000Z",
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

    await waitFor(() => {
      expect(screen.getByText("FCFS Clearance Pass")).toBeInTheDocument();
    });

    expect(screen.getAllByText("#0015")[0]).toBeInTheDocument();
    expect(screen.getByText(/eligible for inclusion in the OpenSea FCFS allowlist export/i)).toBeInTheDocument();
  });

  it("renders pending review status directly from latestSubmission status PENDING_REVIEW even when progress is null", async () => {
    const campaignWithPendingSubmissionOnly: tasksClient.ActiveCampaignItem[] = [
      {
        ...mockActiveCampaigns[0],
        tasks: [
          {
            ...mockActiveCampaigns[0].tasks[0],
            id: "task-pending-no-progress",
            title: "Task With Direct PENDING_REVIEW",
            progress: null,
            latestSubmission: {
              id: "ev-direct-pending",
              submissionType: "URL",
              payload: "https://x.com/chimphood/status/999",
              status: "PENDING_REVIEW",
              reviewerNotes: null,
              reviewedAt: null,
              createdAt: "2026-10-24T12:00:00Z",
            },
          },
        ],
      },
    ];

    vi.mocked(tasksClient.fetchActiveTasks).mockResolvedValueOnce({
      configured: true,
      campaigns: campaignWithPendingSubmissionOnly,
    });

    render(<WhitelistPage />);

    await waitFor(() => {
      expect(screen.getByText("Task With Direct PENDING_REVIEW")).toBeInTheDocument();
    });

    // Directly tests that task.latestSubmission?.status === "PENDING_REVIEW"
    // correctly triggers the "Pending Review" state without relying on progress?.status === "SUBMITTED"
    expect(screen.getByText("Pending Review")).toBeInTheDocument();
    expect(screen.getByText("Pending Moderator Review")).toBeInTheDocument();
    expect(
      screen.getByText(/Submitted Proof: https:\/\/x\.com\/chimphood\/status\/999/),
    ).toBeInTheDocument();
  });

  // 11. Social X Tasks (Follow, Repost) render destination button and 1-click verify
  it("renders social tasks with direct OPEN X button and allows 1-click VERIFY TASK without typing", async () => {
    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "authenticated",
      sessionAddress: "0x1111111111111111111111111111111111111111",
      walletAddress: "0x1111111111111111111111111111111111111111",
    } as any);

    const socialCampaign: tasksClient.ActiveCampaignItem[] = [
      {
        ...mockActiveCampaigns[0],
        tasks: [
          {
            id: "task-social-follow",
            versionId: "ver-1",
            campaignId: "camp-1",
            taskCode: "FOLLOW_X_CHIMPHOOD",
            title: "Follow X Chimphood Official",
            description: "Follow @chimphoodNFT on X.",
            taskType: "SOCIAL_X_FOLLOW",
            points: 10,
            isRequired: true,
            sortOrder: 1,
            progress: null,
            latestSubmission: null,
            requirementMetadata: null,
          },
          {
            id: "task-social-repost",
            versionId: "ver-1",
            campaignId: "camp-1",
            taskCode: "REPOST_ANNOUNCEMENT",
            title: "Like & Repost Genesis",
            description: "Like and repost our announcement.",
            taskType: "SOCIAL_X_REPOST",
            points: 15,
            isRequired: true,
            sortOrder: 2,
            progress: null,
            latestSubmission: null,
            requirementMetadata: {
              tweetUrl: "https://x.com/chimphoodNFT/status/1234567890",
            },
          },
        ],
      },
    ];

    vi.mocked(tasksClient.fetchActiveTasks).mockResolvedValueOnce({
      configured: true,
      campaigns: socialCampaign,
    });

    vi.mocked(tasksClient.submitTaskEvidence).mockResolvedValueOnce({
      success: true,
      submission: { id: "sub-1", status: "PENDING_REVIEW" },
      taskProgress: { status: "SUBMITTED" },
    } as any);

    render(<WhitelistPage />);

    await waitFor(() => {
      expect(screen.getByText("Follow X Chimphood Official")).toBeInTheDocument();
      expect(screen.getByText("Like & Repost Genesis")).toBeInTheDocument();
    });

    // Check action tags
    expect(screen.getByText("FOLLOW / ONCE")).toBeInTheDocument();
    expect(screen.getByText("REPOST / ONCE")).toBeInTheDocument();

    // Check OPEN X links
    const openXButtons = screen.getAllByText("OPEN X");
    expect(openXButtons.length).toBe(2);

    const followAnchor = openXButtons[0].closest("a");
    expect(followAnchor).toHaveAttribute("href", expect.stringMatching(/x\.com\/(chimphoodNFT|Elychimp)/));

    const repostAnchor = openXButtons[1].closest("a");
    expect(repostAnchor).toHaveAttribute(
      "href",
      "https://x.com/chimphoodNFT/status/1234567890",
    );

    // Gating check: Before clicking OPEN X, verify buttons are disabled VERIFY TASK
    const disabledButtons = screen.getAllByRole("button", {
      name: /VERIFY TASK/i,
    });
    expect(disabledButtons.length).toBe(2);
    expect(disabledButtons[0]).toBeDisabled();

    // Click OPEN X to open destination
    fireEvent.click(followAnchor!);

    // Now the follow verify button is unlocked and enabled
    const verifyButton = (await screen.findAllByRole("button", {
      name: /VERIFY TASK/i,
    }))[0];
    expect(verifyButton).toBeEnabled();

    // Setup fake timers for 10s countdown
    vi.useFakeTimers();

    act(() => {
      fireEvent.click(verifyButton);
    });

    // Should enter countdown state
    expect(screen.getByText(/VERIFYING \(10s\)\.\.\./i)).toBeInTheDocument();

    // Advance 10 seconds to finish countdown and trigger auto-approval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(tasksClient.submitTaskEvidence).toHaveBeenCalledWith(
      "task-social-follow",
      {
        submissionType: "URL",
        payload: expect.stringMatching(/x\.com\/(chimphoodNFT|Elychimp)/),
        autoApprove: true,
      },
    );

    vi.useRealTimers();
  });

  // 12. Social Proof Tasks (Reply, Quote) require OPEN X, then paste link input, then 10s countdown & instant Done
  it("renders reply/quote tasks requiring proof link input after clicking OPEN X and verifies with entered payload", async () => {
    vi.mocked(siweHook.useSiweAuth).mockReturnValue({
      status: "authenticated",
      sessionAddress: "0x1111111111111111111111111111111111111111",
      walletAddress: "0x1111111111111111111111111111111111111111",
    } as any);

    const replyCampaign: tasksClient.ActiveCampaignItem[] = [
      {
        ...mockActiveCampaigns[0],
        tasks: [
          {
            id: "task-social-reply",
            versionId: "ver-1",
            campaignId: "camp-1",
            taskCode: "REPLY_TWEET",
            title: "Reply to Announcement",
            description: "Reply to our genesis announcement with your excitement.",
            taskType: "SOCIAL_X_REPLY",
            points: 15,
            isRequired: true,
            sortOrder: 1,
            progress: null,
            latestSubmission: null,
            requirementMetadata: {
              tweetUrl: "https://x.com/chimphoodNFT/status/987654321",
            },
          },
        ],
      },
    ];

    vi.mocked(tasksClient.fetchActiveTasks).mockResolvedValueOnce({
      configured: true,
      campaigns: replyCampaign,
    });

    vi.mocked(tasksClient.submitTaskEvidence).mockResolvedValueOnce({
      success: true,
      submission: {
        id: "sub-reply",
        status: "APPROVED",
        payload: "https://x.com/user/status/111222333",
      },
      taskProgress: { status: "VERIFIED" },
    } as any);

    render(<WhitelistPage />);

    await waitFor(() => {
      expect(screen.getByText("Reply to Announcement")).toBeInTheDocument();
    });

    expect(screen.getByText("REPLY / ONCE")).toBeInTheDocument();

    // Initially proof input is not visible until OPEN X is clicked
    expect(screen.queryByPlaceholderText(/Paste reply or quote URL/i)).not.toBeInTheDocument();

    // Verify button is disabled initially
    const disabledBtn = screen.getByRole("button", { name: /VERIFY TASK/i });
    expect(disabledBtn).toBeDisabled();

    // Click OPEN X
    const openXBtn = screen.getByText("OPEN X");
    fireEvent.click(openXBtn.closest("a")!);

    // Now proof input appears!
    const input = await screen.findByPlaceholderText(/Paste reply or quote URL/i);
    expect(input).toBeInTheDocument();

    // Before typing, verify button is still disabled
    const pasteFirstBtn = screen.getByRole("button", { name: /VERIFY TASK/i });
    expect(pasteFirstBtn).toBeDisabled();

    // Enter proof URL
    fireEvent.change(input, {
      target: { value: "https://x.com/user/status/111222333" },
    });

    // Now verify button becomes active
    const verifyBtn = screen.getByRole("button", { name: /VERIFY TASK/i });
    expect(verifyBtn).toBeEnabled();

    // Setup fake timers
    vi.useFakeTimers();

    act(() => {
      fireEvent.click(verifyBtn);
    });

    expect(screen.getByText(/VERIFYING \(10s\)\.\.\./i)).toBeInTheDocument();

    // Advance 10 seconds
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(tasksClient.submitTaskEvidence).toHaveBeenCalledWith(
      "task-social-reply",
      {
        submissionType: "URL",
        payload: "https://x.com/user/status/111222333",
        autoApprove: true,
      },
    );

    vi.useRealTimers();
  });

  // 13. Wallet switching resets opened tasks gating & hides proof inputs
  it("resets opened task state and hides proof input when switching wallet address", async () => {
    let mockAuth = {
      status: "authenticated",
      sessionAddress: "0x1111111111111111111111111111111111111111",
      walletAddress: "0x1111111111111111111111111111111111111111",
    };
    vi.mocked(siweHook.useSiweAuth).mockImplementation(() => mockAuth as any);

    const tasksList: tasksClient.ActiveCampaignItem[] = [
      {
        ...mockActiveCampaigns[0],
        tasks: [
          {
            id: "task-social-follow",
            versionId: "ver-1",
            campaignId: "camp-1",
            taskCode: "FOLLOW_X",
            title: "Follow X Chimphood Official",
            description: "Follow us",
            taskType: "SOCIAL_X_FOLLOW",
            points: 10,
            isRequired: true,
            sortOrder: 1,
            progress: null,
            latestSubmission: null,
          },
          {
            id: "task-social-reply",
            versionId: "ver-1",
            campaignId: "camp-1",
            taskCode: "REPLY_TWEET",
            title: "Reply to Tweet",
            description: "Reply to our post",
            taskType: "SOCIAL_X_REPLY",
            points: 10,
            isRequired: true,
            sortOrder: 2,
            progress: null,
            latestSubmission: null,
          },
        ],
      },
    ];

    vi.mocked(tasksClient.fetchActiveTasks).mockResolvedValue({
      configured: true,
      campaigns: tasksList,
    });

    const { rerender } = render(<WhitelistPage />);

    await waitFor(() => {
      expect(screen.getByText("Follow X Chimphood Official")).toBeInTheDocument();
      expect(screen.getByText("Reply to Tweet")).toBeInTheDocument();
    });

    // On Wallet A: initially disabled
    expect(screen.queryByPlaceholderText(/Paste reply or quote URL/i)).not.toBeInTheDocument();
    const openXButtons = screen.getAllByText("OPEN X");

    // Click OPEN X for both tasks on Wallet A
    fireEvent.click(openXButtons[0].closest("a")!);
    fireEvent.click(openXButtons[1].closest("a")!);

    // Now on Wallet A, Follow verify is active and Reply proof input is shown (Reply verify is still disabled until proof is pasted)
    const verifyButtonsOnWalletA = await screen.findAllByRole("button", { name: /VERIFY TASK/i });
    expect(verifyButtonsOnWalletA.length).toBe(2);
    expect(verifyButtonsOnWalletA[0]).toBeEnabled();
    expect(verifyButtonsOnWalletA[1]).toBeDisabled();
    expect(screen.getByPlaceholderText(/Paste reply or quote URL/i)).toBeInTheDocument();

    // Now SWITCH to Wallet B
    mockAuth = {
      status: "authenticated",
      sessionAddress: "0x2222222222222222222222222222222222222222",
      walletAddress: "0x2222222222222222222222222222222222222222",
    };
    rerender(<WhitelistPage />);

    // On Wallet B: opened tasks MUST be reset!
    await waitFor(() => {
      // Proof input must be HIDDEN again
      expect(screen.queryByPlaceholderText(/Paste reply or quote URL/i)).not.toBeInTheDocument();
      // Verify buttons must be disabled VERIFY TASK again
      const disabledButtons = screen.getAllByRole("button", {
        name: /VERIFY TASK/i,
      });
      expect(disabledButtons.length).toBe(2);
      expect(disabledButtons[0]).toBeDisabled();
      expect(disabledButtons[1]).toBeDisabled();
    });
  });
});
