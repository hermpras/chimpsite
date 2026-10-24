import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { AdminWhitelist } from "@/components/admin/AdminWhitelist";
import * as adminClient from "@/lib/admin/client";
import * as wlClient from "@/lib/whitelist/client";

vi.mock("@/lib/admin/client", () => ({
  adminReconcileQueue: vi.fn(),
  adminRevokeSlot: vi.fn(),
  adminListSlots: vi
    .fn()
    .mockResolvedValue({ slots: [], total: 0, limit: 10, offset: 0 }),
  adminListWLPrograms: vi.fn().mockResolvedValue({ programs: [], total: 0 }),
  adminCreateWLProgram: vi.fn(),
  adminUpdateWLProgram: vi.fn(),
}));

vi.mock("@/lib/whitelist/client", () => ({
  fetchWhitelistStatus: vi.fn(),
}));

describe("Admin Whitelist UI - Queue Reconciliation Notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn();
  });

  it("renders headers and tools correctly", () => {
    render(<AdminWhitelist />);
    expect(screen.getByText("Whitelist Operations")).toBeInTheDocument();
    expect(screen.getByText("Stage 3 WL Engine")).toBeInTheDocument();
    expect(screen.getByText("Queue Reconciliation")).toBeInTheDocument();
    expect(screen.getAllByText("Revoke Whitelist Slot").length).toBeGreaterThan(0);
    expect(screen.getByText("Address Whitelist Lookup")).toBeInTheDocument();
  });

  it("displays actual slotsFilled and openSlotsRemaining numbers from API response, not default 0", async () => {
    vi.mocked(adminClient.adminReconcileQueue).mockResolvedValueOnce({
      success: true,
      programId: "wl-prog-season-1",
      slotsFilled: 5,
      openSlotsRemaining: 12,
    });

    render(<AdminWhitelist />);
    const progInput = screen.getByLabelText(/Whitelist Program ID/i);
    fireEvent.change(progInput, { target: { value: "wl-prog-season-1" } });

    const reconcileBtn = screen.getByRole("button", { name: /Reconcile Program Queue/i });
    fireEvent.click(reconcileBtn);

    await waitFor(() => {
      expect(adminClient.adminReconcileQueue).toHaveBeenCalledWith({
        programId: "wl-prog-season-1",
      });
      expect(screen.getByText("Reconciliation Succeeded")).toBeInTheDocument();
    });

    // Verify the success notification renders non-zero API response values
    const resultParagraph = screen.getByText(/Reconciled 5 slots/i);
    expect(resultParagraph).toBeInTheDocument();
    expect(resultParagraph.textContent).toBe("Reconciled 5 slots (Remaining: 12)");
    expect(resultParagraph.textContent).not.toBe("Reconciled 0 slots (Remaining: 0)");
  });

  it("displays 0 correctly when API returns 0 filled slots and 0 remaining open slots", async () => {
    vi.mocked(adminClient.adminReconcileQueue).mockResolvedValueOnce({
      success: true,
      programId: "wl-prog-full",
      slotsFilled: 0,
      openSlotsRemaining: 0,
    });

    render(<AdminWhitelist />);
    const progInput = screen.getByLabelText(/Whitelist Program ID/i);
    fireEvent.change(progInput, { target: { value: "wl-prog-full" } });

    const reconcileBtn = screen.getByRole("button", { name: /Reconcile Program Queue/i });
    fireEvent.click(reconcileBtn);

    await waitFor(() => {
      expect(screen.getByText("Reconciliation Succeeded")).toBeInTheDocument();
    });

    const resultParagraph = screen.getByText(/Reconciled 0 slots/i);
    expect(resultParagraph).toBeInTheDocument();
    expect(resultParagraph.textContent).toBe("Reconciled 0 slots (Remaining: 0)");
  });

  it("handles reconciliation failure and renders error alert banner", async () => {
    vi.mocked(adminClient.adminReconcileQueue).mockRejectedValueOnce(
      new Error("Program not found or inactive"),
    );

    render(<AdminWhitelist />);
    const progInput = screen.getByLabelText(/Whitelist Program ID/i);
    fireEvent.change(progInput, { target: { value: "wl-nonexistent" } });

    const reconcileBtn = screen.getByRole("button", { name: /Reconcile Program Queue/i });
    fireEvent.click(reconcileBtn);

    await waitFor(() => {
      expect(screen.getByText("Program not found or inactive")).toBeInTheDocument();
    });
  });

  describe("Allocated Whitelist Slots Registry", () => {
    it("renders Allocated Whitelist Slots table and displays slot records with wallet and status", async () => {
      vi.mocked(adminClient.adminListSlots).mockResolvedValueOnce({
        slots: [
          {
            id: "slot-rec-1",
            slotNumber: 7,
            programId: "wl-genesis",
            programName: "Genesis Whitelist Program",
            programSlug: "genesis",
            userId: "user-cuid-42",
            walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
            status: "ALLOCATED",
            allocatedAt: "2026-10-24T10:00:00.000Z",
            confirmedAt: null,
            allocatedBy: "QUEUE_WORKER",
            notes: null,
          },
        ],
        total: 1,
        limit: 10,
        offset: 0,
      });

      render(<AdminWhitelist />);

      expect(screen.getByText("Allocated Whitelist Slots")).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText("#7")).toBeInTheDocument();
        expect(screen.getByText("Genesis Whitelist Program")).toBeInTheDocument();
        expect(screen.getByText("user-cuid-42")).toBeInTheDocument();
        expect(screen.getAllByText("ALLOCATED").length).toBeGreaterThan(0);
      });

      // Clicking "Revoke" on an allocated slot auto-populates the Revocation form fields
      const revokeBtn = screen.getByRole("button", { name: "Revoke" });
      fireEvent.click(revokeBtn);

      expect(screen.getByLabelText(/Slot ID \(preferred\)/i)).toHaveValue("slot-rec-1");
      expect(screen.getByLabelText(/Program ID \(alt\)/i)).toHaveValue("wl-genesis");
      expect(screen.getByLabelText(/User ID \(alt\)/i)).toHaveValue("user-cuid-42");
    });

    it("filters allocated whitelist slots by program and search query", async () => {
      vi.mocked(adminClient.adminListSlots).mockResolvedValueOnce({
        slots: [],
        total: 0,
        limit: 10,
        offset: 0,
      });

      render(<AdminWhitelist />);

      const searchInput = screen.getByPlaceholderText(
        /Search by wallet \(0x\.\.\.\), User ID, or Slot ID\.\.\./i,
      );
      fireEvent.change(searchInput, { target: { value: "0x1234" } });

      const programInput = screen.getByPlaceholderText(/Program ID\.\.\./i);
      fireEvent.change(programInput, { target: { value: "wl-prog-1" } });

      fireEvent.submit(searchInput.closest("form")!);

      await waitFor(() => {
        expect(adminClient.adminListSlots).toHaveBeenCalledWith({
          search: "0x1234",
          programId: "wl-prog-1",
          status: undefined,
          limit: 10,
          offset: 0,
        });
      });
    });
  });
});
