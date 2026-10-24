import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createCampaign,
  updateCampaign,
  getCampaign,
  listCampaigns,
  AdminCampaignError,
  VALID_CAMPAIGN_STATUSES,
  VALID_COMPATIBILITY_MODES,
} from "@/server/admin/campaign";
import type { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

function createMockPrisma() {
  const store = {
    campaigns: [] as any[],
    campaignVersions: [] as any[],
    wlPrograms: [] as any[],
    auditLogs: [] as any[],
  };

  const hooks = {
    onAuditCreate: null as ((data: any) => Promise<void> | void) | null,
  };

  // Build a mock transaction client that can rollback on error
  const createTxClient = () => {
    const uncommittedCampaigns: any[] = [];
    const uncommittedVersions: any[] = [];
    const uncommittedAuditLogs: any[] = [];
    const campaignSnapshots: Array<{
      id: string;
      title: string;
      description: string | null;
      status: string;
    }> = [];

    const rollback = () => {
      for (const c of uncommittedCampaigns) {
        const idx = store.campaigns.indexOf(c);
        if (idx !== -1) store.campaigns.splice(idx, 1);
      }
      for (const v of uncommittedVersions) {
        const idx = store.campaignVersions.indexOf(v);
        if (idx !== -1) store.campaignVersions.splice(idx, 1);
      }
      for (const a of uncommittedAuditLogs) {
        const idx = store.auditLogs.indexOf(a);
        if (idx !== -1) store.auditLogs.splice(idx, 1);
      }
      for (const snap of campaignSnapshots) {
        const c = store.campaigns.find((x) => x.id === snap.id);
        if (c) {
          c.title = snap.title;
          c.description = snap.description;
          c.status = snap.status;
        }
      }
    };

    const tx: any = {
      wLProgram: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.wlPrograms.find((p) => p.id === where.id) ?? null;
        }),
      },
      promoCampaign: {
        findUnique: vi.fn(async ({ where, include }: any) => {
          const c = store.campaigns.find(
            (x) =>
              (where.id && x.id === where.id) || (where.slug && x.slug === where.slug),
          );
          if (!c) return null;
          if (include?.versions) {
            const whereClause = include.versions?.where;
            const versions = store.campaignVersions.filter(
              (v) =>
                v.campaignId === c.id &&
                (whereClause?.isCurrent === undefined ||
                  v.isCurrent === whereClause.isCurrent),
            );
            return { ...c, versions };
          }
          return c;
        }),
        findMany: vi.fn(async ({ where, include }: any) => {
          let results = [...store.campaigns];
          if (where?.wlProgramId) {
            results = results.filter((c) => c.wlProgramId === where.wlProgramId);
          }
          if (where?.status) {
            results = results.filter((c) => c.status === where.status);
          }
          if (include?.versions) {
            const whereClause = include.versions?.where;
            results = results.map((c) => {
              const versions = store.campaignVersions.filter(
                (v) =>
                  v.campaignId === c.id &&
                  (whereClause?.isCurrent === undefined ||
                    v.isCurrent === whereClause.isCurrent),
              );
              return { ...c, versions };
            });
          }
          return results.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );
        }),
        create: vi.fn(async ({ data, include }: any) => {
          const now = new Date();
          const id = `campaign_${Math.random().toString(36).slice(2)}`;
          const campaign = {
            id,
            slug: data.slug,
            title: data.title,
            description: data.description ?? null,
            wlProgramId: data.wlProgramId,
            status: data.status ?? "DRAFT",
            createdAt: now,
            updatedAt: now,
          };
          store.campaigns.push(campaign);
          uncommittedCampaigns.push(campaign);

          // Handle nested version create
          const versionData = data.versions?.create;
          if (versionData) {
            const version = {
              id: `version_${Math.random().toString(36).slice(2)}`,
              campaignId: id,
              versionNumber: versionData.versionNumber ?? 1,
              isCurrent: versionData.isCurrent ?? true,
              compatibilityMode: versionData.compatibilityMode ?? "FRESH_START",
              startsAt: new Date(versionData.startsAt),
              endsAt: versionData.endsAt ? new Date(versionData.endsAt) : null,
              changeNotes: versionData.changeNotes ?? null,
              createdAt: now,
              updatedAt: now,
            };
            store.campaignVersions.push(version);
            uncommittedVersions.push(version);
          }

          if (include?.versions) {
            const whereClause = include.versions?.where;
            const versions = store.campaignVersions.filter(
              (v) =>
                v.campaignId === id &&
                (whereClause?.isCurrent === undefined ||
                  v.isCurrent === whereClause.isCurrent),
            );
            return { ...campaign, versions };
          }
          return campaign;
        }),
        update: vi.fn(async ({ where, data, include }: any) => {
          const c = store.campaigns.find((x) => x.id === where.id);
          if (!c) throw new Error("Campaign not found");
          campaignSnapshots.push({
            id: c.id,
            title: c.title,
            description: c.description,
            status: c.status,
          });
          if (data.title !== undefined) c.title = data.title;
          if (data.description !== undefined) c.description = data.description;
          if (data.status !== undefined) c.status = data.status;
          c.updatedAt = new Date();

          if (include?.versions) {
            const whereClause = include.versions?.where;
            const versions = store.campaignVersions.filter(
              (v) =>
                v.campaignId === c.id &&
                (whereClause?.isCurrent === undefined ||
                  v.isCurrent === whereClause.isCurrent),
            );
            return { ...c, versions };
          }
          return c;
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

    // Outer $transaction simulates commit/rollback behavior
    $transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => {
      const { tx, rollback } = createTxClient();
      try {
        const result = await fn(tx);
        return result;
      } catch (err) {
        rollback();
        throw err;
      }
    }),

    // Top-level read methods (used by getCampaign / listCampaigns which don't use tx)
    promoCampaign: {
      findUnique: vi.fn(async ({ where, include }: any) => {
        const c = store.campaigns.find(
          (x) => (where.id && x.id === where.id) || (where.slug && x.slug === where.slug),
        );
        if (!c) return null;
        if (include?.versions) {
          const whereClause = include.versions?.where;
          const versions = store.campaignVersions.filter(
            (v) =>
              v.campaignId === c.id &&
              (whereClause?.isCurrent === undefined ||
                v.isCurrent === whereClause.isCurrent),
          );
          return { ...c, versions };
        }
        return c;
      }),
      findMany: vi.fn(async ({ where, orderBy, include }: any) => {
        let results = [...store.campaigns];
        if (where?.wlProgramId) {
          results = results.filter((c) => c.wlProgramId === where.wlProgramId);
        }
        if (where?.status) {
          results = results.filter((c) => c.status === where.status);
        }
        if (include?.versions) {
          const whereClause = include.versions?.where;
          results = results.map((c) => {
            const versions = store.campaignVersions.filter(
              (v) =>
                v.campaignId === c.id &&
                (whereClause?.isCurrent === undefined ||
                  v.isCurrent === whereClause.isCurrent),
            );
            return { ...c, versions };
          });
        }
        if (orderBy?.createdAt === "desc") {
          results.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );
        }
        return results;
      }),
    },
  };

  return mockPrisma;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function seedProgram(prisma: any, id = "prog_1") {
  prisma.__store.wlPrograms.push({ id });
}

function makeCampaignInput(overrides?: Record<string, unknown>) {
  return {
    slug: "test-campaign",
    title: "Test Campaign",
    wlProgramId: "prog_1",
    adminUserId: "admin_1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: createCampaign
// ---------------------------------------------------------------------------

describe("createCampaign", () => {
  let prisma: any;

  beforeEach(() => {
    prisma = createMockPrisma();
    seedProgram(prisma);
  });

  it("creates a campaign in DRAFT status with required fields", async () => {
    const result = await createCampaign(prisma, makeCampaignInput());

    expect(result.success).toBe(true);
    expect(result.campaign.slug).toBe("test-campaign");
    expect(result.campaign.title).toBe("Test Campaign");
    expect(result.campaign.status).toBe("DRAFT");
    expect(result.campaign.wlProgramId).toBe("prog_1");
    expect(result.campaign.currentVersion).toBeNull();
    expect(result.auditLogId).toBeTruthy();
  });

  it("creates a campaign with an initial version when initialVersion is provided", async () => {
    const result = await createCampaign(
      prisma,
      makeCampaignInput({
        initialVersion: {
          startsAt: "2027-01-01T00:00:00Z",
          endsAt: "2027-06-01T00:00:00Z",
          changeNotes: "Launch version",
          compatibilityMode: "FRESH_START",
        },
      }),
    );

    expect(result.campaign.currentVersion).not.toBeNull();
    expect(result.campaign.currentVersion!.versionNumber).toBe(1);
    expect(result.campaign.currentVersion!.isCurrent).toBe(true);
    expect(result.campaign.currentVersion!.compatibilityMode).toBe("FRESH_START");
    expect(result.campaign.currentVersion!.changeNotes).toBe("Launch version");
    expect(result.campaign.currentVersion!.startsAt).toBe("2027-01-01T00:00:00.000Z");
    expect(result.campaign.currentVersion!.endsAt).toBe("2027-06-01T00:00:00.000Z");
  });

  it("records an audit log on successful creation", async () => {
    let capturedAudit: any = null;
    prisma.__hooks.onAuditCreate = (audit: any) => {
      capturedAudit = audit;
    };

    const result = await createCampaign(prisma, makeCampaignInput());

    expect(capturedAudit).not.toBeNull();
    expect(capturedAudit.action).toBe("CAMPAIGN_CREATED");
    expect(capturedAudit.entityType).toBe("PromoCampaign");
    expect(capturedAudit.entityId).toBe(result.campaign.id);
    expect(capturedAudit.actorId).toBe("admin_1");
  });

  it("throws 404 when wlProgramId does not exist", async () => {
    await expect(
      createCampaign(prisma, makeCampaignInput({ wlProgramId: "no_such_program" })),
    ).rejects.toMatchObject({
      code: "WL_PROGRAM_NOT_FOUND",
      status: 404,
    });
  });

  it("throws 409 when slug is already taken", async () => {
    await createCampaign(prisma, makeCampaignInput());

    await expect(
      createCampaign(prisma, makeCampaignInput({ slug: "test-campaign" })),
    ).rejects.toMatchObject({
      code: "SLUG_CONFLICT",
      status: 409,
    });
  });

  it("throws 422 for invalid slug format (uppercase)", async () => {
    await expect(
      createCampaign(prisma, makeCampaignInput({ slug: "Invalid-Slug" })),
    ).rejects.toMatchObject({ code: "INVALID_SLUG", status: 422 });
  });

  it("throws 422 for invalid slug format (spaces)", async () => {
    await expect(
      createCampaign(prisma, makeCampaignInput({ slug: "my campaign" })),
    ).rejects.toMatchObject({ code: "INVALID_SLUG", status: 422 });
  });

  it("throws 422 when slug is empty", async () => {
    await expect(
      createCampaign(prisma, makeCampaignInput({ slug: "" })),
    ).rejects.toMatchObject({ code: "MISSING_SLUG", status: 422 });
  });

  it("throws 422 when title is missing", async () => {
    await expect(
      createCampaign(prisma, makeCampaignInput({ title: "" })),
    ).rejects.toMatchObject({ code: "MISSING_TITLE", status: 422 });
  });

  it("throws 422 when wlProgramId is missing", async () => {
    await expect(
      createCampaign(prisma, makeCampaignInput({ wlProgramId: "" })),
    ).rejects.toMatchObject({ code: "MISSING_WL_PROGRAM_ID", status: 422 });
  });

  it("throws 422 for invalid compatibilityMode in initialVersion", async () => {
    await expect(
      createCampaign(
        prisma,
        makeCampaignInput({
          initialVersion: {
            startsAt: "2027-01-01T00:00:00Z",
            compatibilityMode: "INVALID_MODE",
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_COMPATIBILITY_MODE", status: 422 });
  });

  it("throws 422 when initialVersion is given without startsAt", async () => {
    await expect(
      createCampaign(
        prisma,
        makeCampaignInput({
          initialVersion: { changeNotes: "oops" } as any,
        }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_STARTS_AT", status: 422 });
  });

  it("rolls back audit log if campaign creation fails partway", async () => {
    const failingPrisma = createMockPrisma();
    seedProgram(failingPrisma);

    // Make auditLog.create throw inside the transaction
    const originalTx = failingPrisma.$transaction;
    failingPrisma.$transaction = vi.fn(async (fn: any) => {
      const { tx, rollback } = (originalTx as any).__mockContext?.() ?? {};
      const { tx: realTx } = createMockPrisma().__store ? { tx: {} } : { tx: {} };

      // Patch auditLog on the inner tx to throw
      const patchedFn = async (innerTx: any) => {
        innerTx.auditLog = {
          create: vi.fn().mockRejectedValue(new Error("DB down")),
        };
        return fn(innerTx);
      };
      try {
        return await originalTx.call(failingPrisma, patchedFn);
      } catch (err) {
        throw err;
      }
    });

    await expect(createCampaign(failingPrisma, makeCampaignInput())).rejects.toThrow(
      "DB down",
    );

    // Campaign should NOT have been committed
    expect(failingPrisma.__store.campaigns.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: updateCampaign
// ---------------------------------------------------------------------------

describe("updateCampaign", () => {
  let prisma: any;
  let campaignId: string;

  beforeEach(async () => {
    prisma = createMockPrisma();
    seedProgram(prisma);
    const result = await createCampaign(prisma, makeCampaignInput());
    campaignId = result.campaign.id;
  });

  it("updates the title of an existing campaign", async () => {
    const result = await updateCampaign(prisma, {
      campaignId,
      adminUserId: "admin_1",
      title: "Updated Title",
    });

    expect(result.success).toBe(true);
    expect(result.campaign.title).toBe("Updated Title");
    expect(result.auditLogId).toBeTruthy();
  });

  it("updates the description to null (clearing it)", async () => {
    const result = await updateCampaign(prisma, {
      campaignId,
      adminUserId: "admin_1",
      description: null,
    });

    expect(result.campaign.description).toBeNull();
  });

  it("transitions status from DRAFT to ACTIVE", async () => {
    const result = await updateCampaign(prisma, {
      campaignId,
      adminUserId: "admin_1",
      status: "ACTIVE",
    });

    expect(result.campaign.status).toBe("ACTIVE");
  });

  it("transitions status from ACTIVE to PAUSED", async () => {
    await updateCampaign(prisma, {
      campaignId,
      adminUserId: "admin_1",
      status: "ACTIVE",
    });
    const result = await updateCampaign(prisma, {
      campaignId,
      adminUserId: "admin_1",
      status: "PAUSED",
    });

    expect(result.campaign.status).toBe("PAUSED");
  });

  it("transitions status from PAUSED back to ACTIVE (resume)", async () => {
    await updateCampaign(prisma, {
      campaignId,
      adminUserId: "admin_1",
      status: "ACTIVE",
    });
    await updateCampaign(prisma, {
      campaignId,
      adminUserId: "admin_1",
      status: "PAUSED",
    });
    const result = await updateCampaign(prisma, {
      campaignId,
      adminUserId: "admin_1",
      status: "ACTIVE",
    });

    expect(result.campaign.status).toBe("ACTIVE");
  });

  it("records old and new values in the audit log", async () => {
    let capturedAudit: any = null;
    prisma.__hooks.onAuditCreate = (audit: any) => {
      if (audit.action === "CAMPAIGN_UPDATED") capturedAudit = audit;
    };

    await updateCampaign(prisma, {
      campaignId,
      adminUserId: "admin_1",
      title: "New Title",
      status: "ACTIVE",
    });

    expect(capturedAudit).not.toBeNull();
    expect(capturedAudit.oldValues.title).toBe("Test Campaign");
    expect(capturedAudit.oldValues.status).toBe("DRAFT");
    expect(capturedAudit.newValues.title).toBe("New Title");
    expect(capturedAudit.newValues.status).toBe("ACTIVE");
  });

  it("throws 404 when campaignId does not exist", async () => {
    await expect(
      updateCampaign(prisma, {
        campaignId: "no_such_campaign",
        adminUserId: "admin_1",
        title: "Something",
      }),
    ).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND", status: 404 });
  });

  it("throws 422 for invalid status transition (ENDED is not a valid status)", async () => {
    await expect(
      updateCampaign(prisma, {
        campaignId,
        adminUserId: "admin_1",
        status: "ENDED",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATUS", status: 422 });
  });

  it("throws 422 for invalid status transition (ARCHIVED → ACTIVE)", async () => {
    await updateCampaign(prisma, {
      campaignId,
      adminUserId: "admin_1",
      status: "ARCHIVED",
    });

    await expect(
      updateCampaign(prisma, {
        campaignId,
        adminUserId: "admin_1",
        status: "ACTIVE",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATUS_TRANSITION", status: 422 });
  });

  it("throws 422 for invalid status transition (DRAFT → PAUSED)", async () => {
    await expect(
      updateCampaign(prisma, {
        campaignId,
        adminUserId: "admin_1",
        status: "PAUSED",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATUS_TRANSITION", status: 422 });
  });

  it("throws 422 when no fields to update are provided", async () => {
    await expect(
      updateCampaign(prisma, { campaignId, adminUserId: "admin_1" }),
    ).rejects.toMatchObject({ code: "NO_FIELDS_TO_UPDATE", status: 422 });
  });

  it("throws 422 when title is explicitly empty string", async () => {
    await expect(
      updateCampaign(prisma, { campaignId, adminUserId: "admin_1", title: "" }),
    ).rejects.toMatchObject({ code: "MISSING_TITLE", status: 422 });
  });
});

// ---------------------------------------------------------------------------
// Tests: getCampaign
// ---------------------------------------------------------------------------

describe("getCampaign", () => {
  let prisma: any;
  let campaignId: string;

  beforeEach(async () => {
    prisma = createMockPrisma();
    seedProgram(prisma);
    const result = await createCampaign(prisma, makeCampaignInput());
    campaignId = result.campaign.id;
  });

  it("returns the campaign with correct shape", async () => {
    const campaign = await getCampaign(prisma, campaignId);

    expect(campaign.id).toBe(campaignId);
    expect(campaign.slug).toBe("test-campaign");
    expect(campaign.status).toBe("DRAFT");
    expect(campaign.currentVersion).toBeNull();
  });

  it("throws 404 for unknown campaign", async () => {
    await expect(getCampaign(prisma, "no_such_campaign")).rejects.toMatchObject({
      code: "CAMPAIGN_NOT_FOUND",
      status: 404,
    });
  });

  it("throws 422 when id is empty", async () => {
    await expect(getCampaign(prisma, "")).rejects.toMatchObject({
      code: "MISSING_CAMPAIGN_ID",
      status: 422,
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: listCampaigns
// ---------------------------------------------------------------------------

describe("listCampaigns", () => {
  let prisma: any;

  beforeEach(async () => {
    prisma = createMockPrisma();
    seedProgram(prisma);
    seedProgram(prisma, "prog_2");

    await createCampaign(
      prisma,
      makeCampaignInput({ slug: "campaign-a", wlProgramId: "prog_1" }),
    );
    await createCampaign(
      prisma,
      makeCampaignInput({ slug: "campaign-b", wlProgramId: "prog_1" }),
    );
    await createCampaign(
      prisma,
      makeCampaignInput({ slug: "campaign-c", wlProgramId: "prog_2" }),
    );
  });

  it("returns all campaigns when no filter is provided", async () => {
    const result = await listCampaigns(prisma);

    expect(result.total).toBe(3);
    expect(result.campaigns).toHaveLength(3);
  });

  it("filters by wlProgramId", async () => {
    const result = await listCampaigns(prisma, { wlProgramId: "prog_1" });

    expect(result.total).toBe(2);
    expect(result.campaigns.every((c) => c.wlProgramId === "prog_1")).toBe(true);
  });

  it("filters by status", async () => {
    // All campaigns start as DRAFT
    const result = await listCampaigns(prisma, { status: "DRAFT" });

    expect(result.total).toBe(3);

    // Filter for ACTIVE — should return 0
    const activeResult = await listCampaigns(prisma, { status: "ACTIVE" });
    expect(activeResult.total).toBe(0);
  });

  it("returns empty array when filter matches nothing", async () => {
    const result = await listCampaigns(prisma, { wlProgramId: "prog_999" });

    expect(result.total).toBe(0);
    expect(result.campaigns).toHaveLength(0);
  });

  it("throws 422 for invalid status filter", async () => {
    await expect(listCampaigns(prisma, { status: "INVALID" })).rejects.toMatchObject({
      code: "INVALID_STATUS_FILTER",
      status: 422,
    });
  });

  it("each campaign output has the correct shape", async () => {
    const result = await listCampaigns(prisma);

    for (const c of result.campaigns) {
      expect(c).toMatchObject({
        id: expect.any(String),
        slug: expect.any(String),
        title: expect.any(String),
        wlProgramId: expect.any(String),
        status: expect.stringMatching(/DRAFT|ACTIVE|PAUSED|ARCHIVED/),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: exported constants
// ---------------------------------------------------------------------------

describe("VALID_CAMPAIGN_STATUSES", () => {
  it("includes all four campaign statuses from the schema", () => {
    expect(VALID_CAMPAIGN_STATUSES).toEqual(
      expect.arrayContaining(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]),
    );
    expect(VALID_CAMPAIGN_STATUSES).toHaveLength(4);
  });
});

describe("VALID_COMPATIBILITY_MODES", () => {
  it("includes all three compatibility modes from the schema", () => {
    expect(VALID_COMPATIBILITY_MODES).toEqual(
      expect.arrayContaining(["FRESH_START", "EXPLICIT_MAPPED", "LEGACY_CARRIED"]),
    );
    expect(VALID_COMPATIBILITY_MODES).toHaveLength(3);
  });
});

describe("AdminCampaignError", () => {
  it("has the correct name, code, status, and message", () => {
    const err = new AdminCampaignError("TEST_CODE", "test message", 422);
    expect(err.name).toBe("AdminCampaignError");
    expect(err.code).toBe("TEST_CODE");
    expect(err.status).toBe(422);
    expect(err.message).toBe("test message");
    expect(err instanceof Error).toBe(true);
  });

  it("defaults status to 400 when not provided", () => {
    const err = new AdminCampaignError("X", "y");
    expect(err.status).toBe(400);
  });
});
