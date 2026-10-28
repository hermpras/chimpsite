import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { AdminAbuseFlags } from "@/components/admin/AdminAbuseFlags";
import * as adminClient from "@/lib/admin/client";

vi.mock("@/lib/admin/client", () => ({
  adminListAbuseFlags: vi.fn(),
  adminUpdateAbuseFlag: vi.fn(),
  adminGetAbuseFlag: vi.fn(),
}));

describe("AdminAbuseFlags UI Component Unit Tests (DEC-012 Stage 5)", () => {
  const mockSampleFlags = [
    {
      id: "flag-sybil-001",
      userId: "user-cluster-1",
      flagType: "SYBIL_WALLET_CLUSTER",
      severity: "HIGH",
      status: "OPEN",
      details: {
        periodId: "period-1",
        clusterWalletCount: 5,
        ipAddress: "198.51.100.42",
      },
      reviewedById: null,
      reviewedAt: null,
      resolutionNotes: null,
      createdAt: "2026-10-28T10:00:00.000Z",
      updatedAt: "2026-10-28T10:00:00.000Z",
      user: {
        id: "user-cluster-1",
        isBanned: false,
        role: "USER",
        wallet: { address: "0x1111111111111111111111111111111111111111" },
        xIdentity: { username: "chimp_alpha" },
      },
    },
    {
      id: "flag-bot-002",
      userId: "user-bot-2",
      flagType: "BOT_ACTIVITY",
      severity: "CRITICAL",
      status: "UNDER_REVIEW",
      details: {
        speedMs: 14,
        userAgent: "python-requests/2.28.1",
      },
      reviewedById: "mod-1",
      reviewedAt: "2026-10-28T11:30:00.000Z",
      resolutionNotes: "Flagged by telemetry engine",
      createdAt: "2026-10-28T09:00:00.000Z",
      updatedAt: "2026-10-28T11:30:00.000Z",
      user: {
        id: "user-bot-2",
        isBanned: true,
        role: "USER",
        wallet: { address: "0x2222222222222222222222222222222222222222" },
        xIdentity: null,
      },
      reviewedBy: {
        id: "mod-1",
        role: "MODERATOR",
        wallet: { address: "0x3333333333333333333333333333333333333333" },
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Renders title and table with abuse flags data", async () => {
    vi.mocked(adminClient.adminListAbuseFlags).mockResolvedValueOnce({
      flags: mockSampleFlags as any,
      total: 2,
      limit: 10,
      offset: 0,
    });

    render(<AdminAbuseFlags />);

    expect(
      screen.getByText("Abuse Flags & Sybil Signals"),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("flag-sybil-001")).toBeInTheDocument();
      expect(screen.getByText("flag-bot-002")).toBeInTheDocument();
    });

    // Check account info
    expect(screen.getByText("@chimp_alpha")).toBeInTheDocument();
    expect(screen.getByText("0x1111...1111")).toBeInTheDocument();
    expect(screen.getByText("0x2222...2222")).toBeInTheDocument();

    // Check banned badge
    expect(screen.getByText("BANNED")).toBeInTheDocument();

    // Check signal types and severities
    expect(screen.getAllByText("Sybil Wallet Cluster").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Bot Activity").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("HIGH").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("CRITICAL").length).toBeGreaterThanOrEqual(1);

    // Check statuses
    expect(screen.getAllByText("OPEN").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("UNDER REVIEW").length).toBeGreaterThanOrEqual(1);
  });

  it("2. Displays empty state when no flags exist", async () => {
    vi.mocked(adminClient.adminListAbuseFlags).mockResolvedValueOnce({
      flags: [],
      total: 0,
      limit: 10,
      offset: 0,
    });

    render(<AdminAbuseFlags />);

    await waitFor(() => {
      expect(screen.getByText("No abuse flags found")).toBeInTheDocument();
    });
  });

  it("3. Displays error message if API fails", async () => {
    vi.mocked(adminClient.adminListAbuseFlags).mockRejectedValueOnce(
      new Error("Database connection timed out"),
    );

    render(<AdminAbuseFlags />);

    await waitFor(() => {
      expect(
        screen.getByText("Database connection timed out"),
      ).toBeInTheDocument();
    });
  });

  it("4. Filters by status and severity when selected", async () => {
    vi.mocked(adminClient.adminListAbuseFlags).mockResolvedValue({
      flags: [mockSampleFlags[0]] as any,
      total: 1,
      limit: 10,
      offset: 0,
    });

    render(<AdminAbuseFlags />);

    await waitFor(() => {
      expect(screen.getByText("flag-sybil-001")).toBeInTheDocument();
    });

    // Change status filter
    const statusSelect = screen.getByLabelText("Status");
    fireEvent.change(statusSelect, { target: { value: "UNDER_REVIEW" } });

    await waitFor(() => {
      expect(adminClient.adminListAbuseFlags).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "UNDER_REVIEW",
        }),
      );
    });

    // Change severity filter
    const severitySelect = screen.getByLabelText("Severity");
    fireEvent.change(severitySelect, { target: { value: "HIGH" } });

    await waitFor(() => {
      expect(adminClient.adminListAbuseFlags).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "HIGH",
        }),
      );
    });
  });

  it("5. Opens inspection modal and displays details & telemetry", async () => {
    vi.mocked(adminClient.adminListAbuseFlags).mockResolvedValueOnce({
      flags: mockSampleFlags as any,
      total: 2,
      limit: 10,
      offset: 0,
    });

    render(<AdminAbuseFlags />);

    await waitFor(() => {
      expect(screen.getByText("flag-sybil-001")).toBeInTheDocument();
    });

    // Click "Review" button on first flag
    const reviewButtons = screen.getAllByRole("button", { name: /Review/i });
    fireEvent.click(reviewButtons[0]);

    // Verify Modal appears
    await waitFor(() => {
      expect(screen.getByText("Investigate Abuse Flag")).toBeInTheDocument();
    });

    // Check modal displays target account and telemetry
    expect(
      screen.getByText("0x1111111111111111111111111111111111111111"),
    ).toBeInTheDocument();
    expect(screen.getByText(/198\.51\.100\.42/)).toBeInTheDocument();
  });

  it("6. Submits status update with resolution notes through modal", async () => {
    vi.mocked(adminClient.adminListAbuseFlags).mockResolvedValue({
      flags: mockSampleFlags as any,
      total: 2,
      limit: 10,
      offset: 0,
    });

    vi.mocked(adminClient.adminUpdateAbuseFlag).mockResolvedValueOnce({
      success: true,
      flag: {
        ...mockSampleFlags[0],
        status: "CONFIRMED_ACTION_TAKEN",
        resolutionNotes: "Confirmed sybil cluster. Manual actions taken.",
      } as any,
      auditLogId: "audit-flag-update-1",
    });

    render(<AdminAbuseFlags />);

    await waitFor(() => {
      expect(screen.getByText("flag-sybil-001")).toBeInTheDocument();
    });

    // Open modal
    const reviewButtons = screen.getAllByRole("button", { name: /Review/i });
    fireEvent.click(reviewButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Investigate Abuse Flag")).toBeInTheDocument();
    });

    // Change status to CONFIRMED_ACTION_TAKEN
    const statusSelect = screen.getByLabelText(/Investigation Status/i);
    fireEvent.change(statusSelect, { target: { value: "CONFIRMED_ACTION_TAKEN" } });

    // Enter notes
    const notesInput = screen.getByLabelText(/Resolution Notes/i);
    fireEvent.change(notesInput, {
      target: {
        value: "Confirmed sybil cluster. Manual actions taken.",
      },
    });

    // Click Save
    const saveButton = screen.getByRole("button", { name: /Save Resolution/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(adminClient.adminUpdateAbuseFlag).toHaveBeenCalledWith({
        flagId: "flag-sybil-001",
        status: "CONFIRMED_ACTION_TAKEN",
        resolutionNotes: "Confirmed sybil cluster. Manual actions taken.",
      });
    });

    // Success notification should be displayed
    await waitFor(() => {
      expect(
        screen.getByText(/status updated to CONFIRMED_ACTION_TAKEN/i),
      ).toBeInTheDocument();
    });
  });

  it("7. Displays update error in modal if update API fails", async () => {
    vi.mocked(adminClient.adminListAbuseFlags).mockResolvedValueOnce({
      flags: mockSampleFlags as any,
      total: 2,
      limit: 10,
      offset: 0,
    });

    vi.mocked(adminClient.adminUpdateAbuseFlag).mockRejectedValueOnce(
      new Error("Forbidden: Missing REVIEW_FLAGS permission"),
    );

    render(<AdminAbuseFlags />);

    await waitFor(() => {
      expect(screen.getByText("flag-sybil-001")).toBeInTheDocument();
    });

    // Open modal
    const reviewButtons = screen.getAllByRole("button", { name: /Review/i });
    fireEvent.click(reviewButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Investigate Abuse Flag")).toBeInTheDocument();
    });

    // Click Save
    const saveButton = screen.getByRole("button", { name: /Save Resolution/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(
        screen.getByText("Forbidden: Missing REVIEW_FLAGS permission"),
      ).toBeInTheDocument();
    });
  });

  it("8. Pagination controls navigate between pages", async () => {
    vi.mocked(adminClient.adminListAbuseFlags).mockResolvedValueOnce({
      flags: mockSampleFlags as any,
      total: 25,
      limit: 10,
      offset: 0,
    });

    render(<AdminAbuseFlags />);

    await waitFor(() => {
      expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    });

    const nextButton = screen.getByRole("button", { name: /Next/i });
    expect(nextButton).not.toBeDisabled();

    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(adminClient.adminListAbuseFlags).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          offset: 10,
        }),
      );
    });
  });
});
