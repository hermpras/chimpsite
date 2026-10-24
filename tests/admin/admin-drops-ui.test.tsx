import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { AdminDrops } from "@/components/admin/AdminDrops";
import * as dropsClient from "@/lib/drops/client";

vi.mock("@/lib/drops/client", () => ({
  fetchCurrentDrop: vi.fn(),
  emergencyCloseDropWindow: vi.fn(),
}));

describe("Admin Drops UI - Emergency Close Notification Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders success notification displaying actual periodId from API response instead of fallback 'Terminated'", async () => {
    vi.mocked(dropsClient.fetchCurrentDrop).mockResolvedValue({
      active: true,
      drop: {
        id: "drop-test-1",
        slug: "genesis-traits",
        title: "Genesis Traits Drop",
        status: "ACTIVE",
      },
      period: {
        id: "period-actual-101",
        periodIndex: 1,
        startsAt: "2026-10-24T12:00:00.000Z",
        endsAt: "2026-10-24T14:00:00.000Z",
        status: "ACTIVE",
        isStockLocked: true,
      },
      claimWindow: {
        isActive: true,
        startsAt: "2026-10-24T12:00:00.000Z",
        endsAt: "2026-10-24T12:30:00.000Z",
        timeRemainingMs: 900000,
      },
      stock: {
        totalAllocated: 100,
        totalRemaining: 80,
        isExhausted: false,
        poolItems: [],
      },
    });

    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(dropsClient.emergencyCloseDropWindow).mockResolvedValue({
      success: true,
      periodId: "period-actual-101",
      dropId: "drop-test-1",
      status: "CANCELLED",
      auditLogId: "audit-log-xyz-789",
    });

    render(<AdminDrops />);

    await waitFor(() => {
      expect(screen.getByText("Active Drop Window & Stock Monitor")).toBeInTheDocument();
      expect(screen.getByText("Target Period ID: period-actual-101")).toBeInTheDocument();
    });

    const reasonInput = screen.getByLabelText(/Emergency Incident Reason/i);
    fireEvent.change(reasonInput, {
      target: { value: "Security incident: contract paused" },
    });

    const submitBtn = screen.getByRole("button", { name: /Execute Emergency Close/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(dropsClient.emergencyCloseDropWindow).toHaveBeenCalledWith(
        "period-actual-101",
        "drop-test-1",
        "Security incident: contract paused",
      );
      expect(screen.getByText("Drop Period Closed Successfully")).toBeInTheDocument();
    });

    // Verify the paragraph contains actual periodId and auditLogId
    const successDetails = screen.getByText(/Closed Period: period-actual-101/i);
    expect(successDetails).toBeInTheDocument();
    expect(successDetails.textContent).toBe(
      "Closed Period: period-actual-101 (Audit Log: audit-log-xyz-789)",
    );
    // Explicitly assert that "Closed Period: Terminated" is NOT rendered
    expect(screen.queryByText(/Closed Period: Terminated/i)).not.toBeInTheDocument();
  });

  it("handles fallback to 'Terminated' if API response periodId is undefined", async () => {
    vi.mocked(dropsClient.fetchCurrentDrop).mockResolvedValue({
      active: true,
      drop: { id: "drop-test-2", slug: "drop-2", title: "Drop 2", status: "ACTIVE" },
      period: {
        id: "period-fallback-2",
        periodIndex: 2,
        startsAt: "2026-10-24T14:00:00.000Z",
        endsAt: "2026-10-24T16:00:00.000Z",
        status: "ACTIVE",
        isStockLocked: true,
      },
    });

    vi.spyOn(window, "confirm").mockReturnValue(true);
    // periodId is omitted or undefined in response
    vi.mocked(dropsClient.emergencyCloseDropWindow).mockResolvedValue({
      success: true,
      auditLogId: "audit-fallback-1",
    });

    render(<AdminDrops />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Emergency Incident Reason/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Emergency Incident Reason/i), {
      target: { value: "Emergency shutdown required" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Execute Emergency Close/i }));

    await waitFor(() => {
      expect(screen.getByText("Drop Period Closed Successfully")).toBeInTheDocument();
    });

    const fallbackDetails = screen.getByText(/Closed Period: Terminated/i);
    expect(fallbackDetails).toBeInTheDocument();
    expect(fallbackDetails.textContent).toBe(
      "Closed Period: Terminated (Audit Log: audit-fallback-1)",
    );
  });
});
