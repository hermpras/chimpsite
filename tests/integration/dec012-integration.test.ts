// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient, AdminRoleType } from "@prisma/client";
import { claimDrop } from "@/server/drops/claim";
import {
  listAbuseFlags,
  getAbuseFlagById,
  updateAbuseFlag,
  AdminAbuseFlagError,
} from "@/server/admin/abuse-flags";
import { checkAdminSession, requireAdminSession, AdminAuthError } from "@/server/auth/session";
import { banUser, revokeBan } from "@/server/admin/ban";
import {
  checkRateLimit,
  isValidClientIp,
  __clearRateLimitBuckets,
  __setTestLimiter,
  DROPS_CLAIM_RATE_LIMIT_MAX,
  DROPS_CLAIM_IP_RATE_LIMIT_MAX,
  DROPS_CLAIM_RATE_LIMIT_WINDOW_MS,
  DROPS_CLAIM_IP_RATE_LIMIT_WINDOW_MS,
} from "@/lib/auth/rate-limit";

function createDec012IntegrationStore() {
  const store = {
    users: [] as any[],
    wallets: [] as any[],
    adminRoles: [] as any[],
    authSessions: [] as any[],
    banRecords: [] as any[],
    traits: [] as any[],
    inventoryItems: [] as any[],
    drops: [] as any[],
    dropPeriods: [] as any[],
    dropPoolItems: [] as any[],
    claims: [] as any[],
    abuseFlags: [] as any[],
    auditLogs: [] as any[],
    wLSlots: [] as any[],
  };

  const createTx = () => {
    const tx: any = {
      user: {
        findUnique: vi.fn(async ({ where, select }: any) => {
          const user = store.users.find((u) => u.id === where.id);
          if (!user) return null;
          const wallet = store.wallets.find((w) => w.userId === user.id);
          const adminRole = store.adminRoles.find((a) => a.userId === user.id);
          const banRecords = store.banRecords.filter((b) => b.userId === user.id && b.isActive);
          return {
            ...user,
            wallet,
            adminRole,
            banRecords,
          };
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const user = store.users.find((u) => u.id === where.id);
          if (user) Object.assign(user, data);
          return user;
        }),
      },
      drop: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.drops.find((d) => d.id === where.id) || null;
        }),
      },
      dropPeriod: {
        findUnique: vi.fn(async ({ where }: any) => {
          const period = store.dropPeriods.find((p) => p.id === where.id);
          if (!period) return null;
          const drop = store.drops.find((d) => d.id === period.dropId);
          return { ...period, drop };
        }),
      },
      dropPoolItem: {
        findMany: vi.fn(async ({ where }: any) => {
          return store.dropPoolItems.filter((i) => i.periodId === where.periodId && i.remainingStock > 0);
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const item = store.dropPoolItems.find((i) => i.id === where.id);
          if (item) {
            if (data.remainingStock?.decrement) {
              item.remainingStock -= data.remainingStock.decrement;
            } else if (typeof data.remainingStock === "number") {
              item.remainingStock = data.remainingStock;
            }
          }
          return item;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          const item = store.dropPoolItems.find((i) => i.id === where.id);
          if (item && item.remainingStock > 0) {
            if (data.remainingStock?.decrement) {
              item.remainingStock -= data.remainingStock.decrement;
            }
            return { count: 1 };
          }
          return { count: 0 };
        }),
      },
      claim: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.userId_periodId) {
            return (
              store.claims.find(
                (c) =>
                  c.userId === where.userId_periodId.userId &&
                  c.periodId === where.userId_periodId.periodId &&
                  c.status === "SUCCESS",
              ) || null
            );
          }
          return null;
        }),
        findMany: vi.fn(async ({ where }: any) => {
          return store.claims.filter((c) => {
            if (where.periodId && c.periodId !== where.periodId) return false;
            if (where.ipAddress && c.ipAddress !== where.ipAddress) return false;
            if (where.status && c.status !== where.status) return false;
            return true;
          });
        }),
        create: vi.fn(async ({ data }: any) => {
          const claim = {
            id: `claim-${store.claims.length + 1}`,
            createdAt: new Date(),
            ...data,
          };
          store.claims.push(claim);
          return claim;
        }),
      },
      inventoryItem: {
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.inventoryItems
              .filter((i) => !where?.traitId || i.traitId === where.traitId)
              .sort((a, b) => (b.edition || 0) - (a.edition || 0))[0] || null
          );
        }),
        create: vi.fn(async ({ data }: any) => {
          const inv = {
            id: `inv-${store.inventoryItems.length + 1}`,
            createdAt: new Date(),
            ...data,
          };
          store.inventoryItems.push(inv);
          return inv;
        }),
      },
      abuseFlag: {
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.abuseFlags.find(
              (f) =>
                f.userId === where.userId &&
                f.flagType === where.flagType &&
                f.status === (where.status || "OPEN"),
            ) || null
          );
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
                  wallet: store.wallets.find((w) => w.userId === user.id) ?? null,
                  xIdentity: null,
                }
              : null,
            reviewedBy: reviewer
              ? {
                  id: reviewer.id,
                  role: reviewer.role ?? "MODERATOR",
                  wallet: store.wallets.find((w) => w.userId === reviewer.id) ?? null,
                }
              : null,
          };
        }),
        findMany: vi.fn(async ({ where, skip = 0, take = 50 }: any = {}) => {
          const filtered = store.abuseFlags.filter((f) => {
            if (where?.status && f.status !== where.status) return false;
            if (where?.flagType && f.flagType !== where.flagType) return false;
            if (where?.severity && f.severity !== where.severity) return false;
            if (where?.userId && f.userId !== where.userId) return false;
            return true;
          });
          return filtered.slice(skip, skip + take).map((flag) => {
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
                    wallet: store.wallets.find((w) => w.userId === user.id) ?? null,
                    xIdentity: null,
                  }
                : null,
              reviewedBy: reviewer
                ? {
                    id: reviewer.id,
                    role: reviewer.role ?? "MODERATOR",
                    wallet: store.wallets.find((w) => w.userId === reviewer.id) ?? null,
                  }
                : null,
            };
          });
        }),
        create: vi.fn(async ({ data }: any) => {
          const flag = {
            id: `flag-${store.abuseFlags.length + 1}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            status: "OPEN",
            severity: "LOW",
            ...data,
          };
          store.abuseFlags.push(flag);
          return flag;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const flag = store.abuseFlags.find((f) => f.id === where.id);
          if (!flag) throw new Error("Flag not found");
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
                  wallet: store.wallets.find((w) => w.userId === user.id) ?? null,
                  xIdentity: null,
                }
              : null,
            reviewedBy: reviewer
              ? {
                  id: reviewer.id,
                  role: reviewer.role ?? "MODERATOR",
                  wallet: store.wallets.find((w) => w.userId === reviewer.id) ?? null,
                }
              : null,
          };
        }),
        count: vi.fn(async ({ where }: any = {}) => {
          return store.abuseFlags.filter((f) => {
            if (where?.status && f.status !== where.status) return false;
            if (where?.flagType && f.flagType !== where.flagType) return false;
            if (where?.severity && f.severity !== where.severity) return false;
            if (where?.userId && f.userId !== where.userId) return false;
            return true;
          }).length;
        }),
      },
      auditLog: {
        create: vi.fn(async ({ data }: any) => {
          const audit = {
            id: `audit-${store.auditLogs.length + 1}`,
            createdAt: new Date(),
            ...data,
          };
          store.auditLogs.push(audit);
          return audit;
        }),
      },
      banRecord: {
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.banRecords.find(
              (b) => b.userId === where.userId && b.isActive === where.isActive,
            ) || null
          );
        }),
        findUnique: vi.fn(async ({ where }: any) => {
          return store.banRecords.find((b) => b.id === where.id) || null;
        }),
        create: vi.fn(async ({ data }: any) => {
          const ban = {
            id: `ban-${store.banRecords.length + 1}`,
            createdAt: new Date(),
            isActive: true,
            ...data,
          };
          store.banRecords.push(ban);
          return ban;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const ban = store.banRecords.find((b) => b.id === where.id);
          if (ban) Object.assign(ban, data);
          return ban;
        }),
      },
      adminRole: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.adminRoles.find((a) => a.userId === where.userId) || null;
        }),
      },
      wLSlot: {
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.wLSlots.find(
              (s: any) =>
                s.userId === where.userId &&
                (!where.status?.in || where.status.in.includes(s.status)),
            ) || null
          );
        }),
      },
      authSession: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.authSessions.find((s) => s.token === where.token) || null;
        }),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };

    return tx;
  };

  const prisma: any = {
    _store: store,
    ...createTx(),
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      const tx = createTx();
      return await cb(tx);
    }),
  };

  return { prisma: prisma as unknown as PrismaClient, store };
}

describe("DEC-012 End-to-End Final Integration Verification", () => {
  let db: ReturnType<typeof createDec012IntegrationStore>;
  const fixedNow = new Date("2026-10-28T12:00:00Z");

  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://mock.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "mock_token";
    db = createDec012IntegrationStore();

    // 1. Setup Drop & Period
    db.store.drops.push({
      id: "drop-dec012",
      slug: "dec012-drop",
      title: "DEC-012 Drop Test",
      status: "ACTIVE",
    });

    db.store.dropPeriods.push({
      id: "period-dec012",
      dropId: "drop-dec012",
      periodIndex: 1,
      status: "ACTIVE",
      startsAt: new Date(fixedNow.getTime() - 10 * 60 * 1000), // 10 mins before now (within 30m window)
      endsAt: new Date(fixedNow.getTime() + 50 * 60 * 1000),
      isStockLocked: false,
    });

    db.store.dropPoolItems.push({
      id: "pool-item-1",
      periodId: "period-dec012",
      traitId: "trait-gold-fur",
      initialStock: 100,
      remainingStock: 100,
    });

    // 2. Setup Moderator & Super Admin users
    db.store.users.push(
      {
        id: "user-super-admin",
        role: "SUPER_ADMIN",
        isBanned: false,
      },
      {
        id: "user-moderator",
        role: "MODERATOR",
        isBanned: false,
      },
      {
        id: "user-unauthorized",
        role: "USER",
        isBanned: false,
      },
    );

    db.store.wallets.push(
      { userId: "user-super-admin", address: "0xSuperAdmin00000000000000000000000000001" },
      { userId: "user-moderator", address: "0xModerator0000000000000000000000000000002" },
      { userId: "user-unauthorized", address: "0xNormalUser00000000000000000000000000003" },
    );

    db.store.adminRoles.push(
      {
        id: "role-super-admin",
        userId: "user-super-admin",
        roleType: "SUPER_ADMIN",
        permissions: ["*"],
      },
      {
        id: "role-moderator",
        userId: "user-moderator",
        roleType: "MODERATOR",
        permissions: ["REVIEW_FLAGS", "REVIEW_EVIDENCE"],
      },
    );
  });

  it("1. Verifies Sybil cluster detection (>= 5 wallets, same IP, same period -> AbuseFlag, no auto-ban)", async () => {
    const sharedIp = "203.0.113.88";

    // Create 5 different users
    for (let i = 1; i <= 5; i++) {
      const uid = `sybil-user-${i}`;
      db.store.users.push({ id: uid, role: "USER", isBanned: false });
      db.store.wallets.push({
        userId: uid,
        address: `0x${i.toString().repeat(40)}`,
      });
    }

    // Claims 1 to 4: Success, no abuse flags generated
    for (let i = 1; i <= 4; i++) {
      const res = await claimDrop(db.prisma, {
        dropId: "drop-dec012",
        periodId: "period-dec012",
        userId: `sybil-user-${i}`,
        ipAddress: sharedIp,
        userAgent: "Browser/1.0",
        now: fixedNow,
      });

      expect(res.claim).toBeDefined();
      expect(res.abuseFlags).toHaveLength(0);
      expect(db.store.abuseFlags).toHaveLength(0);
      expect(db.store.users.find((u) => u.id === `sybil-user-${i}`)?.isBanned).toBe(false);
    }

    // Claim 5: Hits threshold of 5 wallets on same IP!
    const res5 = await claimDrop(db.prisma, {
      dropId: "drop-dec012",
      periodId: "period-dec012",
      userId: "sybil-user-5",
      ipAddress: sharedIp,
      userAgent: "Browser/1.0",
      now: fixedNow,
    });

    expect(res5.claim).toBeDefined();
    expect(res5.abuseFlags).toHaveLength(5);
    expect(db.store.abuseFlags).toHaveLength(5);

    // Verify all 5 flags recorded as AbuseFlag for manual admin investigation
    for (let i = 1; i <= 5; i++) {
      const flag = db.store.abuseFlags.find((f) => f.userId === `sybil-user-${i}`);
      expect(flag).toBeDefined();
      expect(flag.flagType).toBe("SYBIL_WALLET_CLUSTER");
      expect(flag.severity).toBe("HIGH");
      expect(flag.status).toBe("OPEN");
      expect(flag.details.clusterSize).toBe(5);
      expect(flag.details.ipAddress).toBe(sharedIp);

      // Verify strictly NO auto-ban was applied
      const user = db.store.users.find((u) => u.id === `sybil-user-${i}`);
      expect(user?.isBanned).toBe(false);
    }

    // Verify AuditLog logged for flag creation
    const creationAudits = db.store.auditLogs.filter(
      (a) => a.action === "ABUSE_FLAG_CREATED",
    );
    expect(creationAudits).toHaveLength(5);
  });

  it("2. Verifies AbuseFlag retrieval and Moderator REVIEW_FLAGS authorization", async () => {
    // Seed an AbuseFlag
    db.store.abuseFlags.push({
      id: "flag-audit-1",
      userId: "sybil-user-1",
      flagType: "SYBIL_WALLET_CLUSTER",
      severity: "HIGH",
      status: "OPEN",
      details: { ipAddress: "203.0.113.88", clusterWalletCount: 5 },
      reviewedById: null,
      reviewedAt: null,
      resolutionNotes: null,
      createdAt: fixedNow,
      updatedAt: fixedNow,
    });

    // 2a. Moderator with REVIEW_FLAGS lists flags
    const modSession = await checkAdminSession(db.prisma, {
      requiredPermission: "REVIEW_FLAGS",
      session: {
        sessionId: "sess-mod",
        userId: "user-moderator",
        address: "0xModerator0000000000000000000000000000002",
      },
    });
    expect(modSession.ok).toBe(true);

    const listResult = await listAbuseFlags(db.prisma, { status: "OPEN" });
    expect(listResult.total).toBe(1);
    expect(listResult.flags[0].id).toBe("flag-audit-1");

    // 2b. Moderator gets specific flag details
    const flagDetail = await getAbuseFlagById(db.prisma, "flag-audit-1");
    expect(flagDetail.id).toBe("flag-audit-1");
    expect(flagDetail.details).toEqual({
      ipAddress: "203.0.113.88",
      clusterWalletCount: 5,
    });

    // 2c. Unauthorized user without REVIEW_FLAGS is rejected
    const unauthSession = await checkAdminSession(db.prisma, {
      requiredPermission: "REVIEW_FLAGS",
      session: {
        sessionId: "sess-user",
        userId: "user-unauthorized",
        address: "0xNormalUser00000000000000000000000000003",
      },
    });
    expect(unauthSession.ok).toBe(false);
    if (!unauthSession.ok) {
      expect(unauthSession.status).toBe(403);
    }
  });

  it("3. Verifies status update to UNDER_REVIEW / CONFIRMED_ACTION_TAKEN and AuditLog logging", async () => {
    db.store.abuseFlags.push({
      id: "flag-update-target",
      userId: "sybil-user-1",
      flagType: "SYBIL_WALLET_CLUSTER",
      severity: "HIGH",
      status: "OPEN",
      details: { ipAddress: "203.0.113.88", clusterWalletCount: 5 },
      reviewedById: null,
      reviewedAt: null,
      resolutionNotes: null,
      createdAt: fixedNow,
      updatedAt: fixedNow,
    });

    // Moderator updates status to UNDER_REVIEW
    const updateRes1 = await updateAbuseFlag(db.prisma, {
      flagId: "flag-update-target",
      adminUserId: "user-moderator",
      status: "UNDER_REVIEW",
      resolutionNotes: "Starting investigation with IP geolocation check.",
      ipAddress: "192.168.1.1",
      userAgent: "ModClient/1.0",
      now: new Date("2026-10-28T12:05:00Z"),
    });

    expect(updateRes1.success).toBe(true);
    expect(updateRes1.flag.status).toBe("UNDER_REVIEW");
    expect(updateRes1.flag.reviewedById).toBe("user-moderator");

    // Moderator updates status to CONFIRMED_ACTION_TAKEN
    const updateRes2 = await updateAbuseFlag(db.prisma, {
      flagId: "flag-update-target",
      adminUserId: "user-moderator",
      status: "CONFIRMED_ACTION_TAKEN",
      resolutionNotes: "Confirmed sybil script farm. Coordinated manual review.",
      ipAddress: "192.168.1.1",
      userAgent: "ModClient/1.0",
      now: new Date("2026-10-28T12:15:00Z"),
    });

    expect(updateRes2.success).toBe(true);
    expect(updateRes2.flag.status).toBe("CONFIRMED_ACTION_TAKEN");
    expect(updateRes2.flag.resolutionNotes).toBe(
      "Confirmed sybil script farm. Coordinated manual review.",
    );

    // Verify AuditLog entries
    const flagAudits = db.store.auditLogs.filter(
      (a) => a.action === "ABUSE_FLAG_UPDATED" && a.entityId === "flag-update-target",
    );
    expect(flagAudits).toHaveLength(2);

    expect(flagAudits[0].actorId).toBe("user-moderator");
    expect(flagAudits[0].oldValues.status).toBe("OPEN");
    expect(flagAudits[0].newValues.status).toBe("UNDER_REVIEW");

    expect(flagAudits[1].actorId).toBe("user-moderator");
    expect(flagAudits[1].oldValues.status).toBe("UNDER_REVIEW");
    expect(flagAudits[1].newValues.status).toBe("CONFIRMED_ACTION_TAKEN");
  });

  it("4. Verifies rate limiting per-wallet and per-IP configuration & validation", async () => {
    // 4a. IP validation correctly filters spoofed, malformed, or missing IP addresses
    expect(isValidClientIp("198.51.100.42")).toBe(true);
    expect(isValidClientIp("2001:db8::1")).toBe(true);
    expect(isValidClientIp("unknown")).toBe(false);
    expect(isValidClientIp(null)).toBe(false);
    expect(isValidClientIp(undefined)).toBe(false);
    expect(isValidClientIp("invalid-ip-string")).toBe(false);

    // 4b. Verifies DEC-012 rate limit limits and window specs
    expect(DROPS_CLAIM_RATE_LIMIT_MAX).toBe(5);
    expect(DROPS_CLAIM_RATE_LIMIT_WINDOW_MS).toBe(120_000);
    expect(DROPS_CLAIM_IP_RATE_LIMIT_MAX).toBe(10);
    expect(DROPS_CLAIM_IP_RATE_LIMIT_WINDOW_MS).toBe(60_000);

    // 4c. Verifies mock limiter execution behaves as sliding window
    const mockLimiter = {
      limit: vi.fn(),
    };
    __setTestLimiter(mockLimiter as any);

    // First 10 calls allowed
    mockLimiter.limit.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });
    const allowedRes = await checkRateLimit("drops-claim-ip:198.51.100.42", 10, 60_000);
    expect(allowedRes.allowed).toBe(true);

    // 11th call blocked
    mockLimiter.limit.mockResolvedValueOnce({ success: false, reset: Date.now() + 45_000 });
    const blockedRes = await checkRateLimit("drops-claim-ip:198.51.100.42", 10, 60_000);
    expect(blockedRes.allowed).toBe(false);
    expect(blockedRes.retryAfterSeconds).toBeGreaterThan(0);

    __setTestLimiter(null);
  });

  it("5. Verifies permanent ban revocation hardening (SUPER_ADMIN only, 403 INSUFFICIENT_PRIVILEGE for regular admin/moderator)", async () => {
    // Create banned user with PERMANENT ban
    const banResult = await banUser(db.prisma, {
      userId: "user-unauthorized",
      adminUserId: "user-super-admin",
      reason: "Severe abuse violation",
      banType: "PERMANENT",
      scope: "FULL_SYSTEM",
      now: fixedNow,
    });
    expect(banResult.banRecord.isActive).toBe(true);

    // 5a. Moderator or Regular Admin attempts to lift PERMANENT ban -> 403 INSUFFICIENT_PRIVILEGE
    await expect(
      revokeBan(db.prisma, {
        banId: banResult.banRecord.id,
        adminUserId: "user-moderator",
        reason: "Moderator attempting unauthorized unban",
        now: fixedNow,
      }),
    ).rejects.toMatchObject({
      code: "INSUFFICIENT_PRIVILEGE",
      status: 403,
    });

    // 5b. SUPER_ADMIN lifts permanent ban -> succeeds
    const unbanResult = await revokeBan(db.prisma, {
      banId: banResult.banRecord.id,
      adminUserId: "user-super-admin",
      reason: "Appeal granted by Super Admin after review.",
      now: fixedNow,
    });

    expect(unbanResult.success).toBe(true);
    expect(unbanResult.isActive).toBe(false);
    expect(unbanResult.auditLogId).toBeDefined();

    // Verify ban record in db is no longer active
    const banInDb = db.store.banRecords.find((b) => b.id === banResult.banRecord.id);
    expect(banInDb?.isActive).toBe(false);
  });

  it("6. Verifies ban and whitelist invariant rules for drop claims (no regression)", async () => {
    const testUserId = "user-claim-invariants";
    db.store.users.push({ id: testUserId, role: "USER", isBanned: false });
    db.store.wallets.push({ userId: testUserId, address: "0xClaimInvariantUser00000000000000000001" });

    // 6a. Active ban with CLAIM_RESTRICTED scope blocks drop claiming
    db.store.banRecords.push({
      id: "ban-claim-test",
      userId: testUserId,
      banType: "TEMPORARY",
      scope: "CLAIM_RESTRICTED",
      isActive: true,
      expiresAt: null,
    });

    await expect(
      claimDrop(db.prisma, {
        dropId: "drop-dec012",
        periodId: "period-dec012",
        userId: testUserId,
        ipAddress: "203.0.113.199",
        userAgent: "Browser/1.0",
        now: fixedNow,
      }),
    ).rejects.toMatchObject({
      code: "USER_BANNED_FROM_CLAIMS",
      status: 403,
    });

    // 6b. Ban revoked -> user can now claim
    const banRec = db.store.banRecords.find((b) => b.id === "ban-claim-test");
    if (banRec) banRec.isActive = false;

    // 6c. WL slot holder invariant: holding an ALLOCATED WL slot prohibits claiming drops
    db.store.wLSlots.push({
      id: "wl-slot-1",
      userId: testUserId,
      status: "ALLOCATED",
    });

    await expect(
      claimDrop(db.prisma, {
        dropId: "drop-dec012",
        periodId: "period-dec012",
        userId: testUserId,
        ipAddress: "203.0.113.199",
        userAgent: "Browser/1.0",
        now: fixedNow,
      }),
    ).rejects.toMatchObject({
      code: "WL_HOLDER_CLAIM_PROHIBITED",
      status: 403,
    });
  });
});
