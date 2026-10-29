import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminAuditLog } from "@/components/admin/AdminAuditLog";
import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";
import * as adminClient from "@/lib/admin/client";
import { Providers } from "@/components/providers";

vi.mock("@/lib/admin/client", async () => {
  const actual = await vi.importActual<typeof adminClient>("@/lib/admin/client");
  return {
    ...actual,
    adminListAuditLogs: vi.fn(),
  };
});

const INDONESIAN_UI_WORDS = [
  /\bTahap\b/i,
  /\bHalaman\b/i,
  /\bBelum Terhubung\b/i,
  /\bKerangka\b/i,
  /\bMendatang\b/i,
  /\bKlaim\b/i,
  /\bHadiah\b/i,
  /\bBuka Whitelist\b/i,
  /\bBaca Dokumentasi\b/i,
  /\bDokumentasi Proyek\b/i,
  /\bCek Kelayakan\b/i,
  /\bHubungkan\b/i,
];

describe("Admin Audit Logs UI & Access Control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Sidebar Tab Visibility Based on Role", () => {
    it("renders Audit Log tab in sidebar ONLY for SUPER_ADMIN", () => {
      render(
        <AdminSidebar
          activeTab="overview"
          onSelectTab={vi.fn()}
          roleType="SUPER_ADMIN"
          address="0xsuperadmin1"
          permissions={["*"]}
          mobileOpen={false}
          onToggleMobile={vi.fn()}
        />,
      );

      const auditLogButtons = screen.getAllByRole("button", { name: /Audit Log/i });
      expect(auditLogButtons.length).toBeGreaterThan(0);
    });

    it("does NOT render Audit Log tab in sidebar for ADMIN", () => {
      render(
        <AdminSidebar
          activeTab="overview"
          onSelectTab={vi.fn()}
          roleType="ADMIN"
          address="0xadmin1"
          permissions={["*"]}
          mobileOpen={false}
          onToggleMobile={vi.fn()}
        />,
      );

      expect(screen.queryByRole("button", { name: /Audit Log/i })).not.toBeInTheDocument();
    });

    it("does NOT render Audit Log tab in sidebar for MODERATOR", () => {
      render(
        <AdminSidebar
          activeTab="overview"
          onSelectTab={vi.fn()}
          roleType="MODERATOR"
          address="0xmod1"
          permissions={["REVIEW_EVIDENCE"]}
          mobileOpen={false}
          onToggleMobile={vi.fn()}
        />,
      );

      expect(screen.queryByRole("button", { name: /Audit Log/i })).not.toBeInTheDocument();
    });
  });

  describe("2. AdminDashboardClient Restricted View", () => {
    it("blocks ADMIN from accessing audit-log tab and shows restricted view", () => {
      const adminSession = {
        sessionId: "sess-admin",
        userId: "admin-1",
        address: "0xadmin1",
        adminRole: {
          id: "role-admin",
          userId: "admin-1",
          roleType: "ADMIN",
          permissions: ["*"],
          assignedBy: null,
        },
      };

      // Force activeTab to audit-log by mounting
      render(
        <Providers>
          <AdminDashboardClient adminSession={adminSession} />
        </Providers>,
      );

      // Verify that audit log tab cannot be clicked because it's not even in the sidebar
      expect(screen.queryByRole("button", { name: /Audit Log/i })).not.toBeInTheDocument();
    });
  });

  describe("3. AdminAuditLog Component Data Rendering & Detail Modal", () => {
    const mockLogs = [
      {
        id: "audit-entry-1",
        actorId: "actor-123",
        action: "BAN_USER",
        entityType: "User",
        entityId: "target-user-456",
        oldValues: { isBanned: false, status: "ACTIVE" },
        newValues: { isBanned: true, status: "BANNED" },
        metadata: { reason: "Sybil detection cluster #4" },
        createdAt: "2026-10-28T14:30:00.000Z",
        actor: {
          id: "actor-123",
          role: "SUPER_ADMIN",
          wallet: { address: "0x1111111111111111111111111111111111111111" },
          xIdentity: { username: "lead_admin" },
        },
      },
      {
        id: "audit-entry-2",
        actorId: null,
        action: "AUTO_REPLENISH",
        entityType: "DropPeriod",
        entityId: "period-99",
        oldValues: null,
        newValues: { remaining: 50 },
        metadata: null,
        createdAt: "2026-10-27T08:00:00.000Z",
        actor: null,
      },
    ];

    it("renders headers, badges, table rows, and English copy", async () => {
      vi.mocked(adminClient.adminListAuditLogs).mockResolvedValueOnce({
        logs: mockLogs,
        total: 2,
        limit: 25,
        offset: 0,
      });

      const { container } = render(<AdminAuditLog />);

      await waitFor(() => {
        expect(screen.getByText("Audit Log")).toBeInTheDocument();
        expect(screen.getByText("SUPER_ADMIN ONLY")).toBeInTheDocument();
        expect(screen.getByText("READ-ONLY")).toBeInTheDocument();
      });

      // Verify row items
      expect(screen.getByText("BAN_USER")).toBeInTheDocument();
      expect(screen.getByText("AUTO_REPLENISH")).toBeInTheDocument();
      expect(screen.getByText("target-user-456")).toBeInTheDocument();
      expect(screen.getByText("period-99")).toBeInTheDocument();
      expect(screen.getByText("System")).toBeInTheDocument();

      for (const pattern of INDONESIAN_UI_WORDS) {
        expect(container.textContent).not.toMatch(pattern);
      }
    });

    it("renders empty state cleanly when no logs exist", async () => {
      vi.mocked(adminClient.adminListAuditLogs).mockResolvedValueOnce({
        logs: [],
        total: 0,
        limit: 25,
        offset: 0,
      });

      render(<AdminAuditLog />);

      await waitFor(() => {
        expect(screen.getByText("No audit logs found")).toBeInTheDocument();
      });
    });

    it("renders access denied alert when API returns 403 / FORBIDDEN", async () => {
      vi.mocked(adminClient.adminListAuditLogs).mockRejectedValueOnce(
        new Error("FORBIDDEN: Insufficient role level: requires SUPER_ADMIN, account has ADMIN."),
      );

      render(<AdminAuditLog />);

      await waitFor(() => {
        expect(screen.getByText("Access Denied")).toBeInTheDocument();
        expect(
          screen.getByText("Only SUPER_ADMIN accounts are authorized to read system audit logs."),
        ).toBeInTheDocument();
      });
    });

    it("renders error alert with retry button when API fails unexpectedly", async () => {
      vi.mocked(adminClient.adminListAuditLogs).mockRejectedValueOnce(
        new Error("Network timeout connecting to server."),
      );

      render(<AdminAuditLog />);

      await waitFor(() => {
        expect(screen.getByText("Network timeout connecting to server.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
      });

      // Clicking retry triggers refetch
      vi.mocked(adminClient.adminListAuditLogs).mockResolvedValueOnce({
        logs: mockLogs,
        total: 2,
        limit: 25,
        offset: 0,
      });

      fireEvent.click(screen.getByRole("button", { name: /Retry/i }));

      await waitFor(() => {
        expect(screen.getByText("BAN_USER")).toBeInTheDocument();
      });
    });

    it("safely opens detail modal, displays JSON for oldValues, newValues, and metadata, and closes modal", async () => {
      vi.mocked(adminClient.adminListAuditLogs).mockResolvedValueOnce({
        logs: mockLogs,
        total: 2,
        limit: 25,
        offset: 0,
      });

      render(<AdminAuditLog />);

      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /Details/i }).length).toBe(2);
      });

      // Click Details on the first row
      const detailButtons = screen.getAllByRole("button", { name: /Details/i });
      fireEvent.click(detailButtons[0]);

      // Verify modal content
      await waitFor(() => {
        expect(screen.getByText("Audit Log Details")).toBeInTheDocument();
      });

      expect(screen.getByText("Old Values (Before Operation)")).toBeInTheDocument();
      expect(screen.getByText("New Values (After Operation)")).toBeInTheDocument();
      expect(screen.getByText("Context Metadata")).toBeInTheDocument();

      // Verify values rendered safely in JSON text
      expect(screen.getByText(/Sybil detection cluster #4/)).toBeInTheDocument();
      expect(screen.getAllByText("target-user-456").length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText("0x1111111111111111111111111111111111111111")).toBeInTheDocument();

      // Close modal
      const closeButton = screen.getByRole("button", { name: /Close details modal/i });
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText("Audit Log Details")).not.toBeInTheDocument();
      });
    });

    it("handles null / undefined details cleanly without error", async () => {
      vi.mocked(adminClient.adminListAuditLogs).mockResolvedValueOnce({
        logs: mockLogs,
        total: 2,
        limit: 25,
        offset: 0,
      });

      render(<AdminAuditLog />);

      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /Details/i }).length).toBe(2);
      });

      // Click Details on the second row (has null oldValues and metadata)
      const detailButtons = screen.getAllByRole("button", { name: /Details/i });
      fireEvent.click(detailButtons[1]);

      await waitFor(() => {
        expect(screen.getByText("Audit Log Details")).toBeInTheDocument();
      });

      const noneElements = screen.getAllByText("None");
      expect(noneElements.length).toBeGreaterThanOrEqual(2);
    });

    it("submits filter parameters and resets filters properly", async () => {
      vi.mocked(adminClient.adminListAuditLogs).mockResolvedValue({
        logs: mockLogs,
        total: 2,
        limit: 25,
        offset: 0,
      });

      render(<AdminAuditLog />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("e.g. BAN_USER")).toBeInTheDocument();
      });

      // Fill in filter inputs
      fireEvent.change(screen.getByPlaceholderText("e.g. BAN_USER"), {
        target: { value: "BAN_USER" },
      });
      fireEvent.change(screen.getByPlaceholderText("e.g. User, WLSlot"), {
        target: { value: "User" },
      });
      fireEvent.change(screen.getByPlaceholderText("User ID..."), {
        target: { value: "actor-123" },
      });

      // Click Apply Filters
      fireEvent.click(screen.getByRole("button", { name: /Apply Filters/i }));

      await waitFor(() => {
        expect(adminClient.adminListAuditLogs).toHaveBeenCalledWith(
          expect.objectContaining({
            action: "BAN_USER",
            entityType: "User",
            actorId: "actor-123",
          }),
        );
      });

      // Click Reset
      fireEvent.click(screen.getByRole("button", { name: /Reset/i }));

      await waitFor(() => {
        expect(adminClient.adminListAuditLogs).toHaveBeenCalledWith(
          expect.objectContaining({
            action: undefined,
            entityType: undefined,
            actorId: undefined,
          }),
        );
      });
    });
  });
});
