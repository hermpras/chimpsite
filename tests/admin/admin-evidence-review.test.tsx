import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { AdminEvidenceReview } from "@/components/admin/AdminEvidenceReview";
import * as adminClient from "@/lib/admin/client";

vi.mock("@/lib/admin/client", () => ({
  adminListEvidence: vi.fn(),
  adminReviewEvidence: vi.fn(),
  adminGetEvidence: vi.fn(),
}));

describe("AdminEvidenceReview Component Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Tanggal pengajuan tampil benar dari createdAt (tidak lagi Invalid Date)", async () => {
    const mockList = vi.mocked(adminClient.adminListEvidence);
    const testDate = "2026-10-24T10:00:00.000Z";
    mockList.mockResolvedValueOnce({
      submissions: [
        {
          id: "sub-date-test",
          taskId: "task-001",
          userId: "user-001",
          status: "PENDING_REVIEW",
          createdAt: testDate,
          payload: "https://x.com/chimphood/status/12345",
          submissionType: "URL",
        } as any,
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });

    render(<AdminEvidenceReview />);

    await waitFor(() => {
      expect(screen.getByText("ID: sub-date-test")).toBeInTheDocument();
    });

    // Check that "Invalid Date" does NOT appear
    expect(screen.queryByText("Invalid Date")).not.toBeInTheDocument();

    // Check that formatted date matches toLocaleString of createdAt
    const expectedFormattedDate = new Date(testDate).toLocaleString();
    expect(screen.getByText(expectedFormattedDate)).toBeInTheDocument();
  });

  it("2. Konten bukti URL ditampilkan sebagai tautan eksternal dari payload backend", async () => {
    const mockList = vi.mocked(adminClient.adminListEvidence);
    const testUrl = "https://x.com/chimphood/status/9876543210";
    mockList.mockResolvedValueOnce({
      submissions: [
        {
          id: "sub-url-test",
          taskId: "task-002",
          userId: "user-002",
          status: "PENDING_REVIEW",
          createdAt: "2026-10-24T12:00:00.000Z",
          payload: testUrl,
          submissionType: "URL",
        } as any,
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });

    render(<AdminEvidenceReview />);

    await waitFor(() => {
      expect(screen.getByText("ID: sub-url-test")).toBeInTheDocument();
    });

    // Link must be rendered with href pointing to payload URL
    const linkElement = screen.getByRole("link", { name: testUrl });
    expect(linkElement).toBeInTheDocument();
    expect(linkElement).toHaveAttribute("href", testUrl);
    expect(
      screen.queryByText("No text or URL provided in payload."),
    ).not.toBeInTheDocument();
  });

  it("2b. Konten bukti teks ditampilkan dari payload backend (TEXT_PROOF)", async () => {
    const mockList = vi.mocked(adminClient.adminListEvidence);
    const testText = "Submitted proof via Discord community task ID #4492";
    mockList.mockResolvedValueOnce({
      submissions: [
        {
          id: "sub-text-test",
          taskId: "task-003",
          userId: "user-003",
          status: "PENDING_REVIEW",
          createdAt: "2026-10-24T13:00:00.000Z",
          payload: testText,
          submissionType: "TEXT_PROOF",
        } as any,
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });

    render(<AdminEvidenceReview />);

    await waitFor(() => {
      expect(screen.getByText("ID: sub-text-test")).toBeInTheDocument();
    });

    expect(screen.getByText(testText)).toBeInTheDocument();
    expect(
      screen.queryByText("No text or URL provided in payload."),
    ).not.toBeInTheDocument();
  });

  it("3. Submission APPROVED dapat ditolak (Reject) oleh admin jika terbukti palsu saat post-audit", async () => {
    const mockList = vi.mocked(adminClient.adminListEvidence);
    mockList.mockResolvedValue({
      submissions: [
        {
          id: "sub-approved-test",
          taskId: "task-004",
          userId: "user-004",
          status: "APPROVED",
          createdAt: "2026-10-24T09:00:00.000Z",
          reviewedAt: "2026-10-24T10:00:00.000Z",
          reviewerId: "admin-reviewer-01",
          reviewerNotes: "Verified proof",
          payload: "https://x.com/proof/1",
          submissionType: "URL",
        } as any,
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });

    render(<AdminEvidenceReview />);

    // Switch to Audited & Verified tab
    const auditedTab = screen.getByRole("button", { name: /Audited & Verified/i });
    fireEvent.click(auditedTab);

    await waitFor(() => {
      expect(screen.getByText("ID: sub-approved-test")).toBeInTheDocument();
    });

    // Check that Confirmed Valid is disabled (already audited), but Reject is enabled for post-audit
    const confirmedBtn = screen.getByRole("button", { name: "Confirmed Valid" });
    const rejectBtn = screen.getByRole("button", { name: "Reject" });
    expect(confirmedBtn).toBeDisabled();
    expect(rejectBtn).not.toBeDisabled();

    // Check feedback input is enabled for rejection reason
    const noteInput = screen.getByPlaceholderText("Reason for rejection if invalid...");
    expect(noteInput).not.toBeDisabled();

    // Check that status text is rendered
    expect(
      screen.getByText("Audited & confirmed valid by admin"),
    ).toBeInTheDocument();
  });

  it("3b. Submission auto-approved (Needs Audit) memiliki tombol Confirm Valid yang aktif untuk menandai sudah diaudit", async () => {
    const mockList = vi.mocked(adminClient.adminListEvidence);
    const mockReview = vi.mocked(adminClient.adminReviewEvidence);
    mockList.mockResolvedValue({
      submissions: [
        {
          id: "sub-auto-audit-test",
          taskId: "task-004b",
          userId: "user-004b",
          status: "APPROVED",
          createdAt: "2026-10-24T09:00:00.000Z",
          reviewedAt: "2026-10-24T09:00:00.000Z",
          reviewerNotes: "Auto-verified via social action",
          payload: "https://x.com/proof/auto-audit",
          submissionType: "URL",
        } as any,
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });
    mockReview.mockResolvedValueOnce({ success: true } as any);

    render(<AdminEvidenceReview />);

    await waitFor(() => {
      expect(screen.getByText("ID: sub-auto-audit-test")).toBeInTheDocument();
    });

    expect(screen.getByText("Needs Audit")).toBeInTheDocument();
    expect(screen.getByText("Auto-Approved")).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Confirm Valid" });
    const rejectBtn = screen.getByRole("button", { name: "Reject" });
    expect(confirmBtn).not.toBeDisabled();
    expect(rejectBtn).not.toBeDisabled();

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockReview).toHaveBeenCalledWith("sub-auto-audit-test", {
        status: "APPROVED",
        reviewerNotes: "Audited & confirmed by admin",
      });
      expect(
        screen.getByText(/Submission sub-auto confirmed valid by admin!/i),
      ).toBeInTheDocument();
    });
  });

  it("4. Submission PENDING_REVIEW memiliki tombol Approve/Reject yang aktif dan dapat direview", async () => {
    const mockList = vi.mocked(adminClient.adminListEvidence);
    const mockReview = vi.mocked(adminClient.adminReviewEvidence);

    mockList.mockResolvedValue({
      submissions: [
        {
          id: "sub-pending-test",
          taskId: "task-005",
          userId: "user-005",
          status: "PENDING_REVIEW",
          createdAt: "2026-10-24T14:00:00.000Z",
          payload: "https://x.com/proof/pending",
          submissionType: "URL",
        } as any,
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });
    mockReview.mockResolvedValueOnce({ success: true } as any);

    render(<AdminEvidenceReview />);

    await waitFor(() => {
      expect(screen.getByText("ID: sub-pending-test")).toBeInTheDocument();
    });

    const approveBtn = screen.getByRole("button", { name: "Approve" });
    const rejectBtn = screen.getByRole("button", { name: "Reject" });
    expect(approveBtn).not.toBeDisabled();
    expect(rejectBtn).not.toBeDisabled();

    // Provide note and click approve
    const noteInput = screen.getByPlaceholderText("Optional reason or feedback...");
    expect(noteInput).not.toBeDisabled();
    fireEvent.change(noteInput, { target: { value: "Approved proof link" } });

    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(mockReview).toHaveBeenCalledWith("sub-pending-test", {
        status: "APPROVED",
        reviewerNotes: "Approved proof link",
      });
      expect(
        screen.getByText(/Submission sub-pend successfully approved!/i),
      ).toBeInTheDocument();
    });
  });

  it("5. Menampilkan informasi X dan wallet user pada card submission", async () => {
    const mockList = vi.mocked(adminClient.adminListEvidence);
    mockList.mockResolvedValueOnce({
      submissions: [
        {
          id: "sub-user-info",
          taskId: "task-010",
          userId: "user-alpha",
          status: "APPROVED",
          createdAt: "2026-11-03T10:00:00.000Z",
          payload: "https://x.com/soikikip/status/2115819996813475159",
          submissionType: "URL",
          user: {
            id: "user-alpha",
            wallet: { address: "0xcf5168019e13b827ac46b9a84499e3a6cf513ae9" },
            xIdentity: { username: "soikikip" },
          },
          task: {
            id: "task-010",
            taskCode: "QUOTE_TWEET_CAMPAIGN",
            title: "Quote Announcement Tweet",
            taskType: "SOCIAL_X_QUOTE",
          },
        } as any,
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });

    render(<AdminEvidenceReview />);

    await waitFor(() => {
      expect(screen.getByText("ID: sub-user-info")).toBeInTheDocument();
    });

    // Verify X username and link
    const xLink = screen.getByRole("link", { name: /@soikikip/i });
    expect(xLink).toBeInTheDocument();
    expect(xLink).toHaveAttribute("href", "https://x.com/soikikip");

    // Verify shortened wallet address
    expect(screen.getByText("0xcf51...3ae9")).toBeInTheDocument();

    // Verify task title & task type
    expect(screen.getByText("Quote Announcement Tweet")).toBeInTheDocument();
    expect(screen.getByText("QUOTE")).toBeInTheDocument();

    // Verify proof is shown for QUOTE task
    expect(screen.getByText("Submitted Evidence Content:")).toBeInTheDocument();
  });

  it("6. Sembunyikan Submitted Evidence Content khusus FOLLOW, LIKE, REPOST dan tampilkan untuk Reply & Quote", async () => {
    const mockList = vi.mocked(adminClient.adminListEvidence);
    mockList.mockResolvedValue({
      submissions: [
        {
          id: "sub-follow",
          taskId: "task-follow",
          userId: "user-beta",
          status: "APPROVED",
          createdAt: "2026-11-03T11:00:00.000Z",
          payload: "https://x.com/soikikip",
          submissionType: "URL",
          reviewerNotes: "Auto-verified via social action",
          user: {
            id: "user-beta",
            wallet: { address: "0x1234567890abcdef1234567890abcdef12345678" },
            xIdentity: { username: "soikikip" },
          },
          task: {
            id: "task-follow",
            taskCode: "FOLLOW_TWITTER",
            title: "Follow @ChimpHoodNFT",
            taskType: "SOCIAL_X_FOLLOW",
          },
        } as any,
        {
          id: "sub-reply",
          taskId: "task-reply",
          userId: "user-beta",
          status: "APPROVED",
          createdAt: "2026-11-03T11:15:00.000Z",
          payload: "https://x.com/soikikip/status/999888777",
          submissionType: "URL",
          user: {
            id: "user-beta",
            wallet: { address: "0x1234567890abcdef1234567890abcdef12345678" },
            xIdentity: { username: "soikikip" },
          },
          task: {
            id: "task-reply",
            taskCode: "REPLY_CAMPAIGN",
            title: "Reply to Post",
            taskType: "SOCIAL_X_REPLY",
          },
        } as any,
      ],
      total: 2,
      limit: 50,
      offset: 0,
    });

    render(<AdminEvidenceReview />);

    // All submissions show up without being removed from list
    await waitFor(() => {
      expect(screen.getByText("ID: sub-reply")).toBeInTheDocument();
      expect(screen.getByText("ID: sub-follow")).toBeInTheDocument();
    });

    // The reply task should have "Submitted Evidence Content:"
    expect(screen.getByText("Submitted Evidence Content:")).toBeInTheDocument();

    // For FOLLOW task, "Submitted Evidence Content" should be HIDDEN, and auto-verified note shown instead
    expect(
      screen.getByText("Auto-verified social task — manual proof content hidden"),
    ).toBeInTheDocument();

    // Now switch filter to "Reply & Quote Only"
    const replyQuoteBtn = screen.getByRole("button", { name: "Reply & Quote Only" });
    fireEvent.click(replyQuoteBtn);

    // Follow task should now be filtered out from the list in REPLY_QUOTE_ONLY mode
    await waitFor(() => {
      expect(screen.queryByText("ID: sub-follow")).not.toBeInTheDocument();
      expect(screen.getByText("ID: sub-reply")).toBeInTheDocument();
      expect(screen.getByText("(1 Follow/Like/Repost hidden)")).toBeInTheDocument();
    });
  });
});
