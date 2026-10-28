import { describe, it, expect, vi, beforeEach } from "vitest";
import { listAdminUsers } from "@/server/admin/users";

describe("Admin Users Service (listAdminUsers)", () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };
  });

  it("applies default pagination (limit 20, offset 0) and sorts by createdAt desc", async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([]);
    mockPrisma.user.count.mockResolvedValueOnce(0);

    const result = await listAdminUsers(mockPrisma as any);

    expect(result).toEqual({
      users: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 20,
        skip: 0,
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("clamps limit between 1 and 100", async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([]);
    mockPrisma.user.count.mockResolvedValueOnce(0);

    await listAdminUsers(mockPrisma as any, { limit: 500, offset: -10 });

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
        skip: 0,
      }),
    );
  });

  it("builds OR conditions for search parameter across id, wallet address, and x username", async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([]);
    mockPrisma.user.count.mockResolvedValueOnce(0);

    await listAdminUsers(mockPrisma as any, { search: "0xAbC123" });

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { id: { contains: "0xAbC123" } },
            { wallet: { address: { contains: "0xabc123" } } },
            { xIdentity: { username: { contains: "0xAbC123", mode: "insensitive" } } },
          ],
        },
      }),
    );
  });

  it("formats user fields properly and extracts active ban if present", async () => {
    const fakeDate = new Date("2026-10-24T12:00:00Z");
    mockPrisma.user.findMany.mockResolvedValueOnce([
      {
        id: "cuid-user-1",
        role: "USER",
        isBanned: true,
        createdAt: fakeDate,
        updatedAt: fakeDate,
        wallet: {
          address: "0x1234567890123456789012345678901234567890",
          chainId: 1,
          verifiedAt: fakeDate,
        },
        xIdentity: {
          username: "test_monkey",
          name: "Test Monkey",
        },
        banRecords: [
          {
            id: "ban-123",
            banType: "PERMANENT",
            scope: "FULL_SYSTEM",
            reason: "Bot farm detected",
            issuedAt: fakeDate,
            expiresAt: null,
          },
        ],
      },
    ]);
    mockPrisma.user.count.mockResolvedValueOnce(1);

    const result = await listAdminUsers(mockPrisma as any);

    expect(result.total).toBe(1);
    expect(result.users[0]).toEqual({
      id: "cuid-user-1",
      role: "USER",
      isBanned: true,
      createdAt: fakeDate.toISOString(),
      updatedAt: fakeDate.toISOString(),
      wallet: {
        address: "0x1234567890123456789012345678901234567890",
        chainId: 1,
        verifiedAt: fakeDate.toISOString(),
      },
      xIdentity: {
        username: "test_monkey",
        name: "Test Monkey",
      },
      activeBan: {
        id: "ban-123",
        banType: "PERMANENT",
        scope: "FULL_SYSTEM",
        reason: "Bot farm detected",
        issuedAt: fakeDate.toISOString(),
        expiresAt: null,
      },
    });
  });

  it("filters by role and isBanned boolean/string", async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([]);
    mockPrisma.user.count.mockResolvedValueOnce(0);

    await listAdminUsers(mockPrisma as any, { role: "ADMIN", isBanned: "true" });

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          role: "ADMIN",
          isBanned: true,
        },
      }),
    );
  });
});
