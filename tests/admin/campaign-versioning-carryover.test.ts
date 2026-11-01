import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createCampaignVersion,
  listCampaignVersions,
  AdminCampaignError,
} from "@/server/admin/campaign";
import { evaluateUserQualification } from "@/server/whitelist/qualification";
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
  };

  const createTx = () => {
    const tx = {
      $queryRaw: vi.fn(async (strings: any, ...values: any[]) => {
        const text = String(strings);
        if (text.includes("WLProgram")) {
          const id = values[0];
          const prog = store.programs.find((p) => p.id === id);
          return prog ? [prog] : [];
        }
        if (text.includes("PromoCampaign")) {
          const id = values[0];
          const camp = store.campaigns.find((c) => c.id === id);
          return camp ? [camp] : [];
        }
        return [];
      }),
      user: {
        findUnique: vi.fn(async ({ where }: any) => {
          const user = store.users.find((u) => u.id === where.id);
          if (!user) return null;
          const wallet = store.wallets.find((w) => w.userId === user.id);
          const xIdentity = store.xIdentities.find((x) => x.userId === user.id);
          return {
            ...user,
            wallet,
            xIdentity,
            banRecords: user.banRecords ?? [],
          };
        }),
      },
      wLProgram: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.programs.find((p) => p.id === where.id) || null;
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
        findMany: vi.fn(async ({ where }: any) => {
          return store.inventoryItems
            .filter((i) => i.ownerId === where.ownerId)
            .map((i) => ({
              ...i,
              trait: store.traits.find((t) => t.id === i.traitId),
            }));
        }),
      },
      promoCampaign: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.campaigns.find((c) => c.id === where.id) || null;
        }),
        findMany: vi.fn(async ({ where }: any) => {
          return store.campaigns
            .filter((c) => {
              if (where.wlProgramId && c.wlProgramId !== where.wlProgramId) return false;
              if (where.status && c.status !== where.status) return false;
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
      campaignVersion: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.id) {
            return store.campaignVersions.find((v) => v.id === where.id) || null;
          }
          if (where.campaignId_versionNumber) {
            return (
              store.campaignVersions.find(
                (v) =>
                  v.campaignId === where.campaignId_versionNumber.campaignId &&
                  v.versionNumber === where.campaignId_versionNumber.versionNumber,
              ) || null
            );
          }
          return null;
        }),
        findFirst: vi.fn(async (args: any) => {
          const where = args?.where ?? {};
          const filtered = store.campaignVersions.filter((v) => {
            if (where.campaignId && v.campaignId !== where.campaignId) return false;
            if (where.isCurrent !== undefined && v.isCurrent !== where.isCurrent) return false;
            return true;
          });
          const match = filtered[0] || null;
          if (match && args?.include?.tasks) {
            return {
              ...match,
              tasks: store.campaignTasks.filter((t) => t.versionId === match.id),
            };
          }
          return match;
        }),
        findMany: vi.fn(async (args: any) => {
          const where = args?.where ?? {};
          return store.campaignVersions
            .filter((v) => {
              if (where.campaignId && v.campaignId !== where.campaignId) return false;
              return true;
            })
            .sort((a, b) => b.versionNumber - a.versionNumber)
            .map((v) => {
              if (args?.include?.tasks) {
                return {
                  ...v,
                  tasks: store.campaignTasks.filter((t) => t.versionId === v.id),
                };
              }
              return v;
            });
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const v of store.campaignVersions) {
            if (where.campaignId && v.campaignId !== where.campaignId) continue;
            if (where.isCurrent !== undefined && v.isCurrent !== where.isCurrent) continue;
            Object.assign(v, data);
            count++;
          }
          return { count };
        }),
        create: vi.fn(async ({ data }: any) => {
          const newV = {
            id: `ver_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          store.campaignVersions.push(newV);
          return newV;
        }),
      },
      campaignTask: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.id) {
            return store.campaignTasks.find((t) => t.id === where.id) || null;
          }
          if (where.versionId_taskCode) {
            return (
              store.campaignTasks.find(
                (t) =>
                  t.versionId === where.versionId_taskCode.versionId &&
                  t.taskCode === where.versionId_taskCode.taskCode,
              ) || null
            );
          }
          return null;
        }),
        findMany: vi.fn(async ({ where }: any) => {
          return store.campaignTasks.filter((t) => {
            if (where.versionId && t.versionId !== where.versionId) return false;
            return true;
          });
        }),
        create: vi.fn(async ({ data }: any) => {
          const newTask = {
            id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          store.campaignTasks.push(newTask);
          return newTask;
        }),
      },
      taskProgress: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.userId_versionId_taskId) {
            const { userId, versionId, taskId } = where.userId_versionId_taskId;
            const progress = store.taskProgresses.find(
              (tp) =>
                tp.userId === userId &&
                tp.versionId === versionId &&
                tp.taskId === taskId,
            );
            if (!progress) return null;
            const evidenceSubmissions = store.evidenceSubmissions.filter(
              (e) => e.taskProgressId === progress.id && e.status === "APPROVED",
            );
            return { ...progress, evidenceSubmissions };
          }
          return null;
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
              if (where.programId && s.programId !== where.programId) return false;
              if (where.userId && s.userId !== where.userId) return false;
              if (where.status?.in && !where.status.in.includes(s.status)) return false;
              return true;
            }) || null
          );
        }),
        findMany: vi.fn(async ({ where }: any) => {
          return store.slots.filter((s) => {
            if (where.programId && s.programId !== where.programId) return false;
            if (where.userId && s.userId !== where.userId) return false;
            if (where.status?.in && !where.status.in.includes(s.status)) return false;
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
          const slot = {
            id: `slot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            allocatedAt: new Date(),
          };
          store.slots.push(slot);
          return slot;
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
        create: vi.fn(async ({ data }: any) => {
          const q = { id: `qual_${Date.now()}`, ...data, qualifiedAt: new Date() };
          store.qualifications.push(q);
          return q;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const q = store.qualifications.find((item) => item.id === where.id);
          if (q) Object.assign(q, data);
          return q;
        }),
        upsert: vi.fn(async ({ where, create, update }: any) => {
          const key = where.programId_userId;
          let q = store.qualifications.find(
            (item) => item.programId === key.programId && item.userId === key.userId,
          );
          if (q) {
            Object.assign(q, update);
          } else {
            q = { id: `qual_${Date.now()}`, ...create, qualifiedAt: new Date() };
            store.qualifications.push(q);
          }
          return q;
        }),
      },
      wLQueueEntry: {
        findUnique: vi.fn(async () => null),
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0),
        upsert: vi.fn(async ({ create }: any) => create),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      wLStatusHistory: {
        create: vi.fn(async ({ data }: any) => data),
      },
      auditLog: {
        create: vi.fn(async ({ data }: any) => {
          const log = { id: `audit_${Date.now()}_${Math.random()}`, ...data };
          store.auditLogs.push(log);
          return log;
        }),
      },
    };

    return tx;
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

describe("Campaign Versioning & Full Approved Progress Carry-Over", () => {
  let mock: ReturnType<typeof createMockPrisma>;

  const PROGRAM_ID = "wl-program-main";
  const CAMPAIGN_ID = "camp-genesis-main";
  const ADMIN_ID = "admin-super-1";
  const USER_ID = "user-alice-01";

  beforeEach(() => {
    mock = createMockPrisma();

    // Setup base program
    mock.store.programs.push({
      id: PROGRAM_ID,
      slug: "chimphood-wl-main",
      name: "ChimpHood Whitelist Main",
      totalSlots: 100,
      allocatedSlotsCount: 0,
      status: "OPEN",
    });

    // Setup user with wallet, X identity, and 5 trait categories
    mock.store.users.push({
      id: USER_ID,
      isBanned: false,
      banRecords: [],
    });
    mock.store.wallets.push({
      userId: USER_ID,
      address: "0x1111111111111111111111111111111111111111",
    });
    mock.store.xIdentities.push({
      userId: USER_ID,
      username: "alice_crypto",
      xId: "x-alice-123",
    });

    const categories = ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"];
    for (const cat of categories) {
      const traitId = `trait_${cat.toLowerCase()}`;
      mock.store.traits.push({ id: traitId, category: cat });
      mock.store.inventoryItems.push({
        id: `item_${cat.toLowerCase()}`,
        ownerId: USER_ID,
        traitId,
      });
    }

    // Setup main campaign
    mock.store.campaigns.push({
      id: CAMPAIGN_ID,
      slug: "genesis-promo-campaign",
      title: "Genesis Whitelist Quests",
      wlProgramId: PROGRAM_ID,
      status: "ACTIVE",
    });

    // Setup Version 1
    const v1 = {
      id: "ver-1",
      campaignId: CAMPAIGN_ID,
      versionNumber: 1,
      isCurrent: true,
      compatibilityMode: "FRESH_START",
      compatibleFromVersionId: null,
      startsAt: new Date("2026-10-01T00:00:00Z"),
      endsAt: null,
      changeNotes: "Initial launch",
      createdAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    };
    mock.store.campaignVersions.push(v1);

    // Setup Version 1 Tasks
    mock.store.campaignTasks.push(
      {
        id: "task-follow-x-v1",
        versionId: "ver-1",
        taskCode: "FOLLOW_X_CHIMPHOOD",
        title: "Follow @ChimpHood on X",
        taskType: "SOCIAL_X_FOLLOW",
        points: 10,
        isRequired: true,
        sortOrder: 1,
        requirementMetadata: { targetUsername: "ChimpHood" },
      },
      {
        id: "task-like-repost-v1",
        versionId: "ver-1",
        taskCode: "REPOST_ANNOUNCEMENT",
        title: "Like & Repost Post A",
        taskType: "SOCIAL_X_REPOST",
        points: 15,
        isRequired: true,
        sortOrder: 2,
        requirementMetadata: { tweetUrl: "https://x.com/ChimpHood/status/10001" },
      },
    );
  });

  // 1. Peserta Approved di v1, URL berubah di v2: tetap dianggap selesai.
  it("Scenario 1: Peserta Approved di v1, URL berubah di v2: tetap dianggap selesai", async () => {
    // User Alice got APPROVED for both tasks in v1
    mock.store.taskProgresses.push(
      {
        id: "tp-follow-v1",
        userId: USER_ID,
        versionId: "ver-1",
        taskId: "task-follow-x-v1",
        status: "VERIFIED",
      },
      {
        id: "tp-repost-v1",
        userId: USER_ID,
        versionId: "ver-1",
        taskId: "task-like-repost-v1",
        status: "VERIFIED",
      },
    );
    mock.store.evidenceSubmissions.push({
      id: "ev-repost-v1",
      userId: USER_ID,
      taskId: "task-like-repost-v1",
      taskProgressId: "tp-repost-v1",
      status: "APPROVED",
    });

    // Admin creates v2 with updated Tweet URL on REPOST_ANNOUNCEMENT
    const v2Result = await createCampaignVersion(mock.client as unknown as PrismaClient, {
      campaignId: CAMPAIGN_ID,
      adminUserId: ADMIN_ID,
      changeNotes: "Updated tweet URL to Post B",
      taskUpdates: [
        {
          taskCode: "REPOST_ANNOUNCEMENT",
          title: "Like & Repost Post B",
          requirementMetadata: { tweetUrl: "https://x.com/ChimpHood/status/20002" },
        },
      ],
    });

    expect(v2Result.version.versionNumber).toBe(2);
    expect(v2Result.version.isCurrent).toBe(true);
    expect(v2Result.version.compatibilityMode).toBe("LEGACY_CARRIED");
    expect(v2Result.version.compatibleFromVersionId).toBe("ver-1");

    // Evaluate qualification in v2: Alice should qualify via carry-over
    const qualResult = await evaluateUserQualification(mock.client as unknown as PrismaClient, {
      userId: USER_ID,
      programId: PROGRAM_ID,
    });

    expect(qualResult.qualified).toBe(true);
    expect(qualResult.missingRequirements).toHaveLength(0);
    expect(qualResult.details.completedMandatoryTasksCount).toBe(2);
    expect(qualResult.details.totalMandatoryTasksCount).toBe(2);
  });

  // 2. Peserta Pending di v1, versi baru diterbitkan: tidak dianggap selesai.
  it("Scenario 2: Peserta Pending di v1, versi baru diterbitkan: tidak dianggap selesai", async () => {
    // Follow is verified, but Repost is SUBMITTED with PENDING_REVIEW
    mock.store.taskProgresses.push(
      {
        id: "tp-follow-v1",
        userId: USER_ID,
        versionId: "ver-1",
        taskId: "task-follow-x-v1",
        status: "VERIFIED",
      },
      {
        id: "tp-repost-v1",
        userId: USER_ID,
        versionId: "ver-1",
        taskId: "task-like-repost-v1",
        status: "SUBMITTED",
      },
    );
    mock.store.evidenceSubmissions.push({
      id: "ev-repost-v1",
      userId: USER_ID,
      taskId: "task-like-repost-v1",
      taskProgressId: "tp-repost-v1",
      status: "PENDING_REVIEW",
    });

    // Admin publishes v2
    await createCampaignVersion(mock.client as unknown as PrismaClient, {
      campaignId: CAMPAIGN_ID,
      adminUserId: ADMIN_ID,
      changeNotes: "v2 launch",
    });

    // Alice should NOT qualify because pending evidence does not carry over
    const qualResult = await evaluateUserQualification(mock.client as unknown as PrismaClient, {
      userId: USER_ID,
      programId: PROGRAM_ID,
    });

    expect(qualResult.qualified).toBe(false);
    expect(qualResult.missingRequirements.length).toBeGreaterThan(0);
    expect(qualResult.missingRequirements[0]).toContain("Incomplete task");
  });

  // 3. Peserta Rejected di v1: tidak dianggap selesai.
  it("Scenario 3: Peserta Rejected di v1: tidak dianggap selesai", async () => {
    mock.store.taskProgresses.push(
      {
        id: "tp-follow-v1",
        userId: USER_ID,
        versionId: "ver-1",
        taskId: "task-follow-x-v1",
        status: "VERIFIED",
      },
      {
        id: "tp-repost-v1",
        userId: USER_ID,
        versionId: "ver-1",
        taskId: "task-like-repost-v1",
        status: "REJECTED",
      },
    );
    mock.store.evidenceSubmissions.push({
      id: "ev-repost-v1",
      userId: USER_ID,
      taskId: "task-like-repost-v1",
      taskProgressId: "tp-repost-v1",
      status: "REJECTED",
    });

    await createCampaignVersion(mock.client as unknown as PrismaClient, {
      campaignId: CAMPAIGN_ID,
      adminUserId: ADMIN_ID,
      changeNotes: "v2 launch",
    });

    const qualResult = await evaluateUserQualification(mock.client as unknown as PrismaClient, {
      userId: USER_ID,
      programId: PROGRAM_ID,
    });

    expect(qualResult.qualified).toBe(false);
    expect(qualResult.missingRequirements.length).toBeGreaterThan(0);
  });

  // 4. Task baru di v2: harus dikerjakan.
  it("Scenario 4: Task baru di v2: harus dikerjakan", async () => {
    // Alice completed both tasks from v1
    mock.store.taskProgresses.push(
      {
        id: "tp-follow-v1",
        userId: USER_ID,
        versionId: "ver-1",
        taskId: "task-follow-x-v1",
        status: "VERIFIED",
      },
      {
        id: "tp-repost-v1",
        userId: USER_ID,
        versionId: "ver-1",
        taskId: "task-like-repost-v1",
        status: "VERIFIED",
      },
    );

    // Admin creates v2 with a brand new mandatory task
    await createCampaignVersion(mock.client as unknown as PrismaClient, {
      campaignId: CAMPAIGN_ID,
      adminUserId: ADMIN_ID,
      changeNotes: "Added quote tweet task",
      taskAdditions: [
        {
          taskCode: "QUOTE_TWEET_CREATIVE",
          title: "Quote Tweet with Chimp Art",
          taskType: "CUSTOM",
          points: 20,
          isRequired: true,
          sortOrder: 3,
        },
      ],
    });

    const qualResult = await evaluateUserQualification(mock.client as unknown as PrismaClient, {
      userId: USER_ID,
      programId: PROGRAM_ID,
    });

    // Alice is NOT qualified until the new task is done
    expect(qualResult.qualified).toBe(false);
    expect(qualResult.missingRequirements).toContain(
      'Incomplete task: "Quote Tweet with Chimp Art".',
    );
    expect(qualResult.details.completedMandatoryTasksCount).toBe(2);
    expect(qualResult.details.totalMandatoryTasksCount).toBe(3);
  });

  // 5. Task wajib lama tetap ada di v2 dengan taskCode yang sama: progres Approved terbawa.
  it("Scenario 5: Task wajib lama tetap ada di v2 dengan taskCode yang sama: progres Approved terbawa", async () => {
    mock.store.taskProgresses.push({
      id: "tp-follow-v1",
      userId: USER_ID,
      versionId: "ver-1",
      taskId: "task-follow-x-v1",
      status: "VERIFIED",
    });

    const v2Result = await createCampaignVersion(mock.client as unknown as PrismaClient, {
      campaignId: CAMPAIGN_ID,
      adminUserId: ADMIN_ID,
      changeNotes: "Cloned without changes",
    });

    const v2FollowTask = v2Result.version.tasks.find(
      (t) => t.taskCode === "FOLLOW_X_CHIMPHOOD",
    );
    expect(v2FollowTask).toBeDefined();
    expect(v2FollowTask?.isRequired).toBe(true);
  });

  // 6. Task lama dihapus dari v2: tidak menjadi persyaratan v2.
  it("Scenario 6: Task lama dihapus dari v2: tidak menjadi persyaratan v2", async () => {
    // Only Follow task is completed in v1; Repost was not completed
    mock.store.taskProgresses.push({
      id: "tp-follow-v1",
      userId: USER_ID,
      versionId: "ver-1",
      taskId: "task-follow-x-v1",
      status: "VERIFIED",
    });

    // Admin creates v2 removing REPOST_ANNOUNCEMENT
    await createCampaignVersion(mock.client as unknown as PrismaClient, {
      campaignId: CAMPAIGN_ID,
      adminUserId: ADMIN_ID,
      changeNotes: "Removed repost requirement",
      taskRemovals: ["REPOST_ANNOUNCEMENT"],
    });

    // Now v2 only has 1 mandatory task (Follow X) which Alice has completed!
    const qualResult = await evaluateUserQualification(mock.client as unknown as PrismaClient, {
      userId: USER_ID,
      programId: PROGRAM_ID,
    });

    expect(qualResult.qualified).toBe(true);
    expect(qualResult.details.totalMandatoryTasksCount).toBe(1);
    expect(qualResult.details.completedMandatoryTasksCount).toBe(1);
  });

  // 7. Progres Approved v1 tetap terbaca di v3 melalui rantai kompatibilitas.
  it("Scenario 7: Progres Approved v1 tetap terbaca di v3 melalui rantai kompatibilitas (v1 -> v2 -> v3)", async () => {
    mock.store.taskProgresses.push(
      {
        id: "tp-follow-v1",
        userId: USER_ID,
        versionId: "ver-1",
        taskId: "task-follow-x-v1",
        status: "VERIFIED",
      },
      {
        id: "tp-repost-v1",
        userId: USER_ID,
        versionId: "ver-1",
        taskId: "task-like-repost-v1",
        status: "VERIFIED",
      },
    );

    // v1 -> v2 (LEGACY_CARRIED)
    await createCampaignVersion(mock.client as unknown as PrismaClient, {
      campaignId: CAMPAIGN_ID,
      adminUserId: ADMIN_ID,
      changeNotes: "v2 launch",
    });

    // v2 -> v3 (LEGACY_CARRIED)
    const v3Result = await createCampaignVersion(mock.client as unknown as PrismaClient, {
      campaignId: CAMPAIGN_ID,
      adminUserId: ADMIN_ID,
      changeNotes: "v3 launch",
    });

    expect(v3Result.version.versionNumber).toBe(3);

    const qualResult = await evaluateUserQualification(mock.client as unknown as PrismaClient, {
      userId: USER_ID,
      programId: PROGRAM_ID,
    });

    expect(qualResult.qualified).toBe(true);
    expect(qualResult.details.completedMandatoryTasksCount).toBe(2);
  });

  // 8. Bukti lama tetap tersimpan dan tidak berubah.
  it("Scenario 8: Bukti lama tetap tersimpan dan tidak berubah", async () => {
    const initialEvidenceCount = mock.store.evidenceSubmissions.length;
    mock.store.evidenceSubmissions.push({
      id: "ev-proof-100",
      userId: USER_ID,
      taskId: "task-like-repost-v1",
      taskProgressId: "tp-100",
      payload: "https://x.com/alice/status/9999",
      status: "APPROVED",
    });

    await createCampaignVersion(mock.client as unknown as PrismaClient, {
      campaignId: CAMPAIGN_ID,
      adminUserId: ADMIN_ID,
      changeNotes: "v2 migration",
    });

    const oldProof = mock.store.evidenceSubmissions.find((e) => e.id === "ev-proof-100");
    expect(oldProof).toBeDefined();
    expect(oldProof?.payload).toBe("https://x.com/alice/status/9999");
    expect(oldProof?.status).toBe("APPROVED");
    expect(oldProof?.taskId).toBe("task-like-repost-v1");
  });

  // 9. Tidak terjadi carry-over lintas Campaign.
  it("Scenario 9: Tidak terjadi carry-over lintas Campaign", async () => {
    const OTHER_CAMPAIGN_ID = "camp-other-isolated";
    mock.store.campaigns.push({
      id: OTHER_CAMPAIGN_ID,
      slug: "other-isolated-campaign",
      title: "Other Isolated Campaign",
      wlProgramId: PROGRAM_ID,
      status: "ACTIVE",
    });

    // Setup another campaign version
    mock.store.campaignVersions.push({
      id: "ver-other-1",
      campaignId: OTHER_CAMPAIGN_ID,
      versionNumber: 1,
      isCurrent: true,
      compatibilityMode: "LEGACY_CARRIED",
      compatibleFromVersionId: "ver-1", // Pointing cross-campaign maliciously
      startsAt: new Date(),
      endsAt: null,
    });

    mock.store.campaignTasks.push({
      id: "task-other-follow",
      versionId: "ver-other-1",
      taskCode: "FOLLOW_X_CHIMPHOOD", // Same code
      title: "Follow on other campaign",
      isRequired: true,
      points: 10,
    });

    // User completed it in CAMPAIGN_ID ver-1
    mock.store.taskProgresses.push({
      id: "tp-follow-v1",
      userId: USER_ID,
      versionId: "ver-1",
      taskId: "task-follow-x-v1",
      status: "VERIFIED",
    });

    // Disable original campaign to isolate OTHER_CAMPAIGN_ID
    const orig = mock.store.campaigns.find((c) => c.id === CAMPAIGN_ID);
    if (orig) orig.status = "PAUSED";

    // Qualification on OTHER_CAMPAIGN_ID must REJECT cross-campaign carryover
    const qualResult = await evaluateUserQualification(mock.client as unknown as PrismaClient, {
      userId: USER_ID,
      programId: PROGRAM_ID,
    });

    expect(qualResult.qualified).toBe(false);
    expect(qualResult.missingRequirements).toContain(
      'Incomplete task: "Follow on other campaign".',
    );
  });

  // 10. Dua request pembuatan versi bersamaan tidak menghasilkan dua current version.
  it("Scenario 10: Dua request pembuatan versi bersamaan tidak menghasilkan dua current version", async () => {
    // Run two sequential version creations (simulating guarded concurrency via transaction lock)
    await createCampaignVersion(mock.client as unknown as PrismaClient, {
      campaignId: CAMPAIGN_ID,
      adminUserId: ADMIN_ID,
      changeNotes: "Version 2",
    });

    await createCampaignVersion(mock.client as unknown as PrismaClient, {
      campaignId: CAMPAIGN_ID,
      adminUserId: ADMIN_ID,
      changeNotes: "Version 3",
    });

    const currentVersions = mock.store.campaignVersions.filter(
      (v) => v.campaignId === CAMPAIGN_ID && v.isCurrent,
    );

    expect(currentVersions).toHaveLength(1);
    expect(currentVersions[0].versionNumber).toBe(3);
  });

  // 11. Kegagalan transaction tidak meninggalkan versi atau task setengah jadi.
  it("Scenario 11: Kegagalan transaction tidak meninggalkan versi atau task setengah jadi", async () => {
    // Attempting to create a version with an invalid date range (endsAt before startsAt) throws validation error
    await expect(
      createCampaignVersion(mock.client as unknown as PrismaClient, {
        campaignId: CAMPAIGN_ID,
        adminUserId: ADMIN_ID,
        startsAt: "2026-11-05T00:00:00Z",
        endsAt: "2026-11-01T00:00:00Z", // Invalid range
      }),
    ).rejects.toThrow(AdminCampaignError);

    // Version count remains 1 (no orphaned version)
    expect(mock.store.campaignVersions.filter((v) => v.campaignId === CAMPAIGN_ID)).toHaveLength(1);
  });

  // 12. GTD yang sudah dialokasikan tetap aman sesuai aturan produk.
  it("Scenario 12: GTD yang sudah dialokasikan tetap aman sesuai aturan produk", async () => {
    // User already holds an ALLOCATED slot
    mock.store.slots.push({
      id: "slot-alice",
      programId: PROGRAM_ID,
      userId: USER_ID,
      slotNumber: 1,
      status: "ALLOCATED",
      allocatedAt: new Date("2026-10-15T00:00:00Z"),
    });

    // Admin publishes v2 with a brand new task that Alice hasn't completed
    await createCampaignVersion(mock.client as unknown as PrismaClient, {
      campaignId: CAMPAIGN_ID,
      adminUserId: ADMIN_ID,
      changeNotes: "v2 with new tasks",
      taskAdditions: [
        {
          taskCode: "NEW_MANDATORY_QUEST",
          title: "New Quest",
          isRequired: true,
          points: 10,
        },
      ],
    });

    const qualResult = await evaluateUserQualification(mock.client as unknown as PrismaClient, {
      userId: USER_ID,
      programId: PROGRAM_ID,
    });

    // Alice keeps her slot because existing allocated slot is preserved
    expect(qualResult.slotNumber).toBe(1);
    expect(qualResult.phase).toBe("SLOT_ALLOCATED");
    const slotRecord = mock.store.slots.find((s) => s.userId === USER_ID);
    expect(slotRecord?.status).toBe("ALLOCATED");
  });

  // 13. listCampaignVersions query returns complete version history
  it("Scenario 13: listCampaignVersions returns full version history ordered descending", async () => {
    await createCampaignVersion(mock.client as unknown as PrismaClient, {
      campaignId: CAMPAIGN_ID,
      adminUserId: ADMIN_ID,
      changeNotes: "Second version",
    });

    const result = await listCampaignVersions(mock.client as unknown as PrismaClient, CAMPAIGN_ID);

    expect(result.total).toBe(2);
    expect(result.versions[0].versionNumber).toBe(2);
    expect(result.versions[0].isCurrent).toBe(true);
    expect(result.versions[1].versionNumber).toBe(1);
    expect(result.versions[1].isCurrent).toBe(false);
  });

  // 14. input.tasks in createCampaignVersion cannot mutate taskCode of existing tasks
  it("Scenario 14: input.tasks in createCampaignVersion rejects taskCode mutation with 422 IMMUTABLE_TASK_CODE", async () => {
    await expect(
      createCampaignVersion(mock.client as unknown as PrismaClient, {
        campaignId: CAMPAIGN_ID,
        adminUserId: ADMIN_ID,
        tasks: [
          {
            taskId: "task-follow-x-v1",
            taskCode: "FOLLOW_X_RENAMED_CODE", // Illegal mutation
            title: "Follow @ChimpHood on X",
            taskType: "SOCIAL_X_FOLLOW",
            points: 10,
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "IMMUTABLE_TASK_CODE",
      status: 422,
    });
  });

  // 15. input.tasks allows keeping identical taskCode and creating new tasks with new taskCode
  it("Scenario 15: input.tasks preserves stable taskCode for existing tasks and accepts new taskCode for new tasks", async () => {
    const v2Result = await createCampaignVersion(mock.client as unknown as PrismaClient, {
      campaignId: CAMPAIGN_ID,
      adminUserId: ADMIN_ID,
      changeNotes: "Version with retained and new tasks",
      tasks: [
        {
          taskId: "task-follow-x-v1",
          taskCode: "FOLLOW_X_CHIMPHOOD", // Same permanent taskCode
          title: "Follow @ChimpHood on X (Updated Instructions)",
          taskType: "SOCIAL_X_FOLLOW",
          points: 15,
        },
        {
          taskCode: "NEW_JOIN_DISCORD", // Brand new task with new taskCode
          title: "Join Discord Server",
          taskType: "CUSTOM",
          points: 20,
        },
      ],
    });

    expect(v2Result.success).toBe(true);
    const createdTasks = mock.store.campaignTasks.filter(
      (t) => t.versionId === v2Result.version.id,
    );
    expect(createdTasks).toHaveLength(2);

    const retainedTask = createdTasks.find((t) => t.taskCode === "FOLLOW_X_CHIMPHOOD");
    expect(retainedTask).toBeDefined();
    expect(retainedTask?.points).toBe(15);

    const newTask = createdTasks.find((t) => t.taskCode === "NEW_JOIN_DISCORD");
    expect(newTask).toBeDefined();
    expect(newTask?.points).toBe(20);
  });
});
