import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { AdminDrops } from "@/components/admin/AdminDrops";
import * as dropsClient from "@/lib/drops/client";
import * as adminClient from "@/lib/admin/client";

vi.mock("@/lib/drops/client", () => ({
  fetchCurrentDrop: vi.fn(),
  emergencyCloseDropWindow: vi.fn(),
}));

vi.mock("@/lib/admin/client", () => ({
  adminListDrops: vi.fn(),
  adminGetDrop: vi.fn(),
  adminCreateDrop: vi.fn(),
  adminUpdateDrop: vi.fn(),
  adminCreateDropPeriod: vi.fn(),
  adminConfigurePeriodStock: vi.fn(),
  adminActivateDropPeriod: vi.fn(),
  adminListTraits: vi.fn(),
}));

describe("Admin Drops Portal UI - B-1 Drop Configuration Component", () => {
  function getMockDropData() {
    const nowMs = Date.now();
    // Period 1 is currently active (started 30 min ago, ends in 90 min)
    const p1StartsAt = new Date(nowMs - 30 * 60 * 1000).toISOString();
    const p1EndsAt = new Date(nowMs + 90 * 60 * 1000).toISOString();
    const p1ConfigLockAt = new Date(nowMs - 45 * 60 * 1000).toISOString();

    // Period 2 is unconfigured in the future (starts in 2 hours, config freeze is 15 min prior)
    const p2StartsAt = new Date(nowMs + 2 * 60 * 60 * 1000).toISOString();
    const p2EndsAt = new Date(nowMs + 4 * 60 * 60 * 1000).toISOString();
    const p2ConfigLockAt = new Date(nowMs + 105 * 60 * 1000).toISOString();

    const mockCurrentDrop = {
      active: true,
      drop: {
        id: "drop-1",
        slug: "genesis-drop",
        title: "ChimpHood Genesis Drop",
        status: "ACTIVE",
      },
      period: {
        id: "period-1",
        periodIndex: 1,
        startsAt: p1StartsAt,
        endsAt: p1EndsAt,
        status: "ACTIVE",
        isStockLocked: true,
      },
      claimWindow: {
        isActive: true,
        startsAt: p1StartsAt,
        endsAt: new Date(nowMs + 30 * 60 * 1000).toISOString(),
        timeRemainingMs: 1800000,
      },
      stock: {
        totalAllocated: 50,
        totalRemaining: 30,
        isExhausted: false,
        poolItems: [
          {
            poolItemId: "pi-1",
            traitId: "t-1",
            traitName: "Golden Fur",
            category: "FUR",
            rarity: "EPIC",
            remainingStock: 30,
            weight: 100,
            probabilityPercent: 100,
          },
        ],
      },
    };

    const mockDropsList = [
      {
        id: "drop-1",
        slug: "genesis-drop",
        title: "ChimpHood Genesis Drop",
        description: "Season 1 genesis",
        status: "ACTIVE" as const,
        startsAt: p1StartsAt,
        endsAt: p2EndsAt,
        createdAt: new Date(nowMs - 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: p1StartsAt,
        periods: [
          {
            id: "period-1",
            periodIndex: 1,
            startsAt: p1StartsAt,
            endsAt: p1EndsAt,
            configLockAt: p1ConfigLockAt,
            status: "CONFIGURED" as const,
            isStockConfigured: true,
            isStockLocked: false,
            poolItems: [
              {
                id: "pi-1",
                traitId: "t-1",
                allocatedStock: 25,
                remainingStock: 25,
                weight: 100,
              },
            ],
          },
          {
            id: "period-2",
            periodIndex: 2,
            startsAt: p2StartsAt,
            endsAt: p2EndsAt,
            configLockAt: p2ConfigLockAt,
            status: "PENDING_CONFIG" as const,
            isStockConfigured: false,
            isStockLocked: false,
            poolItems: [],
          },
        ],
      },
    ];

    return { mockCurrentDrop, mockDropsList };
  }

  const mockTraits = [
    {
      id: "t-1",
      slug: "golden-fur",
      name: "Golden Fur",
      category: "FUR",
      rarity: "EPIC",
      imageUrl: "/traits/fur.png",
      maxSupply: 100,
    },
    {
      id: "t-2",
      slug: "neon-visor",
      name: "Neon Visor",
      category: "HEADWEAR",
      rarity: "RARE",
      imageUrl: "/traits/visor.png",
      maxSupply: 100,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    const { mockCurrentDrop, mockDropsList } = getMockDropData();
    vi.mocked(dropsClient.fetchCurrentDrop).mockResolvedValue(mockCurrentDrop);
    vi.mocked(adminClient.adminListDrops).mockResolvedValue({
      drops: mockDropsList,
      total: 1,
      limit: 50,
      offset: 0,
    });
    vi.mocked(adminClient.adminGetDrop).mockResolvedValue({
      drop: mockDropsList[0],
    });
    vi.mocked(adminClient.adminListTraits).mockResolvedValue({
      traits: mockTraits,
    });
  });

  it("renders page header, live drop monitor, and drop periods table", async () => {
    render(<AdminDrops />);

    // Check main title
    expect(screen.getByText("Drop Operations")).toBeInTheDocument();

    // Check monitor items
    await waitFor(() => {
      expect(screen.getByText("Live Drop Monitor & Claim Window")).toBeInTheDocument();
      expect(screen.getByText("Golden Fur")).toBeInTheDocument();
    });

    // Check periods table
    await waitFor(() => {
      expect(
        screen.getByText("Drop Seasons & Period Configurations"),
      ).toBeInTheDocument();
      expect(screen.getByText("#1")).toBeInTheDocument();
      expect(screen.getByText("#2")).toBeInTheDocument();
      expect(screen.getByText("Unconfigured")).toBeInTheDocument();
    });
  });

  it("opens Create Drop modal and submits new drop successfully", async () => {
    vi.mocked(adminClient.adminCreateDrop).mockResolvedValueOnce({
      drop: {
        id: "drop-2",
        title: "Season 2 Drop",
        slug: "season-2",
      },
      auditLogId: "audit-create-1",
    });

    render(<AdminDrops />);

    await waitFor(() => {
      expect(screen.getByText("Drop Operations")).toBeInTheDocument();
    });

    // Click Create Drop button
    const createBtn = screen.getByRole("button", { name: /create drop/i });
    fireEvent.click(createBtn);

    // Modal should be visible
    expect(screen.getByText("Create New Drop")).toBeInTheDocument();

    // Fill form
    fireEvent.change(
      screen.getByPlaceholderText(/e\.g\. ChimpHood Season 1 Trait Drop/i),
      {
        target: { value: "Season 2 Drop" },
      },
    );
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. chimphood-season-1/i), {
      target: { value: "season-2" },
    });

    const form = screen.getByText("Create New Drop").closest("div.w-full");
    const dateInputs = form!.querySelectorAll('input[type="datetime-local"]');
    // Set startsAt and endsAt (valid 2-hour UTC cycle)
    fireEvent.change(dateInputs[0], { target: { value: "2026-10-26T00:00" } });
    fireEvent.change(dateInputs[1], { target: { value: "2026-10-26T04:00" } });

    // Submit form
    const submitBtn = screen.getAllByRole("button", { name: /create drop/i })[1];
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(adminClient.adminCreateDrop).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Season 2 Drop",
          slug: "season-2",
          generatePeriods: true,
        }),
      );
    });
  });

  it("opens Stock Configuration modal and saves stock with equal probability default", async () => {
    vi.mocked(adminClient.adminConfigurePeriodStock).mockResolvedValueOnce({
      period: { id: "period-2", isStockConfigured: true, status: "CONFIGURED" },
      auditLogId: "audit-stock-1",
    });

    render(<AdminDrops />);

    await waitFor(() => {
      expect(screen.getByText("#2")).toBeInTheDocument();
    });

    // Period 2 Configure Stock button
    const configBtns = screen.getAllByRole("button", { name: /configure stock/i });
    fireEvent.click(configBtns[1]); // Period 2 is unconfigured

    // Check modal opens
    await waitFor(() => {
      expect(
        screen.getByText(/Configure Trait Pool Stock – Period #2/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/Drop Protocol Rules/i)).toBeInTheDocument();
    });

    // Select a trait to add inside the modal
    const modal = screen
      .getByText(/Configure Trait Pool Stock – Period #2/i)
      .closest("div.w-full");
    const traitSelect = modal!.querySelector("select")!;
    fireEvent.change(traitSelect, { target: { value: "t-1" } });

    // Click Add Trait
    const addTraitBtn = screen.getByRole("button", { name: /add trait/i });
    fireEvent.click(addTraitBtn);

    // Verify default stock (10) and default equal weight (100)
    expect(screen.getByDisplayValue("10")).toBeInTheDocument();
    expect(screen.getByDisplayValue("100")).toBeInTheDocument();
    expect(screen.getAllByText("100.0%").length).toBeGreaterThanOrEqual(1);

    // Click Save Stock Configuration
    const saveBtn = screen.getByRole("button", { name: /save stock configuration/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(adminClient.adminConfigurePeriodStock).toHaveBeenCalledWith(
        "drop-1",
        "period-2",
        [
          {
            traitId: "t-1",
            stock: 10,
            weight: 100,
          },
        ],
      );
      expect(
        screen.getByText(/Trait pool stock successfully configured!/i),
      ).toBeInTheDocument();
    });
  });

  it("handles emergency close invocation with reason validation", async () => {
    vi.mocked(dropsClient.emergencyCloseDropWindow).mockResolvedValueOnce({
      success: true,
      periodId: "period-1",
      auditLogId: "audit-em-1",
    });

    window.confirm = vi.fn().mockReturnValue(true);

    render(<AdminDrops />);

    await waitFor(() => {
      expect(screen.getByText("Emergency Close Drop Window")).toBeInTheDocument();
    });

    const reasonInput = screen.getByPlaceholderText(/e\.g\. Critical exploit/i);
    fireEvent.change(reasonInput, {
      target: { value: "Exploit discovered in client transaction" },
    });

    const emBtn = screen.getByRole("button", { name: /execute emergency close/i });
    fireEvent.click(emBtn);

    await waitFor(() => {
      expect(dropsClient.emergencyCloseDropWindow).toHaveBeenCalledWith(
        "period-1",
        "drop-1",
        "Exploit discovered in client transaction",
      );
      expect(screen.getByText(/Drop Period Closed Successfully/i)).toBeInTheDocument();
    });
  });
});
