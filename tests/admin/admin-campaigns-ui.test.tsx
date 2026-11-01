import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { AdminCampaigns } from "@/components/admin/AdminCampaigns";
import * as adminClient from "@/lib/admin/client";
import { updateCampaign, VALID_CAMPAIGN_STATUSES } from "@/server/admin/campaign";

// Mock admin client
vi.mock("@/lib/admin/client", () => ({
  adminListCampaigns: vi.fn(),
  adminCreateCampaign: vi.fn(),
  adminUpdateCampaign: vi.fn(),
  adminListCampaignTasks: vi.fn(),
  adminCreateCampaignTask: vi.fn(),
  adminUpdateCampaignTask: vi.fn(),
  adminDeleteCampaignTask: vi.fn(),
  adminCreateCampaignVersion: vi.fn(),
  adminListCampaignVersions: vi.fn().mockResolvedValue({ versions: [], total: 0 }),
  adminListWLPrograms: vi.fn().mockResolvedValue({ programs: [], total: 0 }),
}));

describe("Local Testing - Admin Dashboard Campaigns Menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. DAFTAR CAMPAIGN
  // =========================================================================
  describe("1. Daftar campaign", () => {
    it("memuat data campaign dan menampilkan judul, slug, whitelist program ID, dan status dengan benar", async () => {
      const mockCampaigns = [
        {
          id: "camp-001",
          slug: "season-1-genesis",
          title: "Season 1 Genesis Quest",
          description: "Earn XP and WL access through genesis community quests.",
          wlProgramId: "wl-prog-001",
          status: "ACTIVE" as const,
          createdAt: "2026-10-20T10:00:00.000Z",
          updatedAt: "2026-10-20T10:00:00.000Z",
          currentVersion: {
            id: "ver-001",
            versionNumber: 1,
            isCurrent: true,
            compatibilityMode: "FRESH_START",
            startsAt: "2026-10-20T10:00:00.000Z",
            endsAt: null,
            changeNotes: "Initial launch",
            createdAt: "2026-10-20T10:00:00.000Z",
          },
        },
        {
          id: "camp-002",
          slug: "halloween-drop-2026",
          title: "Halloween Spooktacular",
          description: "Limited time Halloween event quests.",
          wlProgramId: "wl-prog-002",
          status: "DRAFT" as const,
          createdAt: "2026-10-22T08:00:00.000Z",
          updatedAt: "2026-10-22T08:00:00.000Z",
          currentVersion: {
            id: "ver-002",
            versionNumber: 1,
            isCurrent: true,
            compatibilityMode: "FRESH_START",
            startsAt: "2026-10-25T00:00:00.000Z",
            endsAt: "2026-11-01T00:00:00.000Z",
            changeNotes: null,
            createdAt: "2026-10-22T08:00:00.000Z",
          },
        },
      ];

      vi.mocked(adminClient.adminListCampaigns).mockResolvedValueOnce({
        campaigns: mockCampaigns,
        total: 2,
      });

      render(<AdminCampaigns />);

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText("Season 1 Genesis Quest")).toBeInTheDocument();
      });

      expect(screen.getByText("Halloween Spooktacular")).toBeInTheDocument();
      expect(screen.getByText("slug: season-1-genesis")).toBeInTheDocument();
      expect(screen.getByText("slug: halloween-drop-2026")).toBeInTheDocument();
      expect(screen.getByText("wl-prog-001")).toBeInTheDocument();
      expect(screen.getByText("wl-prog-002")).toBeInTheDocument();
      expect(screen.getByText("ACTIVE")).toBeInTheDocument();
      expect(screen.getByText("DRAFT")).toBeInTheDocument();
      expect(screen.getByText("2 Registered")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /New Campaign/i })).not.toBeInTheDocument();
    });

    it("menampilkan empty state jika belum ada campaign yang terdaftar", async () => {
      vi.mocked(adminClient.adminListCampaigns).mockResolvedValueOnce({
        campaigns: [],
        total: 0,
      });

      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("No Campaigns Registered")).toBeInTheDocument();
      });
      expect(screen.getByText("0 Registered")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /New Campaign/i })).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 2. BUAT CAMPAIGN
  // =========================================================================
  describe("2. Buat campaign", () => {
    it("membuka form, memvalidasi input wajib, dan berhasil membuat campaign test", async () => {
      vi.mocked(adminClient.adminListCampaigns).mockResolvedValue({
        campaigns: [],
        total: 0,
      });
      vi.mocked(adminClient.adminCreateCampaign).mockResolvedValueOnce({
        success: true,
        campaign: {
          id: "camp-new",
          slug: "test-quest-campaign",
          title: "Test Quest Campaign",
          description: "A local test campaign",
          wlProgramId: "wl-test-prog",
          status: "DRAFT",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          currentVersion: {
            id: "ver-new",
            versionNumber: 1,
            isCurrent: true,
            compatibilityMode: "FRESH_START",
            startsAt: new Date().toISOString(),
            endsAt: null,
            changeNotes: null,
            createdAt: new Date().toISOString(),
          },
        },
        auditLogId: "audit-test-1",
      });

      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("New Campaign")).toBeInTheDocument();
      });

      // Click "New Campaign" to open form
      fireEvent.click(screen.getByText("New Campaign"));
      expect(screen.getByText("Create New Campaign")).toBeInTheDocument();

      // Fill in form fields
      fireEvent.change(screen.getByLabelText(/Slug/i), {
        target: { value: "test-quest-campaign" },
      });
      fireEvent.change(screen.getByLabelText(/Campaign Title/i), {
        target: { value: "Test Quest Campaign" },
      });
      fireEvent.change(screen.getByLabelText(/Whitelist Program ID/i), {
        target: { value: "wl-test-prog" },
      });
      fireEvent.change(screen.getByLabelText(/Description/i), {
        target: { value: "A local test campaign" },
      });

      // Submit form
      const submitBtn = screen.getByRole("button", { name: /Create Campaign/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(adminClient.adminCreateCampaign).toHaveBeenCalledTimes(1);
      });

      expect(adminClient.adminCreateCampaign).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: "test-quest-campaign",
          title: "Test Quest Campaign",
          description: "A local test campaign",
          wlProgramId: "wl-test-prog",
          initialVersion: expect.objectContaining({
            startsAt: expect.any(String),
          }),
        }),
      );

      // Verify success notification message
      await waitFor(() => {
        expect(
          screen.getByText(/Campaign "Test Quest Campaign" created successfully!/i),
        ).toBeInTheDocument();
      });
    });

    it("memvalidasi field kosong dan menolak submission tanpa slug, title, atau wlProgramId", async () => {
      vi.mocked(adminClient.adminListCampaigns).mockResolvedValue({
        campaigns: [],
        total: 0,
      });

      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("New Campaign")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("New Campaign"));

      // Do not fill inputs and attempt submit by finding form and firing onSubmit
      const form = screen
        .getByRole("button", { name: /Create Campaign/i })
        .closest("form");
      expect(form).toBeInTheDocument();
      fireEvent.submit(form!);

      // adminCreateCampaign should NOT be called
      expect(adminClient.adminCreateCampaign).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 3. PERUBAHAN STATUS
  // =========================================================================
  describe("3. Perubahan status", () => {
    it("status DRAFT dapat di-Activate ke ACTIVE", async () => {
      vi.mocked(adminClient.adminListCampaigns).mockResolvedValue({
        campaigns: [
          {
            id: "camp-draft-1",
            slug: "draft-camp",
            title: "Draft Campaign",
            description: null,
            wlProgramId: "wl-prog",
            status: "DRAFT",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            currentVersion: null,
          },
        ],
        total: 1,
      });
      vi.mocked(adminClient.adminUpdateCampaign).mockResolvedValueOnce({
        success: true,
      });

      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("Activate")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Activate"));

      await waitFor(() => {
        expect(adminClient.adminUpdateCampaign).toHaveBeenCalledWith("camp-draft-1", {
          status: "ACTIVE",
        });
      });
    });

    it("status ACTIVE dapat di-Pause ke PAUSED", async () => {
      vi.mocked(adminClient.adminListCampaigns).mockResolvedValue({
        campaigns: [
          {
            id: "camp-active-1",
            slug: "active-camp",
            title: "Active Campaign",
            description: null,
            wlProgramId: "wl-prog",
            status: "ACTIVE",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            currentVersion: null,
          },
        ],
        total: 1,
      });
      vi.mocked(adminClient.adminUpdateCampaign).mockResolvedValueOnce({
        success: true,
      });

      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("Pause")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Pause"));

      await waitFor(() => {
        expect(adminClient.adminUpdateCampaign).toHaveBeenCalledWith("camp-active-1", {
          status: "PAUSED",
        });
      });
    });

    it("status PAUSED dapat di-Resume ke ACTIVE", async () => {
      vi.mocked(adminClient.adminListCampaigns).mockResolvedValue({
        campaigns: [
          {
            id: "camp-paused-1",
            slug: "paused-camp",
            title: "Paused Campaign",
            description: null,
            wlProgramId: "wl-prog",
            status: "PAUSED",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            currentVersion: null,
          },
        ],
        total: 1,
      });
      vi.mocked(adminClient.adminUpdateCampaign).mockResolvedValueOnce({
        success: true,
      });

      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("Resume")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Resume"));

      await waitFor(() => {
        expect(adminClient.adminUpdateCampaign).toHaveBeenCalledWith("camp-paused-1", {
          status: "ACTIVE",
        });
      });
    });

    it("tombol 'End' mengirimkan status 'ARCHIVED' yang didukung backend dan menampilkan notifikasi sukses", async () => {
      vi.mocked(adminClient.adminListCampaigns).mockResolvedValue({
        campaigns: [
          {
            id: "camp-test-end",
            slug: "test-end-camp",
            title: "Test End Campaign",
            description: null,
            wlProgramId: "wl-prog",
            status: "ACTIVE",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            currentVersion: null,
          },
        ],
        total: 1,
      });

      vi.mocked(adminClient.adminUpdateCampaign).mockResolvedValueOnce({
        success: true,
      });

      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("End")).toBeInTheDocument();
      });

      // Click "End"
      fireEvent.click(screen.getByText("End"));

      // Verify the frontend sends status: "ARCHIVED"
      await waitFor(() => {
        expect(adminClient.adminUpdateCampaign).toHaveBeenCalledWith("camp-test-end", {
          status: "ARCHIVED",
        });
      });

      // Verify success notification
      await waitFor(() => {
        expect(
          screen.getByText("Campaign status updated to ARCHIVED."),
        ).toBeInTheDocument();
      });
    });

    it("menampilkan notifikasi error jika pembaruan status gagal", async () => {
      vi.mocked(adminClient.adminListCampaigns).mockResolvedValue({
        campaigns: [
          {
            id: "camp-fail",
            slug: "fail-camp",
            title: "Fail Campaign",
            description: null,
            wlProgramId: "wl-prog",
            status: "ACTIVE",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            currentVersion: null,
          },
        ],
        total: 1,
      });

      vi.mocked(adminClient.adminUpdateCampaign).mockRejectedValueOnce(
        new Error("Network connection error"),
      );

      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("End")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("End"));

      await waitFor(() => {
        expect(screen.getByText("Network connection error")).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 4. DAFTAR TASKS
  // =========================================================================
  describe("4. Daftar tasks", () => {
    it("menampilkan task pada versi campaign yang dipilih ketika tombol Tasks diklik", async () => {
      vi.mocked(adminClient.adminListCampaigns).mockResolvedValue({
        campaigns: [
          {
            id: "camp-tasks-1",
            slug: "quest-s1",
            title: "Quest Season 1",
            description: "Complete tasks to earn points",
            wlProgramId: "wl-prog",
            status: "ACTIVE",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            currentVersion: {
              id: "ver-100",
              versionNumber: 1,
              isCurrent: true,
              compatibilityMode: "FRESH_START",
              startsAt: new Date().toISOString(),
              endsAt: null,
              changeNotes: null,
              createdAt: new Date().toISOString(),
            },
          },
        ],
        total: 1,
      });

      vi.mocked(adminClient.adminListCampaignTasks).mockResolvedValueOnce({
        tasks: [
          {
            id: "task-01",
            versionId: "ver-100",
            taskCode: "FOLLOW_X_CHIMP",
            title: "Follow @ChimpHood on X",
            description: "Follow the official X profile",
            taskType: "SOCIAL_X_FOLLOW",
            points: 25,
            isRequired: true,
            sortOrder: 1,
            isActive: true,
          },
          {
            id: "task-02",
            versionId: "ver-100",
            taskCode: "REPOST_ANNOUNCEMENT",
            title: "Repost Announcement",
            description: "Repost the pinned announcement tweet",
            taskType: "SOCIAL_X_REPOST",
            points: 15,
            isRequired: false,
            sortOrder: 2,
            isActive: true,
          },
        ],
        total: 2,
      });

      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("Tasks")).toBeInTheDocument();
      });

      // Click "Tasks" to expand
      fireEvent.click(screen.getByText("Tasks"));

      // Verify listCampaignTasks called with campaign id and version number
      await waitFor(() => {
        expect(adminClient.adminListCampaignTasks).toHaveBeenCalledWith(
          "camp-tasks-1",
          1,
        );
      });

      // Verify tasks are rendered
      await waitFor(() => {
        expect(screen.getByText("Follow @ChimpHood on X")).toBeInTheDocument();
        expect(screen.getByText("Repost Announcement")).toBeInTheDocument();
      });

      expect(screen.getByText("25 pts")).toBeInTheDocument();
      expect(screen.getByText("15 pts")).toBeInTheDocument();
      expect(screen.getByText("code: FOLLOW_X_CHIMP")).toBeInTheDocument();
      expect(screen.getByText("code: REPOST_ANNOUNCEMENT")).toBeInTheDocument();
      expect(screen.getByText("type: SOCIAL_X_FOLLOW")).toBeInTheDocument();
      expect(screen.getByText("type: SOCIAL_X_REPOST")).toBeInTheDocument();
      expect(screen.getByText("Version 1 Task Specifications")).toBeInTheDocument();
      expect(screen.getByText("2 tasks")).toBeInTheDocument();
    });

    it("menampilkan pesan 'No tasks configured in this version.' jika belum ada task", async () => {
      vi.mocked(adminClient.adminListCampaigns).mockResolvedValue({
        campaigns: [
          {
            id: "camp-empty-tasks",
            slug: "quest-empty",
            title: "Empty Quest",
            description: null,
            wlProgramId: "wl-prog",
            status: "DRAFT",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            currentVersion: {
              id: "ver-empty",
              versionNumber: 1,
              isCurrent: true,
              compatibilityMode: "FRESH_START",
              startsAt: new Date().toISOString(),
              endsAt: null,
              changeNotes: null,
              createdAt: new Date().toISOString(),
            },
          },
        ],
        total: 1,
      });

      vi.mocked(adminClient.adminListCampaignTasks).mockResolvedValueOnce({
        tasks: [],
        total: 0,
      });

      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("Tasks")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Tasks"));

      await waitFor(() => {
        expect(
          screen.getByText("No tasks configured in this version."),
        ).toBeInTheDocument();
      });
      expect(screen.getByText("0 tasks")).toBeInTheDocument();
    });

    it("memungkinkan admin membaca daftar task dari campaign yang sudah berstatus ARCHIVED", async () => {
      vi.mocked(adminClient.adminListCampaigns).mockResolvedValue({
        campaigns: [
          {
            id: "camp-archived",
            slug: "archived-quest",
            title: "Archived Quest Season",
            description: "Past season campaign",
            wlProgramId: "wl-prog-old",
            status: "ARCHIVED",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            currentVersion: {
              id: "ver-archived",
              versionNumber: 2,
              isCurrent: true,
              compatibilityMode: "FRESH_START",
              startsAt: new Date().toISOString(),
              endsAt: null,
              changeNotes: null,
              createdAt: new Date().toISOString(),
            },
          },
        ],
        total: 1,
      });

      vi.mocked(adminClient.adminListCampaignTasks).mockResolvedValueOnce({
        tasks: [
          {
            id: "task-archived-1",
            versionId: "ver-archived",
            taskCode: "LEGACY_TASK",
            title: "Legacy Historical Task",
            description: "Task from completed campaign",
            taskType: "CUSTOM",
            points: 50,
            isRequired: false,
            sortOrder: 1,
            isActive: true,
          },
        ],
        total: 1,
      });

      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("Archived Quest Season")).toBeInTheDocument();
        expect(screen.getByText("ARCHIVED")).toBeInTheDocument();
      });

      // Click "Tasks" to expand
      fireEvent.click(screen.getByText("Tasks"));

      // Verify listCampaignTasks was invoked with campaign ID and version number
      await waitFor(() => {
        expect(adminClient.adminListCampaignTasks).toHaveBeenCalledWith(
          "camp-archived",
          2,
        );
      });

      // Verify the legacy task is rendered in the UI
      await waitFor(() => {
        expect(screen.getByText("Legacy Historical Task")).toBeInTheDocument();
        expect(screen.getByText("50 pts")).toBeInTheDocument();
        expect(screen.getByText("code: LEGACY_TASK")).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 5. Single Main Campaign Navigation & Detail Tabs (Phase 2 Tahap 1)
  // =========================================================================
  describe("5. Single Main Campaign Navigation & Detail Tabs (Phase 2 Tahap 1)", () => {
    const singleMainCampaign = {
      id: "camp-main-001",
      slug: "genesis-wl-campaign",
      title: "ChimpHood Main Whitelist Campaign",
      description: "Official promotional whitelist qualification campaign.",
      wlProgramId: "wl-genesis-prog",
      status: "ACTIVE" as const,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
      currentVersion: {
        id: "ver-main-1",
        versionNumber: 1,
        isCurrent: true,
        compatibilityMode: "LEGACY_CARRIED",
        startsAt: "2026-11-01T00:00:00.000Z",
        endsAt: null,
        changeNotes: "Genesis version launch",
        createdAt: "2026-11-01T00:00:00.000Z",
      },
    };

    const mockTasks = [
      {
        id: "task-001",
        versionId: "ver-main-1",
        taskCode: "FOLLOW_X_CHIMP",
        title: "Follow @ChimpHood",
        description: "Official Twitter account",
        taskType: "SOCIAL_X_FOLLOW",
        points: 20,
        isRequired: true,
        sortOrder: 1,
        isActive: true,
      },
    ];

    beforeEach(() => {
      vi.mocked(adminClient.adminListCampaigns).mockResolvedValue({
        campaigns: [singleMainCampaign],
        total: 1,
      });
      vi.mocked(adminClient.adminListCampaignTasks).mockResolvedValue({
        tasks: mockTasks,
        total: 1,
      });
      vi.mocked(adminClient.adminListCampaignVersions).mockResolvedValue({
        versions: [
          {
            id: "ver-main-1",
            campaignId: "camp-main-001",
            versionNumber: 1,
            isCurrent: true,
            compatibilityMode: "LEGACY_CARRIED",
            compatibleFromVersionId: null,
            startsAt: "2026-11-01T00:00:00.000Z",
            endsAt: null,
            changeNotes: "Genesis version launch",
            createdAt: "2026-11-01T00:00:00.000Z",
            taskCount: 1,
            tasks: mockTasks as any,
          },
        ] as any,
        total: 1,
      });
    });

    it("menampilkan Campaign Utama di Overview dengan badge 'Main Campaign' dan tombol 'Manage Campaign'", async () => {
      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(
          screen.getByText("ChimpHood Main Whitelist Campaign"),
        ).toBeInTheDocument();
      });

      expect(screen.getByText("Main Campaign")).toBeInTheDocument();
      expect(screen.getByText("Manage Campaign")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /New Campaign/i })).not.toBeInTheDocument();
    });

    it("dapat berpindah dari Overview ke Detail saat tombol 'Manage Campaign' diklik", async () => {
      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("Manage Campaign")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Manage Campaign"));

      await waitFor(() => {
        expect(screen.getByText("Back to Overview")).toBeInTheDocument();
      });

      // Default active tab in Detail is Tasks
      expect(screen.getByRole("tab", { name: /Tasks/i })).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: /Version History/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Settings/i })).toBeInTheDocument();
    });

    it("dapat menavigasi tab Tasks, Version History, dan Settings di Detail view", async () => {
      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("Manage Campaign")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Manage Campaign"));

      await waitFor(() => {
        expect(screen.getByText("Back to Overview")).toBeInTheDocument();
      });

      // 1. Tasks Tab (default active tab)
      expect(
        screen.getByText("Version 1 Task Specifications"),
      ).toBeInTheDocument();

      // 2. Click "Version History" Tab
      fireEvent.click(screen.getByRole("tab", { name: /Version History/i }));
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Version History" })).toBeInTheDocument();
        expect(screen.getByText(/Genesis version launch/i)).toBeInTheDocument();
      });

      // 3. Click "Settings" Tab
      fireEvent.click(screen.getByRole("tab", { name: /Settings/i }));
      await waitFor(() => {
        expect(screen.getByText("Associated WL Program ID")).toBeInTheDocument();
        expect(screen.getAllByText("wl-genesis-prog").length).toBeGreaterThanOrEqual(1);
      });

      // 4. Return to "Tasks" Tab
      fireEvent.click(screen.getByRole("tab", { name: /Tasks/i }));
      await waitFor(() => {
        expect(
          screen.getByText("Version 1 Task Specifications"),
        ).toBeInTheDocument();
      });
    });

    it("dapat kembali dari Detail ke Overview menggunakan tombol 'Back to Overview'", async () => {
      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("Manage Campaign")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Manage Campaign"));

      await waitFor(() => {
        expect(screen.getByText("Back to Overview")).toBeInTheDocument();
      });

      // Click "Back to Overview"
      fireEvent.click(screen.getByText("Back to Overview"));

      // Verify we are back in Overview mode
      await waitFor(() => {
        expect(screen.getByText("Manage Campaign")).toBeInTheDocument();
      });
      expect(screen.queryByText("Back to Overview")).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // 6. Interactive Task Management (Phase 2 Tahap 2)
  // =========================================================================
  describe("6. Interactive Task Management (Phase 2 Tahap 2)", () => {
    const singleMainCampaign = {
      id: "camp-main-001",
      slug: "genesis-wl-campaign",
      title: "ChimpHood Main Whitelist Campaign",
      description: "Official promotional whitelist qualification campaign.",
      wlProgramId: "wl-genesis-prog",
      status: "ACTIVE" as const,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
      currentVersion: {
        id: "ver-main-1",
        versionNumber: 1,
        isCurrent: true,
        compatibilityMode: "LEGACY_CARRIED",
        startsAt: "2026-11-01T00:00:00.000Z",
        endsAt: null,
        changeNotes: "Genesis version launch",
        createdAt: "2026-11-01T00:00:00.000Z",
      },
    };

    const initialTasks = [
      {
        id: "task-001",
        versionId: "ver-main-1",
        taskCode: "FOLLOW_X_CHIMP",
        title: "Follow @ChimpHood on X",
        description: "Official profile follow",
        taskType: "SOCIAL_X_FOLLOW",
        points: 20,
        isRequired: true,
        sortOrder: 1,
        requirementMetadata: { tweetUrl: "https://x.com/ChimpHood/status/10001" },
      },
      {
        id: "task-002",
        versionId: "ver-main-1",
        taskCode: "OPTIONAL_DISCORD_JOIN",
        title: "Join Discord Community",
        description: "Bonus quest",
        taskType: "CUSTOM",
        points: 10,
        isRequired: false,
        sortOrder: 2,
        requirementMetadata: null,
      },
    ];

    beforeEach(() => {
      vi.mocked(adminClient.adminListCampaigns).mockResolvedValue({
        campaigns: [singleMainCampaign],
        total: 1,
      });
      vi.mocked(adminClient.adminListCampaignTasks).mockResolvedValue({
        tasks: [...initialTasks],
        total: 2,
      });
    });

    it("menampilkan task cards dengan badge Required/Optional, Points, dan Target URL X", async () => {
      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("Manage Campaign")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Manage Campaign"));

      await waitFor(() => {
        expect(screen.getByText("Follow @ChimpHood on X")).toBeInTheDocument();
      });

      expect(screen.getByText("Required for WL")).toBeInTheDocument();
      expect(screen.getByText("Optional")).toBeInTheDocument();
      expect(screen.getByText("20 pts")).toBeInTheDocument();
      expect(screen.getByText("10 pts")).toBeInTheDocument();
      expect(screen.getByText("code: FOLLOW_X_CHIMP")).toBeInTheDocument();
      expect(screen.getByText("type: SOCIAL_X_FOLLOW")).toBeInTheDocument();
      expect(
        screen.getByText(/Target: https:\/\/x\.com\/ChimpHood\/status\/10001/i),
      ).toBeInTheDocument();
    });

    it("dapat menambah task baru melalui modal Add Task", async () => {
      vi.mocked(adminClient.adminCreateCampaignTask).mockResolvedValueOnce({
        success: true,
        task: {
          id: "task-new",
          versionId: "ver-main-1",
          taskCode: "LIKE_REPOST_QUEST",
          title: "Like & Repost Post",
          description: "New promotional task",
          taskType: "SOCIAL_X_REPOST",
          points: 15,
          isRequired: true,
          sortOrder: 3,
        },
        auditLogId: "audit-task-1",
      });

      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("Manage Campaign")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Manage Campaign"));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Add Task/i })).toBeInTheDocument();
      });

      // Open Add Task Modal
      fireEvent.click(screen.getByRole("button", { name: /Add Task/i }));
      expect(screen.getByText("Add Task (Version 1)")).toBeInTheDocument();

      // Fill in fields
      fireEvent.change(screen.getByLabelText(/Task Code/i), {
        target: { value: "LIKE_REPOST_QUEST" },
      });
      fireEvent.change(screen.getByLabelText(/Task Title/i), {
        target: { value: "Like & Repost Post" },
      });
      fireEvent.change(screen.getByLabelText(/Task Type/i), {
        target: { value: "SOCIAL_X_REPOST" },
      });
      fireEvent.change(screen.getByLabelText(/Points/i), {
        target: { value: "15" },
      });
      fireEvent.change(screen.getByLabelText(/Target X Post URL/i), {
        target: { value: "https://x.com/ChimpHood/status/20002" },
      });

      // Submit
      fireEvent.click(screen.getByRole("button", { name: "Create Task" }));

      await waitFor(() => {
        expect(adminClient.adminCreateCampaignTask).toHaveBeenCalledWith(
          "camp-main-001",
          1,
          expect.objectContaining({
            taskCode: "LIKE_REPOST_QUEST",
            title: "Like & Repost Post",
            taskType: "SOCIAL_X_REPOST",
            points: 15,
            isRequired: true,
            requirementMetadata: { tweetUrl: "https://x.com/ChimpHood/status/20002" },
          }),
        );
      });

      await waitFor(() => {
        expect(
          screen.getByText(/Task "Like & Repost Post" created successfully!/i),
        ).toBeInTheDocument();
      });
    });

    it("menampilkan taskCode dan taskType sebagai read-only pada modal Edit Task", async () => {
      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("Manage Campaign")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Manage Campaign"));

      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /Edit/i })[0]).toBeInTheDocument();
      });

      // Open Edit modal for first task
      fireEvent.click(screen.getAllByRole("button", { name: /Edit/i })[0]);

      await waitFor(() => {
        expect(screen.getByText("Edit Task: Follow @ChimpHood on X")).toBeInTheDocument();
      });

      // Task Code and Task Type should be rendered as read-only labels/divs, NOT inputs
      expect(screen.getByText("FOLLOW_X_CHIMP")).toBeInTheDocument();
      expect(screen.getByText("Permanent identifier (immutable).")).toBeInTheDocument();
      expect(screen.getByText("SOCIAL_X_FOLLOW")).toBeInTheDocument();
      expect(screen.getByText("Type fixed upon creation.")).toBeInTheDocument();

      // Editable inputs
      expect(screen.getByLabelText(/Task Title/i)).toHaveValue("Follow @ChimpHood on X");
    });

    it("dapat mengedit task minor (tanpa ganti URL X) melalui adminUpdateCampaignTask tanpa membuat versi baru", async () => {
      vi.mocked(adminClient.adminUpdateCampaignTask).mockResolvedValueOnce({
        success: true,
        task: {
          ...initialTasks[0],
          title: "Follow @ChimpHood Officially",
          points: 25,
        },
        auditLogId: "audit-edit-1",
      });

      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("Manage Campaign")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Manage Campaign"));

      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /Edit/i })[0]).toBeInTheDocument();
      });

      // Click Edit
      fireEvent.click(screen.getAllByRole("button", { name: /Edit/i })[0]);

      // Change title & points only (URL unchanged)
      fireEvent.change(screen.getByLabelText(/Task Title/i), {
        target: { value: "Follow @ChimpHood Officially" },
      });
      fireEvent.change(screen.getByLabelText(/Points/i), {
        target: { value: "25" },
      });

      // Submit
      fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

      await waitFor(() => {
        expect(adminClient.adminUpdateCampaignTask).toHaveBeenCalledWith(
          "camp-main-001",
          1,
          expect.objectContaining({
            taskId: "task-001",
            title: "Follow @ChimpHood Officially",
            points: 25,
          }),
        );
      });

      // adminCreateCampaignVersion should NOT have been called
      expect(adminClient.adminCreateCampaignVersion).not.toHaveBeenCalled();

      await waitFor(() => {
        expect(
          screen.getByText(/Task "Follow @ChimpHood Officially" updated successfully!/i),
        ).toBeInTheDocument();
      });
    });

    it("mengubah URL X pada task wajib memicu penerbitan CampaignVersion baru via adminCreateCampaignVersion", async () => {
      vi.mocked(adminClient.adminCreateCampaignVersion).mockResolvedValueOnce({
        success: true,
        version: {
          id: "ver-main-2",
          campaignId: "camp-main-001",
          versionNumber: 2,
          isCurrent: true,
          compatibilityMode: "LEGACY_CARRIED",
          compatibleFromVersionId: "ver-main-1",
          startsAt: new Date().toISOString(),
          endsAt: null,
          changeNotes: "Updated target URL for mandatory task FOLLOW_X_CHIMP",
          createdAt: new Date().toISOString(),
          taskCount: 2,
          tasks: [
            {
              ...initialTasks[0],
              requirementMetadata: { tweetUrl: "https://x.com/ChimpHood/status/99999" },
            },
            initialTasks[1],
          ],
        },
        auditLogId: "audit-ver-2",
      });

      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("Manage Campaign")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Manage Campaign"));

      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /Edit/i })[0]).toBeInTheDocument();
      });

      // Open Edit modal
      fireEvent.click(screen.getAllByRole("button", { name: /Edit/i })[0]);

      // Change target tweetUrl on mandatory task
      fireEvent.change(screen.getByLabelText(/Target X Post URL/i), {
        target: { value: "https://x.com/ChimpHood/status/99999" },
      });

      // Verify dynamic alert is shown
      expect(
        screen.getByText(/Automatic Campaign Version Bump/i),
      ).toBeInTheDocument();

      // Submit via "Publish Version Update"
      fireEvent.click(
        screen.getByRole("button", { name: "Publish Version Update" }),
      );

      await waitFor(() => {
        expect(adminClient.adminCreateCampaignVersion).toHaveBeenCalledWith(
          "camp-main-001",
          expect.objectContaining({
            compatibilityMode: "LEGACY_CARRIED",
            taskUpdates: [
              expect.objectContaining({
                taskCode: "FOLLOW_X_CHIMP",
                requirementMetadata: {
                  tweetUrl: "https://x.com/ChimpHood/status/99999",
                },
              }),
            ],
          }),
        );
      });

      await waitFor(() => {
        expect(
          screen.getByText(
            /Published new Campaign Version v2 with updated task! Approved progress carry-over preserved./i,
          ),
        ).toBeInTheDocument();
      });
    });

    it("dapat menghapus task dengan dialog konfirmasi", async () => {
      vi.mocked(adminClient.adminDeleteCampaignTask).mockResolvedValueOnce({
        success: true,
        deletedTaskId: "task-002",
        auditLogId: "audit-del-1",
      });

      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("Manage Campaign")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Manage Campaign"));

      await waitFor(() => {
        expect(screen.getAllByRole("button", { name: /Delete/i })[1]).toBeInTheDocument();
      });

      // Click Delete on second task (Join Discord Community)
      fireEvent.click(screen.getAllByRole("button", { name: /Delete/i })[1]);

      // Confirmation dialog should appear
      await waitFor(() => {
        expect(screen.getByText("Delete Task Confirmation")).toBeInTheDocument();
        expect(
          screen.getByText(/Are you sure you want to delete task "Join Discord Community"/i),
        ).toBeInTheDocument();
      });

      // Confirm deletion
      const confirmDeleteBtn = screen.getByRole("button", {
        name: "Delete Task",
      });
      fireEvent.click(confirmDeleteBtn);

      await waitFor(() => {
        expect(adminClient.adminDeleteCampaignTask).toHaveBeenCalledWith(
          "camp-main-001",
          1,
          "task-002",
        );
      });

      await waitFor(() => {
        expect(
          screen.getByText(/Task "Join Discord Community" has been deleted./i),
        ).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 7. VERSION HISTORY & TASK SNAPSHOTS (Phase 2 Tahap 3)
  // =========================================================================
  describe("7. Version History & Task Snapshots (Phase 2 Tahap 3)", () => {
    const mockMainCampaignWithV2 = {
      id: "camp-main-001",
      slug: "chimphood-wl-genesis",
      title: "ChimpHood Whitelist Genesis Campaign",
      description: "Official single main campaign for ChimpHood Whitelist access.",
      wlProgramId: "wl-genesis-prog",
      status: "ACTIVE" as const,
      createdAt: "2026-10-20T10:00:00.000Z",
      updatedAt: "2026-10-28T12:00:00.000Z",
      currentVersion: {
        id: "ver-002",
        versionNumber: 2,
        isCurrent: true,
        compatibilityMode: "LEGACY_CARRIED",
        startsAt: "2026-10-25T00:00:00.000Z",
        endsAt: null,
        changeNotes: "Bumped to v2: Updated target X announcement post",
        createdAt: "2026-10-25T00:00:00.000Z",
      },
    };

    const mockVersionsList = [
      {
        id: "ver-002",
        campaignId: "camp-main-001",
        versionNumber: 2,
        isCurrent: true,
        compatibilityMode: "LEGACY_CARRIED",
        compatibleFromVersionId: "ver-001",
        startsAt: "2026-10-25T00:00:00.000Z",
        endsAt: null,
        changeNotes: "Bumped to v2: Updated target X announcement post",
        createdAt: "2026-10-25T00:00:00.000Z",
        taskCount: 2,
        tasks: [
          {
            id: "task-v2-1",
            versionId: "ver-002",
            taskCode: "FOLLOW_X_CHIMP",
            title: "Follow @ChimpHood on X",
            description: "Follow the official account on X",
            taskType: "FOLLOW_X",
            points: 100,
            isRequired: true,
            sortOrder: 1,
            requirementMetadata: { tweetUrl: "https://x.com/ChimpHood/status/99999" },
            createdAt: "2026-10-25T00:00:00.000Z",
            updatedAt: "2026-10-25T00:00:00.000Z",
          },
          {
            id: "task-v2-2",
            versionId: "ver-002",
            taskCode: "RETWEET_X_CHIMP",
            title: "Retweet Announcement v2",
            description: "Retweet our latest announcement tweet",
            taskType: "REPOST_X",
            points: 150,
            isRequired: true,
            sortOrder: 2,
            requirementMetadata: { tweetUrl: "https://x.com/ChimpHood/status/99999" },
            createdAt: "2026-10-25T00:00:00.000Z",
            updatedAt: "2026-10-25T00:00:00.000Z",
          },
        ],
      },
      {
        id: "ver-001",
        campaignId: "camp-main-001",
        versionNumber: 1,
        isCurrent: false,
        compatibilityMode: "FRESH_START",
        compatibleFromVersionId: null,
        startsAt: "2026-10-20T10:00:00.000Z",
        endsAt: "2026-10-25T00:00:00.000Z",
        changeNotes: "Initial genesis campaign launch",
        createdAt: "2026-10-20T10:00:00.000Z",
        taskCount: 1,
        tasks: [
          {
            id: "task-v1-1",
            versionId: "ver-001",
            taskCode: "FOLLOW_X_CHIMP",
            title: "Follow @ChimpHood on X (v1)",
            description: "Old follow task instruction",
            taskType: "FOLLOW_X",
            points: 100,
            isRequired: true,
            sortOrder: 1,
            requirementMetadata: { tweetUrl: "https://x.com/ChimpHood/status/11111" },
            createdAt: "2026-10-20T10:00:00.000Z",
            updatedAt: "2026-10-20T10:00:00.000Z",
          },
        ],
      },
    ];

    beforeEach(() => {
      vi.mocked(adminClient.adminListCampaigns).mockResolvedValue({
        campaigns: [mockMainCampaignWithV2],
        total: 1,
      });

      vi.mocked(adminClient.adminListCampaignTasks).mockResolvedValue({
        tasks: mockVersionsList[0].tasks as any,
        total: 2,
        version: mockMainCampaignWithV2.currentVersion,
      });

      vi.mocked(adminClient.adminListCampaignVersions).mockResolvedValue({
        versions: mockVersionsList as any,
        total: 2,
      });
    });

    it("berpindah ke tab Version History memuat daftar versi secara descending dan menampilkan badge Current", async () => {
      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("Manage Campaign")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Manage Campaign"));

      // Click on Version History tab
      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /Version History/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("tab", { name: /Version History/i }));

      // API should be called
      await waitFor(() => {
        expect(adminClient.adminListCampaignVersions).toHaveBeenCalledWith("camp-main-001");
      });

      // Verify versions displayed
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Version History" })).toBeInTheDocument();
        expect(screen.getByText("Version 2")).toBeInTheDocument();
        expect(screen.getByText("Version 1")).toBeInTheDocument();
      });

      // Verify notes & badges
      expect(screen.getByText("Bumped to v2: Updated target X announcement post")).toBeInTheDocument();
      expect(screen.getByText("Initial genesis campaign launch")).toBeInTheDocument();
      expect(screen.getAllByText("2 tasks").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("1 tasks").length).toBeGreaterThanOrEqual(1);

      // Current badge check
      const currentBadges = screen.getAllByText("Current");
      expect(currentBadges.length).toBeGreaterThanOrEqual(1);
    });

    it("memilih versi lama menampilkan snapshot task versi tersebut secara read-only tanpa tombol edit atau delete", async () => {
      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("Manage Campaign")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Manage Campaign"));

      fireEvent.click(screen.getByRole("tab", { name: /Version History/i }));

      await waitFor(() => {
        expect(screen.getByText("Version 1")).toBeInTheDocument();
      });

      // Click "View Snapshot" on Version 1 (v2 is selected by default and shows "Viewing", v1 shows "View Snapshot")
      const viewSnapshotBtn = screen.getByRole("button", { name: /View Snapshot/i });
      fireEvent.click(viewSnapshotBtn);

      // Verify Version 1 snapshot inspector is displayed
      await waitFor(() => {
        expect(
          screen.getByText("Version 1 Task Snapshot"),
        ).toBeInTheDocument();
        expect(
          screen.getByText("Read-Only Snapshot"),
        ).toBeInTheDocument();
        expect(
          screen.getByText(/This historical version is read-only/i),
        ).toBeInTheDocument();
      });

      // Verify task details in snapshot
      expect(screen.getByText("Follow @ChimpHood on X (v1)")).toBeInTheDocument();
      expect(screen.getByText("Old follow task instruction")).toBeInTheDocument();
      expect(screen.getByText("code: FOLLOW_X_CHIMP")).toBeInTheDocument();
      expect(screen.getByText("type: FOLLOW_X")).toBeInTheDocument();
      expect(screen.getByText("Target: https://x.com/ChimpHood/status/11111")).toBeInTheDocument();

      // CRITICAL: Ensure NO Edit or Delete buttons exist in historical snapshot
      expect(screen.queryByRole("button", { name: /^Edit/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Delete/i })).not.toBeInTheDocument();
    });

    it("dapat me-refresh version history saat terjadi kegagalan dan menampilkan pesan error", async () => {
      vi.mocked(adminClient.adminListCampaignVersions).mockRejectedValueOnce(
        new Error("Network timeout fetching versions"),
      );

      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("Manage Campaign")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Manage Campaign"));

      fireEvent.click(screen.getByRole("tab", { name: /Version History/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/Network timeout fetching versions/i),
        ).toBeInTheDocument();
      });

      // Click Retry
      vi.mocked(adminClient.adminListCampaignVersions).mockResolvedValueOnce({
        versions: mockVersionsList as any,
        total: 2,
      });

      fireEvent.click(screen.getByRole("button", { name: /Retry/i }));

      await waitFor(() => {
        expect(screen.getByText("Version 2")).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 8. CAMPAIGN SETTINGS UI (Phase 2 Tahap 4)
  // =========================================================================
  describe("8. Campaign Settings UI (Phase 2 Tahap 4)", () => {
    const mockMainCampaign = {
      id: "camp-main-settings-1",
      slug: "chimphood-wl-season-1",
      title: "ChimpHood Main Whitelist Season 1",
      description: "Official promotional whitelist quest for genesis chimpanzees.",
      wlProgramId: "wl-genesis-prog",
      status: "ACTIVE" as const,
      createdAt: "2026-10-20T10:00:00.000Z",
      updatedAt: "2026-10-28T12:00:00.000Z",
      currentVersion: {
        id: "ver-settings-1",
        versionNumber: 1,
        isCurrent: true,
        compatibilityMode: "FRESH_START",
        startsAt: "2026-10-20T10:00:00.000Z",
        endsAt: null,
        changeNotes: "Genesis version launch",
        createdAt: "2026-10-20T10:00:00.000Z",
      },
    };

    beforeEach(() => {
      vi.mocked(adminClient.adminListCampaigns).mockResolvedValue({
        campaigns: [mockMainCampaign],
        total: 1,
      });

      vi.mocked(adminClient.adminListCampaignTasks).mockResolvedValue({
        tasks: [],
        total: 0,
      });

      vi.mocked(adminClient.adminListCampaignVersions).mockResolvedValue({
        versions: [],
        total: 0,
      });
    });

    it("menampilkan form settings dengan nilai awal, status badge, dan field Slug serta WL Program ID sebagai read-only", async () => {
      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("Manage Campaign")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Manage Campaign"));

      // Click on Settings tab
      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /Settings/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("tab", { name: /Settings/i }));

      // Header and badge verification
      await waitFor(() => {
        expect(screen.getByText("Edit Campaign Information")).toBeInTheDocument();
      });
      expect(screen.getByText("Status: ACTIVE")).toBeInTheDocument();
      expect(screen.getByText("Current Version: v1")).toBeInTheDocument();

      // Editable fields have initial values
      const titleInput = screen.getByLabelText(/Campaign Title/i) as HTMLInputElement;
      expect(titleInput.value).toBe("ChimpHood Main Whitelist Season 1");

      const descInput = screen.getByLabelText(/Description/i) as HTMLTextAreaElement;
      expect(descInput.value).toBe(
        "Official promotional whitelist quest for genesis chimpanzees.",
      );

      // Slug is strictly read-only and disabled
      const slugInput = screen.getByLabelText(/URL Slug/i) as HTMLInputElement;
      expect(slugInput.value).toBe("chimphood-wl-season-1");
      expect(slugInput).toHaveAttribute("readOnly");
      expect(slugInput).toBeDisabled();

      // WL Program ID is strictly read-only and disabled
      const wlProgInput = screen.getByLabelText(/Associated WL Program ID/i) as HTMLInputElement;
      expect(wlProgInput.value).toBe("wl-genesis-prog");
      expect(wlProgInput).toHaveAttribute("readOnly");
      expect(wlProgInput).toBeDisabled();

      // Save Changes button is initially disabled because form is pristine (not dirty)
      const saveBtn = screen.getByRole("button", { name: "Save Changes" });
      expect(saveBtn).toBeDisabled();
    });

    it("dapat mengedit Campaign Title dan Description berhasil tanpa membuat CampaignVersion baru", async () => {
      vi.mocked(adminClient.adminUpdateCampaign).mockResolvedValueOnce({
        campaign: {
          ...mockMainCampaign,
          title: "ChimpHood Whitelist Season 1 (Extended)",
          description: "Updated quest description with additional community rewards.",
        } as any,
        auditLogId: "audit-sett-1",
      });

      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("Manage Campaign")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Manage Campaign"));

      fireEvent.click(screen.getByRole("tab", { name: /Settings/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/Campaign Title/i)).toBeInTheDocument();
      });

      // Change Title and Description
      fireEvent.change(screen.getByLabelText(/Campaign Title/i), {
        target: { value: "ChimpHood Whitelist Season 1 (Extended)" },
      });
      fireEvent.change(screen.getByLabelText(/Description/i), {
        target: {
          value: "Updated quest description with additional community rewards.",
        },
      });

      // Save button should now be enabled
      const saveBtn = screen.getByRole("button", { name: "Save Changes" });
      expect(saveBtn).not.toBeDisabled();

      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(adminClient.adminUpdateCampaign).toHaveBeenCalledWith(
          "camp-main-settings-1",
          {
            title: "ChimpHood Whitelist Season 1 (Extended)",
            description: "Updated quest description with additional community rewards.",
          },
        );
      });

      // CRITICAL: Ensure adminCreateCampaignVersion was NOT called
      expect(adminClient.adminCreateCampaignVersion).not.toHaveBeenCalled();

      // Success messages should appear
      await waitFor(() => {
        expect(
          screen.getByText("Campaign settings saved successfully!"),
        ).toBeInTheDocument();
      });
    });

    it("tombol Cancel mengembalikan nilai input ke state awal sebelum diedit", async () => {
      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("Manage Campaign")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Manage Campaign"));

      fireEvent.click(screen.getByRole("tab", { name: /Settings/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/Campaign Title/i)).toBeInTheDocument();
      });

      const titleInput = screen.getByLabelText(/Campaign Title/i) as HTMLInputElement;
      const descInput = screen.getByLabelText(/Description/i) as HTMLTextAreaElement;

      // Edit fields
      fireEvent.change(titleInput, { target: { value: "Temporary Draft Title" } });
      fireEvent.change(descInput, { target: { value: "Temporary Draft Description" } });

      expect(titleInput.value).toBe("Temporary Draft Title");
      expect(descInput.value).toBe("Temporary Draft Description");

      // Click Cancel
      const cancelBtn = screen.getByRole("button", { name: "Cancel" });
      expect(cancelBtn).not.toBeDisabled();
      fireEvent.click(cancelBtn);

      // Verify fields are reverted
      expect(titleInput.value).toBe("ChimpHood Main Whitelist Season 1");
      expect(descInput.value).toBe(
        "Official promotional whitelist quest for genesis chimpanzees.",
      );

      // Save & Cancel should be disabled again
      expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    });

    it("menampilkan error jika update gagal di sisi server dan tidak mengubah state lokal", async () => {
      vi.mocked(adminClient.adminUpdateCampaign).mockRejectedValueOnce(
        new Error("Database connection error while saving settings."),
      );

      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("Manage Campaign")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Manage Campaign"));

      fireEvent.click(screen.getByRole("tab", { name: /Settings/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/Campaign Title/i)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/Campaign Title/i), {
        target: { value: "New Title That Fails" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

      await waitFor(() => {
        expect(
          screen.getByText("Database connection error while saving settings."),
        ).toBeInTheDocument();
      });
    });

    it("dapat menavigasi bolak-balik antara tab Settings, Tasks, dan Version History", async () => {
      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("Manage Campaign")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Manage Campaign"));

      // 1. Go to Settings tab
      fireEvent.click(screen.getByRole("tab", { name: /Settings/i }));
      await waitFor(() => {
        expect(screen.getByText("Edit Campaign Information")).toBeInTheDocument();
      });

      // 2. Switch to Tasks tab
      fireEvent.click(screen.getByRole("tab", { name: /Tasks/i }));
      await waitFor(() => {
        expect(
          screen.getByText("Version 1 Task Specifications"),
        ).toBeInTheDocument();
      });

      // 3. Switch to Version History tab
      fireEvent.click(screen.getByRole("tab", { name: /Version History/i }));
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Version History" })).toBeInTheDocument();
      });

      // 4. Return back to Settings tab
      fireEvent.click(screen.getByRole("tab", { name: /Settings/i }));
      await waitFor(() => {
        expect(screen.getByText("Edit Campaign Information")).toBeInTheDocument();
      });
    });
  });
});
