import { describe, it, expect, vi, beforeEach } from "vitest";
import { listAdminWlSlots } from "@/server/admin/slot";

describe("Admin WL Slots Service (listAdminWlSlots)", () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      wLSlot: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };
  });

  it("applies default pagination (limit 20, offset 0) and sorts by allocatedAt desc and slotNumber asc", async () => {
    mockPrisma.wLSlot.findMany.mockResolvedValueOnce([]);
    mockPrisma.wLSlot.count.mockResolvedValueOnce(0);

    const result = await listAdminWlSlots(mockPrisma as any);

    expect(result).toEqual({
      slots: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    expect(mockPrisma.wLSlot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 20,
        skip: 0,
        orderBy: [{ allocatedAt: "desc" }, { slotNumber: "asc" }],
      }),
    );
  });

  it("clamps limit between 1 and 100", async () => {
    mockPrisma.wLSlot.findMany.mockResolvedValueOnce([]);
    mockPrisma.wLSlot.count.mockResolvedValueOnce(0);

    await listAdminWlSlots(mockPrisma as any, { limit: 1000, offset: -5 });

    expect(mockPrisma.wLSlot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
        skip: 0,
      }),
    );
  });

  it("filters by programId and status", async () => {
    mockPrisma.wLSlot.findMany.mockResolvedValueOnce([]);
    mockPrisma.wLSlot.count.mockResolvedValueOnce(0);

    await listAdminWlSlots(mockPrisma as any, {
      programId: "prog-genesis",
      status: "ALLOCATED",
    });

    expect(mockPrisma.wLSlot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          programId: "prog-genesis",
          status: "ALLOCATED",
        },
      }),
    );
  });

  it("formats slot records with wallet address and ISO date strings", async () => {
    const fakeDate = new Date("2026-10-24T15:30:00Z");
    mockPrisma.wLSlot.findMany.mockResolvedValueOnce([
      {
        id: "slot-abc-1",
        slotNumber: 42,
        programId: "prog-genesis",
        userId: "user-cuid-99",
        status: "ALLOCATED",
        allocatedAt: fakeDate,
        confirmedAt: null,
        allocatedBy: "QUEUE_WORKER",
        notes: "Automated FIFO allocation",
        program: {
          id: "prog-genesis",
          name: "Genesis Whitelist Program",
          slug: "genesis-wl",
        },
        user: {
          id: "user-cuid-99",
          wallet: {
            address: "0x9876543210987654321098765432109876543210",
          },
        },
      },
    ]);
    mockPrisma.wLSlot.count.mockResolvedValueOnce(1);

    const result = await listAdminWlSlots(mockPrisma as any);

    expect(result.total).toBe(1);
    expect(result.slots[0]).toEqual({
      id: "slot-abc-1",
      slotNumber: 42,
      programId: "prog-genesis",
      programName: "Genesis Whitelist Program",
      programSlug: "genesis-wl",
      userId: "user-cuid-99",
      walletAddress: "0x9876543210987654321098765432109876543210",
      status: "ALLOCATED",
      allocatedAt: fakeDate.toISOString(),
      confirmedAt: null,
      allocatedBy: "QUEUE_WORKER",
      notes: "Automated FIFO allocation",
    });
  });
});
