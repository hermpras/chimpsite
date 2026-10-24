import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import AdminPage from "@/app/admin/page";
import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import { Providers } from "@/components/providers";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/server/db", () => ({
  prisma: { __mockDb: true },
}));

const mockCheckAdminSession = vi.fn();
vi.mock("@/server/auth/session", () => ({
  checkAdminSession: (...args: unknown[]) => mockCheckAdminSession(...args),
}));

// Mock client api calls to avoid unhandled network requests
vi.mock("@/lib/admin/client", () => ({
  adminListEvidence: vi.fn().mockResolvedValue({ submissions: [], total: 0 }),
  adminReviewEvidence: vi.fn().mockResolvedValue({ success: true }),
  adminListCampaigns: vi.fn().mockResolvedValue({ campaigns: [], total: 0 }),
  adminCreateCampaign: vi.fn().mockResolvedValue({ success: true }),
  adminUpdateCampaign: vi.fn().mockResolvedValue({ success: true }),
  adminListCampaignTasks: vi.fn().mockResolvedValue({ tasks: [] }),
  adminReconcileQueue: vi.fn().mockResolvedValue({
    success: true,
    slotsFilled: 0,
    openSlotsRemaining: 0,
  }),
  adminRevokeSlot: vi.fn().mockResolvedValue({
    success: true,
    slotId: "test-slot",
    auditLogId: "audit-1",
  }),
  adminBanUser: vi.fn().mockResolvedValue({
    success: true,
    banRecord: { id: "ban-1", scope: "FULL_SYSTEM" },
  }),
  adminRevokeBan: vi.fn().mockResolvedValue({
    success: true,
    auditLogId: "audit-2",
  }),
  adminListUsers: vi
    .fn()
    .mockResolvedValue({ users: [], total: 0, limit: 10, offset: 0 }),
  adminListSlots: vi
    .fn()
    .mockResolvedValue({ slots: [], total: 0, limit: 10, offset: 0 }),
  adminListDrops: vi
    .fn()
    .mockResolvedValue({ drops: [], total: 0, limit: 50, offset: 0 }),
  adminListTraits: vi.fn().mockResolvedValue({ traits: [] }),
  adminGetDrop: vi.fn().mockResolvedValue({ drop: null }),
}));

vi.mock("@/lib/drops/client", () => ({
  fetchCurrentDrop: vi.fn().mockResolvedValue({
    active: true,
    drop: {
      id: "drop-1",
      slug: "genesis-traits",
      title: "Genesis Traits Drop",
      status: "ACTIVE",
    },
    period: { id: "period-1", periodIndex: 1, status: "ACTIVE", isStockLocked: false },
    claimWindow: { isActive: true, timeRemainingMs: 3600000 },
    stock: {
      totalAllocated: 100,
      totalRemaining: 75,
      isExhausted: false,
      poolItems: [],
    },
  }),
  emergencyCloseDropWindow: vi.fn().mockResolvedValue({
    success: true,
    auditLogId: "audit-em-1",
  }),
}));

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

describe("Admin Dashboard Route Protection & Access Control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies access with 401 when request is unauthenticated", async () => {
    mockCheckAdminSession.mockResolvedValueOnce({
      ok: false,
      error: "UNAUTHORIZED",
      status: 401,
      message: "Authentication required to access admin resources.",
    });

    const pageElement = await AdminPage();
    const { container } = render(<Providers>{pageElement}</Providers>);

    // Verify 401 Unauthorized UI rendered
    expect(screen.getByText("Admin Authentication Required")).toBeInTheDocument();
    expect(screen.getByText("401 Access Restricted")).toBeInTheDocument();
    expect(
      screen.getByText("Authentication required to access admin resources."),
    ).toBeInTheDocument();

    // Verify admin navigation sidebar is NOT rendered
    expect(screen.queryByText("Overview")).not.toBeInTheDocument();
    expect(screen.queryByText("Evidence Review")).not.toBeInTheDocument();
    expect(screen.queryByText("Campaigns")).not.toBeInTheDocument();

    for (const pattern of INDONESIAN_UI_WORDS) {
      expect(container.textContent).not.toMatch(pattern);
    }
  });

  it("denies access with 403 when authenticated user has no admin role", async () => {
    mockCheckAdminSession.mockResolvedValueOnce({
      ok: false,
      error: "FORBIDDEN",
      status: 403,
      message: "Admin access required. No admin role assigned to this account.",
    });

    const pageElement = await AdminPage();
    const { container } = render(<Providers>{pageElement}</Providers>);

    // Verify 403 Forbidden UI rendered
    expect(
      screen.getByText("Access Forbidden: Insufficient Admin Privileges"),
    ).toBeInTheDocument();
    expect(screen.getByText("403 Access Restricted")).toBeInTheDocument();
    expect(
      screen.getByText("Admin access required. No admin role assigned to this account."),
    ).toBeInTheDocument();
    expect(screen.getByText("Role Verification Failed")).toBeInTheDocument();

    // Verify admin navigation sidebar is NOT rendered
    expect(screen.queryByText("Evidence Review")).not.toBeInTheDocument();
    expect(screen.queryByText("Users & Bans")).not.toBeInTheDocument();

    for (const pattern of INDONESIAN_UI_WORDS) {
      expect(container.textContent).not.toMatch(pattern);
    }
  });

  it("grants access and renders all 6 sidebar menus for authenticated SUPER_ADMIN", async () => {
    mockCheckAdminSession.mockResolvedValueOnce({
      ok: true,
      session: {
        sessionId: "sess-super-1",
        userId: "user-admin-1",
        address: "0x1234567890123456789012345678901234567890",
        adminRole: {
          id: "role-1",
          userId: "user-admin-1",
          roleType: "SUPER_ADMIN",
          permissions: ["*"],
          assignedBy: null,
        },
      },
    });

    const pageElement = await AdminPage();
    const { container } = render(<Providers>{pageElement}</Providers>);

    // Verify main admin dashboard branding
    expect(screen.getAllByText("CHIMP").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ADMIN").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SUPER_ADMIN").length).toBeGreaterThan(0);

    // Verify ALL 6 requested sidebar menu items are present
    expect(screen.getAllByText("Overview").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Evidence Review").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Campaigns").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Whitelist").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Users & Bans").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Drops").length).toBeGreaterThan(0);

    // Verify English copy integrity
    for (const pattern of INDONESIAN_UI_WORDS) {
      expect(container.textContent).not.toMatch(pattern);
    }
  });

  it("switches tabs between menus when clicked in the sidebar", async () => {
    const adminSession = {
      sessionId: "sess-admin-2",
      userId: "user-admin-2",
      address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      adminRole: {
        id: "role-2",
        userId: "user-admin-2",
        roleType: "ADMIN",
        permissions: [
          "REVIEW_EVIDENCE",
          "MANAGE_CAMPAIGNS",
          "MANAGE_WL",
          "MANAGE_BANS",
          "MANAGE_DROPS",
        ],
        assignedBy: "super-admin",
      },
    };

    render(
      <Providers>
        <AdminDashboardClient adminSession={adminSession} />
      </Providers>,
    );

    // Initially on Overview
    expect(screen.getByText("Admin Overview")).toBeInTheDocument();

    // Click "Evidence Review" in desktop sidebar
    const evidenceButtons = screen.getAllByRole("button", {
      name: /Evidence Review/i,
    });
    fireEvent.click(evidenceButtons[0]);
    await waitFor(() => {
      expect(
        screen.getByText(/Moderate quest evidence submissions/i),
      ).toBeInTheDocument();
    });

    // Click "Campaigns"
    const campaignButtons = screen.getAllByRole("button", { name: /Campaigns/i });
    fireEvent.click(campaignButtons[0]);
    await waitFor(() => {
      expect(
        screen.getByText(/Configure quest campaigns, lifecycle states/i),
      ).toBeInTheDocument();
    });

    // Click "Whitelist"
    const wlButtons = screen.getAllByRole("button", { name: /Whitelist/i });
    fireEvent.click(wlButtons[0]);
    await waitFor(() => {
      expect(screen.getByText("Queue Reconciliation")).toBeInTheDocument();
      expect(screen.getAllByText("Revoke Whitelist Slot").length).toBeGreaterThan(0);
    });

    // Click "Users & Bans"
    const bansButtons = screen.getAllByRole("button", { name: /Users & Bans/i });
    fireEvent.click(bansButtons[0]);
    await waitFor(() => {
      expect(screen.getByText("Ban Account")).toBeInTheDocument();
      expect(screen.getByText("Revoke Ban")).toBeInTheDocument();
    });

    // Click "Drops"
    const dropsButtons = screen.getAllByRole("button", { name: /Drops/i });
    fireEvent.click(dropsButtons[0]);
    await waitFor(() => {
      expect(screen.getByText("Emergency Close Drop Window")).toBeInTheDocument();
    });
  });

  it("displays permission restricted notice when role lacks the module grant", () => {
    const moderatorSession = {
      sessionId: "sess-mod-1",
      userId: "user-mod-1",
      address: "0x9876543210987654321098765432109876543210",
      adminRole: {
        id: "role-mod",
        userId: "user-mod-1",
        roleType: "MODERATOR",
        // Only evidence review permission granted, drops and bans are omitted
        permissions: ["REVIEW_EVIDENCE"],
        assignedBy: "admin",
      },
    };

    render(
      <Providers>
        <AdminDashboardClient adminSession={moderatorSession} />
      </Providers>,
    );

    // Click on Drops (requires MANAGE_DROPS)
    const dropsButtons = screen.getAllByRole("button", { name: /Drops/i });
    fireEvent.click(dropsButtons[0]);

    // Expect Permission Required view
    expect(screen.getByText(/Permission Required: MANAGE_DROPS/i)).toBeInTheDocument();
  });
});
