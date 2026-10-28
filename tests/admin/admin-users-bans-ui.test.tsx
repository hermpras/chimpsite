import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { AdminUsersBans } from "@/components/admin/AdminUsersBans";
import * as adminClient from "@/lib/admin/client";

vi.mock("@/lib/admin/client", () => ({
  adminBanUser: vi.fn(),
  adminRevokeBan: vi.fn(),
  adminListUsers: vi
    .fn()
    .mockResolvedValue({ users: [], total: 0, limit: 10, offset: 0 }),
}));

describe("Local Testing - Admin Dashboard Users & Bans UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn();
  });

  // =========================================================================
  // 1. LOADING, EMPTY STATE, USER SEARCH, & DATA DISPLAY
  // =========================================================================
  describe("1. Loading, Empty State, Search, and Data Display", () => {
    it("renders page title, badges, and headers correctly", () => {
      render(<AdminUsersBans />);
      expect(screen.getByRole("heading", { name: "Users & Bans" })).toBeInTheDocument();
      expect(screen.getByText("Enforcement Engine")).toBeInTheDocument();
      expect(screen.getByText("Ban Account")).toBeInTheDocument();
      expect(screen.getByText("Revoke Ban")).toBeInTheDocument();
    });

    it("renders User Directory & Search and allows searching and auto-filling ban/revoke forms", async () => {
      vi.mocked(adminClient.adminListUsers).mockResolvedValueOnce({
        users: [
          {
            id: "user-cuid-123",
            role: "USER",
            isBanned: false,
            createdAt: "2026-10-24T00:00:00.000Z",
            updatedAt: "2026-10-24T00:00:00.000Z",
            wallet: {
              address: "0x1234567890123456789012345678901234567890",
              chainId: 1,
              verifiedAt: "2026-10-24T00:00:00.000Z",
            },
            xIdentity: { username: "chimp_trader", name: "Chimp Trader" },
            activeBan: null,
          },
          {
            id: "user-banned-456",
            role: "USER",
            isBanned: true,
            createdAt: "2026-10-24T00:00:00.000Z",
            updatedAt: "2026-10-24T00:00:00.000Z",
            wallet: {
              address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
              chainId: 1,
              verifiedAt: "2026-10-24T00:00:00.000Z",
            },
            xIdentity: null,
            activeBan: {
              id: "ban-rec-789",
              banType: "PERMANENT",
              scope: "FULL_SYSTEM",
              reason: "Sybil activity",
              issuedAt: "2026-10-24T00:00:00.000Z",
              expiresAt: null,
            },
          },
        ],
        total: 2,
        limit: 10,
        offset: 0,
      });

      render(<AdminUsersBans />);

      expect(screen.getByText("User Directory & Search")).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText("user-cuid-123")).toBeInTheDocument();
        expect(screen.getByText("@chimp_trader")).toBeInTheDocument();
        expect(screen.getByText("user-banned-456")).toBeInTheDocument();
        expect(screen.getByText("BANNED")).toBeInTheDocument();
      });

      // Clicking "Ban" next to user-cuid-123 auto-populates the Target User ID field
      const banButtons = screen.getAllByRole("button", { name: "Ban" });
      fireEvent.click(banButtons[0]);

      expect(screen.getByLabelText(/Target User ID/i)).toHaveValue("user-cuid-123");

      // Clicking "Revoke" next to banned user auto-populates the Ban Record ID field
      const revokeButton = screen.getByRole("button", { name: "Revoke" });
      fireEvent.click(revokeButton);

      expect(screen.getByLabelText(/Ban Record ID/i)).toHaveValue("ban-rec-789");
    });

    it("triggers search query submission and updates directory listing", async () => {
      vi.mocked(adminClient.adminListUsers).mockResolvedValueOnce({
        users: [],
        total: 0,
        limit: 10,
        offset: 0,
      });

      render(<AdminUsersBans />);

      const searchInput = screen.getByPlaceholderText(
        /Search by wallet address \(0x\.\.\.\), User CUID, or X username/i,
      );
      fireEvent.change(searchInput, { target: { value: "0x1234" } });
      fireEvent.submit(searchInput.closest("form")!);

      await waitFor(() => {
        expect(adminClient.adminListUsers).toHaveBeenCalledWith({
          search: "0x1234",
          limit: 10,
          offset: 0,
        });
      });
    });

    it("shows loading state when ban execution is in progress", async () => {
      let resolveBan: any;
      const banPromise = new Promise((resolve) => {
        resolveBan = resolve;
      });
      vi.mocked(adminClient.adminBanUser).mockReturnValueOnce(banPromise as any);

      render(<AdminUsersBans />);

      fireEvent.change(screen.getByLabelText(/Target User ID/i), {
        target: { value: "user-target-123" },
      });
      fireEvent.change(screen.getByLabelText(/Reason for Ban/i), {
        target: { value: "Sybil farming detected" },
      });

      const banButton = screen.getByRole("button", { name: /Execute Account Ban/i });
      fireEvent.click(banButton);

      // Verify button shows loading label and is disabled
      expect(
        screen.getByRole("button", { name: /Applying Ban\.\.\./i }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Applying Ban\.\.\./i })).toBeDisabled();

      // Resolve the ban
      resolveBan({
        success: true,
        banRecord: { id: "ban_rec_1", scope: "FULL_SYSTEM" },
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Execute Account Ban/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: /Execute Account Ban/i }),
        ).not.toBeDisabled();
      });
    });

    it("shows loading state when revoke execution is in progress", async () => {
      let resolveRevoke: any;
      const revokePromise = new Promise((resolve) => {
        resolveRevoke = resolve;
      });
      vi.mocked(adminClient.adminRevokeBan).mockReturnValueOnce(revokePromise as any);

      render(<AdminUsersBans />);

      fireEvent.change(screen.getByLabelText(/Ban Record ID/i), {
        target: { value: "ban_rec_999" },
      });

      const revokeButton = screen.getByRole("button", { name: /Revoke Ban Record/i });
      fireEvent.click(revokeButton);

      expect(
        screen.getByRole("button", { name: /Revoking Ban\.\.\./i }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Revoking Ban\.\.\./i })).toBeDisabled();

      resolveRevoke({
        success: true,
        auditLogId: "audit_rev_123",
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Revoke Ban Record/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: /Revoke Ban Record/i }),
        ).not.toBeDisabled();
      });
    });
  });

  // =========================================================================
  // 2. BAN APPLICATION & REVOCATION WITH SUPPORTED TYPES & SCOPES
  // =========================================================================
  describe("2. Granting and Revoking Bans (Types and Scopes)", () => {
    it("submits ban with PERMANENT type and FULL_SYSTEM scope", async () => {
      vi.mocked(adminClient.adminBanUser).mockResolvedValueOnce({
        success: true,
        banRecord: { id: "ban-perm-1", scope: "FULL_SYSTEM" },
      });

      render(<AdminUsersBans />);

      fireEvent.change(screen.getByLabelText(/Target User ID/i), {
        target: { value: "user-perm" },
      });
      fireEvent.change(screen.getByLabelText(/Reason for Ban/i), {
        target: { value: "Severe sybil cluster detected" },
      });
      fireEvent.change(screen.getByLabelText(/Ban Type/i), {
        target: { value: "PERMANENT" },
      });
      fireEvent.change(screen.getByLabelText(/Enforcement Scope/i), {
        target: { value: "FULL_SYSTEM" },
      });
      fireEvent.change(screen.getByLabelText(/Evidence Link \/ Proof/i), {
        target: { value: "https://explorer.solana.com/evidence" },
      });

      fireEvent.click(screen.getByRole("button", { name: /Execute Account Ban/i }));

      await waitFor(() => {
        expect(adminClient.adminBanUser).toHaveBeenCalledWith({
          userId: "user-perm",
          reason: "Severe sybil cluster detected",
          banType: "PERMANENT",
          scope: "FULL_SYSTEM",
          evidence: "https://explorer.solana.com/evidence",
          expiresAt: null,
        });
        expect(screen.getByText("Ban Applied Successfully")).toBeInTheDocument();
        expect(
          screen.getByText(/Ban ID: ban-perm-1 \(Scope: FULL_SYSTEM\)/i),
        ).toBeInTheDocument();
      });
    });

    it("submits ban with TEMPORARY type and CLAIM_RESTRICTED scope with expiration date", async () => {
      vi.mocked(adminClient.adminBanUser).mockResolvedValueOnce({
        success: true,
        banRecord: { id: "ban-temp-1", scope: "CLAIM_RESTRICTED" },
      });

      render(<AdminUsersBans />);

      fireEvent.change(screen.getByLabelText(/Target User ID/i), {
        target: { value: "user-claim-bot" },
      });
      fireEvent.change(screen.getByLabelText(/Reason for Ban/i), {
        target: { value: "Claim rate-limiting violation" },
      });
      fireEvent.change(screen.getByLabelText(/Ban Type/i), {
        target: { value: "TEMPORARY" },
      });
      fireEvent.change(screen.getByLabelText(/Enforcement Scope/i), {
        target: { value: "CLAIM_RESTRICTED" },
      });
      fireEvent.change(screen.getByLabelText(/Expires At/i), {
        target: { value: "2026-11-01T12:00" },
      });

      fireEvent.click(screen.getByRole("button", { name: /Execute Account Ban/i }));

      await waitFor(() => {
        expect(adminClient.adminBanUser).toHaveBeenCalledWith({
          userId: "user-claim-bot",
          reason: "Claim rate-limiting violation",
          banType: "TEMPORARY",
          scope: "CLAIM_RESTRICTED",
          evidence: null,
          expiresAt: expect.stringContaining("2026-11-01T"),
        });
        expect(screen.getByText("Ban Applied Successfully")).toBeInTheDocument();
      });
    });

    it("submits ban with FEATURE_RESTRICTION and GIFT_RESTRICTED scope", async () => {
      vi.mocked(adminClient.adminBanUser).mockResolvedValueOnce({
        success: true,
        banRecord: { id: "ban-gift-1", scope: "GIFT_RESTRICTED" },
      });

      render(<AdminUsersBans />);

      fireEvent.change(screen.getByLabelText(/Target User ID/i), {
        target: { value: "user-gift-spammer" },
      });
      fireEvent.change(screen.getByLabelText(/Reason for Ban/i), {
        target: { value: "Suspicious gift looping" },
      });
      fireEvent.change(screen.getByLabelText(/Ban Type/i), {
        target: { value: "FEATURE_RESTRICTION" },
      });
      fireEvent.change(screen.getByLabelText(/Enforcement Scope/i), {
        target: { value: "GIFT_RESTRICTED" },
      });

      fireEvent.click(screen.getByRole("button", { name: /Execute Account Ban/i }));

      await waitFor(() => {
        expect(adminClient.adminBanUser).toHaveBeenCalledWith({
          userId: "user-gift-spammer",
          reason: "Suspicious gift looping",
          banType: "FEATURE_RESTRICTION",
          scope: "GIFT_RESTRICTED",
          evidence: null,
          expiresAt: null,
        });
      });
    });

    it("submits ban with SHADOWBAN and WL_DISQUALIFIED scope", async () => {
      vi.mocked(adminClient.adminBanUser).mockResolvedValueOnce({
        success: true,
        banRecord: { id: "ban-wl-1", scope: "WL_DISQUALIFIED" },
      });

      render(<AdminUsersBans />);

      fireEvent.change(screen.getByLabelText(/Target User ID/i), {
        target: { value: "user-wl-abuse" },
      });
      fireEvent.change(screen.getByLabelText(/Reason for Ban/i), {
        target: { value: "Fake evidence quest submission" },
      });
      fireEvent.change(screen.getByLabelText(/Ban Type/i), {
        target: { value: "SHADOWBAN" },
      });
      fireEvent.change(screen.getByLabelText(/Enforcement Scope/i), {
        target: { value: "WL_DISQUALIFIED" },
      });

      fireEvent.click(screen.getByRole("button", { name: /Execute Account Ban/i }));

      await waitFor(() => {
        expect(adminClient.adminBanUser).toHaveBeenCalledWith({
          userId: "user-wl-abuse",
          reason: "Fake evidence quest submission",
          banType: "SHADOWBAN",
          scope: "WL_DISQUALIFIED",
          evidence: null,
          expiresAt: null,
        });
      });
    });

    it("displays 'Account Already Banned' notification when user is already banned (alreadyBanned: true)", async () => {
      vi.mocked(adminClient.adminBanUser).mockResolvedValueOnce({
        success: true,
        userId: "user-duplicate-target",
        isBanned: true,
        alreadyBanned: true,
        banRecord: {
          id: "ban-existing-999",
          userId: "user-duplicate-target",
          banType: "PERMANENT",
          scope: "FULL_SYSTEM",
          reason: "Earlier sybil offense",
          evidence: null,
          issuedById: "admin-prior",
          issuedAt: new Date(),
          expiresAt: null,
          isActive: true,
        },
        auditLogId: null,
      });

      render(<AdminUsersBans />);

      fireEvent.change(screen.getByLabelText(/Target User ID/i), {
        target: { value: "user-duplicate-target" },
      });
      fireEvent.change(screen.getByLabelText(/Reason for Ban/i), {
        target: { value: "Duplicate sybil attempt" },
      });

      fireEvent.click(screen.getByRole("button", { name: /Execute Account Ban/i }));

      await waitFor(() => {
        expect(screen.getByText("Account Already Banned")).toBeInTheDocument();
        expect(
          screen.getByText(
            /An active ban with the same or encompassing scope already exists/i,
          ),
        ).toBeInTheDocument();
        expect(
          screen.getByText(/Existing Ban ID: ban-existing-999/i),
        ).toBeInTheDocument();
        // Crucial requirement: Must NOT claim a new ban was created
        expect(screen.queryByText("Ban Applied Successfully")).not.toBeInTheDocument();
      });
    });

    it("displays normal 'Ban Applied Successfully' notification for a new ban (alreadyBanned: false)", async () => {
      vi.mocked(adminClient.adminBanUser).mockResolvedValueOnce({
        success: true,
        userId: "user-new-target",
        isBanned: true,
        alreadyBanned: false,
        banRecord: {
          id: "ban-fresh-100",
          userId: "user-new-target",
          banType: "PERMANENT",
          scope: "FULL_SYSTEM",
          reason: "Fresh infraction",
          evidence: null,
          issuedById: "admin-actor",
          issuedAt: new Date(),
          expiresAt: null,
          isActive: true,
        },
        auditLogId: "audit-fresh-1",
      });

      render(<AdminUsersBans />);

      fireEvent.change(screen.getByLabelText(/Target User ID/i), {
        target: { value: "user-new-target" },
      });
      fireEvent.change(screen.getByLabelText(/Reason for Ban/i), {
        target: { value: "Fresh infraction" },
      });

      fireEvent.click(screen.getByRole("button", { name: /Execute Account Ban/i }));

      await waitFor(() => {
        expect(screen.getByText("Ban Applied Successfully")).toBeInTheDocument();
        expect(screen.getByText(/Ban ID: ban-fresh-100/i)).toBeInTheDocument();
        expect(screen.queryByText("Account Already Banned")).not.toBeInTheDocument();
      });
    });

    it("submits ban revocation with banId and optional reason", async () => {
      vi.mocked(adminClient.adminRevokeBan).mockResolvedValueOnce({
        success: true,
        banId: "ban-perm-1",
        userId: "user-perm",
        isActive: false,
        auditLogId: "audit-revoke-001",
      });

      render(<AdminUsersBans />);

      fireEvent.change(screen.getByLabelText(/Ban Record ID/i), {
        target: { value: "ban-perm-1" },
      });
      fireEvent.change(screen.getByLabelText(/Revocation Reason/i), {
        target: { value: "User passed manual appeal verification" },
      });

      fireEvent.click(screen.getByRole("button", { name: /Revoke Ban Record/i }));

      await waitFor(() => {
        expect(adminClient.adminRevokeBan).toHaveBeenCalledWith({
          banId: "ban-perm-1",
          reason: "User passed manual appeal verification",
        });
        expect(screen.getByText("Ban Revoked Successfully")).toBeInTheDocument();
        expect(screen.getByText(/Audit Log ID: audit-revoke-001/i)).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 3. INPUT VALIDATION & INVALID ACTION PREVENTION
  // =========================================================================
  describe("3. Input Validation and Prevention of Invalid Actions", () => {
    it("prevents ban submission when Target User ID or Reason is empty", async () => {
      render(<AdminUsersBans />);

      const form = screen.getByLabelText(/Target User ID/i).closest("form")!;
      fireEvent.submit(form);

      expect(adminClient.adminBanUser).not.toHaveBeenCalled();
      expect(screen.getByText("User ID and Reason are required.")).toBeInTheDocument();
    });

    it("prevents ban revocation submission when Ban Record ID is empty", async () => {
      render(<AdminUsersBans />);

      const form = screen.getByLabelText(/Ban Record ID/i).closest("form")!;
      fireEvent.submit(form);

      expect(adminClient.adminRevokeBan).not.toHaveBeenCalled();
      expect(screen.getByText("Ban ID is required.")).toBeInTheDocument();
    });

    it("handles and displays backend error when target user does not exist (404 USER_NOT_FOUND)", async () => {
      vi.mocked(adminClient.adminBanUser).mockRejectedValueOnce(
        new Error("Target user does not exist."),
      );

      render(<AdminUsersBans />);

      fireEvent.change(screen.getByLabelText(/Target User ID/i), {
        target: { value: "non-existent-user" },
      });
      fireEvent.change(screen.getByLabelText(/Reason for Ban/i), {
        target: { value: "Testing non-existent user" },
      });

      fireEvent.click(screen.getByRole("button", { name: /Execute Account Ban/i }));

      await waitFor(() => {
        expect(screen.getByText("Target user does not exist.")).toBeInTheDocument();
      });
    });

    it("handles and displays backend error when attempting self-ban (400 CANNOT_BAN_SELF)", async () => {
      vi.mocked(adminClient.adminBanUser).mockRejectedValueOnce(
        new Error("Administrators cannot ban their own account."),
      );

      render(<AdminUsersBans />);

      fireEvent.change(screen.getByLabelText(/Target User ID/i), {
        target: { value: "self-admin-id" },
      });
      fireEvent.change(screen.getByLabelText(/Reason for Ban/i), {
        target: { value: "Accidental self ban" },
      });

      fireEvent.click(screen.getByRole("button", { name: /Execute Account Ban/i }));

      await waitFor(() => {
        expect(
          screen.getByText("Administrators cannot ban their own account."),
        ).toBeInTheDocument();
      });
    });

    it("handles and displays backend error when attempting to ban SUPER_ADMIN (403 CANNOT_BAN_SUPER_ADMIN)", async () => {
      vi.mocked(adminClient.adminBanUser).mockRejectedValueOnce(
        new Error("Super administrators cannot be banned."),
      );

      render(<AdminUsersBans />);

      fireEvent.change(screen.getByLabelText(/Target User ID/i), {
        target: { value: "super-admin-id" },
      });
      fireEvent.change(screen.getByLabelText(/Reason for Ban/i), {
        target: { value: "Dispute" },
      });

      fireEvent.click(screen.getByRole("button", { name: /Execute Account Ban/i }));

      await waitFor(() => {
        expect(
          screen.getByText("Super administrators cannot be banned."),
        ).toBeInTheDocument();
      });
    });

    it("handles and displays backend error when non-super admin attempts to ban ADMIN (403 INSUFFICIENT_PRIVILEGE)", async () => {
      vi.mocked(adminClient.adminBanUser).mockRejectedValueOnce(
        new Error("Only super administrators can ban administrative accounts."),
      );

      render(<AdminUsersBans />);

      fireEvent.change(screen.getByLabelText(/Target User ID/i), {
        target: { value: "other-admin-id" },
      });
      fireEvent.change(screen.getByLabelText(/Reason for Ban/i), {
        target: { value: "Unauthorized action" },
      });

      fireEvent.click(screen.getByRole("button", { name: /Execute Account Ban/i }));

      await waitFor(() => {
        expect(
          screen.getByText("Only super administrators can ban administrative accounts."),
        ).toBeInTheDocument();
      });
    });

    it("handles and displays backend error when revoking already inactive ban (409 BAN_ALREADY_INACTIVE)", async () => {
      vi.mocked(adminClient.adminRevokeBan).mockRejectedValueOnce(
        new Error("This ban is already inactive."),
      );

      render(<AdminUsersBans />);

      fireEvent.change(screen.getByLabelText(/Ban Record ID/i), {
        target: { value: "inactive-ban-id" },
      });

      fireEvent.click(screen.getByRole("button", { name: /Revoke Ban Record/i }));

      await waitFor(() => {
        expect(screen.getByText("This ban is already inactive.")).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 4. UI CONSISTENCY WITH API RESPONSES & NOTIFICATIONS
  // =========================================================================
  describe("4. UI Consistency and Notification Management", () => {
    it("clears form inputs upon successful ban execution", async () => {
      vi.mocked(adminClient.adminBanUser).mockResolvedValueOnce({
        success: true,
        banRecord: { id: "ban-clear-test", scope: "FULL_SYSTEM" },
      });

      render(<AdminUsersBans />);

      const userInput = screen.getByLabelText(/Target User ID/i) as HTMLInputElement;
      const reasonInput = screen.getByLabelText(/Reason for Ban/i) as HTMLInputElement;
      const evidenceInput = screen.getByLabelText(/Evidence Link/i) as HTMLInputElement;

      fireEvent.change(userInput, { target: { value: "user-to-clear" } });
      fireEvent.change(reasonInput, { target: { value: "Clear test reason" } });
      fireEvent.change(evidenceInput, { target: { value: "https://proof.example.com" } });

      fireEvent.click(screen.getByRole("button", { name: /Execute Account Ban/i }));

      await waitFor(() => {
        expect(userInput.value).toBe("");
        expect(reasonInput.value).toBe("");
        expect(evidenceInput.value).toBe("");
      });
    });

    it("clears form inputs upon successful revoke execution", async () => {
      vi.mocked(adminClient.adminRevokeBan).mockResolvedValueOnce({
        success: true,
        banId: "ban-to-clear",
        auditLogId: "audit-clear",
      });

      render(<AdminUsersBans />);

      const banIdInput = screen.getByLabelText(/Ban Record ID/i) as HTMLInputElement;
      const reasonInput = screen.getByLabelText(/Revocation Reason/i) as HTMLInputElement;

      fireEvent.change(banIdInput, { target: { value: "ban-to-clear" } });
      fireEvent.change(reasonInput, { target: { value: "Pardon granted" } });

      fireEvent.click(screen.getByRole("button", { name: /Revoke Ban Record/i }));

      await waitFor(() => {
        expect(banIdInput.value).toBe("");
        expect(reasonInput.value).toBe("");
      });
    });

    it("clears previous errors when a new submission begins", async () => {
      vi.mocked(adminClient.adminBanUser)
        .mockRejectedValueOnce(new Error("Initial failure"))
        .mockResolvedValueOnce({
          success: true,
          banRecord: { id: "ban-success", scope: "FULL_SYSTEM" },
        });

      render(<AdminUsersBans />);

      const userInput = screen.getByLabelText(/Target User ID/i);
      const reasonInput = screen.getByLabelText(/Reason for Ban/i);
      const submitBtn = screen.getByRole("button", { name: /Execute Account Ban/i });

      // First attempt - fails
      fireEvent.change(userInput, { target: { value: "user-1" } });
      fireEvent.change(reasonInput, { target: { value: "Reason 1" } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText("Initial failure")).toBeInTheDocument();
      });

      // Second attempt - succeeds
      fireEvent.change(userInput, { target: { value: "user-2" } });
      fireEvent.change(reasonInput, { target: { value: "Reason 2" } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.queryByText("Initial failure")).not.toBeInTheDocument();
        expect(screen.getByText("Ban Applied Successfully")).toBeInTheDocument();
      });
    });
  });
});
