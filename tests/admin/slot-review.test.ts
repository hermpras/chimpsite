import { describe, it, expect, vi, beforeEach } from "vitest";
import { WLSlotReviewStatus } from "@prisma/client";
import {
  listGtdSlotsForReview,
  updateGtdSlotReviewStatus,
  AdminSlotReviewError,
  normalizeReviewStatus,
} from "@/server/admin/slot-review";
import { GET as LIST_REVIEWS_GET } from "@/app/api/admin/whitelist/reviews/route";
import { PATCH as UPDATE_REVIEW_PATCH } from "@/app/api/admin/whitelist/reviews/[id]/route";
import { evaluateUserQualification } from "@/server/whitelist/qualification";
import {
  adminListGtdSlotReviews,
  adminUpdateGtdSlotReview,
} from "@/lib/admin/client";

// ---------------------------------------------------------------------------
// Mock Store & In-Memory Prisma Implementation
// ---------------------------------------------------------------------------

function createMockPrismaStore() {
  const store = {
    users: [] as any[],
    wallets: [] as any[],
    xIdentities: [] as any[],
    adminRoles: [] as any[],
    programs: [] as any[],
    slots: [] as any[],
    qualifications: [] as any[],
    queueEntries: [] as any[],
    statusHistories: [] as any[],
    inventoryItems: [] as any[],
    campaigns: [] as any[],
    taskProgresses: [] as any[],
    auditLogs: [] as any[],
  };

  const createTx = () => {
    const uncommittedSlots: any[] = [];
    const uncommittedAudit: any[] = [];
    const slotSnapshots: Array<{ id: string; data: any }> = [];

    const rollback = () => {
      for (const s of uncommittedSlots) {
        const idx = store.slots.indexOf(s);
        if (idx !== -1) store.slots.splice(idx, 1);
      }
      for (const a of uncommittedAudit) {
        const idx = store.auditLogs.indexOf(a);
        if (idx !== -1) store.auditLogs.splice(idx, 1);
      }
      for (const snap of slotSnapshots) {
        const s = store.slots.find((x) => x.id === snap.id);
        if (s) Object.assign(s, snap.data);
      }
    };

    const tx: any = {
      adminRole: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.adminRoles.find((r) => r.userId === where.userId) || null;
        }),
      },
      user: {
        findUnique: vi.fn(async ({ where }: any) => {
          const user = store.users.find((u) => u.id === where.id);
          if (!user) return null;
          const wallet = store.wallets.find((w) => w.userId === user.id) || null;
          const xIdentity =
            store.xIdentities.find((x) => x.userId === user.id) || null;
          const banRecords = (user.banRecords || []).filter((b: any) => b.isActive);
          return { ...user, wallet, xIdentity, banRecords };
        }),
      },
      wLProgram: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.programs.find((p) => p.id === where.id) || null;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const prog = store.programs.find((p) => p.id === where.id);
          if (!prog) throw new Error("Program not found");
          if (data.allocatedSlotsCount?.increment) {
            prog.allocatedSlotsCount += data.allocatedSlotsCount.increment;
          }
          return prog;
        }),
      },
      wLSlot: {
        findUnique: vi.fn(async ({ where }: any) => {
          let s: any = null;
          if (where.id) {
            s = store.slots.find((x) => x.id === where.id);
          } else if (where.programId_userId) {
            s = store.slots.find(
              (x) =>
                x.programId === where.programId_userId.programId &&
                x.userId === where.programId_userId.userId,
            );
          }
          if (!s) return null;
          const user = store.users.find((u) => u.id === s.userId);
          const wallet = store.wallets.find((w) => w.userId === s.userId) || null;
          const xIdentity =
            store.xIdentities.find((x) => x.userId === s.userId) || null;
          const program = store.programs.find((p) => p.id === s.programId) || null;
          return {
            ...s,
            program,
            user: user ? { ...user, wallet, xIdentity } : null,
          };
        }),
        findMany: vi.fn(async ({ where }: any) => {
          return store.slots.filter(
            (s) =>
              s.programId === where.programId &&
              (!where.status?.in || where.status.in.includes(s.status)),
          );
        }),
        count: vi.fn(async ({ where }: any) => {
          return store.slots.filter(
            (s) =>
              s.programId === where.programId &&
              (!where.status?.in || where.status.in.includes(s.status)),
          ).length;
        }),
        create: vi.fn(async ({ data }: any) => {
          const slot = {
            id: `slot_${store.slots.length + 1}`,
            reviewStatus: "NOT_REVIEWED",
            reviewedAt: null,
            reviewedBy: null,
            reviewNotes: null,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          store.slots.push(slot);
          uncommittedSlots.push(slot);
          return slot;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const s = store.slots.find((x) => x.id === where.id);
          if (!s) throw new Error("Slot not found");
          slotSnapshots.push({ id: s.id, data: { ...s } });
          Object.assign(s, data, { updatedAt: new Date() });
          const user = store.users.find((u) => u.id === s.userId);
          const wallet = store.wallets.find((w) => w.userId === s.userId) || null;
          const xIdentity =
            store.xIdentities.find((x) => x.userId === s.userId) || null;
          const program = store.programs.find((p) => p.id === s.programId) || null;
          return {
            ...s,
            program,
            user: user ? { ...user, wallet, xIdentity } : null,
          };
        }),
      },
      wLQualification: {
        findUnique: vi.fn(async ({ where }: any) => {
          return (
            store.qualifications.find(
              (q) =>
                q.programId === where.programId_userId.programId &&
                q.userId === where.programId_userId.userId,
            ) || null
          );
        }),
        upsert: vi.fn(async ({ create, update, where }: any) => {
          let q = store.qualifications.find(
            (x) =>
              x.programId === where.programId_userId.programId &&
              x.userId === where.programId_userId.userId,
          );
          if (q) {
            Object.assign(q, update);
          } else {
            q = { id: `qual_${store.qualifications.length + 1}`, ...create };
            store.qualifications.push(q);
          }
          return q;
        }),
      },
      wLQueueEntry: {
        findFirst: vi.fn(async () => null),
        findUnique: vi.fn(async () => null),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      wLStatusHistory: {
        create: vi.fn(async ({ data }: any) => {
          const h = { id: `hist_${store.statusHistories.length + 1}`, ...data };
          store.statusHistories.push(h);
          return h;
        }),
      },
      inventoryItem: {
        findMany: vi.fn(async ({ where }: any) => {
          return store.inventoryItems.filter((i) => i.ownerId === where.ownerId);
        }),
      },
      promoCampaign: {
        findMany: vi.fn(async () => []),
      },
      auditLog: {
        create: vi.fn(async ({ data }: any) => {
          if (client._mockAuditCreateFail) {
            throw new Error("Database connection dropped during auditLog insert");
          }
          const log = {
            id: `audit_${store.auditLogs.length + 1}`,
            ...data,
            createdAt: new Date(),
          };
          store.auditLogs.push(log);
          uncommittedAudit.push(log);
          return log;
        }),
      },
      $queryRaw: vi.fn(async () => {
        return store.programs;
      }),
    };

    return { tx, rollback };
  };

  const client: any = {
    _store: store,
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      const { tx, rollback } = createTx();
      try {
        return await cb(tx);
      } catch (err) {
        rollback();
        throw err;
      }
    }),
    adminRole: {
      findUnique: vi.fn(async ({ where }: any) => {
        return store.adminRoles.find((r) => r.userId === where.userId) || null;
      }),
    },
    user: {
      findUnique: vi.fn(async ({ where }: any) => {
        return store.users.find((u) => u.id === where.id) || null;
      }),
    },
    wLProgram: {
      findUnique: vi.fn(async ({ where }: any) => {
        return store.programs.find((p) => p.id === where.id) || null;
      }),
    },
    wLSlot: {
      count: vi.fn(async ({ where }: any) => {
        let list = [...store.slots];
        if (where?.programId) {
          list = list.filter((s) => s.programId === where.programId);
        }
        if (where?.reviewStatus) {
          list = list.filter((s) => s.reviewStatus === where.reviewStatus);
        }
        if (where?.user?.OR) {
          list = list.filter((s) => {
            const user = store.users.find((u) => u.id === s.userId);
            const wallet = store.wallets.find((w) => w.userId === s.userId);
            const xIdentity = store.xIdentities.find((x) => x.userId === s.userId);
            const conditions = where.user.OR;
            return conditions.some((c: any) => {
              if (c.wallet?.address?.contains) {
                return wallet?.address
                  ?.toLowerCase()
                  .includes(c.wallet.address.contains.toLowerCase());
              }
              if (c.xIdentity?.username?.contains) {
                return xIdentity?.username
                  ?.toLowerCase()
                  .includes(c.xIdentity.username.contains.toLowerCase());
              }
              return false;
            });
          });
        }
        return list.length;
      }),
      findMany: vi.fn(async ({ where, skip = 0, take = 50 }: any) => {
        let list = [...store.slots];
        if (where?.programId) {
          list = list.filter((s) => s.programId === where.programId);
        }
        if (where?.reviewStatus) {
          list = list.filter((s) => s.reviewStatus === where.reviewStatus);
        }
        if (where?.user?.OR) {
          list = list.filter((s) => {
            const wallet = store.wallets.find((w) => w.userId === s.userId);
            const xIdentity = store.xIdentities.find((x) => x.userId === s.userId);
            const conditions = where.user.OR;
            return conditions.some((c: any) => {
              if (c.wallet?.address?.contains) {
                return wallet?.address
                  ?.toLowerCase()
                  .includes(c.wallet.address.contains.toLowerCase());
              }
              if (c.xIdentity?.username?.contains) {
                return xIdentity?.username
                  ?.toLowerCase()
                  .includes(c.xIdentity.username.contains.toLowerCase());
              }
              return false;
            });
          });
        }
        const paged = list.slice(skip, skip + take);
        return paged.map((s) => {
          const user = store.users.find((u) => u.id === s.userId);
          const wallet = store.wallets.find((w) => w.userId === s.userId) || null;
          const xIdentity =
            store.xIdentities.find((x) => x.userId === s.userId) || null;
          const program = store.programs.find((p) => p.id === s.programId) || null;
          return {
            ...s,
            program,
            user: user ? { ...user, wallet, xIdentity } : null,
          };
        });
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const s = store.slots.find((x) => x.id === where.id);
        if (!s) return null;
        const user = store.users.find((u) => u.id === s.userId);
        const wallet = store.wallets.find((w) => w.userId === s.userId) || null;
        const xIdentity =
          store.xIdentities.find((x) => x.userId === s.userId) || null;
        const program = store.programs.find((p) => p.id === s.programId) || null;
        return {
          ...s,
          program,
          user: user ? { ...user, wallet, xIdentity } : null,
        };
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => {
        const log = {
          id: `audit_${store.auditLogs.length + 1}`,
          ...data,
          createdAt: new Date(),
        };
        store.auditLogs.push(log);
        return log;
      }),
    },
  };

  return client;
}

// ---------------------------------------------------------------------------
// Route Mocking for requireAdminSession & prisma
// ---------------------------------------------------------------------------

let activeMockPrisma: any = null;
let currentMockSession: any = null;

vi.mock("@/server/db", () => ({
  get prisma() {
    return activeMockPrisma;
  },
}));

vi.mock("@/server/auth/session", () => {
  class MockAdminAuthError extends Error {
    code: "UNAUTHORIZED" | "FORBIDDEN";
    status: 401 | 403;
    constructor(code: "UNAUTHORIZED" | "FORBIDDEN", message: string, status: 401 | 403) {
      super(message);
      this.name = "AdminAuthError";
      this.code = code;
      this.status = status;
    }
    toResponse(): Response {
      return Response.json(
        { error: this.code, message: this.message },
        { status: this.status },
      );
    }
  }

  const ADMIN_ROLE_LEVELS: Record<string, number> = {
    SUPER_ADMIN: 3,
    ADMIN: 2,
    MODERATOR: 1,
    AUDITOR: 0,
  };

  return {
    AdminAuthError: MockAdminAuthError,
    requireAdminSession: vi.fn(async (_prisma: any, options: any) => {
      if (!currentMockSession) {
        throw new MockAdminAuthError(
          "UNAUTHORIZED",
          "Authentication required to access admin resources.",
          401,
        );
      }

      const roleType = currentMockSession.adminRole?.roleType;
      if (!roleType) {
        throw new MockAdminAuthError(
          "FORBIDDEN",
          "Admin access required. No admin role assigned to account.",
          403,
        );
      }

      const requiredRole =
        typeof options === "object" ? options.requiredRole : undefined;
      if (requiredRole) {
        const userLevel = ADMIN_ROLE_LEVELS[roleType] ?? -1;
        const requiredLevel = ADMIN_ROLE_LEVELS[requiredRole] ?? 999;
        if (userLevel < requiredLevel) {
          throw new MockAdminAuthError(
            "FORBIDDEN",
            `Insufficient role level: requires ${requiredRole}, account has ${roleType}.`,
            403,
          );
        }
      }

      return currentMockSession;
    }),
  };
});

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe("Phase 2 — GTD Post-Allocation Review Backend", () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = createMockPrismaStore();
    activeMockPrisma = mockPrisma;
    currentMockSession = {
      sessionId: "sess_mod_1",
      userId: "moderator_1",
      address: "0xmoderator",
      adminRole: {
        id: "role_mod_1",
        userId: "moderator_1",
        roleType: "MODERATOR",
        permissions: ["REVIEW_WL"],
      },
    };

    // Seed program
    mockPrisma._store.programs.push({
      id: "program_alpha",
      slug: "chimp-alpha",
      name: "ChimpHood Alpha Program",
      totalSlots: 100,
      allocatedSlotsCount: 0,
      status: "OPEN",
      startsAt: new Date(),
    });

    // Seed moderator
    mockPrisma._store.users.push({
      id: "moderator_1",
      role: "MODERATOR",
      isBanned: false,
    });
    mockPrisma._store.adminRoles.push({
      id: "role_mod_1",
      userId: "moderator_1",
      roleType: "MODERATOR",
      permissions: ["REVIEW_WL"],
    });

    // Seed regular admin
    mockPrisma._store.users.push({
      id: "admin_1",
      role: "ADMIN",
      isBanned: false,
    });
    mockPrisma._store.adminRoles.push({
      id: "role_admin_1",
      userId: "admin_1",
      roleType: "ADMIN",
      permissions: ["*"],
    });

    // Seed auditor
    mockPrisma._store.users.push({
      id: "auditor_1",
      role: "USER",
      isBanned: false,
    });
    mockPrisma._store.adminRoles.push({
      id: "role_auditor_1",
      userId: "auditor_1",
      roleType: "AUDITOR",
      permissions: ["VIEW_ONLY"],
    });

    // Seed regular user
    mockPrisma._store.users.push({
      id: "user_regular",
      role: "USER",
      isBanned: false,
    });
  });

  // -------------------------------------------------------------------------
  // 1. Default NOT_REVIEWED saat allocation
  // -------------------------------------------------------------------------
  describe("1. Default reviewStatus: NOT_REVIEWED on Slot Allocation", () => {
    it("allocates a slot with reviewStatus: NOT_REVIEWED when user qualifies", async () => {
      // Setup fully qualified user
      const userId = "alice_qual_user";
      mockPrisma._store.users.push({
        id: userId,
        role: "USER",
        isBanned: false,
        banRecords: [],
      });
      mockPrisma._store.wallets.push({
        userId,
        address: "0xalice1234567890abcdef1234567890abcdef12",
      });
      mockPrisma._store.xIdentities.push({
        userId,
        xId: "x_alice_123",
        username: "alice_chimp",
        name: "Alice Chimp",
      });
      // 5 trait categories
      const categories = ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"];
      for (const cat of categories) {
        mockPrisma._store.inventoryItems.push({
          ownerId: userId,
          trait: { category: cat },
        });
      }

      const qualResult = await evaluateUserQualification(mockPrisma, {
        userId,
        programId: "program_alpha",
        now: new Date(),
      });

      expect(qualResult.qualified).toBe(true);
      expect(qualResult.phase).toBe("SLOT_ALLOCATED");
      expect(qualResult.slotNumber).toBe(1);

      // Verify the allocated slot record
      const allocatedSlot = mockPrisma._store.slots.find(
        (s: any) => s.userId === userId && s.programId === "program_alpha",
      );
      expect(allocatedSlot).toBeDefined();
      expect(allocatedSlot.status).toBe("ALLOCATED");
      expect(allocatedSlot.reviewStatus).toBe("NOT_REVIEWED");
      expect(allocatedSlot.reviewedAt).toBeNull();
      expect(allocatedSlot.reviewedBy).toBeNull();
      expect(allocatedSlot.reviewNotes).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Listing dan pagination
  // -------------------------------------------------------------------------
  describe("2. Listing and Pagination (listGtdSlotsForReview)", () => {
    beforeEach(() => {
      // Seed 5 slots with various users and review statuses
      for (let i = 1; i <= 5; i++) {
        const uId = `user_${i}`;
        mockPrisma._store.users.push({ id: uId, role: "USER", isBanned: false });
        mockPrisma._store.wallets.push({
          userId: uId,
          address: `0xuser${i}00000000000000000000000000000000`,
        });
        mockPrisma._store.xIdentities.push({
          userId: uId,
          xId: `xid_${i}`,
          username: `user_${i}_x`,
          name: `User ${i}`,
          profileImageUrl: `https://example.com/avatar_${i}.png`,
        });
        mockPrisma._store.slots.push({
          id: `slot_test_${i}`,
          programId: "program_alpha",
          slotNumber: i,
          userId: uId,
          status: "ALLOCATED",
          reviewStatus:
            i === 1
              ? "NOT_REVIEWED"
              : i === 2
                ? "UNDER_REVIEW"
                : i === 3
                  ? "VALID"
                  : "FLAGGED",
          reviewedAt: i > 1 ? new Date() : null,
          reviewedBy: i > 1 ? "moderator_1" : null,
          reviewNotes: i > 1 ? `Notes for slot ${i}` : null,
          allocatedAt: new Date(),
          confirmedAt: null,
          allocatedBy: "QUALIFICATION_ENGINE",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    });

    it("returns paginated slots with total count, wallet, and X identity details", async () => {
      const result = await listGtdSlotsForReview(mockPrisma, {
        programId: "program_alpha",
        limit: 2,
        offset: 0,
      });

      expect(result.total).toBe(5);
      expect(result.slots.length).toBe(2);
      expect(result.limit).toBe(2);
      expect(result.offset).toBe(0);

      // Verify slot detail structure
      const first = result.slots[0];
      expect(first.slotNumber).toBe(1);
      expect(first.user.wallet?.address).toBe(
        "0xuser100000000000000000000000000000000",
      );
      expect(first.user.xIdentity?.username).toBe("user_1_x");
      expect(first.reviewStatus).toBe("NOT_REVIEWED");
    });

    it("supports offset pagination", async () => {
      const result = await listGtdSlotsForReview(mockPrisma, {
        programId: "program_alpha",
        limit: 2,
        offset: 2,
      });

      expect(result.total).toBe(5);
      expect(result.slots.length).toBe(2);
      expect(result.slots[0].slotNumber).toBe(3);
      expect(result.slots[1].slotNumber).toBe(4);
    });

    it("searches slots by wallet address and X username", async () => {
      const byAddress = await listGtdSlotsForReview(mockPrisma, {
        searchAddress: "0xuser3",
      });
      expect(byAddress.total).toBe(1);
      expect(byAddress.slots[0].userId).toBe("user_3");

      const byUsername = await listGtdSlotsForReview(mockPrisma, {
        search: "user_4_x",
      });
      expect(byUsername.total).toBe(1);
      expect(byUsername.slots[0].userId).toBe("user_4");
    });
  });

  // -------------------------------------------------------------------------
  // 3. Filter status review
  // -------------------------------------------------------------------------
  describe("3. Review Status Filter", () => {
    beforeEach(() => {
      mockPrisma._store.slots.push(
        {
          id: "slot_filter_1",
          programId: "program_alpha",
          slotNumber: 1,
          userId: "user_1",
          status: "ALLOCATED",
          reviewStatus: "NOT_REVIEWED",
          allocatedAt: new Date(),
        },
        {
          id: "slot_filter_2",
          programId: "program_alpha",
          slotNumber: 2,
          userId: "user_2",
          status: "ALLOCATED",
          reviewStatus: "FLAGGED",
          allocatedAt: new Date(),
        },
        {
          id: "slot_filter_3",
          programId: "program_alpha",
          slotNumber: 3,
          userId: "user_3",
          status: "ALLOCATED",
          reviewStatus: "FLAGGED",
          allocatedAt: new Date(),
        },
      );
    });

    it("filters slots by reviewStatus: FLAGGED", async () => {
      const result = await listGtdSlotsForReview(mockPrisma, {
        reviewStatus: "FLAGGED",
      });

      expect(result.total).toBe(2);
      expect(result.slots.every((s) => s.reviewStatus === "FLAGGED")).toBe(true);
    });

    it("filters slots by reviewStatus: NOT_REVIEWED", async () => {
      const result = await listGtdSlotsForReview(mockPrisma, {
        reviewStatus: "NOT_REVIEWED",
      });

      expect(result.total).toBe(1);
      expect(result.slots[0].id).toBe("slot_filter_1");
    });

    it("rejects invalid review status with AdminSlotReviewError (400)", async () => {
      await expect(
        listGtdSlotsForReview(mockPrisma, {
          reviewStatus: "INVALID_STATUS",
        }),
      ).rejects.toThrow("Invalid review status 'INVALID_STATUS'");
    });
  });

  // -------------------------------------------------------------------------
  // 4. Update status dan review notes
  // -------------------------------------------------------------------------
  describe("4. Update Status and Review Notes (updateGtdSlotReviewStatus)", () => {
    beforeEach(() => {
      mockPrisma._store.users.push({
        id: "target_user_1",
        role: "USER",
        isBanned: false,
      });
      mockPrisma._store.wallets.push({
        userId: "target_user_1",
        address: "0xtargetwallet",
      });
      mockPrisma._store.slots.push({
        id: "slot_to_update",
        programId: "program_alpha",
        slotNumber: 10,
        userId: "target_user_1",
        status: "ALLOCATED",
        reviewStatus: "NOT_REVIEWED",
        reviewedAt: null,
        reviewedBy: null,
        reviewNotes: null,
        allocatedAt: new Date(),
      });
    });

    it("updates reviewStatus to VALID with review notes and records reviewer identity", async () => {
      const fixedTime = new Date("2026-11-01T12:00:00Z");
      const result = await updateGtdSlotReviewStatus(mockPrisma, {
        slotId: "slot_to_update",
        reviewStatus: "VALID",
        reviewNotes: "All tasks and traits manually verified. Looks great.",
        reviewedBy: "moderator_1",
        reviewedAt: fixedTime,
      });

      expect(result.success).toBe(true);
      expect(result.slot.reviewStatus).toBe("VALID");
      expect(result.slot.reviewNotes).toBe(
        "All tasks and traits manually verified. Looks great.",
      );
      expect(result.slot.reviewedBy).toBe("moderator_1");
      expect(result.slot.reviewedAt).toEqual(fixedTime);

      // Verify in DB store
      const dbSlot = mockPrisma._store.slots.find((s: any) => s.id === "slot_to_update");
      expect(dbSlot.reviewStatus).toBe("VALID");
      expect(dbSlot.reviewNotes).toBe(
        "All tasks and traits manually verified. Looks great.",
      );
      expect(dbSlot.reviewedBy).toBe("moderator_1");
    });

    it("allows transitioning between all valid review statuses (NOT_REVIEWED, UNDER_REVIEW, VALID, FLAGGED)", async () => {
      const statuses = [
        WLSlotReviewStatus.UNDER_REVIEW,
        WLSlotReviewStatus.FLAGGED,
        WLSlotReviewStatus.VALID,
        WLSlotReviewStatus.NOT_REVIEWED,
      ];

      for (const st of statuses) {
        const res = await updateGtdSlotReviewStatus(mockPrisma, {
          slotId: "slot_to_update",
          reviewStatus: st,
          reviewedBy: "moderator_1",
        });
        expect(res.slot.reviewStatus).toBe(st);
      }
    });

    it("rejects review notes exceeding 2048 characters with 400", async () => {
      const longNotes = "a".repeat(2049);
      await expect(
        updateGtdSlotReviewStatus(mockPrisma, {
          slotId: "slot_to_update",
          reviewStatus: "FLAGGED",
          reviewNotes: longNotes,
          reviewedBy: "moderator_1",
        }),
      ).rejects.toThrow("Review notes cannot exceed 2048 characters.");
    });

    it("throws 404 when slot does not exist", async () => {
      await expect(
        updateGtdSlotReviewStatus(mockPrisma, {
          slotId: "non_existent_slot",
          reviewStatus: "VALID",
          reviewedBy: "moderator_1",
        }),
      ).rejects.toThrow("Whitelist slot not found");
    });
  });

  // -------------------------------------------------------------------------
  // 5. RBAC: 401/403 untuk akses tanpa otorisasi yang sesuai
  // -------------------------------------------------------------------------
  describe("5. Role-Based Access Control (RBAC)", () => {
    beforeEach(() => {
      mockPrisma._store.slots.push({
        id: "slot_rbac_1",
        programId: "program_alpha",
        slotNumber: 1,
        userId: "user_regular",
        status: "ALLOCATED",
        reviewStatus: "NOT_REVIEWED",
        allocatedAt: new Date(),
      });
    });

    it("GET /api/admin/whitelist/reviews returns 401 UNAUTHORIZED when no session", async () => {
      currentMockSession = null;
      const req = new Request("http://localhost:3000/api/admin/whitelist/reviews");
      const res = await LIST_REVIEWS_GET(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("UNAUTHORIZED");
    });

    it("GET /api/admin/whitelist/reviews returns 403 FORBIDDEN when user has role USER", async () => {
      currentMockSession = {
        sessionId: "sess_user",
        userId: "user_regular",
        address: "0xregular",
        // No adminRole
      };

      const req = new Request("http://localhost:3000/api/admin/whitelist/reviews");
      const res = await LIST_REVIEWS_GET(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("FORBIDDEN");
    });

    it("GET /api/admin/whitelist/reviews returns 403 FORBIDDEN when user has role AUDITOR (< MODERATOR)", async () => {
      currentMockSession = {
        sessionId: "sess_auditor",
        userId: "auditor_1",
        address: "0xauditor",
        adminRole: {
          id: "role_auditor_1",
          userId: "auditor_1",
          roleType: "AUDITOR",
          permissions: ["VIEW_ONLY"],
        },
      };

      const req = new Request("http://localhost:3000/api/admin/whitelist/reviews");
      const res = await LIST_REVIEWS_GET(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("FORBIDDEN");
    });

    it("PATCH /api/admin/whitelist/reviews/[id] returns 403 FORBIDDEN when user has role USER", async () => {
      currentMockSession = {
        sessionId: "sess_user",
        userId: "user_regular",
        address: "0xregular",
      };

      const req = new Request(
        "http://localhost:3000/api/admin/whitelist/reviews/slot_rbac_1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewStatus: "FLAGGED" }),
        },
      );
      const res = await UPDATE_REVIEW_PATCH(req, {
        params: Promise.resolve({ id: "slot_rbac_1" }),
      });

      expect(res.status).toBe(403);
    });

    it("PATCH /api/admin/whitelist/reviews/[id] succeeds for MODERATOR and ADMIN", async () => {
      // 1. Moderator succeeds
      currentMockSession = {
        sessionId: "sess_mod",
        userId: "moderator_1",
        address: "0xmod",
        adminRole: {
          id: "role_mod_1",
          userId: "moderator_1",
          roleType: "MODERATOR",
          permissions: ["REVIEW_WL"],
        },
      };
      const reqMod = new Request(
        "http://localhost:3000/api/admin/whitelist/reviews/slot_rbac_1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewStatus: "UNDER_REVIEW" }),
        },
      );
      const resMod = await UPDATE_REVIEW_PATCH(reqMod, {
        params: Promise.resolve({ id: "slot_rbac_1" }),
      });
      expect(resMod.status).toBe(200);

      // 2. Admin succeeds
      currentMockSession = {
        sessionId: "sess_admin",
        userId: "admin_1",
        address: "0xadmin",
        adminRole: {
          id: "role_admin_1",
          userId: "admin_1",
          roleType: "ADMIN",
          permissions: ["*"],
        },
      };
      const reqAdmin = new Request(
        "http://localhost:3000/api/admin/whitelist/reviews/slot_rbac_1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewStatus: "VALID" }),
        },
      );
      const resAdmin = await UPDATE_REVIEW_PATCH(reqAdmin, {
        params: Promise.resolve({ id: "slot_rbac_1" }),
      });
      expect(resAdmin.status).toBe(200);
    });

    it("service function rejects unauthorized reviewer ID directly with 403", async () => {
      await expect(
        updateGtdSlotReviewStatus(mockPrisma, {
          slotId: "slot_rbac_1",
          reviewStatus: "FLAGGED",
          reviewedBy: "user_regular",
        }),
      ).rejects.toThrow("Requires MODERATOR, ADMIN, or SUPER_ADMIN role");
    });
  });

  // -------------------------------------------------------------------------
  // 6. FLAGGED dan UNDER_REVIEW tidak mengubah status slot ALLOCATED
  // -------------------------------------------------------------------------
  describe("6. FLAGGED and UNDER_REVIEW Never Alter Slot Status (status remains ALLOCATED)", () => {
    beforeEach(() => {
      mockPrisma._store.slots.push({
        id: "slot_invariance_1",
        programId: "program_alpha",
        slotNumber: 15,
        userId: "user_regular",
        status: "ALLOCATED",
        reviewStatus: "NOT_REVIEWED",
        allocatedAt: new Date(),
      });
    });

    it("setting reviewStatus to FLAGGED leaves slot.status as ALLOCATED", async () => {
      const res = await updateGtdSlotReviewStatus(mockPrisma, {
        slotId: "slot_invariance_1",
        reviewStatus: "FLAGGED",
        reviewNotes: "Suspicious activity detected, flagging for team check.",
        reviewedBy: "moderator_1",
      });

      expect(res.slot.reviewStatus).toBe("FLAGGED");
      expect(res.slot.status).toBe("ALLOCATED");

      const dbSlot = mockPrisma._store.slots.find(
        (s: any) => s.id === "slot_invariance_1",
      );
      expect(dbSlot.status).toBe("ALLOCATED");
      expect(dbSlot.reviewStatus).toBe("FLAGGED");
    });

    it("setting reviewStatus to UNDER_REVIEW leaves slot.status as ALLOCATED", async () => {
      const res = await updateGtdSlotReviewStatus(mockPrisma, {
        slotId: "slot_invariance_1",
        reviewStatus: "UNDER_REVIEW",
        reviewNotes: "Waiting for secondary evidence check.",
        reviewedBy: "moderator_1",
      });

      expect(res.slot.reviewStatus).toBe("UNDER_REVIEW");
      expect(res.slot.status).toBe("ALLOCATED");

      const dbSlot = mockPrisma._store.slots.find(
        (s: any) => s.id === "slot_invariance_1",
      );
      expect(dbSlot.status).toBe("ALLOCATED");
    });
  });

  // -------------------------------------------------------------------------
  // 7. AuditLog tercatat dengan action yang benar
  // -------------------------------------------------------------------------
  describe("7. AuditLog Atomic Recording", () => {
    beforeEach(() => {
      mockPrisma._store.slots.push({
        id: "slot_audit_test",
        programId: "program_alpha",
        slotNumber: 42,
        userId: "target_user_audit",
        status: "ALLOCATED",
        reviewStatus: "NOT_REVIEWED",
        reviewedAt: null,
        reviewedBy: null,
        reviewNotes: null,
        allocatedAt: new Date(),
      });
    });

    it("creates an AuditLog entry with action WL_SLOT_REVIEW_STATUS_UPDATED", async () => {
      const res = await updateGtdSlotReviewStatus(mockPrisma, {
        slotId: "slot_audit_test",
        reviewStatus: "VALID",
        reviewNotes: "Confirmed legitimate community participant.",
        reviewedBy: "moderator_1",
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0 TestBrowser",
      });

      expect(res.auditLogId).toBeDefined();

      const auditEntry = mockPrisma._store.auditLogs.find(
        (l: any) => l.id === res.auditLogId,
      );
      expect(auditEntry).toBeDefined();
      expect(auditEntry.action).toBe("WL_SLOT_REVIEW_STATUS_UPDATED");
      expect(auditEntry.entityType).toBe("WLSlot");
      expect(auditEntry.entityId).toBe("slot_audit_test");
      expect(auditEntry.actorId).toBe("moderator_1");
      expect(auditEntry.actorIp).toBe("192.168.1.1");
      expect(auditEntry.userAgent).toBe("Mozilla/5.0 TestBrowser");

      expect(auditEntry.oldValues).toEqual({
        reviewStatus: "NOT_REVIEWED",
        reviewedAt: null,
        reviewedBy: null,
        reviewNotes: null,
      });

      expect(auditEntry.newValues.reviewStatus).toBe("VALID");
      expect(auditEntry.newValues.reviewedBy).toBe("moderator_1");
      expect(auditEntry.newValues.reviewNotes).toBe(
        "Confirmed legitimate community participant.",
      );

      expect(auditEntry.metadata).toEqual({
        programId: "program_alpha",
        slotNumber: 42,
        targetUserId: "target_user_audit",
        status: "ALLOCATED",
      });
    });
  });

  // -------------------------------------------------------------------------
  // 8. Kegagalan AuditLog menyebabkan perubahan review rollback
  // -------------------------------------------------------------------------
  describe("8. Transaction Rollback on AuditLog Failure", () => {
    beforeEach(() => {
      mockPrisma._store.slots.push({
        id: "slot_rollback_test",
        programId: "program_alpha",
        slotNumber: 77,
        userId: "user_regular",
        status: "ALLOCATED",
        reviewStatus: "NOT_REVIEWED",
        reviewedAt: null,
        reviewedBy: null,
        reviewNotes: "Initial note",
        allocatedAt: new Date(),
      });
    });

    it("rolls back review status and notes when audit log creation fails", async () => {
      // Force auditLog.create to throw
      mockPrisma._mockAuditCreateFail = true;

      // Verify execution throws
      await expect(
        updateGtdSlotReviewStatus(mockPrisma, {
          slotId: "slot_rollback_test",
          reviewStatus: "FLAGGED",
          reviewNotes: "Malicious sybil",
          reviewedBy: "moderator_1",
        }),
      ).rejects.toThrow("Database connection dropped during auditLog insert");

      // Verify the slot in store rolled back to NOT_REVIEWED and initial notes
      const dbSlot = mockPrisma._store.slots.find(
        (s: any) => s.id === "slot_rollback_test",
      );
      expect(dbSlot.reviewStatus).toBe("NOT_REVIEWED");
      expect(dbSlot.reviewNotes).toBe("Initial note");
      expect(dbSlot.reviewedBy).toBeNull();
      expect(dbSlot.reviewedAt).toBeNull();

      // Restore mock
      mockPrisma._mockAuditCreateFail = false;
    });
  });

  // -------------------------------------------------------------------------
  // 9. Client SDK Helpers (lib/admin/client.ts)
  // -------------------------------------------------------------------------
  describe("9. lib/admin/client.ts Helpers", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    it("adminListGtdSlotReviews serializes query params and calls GET /api/admin/whitelist/reviews", async () => {
      const mockResponseData = {
        slots: [],
        total: 0,
        limit: 10,
        offset: 0,
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponseData,
      });

      const res = await adminListGtdSlotReviews({
        programId: "prog_1",
        reviewStatus: "FLAGGED",
        search: "0xabc",
        limit: 10,
        offset: 5,
      });

      expect(fetch).toHaveBeenCalledWith(
        "/api/admin/whitelist/reviews?programId=prog_1&reviewStatus=FLAGGED&search=0xabc&limit=10&offset=5",
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        },
      );
      expect(res).toEqual(mockResponseData);
    });

    it("adminUpdateGtdSlotReview calls PATCH /api/admin/whitelist/reviews/[id]", async () => {
      const mockResponseData = {
        success: true,
        slot: { id: "slot_123", reviewStatus: "VALID" },
        auditLogId: "audit_1",
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponseData,
      });

      const res = await adminUpdateGtdSlotReview({
        slotId: "slot_123",
        reviewStatus: "VALID",
        reviewNotes: "Looks great",
      });

      expect(fetch).toHaveBeenCalledWith(
        "/api/admin/whitelist/reviews/slot_123",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewStatus: "VALID",
            reviewNotes: "Looks great",
          }),
        },
      );
      expect(res).toEqual(mockResponseData);
    });

    it("client helpers throw Error on API failure", async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: "FORBIDDEN",
          message: "Requires MODERATOR role.",
        }),
      });

      await expect(
        adminUpdateGtdSlotReview({
          slotId: "slot_123",
          reviewStatus: "FLAGGED",
        }),
      ).rejects.toThrow("Requires MODERATOR role.");
    });
  });
});
