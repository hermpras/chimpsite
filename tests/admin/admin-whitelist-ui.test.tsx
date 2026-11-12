import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { AdminWhitelist } from "@/components/admin/AdminWhitelist";
import * as adminClient from "@/lib/admin/client";

vi.mock("@/lib/admin/client", () => ({
  adminListWLPrograms: vi.fn(),
  adminUpdateWLProgram: vi.fn(),
  adminGetPreExportSummary: vi.fn(),
  adminListGtdSlotReviews: vi.fn(),
  adminGetGtdSlotReviewDetail: vi.fn(),
  adminUpdateGtdSlotReview: vi.fn(),
  adminListFcfsDirectory: vi.fn(),
  adminManualGrantSlot: vi.fn(),
  adminRevokeSlot: vi.fn(),
  adminExportOpenSeaAllowlist: vi.fn(),
}));

describe("Admin Whitelist UI/UX Redesign (Phase 6)", () => {
  const mockProgram: adminClient.AdminWLProgramRecord = {
    id: "prog-genesis",
    slug: "genesis",
    name: "ChimpHood Genesis",
    description: "Canonical Genesis Whitelist Program",
    totalSlots: 500,
    allocatedSlotsCount: 450,
    status: "OPEN",
    startsAt: "2026-10-01T00:00:00.000Z",
    endsAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    campaignsCount: 1,
    slotsCount: 450,
    queueEntriesCount: 1200,
  };

  const mockSummary: adminClient.AdminPreExportSummaryResponse = {
    program: {
      id: "prog-genesis",
      slug: "genesis",
      name: "ChimpHood Genesis",
      status: "OPEN",
      totalSlots: 500,
      allocatedSlotsCount: 450,
    },
    gtd: {
      totalSlots: 500,
      allocatedCount: 450,
      vacantCount: 50,
      flaggedCount: 10,
      walletsCount: 450,
    },
    fcfs: {
      totalDirectoryEntries: 1200,
      bannedOrDisqualifiedCount: 0,
      inactiveDirectoryEntriesCount: 0,
      underQualifiedCount: 1072,
      alreadyGtdCount: 0,
      qualifiedReadyCount: 128,
      accountingBalanceCheck: true,
    },
    disjointVerification: {
      disjointSetVerified: true,
      overlappingWalletsCount: 0,
      overlappingWallets: [],
    },
    timestamp: "2026-11-01T00:00:00.000Z",
  };

  const mockReviews: any = {
    slots: [
      {
        id: "slot-42",
        slotNumber: 42,
        programId: "prog-genesis",
        program: { id: "prog-genesis", name: "ChimpHood Genesis", slug: "genesis" },
        userId: "user-42",
        status: "ALLOCATED",
        reviewStatus: "FLAGGED",
        reviewedAt: "2026-10-25T10:00:00.000Z",
        reviewedBy: "0xAdminAddress",
        reviewNotes: "Suspicious activity flagged",
        allocatedAt: "2026-10-20T10:00:00.000Z",
        confirmedAt: null,
        allocatedBy: "SYSTEM_INSTANT",
        user: {
          id: "user-42",
          wallet: { address: "0x4242424242424242424242424242424242424242" },
          xIdentity: {
            xId: "x-42",
            username: "crypto_chimp",
            name: "Crypto Chimp",
            profileImageUrl: null,
          },
        },
      },
    ],
    total: 1,
    limit: 10,
    offset: 0,
  };

  const mockDirectory: adminClient.AdminListFcfsDirectoryResponse = {
    entries: [
      {
        id: "dir-1",
        userId: "user-qual-1",
        programId: "prog-genesis",
        queueNumber: 1,
        joinedAt: "2026-10-01T00:00:00.000Z",
        status: "WAITING",
        user: {
          id: "user-qual-1",
          walletAddress: "0x1111111111111111111111111111111111111111",
          xIdentity: {
            xId: "x-1",
            username: "ape_holder",
            name: "Ape Holder",
            profileImageUrl: null,
          },
          isBanned: false,
        },
        qualification: {
          isFullyQualified: true,
          heldCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
          heldCategoriesCount: 5,
          missingCategories: [],
          tasksCompleted: true,
          completedTasksCount: 2,
          totalTasksCount: 2,
          isBanned: false,
          missingRequirements: [],
        },
      },
      {
        id: "dir-2",
        userId: "user-unqual-2",
        programId: "prog-genesis",
        queueNumber: 2,
        joinedAt: "2026-10-02T00:00:00.000Z",
        status: "WAITING",
        user: {
          id: "user-unqual-2",
          walletAddress: "0x2222222222222222222222222222222222222222",
          xIdentity: {
            xId: "x-2",
            username: "chimp_fan",
            name: "Chimp Fan",
            profileImageUrl: null,
          },
          isBanned: false,
        },
        qualification: {
          isFullyQualified: false,
          heldCategories: ["BG", "FUR", "CLOTHING"],
          heldCategoriesCount: 3,
          missingCategories: ["HEADWEAR", "EYEWEAR"],
          tasksCompleted: true,
          completedTasksCount: 2,
          totalTasksCount: 2,
          isBanned: false,
          missingRequirements: ["Missing 2 trait categories: HEADWEAR, EYEWEAR"],
        },
      },
    ],
    total: 2,
    limit: 10,
    offset: 0,
    program: {
      id: "prog-genesis",
      name: "ChimpHood Genesis",
      slug: "genesis",
      status: "OPEN",
      totalSlots: 500,
      allocatedSlotsCount: 450,
      vacantCount: 50,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminClient.adminListWLPrograms).mockResolvedValue({
      programs: [mockProgram],
      total: 1,
    });
    vi.mocked(adminClient.adminGetPreExportSummary).mockResolvedValue(mockSummary);
    vi.mocked(adminClient.adminListGtdSlotReviews).mockResolvedValue(mockReviews);
    vi.mocked(adminClient.adminListFcfsDirectory).mockResolvedValue(mockDirectory);
  });

  describe("Section 1: Single Permanent Program & Overview Metrics", () => {
    it("renders permanent program card with metrics, vacant slots, and NO New Program button", async () => {
      render(<AdminWhitelist />);

      await waitFor(() => {
        expect(screen.getByText("ChimpHood Genesis")).toBeInTheDocument();
        expect(screen.getByText("50 Vacant")).toBeInTheDocument();
        expect(screen.getByText("1200")).toBeInTheDocument();
        expect(screen.getAllByText(/128 Qualified/i).length).toBeGreaterThan(0);
        expect(screen.getByText("10 Flagged")).toBeInTheDocument();
      });

      // Strictly verifies no multi-program New Program button
      expect(screen.queryByText(/New Program/i)).not.toBeInTheDocument();
      // Strictly verifies Queue Reconciliation UI is completely eliminated (DEC-018)
      expect(screen.queryByText(/Queue Reconciliation/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Reconcile/i })).not.toBeInTheDocument();
    });

    it("allows updating program status between OPEN, PAUSED, CLOSED", async () => {
      vi.mocked(adminClient.adminUpdateWLProgram).mockResolvedValueOnce({
        program: { ...mockProgram, status: "PAUSED" },
        auditLogId: "audit-status-1",
      });

      render(<AdminWhitelist />);

      await waitFor(() => {
        expect(screen.getByText("ChimpHood Genesis")).toBeInTheDocument();
      });

      const select = screen.getByRole("combobox");
      fireEvent.change(select, { target: { value: "PAUSED" } });

      await waitFor(() => {
        expect(adminClient.adminUpdateWLProgram).toHaveBeenCalledWith(
          "prog-genesis",
          { status: "PAUSED" },
        );
        expect(
          screen.getByText(/Program status updated to PAUSED/i),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Section 2: GTD Post-Allocation Review Console & Detail Modal", () => {
    it("renders GTD slots with review status and filters by tabs", async () => {
      render(<AdminWhitelist />);

      await waitFor(() => {
        expect(screen.getByText("GTD Post-Allocation Review")).toBeInTheDocument();
        expect(screen.getByText("#042")).toBeInTheDocument();
        expect(screen.getByText("@crypto_chimp")).toBeInTheDocument();
        expect(screen.getAllByText("FLAGGED").length).toBeGreaterThan(0);
      });

      // Click "Flagged" tab
      const flaggedTab = screen.getByRole("button", { name: "Flagged" });
      fireEvent.click(flaggedTab);

      await waitFor(() => {
        expect(adminClient.adminListGtdSlotReviews).toHaveBeenCalledWith(
          expect.objectContaining({ reviewStatus: "FLAGGED" }),
        );
      });
    });

    it("opens Review Details Modal, renders 5 traits, submissions, audit log, and saves review", async () => {
      vi.mocked(adminClient.adminGetGtdSlotReviewDetail).mockResolvedValueOnce({
        slot: {
          ...mockReviews.slots[0],
          user: {
            ...mockReviews.slots[0].user,
            isBanned: false,
          },
        },
        traits: {
          heldCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
          heldCategoriesCount: 5,
          missingCategories: [],
          hasAllCategories: true,
        },
        campaigns: {
          completedMandatoryTasksCount: 1,
          totalMandatoryTasksCount: 1,
          tasksCompleted: true,
          submissions: [
            {
              id: "sub-1",
              taskId: "t-1",
              taskTitle: "Follow @ChimpHood on X",
              status: "APPROVED",
              payload: "https://x.com/proof",
              reviewerNotes: "Follow confirmed",
              reviewedAt: "2026-10-21T00:00:00.000Z",
              createdAt: "2026-10-21T00:00:00.000Z",
            },
          ],
        },
        auditHistory: [
          {
            id: "aud-1",
            action: "WL_SLOT_REVIEW_STATUS_UPDATED",
            actorId: "admin-1",
            actor: { id: "admin-1", role: "ADMIN", username: "superadmin" },
            oldValues: { reviewStatus: "NOT_REVIEWED" },
            newValues: { reviewStatus: "FLAGGED" },
            metadata: null,
            createdAt: "2026-10-25T10:00:00.000Z",
          },
        ],
      });

      vi.mocked(adminClient.adminUpdateGtdSlotReview).mockResolvedValueOnce({
        success: true,
        slot: { id: "slot-42", reviewStatus: "VALID" },
        auditLogId: "aud-new",
      });

      render(<AdminWhitelist />);

      await waitFor(() => {
        expect(screen.getByText("#042")).toBeInTheDocument();
      });

      const reviewBtn = screen.getByRole("button", { name: /Review Details/i });
      fireEvent.click(reviewBtn);

      await waitFor(() => {
        expect(screen.getByText(/GTD Slot Review Details — #42/i)).toBeInTheDocument();
        expect(screen.getByText(/5\/5 Categories Owned/i)).toBeInTheDocument();
        expect(screen.getByText("Follow @ChimpHood on X")).toBeInTheDocument();
        expect(screen.getByText("WL_SLOT_REVIEW_STATUS_UPDATED")).toBeInTheDocument();
      });

      // Switch to VALID and save
      const validChoice = screen.getAllByRole("button", { name: "Valid" })[1];
      fireEvent.click(validChoice);

      const notesInput = screen.getByPlaceholderText(/Internal notes regarding audit findings/i);
      fireEvent.change(notesInput, { target: { value: "Manually re-verified by admin" } });

      const saveBtn = screen.getByRole("button", { name: /Save Review/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(adminClient.adminUpdateGtdSlotReview).toHaveBeenCalledWith({
          slotId: "slot-42",
          reviewStatus: "VALID",
          reviewNotes: "Manually re-verified by admin",
        });
      });
    });
  });

  describe("Section 3: FCFS Directory (All Participants, Filter & Manual Grant)", () => {
    it("renders all participants and toggles between All and Fully Qualified Only", async () => {
      render(<AdminWhitelist />);

      await waitFor(() => {
        expect(screen.getByText("FCFS Directory (All Participants)")).toBeInTheDocument();
        expect(screen.getByText("@ape_holder")).toBeInTheDocument();
        expect(screen.getByText("@chimp_fan")).toBeInTheDocument();
      });

      // Toggle to Fully Qualified Only
      const qualOnlyBtn = screen.getByRole("button", { name: "Fully Qualified Only" });
      fireEvent.click(qualOnlyBtn);

      await waitFor(() => {
        expect(adminClient.adminListFcfsDirectory).toHaveBeenCalledWith(
          expect.objectContaining({ qualifiedOnly: true }),
        );
      });
    });

    it("disables Grant GTD for under-qualified participants and enables for qualified", async () => {
      render(<AdminWhitelist />);

      await waitFor(() => {
        expect(screen.getByText("@ape_holder")).toBeInTheDocument();
        expect(screen.getByText("@chimp_fan")).toBeInTheDocument();
      });

      const grantButtons = screen.getAllByRole("button", { name: "Grant GTD" });
      // Candidate 1 is fully qualified -> enabled
      expect(grantButtons[0]).not.toBeDisabled();

      // Candidate 2 has 3/5 traits -> disabled
      expect(grantButtons[1]).toBeDisabled();
    });

    it("opens Manual Grant modal and confirms GTD grant", async () => {
      vi.mocked(adminClient.adminManualGrantSlot).mockResolvedValueOnce({
        success: true,
        slot: {
          id: "slot-new",
          programId: "prog-genesis",
          slotNumber: 43,
          userId: "user-qual-1",
          status: "ALLOCATED",
          reviewStatus: "NOT_REVIEWED",
          allocatedAt: "2026-11-01T00:00:00.000Z",
          allocatedBy: "ADMIN_MANUAL",
          notes: "Reward",
        },
        auditLogId: "audit-grant-1",
      });

      render(<AdminWhitelist />);

      await waitFor(() => {
        expect(screen.getByText("@ape_holder")).toBeInTheDocument();
      });

      const grantBtn = screen.getAllByRole("button", { name: "Grant GTD" })[0];
      fireEvent.click(grantBtn);

      await waitFor(() => {
        expect(screen.getByText("Manually Grant GTD Slot")).toBeInTheDocument();
        expect(screen.getByText("Verification Checklist Confirmed:")).toBeInTheDocument();
      });

      const confirmBtn = screen.getByRole("button", { name: "Confirm Grant GTD" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(adminClient.adminManualGrantSlot).toHaveBeenCalledWith({
          programId: "prog-genesis",
          candidateUserId: "user-qual-1",
          notes: null,
        });
      });
    });
  });

  describe("Section 4: Guarded Revocation Modal (Mandatory 5-char Reason)", () => {
    it("disables revocation until reason is >= 5 characters, then succeeds", async () => {
      vi.mocked(adminClient.adminRevokeSlot).mockResolvedValueOnce({
        success: true,
        slot: { id: "slot-42", status: "REVOKED_MANUAL_ADMIN" },
        auditLogId: "audit-rev",
      } as any);

      render(<AdminWhitelist />);

      await waitFor(() => {
        expect(screen.getByText("#042")).toBeInTheDocument();
      });

      const revokeRowBtn = screen.getByRole("button", { name: "Revoke" });
      fireEvent.click(revokeRowBtn);

      await waitFor(() => {
        expect(screen.getByText(/Revoke Guaranteed Slot #42/i)).toBeInTheDocument();
        expect(screen.getByText(/Permanent Revocation Warning/i)).toBeInTheDocument();
      });

      const confirmRevokeBtn = screen.getByRole("button", { name: "Confirm Revocation" });
      // Button is disabled with 0 chars
      expect(confirmRevokeBtn).toBeDisabled();

      const reasonTextarea = screen.getByPlaceholderText(/Official reason for revocation/i);
      fireEvent.change(reasonTextarea, { target: { value: "Bad" } }); // 3 chars < 5
      expect(confirmRevokeBtn).toBeDisabled();

      fireEvent.change(reasonTextarea, { target: { value: "Sybil cluster detected" } }); // 22 chars >= 5
      expect(confirmRevokeBtn).not.toBeDisabled();

      fireEvent.click(confirmRevokeBtn);

      await waitFor(() => {
        expect(adminClient.adminRevokeSlot).toHaveBeenCalledWith({
          slotId: "slot-42",
          reason: "Sybil cluster detected",
        });
        expect(
          screen.getByText(/Slot #42 was successfully revoked/i),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Section 5: OpenSea Allowlist CSV Export with Pre-Export FLAGGED Warning", () => {
    it("displays FLAGGED warning alert when flagged slots exist in program", async () => {
      render(<AdminWhitelist />);

      await waitFor(() => {
        expect(screen.getByText(/Notice: 10 FLAGGED slot\(s\) included/i)).toBeInTheDocument();
      });
    });

    it("triggers GTD CSV export on button click", async () => {
      vi.mocked(adminClient.adminExportOpenSeaAllowlist).mockResolvedValueOnce({
        filename: "elychimp-gtd-allowlist.csv",
        count: 450,
      });

      render(<AdminWhitelist />);

      await waitFor(() => {
        expect(screen.getByText("ChimpHood Genesis")).toBeInTheDocument();
      });

      const gtdBtn = screen.getByTestId("export-gtd-btn");
      fireEvent.click(gtdBtn);

      await waitFor(() => {
        expect(adminClient.adminExportOpenSeaAllowlist).toHaveBeenCalledWith({
          stage: "gtd",
          programId: "prog-genesis",
        });
        expect(screen.getByTestId("export-success-banner")).toBeInTheDocument();
      });
    });

    it("triggers FCFS CSV export on button click", async () => {
      vi.mocked(adminClient.adminExportOpenSeaAllowlist).mockResolvedValueOnce({
        filename: "elychimp-fcfs-allowlist.csv",
        count: 128,
      });

      render(<AdminWhitelist />);

      await waitFor(() => {
        expect(screen.getByText("ChimpHood Genesis")).toBeInTheDocument();
      });

      const fcfsBtn = screen.getByTestId("export-fcfs-btn");
      fireEvent.click(fcfsBtn);

      await waitFor(() => {
        expect(adminClient.adminExportOpenSeaAllowlist).toHaveBeenCalledWith({
          stage: "fcfs",
          programId: "prog-genesis",
        });
        expect(screen.getByTestId("export-success-banner")).toBeInTheDocument();
      });
    });
  });
});
