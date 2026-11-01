import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { AdminWhitelist } from "@/components/admin/AdminWhitelist";
import { AdminCampaigns } from "@/components/admin/AdminCampaigns";
import * as adminClient from "@/lib/admin/client";

vi.mock("@/lib/admin/client", () => ({
  adminListWLPrograms: vi.fn(),
  adminCreateWLProgram: vi.fn(),
  adminUpdateWLProgram: vi.fn(),
  adminGetPreExportSummary: vi.fn().mockResolvedValue({
    program: { id: "p1", name: "P1", status: "OPEN" },
    gtd: { allocatedCount: 150, vacantCount: 350, flaggedCount: 0 },
    fcfs: { totalDirectoryEntries: 30, qualifiedReadyCount: 10 },
    disjointVerification: { disjointSetVerified: true },
  }),
  adminListGtdSlotReviews: vi.fn().mockResolvedValue({ slots: [], total: 0 }),
  adminListFcfsDirectory: vi.fn().mockResolvedValue({ entries: [], total: 0 }),
  adminReconcileQueue: vi.fn(),
  adminRevokeSlot: vi.fn(),
  adminListSlots: vi
    .fn()
    .mockResolvedValue({ slots: [], total: 0, limit: 10, offset: 0 }),
  adminListCampaigns: vi.fn(),
  adminCreateCampaign: vi.fn(),
  adminUpdateCampaign: vi.fn(),
  adminListCampaignTasks: vi.fn(),
}));

vi.mock("@/lib/whitelist/client", () => ({
  fetchWhitelistStatus: vi.fn(),
}));

describe("B-2: Admin Portal WL Program Management & Campaign Integration UI", () => {
  const mockPrograms = [
    {
      id: "prog-alpha",
      slug: "genesis-alpha",
      name: "Genesis Alpha Whitelist",
      description: "Genesis batch 1",
      totalSlots: 500,
      allocatedSlotsCount: 150,
      status: "OPEN" as const,
      startsAt: "2026-11-01T00:00:00.000Z",
      endsAt: "2026-11-15T00:00:00.000Z",
      createdAt: "2026-10-25T00:00:00.000Z",
      updatedAt: "2026-10-25T00:00:00.000Z",
      campaignsCount: 2,
      slotsCount: 150,
      queueEntriesCount: 30,
    },
    {
      id: "prog-beta",
      slug: "genesis-beta",
      name: "Genesis Beta Whitelist",
      description: "Genesis batch 2",
      totalSlots: 1000,
      allocatedSlotsCount: 0,
      status: "UPCOMING" as const,
      startsAt: "2026-12-01T00:00:00.000Z",
      endsAt: null,
      createdAt: "2026-10-25T00:00:00.000Z",
      updatedAt: "2026-10-25T00:00:00.000Z",
      campaignsCount: 0,
      slotsCount: 0,
      queueEntriesCount: 0,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  });

  describe("1. Admin Whitelist - Permanent WL Program Display & Lifecycle Management", () => {
    it("renders permanent Whitelist Program card with capacity progress and status", async () => {
      vi.mocked(adminClient.adminListWLPrograms).mockResolvedValueOnce({
        programs: [mockPrograms[0]],
        total: 1,
      });

      render(<AdminWhitelist />);

      await waitFor(() => {
        expect(screen.getByText("Genesis Alpha Whitelist")).toBeInTheDocument();
        expect(screen.getByText("genesis-alpha")).toBeInTheDocument();
        expect(screen.getByText("150")).toBeInTheDocument();
        expect(screen.getByText("/ 500")).toBeInTheDocument();
        expect(screen.getByText(/30% filled/i)).toBeInTheDocument();
      });
    });

    it("allows updating program status via dropdown", async () => {
      vi.mocked(adminClient.adminListWLPrograms).mockResolvedValue({
        programs: [mockPrograms[0]],
        total: 1,
      });

      vi.mocked(adminClient.adminUpdateWLProgram).mockResolvedValueOnce({
        program: {
          ...mockPrograms[0],
          status: "PAUSED",
        },
        auditLogId: "audit-pause-1",
      });

      render(<AdminWhitelist />);

      await waitFor(() => {
        expect(screen.getByText("Genesis Alpha Whitelist")).toBeInTheDocument();
      });

      const select = screen.getByRole("combobox");
      fireEvent.change(select, { target: { value: "PAUSED" } });

      await waitFor(() => {
        expect(adminClient.adminUpdateWLProgram).toHaveBeenCalledWith("prog-alpha", {
          status: "PAUSED",
        });
        expect(
          screen.getByText(/Program status updated to PAUSED/i),
        ).toBeInTheDocument();
      });
    });
  });

  describe("2. Admin Campaigns - Program Selection Without Manual Database Lookups", () => {
    it("renders available Whitelist Programs in a dropdown during campaign creation", async () => {
      vi.mocked(adminClient.adminListCampaigns).mockResolvedValue({
        campaigns: [],
        total: 0,
      });
      vi.mocked(adminClient.adminListWLPrograms).mockResolvedValue({
        programs: mockPrograms,
        total: 2,
      });
      vi.mocked(adminClient.adminCreateCampaign).mockResolvedValueOnce({
        campaign: {
          id: "camp-auto-1",
          slug: "alpha-quest",
          title: "Alpha Quest Campaign",
          description: null,
          wlProgramId: "prog-alpha",
          status: "DRAFT",
          createdAt: "2026-10-25T00:00:00.000Z",
          updatedAt: "2026-10-25T00:00:00.000Z",
          currentVersion: null,
        },
        auditLogId: "audit-camp-1",
      });

      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("New Campaign")).toBeInTheDocument();
      });

      // Open campaign creation form
      fireEvent.click(screen.getByText("New Campaign"));
      expect(screen.getByText("Create New Campaign")).toBeInTheDocument();

      // Verify that programs are loaded in the select dropdown
      await waitFor(() => {
        expect(
          screen.getByRole("combobox", { name: /Whitelist Program ID/i }),
        ).toBeInTheDocument();
      });

      const select = screen.getByRole("combobox", { name: /Whitelist Program ID/i });
      expect(
        screen.getByText(
          /Genesis Alpha Whitelist \(genesis-alpha\) — Capacity: 500 \[OPEN\]/i,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /Genesis Beta Whitelist \(genesis-beta\) — Capacity: 1000 \[UPCOMING\]/i,
        ),
      ).toBeInTheDocument();

      // Select program from dropdown
      fireEvent.change(select, { target: { value: "prog-alpha" } });
      expect(select).toHaveValue("prog-alpha");

      // Fill in remaining fields
      fireEvent.change(screen.getByLabelText(/Slug/i), {
        target: { value: "alpha-quest" },
      });
      fireEvent.change(screen.getByLabelText(/Campaign Title/i), {
        target: { value: "Alpha Quest Campaign" },
      });

      // Submit
      fireEvent.click(screen.getByRole("button", { name: /Create Campaign/i }));

      await waitFor(() => {
        expect(adminClient.adminCreateCampaign).toHaveBeenCalledWith(
          expect.objectContaining({
            slug: "alpha-quest",
            title: "Alpha Quest Campaign",
            wlProgramId: "prog-alpha",
          }),
        );
      });
    });

    it("supports switching to manual entry if needed", async () => {
      vi.mocked(adminClient.adminListCampaigns).mockResolvedValue({
        campaigns: [],
        total: 0,
      });
      vi.mocked(adminClient.adminListWLPrograms).mockResolvedValue({
        programs: mockPrograms,
        total: 2,
      });

      render(<AdminCampaigns />);

      await waitFor(() => {
        expect(screen.getByText("New Campaign")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("New Campaign"));

      await waitFor(() => {
        expect(screen.getByText("Enter manually")).toBeInTheDocument();
      });

      // Switch to manual entry
      fireEvent.click(screen.getByText("Enter manually"));

      const manualInput = screen.getByPlaceholderText("e.g. wl-program-genesis");
      expect(manualInput).toBeInTheDocument();

      fireEvent.change(manualInput, { target: { value: "custom-prog-id-xyz" } });
      expect(manualInput).toHaveValue("custom-prog-id-xyz");

      // Switch back to select
      fireEvent.click(screen.getByText("Select from list"));
      expect(
        screen.getByRole("combobox", { name: /Whitelist Program ID/i }),
      ).toBeInTheDocument();
    });
  });
});
