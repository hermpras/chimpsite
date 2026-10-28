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
});
