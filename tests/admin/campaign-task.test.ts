import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createCampaignTask,
  updateCampaignTask,
  deleteCampaignTask,
  listCampaignTasks,
  getCampaignTask,
  AdminCampaignTaskError,
  VALID_TASK_TYPES,
} from "@/server/admin/campaign-task";
import type { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

function createMockPrisma() {
  const store = {
    campaigns: [] as any[],
    campaignVersions: [] as any[],
    campaignTasks: [] as any[],
    auditLogs: [] as any[],
  };

  const hooks = {
    onAuditCreate: null as ((data: any) => Promise<void> | void) | null,
  };

  const createTxClient = () => {
    const uncommittedTasks: any[] = [];
    const uncommittedAuditLogs: any[] = [];
    const taskSnapshots: Array<{
      id: string;
      data: any;
    }> = [];
    const deletedTasks: any[] = [];

    const rollback = () => {
      // rollback inserted tasks
      for (const t of uncommittedTasks) {
        const idx = store.campaignTasks.indexOf(t);
        if (idx !== -1) store.campaignTasks.splice(idx, 1);
      }
      // rollback inserted audit logs
      for (const a of uncommittedAuditLogs) {
        const idx = store.auditLogs.indexOf(a);
        if (idx !== -1) store.auditLogs.splice(idx, 1);
      }
      // rollback updated tasks
      for (const snap of taskSnapshots) {
        const t = store.campaignTasks.find((x) => x.id === snap.id);
        if (t) {
          Object.assign(t, snap.data);
        }
      }
      // rollback deleted tasks
      for (const d of deletedTasks) {
        store.campaignTasks.push(d);
      }
    };

    const tx: any = {
      promoCampaign: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.campaigns.find((c) => c.id === where.id) ?? null;
        }),
      },
      campaignVersion: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.campaignId_versionNumber) {
            return (
              store.campaignVersions.find(
                (v) =>
                  v.campaignId === where.campaignId_versionNumber.campaignId &&
                  v.versionNumber === where.campaignId_versionNumber.versionNumber,
              ) ?? null
            );
          }
          if (where.id) {
            return store.campaignVersions.find((v) => v.id === where.id) ?? null;
          }
          return null;
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.campaignVersions.find(
              (v) =>
                (!where.id || v.id === where.id) &&
                (!where.campaignId || v.campaignId === where.campaignId),
            ) ?? null
          );
        }),
      },
      campaignTask: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.versionId_taskCode) {
            return (
              store.campaignTasks.find(
                (t) =>
                  t.versionId === where.versionId_taskCode.versionId &&
                  t.taskCode === where.versionId_taskCode.taskCode,
              ) ?? null
            );
          }
          if (where.id) {
            return store.campaignTasks.find((t) => t.id === where.id) ?? null;
          }
          return null;
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.campaignTasks.find(
              (t) =>
                (!where.id || t.id === where.id) &&
                (!where.versionId || t.versionId === where.versionId) &&
                (!where.taskCode || t.taskCode === where.taskCode),
            ) ?? null
          );
        }),
        create: vi.fn(async ({ data }: any) => {
          const now = new Date();
          const task = {
            id: `task_${Math.random().toString(36).slice(2)}`,
            versionId: data.versionId,
            taskCode: data.taskCode,
            title: data.title,
            description: data.description ?? null,
            taskType: data.taskType ?? "CUSTOM",
            requirementMetadata: data.requirementMetadata ?? null,
            points: data.points ?? 10,
            isRequired: data.isRequired ?? true,
            sortOrder: data.sortOrder ?? 0,
            createdAt: now,
            updatedAt: now,
          };
          store.campaignTasks.push(task);
          uncommittedTasks.push(task);
          return task;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const t = store.campaignTasks.find((x) => x.id === where.id);
          if (!t) throw new Error("Task not found");
          taskSnapshots.push({ id: t.id, data: { ...t } });
          Object.assign(t, data);
          t.updatedAt = new Date();
          return t;
        }),
        delete: vi.fn(async ({ where }: any) => {
          const idx = store.campaignTasks.findIndex((x) => x.id === where.id);
          if (idx === -1) throw new Error("Task not found");
          const [removed] = store.campaignTasks.splice(idx, 1);
          deletedTasks.push(removed);
          return removed;
        }),
      },
      auditLog: {
        create: vi.fn(async ({ data, select }: any) => {
          const id = `audit_${Math.random().toString(36).slice(2)}`;
          const record = { id, ...data };
          store.auditLogs.push(record);
          uncommittedAuditLogs.push(record);
          if (hooks.onAuditCreate) await hooks.onAuditCreate(record);
          return select?.id ? { id } : record;
        }),
      },
    };

    return { tx, rollback };
  };

  const mockPrisma: any = {
    __store: store,
    __hooks: hooks,

    $transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => {
      const { tx, rollback } = createTxClient();
      try {
        return await fn(tx);
      } catch (err) {
        rollback();
        throw err;
      }
    }),

    promoCampaign: {
      findUnique: vi.fn(async ({ where }: any) => {
        return store.campaigns.find((c) => c.id === where.id) ?? null;
      }),
    },
    campaignVersion: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.campaignId_versionNumber) {
          return (
            store.campaignVersions.find(
              (v) =>
                v.campaignId === where.campaignId_versionNumber.campaignId &&
                v.versionNumber === where.campaignId_versionNumber.versionNumber,
            ) ?? null
          );
        }
        if (where.id) {
          return store.campaignVersions.find((v) => v.id === where.id) ?? null;
        }
        return null;
      }),
      findFirst: vi.fn(async ({ where }: any) => {
        return (
          store.campaignVersions.find(
            (v) =>
              (!where.id || v.id === where.id) &&
              (!where.campaignId || v.campaignId === where.campaignId),
          ) ?? null
        );
      }),
    },
    campaignTask: {
      findFirst: vi.fn(async ({ where }: any) => {
        return (
          store.campaignTasks.find(
            (t) =>
              (!where.id || t.id === where.id) &&
              (!where.versionId || t.versionId === where.versionId),
          ) ?? null
        );
      }),
      findMany: vi.fn(async ({ where, orderBy }: any) => {
        let results = store.campaignTasks.filter((t) => t.versionId === where.versionId);
        results.sort((a, b) => a.sortOrder - b.sortOrder);
        return results;
      }),
    },
  };

  return mockPrisma;
}

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function seedCampaignAndVersion(
  prisma: any,
  campaignOverrides: Record<string, any> = {},
  versionOverrides: Record<string, any> = {},
) {
  const campaign = {
    id: "camp_1",
    slug: "hood-pass-campaign",
    title: "Hood Pass Campaign",
    status: "DRAFT",
    wlProgramId: "prog_1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...campaignOverrides,
  };
  prisma.__store.campaigns.push(campaign);

  const version = {
    id: "ver_1",
    campaignId: campaign.id,
    versionNumber: 1,
    isCurrent: true,
    compatibilityMode: "FRESH_START",
    startsAt: new Date(),
    endsAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...versionOverrides,
  };
  prisma.__store.campaignVersions.push(version);

  return { campaign, version };
}

// ---------------------------------------------------------------------------
// Tests: createCampaignTask
// ---------------------------------------------------------------------------

describe("createCampaignTask", () => {
  let prisma: any;

  beforeEach(() => {
    prisma = createMockPrisma();
    seedCampaignAndVersion(prisma);
  });

  it("creates a campaign task with default values", async () => {
    const result = await createCampaignTask(prisma, {
      campaignId: "camp_1",
      versionIdentifier: "1",
      adminUserId: "admin_user_1",
      taskCode: "FOLLOW_X_CHIMP",
      title: "Follow @ChimpHood on X",
    });

    expect(result.success).toBe(true);
    expect(result.task.taskCode).toBe("FOLLOW_X_CHIMP");
    expect(result.task.title).toBe("Follow @ChimpHood on X");
    expect(result.task.points).toBe(10);
    expect(result.task.sortOrder).toBe(0);
    expect(result.task.isRequired).toBe(true);
    expect(result.task.taskType).toBe("CUSTOM");
    expect(result.task.requirementMetadata).toBeNull();
    expect(result.auditLogId).toBeTruthy();
  });

  it("creates a task with explicit metadata, type, points, and sortOrder", async () => {
    const result = await createCampaignTask(prisma, {
      campaignId: "camp_1",
      versionIdentifier: "ver_1", // via versionId string
      adminUserId: "admin_user_1",
      taskCode: "REPOST_ANNOUNCEMENT",
      title: "Repost Announcement Tweet",
      description: "Must repost the pinned launch tweet",
      taskType: "SOCIAL_X_REPOST",
      points: 25,
      isRequired: false,
      sortOrder: 2,
      requirementMetadata: { tweetId: "1234567890" },
    });

    expect(result.success).toBe(true);
    expect(result.task.taskType).toBe("SOCIAL_X_REPOST");
    expect(result.task.points).toBe(25);
    expect(result.task.isRequired).toBe(false);
    expect(result.task.sortOrder).toBe(2);
    expect(result.task.description).toBe("Must repost the pinned launch tweet");
    expect(result.task.requirementMetadata).toEqual({ tweetId: "1234567890" });
  });

  it("records an audit log with CAMPAIGN_TASK_CREATED action and newValues", async () => {
    let capturedAudit: any = null;
    prisma.__hooks.onAuditCreate = (record: any) => {
      capturedAudit = record;
    };

    const result = await createCampaignTask(prisma, {
      campaignId: "camp_1",
      versionIdentifier: "1",
      adminUserId: "admin_user_1",
      taskCode: "CONNECT_WALLET",
      title: "Connect EVM Wallet",
    });

    expect(capturedAudit).not.toBeNull();
    expect(capturedAudit.action).toBe("CAMPAIGN_TASK_CREATED");
    expect(capturedAudit.entityType).toBe("CampaignTask");
    expect(capturedAudit.entityId).toBe(result.task.id);
    expect(capturedAudit.actorId).toBe("admin_user_1");
    expect(capturedAudit.newValues.taskCode).toBe("CONNECT_WALLET");
  });

  it("throws 404 when campaign is not found", async () => {
    await expect(
      createCampaignTask(prisma, {
        campaignId: "unknown_camp",
        versionIdentifier: "1",
        adminUserId: "admin_1",
        taskCode: "TEST",
        title: "Test",
      }),
    ).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND", status: 404 });
  });

  it("throws 404 when version is not found", async () => {
    await expect(
      createCampaignTask(prisma, {
        campaignId: "camp_1",
        versionIdentifier: "99",
        adminUserId: "admin_1",
        taskCode: "TEST",
        title: "Test",
      }),
    ).rejects.toMatchObject({ code: "VERSION_NOT_FOUND", status: 404 });
  });

  it("throws 422 when campaign is ARCHIVED", async () => {
    prisma.__store.campaigns[0].status = "ARCHIVED";

    await expect(
      createCampaignTask(prisma, {
        campaignId: "camp_1",
        versionIdentifier: "1",
        adminUserId: "admin_1",
        taskCode: "TEST",
        title: "Test",
      }),
    ).rejects.toMatchObject({ code: "CAMPAIGN_ARCHIVED", status: 422 });
  });

  it("throws 409 when taskCode is already used in the same version", async () => {
    await createCampaignTask(prisma, {
      campaignId: "camp_1",
      versionIdentifier: "1",
      adminUserId: "admin_1",
      taskCode: "UNIQUE_CODE",
      title: "Task 1",
    });

    await expect(
      createCampaignTask(prisma, {
        campaignId: "camp_1",
        versionIdentifier: "1",
        adminUserId: "admin_1",
        taskCode: "UNIQUE_CODE",
        title: "Task 2",
      }),
    ).rejects.toMatchObject({ code: "TASK_CODE_CONFLICT", status: 409 });
  });

  it("throws 422 for invalid taskCode format", async () => {
    await expect(
      createCampaignTask(prisma, {
        campaignId: "camp_1",
        versionIdentifier: "1",
        adminUserId: "admin_1",
        taskCode: "INVALID CODE WITH SPACES!",
        title: "Test",
      }),
    ).rejects.toMatchObject({ code: "INVALID_TASK_CODE", status: 422 });
  });

  it("throws 422 when title is empty", async () => {
    await expect(
      createCampaignTask(prisma, {
        campaignId: "camp_1",
        versionIdentifier: "1",
        adminUserId: "admin_1",
        taskCode: "VALID_CODE",
        title: "   ",
      }),
    ).rejects.toMatchObject({ code: "MISSING_TITLE", status: 422 });
  });

  it("throws 422 for invalid taskType", async () => {
    await expect(
      createCampaignTask(prisma, {
        campaignId: "camp_1",
        versionIdentifier: "1",
        adminUserId: "admin_1",
        taskCode: "VALID_CODE",
        title: "Test",
        taskType: "NOT_AN_ENUM",
      }),
    ).rejects.toMatchObject({ code: "INVALID_TASK_TYPE", status: 422 });
  });

  it("throws 422 for negative points", async () => {
    await expect(
      createCampaignTask(prisma, {
        campaignId: "camp_1",
        versionIdentifier: "1",
        adminUserId: "admin_1",
        taskCode: "VALID_CODE",
        title: "Test",
        points: -5,
      }),
    ).rejects.toMatchObject({ code: "INVALID_POINTS", status: 422 });
  });

  it("throws 422 when requirementMetadata is an array instead of object", async () => {
    await expect(
      createCampaignTask(prisma, {
        campaignId: "camp_1",
        versionIdentifier: "1",
        adminUserId: "admin_1",
        taskCode: "VALID_CODE",
        title: "Test",
        requirementMetadata: ["invalid"] as any,
      }),
    ).rejects.toMatchObject({ code: "INVALID_METADATA", status: 422 });
  });

  it("rolls back creation if audit log write fails", async () => {
    const failingPrisma = createMockPrisma();
    seedCampaignAndVersion(failingPrisma);

    const origTx = failingPrisma.$transaction;
    failingPrisma.$transaction = vi.fn(async (fn: any) => {
      return origTx.call(failingPrisma, async (tx: any) => {
        tx.auditLog.create = vi.fn().mockRejectedValue(new Error("Audit DB down"));
        return fn(tx);
      });
    });

    await expect(
      createCampaignTask(failingPrisma, {
        campaignId: "camp_1",
        versionIdentifier: "1",
        adminUserId: "admin_1",
        taskCode: "FAIL_CODE",
        title: "Fail Task",
      }),
    ).rejects.toThrow("Audit DB down");

    expect(failingPrisma.__store.campaignTasks.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: updateCampaignTask
// ---------------------------------------------------------------------------

describe("updateCampaignTask", () => {
  let prisma: any;
  let taskId: string;

  beforeEach(async () => {
    prisma = createMockPrisma();
    seedCampaignAndVersion(prisma);
    const created = await createCampaignTask(prisma, {
      campaignId: "camp_1",
      versionIdentifier: "1",
      adminUserId: "admin_1",
      taskCode: "INITIAL_CODE",
      title: "Initial Title",
      points: 10,
    });
    taskId = created.task.id;
  });

  it("updates title, points, and sortOrder", async () => {
    const result = await updateCampaignTask(prisma, {
      campaignId: "camp_1",
      versionIdentifier: "1",
      taskId,
      adminUserId: "admin_1",
      title: "Updated Task Title",
      points: 50,
      sortOrder: 5,
    });

    expect(result.success).toBe(true);
    expect(result.task.title).toBe("Updated Task Title");
    expect(result.task.points).toBe(50);
    expect(result.task.sortOrder).toBe(5);
  });

  it("records CAMPAIGN_TASK_UPDATED with old and new values in audit log", async () => {
    let capturedAudit: any = null;
    prisma.__hooks.onAuditCreate = (record: any) => {
      capturedAudit = record;
    };

    await updateCampaignTask(prisma, {
      campaignId: "camp_1",
      versionIdentifier: "1",
      taskId,
      adminUserId: "admin_1",
      title: "Brand New Title",
    });

    expect(capturedAudit).not.toBeNull();
    expect(capturedAudit.action).toBe("CAMPAIGN_TASK_UPDATED");
    expect(capturedAudit.oldValues.title).toBe("Initial Title");
    expect(capturedAudit.newValues.title).toBe("Brand New Title");
  });

  it("updates taskCode when no collision exists", async () => {
    const result = await updateCampaignTask(prisma, {
      campaignId: "camp_1",
      versionIdentifier: "1",
      taskId,
      adminUserId: "admin_1",
      taskCode: "NEW_CODE_HERE",
    });

    expect(result.task.taskCode).toBe("NEW_CODE_HERE");
  });

  it("throws 409 when updated taskCode collides with another task in the same version", async () => {
    // create second task
    await createCampaignTask(prisma, {
      campaignId: "camp_1",
      versionIdentifier: "1",
      adminUserId: "admin_1",
      taskCode: "SECOND_CODE",
      title: "Second Task",
    });

    await expect(
      updateCampaignTask(prisma, {
        campaignId: "camp_1",
        versionIdentifier: "1",
        taskId,
        adminUserId: "admin_1",
        taskCode: "SECOND_CODE",
      }),
    ).rejects.toMatchObject({ code: "TASK_CODE_CONFLICT", status: 409 });
  });

  it("throws 404 when taskId is not found", async () => {
    await expect(
      updateCampaignTask(prisma, {
        campaignId: "camp_1",
        versionIdentifier: "1",
        taskId: "non_existent_task",
        adminUserId: "admin_1",
        title: "Test",
      }),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND", status: 404 });
  });

  it("throws 422 when no fields to update are provided", async () => {
    await expect(
      updateCampaignTask(prisma, {
        campaignId: "camp_1",
        versionIdentifier: "1",
        taskId,
        adminUserId: "admin_1",
      }),
    ).rejects.toMatchObject({ code: "NO_FIELDS_TO_UPDATE", status: 422 });
  });

  it("throws 422 when campaign is ARCHIVED", async () => {
    prisma.__store.campaigns[0].status = "ARCHIVED";

    await expect(
      updateCampaignTask(prisma, {
        campaignId: "camp_1",
        versionIdentifier: "1",
        taskId,
        adminUserId: "admin_1",
        title: "New Title",
      }),
    ).rejects.toMatchObject({ code: "CAMPAIGN_ARCHIVED", status: 422 });
  });
});

// ---------------------------------------------------------------------------
// Tests: deleteCampaignTask
// ---------------------------------------------------------------------------

describe("deleteCampaignTask", () => {
  let prisma: any;
  let taskId: string;

  beforeEach(async () => {
    prisma = createMockPrisma();
    seedCampaignAndVersion(prisma);
    const created = await createCampaignTask(prisma, {
      campaignId: "camp_1",
      versionIdentifier: "1",
      adminUserId: "admin_1",
      taskCode: "TASK_TO_DELETE",
      title: "Task to delete",
    });
    taskId = created.task.id;
  });

  it("deletes the task and records an audit log", async () => {
    let capturedAudit: any = null;
    prisma.__hooks.onAuditCreate = (record: any) => {
      capturedAudit = record;
    };

    const result = await deleteCampaignTask(prisma, {
      campaignId: "camp_1",
      versionIdentifier: "1",
      taskId,
      adminUserId: "admin_1",
    });

    expect(result.success).toBe(true);
    expect(result.deletedTaskId).toBe(taskId);
    expect(prisma.__store.campaignTasks.length).toBe(0);

    expect(capturedAudit).not.toBeNull();
    expect(capturedAudit.action).toBe("CAMPAIGN_TASK_DELETED");
    expect(capturedAudit.oldValues.taskCode).toBe("TASK_TO_DELETE");
  });

  it("throws 404 when taskId is not found", async () => {
    await expect(
      deleteCampaignTask(prisma, {
        campaignId: "camp_1",
        versionIdentifier: "1",
        taskId: "non_existent_id",
        adminUserId: "admin_1",
      }),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND", status: 404 });
  });

  it("throws 422 when campaign is ARCHIVED", async () => {
    prisma.__store.campaigns[0].status = "ARCHIVED";

    await expect(
      deleteCampaignTask(prisma, {
        campaignId: "camp_1",
        versionIdentifier: "1",
        taskId,
        adminUserId: "admin_1",
      }),
    ).rejects.toMatchObject({ code: "CAMPAIGN_ARCHIVED", status: 422 });
  });
});

// ---------------------------------------------------------------------------
// Tests: listCampaignTasks & getCampaignTask
// ---------------------------------------------------------------------------

describe("listCampaignTasks and getCampaignTask", () => {
  let prisma: any;
  let task1Id: string;
  let task2Id: string;

  beforeEach(async () => {
    prisma = createMockPrisma();
    seedCampaignAndVersion(prisma);

    const t1 = await createCampaignTask(prisma, {
      campaignId: "camp_1",
      versionIdentifier: "1",
      adminUserId: "admin_1",
      taskCode: "TASK_B",
      title: "Task B",
      sortOrder: 10,
    });
    task1Id = t1.task.id;

    const t2 = await createCampaignTask(prisma, {
      campaignId: "camp_1",
      versionIdentifier: "1",
      adminUserId: "admin_1",
      taskCode: "TASK_A",
      title: "Task A",
      sortOrder: 1,
    });
    task2Id = t2.task.id;
  });

  it("lists all tasks ordered by sortOrder ascending", async () => {
    const result = await listCampaignTasks(prisma, {
      campaignId: "camp_1",
      versionIdentifier: "1",
    });

    expect(result.total).toBe(2);
    expect(result.tasks[0].taskCode).toBe("TASK_A"); // sortOrder 1
    expect(result.tasks[1].taskCode).toBe("TASK_B"); // sortOrder 10
  });

  it("gets a specific task by id", async () => {
    const task = await getCampaignTask(prisma, {
      campaignId: "camp_1",
      versionIdentifier: "1",
      taskId: task1Id,
    });

    expect(task.id).toBe(task1Id);
    expect(task.taskCode).toBe("TASK_B");
  });

  it("throws 404 when getCampaignTask cannot find the task", async () => {
    await expect(
      getCampaignTask(prisma, {
        campaignId: "camp_1",
        versionIdentifier: "1",
        taskId: "missing_id",
      }),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND", status: 404 });
  });

  it("allows listing tasks when the campaign is ARCHIVED", async () => {
    prisma.__store.campaigns[0].status = "ARCHIVED";

    const result = await listCampaignTasks(prisma, {
      campaignId: "camp_1",
      versionIdentifier: "1",
    });

    expect(result.total).toBe(2);
    expect(result.tasks[0].taskCode).toBe("TASK_A");
    expect(result.tasks[1].taskCode).toBe("TASK_B");
  });

  it("allows retrieving a specific task when the campaign is ARCHIVED", async () => {
    prisma.__store.campaigns[0].status = "ARCHIVED";

    const task = await getCampaignTask(prisma, {
      campaignId: "camp_1",
      versionIdentifier: "1",
      taskId: task1Id,
    });

    expect(task.id).toBe(task1Id);
    expect(task.taskCode).toBe("TASK_B");
  });
});

// ---------------------------------------------------------------------------
// Tests: Constants and Error
// ---------------------------------------------------------------------------

describe("VALID_TASK_TYPES", () => {
  it("includes all 5 schema task types", () => {
    expect(VALID_TASK_TYPES).toEqual(
      expect.arrayContaining([
        "SOCIAL_X_FOLLOW",
        "SOCIAL_X_REPOST",
        "INVENTORY_HOLD",
        "MANUAL_EVIDENCE",
        "CUSTOM",
      ]),
    );
    expect(VALID_TASK_TYPES).toHaveLength(5);
  });
});

describe("AdminCampaignTaskError", () => {
  it("constructs error with correct properties", () => {
    const err = new AdminCampaignTaskError("CUSTOM_ERR", "custom msg", 422);
    expect(err.name).toBe("AdminCampaignTaskError");
    expect(err.code).toBe("CUSTOM_ERR");
    expect(err.status).toBe(422);
    expect(err.message).toBe("custom msg");
  });
});
