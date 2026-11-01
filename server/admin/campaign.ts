import type {
  PrismaClient,
  CampaignStatus,
  CampaignCompatibilityMode,
  TaskType,
} from "@prisma/client";
import { recordAuditLog } from "../audit/audit";
import {
  validateTaskCode,
  validateTitle,
  validateTaskType,
  validatePoints,
  validateSortOrder,
  formatCampaignTaskOutput,
  type CampaignTaskOutput,
} from "./campaign-task";

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class AdminCampaignError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = "AdminCampaignError";
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Valid enum values
// ---------------------------------------------------------------------------

export const VALID_CAMPAIGN_STATUSES: CampaignStatus[] = [
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "ARCHIVED",
];

export const VALID_COMPATIBILITY_MODES: CampaignCompatibilityMode[] = [
  "FRESH_START",
  "EXPLICIT_MAPPED",
  "LEGACY_CARRIED",
];

/**
 * Valid campaign status transitions.
 * ARCHIVED is a terminal state — no transitions out of it.
 */
const VALID_STATUS_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ["ACTIVE", "ARCHIVED"],
  ACTIVE: ["PAUSED", "ARCHIVED"],
  PAUSED: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: [],
};

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface CreateCampaignInput {
  slug: string;
  title: string;
  description?: string | null;
  wlProgramId: string;
  adminUserId: string;
  /** Initial version configuration. If omitted, no version is created. */
  initialVersion?: {
    startsAt: string | Date;
    endsAt?: string | Date | null;
    changeNotes?: string | null;
    compatibilityMode?: CampaignCompatibilityMode | string;
  };
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface UpdateCampaignInput {
  campaignId: string;
  adminUserId: string;
  /** Partial fields — only provided fields are updated. */
  title?: string;
  description?: string | null;
  status?: CampaignStatus | string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface CampaignVersionOutput {
  id: string;
  versionNumber: number;
  isCurrent: boolean;
  compatibilityMode: CampaignCompatibilityMode;
  startsAt: string;
  endsAt: string | null;
  changeNotes: string | null;
  createdAt: string;
}

export interface CampaignOutput {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  wlProgramId: string;
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
  currentVersion: CampaignVersionOutput | null;
}

export interface CreateCampaignResult {
  success: true;
  campaign: CampaignOutput;
  auditLogId: string;
}

export interface UpdateCampaignResult {
  success: true;
  campaign: CampaignOutput;
  auditLogId: string;
}

export interface ListCampaignsResult {
  campaigns: CampaignOutput[];
  total: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCampaignOutput(campaign: {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  wlProgramId: string;
  status: CampaignStatus;
  createdAt: Date;
  updatedAt: Date;
  versions: Array<{
    id: string;
    versionNumber: number;
    isCurrent: boolean;
    compatibilityMode: CampaignCompatibilityMode;
    startsAt: Date;
    endsAt: Date | null;
    changeNotes: string | null;
    createdAt: Date;
  }>;
}): CampaignOutput {
  const current = campaign.versions.find((v) => v.isCurrent) ?? null;
  return {
    id: campaign.id,
    slug: campaign.slug,
    title: campaign.title,
    description: campaign.description,
    wlProgramId: campaign.wlProgramId,
    status: campaign.status,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
    currentVersion: current
      ? {
          id: current.id,
          versionNumber: current.versionNumber,
          isCurrent: true,
          compatibilityMode: current.compatibilityMode,
          startsAt: current.startsAt.toISOString(),
          endsAt: current.endsAt?.toISOString() ?? null,
          changeNotes: current.changeNotes,
          createdAt: current.createdAt.toISOString(),
        }
      : null,
  };
}

function validateSlug(slug: string): void {
  if (!slug || typeof slug !== "string" || !slug.trim()) {
    throw new AdminCampaignError("MISSING_SLUG", "Campaign slug is required.", 422);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new AdminCampaignError(
      "INVALID_SLUG",
      "Campaign slug must be lowercase alphanumeric with hyphens (e.g. 'my-campaign').",
      422,
    );
  }
  if (slug.length > 100) {
    throw new AdminCampaignError(
      "SLUG_TOO_LONG",
      "Campaign slug must not exceed 100 characters.",
      422,
    );
  }
}

// ---------------------------------------------------------------------------
// createCampaign
// ---------------------------------------------------------------------------

/**
 * Creates a new PromoCampaign in DRAFT status.
 * Optionally creates the first CampaignVersion atomically.
 * Validates slug uniqueness and wlProgramId existence.
 */
export async function createCampaign(
  prisma: PrismaClient,
  input: CreateCampaignInput,
): Promise<CreateCampaignResult> {
  // --- Validate slug format ---
  validateSlug(input.slug);

  if (!input.title || typeof input.title !== "string" || !input.title.trim()) {
    throw new AdminCampaignError("MISSING_TITLE", "Campaign title is required.", 422);
  }
  if (input.title.length > 255) {
    throw new AdminCampaignError(
      "TITLE_TOO_LONG",
      "Campaign title must not exceed 255 characters.",
      422,
    );
  }

  if (
    !input.wlProgramId ||
    typeof input.wlProgramId !== "string" ||
    !input.wlProgramId.trim()
  ) {
    throw new AdminCampaignError(
      "MISSING_WL_PROGRAM_ID",
      "wlProgramId is required.",
      422,
    );
  }

  if (!input.adminUserId || typeof input.adminUserId !== "string") {
    throw new AdminCampaignError("MISSING_ACTOR", "adminUserId is required.", 422);
  }

  // Validate optional initialVersion fields
  if (input.initialVersion) {
    const { compatibilityMode } = input.initialVersion;
    if (
      compatibilityMode &&
      !VALID_COMPATIBILITY_MODES.includes(compatibilityMode as CampaignCompatibilityMode)
    ) {
      throw new AdminCampaignError(
        "INVALID_COMPATIBILITY_MODE",
        `compatibilityMode must be one of: ${VALID_COMPATIBILITY_MODES.join(", ")}.`,
        422,
      );
    }
    if (!input.initialVersion.startsAt) {
      throw new AdminCampaignError(
        "MISSING_STARTS_AT",
        "initialVersion.startsAt is required when providing an initial version.",
        422,
      );
    }
  }

  return await prisma.$transaction(async (tx) => {
    // Acquire row-level lock on WLProgram to serialize concurrent campaign creation for the program
    if (typeof (tx as any).$queryRaw === "function") {
      try {
        await (tx as any).$queryRaw`
          SELECT id FROM "WLProgram" WHERE id = ${input.wlProgramId} FOR UPDATE
        `;
      } catch {
        // Fallback for mocks / SQLite
      }
    }

    // 1. Verify WLProgram exists
    const program = await tx.wLProgram.findUnique({
      where: { id: input.wlProgramId },
      select: { id: true, name: true },
    });
    if (!program) {
      throw new AdminCampaignError(
        "WL_PROGRAM_NOT_FOUND",
        `WL Program '${input.wlProgramId}' was not found.`,
        404,
      );
    }

    // 2. Guard: Only one main PromoCampaign is allowed per Whitelist Program
    const existingForProgram =
      typeof tx.promoCampaign.findFirst === "function"
        ? await tx.promoCampaign.findFirst({
            where: { wlProgramId: input.wlProgramId },
            select: { id: true, title: true, slug: true },
          })
        : (await tx.promoCampaign.findMany({
            where: { wlProgramId: input.wlProgramId },
            take: 1,
            select: { id: true, title: true, slug: true },
          }))[0] ?? null;
    if (existingForProgram) {
      throw new AdminCampaignError(
        "CAMPAIGN_ALREADY_EXISTS",
        `A campaign already exists for Whitelist Program '${input.wlProgramId}' (campaign: "${existingForProgram.title}"). Only one main campaign is allowed per program.`,
        409,
      );
    }

    // 3. Check slug uniqueness
    const existing = await tx.promoCampaign.findUnique({
      where: { slug: input.slug },
      select: { id: true },
    });
    if (existing) {
      throw new AdminCampaignError(
        "SLUG_CONFLICT",
        `A campaign with slug '${input.slug}' already exists.`,
        409,
      );
    }

    // 3. Create campaign
    const campaign = await tx.promoCampaign.create({
      data: {
        slug: input.slug,
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        wlProgramId: input.wlProgramId,
        status: "DRAFT",
        ...(input.initialVersion
          ? {
              versions: {
                create: {
                  versionNumber: 1,
                  isCurrent: true,
                  compatibilityMode:
                    (input.initialVersion
                      .compatibilityMode as CampaignCompatibilityMode) ?? "FRESH_START",
                  startsAt: new Date(input.initialVersion.startsAt),
                  endsAt: input.initialVersion.endsAt
                    ? new Date(input.initialVersion.endsAt)
                    : null,
                  changeNotes: input.initialVersion.changeNotes ?? null,
                },
              },
            }
          : {}),
      },
      include: {
        versions: {
          where: { isCurrent: true },
        },
      },
    });

    // 4. Audit log
    const audit = await recordAuditLog(tx, {
      actorId: input.adminUserId,
      actorIp: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      action: "CAMPAIGN_CREATED",
      entityType: "PromoCampaign",
      entityId: campaign.id,
      newValues: {
        slug: campaign.slug,
        title: campaign.title,
        wlProgramId: campaign.wlProgramId,
        status: campaign.status,
      },
    });

    return {
      success: true as const,
      campaign: formatCampaignOutput(campaign),
      auditLogId: audit.id,
    };
  });
}

// ---------------------------------------------------------------------------
// updateCampaign
// ---------------------------------------------------------------------------

/**
 * Updates title, description, and/or status of a PromoCampaign.
 * Status transitions are validated against the whitelist.
 * ARCHIVED is terminal — no transition out of ARCHIVED is allowed.
 */
export async function updateCampaign(
  prisma: PrismaClient,
  input: UpdateCampaignInput,
): Promise<UpdateCampaignResult> {
  if (!input.campaignId || typeof input.campaignId !== "string") {
    throw new AdminCampaignError("MISSING_CAMPAIGN_ID", "campaignId is required.", 422);
  }
  if (!input.adminUserId || typeof input.adminUserId !== "string") {
    throw new AdminCampaignError("MISSING_ACTOR", "adminUserId is required.", 422);
  }

  // Validate title if provided
  if (input.title !== undefined) {
    if (typeof input.title !== "string" || !input.title.trim()) {
      throw new AdminCampaignError(
        "MISSING_TITLE",
        "title must be a non-empty string.",
        422,
      );
    }
    if (input.title.length > 255) {
      throw new AdminCampaignError(
        "TITLE_TOO_LONG",
        "title must not exceed 255 characters.",
        422,
      );
    }
  }

  // Validate status if provided
  if (input.status !== undefined) {
    if (!VALID_CAMPAIGN_STATUSES.includes(input.status as CampaignStatus)) {
      throw new AdminCampaignError(
        "INVALID_STATUS",
        `status must be one of: ${VALID_CAMPAIGN_STATUSES.join(", ")}.`,
        422,
      );
    }
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Fetch campaign
    const campaign = await tx.promoCampaign.findUnique({
      where: { id: input.campaignId },
      include: { versions: { where: { isCurrent: true } } },
    });

    if (!campaign) {
      throw new AdminCampaignError(
        "CAMPAIGN_NOT_FOUND",
        `Campaign '${input.campaignId}' was not found.`,
        404,
      );
    }

    // 2. Validate status transition
    if (input.status && input.status !== campaign.status) {
      const allowed = VALID_STATUS_TRANSITIONS[campaign.status];
      if (!allowed.includes(input.status as CampaignStatus)) {
        throw new AdminCampaignError(
          "INVALID_STATUS_TRANSITION",
          `Cannot transition campaign from ${campaign.status} to ${input.status}. ` +
            `Allowed transitions: ${allowed.length > 0 ? allowed.join(", ") : "none (terminal state)."}.`,
          422,
        );
      }
    }

    // 3. Capture old values for audit
    const oldValues = {
      title: campaign.title,
      description: campaign.description,
      status: campaign.status,
    };

    // 4. Build update data — only include fields that were explicitly provided
    const updateData: {
      title?: string;
      description?: string | null;
      status?: CampaignStatus;
    } = {};

    if (input.title !== undefined) updateData.title = input.title.trim();
    if (input.description !== undefined)
      updateData.description = input.description?.trim() ?? null;
    if (input.status !== undefined) updateData.status = input.status as CampaignStatus;

    if (Object.keys(updateData).length === 0) {
      throw new AdminCampaignError(
        "NO_FIELDS_TO_UPDATE",
        "At least one field (title, description, status) must be provided.",
        422,
      );
    }

    // 5. Apply update
    const updated = await tx.promoCampaign.update({
      where: { id: input.campaignId },
      data: updateData,
      include: { versions: { where: { isCurrent: true } } },
    });

    // 6. Audit log
    const newValues = {
      title: updated.title,
      description: updated.description,
      status: updated.status,
    };

    const audit = await recordAuditLog(tx, {
      actorId: input.adminUserId,
      actorIp: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      action: "CAMPAIGN_UPDATED",
      entityType: "PromoCampaign",
      entityId: updated.id,
      oldValues,
      newValues,
    });

    return {
      success: true as const,
      campaign: formatCampaignOutput(updated),
      auditLogId: audit.id,
    };
  });
}

// ---------------------------------------------------------------------------
// getCampaign
// ---------------------------------------------------------------------------

/**
 * Retrieves a single campaign by ID, including its current version.
 */
export async function getCampaign(
  prisma: PrismaClient,
  campaignId: string,
): Promise<CampaignOutput> {
  if (!campaignId || typeof campaignId !== "string") {
    throw new AdminCampaignError("MISSING_CAMPAIGN_ID", "campaignId is required.", 422);
  }

  const campaign = await prisma.promoCampaign.findUnique({
    where: { id: campaignId },
    include: { versions: { where: { isCurrent: true } } },
  });

  if (!campaign) {
    throw new AdminCampaignError(
      "CAMPAIGN_NOT_FOUND",
      `Campaign '${campaignId}' was not found.`,
      404,
    );
  }

  return formatCampaignOutput(campaign);
}

// ---------------------------------------------------------------------------
// listCampaigns
// ---------------------------------------------------------------------------

export interface ListCampaignsFilter {
  wlProgramId?: string;
  status?: CampaignStatus | string;
}

/**
 * Lists campaigns with optional filtering by wlProgramId or status.
 * Ordered by createdAt DESC.
 */
export async function listCampaigns(
  prisma: PrismaClient,
  filter?: ListCampaignsFilter,
): Promise<ListCampaignsResult> {
  // Validate optional status filter
  if (
    filter?.status &&
    !VALID_CAMPAIGN_STATUSES.includes(filter.status as CampaignStatus)
  ) {
    throw new AdminCampaignError(
      "INVALID_STATUS_FILTER",
      `status filter must be one of: ${VALID_CAMPAIGN_STATUSES.join(", ")}.`,
      422,
    );
  }

  const where = {
    ...(filter?.wlProgramId ? { wlProgramId: filter.wlProgramId } : {}),
    ...(filter?.status ? { status: filter.status as CampaignStatus } : {}),
  };

  const campaigns = await prisma.promoCampaign.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { versions: { where: { isCurrent: true } } },
  });

  return {
    campaigns: campaigns.map(formatCampaignOutput),
    total: campaigns.length,
  };
}

// ---------------------------------------------------------------------------
// createCampaignVersion & listCampaignVersions
// ---------------------------------------------------------------------------

export interface CampaignVersionDetailOutput extends CampaignVersionOutput {
  campaignId: string;
  compatibleFromVersionId: string | null;
  taskCount: number;
  tasks: CampaignTaskOutput[];
}

export interface CreateCampaignVersionResult {
  success: true;
  version: CampaignVersionDetailOutput;
  auditLogId: string;
}

export interface ListCampaignVersionsResult {
  versions: CampaignVersionDetailOutput[];
  total: number;
}

export interface TaskOverrideInput {
  taskId?: string;
  taskCode: string;
  title?: string;
  description?: string | null;
  taskType?: TaskType | string;
  points?: number;
  isRequired?: boolean;
  sortOrder?: number;
  requirementMetadata?: Record<string, unknown> | null;
}

export interface CreateCampaignVersionInput {
  campaignId: string;
  adminUserId: string;
  changeNotes?: string | null;
  startsAt?: string | Date;
  endsAt?: string | Date | null;
  compatibilityMode?: CampaignCompatibilityMode | string;
  taskUpdates?: TaskOverrideInput[];
  taskAdditions?: TaskOverrideInput[];
  taskRemovals?: string[];
  tasks?: TaskOverrideInput[];
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Creates and publishes a new CampaignVersion.
 * Atomically deactivates the current version, creates the new incremented version,
 * clones and updates tasks, and records a CAMPAIGN_VERSION_CREATED audit log.
 * Concurrency is guarded via row-level locking on PostgreSQL.
 */
export async function createCampaignVersion(
  prisma: PrismaClient,
  input: CreateCampaignVersionInput,
): Promise<CreateCampaignVersionResult> {
  if (!input.campaignId || typeof input.campaignId !== "string" || !input.campaignId.trim()) {
    throw new AdminCampaignError("MISSING_CAMPAIGN_ID", "campaignId is required.", 422);
  }
  if (!input.adminUserId || typeof input.adminUserId !== "string" || !input.adminUserId.trim()) {
    throw new AdminCampaignError("MISSING_ACTOR", "adminUserId is required.", 422);
  }

  const campaignId = input.campaignId.trim();
  const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
  if (isNaN(startsAt.getTime())) {
    throw new AdminCampaignError("INVALID_STARTS_AT", "startsAt must be a valid date.", 422);
  }

  let endsAt: Date | null = null;
  if (input.endsAt !== undefined && input.endsAt !== null) {
    endsAt = new Date(input.endsAt);
    if (isNaN(endsAt.getTime())) {
      throw new AdminCampaignError("INVALID_ENDS_AT", "endsAt must be a valid date.", 422);
    }
    if (endsAt <= startsAt) {
      throw new AdminCampaignError("INVALID_DATE_RANGE", "endsAt must be after startsAt.", 422);
    }
  }

  const compatibilityMode: CampaignCompatibilityMode =
    (input.compatibilityMode as CampaignCompatibilityMode) ?? "LEGACY_CARRIED";
  if (!VALID_COMPATIBILITY_MODES.includes(compatibilityMode)) {
    throw new AdminCampaignError(
      "INVALID_COMPATIBILITY_MODE",
      `compatibilityMode must be one of: ${VALID_COMPATIBILITY_MODES.join(", ")}.`,
      422,
    );
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Acquire row lock on PromoCampaign to prevent concurrent version creation races
    if (typeof (tx as any).$queryRaw === "function") {
      try {
        await (tx as any).$queryRaw`
          SELECT id FROM "PromoCampaign" WHERE id = ${campaignId} FOR UPDATE
        `;
      } catch {
        // Fallback for mocks/SQLite
      }
    }

    // 2. Verify campaign exists and is not ARCHIVED
    const campaign = await tx.promoCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, status: true, title: true },
    });

    if (!campaign) {
      throw new AdminCampaignError("CAMPAIGN_NOT_FOUND", `Campaign '${campaignId}' was not found.`, 404);
    }

    if (campaign.status === "ARCHIVED") {
      throw new AdminCampaignError("CAMPAIGN_ARCHIVED", "Cannot create a new version for an archived campaign.", 422);
    }

    // 3. Find active current version to branch from
    const currentVersion = await tx.campaignVersion.findFirst({
      where: { campaignId: campaign.id, isCurrent: true },
      include: {
        tasks: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    if (!currentVersion) {
      throw new AdminCampaignError(
        "NO_CURRENT_VERSION",
        "Campaign does not have an active current version to branch from.",
        404,
      );
    }

    // 4. Calculate next version number securely
    const allVersions = await tx.campaignVersion.findMany({
      where: { campaignId: campaign.id },
      select: { versionNumber: true },
    });
    const maxVer = allVersions.reduce((max, v) => (v.versionNumber > max ? v.versionNumber : max), 0);
    const nextVersionNumber = maxVer + 1;

    // 5. Build task list for new version
    const existingTasksList =
      Array.isArray(currentVersion.tasks)
        ? currentVersion.tasks
        : await tx.campaignTask.findMany({
            where: { versionId: currentVersion.id },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          });

    const existingTasksById = new Map<string, (typeof existingTasksList)[0]>();
    const existingTasksByCode = new Map<string, (typeof existingTasksList)[0]>();
    for (const et of existingTasksList) {
      existingTasksById.set(et.id, et);
      existingTasksByCode.set(et.taskCode, et);
    }

    let targetTasks: Array<{
      taskCode: string;
      title: string;
      description: string | null;
      taskType: TaskType;
      points: number;
      isRequired: boolean;
      sortOrder: number;
      requirementMetadata: Record<string, unknown> | null;
    }> = [];

    if (input.tasks && Array.isArray(input.tasks)) {
      // Explicit full task replacement
      for (const t of input.tasks) {
        validateTaskCode(t.taskCode);
        validateTitle(t.title ?? "");
        const taskType = validateTaskType(t.taskType ?? "CUSTOM");
        const points = validatePoints(t.points ?? 10);
        const sortOrder = validateSortOrder(t.sortOrder ?? 0);

        // STABLE TASK CODE ENFORCEMENT:
        // If taskId is provided, verify it does not mutate taskCode of an existing task
        if (t.taskId) {
          const existing = existingTasksById.get(t.taskId.trim());
          if (existing && t.taskCode.trim() !== existing.taskCode) {
            throw new AdminCampaignError(
              "IMMUTABLE_TASK_CODE",
              `taskCode is permanent and cannot be changed for existing task '${existing.taskCode}' (attempted '${t.taskCode.trim()}').`,
              422,
            );
          }
        }

        targetTasks.push({
          taskCode: t.taskCode.trim(),
          title: (t.title ?? "").trim(),
          description: t.description?.trim() ?? null,
          taskType,
          points,
          isRequired: t.isRequired !== undefined ? Boolean(t.isRequired) : true,
          sortOrder,
          requirementMetadata: t.requirementMetadata ?? null,
        });
      }
    } else {
      // Clone from current version and apply diffs
      const removals = new Set(input.taskRemovals?.map((r) => r.trim()) ?? []);
      const updatesMap = new Map<string, TaskOverrideInput>();
      if (input.taskUpdates && Array.isArray(input.taskUpdates)) {
        for (const u of input.taskUpdates) {
          const trimmedCode = u.taskCode.trim();
          if (!existingTasksByCode.has(trimmedCode)) {
            throw new AdminCampaignError(
              "TASK_NOT_FOUND",
              `Task with taskCode '${trimmedCode}' was not found in current version.`,
              404,
            );
          }
          updatesMap.set(trimmedCode, u);
        }
      }

      for (const existingTask of existingTasksList) {
        if (removals.has(existingTask.taskCode)) {
          continue; // Task removed in this version
        }

        const update = updatesMap.get(existingTask.taskCode);
        if (update) {
          const title = update.title !== undefined ? update.title.trim() : existingTask.title;
          validateTitle(title);
          const taskType = update.taskType !== undefined ? validateTaskType(update.taskType) : existingTask.taskType;
          const points = update.points !== undefined ? validatePoints(update.points) : existingTask.points;
          const sortOrder = update.sortOrder !== undefined ? validateSortOrder(update.sortOrder) : existingTask.sortOrder;
          const isRequired = update.isRequired !== undefined ? Boolean(update.isRequired) : existingTask.isRequired;
          const description = update.description !== undefined ? update.description?.trim() ?? null : existingTask.description;
          const requirementMetadata = update.requirementMetadata !== undefined ? update.requirementMetadata : (existingTask.requirementMetadata as Record<string, unknown> | null);

          targetTasks.push({
            taskCode: existingTask.taskCode,
            title,
            description,
            taskType,
            points,
            isRequired,
            sortOrder,
            requirementMetadata,
          });
        } else {
          // Carry forward exactly as is
          targetTasks.push({
            taskCode: existingTask.taskCode,
            title: existingTask.title,
            description: existingTask.description,
            taskType: existingTask.taskType,
            points: existingTask.points,
            isRequired: existingTask.isRequired,
            sortOrder: existingTask.sortOrder,
            requirementMetadata: existingTask.requirementMetadata as Record<string, unknown> | null,
          });
        }
      }

      // Additions
      if (input.taskAdditions && Array.isArray(input.taskAdditions)) {
        for (const add of input.taskAdditions) {
          validateTaskCode(add.taskCode);
          validateTitle(add.title ?? "");
          const taskType = validateTaskType(add.taskType ?? "CUSTOM");
          const points = validatePoints(add.points ?? 10);
          const sortOrder = validateSortOrder(add.sortOrder ?? 0);
          targetTasks.push({
            taskCode: add.taskCode.trim(),
            title: (add.title ?? "").trim(),
            description: add.description?.trim() ?? null,
            taskType,
            points,
            isRequired: add.isRequired !== undefined ? Boolean(add.isRequired) : true,
            sortOrder,
            requirementMetadata: add.requirementMetadata ?? null,
          });
        }
      }
    }

    // Verify taskCode uniqueness in targetTasks
    const seenCodes = new Set<string>();
    for (const t of targetTasks) {
      if (seenCodes.has(t.taskCode)) {
        throw new AdminCampaignError(
          "DUPLICATE_TASK_CODE",
          `Task code '${t.taskCode}' appears multiple times in the new version task list.`,
          422,
        );
      }
      seenCodes.add(t.taskCode);
    }

    // 6. Deactivate existing current version
    await tx.campaignVersion.updateMany({
      where: { campaignId: campaign.id, isCurrent: true },
      data: { isCurrent: false, endsAt: startsAt },
    });

    // 7. Create new version
    const newVersion = await tx.campaignVersion.create({
      data: {
        campaignId: campaign.id,
        versionNumber: nextVersionNumber,
        isCurrent: true,
        compatibilityMode,
        compatibleFromVersionId: currentVersion.id,
        startsAt,
        endsAt,
        changeNotes: input.changeNotes?.trim() ?? null,
      },
    });

    // 8. Create tasks for the new version
    const createdTasks = [];
    for (const t of targetTasks) {
      const created = await tx.campaignTask.create({
        data: {
          versionId: newVersion.id,
          taskCode: t.taskCode,
          title: t.title,
          description: t.description,
          taskType: t.taskType,
          points: t.points,
          isRequired: t.isRequired,
          sortOrder: t.sortOrder,
          requirementMetadata: (t.requirementMetadata as any) ?? undefined,
        },
      });
      createdTasks.push(created);
    }

    // 9. Record Audit Log
    const audit = await recordAuditLog(tx, {
      actorId: input.adminUserId,
      actorIp: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      action: "CAMPAIGN_VERSION_CREATED",
      entityType: "CampaignVersion",
      entityId: newVersion.id,
      oldValues: {
        previousVersionId: currentVersion.id,
        previousVersionNumber: currentVersion.versionNumber,
      },
      newValues: {
        campaignId: campaign.id,
        versionNumber: newVersion.versionNumber,
        compatibilityMode: newVersion.compatibilityMode,
        compatibleFromVersionId: newVersion.compatibleFromVersionId,
        changeNotes: newVersion.changeNotes,
        taskCount: createdTasks.length,
      },
    });

    const formattedTasks = createdTasks.map(formatCampaignTaskOutput);

    return {
      success: true as const,
      version: {
        id: newVersion.id,
        campaignId: newVersion.campaignId,
        versionNumber: newVersion.versionNumber,
        isCurrent: newVersion.isCurrent,
        compatibilityMode: newVersion.compatibilityMode,
        compatibleFromVersionId: newVersion.compatibleFromVersionId,
        startsAt: newVersion.startsAt.toISOString(),
        endsAt: newVersion.endsAt ? newVersion.endsAt.toISOString() : null,
        changeNotes: newVersion.changeNotes,
        createdAt: newVersion.createdAt.toISOString(),
        taskCount: formattedTasks.length,
        tasks: formattedTasks,
      },
      auditLogId: audit.id,
    };
  });
}

/**
 * Lists all versions of a specific campaign, ordered newest first (versionNumber DESC).
 */
export async function listCampaignVersions(
  prisma: PrismaClient,
  campaignId: string,
): Promise<ListCampaignVersionsResult> {
  if (!campaignId || typeof campaignId !== "string" || !campaignId.trim()) {
    throw new AdminCampaignError("MISSING_CAMPAIGN_ID", "campaignId is required.", 422);
  }

  const campaign = await prisma.promoCampaign.findUnique({
    where: { id: campaignId.trim() },
    select: { id: true },
  });

  if (!campaign) {
    throw new AdminCampaignError("CAMPAIGN_NOT_FOUND", `Campaign '${campaignId}' was not found.`, 404);
  }

  const versions = await prisma.campaignVersion.findMany({
    where: { campaignId: campaign.id },
    orderBy: { versionNumber: "desc" },
    include: {
      tasks: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  return {
    versions: versions.map((v) => {
      const formattedTasks = v.tasks.map(formatCampaignTaskOutput);
      return {
        id: v.id,
        campaignId: v.campaignId,
        versionNumber: v.versionNumber,
        isCurrent: v.isCurrent,
        compatibilityMode: v.compatibilityMode,
        compatibleFromVersionId: v.compatibleFromVersionId,
        startsAt: v.startsAt.toISOString(),
        endsAt: v.endsAt ? v.endsAt.toISOString() : null,
        changeNotes: v.changeNotes,
        createdAt: v.createdAt.toISOString(),
        taskCount: formattedTasks.length,
        tasks: formattedTasks,
      };
    }),
    total: versions.length,
  };
}
