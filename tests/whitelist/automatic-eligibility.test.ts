import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  evaluateUserQualification,
  getUserQualificationStatus,
  triggerAutomaticEligibilityEvaluation,
  REQUIRED_TRAIT_CATEGORIES,
} from "@/server/whitelist/qualification";
import { reviewEvidence } from "@/server/admin/evidence";
import { claimDrop } from "@/server/drops/claim";
import { acceptGift, sendGift } from "@/server/inventory/gift";
import type { PrismaClient } from "@prisma/client";

function createMockPrisma() {
  const store = {
    users: [] as any[],
    wallets: [] as any[],
    xIdentities: [] as any[],
    programs: [] as any[],
    campaigns: [] as any[],
    campaignVersions: [] as any[],
    campaignTasks: [] as any[],
    taskProgresses: [] as any[],
    evidenceSubmissions: [] as any[],
    inventoryItems: [] as any[],
    traits: [] as any[],
    qualifications: [] as any[],
    queueEntries: [] as any[],
    slots: [] as any[],
    statusHistories: [] as any[],
    auditLogs: [] as any[],
    banRecords: [] as any[],
    drops: [] as any[],
    periods: [] as any[],
    poolItems: [] as any[],
    claims: [] as any[],
    abuseFlags: [] as any[],
    gifts: [] as any[],
  };

  const createTx = () => {
    return {
      user: {
        findUnique: vi.fn(async ({ where }: any) => {
          const user = store.users.find((u) => u.id === where.id);
          if (!user) return null;
          const wallet = store.wallets.find((w) => w.userId === user.id);
          const xIdentity = store.xIdentities.find((x) => x.userId === user.id);
          const banRecords = store.banRecords.filter((b) => b.userId === user.id);
          return {
            ...user,
            wallet,
            xIdentity,
            banRecords,
          };
        }),
      },
      wLProgram: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.programs.find((p) => p.id === where.id) || null;
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.programs.find((p) => {
              if (where?.status && p.status !== where.status) return false;
              return true;
            }) || null
          );
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const p = store.programs.find((prog) => prog.id === where.id);
          if (p && data.allocatedSlotsCount?.increment) {
            p.allocatedSlotsCount += data.allocatedSlotsCount.increment;
          }
          return p;
        }),
      },
      inventoryItem: {
        findUnique: vi.fn(async ({ where }: any) => {
          const item = store.inventoryItems.find((i) => i.id === where.id);
          if (!item) return null;
          const trait = store.traits.find((t) => t.id === item.traitId);
          return { ...item, trait };
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.inventoryItems
              .filter((i) => !where?.traitId || i.traitId === where.traitId)
              .sort((a, b) => (b.edition ?? 0) - (a.edition ?? 0))[0] || null
          );
        }),
        findMany: vi.fn(async ({ where }: any) => {
          return store.inventoryItems
            .filter((i) => {
              if (where?.ownerId && i.ownerId !== where.ownerId) return false;
              if (where?.isLocked !== undefined && Boolean(i.isLocked) !== Boolean(where.isLocked)) return false;
              return true;
            })
            .map((i) => ({
              ...i,
              trait: store.traits.find((t) => t.id === i.traitId),
            }));
        }),
        count: vi.fn(async ({ where }: any) => {
          return store.inventoryItems.filter((i) => {
            if (where?.ownerId && i.ownerId !== where.ownerId) return false;
            if (where?.traitId && i.traitId !== where.traitId) return false;
            return true;
          }).length;
        }),
        create: vi.fn(async ({ data }: any) => {
          const item = { id: `item-${store.inventoryItems.length + 1}`, ...data };
          store.inventoryItems.push(item);
          return {
            ...item,
            trait: store.traits.find((t) => t.id === item.traitId),
          };
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const item = store.inventoryItems.find((i) => i.id === where.id);
          if (item) Object.assign(item, data);
          return {
            ...item,
            trait: store.traits.find((t) => t.id === item.traitId),
          };
        }),
      },
      promoCampaign: {
        findMany: vi.fn(async ({ where }: any) => {
          return store.campaigns
            .filter((c) => {
              if (where?.wlProgramId && c.wlProgramId !== where.wlProgramId) return false;
              if (where?.status && c.status !== where.status) return false;
              return true;
            })
            .map((c) => ({
              ...c,
              versions: store.campaignVersions
                .filter((v) => v.campaignId === c.id && v.isCurrent)
                .map((v) => ({
                  ...v,
                  tasks: store.campaignTasks.filter(
                    (t) => t.versionId === v.id && t.isRequired,
                  ),
                })),
            }));
        }),
      },
      taskProgress: {
        findUnique: vi.fn(async ({ where }: any) => {
          const key = where.userId_versionId_taskId;
          const progress = store.taskProgresses.find(
            (tp) =>
              tp.userId === key.userId &&
              tp.versionId === key.versionId &&
              tp.taskId === key.taskId,
          );
          if (!progress) return null;
          const evidenceSubmissions = store.evidenceSubmissions.filter(
            (es) => es.taskProgressId === progress.id && es.status === "APPROVED",
          );
          return { ...progress, evidenceSubmissions };
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const tp = store.taskProgresses.find((p) => p.id === where.id);
          if (tp) Object.assign(tp, data);
          return tp;
        }),
      },
      evidenceSubmission: {
        findUnique: vi.fn(async ({ where }: any) => {
          const es = store.evidenceSubmissions.find((e) => e.id === where.id);
          if (!es) return null;
          const tp = store.taskProgresses.find((p) => p.id === es.taskProgressId);
          const task = store.campaignTasks.find((t) => t.id === es.taskId);
          return { ...es, taskProgress: tp, task };
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const es = store.evidenceSubmissions.find((e) => e.id === where.id);
          if (es) Object.assign(es, data);
          return es;
        }),
      },
      wLQualification: {
        findUnique: vi.fn(async ({ where }: any) => {
          const key = where.programId_userId;
          return (
            store.qualifications.find(
              (q) => q.programId === key.programId && q.userId === key.userId,
            ) || null
          );
        }),
        upsert: vi.fn(async ({ where, create, update }: any) => {
          const key = where.programId_userId;
          let q = store.qualifications.find(
            (item) => item.programId === key.programId && item.userId === key.userId,
          );
          if (q) {
            Object.assign(q, update);
          } else {
            q = { id: `qual-${store.qualifications.length + 1}`, ...create };
            store.qualifications.push(q);
          }
          return q;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const q = store.qualifications.find((item) => item.id === where.id);
          if (q) Object.assign(q, data);
          return q;
        }),
      },
      wLSlot: {
        findUnique: vi.fn(async ({ where }: any) => {
          const key = where.programId_userId;
          return (
            store.slots.find(
              (s) => s.programId === key.programId && s.userId === key.userId,
            ) || null
          );
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.slots.find((s) => {
              if (where?.programId && s.programId !== where.programId) return false;
              if (where?.userId && s.userId !== where.userId) return false;
              if (where?.status?.in && !where.status.in.includes(s.status)) return false;
              return true;
            }) || null
          );
        }),
        findMany: vi.fn(async ({ where }: any) => {
          return store.slots.filter((s) => {
            if (where?.programId && s.programId !== where.programId) return false;
            if (where?.status?.in && !where.status.in.includes(s.status)) return false;
            return true;
          });
        }),
        count: vi.fn(async ({ where }: any) => {
          return store.slots.filter((s) => {
            if (where?.programId && s.programId !== where.programId) return false;
            if (where?.status?.in && !where.status.in.includes(s.status)) return false;
            return true;
          }).length;
        }),
        create: vi.fn(async ({ data }: any) => {
          const slot = { id: `slot-${store.slots.length + 1}`, ...data };
          store.slots.push(slot);
          return slot;
        }),
      },
      wLQueueEntry: {
        findUnique: vi.fn(async ({ where }: any) => {
          const key = where.programId_userId;
          return (
            store.queueEntries.find(
              (qe) => qe.programId === key.programId && qe.userId === key.userId,
            ) || null
          );
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.queueEntries
              .filter((qe) => {
                if (where?.programId && qe.programId !== where.programId) return false;
                if (where?.status && qe.status !== where.status) return false;
                return true;
              })
              .sort((a, b) => a.queueNumber - b.queueNumber)[0] || null
          );
        }),
        count: vi.fn(async () => 0),
        upsert: vi.fn(async ({ where, create, update }: any) => {
          const key = where.programId_userId;
          let qe = store.queueEntries.find(
            (item) => item.programId === key.programId && item.userId === key.userId,
          );
          if (qe) {
            Object.assign(qe, update);
          } else {
            qe = { id: `qe-${store.queueEntries.length + 1}`, ...create };
            store.queueEntries.push(qe);
          }
          return qe;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const qe of store.queueEntries) {
            if (qe.programId === where.programId && qe.userId === where.userId) {
              Object.assign(qe, data);
              count++;
            }
          }
          return { count };
        }),
      },
      wLStatusHistory: {
        create: vi.fn(async ({ data }: any) => {
          store.statusHistories.push(data);
          return data;
        }),
      },
      auditLog: {
        create: vi.fn(async ({ data }: any) => {
          const log = { id: `audit-${store.auditLogs.length + 1}`, ...data };
          store.auditLogs.push(log);
          return log;
        }),
      },
      gift: {
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.gifts.find((g) => {
              if (where?.senderId && g.senderId !== where.senderId) return false;
              if (where?.createdAt?.gte && g.createdAt < where.createdAt.gte) return false;
              if (where?.createdAt?.lte && g.createdAt > where.createdAt.lte) return false;
              return true;
            }) || null
          );
        }),
        findUnique: vi.fn(async ({ where }: any) => {
          const g = store.gifts.find((gift) => gift.id === where.id);
          if (!g) return null;
          const inventoryItem = store.inventoryItems.find((i) => i.id === g.inventoryItemId);
          return { ...g, inventoryItem };
        }),
        create: vi.fn(async ({ data }: any) => {
          const gift = { id: `gift-${store.gifts.length + 1}`, ...data };
          store.gifts.push(gift);
          return gift;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const g = store.gifts.find((gift) => gift.id === where.id);
          if (g) Object.assign(g, data);
          return g;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const g of store.gifts) {
            if (g.id === where.id && (where.status === undefined || g.status === where.status)) {
              Object.assign(g, data);
              count++;
            }
          }
          return { count };
        }),
      },
      dropPeriod: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.periods.find((p) => p.id === where.id) || null;
        }),
      },
      drop: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.drops.find((d) => d.id === where.id) || null;
        }),
      },
      dropPoolItem: {
        findMany: vi.fn(async ({ where }: any) => {
          return store.poolItems.filter((pi) => pi.dropId === where.dropId);
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const pi = store.poolItems.find((item) => item.id === where.id);
          if (pi) {
            if (data.remainingStock?.decrement) pi.remainingStock -= data.remainingStock.decrement;
            if (data.claimedStock?.increment) pi.claimedStock += data.claimedStock.increment;
          }
          return pi;
        }),
      },
      claim: {
        create: vi.fn(async ({ data }: any) => {
          const c = { id: `claim-${store.claims.length + 1}`, ...data };
          store.claims.push(c);
          return c;
        }),
        findFirst: vi.fn(async () => null),
      },
      abuseFlag: {
        create: vi.fn(async ({ data }: any) => {
          const f = { id: `flag-${store.abuseFlags.length + 1}`, ...data };
          store.abuseFlags.push(f);
          return f;
        }),
      },
      banRecord: {
        findFirst: vi.fn(async () => null),
      },
    };
  };

  const client = {
    ...createTx(),
    $transaction: vi.fn(async (cb: any) => {
      const tx = createTx();
      return await cb(tx);
    }),
  };

  return { client, store };
}

describe("Whitelist Automatic Eligibility Evaluation (Task 5)", () => {
  let mock: ReturnType<typeof createMockPrisma>;
  const programId = "prog-main";
  const userId = "user-alice";

  beforeEach(() => {
    mock = createMockPrisma();

    // Set up open program with 10 total slots
    mock.store.programs.push({
      id: programId,
      slug: "chimphood-wl-main",
      name: "ChimpHood Genesis",
      totalSlots: 10,
      allocatedSlotsCount: 0,
      status: "OPEN",
    });

    // Set up user with wallet and X identity
    mock.store.users.push({ id: userId, isBanned: false });
    mock.store.wallets.push({ id: "w-1", userId, address: "0x1111111111111111111111111111111111111111" });
    mock.store.xIdentities.push({ id: "x-1", userId, xId: "x123", username: "alice_crypto" });

    // 5 Traits
    const categories = ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"] as const;
    categories.forEach((cat, idx) => {
      const traitId = `trait-${cat}`;
      mock.store.traits.push({ id: traitId, category: cat, name: `Trait ${cat}` });
      mock.store.inventoryItems.push({
        id: `item-${idx + 1}`,
        ownerId: userId,
        traitId,
        edition: 1,
        acquiredVia: "CLAIM",
      });
    });

    // Mandatory Task
    mock.store.campaigns.push({ id: "camp-1", wlProgramId: programId, status: "ACTIVE" });
    mock.store.campaignVersions.push({ id: "ver-1", campaignId: "camp-1", isCurrent: true });
    mock.store.campaignTasks.push({ id: "task-1", versionId: "ver-1", isRequired: true, title: "Mandatory Task" });
    mock.store.taskProgresses.push({
      id: "tp-1",
      userId,
      versionId: "ver-1",
      taskId: "task-1",
      status: "VERIFIED",
    });
  });

  // 1. User memenuhi syarat terakhir dan GTD slot masih tersedia.
  it("allocates a GTD slot immediately when user satisfies the last requirement and capacity is available", async () => {
    const prisma = mock.client as unknown as PrismaClient;

    const result = await triggerAutomaticEligibilityEvaluation(prisma, { userId });

    expect(result).not.toBeNull();
    expect(result?.qualified).toBe(true);
    expect(result?.phase).toBe("SLOT_ALLOCATED");
    expect(result?.slotNumber).toBe(1);

    const program = mock.store.programs.find((p) => p.id === programId);
    expect(program.allocatedSlotsCount).toBe(1);

    const slot = mock.store.slots.find((s) => s.userId === userId);
    expect(slot).toBeDefined();
    expect(slot.status).toBe("ALLOCATED");
  });

  // 2. User memenuhi syarat terakhir tetapi GTD capacity penuh.
  it("registers user in FCFS Directory when user satisfies requirements but GTD capacity is full", async () => {
    const prisma = mock.client as unknown as PrismaClient;
    const program = mock.store.programs.find((p) => p.id === programId);
    program.totalSlots = 5;
    program.allocatedSlotsCount = 5; // Capacity completely full

    const result = await triggerAutomaticEligibilityEvaluation(prisma, { userId });

    expect(result).not.toBeNull();
    expect(result?.qualified).toBe(true);
    expect(result?.phase).toBe("IN_QUEUE");
    expect(result?.queueNumber).toBe(1);

    // No GTD slot allocated beyond total capacity
    expect(mock.store.slots.filter((s) => s.userId === userId)).toHaveLength(0);
    expect(program.allocatedSlotsCount).toBe(5);

    // User is marked QUALIFIED in qualification records
    const qual = mock.store.qualifications.find((q) => q.userId === userId);
    expect(qual?.status).toBe("QUALIFIED");
  });

  // 3. Evaluasi berulang tidak membuat alokasi ganda.
  it("is idempotent: repeated evaluations do not create double slot allocations", async () => {
    const prisma = mock.client as unknown as PrismaClient;

    const res1 = await triggerAutomaticEligibilityEvaluation(prisma, { userId });
    expect(res1?.phase).toBe("SLOT_ALLOCATED");
    expect(res1?.slotNumber).toBe(1);

    const res2 = await triggerAutomaticEligibilityEvaluation(prisma, { userId });
    expect(res2?.phase).toBe("SLOT_ALLOCATED");
    expect(res2?.slotNumber).toBe(1);

    const userSlots = mock.store.slots.filter((s) => s.userId === userId);
    expect(userSlots).toHaveLength(1);

    const program = mock.store.programs.find((p) => p.id === programId);
    expect(program.allocatedSlotsCount).toBe(1);
  });

  // 4. Concurrent evaluation tidak menyebabkan over-allocation.
  it("safely handles multiple evaluations without exceeding program capacity", async () => {
    const prisma = mock.client as unknown as PrismaClient;
    const program = mock.store.programs.find((p) => p.id === programId);
    program.totalSlots = 2;

    // Set up second user with requirements
    const user2 = "user-bob";
    mock.store.users.push({ id: user2, isBanned: false });
    mock.store.wallets.push({ id: "w-2", userId: user2, address: "0x2222222222222222222222222222222222222222" });
    mock.store.xIdentities.push({ id: "x-2", userId: user2, xId: "x456", username: "bob_crypto" });
    const categories = ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"] as const;
    categories.forEach((cat, idx) => {
      mock.store.inventoryItems.push({
        id: `item-bob-${idx + 1}`,
        ownerId: user2,
        traitId: `trait-${cat}`,
        edition: 2,
        acquiredVia: "CLAIM",
      });
    });
    mock.store.taskProgresses.push({
      id: "tp-2",
      userId: user2,
      versionId: "ver-1",
      taskId: "task-1",
      status: "VERIFIED",
    });

    // Execute evaluations
    await Promise.all([
      triggerAutomaticEligibilityEvaluation(prisma, { userId }),
      triggerAutomaticEligibilityEvaluation(prisma, { userId: user2 }),
    ]);

    expect(program.allocatedSlotsCount).toBeLessThanOrEqual(2);
    expect(mock.store.slots).toHaveLength(2);
  });

  // 5. Approval evidence memicu evaluasi bila itu syarat terakhir.
  it("triggers automatic evaluation when admin approves mandatory task evidence", async () => {
    const prisma = mock.client as unknown as PrismaClient;

    // Reset task progress to SUBMITTED
    const tp = mock.store.taskProgresses.find((p) => p.userId === userId);
    tp.status = "SUBMITTED";

    const submissionId = "es-1";
    mock.store.evidenceSubmissions.push({
      id: submissionId,
      taskProgressId: tp.id,
      taskId: "task-1",
      userId,
      submissionType: "URL",
      payload: "https://x.com/proof",
      status: "PENDING_REVIEW",
    });

    // Admin reviews and APPROVES the evidence
    const reviewRes = await reviewEvidence(prisma, {
      submissionId,
      adminUserId: "admin-1",
      status: "APPROVED",
      reviewerNotes: "Verified evidence.",
    });

    expect(reviewRes.success).toBe(true);
    expect(reviewRes.submission.status).toBe("APPROVED");

    // Whitelist slot should have been automatically allocated!
    const slot = mock.store.slots.find((s) => s.userId === userId);
    expect(slot).toBeDefined();
    expect(slot?.status).toBe("ALLOCATED");
    expect(slot?.slotNumber).toBe(1);

    const program = mock.store.programs.find((p) => p.id === programId);
    expect(program.allocatedSlotsCount).toBe(1);
  });

  // 6. Refresh halaman tidak menyebabkan mutasi database.
  it("ensures readOnly evaluations (page open/refresh) perform zero mutations", async () => {
    const prisma = mock.client as unknown as PrismaClient;

    const initialSlotsCount = mock.store.slots.length;
    const initialQualsCount = mock.store.qualifications.length;
    const initialQueueCount = mock.store.queueEntries.length;

    // Calling getUserQualificationStatus (which is what GET /api/whitelist/status invokes)
    const result = await getUserQualificationStatus(prisma, {
      userId,
      programId,
    });

    expect(result.qualified).toBe(true);

    // Database state remains strictly unchanged
    expect(mock.store.slots.length).toBe(initialSlotsCount);
    expect(mock.store.qualifications.length).toBe(initialQualsCount);
    expect(mock.store.queueEntries.length).toBe(initialQueueCount);

    const program = mock.store.programs.find((p) => p.id === programId);
    expect(program.allocatedSlotsCount).toBe(0);
  });

  // 7. Status REVOKED tidak bisa kembali eligible secara otomatis.
  it("guarantees REVOKED status can never automatically become eligible again (DEC-022)", async () => {
    const prisma = mock.client as unknown as PrismaClient;

    // Record REVOKED qualification and revoked slot
    mock.store.qualifications.push({
      id: "qual-revoked",
      programId,
      userId,
      status: "REVOKED",
      reason: "Administrative ban per DEC-022",
    });
    mock.store.slots.push({
      id: "slot-revoked",
      programId,
      userId,
      slotNumber: 5,
      status: "REVOKED_MANUAL_ADMIN",
      notes: "Administrative ban per DEC-022",
    });

    const result = await triggerAutomaticEligibilityEvaluation(prisma, { userId });

    expect(result).not.toBeNull();
    expect(result?.qualified).toBe(false);
    expect(result?.phase).toBe("REVOKED");
    expect(result?.missingRequirements[0]).toContain("revoked");

    // No new active slot is created
    const activeSlots = mock.store.slots.filter(
      (s) => s.userId === userId && s.status === "ALLOCATED",
    );
    expect(activeSlots).toHaveLength(0);
  });

  // 8. Inventory dan Gift tetap berfungsi di luar `/whitelist`.
  it("confirms Inventory and Gifting features remain intact and operational outside /whitelist", async () => {
    const prisma = mock.client as unknown as PrismaClient;

    const senderId = userId;
    const recipientId = "user-charlie";
    mock.store.users.push({ id: recipientId, isBanned: false });
    mock.store.wallets.push({ id: "w-3", userId: recipientId, address: "0x3333333333333333333333333333333333333333" });

    // Sender owns duplicate BG trait
    const duplicateItemId = "item-dup-bg";
    mock.store.inventoryItems.push({
      id: duplicateItemId,
      ownerId: senderId,
      traitId: "trait-BG",
      edition: 2,
      acquiredVia: "CLAIM",
      isLocked: false,
    });

    // Send gift
    const sendResult = await sendGift(prisma, {
      senderId,
      receiverId: recipientId,
      inventoryItemId: duplicateItemId,
    });
    expect(sendResult).toBeDefined();
    expect(sendResult.status).toBe("PENDING");

    // Accept gift
    const acceptResult = await acceptGift(prisma, {
      userId: recipientId,
      giftId: sendResult.id,
    });
    expect(acceptResult.gift.status).toBe("ACCEPTED");
    expect(acceptResult.item.ownerId).toBe(recipientId);
  });

  // 9. /whitelist tidak lagi memiliki Check Eligibility, Inventory, atau Gift.
  it("verifies /whitelist page source does not contain Check Eligibility, Inventory section, or Gift section", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const pagePath = path.resolve(process.cwd(), "app/whitelist/page.tsx");
    const pageContent = await fs.readFile(pagePath, "utf-8");

    // Must not contain Check Eligibility or manual Lookup
    expect(pageContent).not.toContain("Check Eligibility");
    expect(pageContent).not.toContain("Qualify / Claim Slot");
    expect(pageContent).not.toContain("handleQualify");
    expect(pageContent).not.toContain("0x... EVM wallet address");
    expect(pageContent).not.toContain("handleCheck");

    // Must not contain Gifts section or Inventory section
    expect(pageContent).not.toContain("Gifts & Referral Allocation");
    expect(pageContent).not.toContain("Collection & Inventory");
    expect(pageContent).not.toContain("Pending Gift Window");
    expect(pageContent).not.toContain("submitWhitelistQualification");

    // Must retain Whitelist status, 5 traits checklist, tasks, and link to /drops
    expect(pageContent).toContain("Whitelist Status & Allocation");
    expect(pageContent).toContain("Required Trait Categories (5 of 5)");
    expect(pageContent).toContain('href="/drops"');
    expect(pageContent).toContain("Campaigns & Quests");
  });
});
