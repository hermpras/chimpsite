import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listAuditLogs,
  AdminAuditLogError,
} from "@/server/admin/audit-logs";
import type { PrismaClient } from "@prisma/client";

describe("Admin Audit Logs Service (listAuditLogs)", () => {
  let mockPrisma: {
    auditLog: {
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    mockPrisma = {
      auditLog: {
        count: vi.fn().mockResolvedValue(2),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "log-1",
            actorId: "actor-1",
            action: "BAN_USER",
            entityType: "User",
            entityId: "user-999",
            oldValues: { isBanned: false },
            newValues: { isBanned: true },
            metadata: { reason: "Sybil attack" },
            createdAt: new Date("2026-10-25T12:00:00.000Z"),
            actor: {
              id: "actor-1",
              role: "ADMIN",
              wallet: { address: "0x1111111111111111111111111111111111111111" },
              xIdentity: { username: "admin_one" },
            },
          },
          {
            id: "log-2",
            actorId: null,
            action: "AUTO_REPLENISH",
            entityType: "DropPeriod",
            entityId: "period-1",
            oldValues: null,
            newValues: { stock: 100 },
            metadata: null,
            createdAt: new Date("2026-10-24T12:00:00.000Z"),
            actor: null,
          },
        ]),
      },
    };
  });

  describe("1. Default Pagination, Ordering & Safe Projection", () => {
    it("fetches audit logs with default limit 50, offset 0, and ordered newest first with stable id tie-breaker", async () => {
      const result = await listAuditLogs(mockPrisma as unknown as PrismaClient);

      expect(result.total).toBe(2);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
      expect(result.logs.length).toBe(2);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 50,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          actorId: true,
          action: true,
          entityType: true,
          entityId: true,
          oldValues: true,
          newValues: true,
          metadata: true,
          createdAt: true,
          actor: {
            select: {
              id: true,
              role: true,
              wallet: {
                select: {
                  address: true,
                },
              },
              xIdentity: {
                select: {
                  username: true,
                },
              },
            },
          },
        },
      });

      // Verify confidential fields like actorIp and userAgent are NOT included in selection
      const selectObj = mockPrisma.auditLog.findMany.mock.calls[0][0].select;
      expect(selectObj.actorIp).toBeUndefined();
      expect(selectObj.userAgent).toBeUndefined();
    });
  });

  describe("2. Filtering Options", () => {
    it("filters by action, entityType, and actorId", async () => {
      await listAuditLogs(mockPrisma as unknown as PrismaClient, {
        action: "BAN_USER",
        entityType: "User",
        actorId: "actor-1",
      });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            action: "BAN_USER",
            entityType: "User",
            actorId: "actor-1",
          },
        }),
      );
      expect(mockPrisma.auditLog.count).toHaveBeenCalledWith({
        where: {
          action: "BAN_USER",
          entityType: "User",
          actorId: "actor-1",
        },
      });
    });

    it("filters by valid date range (from and to)", async () => {
      const from = "2026-10-01T00:00:00.000Z";
      const to = "2026-10-31T23:59:59.000Z";

      await listAuditLogs(mockPrisma as unknown as PrismaClient, { from, to });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            createdAt: {
              gte: new Date(from),
              lte: new Date(to),
            },
          },
        }),
      );
    });

    it("rejects invalid 'from' date with INVALID_DATE_RANGE", async () => {
      await expect(
        listAuditLogs(mockPrisma as unknown as PrismaClient, { from: "not-a-valid-date" }),
      ).rejects.toThrow(AdminAuditLogError);

      await expect(
        listAuditLogs(mockPrisma as unknown as PrismaClient, { from: "not-a-valid-date" }),
      ).rejects.toMatchObject({
        code: "INVALID_DATE_RANGE",
        status: 400,
      });
    });

    it("rejects invalid 'to' date with INVALID_DATE_RANGE", async () => {
      await expect(
        listAuditLogs(mockPrisma as unknown as PrismaClient, { to: "invalid-to" }),
      ).rejects.toMatchObject({
        code: "INVALID_DATE_RANGE",
        status: 400,
      });
    });

    it("rejects date range when 'from' is after 'to'", async () => {
      await expect(
        listAuditLogs(mockPrisma as unknown as PrismaClient, {
          from: "2026-11-01T00:00:00.000Z",
          to: "2026-10-01T00:00:00.000Z",
        }),
      ).rejects.toMatchObject({
        code: "INVALID_DATE_RANGE",
        status: 400,
      });
    });
  });

  describe("3. Pagination and Limits Enforcement", () => {
    it("clamps limit to maximum 100 when a larger limit is requested", async () => {
      const result = await listAuditLogs(mockPrisma as unknown as PrismaClient, {
        limit: 500,
        offset: 10,
      });

      expect(result.limit).toBe(100);
      expect(result.offset).toBe(10);
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
          skip: 10,
        }),
      );
    });

    it("rejects non-positive limit with INVALID_LIMIT", async () => {
      await expect(
        listAuditLogs(mockPrisma as unknown as PrismaClient, { limit: 0 }),
      ).rejects.toMatchObject({
        code: "INVALID_LIMIT",
        status: 400,
      });

      await expect(
        listAuditLogs(mockPrisma as unknown as PrismaClient, { limit: -5 }),
      ).rejects.toMatchObject({
        code: "INVALID_LIMIT",
        status: 400,
      });
    });

    it("rejects negative offset with INVALID_OFFSET", async () => {
      await expect(
        listAuditLogs(mockPrisma as unknown as PrismaClient, { offset: -1 }),
      ).rejects.toMatchObject({
        code: "INVALID_OFFSET",
        status: 400,
      });
    });
  });
});
