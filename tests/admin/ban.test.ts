import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  banUser,
  revokeBan,
  validateAdminBanInput,
  AdminBanError,
  VALID_BAN_TYPES,
  VALID_BAN_SCOPES,
} from "@/server/admin/ban";
import { claimDrop } from "@/server/drops/claim";
import { sendGift } from "@/server/inventory/gift";
import { evaluateUserQualification } from "@/server/whitelist/qualification";
import { validateSessionToken } from "@/server/auth/session";
import type { PrismaClient } from "@prisma/client";

function createMockPrisma() {
  const store = {
    users: [] as any[],
    adminRoles: [] as any[],
    bans: [] as any[],
    authSessions: [] as any[],
    auditLogs: [] as any[],
    wlSlots: [] as any[],
    wlQualifications: [] as any[],
    wlQueueEntries: [] as any[],
    wlPrograms: [] as any[],
    wlStatusHistories: [] as any[],
    drops: [] as any[],
    periods: [] as any[],
    poolItems: [] as any[],
    claims: [] as any[],
    inventoryItems: [] as any[],
    traits: [] as any[],
    gifts: [] as any[],
  };

  const hooks = {
    onAuditCreate: null as ((data: any) => Promise<void> | void) | null,
  };

  const createTxClient = () => {
    const uncommittedBans: any[] = [];
    const uncommittedAuditLogs: any[] = [];
    const userSnapshots: Array<{ id: string; isBanned: boolean }> = [];
    const sessionRevocations: Array<{ id: string; revokedAt: Date | null }> = [];
    const banMutationSnapshots: Array<{
      id: string;
      isActive: boolean;
      revokedAt: Date | null;
      revokedById: string | null;
    }> = [];

    const rollback = () => {
      for (const ban of uncommittedBans) {
        const idx = store.bans.indexOf(ban);
        if (idx !== -1) store.bans.splice(idx, 1);
      }
      for (const audit of uncommittedAuditLogs) {
        const idx = store.auditLogs.indexOf(audit);
        if (idx !== -1) store.auditLogs.splice(idx, 1);
      }
      for (const snap of userSnapshots) {
        const u = store.users.find((user) => user.id === snap.id);
        if (u) u.isBanned = snap.isBanned;
      }
      for (const snap of sessionRevocations) {
        const s = store.authSessions.find((sess) => sess.id === snap.id);
        if (s) s.revokedAt = snap.revokedAt;
      }
      for (const snap of banMutationSnapshots) {
        const b = store.bans.find((ban) => ban.id === snap.id);
        if (b) {
          b.isActive = snap.isActive;
          b.revokedAt = snap.revokedAt;
          b.revokedById = snap.revokedById;
        }
      }
    };

    const tx: any = {
      user: {
        findUnique: vi.fn(async ({ where }: any) => {
          const user = store.users.find((u) => u.id === where.id);
          if (!user) return null;
          const adminRole = store.adminRoles.find((r) => r.userId === user.id) || null;
          const banRecords = store.bans.filter((b) => b.userId === user.id && b.isActive);
          return { ...user, adminRole, banRecords };
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const u = store.users.find((user) => user.id === where.id);
          if (!u) throw new Error("User not found");
          userSnapshots.push({ id: u.id, isBanned: u.isBanned });
          if (data.isBanned !== undefined) {
            u.isBanned = data.isBanned;
          }
          return u;
        }),
      },
      adminRole: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.adminRoles.find((r) => r.userId === where.userId) || null;
        }),
      },
      banRecord: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.bans.find((b) => b.id === where.id) || null;
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.bans.find((b) => {
              if (b.userId !== where.userId) return false;
              if (!b.isActive) return false;
              if (where.scope?.in && !where.scope.in.includes(b.scope)) return false;
              if (typeof where.scope === "string" && b.scope !== where.scope)
                return false;
              if (where.OR && b.expiresAt) {
                const gtObj = where.OR.find((cond: any) => cond.expiresAt?.gt);
                if (gtObj && gtObj.expiresAt.gt >= b.expiresAt) return false;
              }
              return true;
            }) || null
          );
        }),
        create: vi.fn(async ({ data }: any) => {
          const record = {
            id: `ban-${store.bans.length + 1}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          store.bans.push(record);
          uncommittedBans.push(record);
          return record;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const ban = store.bans.find((b) => b.id === where.id);
          if (!ban) throw new Error("Ban record not found");
          banMutationSnapshots.push({
            id: ban.id,
            isActive: ban.isActive,
            revokedAt: ban.revokedAt ?? null,
            revokedById: ban.revokedById ?? null,
          });
          Object.assign(ban, data);
          return ban;
        }),
      },
      authSession: {
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const s of store.authSessions) {
            if (
              s.userId === where.userId &&
              (where.revokedAt === null ? s.revokedAt === null : true)
            ) {
              sessionRevocations.push({ id: s.id, revokedAt: s.revokedAt });
              s.revokedAt = data.revokedAt;
              count++;
            }
          }
          return { count };
        }),
      },
      auditLog: {
        create: vi.fn(async ({ data }: any) => {
          if (hooks.onAuditCreate) {
            await hooks.onAuditCreate(data);
          }
          const record = {
            id: `audit-${store.auditLogs.length + 1}`,
            ...data,
            createdAt: new Date(),
          };
          store.auditLogs.push(record);
          uncommittedAuditLogs.push(record);
          return record;
        }),
      },
      // Dropping, claiming, gifting, and qualification mocks
      wLSlot: {
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.wlSlots.find(
              (s) =>
                s.userId === where.userId &&
                (!where.status?.in || where.status.in.includes(s.status)),
            ) || null
          );
        }),
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.programId_userId) {
            return (
              store.wlSlots.find(
                (s) =>
                  s.programId === where.programId_userId.programId &&
                  s.userId === where.programId_userId.userId,
              ) || null
            );
          }
          return store.wlSlots.find((s) => s.id === where.id) || null;
        }),
      },
      dropPeriod: {
        findUnique: vi.fn(async ({ where }: any) => {
          const period = store.periods.find((p) => p.id === where.id);
          if (!period) return null;
          const drop = store.drops.find((d) => d.id === period.dropId);
          return { ...period, drop };
        }),
      },
      gift: {
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.gifts.find((g) => {
              if (where.senderId && g.senderId !== where.senderId) return false;
              if (where.createdAt?.gte && g.createdAt < where.createdAt.gte) return false;
              if (where.createdAt?.lt && g.createdAt >= where.createdAt.lt) return false;
              return true;
            }) || null
          );
        }),
      },
      inventoryItem: {
        findMany: vi.fn(async ({ where }: any) => {
          return store.inventoryItems
            .filter((item) => item.ownerId === where.ownerId)
            .map((item) => {
              const trait = store.traits.find((t) => t.id === item.traitId);
              return { ...item, trait };
            });
        }),
      },
      wLProgram: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.wlPrograms.find((p) => p.id === where.id) || null;
        }),
      },
      wLQualification: {
        findUnique: vi.fn(async ({ where }: any) => {
          return (
            store.wlQualifications.find(
              (q) =>
                q.programId === where.programId_userId.programId &&
                q.userId === where.programId_userId.userId,
            ) || null
          );
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const q = store.wlQualifications.find((item) => item.id === where.id);
          if (q) Object.assign(q, data);
          return q;
        }),
      },
      wLStatusHistory: {
        create: vi.fn(async ({ data }: any) => {
          const record = { id: `hist-${store.wlStatusHistories.length + 1}`, ...data };
          store.wlStatusHistories.push(record);
          return record;
        }),
      },
    };

    return { tx, rollback };
  };

  const prisma: any = {
    _store: store,
    _hooks: hooks,
    $transaction: vi.fn(async (callback: any) => {
      const { tx, rollback } = createTxClient();
      try {
        return await callback(tx);
      } catch (err) {
        rollback();
        throw err;
      }
    }),
    user: {
      findUnique: vi.fn(async ({ where }: any) => {
        const user = store.users.find((u) => u.id === where.id);
        if (!user) return null;
        const adminRole = store.adminRoles.find((r) => r.userId === user.id) || null;
        return { ...user, adminRole };
      }),
    },
    adminRole: {
      findUnique: vi.fn(async ({ where }: any) => {
        return store.adminRoles.find((r) => r.userId === where.userId) || null;
      }),
    },
    banRecord: {
      findFirst: vi.fn(async ({ where }: any) => {
        return (
          store.bans.find((b) => {
            if (b.userId !== where.userId) return false;
            if (!b.isActive) return false;
            if (where.scope?.in && !where.scope.in.includes(b.scope)) return false;
            if (typeof where.scope === "string" && b.scope !== where.scope) return false;
            if (where.OR && b.expiresAt) {
              const gtObj = where.OR.find((cond: any) => cond.expiresAt?.gt);
              if (gtObj && gtObj.expiresAt.gt >= b.expiresAt) return false;
            }
            return true;
          }) || null
        );
      }),
    },
    authSession: {
      findUnique: vi.fn(async ({ where }: any) => {
        const s = store.authSessions.find((sess) => sess.token === where.token);
        if (!s) return null;
        const u = store.users.find((user) => user.id === s.userId);
        return {
          ...s,
          user: { isBanned: u?.isBanned ?? false, wallet: { address: "0xuser" } },
        };
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => {
        const record = {
          id: `audit-${store.auditLogs.length + 1}`,
          ...data,
          createdAt: new Date(),
        };
        store.auditLogs.push(record);
        return record;
      }),
    },
  };

  return prisma;
}

describe("Admin Ban Service (banUser)", () => {
  let mockPrisma: any;
  const now = new Date("2026-10-17T12:00:00Z");

  beforeEach(() => {
    mockPrisma = createMockPrisma();

    // Setup acting admin
    mockPrisma._store.users.push({
      id: "admin-1",
      role: "ADMIN",
      isBanned: false,
    });
    mockPrisma._store.adminRoles.push({
      id: "role-admin-1",
      userId: "admin-1",
      roleType: "ADMIN",
      permissions: ["MANAGE_BANS"],
    });

    // Setup super admin
    mockPrisma._store.users.push({
      id: "super-admin-1",
      role: "SUPER_ADMIN",
      isBanned: false,
    });
    mockPrisma._store.adminRoles.push({
      id: "role-super-1",
      userId: "super-admin-1",
      roleType: "SUPER_ADMIN",
      permissions: ["*"],
    });

    // Setup regular target user
    mockPrisma._store.users.push({
      id: "user-target-1",
      role: "USER",
      isBanned: false,
    });
  });

  describe("Input Validation", () => {
    it("rejects missing or empty userId", () => {
      expect(() =>
        validateAdminBanInput({
          userId: "",
          adminUserId: "admin-1",
          reason: "Abusive botting",
        }),
      ).toThrowError(/Target userId is required/);

      expect(() =>
        validateAdminBanInput({
          userId: "   ",
          adminUserId: "admin-1",
          reason: "Abusive botting",
        }),
      ).toThrowError(/Target userId is required/);
    });

    it("rejects missing or empty adminUserId", () => {
      expect(() =>
        validateAdminBanInput({
          userId: "user-target-1",
          adminUserId: "",
          reason: "Abusive botting",
        }),
      ).toThrowError(/Admin authentication is required/);
    });

    it("rejects missing or whitespace-only reason", () => {
      expect(() =>
        validateAdminBanInput({
          userId: "user-target-1",
          adminUserId: "admin-1",
          reason: "",
        }),
      ).toThrowError(/non-empty ban reason is required/);

      expect(() =>
        validateAdminBanInput({
          userId: "user-target-1",
          adminUserId: "admin-1",
          reason: "   ",
        }),
      ).toThrowError(/non-empty ban reason is required/);
    });

    it("rejects invalid ban type", () => {
      expect(() =>
        validateAdminBanInput({
          userId: "user-target-1",
          adminUserId: "admin-1",
          reason: "Abusive behavior",
          banType: "INVALID_BAN_TYPE" as any,
        }),
      ).toThrowError(/Invalid ban type/);
    });

    it("rejects invalid ban scope", () => {
      expect(() =>
        validateAdminBanInput({
          userId: "user-target-1",
          adminUserId: "admin-1",
          reason: "Abusive behavior",
          scope: "GLOBAL_NUKE" as any,
        }),
      ).toThrowError(/Invalid ban scope/);
    });

    it("rejects temporary ban without future expiresAt", () => {
      expect(() =>
        validateAdminBanInput({
          userId: "user-target-1",
          adminUserId: "admin-1",
          reason: "Temporary cooldown",
          banType: "TEMPORARY",
          now,
        }),
      ).toThrowError(/Temporary bans require a valid future expiresAt/);

      expect(() =>
        validateAdminBanInput({
          userId: "user-target-1",
          adminUserId: "admin-1",
          reason: "Temporary cooldown",
          banType: "TEMPORARY",
          expiresAt: new Date(now.getTime() - 1000), // in the past
          now,
        }),
      ).toThrowError(/expiresAt must be a date in the future/);
    });

    it("defaults to PERMANENT and FULL_SYSTEM when omitted", () => {
      const validated = validateAdminBanInput({
        userId: "user-target-1",
        adminUserId: "admin-1",
        reason: "Sybil attack detected",
      });

      expect(validated.banType).toBe("PERMANENT");
      expect(validated.scope).toBe("FULL_SYSTEM");
      expect(validated.evidence).toBeNull();
      expect(validated.expiresAt).toBeNull();
    });
  });

  describe("Authority & Permission Hierarchy", () => {
    it("prevents self-banning", async () => {
      await expect(
        banUser(mockPrisma, {
          userId: "admin-1",
          adminUserId: "admin-1",
          reason: "Accidental self ban",
          now,
        }),
      ).rejects.toThrow("Administrators cannot ban their own account.");
    });

    it("protects SUPER_ADMIN from being banned", async () => {
      await expect(
        banUser(mockPrisma, {
          userId: "super-admin-1",
          adminUserId: "admin-1",
          reason: "Attempting to ban super admin",
          now,
        }),
      ).rejects.toThrow("Super administrators cannot be banned.");
    });

    it("prevents regular admin from banning another admin", async () => {
      mockPrisma._store.users.push({
        id: "admin-peer-2",
        role: "ADMIN",
        isBanned: false,
      });
      mockPrisma._store.adminRoles.push({
        id: "role-admin-2",
        userId: "admin-peer-2",
        roleType: "ADMIN",
        permissions: ["MANAGE_DROPS"],
      });

      await expect(
        banUser(mockPrisma, {
          userId: "admin-peer-2",
          adminUserId: "admin-1",
          reason: "Peer dispute",
          now,
        }),
      ).rejects.toThrow("Only super administrators can ban administrative accounts.");
    });

    it("allows SUPER_ADMIN to ban an ADMIN account", async () => {
      mockPrisma._store.users.push({
        id: "admin-rogue",
        role: "ADMIN",
        isBanned: false,
      });
      mockPrisma._store.adminRoles.push({
        id: "role-rogue",
        userId: "admin-rogue",
        roleType: "ADMIN",
        permissions: ["MANAGE_DROPS"],
      });

      const res = await banUser(mockPrisma, {
        userId: "admin-rogue",
        adminUserId: "super-admin-1",
        reason: "Compromised credential",
        now,
      });

      expect(res.success).toBe(true);
      expect(res.isBanned).toBe(true);
      expect(res.banRecord.userId).toBe("admin-rogue");
    });

    it("fails with 404 when target user does not exist", async () => {
      await expect(
        banUser(mockPrisma, {
          userId: "non-existent-user",
          adminUserId: "admin-1",
          reason: "Ghost user",
          now,
        }),
      ).rejects.toThrow("Target user does not exist.");
    });
  });

  describe("Execution & State Transitions", () => {
    it("successfully bans user with FULL_SYSTEM: creates BanRecord, sets isBanned=true, revokes sessions, logs audit", async () => {
      // Add active sessions for user
      mockPrisma._store.authSessions.push(
        { id: "sess-1", userId: "user-target-1", revokedAt: null },
        { id: "sess-2", userId: "user-target-1", revokedAt: null },
        { id: "sess-3", userId: "admin-1", revokedAt: null },
      );

      const res = await banUser(mockPrisma, {
        userId: "user-target-1",
        adminUserId: "admin-1",
        reason: "Multi-wallet sybil cluster",
        evidence: "https://etherscan.io/tx/0x123",
        now,
        ipAddress: "10.0.0.1",
        userAgent: "ChimpAdmin/1.0",
      });

      expect(res.success).toBe(true);
      expect(res.isBanned).toBe(true);
      expect(res.alreadyBanned).toBe(false);
      expect(res.banRecord).toBeDefined();
      expect(res.banRecord.scope).toBe("FULL_SYSTEM");
      expect(res.banRecord.banType).toBe("PERMANENT");
      expect(res.banRecord.reason).toBe("Multi-wallet sybil cluster");
      expect(res.banRecord.evidence).toBe("https://etherscan.io/tx/0x123");
      expect(res.banRecord.issuedById).toBe("admin-1");

      // Verify target user model updated
      const updatedUser = mockPrisma._store.users.find(
        (u: any) => u.id === "user-target-1",
      );
      expect(updatedUser?.isBanned).toBe(true);

      // Verify target sessions revoked
      const sess1 = mockPrisma._store.authSessions.find((s: any) => s.id === "sess-1");
      const sess2 = mockPrisma._store.authSessions.find((s: any) => s.id === "sess-2");
      const adminSess = mockPrisma._store.authSessions.find(
        (s: any) => s.id === "sess-3",
      );
      expect(sess1?.revokedAt).toEqual(now);
      expect(sess2?.revokedAt).toEqual(now);
      expect(adminSess?.revokedAt).toBeNull(); // admin session untouched

      // Verify AuditLog written
      const audit = mockPrisma._store.auditLogs.find(
        (l: any) => l.action === "BAN_USER" && l.entityId === "user-target-1",
      );
      expect(audit).toBeDefined();
      expect(audit.actorId).toBe("admin-1");
      expect(audit.actorIp).toBe("10.0.0.1");
      expect(audit.userAgent).toBe("ChimpAdmin/1.0");
      expect(audit.entityType).toBe("User");
      expect(audit.oldValues.isBanned).toBe(false);
      expect(audit.newValues.isBanned).toBe(true);
      expect(audit.newValues.scope).toBe("FULL_SYSTEM");
      expect(audit.metadata.revokedSessionsCount).toBe(2);
    });

    it("successfully creates a feature-scoped ban (CLAIM_RESTRICTED): does not set isBanned=true or revoke sessions", async () => {
      mockPrisma._store.authSessions.push({
        id: "sess-user-claim",
        userId: "user-target-1",
        revokedAt: null,
      });

      const res = await banUser(mockPrisma, {
        userId: "user-target-1",
        adminUserId: "admin-1",
        reason: "Rapid claim botting attempt",
        scope: "CLAIM_RESTRICTED",
        banType: "FEATURE_RESTRICTION",
        now,
      });

      expect(res.success).toBe(true);
      expect(res.isBanned).toBe(false); // FULL_SYSTEM is false, so user is not locked out of site
      expect(res.banRecord.scope).toBe("CLAIM_RESTRICTED");

      const user = mockPrisma._store.users.find((u: any) => u.id === "user-target-1");
      expect(user?.isBanned).toBe(false);

      const sess = mockPrisma._store.authSessions.find(
        (s: any) => s.id === "sess-user-claim",
      );
      expect(sess?.revokedAt).toBeNull(); // Sessions remain valid for profile viewing
    });

    it("successfully creates a TEMPORARY ban with expiresAt", async () => {
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days later
      const res = await banUser(mockPrisma, {
        userId: "user-target-1",
        adminUserId: "admin-1",
        reason: "7 day cooldown for suspicious gift loop",
        scope: "GIFT_RESTRICTED",
        banType: "TEMPORARY",
        expiresAt,
        now,
      });

      expect(res.success).toBe(true);
      expect(res.banRecord.banType).toBe("TEMPORARY");
      expect(res.banRecord.expiresAt).toEqual(expiresAt);
    });
  });

  describe("Idempotency & Repeated Requests", () => {
    it("handles repeated ban requests with same scope idempotently without duplicate records or audit errors", async () => {
      // First ban
      const res1 = await banUser(mockPrisma, {
        userId: "user-target-1",
        adminUserId: "admin-1",
        reason: "Initial sybil ban",
        now,
      });
      expect(res1.alreadyBanned).toBe(false);
      expect(mockPrisma._store.bans).toHaveLength(1);
      expect(mockPrisma._store.auditLogs).toHaveLength(1);

      // Repeated ban
      const res2 = await banUser(mockPrisma, {
        userId: "user-target-1",
        adminUserId: "admin-1",
        reason: "Repeated sybil ban request",
        now: new Date(now.getTime() + 1000),
      });

      expect(res2.success).toBe(true);
      expect(res2.alreadyBanned).toBe(true);
      expect(res2.banRecord.id).toBe(res1.banRecord.id);
      expect(mockPrisma._store.bans).toHaveLength(1); // No duplicate ban record
      expect(mockPrisma._store.auditLogs).toHaveLength(1); // No redundant audit log
    });

    it("handles narrower scope request idempotently when user already holds a FULL_SYSTEM ban", async () => {
      // User is already full system banned
      await banUser(mockPrisma, {
        userId: "user-target-1",
        adminUserId: "admin-1",
        reason: "Permanent system expulsion",
        scope: "FULL_SYSTEM",
        now,
      });

      // Admin subsequently issues CLAIM_RESTRICTED to the same user
      const resNarrower = await banUser(mockPrisma, {
        userId: "user-target-1",
        adminUserId: "admin-1",
        reason: "Restricting claims",
        scope: "CLAIM_RESTRICTED",
        now: new Date(now.getTime() + 1000),
      });

      expect(resNarrower.success).toBe(true);
      expect(resNarrower.alreadyBanned).toBe(true);
      expect(resNarrower.banRecord.scope).toBe("FULL_SYSTEM");
      expect(mockPrisma._store.bans).toHaveLength(1);
    });

    it("escalates from narrower scope to FULL_SYSTEM cleanly", async () => {
      // Initial gift restriction
      await banUser(mockPrisma, {
        userId: "user-target-1",
        adminUserId: "admin-1",
        reason: "Suspicious gifting",
        scope: "GIFT_RESTRICTED",
        now,
      });
      expect(mockPrisma._store.bans).toHaveLength(1);

      // Escalation to FULL_SYSTEM
      const resFull = await banUser(mockPrisma, {
        userId: "user-target-1",
        adminUserId: "admin-1",
        reason: "Confirmed sybil bot farm",
        scope: "FULL_SYSTEM",
        now: new Date(now.getTime() + 1000),
      });

      expect(resFull.success).toBe(true);
      expect(resFull.alreadyBanned).toBe(false);
      expect(resFull.isBanned).toBe(true);
      expect(mockPrisma._store.bans).toHaveLength(2);
      expect(mockPrisma._store.auditLogs).toHaveLength(2);
    });
  });

  describe("Transactional Consistency & Audit Rollback", () => {
    it("rolls back user isBanned, sessions, and banRecord when auditLog creation fails", async () => {
      mockPrisma._store.authSessions.push({
        id: "sess-rollback",
        userId: "user-target-1",
        revokedAt: null,
      });

      // Hook audit create to simulate database constraint failure
      mockPrisma._hooks.onAuditCreate = () => {
        throw new Error("Audit database disk full");
      };

      await expect(
        banUser(mockPrisma, {
          userId: "user-target-1",
          adminUserId: "admin-1",
          reason: "Sybil detection",
          now,
        }),
      ).rejects.toThrow("Audit database disk full");

      // Verify full rollback: no ban record, isBanned still false, session unrevoked
      expect(mockPrisma._store.bans).toHaveLength(0);
      const user = mockPrisma._store.users.find((u: any) => u.id === "user-target-1");
      expect(user?.isBanned).toBe(false);

      const sess = mockPrisma._store.authSessions.find(
        (s: any) => s.id === "sess-rollback",
      );
      expect(sess?.revokedAt).toBeNull();
    });
  });

  describe("Integration with Drops, Gifts, Whitelist, and Preservations", () => {
    it("banned user cannot claim drops when banned under FULL_SYSTEM or CLAIM_RESTRICTED", async () => {
      mockPrisma._store.drops.push({ id: "drop-1", status: "ACTIVE" });
      mockPrisma._store.periods.push({
        id: "period-1",
        dropId: "drop-1",
        status: "ACTIVE",
        startsAt: new Date(now.getTime() - 5 * 60 * 1000), // active window
      });

      // Ban user from claims
      await banUser(mockPrisma, {
        userId: "user-target-1",
        adminUserId: "admin-1",
        reason: "Claim botting",
        scope: "CLAIM_RESTRICTED",
        now,
      });

      await expect(
        claimDrop(mockPrisma, {
          userId: "user-target-1",
          dropId: "drop-1",
          periodId: "period-1",
          now,
        }),
      ).rejects.toThrow("Your account is restricted from claiming drops.");
    });

    it("banned user cannot send or receive gifts when banned under FULL_SYSTEM or GIFT_RESTRICTED", async () => {
      mockPrisma._store.users.push({ id: "user-other", role: "USER", isBanned: false });
      mockPrisma._store.inventoryItems.push({
        id: "item-1",
        ownerId: "user-target-1",
        traitId: "trait-1",
        isLocked: false,
      });

      await banUser(mockPrisma, {
        userId: "user-target-1",
        adminUserId: "admin-1",
        reason: "Gift scam",
        scope: "GIFT_RESTRICTED",
        now,
      });

      await expect(
        sendGift(mockPrisma, {
          senderId: "user-target-1",
          receiverId: "user-other",
          inventoryItemId: "item-1",
          now,
        }),
      ).rejects.toThrow("Your account is restricted from gifting.");

      await expect(
        sendGift(mockPrisma, {
          senderId: "user-other",
          receiverId: "user-target-1",
          inventoryItemId: "item-1",
          now,
        }),
      ).rejects.toThrow("The recipient is restricted from receiving gifts.");
    });

    it("preserves already successful claims and inventory items when a user is banned", async () => {
      // Existing claim and inventory
      const existingClaim = {
        id: "claim-success-1",
        userId: "user-target-1",
        dropId: "drop-1",
        periodId: "period-1",
        inventoryItemId: "inv-item-1",
        status: "SUCCESS",
        claimedAt: new Date(now.getTime() - 3600000),
      };
      const existingItem = {
        id: "inv-item-1",
        ownerId: "user-target-1",
        traitId: "trait-bg-1",
        edition: 1,
        isLocked: false,
      };
      mockPrisma._store.claims.push(existingClaim);
      mockPrisma._store.inventoryItems.push(existingItem);

      // Ban user
      await banUser(mockPrisma, {
        userId: "user-target-1",
        adminUserId: "admin-1",
        reason: "Retroactive sybil investigation",
        scope: "FULL_SYSTEM",
        now,
      });

      // Verify claims and inventory are STRICTLY preserved
      const claim = mockPrisma._store.claims.find((c: any) => c.id === "claim-success-1");
      expect(claim).toBeDefined();
      expect(claim?.status).toBe("SUCCESS");

      const item = mockPrisma._store.inventoryItems.find(
        (i: any) => i.id === "inv-item-1",
      );
      expect(item).toBeDefined();
      expect(item?.ownerId).toBe("user-target-1");
    });

    it("preserves an already allocated WL slot (Task 1-E will implement Slot Revoke)", async () => {
      mockPrisma._store.wlPrograms.push({
        id: "prog-1",
        status: "OPEN",
        totalSlots: 100,
        allocatedSlotsCount: 1,
      });
      mockPrisma._store.wlSlots.push({
        id: "slot-1",
        programId: "prog-1",
        userId: "user-target-1",
        slotNumber: 1,
        status: "ALLOCATED",
      });

      // Ban the user
      await banUser(mockPrisma, {
        userId: "user-target-1",
        adminUserId: "admin-1",
        reason: "Suspected Sybil",
        scope: "WL_DISQUALIFIED",
        now,
      });

      // Slot must still exist with status ALLOCATED
      const slot = mockPrisma._store.wlSlots.find((s: any) => s.id === "slot-1");
      expect(slot).toBeDefined();
      expect(slot?.status).toBe("ALLOCATED");
    });
  });

  describe("Temporary Ban Expiration Semantics — banUser", () => {
    it("temporary CLAIM_RESTRICTED ban blocks claims during validity and stops applying after expiresAt", async () => {
      mockPrisma._store.drops.push({ id: "drop-exp", status: "ACTIVE" });
      mockPrisma._store.periods.push({
        id: "period-exp",
        dropId: "drop-exp",
        status: "ACTIVE",
        startsAt: new Date(now.getTime() - 5 * 60 * 1000),
      });

      const banExpiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour later

      // 1. Issue temporary ban
      await banUser(mockPrisma, {
        userId: "user-target-1",
        adminUserId: "admin-1",
        reason: "Temporary 1 hour claim cooldown",
        scope: "CLAIM_RESTRICTED",
        banType: "TEMPORARY",
        expiresAt: banExpiresAt,
        now,
      });

      // 2. Active ban blocks claims during the active window
      const duringBan = new Date(now.getTime() + 30 * 60 * 1000); // 30 mins in
      await expect(
        claimDrop(mockPrisma, {
          userId: "user-target-1",
          dropId: "drop-exp",
          periodId: "period-exp",
          now: duringBan,
        }),
      ).rejects.toThrow("Your account is restricted from claiming drops.");

      // 3. After expiresAt, ban stops applying (fails period window or succeeds, not USER_BANNED_FROM_CLAIMS)
      const afterBan = new Date(banExpiresAt.getTime() + 1000); // 1 second after expiration
      // Advance period so claim window matches afterBan
      const period = mockPrisma._store.periods.find((p: any) => p.id === "period-exp")!;
      period.startsAt = afterBan;

      // Will fail on lack of pool items or period setup, NOT on user banned
      try {
        await claimDrop(mockPrisma, {
          userId: "user-target-1",
          dropId: "drop-exp",
          periodId: "period-exp",
          now: afterBan,
        });
      } catch (err: any) {
        expect(err.code).not.toBe("USER_BANNED_FROM_CLAIMS");
      }
    });

    it("temporary GIFT_RESTRICTED ban stops restricting gifts after expiresAt", async () => {
      mockPrisma._store.users.push({
        id: "user-receiver-exp",
        role: "USER",
        isBanned: false,
      });
      mockPrisma._store.inventoryItems.push({
        id: "item-gift-exp",
        ownerId: "user-target-1",
        traitId: "trait-gift-1",
        isLocked: false,
      });

      const banExpiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours later

      await banUser(mockPrisma, {
        userId: "user-target-1",
        adminUserId: "admin-1",
        reason: "Temporary gift block",
        scope: "GIFT_RESTRICTED",
        banType: "TEMPORARY",
        expiresAt: banExpiresAt,
        now,
      });

      // During ban: blocked
      await expect(
        sendGift(mockPrisma, {
          senderId: "user-target-1",
          receiverId: "user-receiver-exp",
          inventoryItemId: "item-gift-exp",
          now: new Date(now.getTime() + 60 * 60 * 1000),
        }),
      ).rejects.toThrow("Your account is restricted from gifting.");

      // After expiresAt: sender ban check passes (may fail on inventory duplicate check, but NOT SENDER_GIFT_RESTRICTED)
      try {
        await sendGift(mockPrisma, {
          senderId: "user-target-1",
          receiverId: "user-receiver-exp",
          inventoryItemId: "item-gift-exp",
          now: new Date(banExpiresAt.getTime() + 1000),
        });
      } catch (err: any) {
        expect(err.code).not.toBe("SENDER_GIFT_RESTRICTED");
      }
    });

    it("idempotency allows issuing a new ban if previous temporary ban has expired", async () => {
      const pastExpiry = new Date(now.getTime() + 3600000); // 1 hour later

      // First ban
      await banUser(mockPrisma, {
        userId: "user-target-1",
        adminUserId: "admin-1",
        reason: "Initial temporary ban",
        scope: "CLAIM_RESTRICTED",
        banType: "TEMPORARY",
        expiresAt: pastExpiry,
        now,
      });
      expect(mockPrisma._store.bans).toHaveLength(1);

      // Now time advances beyond expiration
      const futureNow = new Date(pastExpiry.getTime() + 10000);
      const newExpiry = new Date(futureNow.getTime() + 3600000);

      // Second ban after first has expired
      const resNew = await banUser(mockPrisma, {
        userId: "user-target-1",
        adminUserId: "admin-1",
        reason: "New infraction after previous ban expired",
        scope: "CLAIM_RESTRICTED",
        banType: "TEMPORARY",
        expiresAt: newExpiry,
        now: futureNow,
      });

      expect(resNew.success).toBe(true);
      expect(resNew.alreadyBanned).toBe(false); // Recognized that prior temporary ban expired
      expect(mockPrisma._store.bans).toHaveLength(2);
    });
  });
});

describe("Admin Ban Service (revokeBan)", () => {
  let mockPrisma: any;
  const now = new Date("2026-10-17T12:00:00Z");

  beforeEach(() => {
    mockPrisma = createMockPrisma();

    // Acting admin
    mockPrisma._store.users.push({
      id: "admin-1",
      role: "ADMIN",
      isBanned: false,
    });
    mockPrisma._store.adminRoles.push({
      id: "role-admin-1",
      userId: "admin-1",
      roleType: "ADMIN",
      permissions: ["MANAGE_BANS"],
    });

    // Super admin
    mockPrisma._store.users.push({
      id: "super-admin-1",
      role: "SUPER_ADMIN",
      isBanned: false,
    });

    // Regular target user
    mockPrisma._store.users.push({
      id: "user-target-1",
      role: "USER",
      isBanned: true,
    });
  });

  describe("Input Validation", () => {
    it("rejects missing or empty adminUserId", async () => {
      await expect(
        revokeBan(mockPrisma, {
          banId: "ban-1",
          adminUserId: "",
        }),
      ).rejects.toThrow("Admin authentication is required.");

      await expect(
        revokeBan(mockPrisma, {
          banId: "ban-1",
          adminUserId: "   ",
        }),
      ).rejects.toThrow("Admin authentication is required.");
    });

    it("rejects missing or empty banId", async () => {
      await expect(
        revokeBan(mockPrisma, {
          banId: "",
          adminUserId: "admin-1",
        }),
      ).rejects.toThrow("banId is required.");

      await expect(
        revokeBan(mockPrisma, {
          banId: "   ",
          adminUserId: "admin-1",
        }),
      ).rejects.toThrow("banId is required.");
    });
  });

  describe("Ban Record Lookups & Guard Conditions", () => {
    it("throws BAN_NOT_FOUND with 404 when banId does not exist", async () => {
      await expect(
        revokeBan(mockPrisma, {
          banId: "non-existent-ban",
          adminUserId: "admin-1",
          now,
        }),
      ).rejects.toMatchObject({ code: "BAN_NOT_FOUND", status: 404 });
    });

    it("throws BAN_ALREADY_INACTIVE with 409 when ban is already inactive", async () => {
      mockPrisma._store.bans.push({
        id: "ban-inactive",
        userId: "user-target-1",
        scope: "FULL_SYSTEM",
        banType: "PERMANENT",
        isActive: false,
        expiresAt: null,
        revokedAt: new Date(now.getTime() - 1000),
        revokedById: "admin-1",
      });

      await expect(
        revokeBan(mockPrisma, {
          banId: "ban-inactive",
          adminUserId: "admin-1",
          now,
        }),
      ).rejects.toMatchObject({ code: "BAN_ALREADY_INACTIVE", status: 409 });
    });
  });

  describe("Successful Execution & State Transitions", () => {
    it("revokes a FULL_SYSTEM PERMANENT ban: marks isActive=false, restores isBanned=false, emits AuditLog", async () => {
      mockPrisma._store.bans.push({
        id: "ban-perm-1",
        userId: "user-target-1",
        scope: "FULL_SYSTEM",
        banType: "PERMANENT",
        isActive: true,
        expiresAt: null,
        revokedAt: null,
        revokedById: null,
      });

      const result = await revokeBan(mockPrisma, {
        banId: "ban-perm-1",
        adminUserId: "admin-1",
        reason: "Appeal accepted — identity verified.",
        now,
        ipAddress: "10.0.0.1",
        userAgent: "ChimpAdmin/1.0",
      });

      expect(result.success).toBe(true);
      expect(result.banId).toBe("ban-perm-1");
      expect(result.isActive).toBe(false);
      expect(result.revokedAt).toEqual(now);
      expect(result.auditLogId).toBeDefined();

      // Ban record deactivated
      const ban = mockPrisma._store.bans.find((b: any) => b.id === "ban-perm-1");
      expect(ban?.isActive).toBe(false);
      expect(ban?.revokedAt).toEqual(now);
      expect(ban?.revokedById).toBe("admin-1");

      // User.isBanned restored to false (no remaining FULL_SYSTEM bans)
      const user = mockPrisma._store.users.find((u: any) => u.id === "user-target-1");
      expect(user?.isBanned).toBe(false);

      // AuditLog written
      const audit = mockPrisma._store.auditLogs.find(
        (l: any) => l.action === "REVOKE_BAN" && l.entityId === "ban-perm-1",
      );
      expect(audit).toBeDefined();
      expect(audit.actorId).toBe("admin-1");
      expect(audit.actorIp).toBe("10.0.0.1");
      expect(audit.userAgent).toBe("ChimpAdmin/1.0");
      expect(audit.entityType).toBe("BanRecord");
      expect(audit.oldValues.isActive).toBe(true);
      expect(audit.newValues.isActive).toBe(false);
      expect(audit.metadata.reason).toBe("Appeal accepted — identity verified.");
    });

    it("revokes a feature-scoped ban (CLAIM_RESTRICTED): does NOT alter user.isBanned", async () => {
      // User has a FULL_SYSTEM ban keeping isBanned=true
      mockPrisma._store.bans.push({
        id: "ban-full",
        userId: "user-target-1",
        scope: "FULL_SYSTEM",
        banType: "PERMANENT",
        isActive: true,
        expiresAt: null,
        revokedAt: null,
        revokedById: null,
      });
      // Also a CLAIM_RESTRICTED ban to revoke
      mockPrisma._store.bans.push({
        id: "ban-claim",
        userId: "user-target-1",
        scope: "CLAIM_RESTRICTED",
        banType: "FEATURE_RESTRICTION",
        isActive: true,
        expiresAt: null,
        revokedAt: null,
        revokedById: null,
      });

      await revokeBan(mockPrisma, {
        banId: "ban-claim",
        adminUserId: "admin-1",
        now,
      });

      // Feature-scoped ban deactivated
      const claimBan = mockPrisma._store.bans.find((b: any) => b.id === "ban-claim");
      expect(claimBan?.isActive).toBe(false);

      // isBanned remains true — FULL_SYSTEM ban still active
      const user = mockPrisma._store.users.find((u: any) => u.id === "user-target-1");
      expect(user?.isBanned).toBe(true);
    });

    it("preserves isBanned=true when multiple FULL_SYSTEM bans exist and only one is revoked", async () => {
      // Two FULL_SYSTEM bans
      mockPrisma._store.bans.push(
        {
          id: "ban-full-a",
          userId: "user-target-1",
          scope: "FULL_SYSTEM",
          banType: "PERMANENT",
          isActive: true,
          expiresAt: null,
          revokedAt: null,
          revokedById: null,
        },
        {
          id: "ban-full-b",
          userId: "user-target-1",
          scope: "FULL_SYSTEM",
          banType: "TEMPORARY",
          isActive: true,
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          revokedAt: null,
          revokedById: null,
        },
      );

      await revokeBan(mockPrisma, {
        banId: "ban-full-a",
        adminUserId: "super-admin-1",
        now,
      });

      // ban-full-a deactivated
      const banA = mockPrisma._store.bans.find((b: any) => b.id === "ban-full-a");
      expect(banA?.isActive).toBe(false);

      // isBanned stays true — ban-full-b is still active
      const user = mockPrisma._store.users.find((u: any) => u.id === "user-target-1");
      expect(user?.isBanned).toBe(true);
    });

    it("restores isBanned=false once the last FULL_SYSTEM ban is revoked", async () => {
      mockPrisma._store.bans.push({
        id: "ban-last-full",
        userId: "user-target-1",
        scope: "FULL_SYSTEM",
        banType: "PERMANENT",
        isActive: true,
        expiresAt: null,
        revokedAt: null,
        revokedById: null,
      });

      await revokeBan(mockPrisma, {
        banId: "ban-last-full",
        adminUserId: "admin-1",
        now,
      });

      const user = mockPrisma._store.users.find((u: any) => u.id === "user-target-1");
      expect(user?.isBanned).toBe(false);
    });

    it("revokes a TEMPORARY ban before its expiry and emits correct metadata", async () => {
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      mockPrisma._store.bans.push({
        id: "ban-temp-1",
        userId: "user-target-1",
        scope: "GIFT_RESTRICTED",
        banType: "TEMPORARY",
        isActive: true,
        expiresAt,
        revokedAt: null,
        revokedById: null,
      });

      const result = await revokeBan(mockPrisma, {
        banId: "ban-temp-1",
        adminUserId: "admin-1",
        reason: "Situation resolved early.",
        now,
      });

      expect(result.success).toBe(true);
      expect(result.isActive).toBe(false);

      const audit = mockPrisma._store.auditLogs.find(
        (l: any) => l.action === "REVOKE_BAN" && l.entityId === "ban-temp-1",
      );
      expect(audit).toBeDefined();
      expect(audit.metadata.bannedScope).toBe("GIFT_RESTRICTED");
      expect(audit.metadata.reason).toBe("Situation resolved early.");
    });
  });

  describe("Transactional Consistency", () => {
    it("rolls back ban deactivation and isBanned restoration when auditLog creation fails", async () => {
      mockPrisma._store.bans.push({
        id: "ban-rollback",
        userId: "user-target-1",
        scope: "FULL_SYSTEM",
        banType: "PERMANENT",
        isActive: true,
        expiresAt: null,
        revokedAt: null,
        revokedById: null,
      });

      // Hook audit create to simulate failure
      mockPrisma._hooks.onAuditCreate = () => {
        throw new Error("Disk full — audit write failed");
      };

      await expect(
        revokeBan(mockPrisma, {
          banId: "ban-rollback",
          adminUserId: "admin-1",
          now,
        }),
      ).rejects.toThrow("Disk full — audit write failed");

      // Ban record must still be active (rollback)
      const ban = mockPrisma._store.bans.find((b: any) => b.id === "ban-rollback");
      expect(ban?.isActive).toBe(true);
      expect(ban?.revokedAt).toBeNull();

      // User isBanned unchanged
      const user = mockPrisma._store.users.find((u: any) => u.id === "user-target-1");
      expect(user?.isBanned).toBe(true);
    });
  });
});
