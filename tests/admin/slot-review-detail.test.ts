import { describe, it, expect, vi, beforeEach } from "vitest";
import { getGtdSlotReviewDetail, AdminSlotReviewError } from "@/server/admin/slot-review";
import * as sessionModule from "@/server/auth/session";
import * as qualEngine from "@/server/whitelist/qualification";
import * as slotReviewModule from "@/server/admin/slot-review";

vi.mock("@/server/db", () => ({
  prisma: {
    wLSlot: {
      findUnique: vi.fn(),
    },
    evidenceSubmission: {
      findMany: vi.fn(),
    },
    auditLog: {
      findMany: vi.fn(),
    },
  },
}));

import { GET } from "@/app/api/admin/whitelist/reviews/[id]/route";

describe("GTD Slot Review Detail API (Task 6.3)", () => {
  let mockPrisma: any;
  let mockSlot: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSlot = {
      id: "slot-42",
      slotNumber: 42,
      programId: "prog-genesis",
      program: {
        id: "prog-genesis",
        name: "ChimpHood Genesis",
        slug: "genesis",
      },
      userId: "user-42",
      status: "ALLOCATED",
      reviewStatus: "NOT_REVIEWED",
      reviewedAt: null,
      reviewedBy: null,
      reviewNotes: null,
      allocatedAt: new Date("2026-10-15T12:00:00Z"),
      confirmedAt: null,
      allocatedBy: "SYSTEM_INSTANT",
      user: {
        id: "user-42",
        isBanned: false,
        wallet: { address: "0x4242424242424242424242424242424242424242" },
        xIdentity: {
          xId: "x-42",
          username: "crypto_chimp",
          name: "Crypto Chimp",
          profileImageUrl: "https://x.com/chimp.jpg",
        },
        banRecords: [],
      },
    };

    mockPrisma = {
      wLSlot: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.id === "slot-42") return mockSlot;
          return null;
        }),
      },
      evidenceSubmission: {
        findMany: vi.fn(async () => [
          {
            id: "sub-1",
            taskId: "task-x-follow",
            status: "APPROVED",
            payload: "https://x.com/follow-proof",
            reviewerNotes: "Verified follow",
            reviewedAt: new Date(),
            createdAt: new Date(),
            task: { title: "Follow @ChimpHood on X" },
          },
        ]),
      },
      auditLog: {
        findMany: vi.fn(async () => [
          {
            id: "log-1",
            action: "WL_SLOT_REVIEW_STATUS_UPDATED",
            actorId: "admin-1",
            actor: {
              id: "admin-1",
              role: "ADMIN",
              wallet: { address: "0xAdmin" },
              xIdentity: { username: "admin_x" },
            },
            oldValues: { reviewStatus: "NOT_REVIEWED" },
            newValues: { reviewStatus: "UNDER_REVIEW" },
            metadata: null,
            createdAt: new Date(),
          },
        ]),
      },
    };
  });

  it("retrieves full slot review detail with user profile, traits, campaign evidence, and audit history", async () => {
    vi.spyOn(qualEngine, "executeQualificationEvaluation").mockResolvedValue({
      qualified: true,
      phase: "SLOT_ALLOCATED",
      details: {
        heldCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
        missingCategories: [],
        completedMandatoryTasksCount: 2,
        totalMandatoryTasksCount: 2,
      },
    } as any);

    const result = await getGtdSlotReviewDetail(mockPrisma, "slot-42");

    expect(result.slot.id).toBe("slot-42");
    expect(result.slot.slotNumber).toBe(42);
    expect(result.slot.user.wallet?.address).toBe("0x4242424242424242424242424242424242424242");
    expect(result.slot.user.xIdentity?.username).toBe("crypto_chimp");

    // Trait categories checklist
    expect(result.traits.heldCategoriesCount).toBe(5);
    expect(result.traits.hasAllCategories).toBe(true);
    expect(result.traits.missingCategories).toHaveLength(0);

    // Campaign evidence
    expect(result.campaigns.submissions).toHaveLength(1);
    expect(result.campaigns.submissions[0].taskTitle).toBe("Follow @ChimpHood on X");
    expect(result.campaigns.submissions[0].status).toBe("APPROVED");

    // Specific WLSlot audit history
    expect(result.auditHistory).toHaveLength(1);
    expect(result.auditHistory[0].action).toBe("WL_SLOT_REVIEW_STATUS_UPDATED");
    expect(result.auditHistory[0].actor?.username).toBe("admin_x");
  });

  it("throws AdminSlotReviewError with 404 when slot does not exist", async () => {
    await expect(getGtdSlotReviewDetail(mockPrisma, "nonexistent-slot")).rejects.toThrow(
      AdminSlotReviewError,
    );
  });

  it("route GET /api/admin/whitelist/reviews/[id] enforces auth and returns detail", async () => {
    vi.spyOn(sessionModule, "requireAdminSession").mockResolvedValue({
      user: { id: "mod-1" },
      adminRole: { roleType: "MODERATOR" },
    } as any);

    vi.spyOn(slotReviewModule, "getGtdSlotReviewDetail").mockResolvedValue({
      slot: mockSlot,
      traits: {
        heldCategories: ["BG", "FUR"],
        heldCategoriesCount: 2,
        missingCategories: ["CLOTHING", "HEADWEAR", "EYEWEAR"],
        hasAllCategories: false,
      },
      campaigns: {
        completedMandatoryTasksCount: 1,
        totalMandatoryTasksCount: 2,
        tasksCompleted: false,
        submissions: [],
      },
      auditHistory: [],
    } as any);

    const req = new Request("http://localhost:3000/api/admin/whitelist/reviews/slot-42");
    const res = await GET(req, { params: Promise.resolve({ id: "slot-42" }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.slot.id).toBe("slot-42");
    expect(json.traits.heldCategoriesCount).toBe(2);
  });
});
