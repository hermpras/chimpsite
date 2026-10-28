import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listAbuseFlags,
  getAbuseFlagById,
  updateAbuseFlag,
  AdminAbuseFlagError,
  normalizeAbuseFlagStatus,
  normalizeResolutionNotes,
  VALID_ABUSE_FLAG_STATUSES,
  VALID_ABUSE_FLAG_TYPES,
  VALID_ABUSE_SEVERITIES,
} from "@/server/admin/abuse-flags";
import type { PrismaClient } from "@prisma/client";

function createMockPrisma() {
  const store = {
    users: [] as any[],
    abuseFlags: [] as any[],
    auditLogs: [] as any[],
  };

  const createTxClient = () => {
    const uncommittedFlags: any[] = [];
    const uncommittedAudit: any[] = [];
    const flagSnapshots: Array<{ id: string; data: any }> = [];

    const rollback = () => {
      for (const f of uncommittedFlags) {
        const idx = store.abuseFlags.indexOf(f);
        if (idx !== -1) store.abuseFlags.splice(idx, 1);
      }
      for (const a of uncommittedAudit) {
        const idx = store.auditLogs.indexOf(a);
        if (idx !== -1) store.auditLogs.splice(idx, 1);
      }
      for (const snap of flagSnapshots) {
        const f = store.abuseFlags.find((x) => x.id === snap.id);
        if (f) Object.assign(f, snap.data);
      }
    };

    const tx: any = {
      abuseFlag: {
        findUnique: vi.fn(async ({ where }: any) => {
          const flag = store.abuseFlags.find((f) => f.id === where.id);
          if (!flag) return null;
          const user = store.users.find((u) => u.id === flag.userId);
          const reviewer = flag.reviewedById
            ? store.users.find((u) => u.id === flag.reviewedById)
            : null;
          return {
            ...flag,
            user: user
              ? {
                  id: user.id,
                  isBanned: user.isBanned ?? false,
                  role: user.role ?? "USER",
                  wallet: user.wallet ?? null,
                  xIdentity: user.xIdentity ?? null,
                }
              : null,
            reviewedBy: reviewer
              ? {
                  id: reviewer.id,
                  role: reviewer.role ?? "MODERATOR",
                  wallet: reviewer.wallet ?? null,
                }
              : null,
          };
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const flag = store.abuseFlags.find((f) => f.id === where.id);
          if (!flag) throw new Error("Flag not found for update");
          flagSnapshots.push({ id: flag.id, data: { ...flag } });
          Object.assign(flag, data, { updatedAt: new Date() });
          const user = store.users.find((u) => u.id === flag.userId);
          const reviewer = flag.reviewedById
            ? store.users.find((u) => u.id === flag.reviewedById)
            : null;
          return {
            ...flag,
            user: user
              ? {
                  id: user.id,
                  isBanned: user.isBanned ?? false,
                  role: user.role ?? "USER",
                  wallet: user.wallet ?? null,
                  xIdentity: user.xIdentity ?? null,
                }
              : null,
            reviewedBy: reviewer
              ? {
                  id: reviewer.id,
                  role: reviewer.role ?? "MODERATOR",
                  wallet: reviewer.wallet ?? null,
                }
              : null,
          };
        }),
      },
      auditLog: {
        create: vi.fn(async ({ data }: any) => {
          const record = { id: `audit-${store.auditLogs.length + 1}`, ...data };
          uncommittedAudit.push(record);
          store.auditLogs.push(record);
          return { id: record.id };
        }),
      },
    };

    return { tx, rollback };
  };

  const prisma: any = {
    _store: store,
    abuseFlag: {
      count: vi.fn(async ({ where }: any = {}) => {
        return store.abuseFlags.filter((f) => {
          if (where?.status && f.status !== where.status) return false;
          if (where?.flagType && f.flagType !== where.flagType) return false;
          if (where?.severity && f.severity !== where.severity) return false;
          if (where?.userId && f.userId !== where.userId) return false;
          return true;
        }).length;
      }),
      findMany: vi.fn(async ({ where, skip = 0, take = 50 }: any = {}) => {
        const filtered = store.abuseFlags.filter((f) => {
          if (where?.status && f.status !== where.status) return false;
          if (where?.flagType && f.flagType !== where.flagType) return false;
          if (where?.severity && f.severity !== where.severity) return false;
          if (where?.userId && f.userId !== where.userId) return false;
          return true;
        });
        const paged = filtered.slice(skip, skip + take);
        return paged.map((flag) => {
          const user = store.users.find((u) => u.id === flag.userId);
          const reviewer = flag.reviewedById
            ? store.users.find((u) => u.id === flag.reviewedById)
            : null;
          return {
            ...flag,
            user: user
              ? {
                  id: user.id,
                  isBanned: user.isBanned ?? false,
                  role: user.role ?? "USER",
                  wallet: user.wallet ?? null,
                  xIdentity: user.xIdentity ?? null,
                }
              : null,
            reviewedBy: reviewer
              ? {
                  id: reviewer.id,
                  role: reviewer.role ?? "MODERATOR",
                  wallet: reviewer.wallet ?? null,
                }
              : null,
          };
        });
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const flag = store.abuseFlags.find((f) => f.id === where.id);
        if (!flag) return null;
        const user = store.users.find((u) => u.id === flag.userId);
        const reviewer = flag.reviewedById
          ? store.users.find((u) => u.id === flag.reviewedById)
          : null;
        return {
          ...flag,
          user: user
            ? {
                id: user.id,
                isBanned: user.isBanned ?? false,
                role: user.role ?? "USER",
                wallet: user.wallet ?? null,
                xIdentity: user.xIdentity ?? null,
              }
            : null,
          reviewedBy: reviewer
            ? {
                id: reviewer.id,
                role: reviewer.role ?? "MODERATOR",
                wallet: reviewer.wallet ?? null,
              }
            : null,
        };
      }),
    },
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      const { tx, rollback } = createTxClient();
      try {
        return await cb(tx);
      } catch (err) {
        rollback();
        throw err;
      }
    }),
  };

  return prisma as unknown as PrismaClient & { _store: typeof store };
}

describe("Abuse Flag Service Layer (DEC-012 Stage 4)", () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockPrisma._store.users.push(
      {
        id: "target-user-1",
        role: "USER",
        isBanned: false,
        wallet: { address: "0x1111111111111111111111111111111111111111" },
        xIdentity: { username: "targetuser" },
      },
      {
        id: "mod-user-1",
        role: "MODERATOR",
        isBanned: false,
        wallet: { address: "0x2222222222222222222222222222222222222222" },
      },
    );
  });

  describe("Normalization & Validation", () => {
    it("normalizes valid statuses case-insensitively", () => {
      expect(normalizeAbuseFlagStatus("open")).toBe("OPEN");
      expect(normalizeAbuseFlagStatus("UNDER_REVIEW")).toBe("UNDER_REVIEW");
      expect(normalizeAbuseFlagStatus("dismissed ")).toBe("DISMISSED");
      expect(normalizeAbuseFlagStatus("confirmed_action_taken")).toBe(
        "CONFIRMED_ACTION_TAKEN",
      );
    });

    it("throws 400 on invalid status", () => {
      expect(() => normalizeAbuseFlagStatus("INVALID_STATUS")).toThrowError(
        AdminAbuseFlagError,
      );
      try {
        normalizeAbuseFlagStatus("UNKNOWN");
      } catch (e: any) {
        expect(e.status).toBe(400);
        expect(e.code).toBe("INVALID_STATUS");
      }
    });

    it("normalizes resolution notes properly", () => {
      expect(normalizeResolutionNotes(undefined)).toBeNull();
      expect(normalizeResolutionNotes(null)).toBeNull();
      expect(normalizeResolutionNotes("   ")).toBeNull();
      expect(normalizeResolutionNotes("  Investigation confirmed Sybil  ")).toBe(
        "Investigation confirmed Sybil",
      );
    });

    it("throws 400 if resolution notes exceeds 2048 characters", () => {
      const longNote = "a".repeat(2049);
      expect(() => normalizeResolutionNotes(longNote)).toThrowError(
        AdminAbuseFlagError,
      );
    });
  });

  describe("listAbuseFlags()", () => {
    beforeEach(() => {
      mockPrisma._store.abuseFlags.push(
        {
          id: "flag-1",
          userId: "target-user-1",
          flagType: "SYBIL_WALLET_CLUSTER",
          severity: "HIGH",
          status: "OPEN",
          details: { clusterSize: 5 },
          reviewedById: null,
          reviewedAt: null,
          resolutionNotes: null,
          createdAt: new Date("2026-10-28T10:00:00Z"),
          updatedAt: new Date("2026-10-28T10:00:00Z"),
        },
        {
          id: "flag-2",
          userId: "target-user-1",
          flagType: "BOT_ACTIVITY",
          severity: "MEDIUM",
          status: "UNDER_REVIEW",
          details: { speed: 12 },
          reviewedById: "mod-user-1",
          reviewedAt: new Date("2026-10-28T11:00:00Z"),
          resolutionNotes: "Checking telemetry",
          createdAt: new Date("2026-10-28T09:00:00Z"),
          updatedAt: new Date("2026-10-28T11:00:00Z"),
        },
      );
    });

    it("returns all flags with pagination and total count", async () => {
      const result = await listAbuseFlags(mockPrisma as any);
      expect(result.total).toBe(2);
      expect(result.flags).toHaveLength(2);
      expect(result.flags[0].id).toBe("flag-1");
      expect(result.flags[0].user?.wallet?.address).toBe(
        "0x1111111111111111111111111111111111111111",
      );
    });

    it("filters by status", async () => {
      const result = await listAbuseFlags(mockPrisma as any, {
        status: "UNDER_REVIEW",
      });
      expect(result.total).toBe(1);
      expect(result.flags[0].id).toBe("flag-2");
    });

    it("filters by flagType", async () => {
      const result = await listAbuseFlags(mockPrisma as any, {
        flagType: "SYBIL_WALLET_CLUSTER",
      });
      expect(result.total).toBe(1);
      expect(result.flags[0].id).toBe("flag-1");
    });

    it("filters by severity", async () => {
      const result = await listAbuseFlags(mockPrisma as any, {
        severity: "HIGH",
      });
      expect(result.total).toBe(1);
      expect(result.flags[0].id).toBe("flag-1");
    });

    it("throws 400 on invalid filter value", async () => {
      await expect(
        listAbuseFlags(mockPrisma as any, { flagType: "UNKNOWN_TYPE" }),
      ).rejects.toThrowError(AdminAbuseFlagError);

      await expect(
        listAbuseFlags(mockPrisma as any, { severity: "EXTREME" }),
      ).rejects.toThrowError(AdminAbuseFlagError);
    });
  });

  describe("getAbuseFlagById()", () => {
    beforeEach(() => {
      mockPrisma._store.abuseFlags.push({
        id: "flag-1",
        userId: "target-user-1",
        flagType: "SYBIL_WALLET_CLUSTER",
        severity: "HIGH",
        status: "OPEN",
        details: { clusterSize: 5 },
        reviewedById: null,
        reviewedAt: null,
        resolutionNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it("throws 400 if flagId is missing or blank", async () => {
      await expect(getAbuseFlagById(mockPrisma as any, "")).rejects.toThrowError(
        AdminAbuseFlagError,
      );
    });

    it("throws 404 if flag does not exist", async () => {
      await expect(
        getAbuseFlagById(mockPrisma as any, "non-existent-id"),
      ).rejects.toThrowError(AdminAbuseFlagError);
    });

    it("returns flag details with user", async () => {
      const flag = await getAbuseFlagById(mockPrisma as any, "flag-1");
      expect(flag.id).toBe("flag-1");
      expect(flag.user?.id).toBe("target-user-1");
    });
  });

  describe("updateAbuseFlag()", () => {
    beforeEach(() => {
      mockPrisma._store.abuseFlags.push({
        id: "flag-1",
        userId: "target-user-1",
        flagType: "SYBIL_WALLET_CLUSTER",
        severity: "HIGH",
        status: "OPEN",
        details: { clusterSize: 5 },
        reviewedById: null,
        reviewedAt: null,
        resolutionNotes: null,
        createdAt: new Date("2026-10-28T10:00:00Z"),
        updatedAt: new Date("2026-10-28T10:00:00Z"),
      });
    });

    it("successfully updates status to UNDER_REVIEW and logs audit", async () => {
      const fixedDate = new Date("2026-10-28T12:00:00Z");
      const result = await updateAbuseFlag(mockPrisma as any, {
        flagId: "flag-1",
        adminUserId: "mod-user-1",
        status: "UNDER_REVIEW",
        resolutionNotes: "Reviewing cluster transactions",
        ipAddress: "192.168.1.100",
        userAgent: "ModeratorBrowser/1.0",
        now: fixedDate,
      });

      expect(result.success).toBe(true);
      expect(result.flag.status).toBe("UNDER_REVIEW");
      expect(result.flag.resolutionNotes).toBe("Reviewing cluster transactions");
      expect(result.flag.reviewedById).toBe("mod-user-1");
      expect(result.flag.reviewedAt).toEqual(fixedDate);

      // Verify Audit Log
      expect(mockPrisma._store.auditLogs).toHaveLength(1);
      const audit = mockPrisma._store.auditLogs[0];
      expect(audit.actorId).toBe("mod-user-1");
      expect(audit.actorIp).toBe("192.168.1.100");
      expect(audit.userAgent).toBe("ModeratorBrowser/1.0");
      expect(audit.action).toBe("ABUSE_FLAG_UPDATED");
      expect(audit.entityType).toBe("AbuseFlag");
      expect(audit.entityId).toBe("flag-1");
      expect(audit.oldValues.status).toBe("OPEN");
      expect(audit.newValues.status).toBe("UNDER_REVIEW");
    });

    it("throws 404 if flag to update is not found", async () => {
      await expect(
        updateAbuseFlag(mockPrisma as any, {
          flagId: "non-existent-id",
          adminUserId: "mod-user-1",
          status: "DISMISSED",
        }),
      ).rejects.toThrowError(AdminAbuseFlagError);
    });

    it("rolls back transaction if audit log fails", async () => {
      mockPrisma.$transaction = vi.fn(async (cb: any) => {
        const { tx, rollback } = (mockPrisma as any)._createTx?.() || {
          tx: {
            abuseFlag: {
              findUnique: vi.fn().mockResolvedValue({ id: "flag-1", status: "OPEN" }),
              update: vi.fn().mockResolvedValue({ id: "flag-1", status: "DISMISSED" }),
            },
            auditLog: {
              create: vi.fn().mockRejectedValue(new Error("Audit DB down")),
            },
          },
          rollback: vi.fn(),
        };
        try {
          return await cb(tx);
        } catch (err) {
          rollback();
          throw err;
        }
      });

      await expect(
        updateAbuseFlag(mockPrisma as any, {
          flagId: "flag-1",
          adminUserId: "mod-user-1",
          status: "DISMISSED",
        }),
      ).rejects.toThrowError("Audit DB down");
    });
  });
});
