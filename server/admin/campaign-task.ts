import type { PrismaClient, TaskType, CampaignStatus } from "@prisma/client";
import { recordAuditLog } from "../audit/audit";

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class AdminCampaignTaskError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = "AdminCampaignTaskError";
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const VALID_TASK_TYPES: TaskType[] = [
  "SOCIAL_X_FOLLOW",
  "SOCIAL_X_REPOST",
  "INVENTORY_HOLD",
  "MANUAL_EVIDENCE",
  "CUSTOM",
];

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface CampaignTaskOutput {
  id: string;
  versionId: string;
  taskCode: string;
  title: string;
  description: string | null;
  taskType: TaskType;
  requirementMetadata: Record<string, unknown> | null;
  points: number;
  isRequired: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCampaignTaskInput {
  campaignId: string;
  versionIdentifier: string;
  adminUserId: string;
  taskCode: string;
  title: string;
  description?: string | null;
  taskType?: TaskType | string;
  requirementMetadata?: Record<string, unknown> | null;
  points?: number;
  isRequired?: boolean;
  sortOrder?: number;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface CreateCampaignTaskResult {
  success: true;
  task: CampaignTaskOutput;
  auditLogId: string;
}

export interface UpdateCampaignTaskInput {
  campaignId: string;
  versionIdentifier: string;
  taskId: string;
  adminUserId: string;
  taskCode?: string;
  title?: string;
  description?: string | null;
  taskType?: TaskType | string;
  requirementMetadata?: Record<string, unknown> | null;
  points?: number;
  isRequired?: boolean;
  sortOrder?: number;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface UpdateCampaignTaskResult {
  success: true;
  task: CampaignTaskOutput;
  auditLogId: string;
}

export interface DeleteCampaignTaskInput {
  campaignId: string;
  versionIdentifier: string;
  taskId: string;
  adminUserId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface DeleteCampaignTaskResult {
  success: true;
  deletedTaskId: string;
  auditLogId: string;
}

export interface ListCampaignTasksResult {
  tasks: CampaignTaskOutput[];
  total: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatCampaignTaskOutput(task: {
  id: string;
  versionId: string;
  taskCode: string;
  title: string;
  description: string | null;
  taskType: TaskType;
  requirementMetadata: unknown;
  points: number;
  isRequired: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): CampaignTaskOutput {
  return {
    id: task.id,
    versionId: task.versionId,
    taskCode: task.taskCode,
    title: task.title,
    description: task.description ?? null,
    taskType: task.taskType,
    requirementMetadata: (task.requirementMetadata as Record<string, unknown>) ?? null,
    points: task.points,
    isRequired: task.isRequired,
    sortOrder: task.sortOrder,
    createdAt:
      task.createdAt instanceof Date
        ? task.createdAt.toISOString()
        : String(task.createdAt),
    updatedAt:
      task.updatedAt instanceof Date
        ? task.updatedAt.toISOString()
        : String(task.updatedAt),
  };
}

export function validateTaskCode(taskCode: string): void {
  if (!taskCode || typeof taskCode !== "string" || !taskCode.trim()) {
    throw new AdminCampaignTaskError("MISSING_TASK_CODE", "taskCode is required.", 422);
  }
  const trimmed = taskCode.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    throw new AdminCampaignTaskError(
      "INVALID_TASK_CODE",
      "taskCode must contain only alphanumeric characters, underscores, or hyphens (e.g. 'FOLLOW_X').",
      422,
    );
  }
  if (trimmed.length > 100) {
    throw new AdminCampaignTaskError(
      "TASK_CODE_TOO_LONG",
      "taskCode must not exceed 100 characters.",
      422,
    );
  }
}

export function validateTitle(title: string): void {
  if (!title || typeof title !== "string" || !title.trim()) {
    throw new AdminCampaignTaskError("MISSING_TITLE", "Task title is required.", 422);
  }
  if (title.length > 255) {
    throw new AdminCampaignTaskError(
      "TITLE_TOO_LONG",
      "Task title must not exceed 255 characters.",
      422,
    );
  }
}

export function validateTaskType(taskType: unknown): TaskType {
  if (taskType === undefined || taskType === null) {
    return "CUSTOM";
  }
  if (typeof taskType !== "string" || !VALID_TASK_TYPES.includes(taskType as TaskType)) {
    throw new AdminCampaignTaskError(
      "INVALID_TASK_TYPE",
      `taskType must be one of: ${VALID_TASK_TYPES.join(", ")}.`,
      422,
    );
  }
  return taskType as TaskType;
}

export function validatePoints(points: unknown): number {
  if (points === undefined || points === null) {
    return 10;
  }
  if (typeof points !== "number" || !Number.isInteger(points) || points < 0) {
    throw new AdminCampaignTaskError(
      "INVALID_POINTS",
      "points must be a non-negative integer.",
      422,
    );
  }
  return points;
}

export function validateSortOrder(sortOrder: unknown): number {
  if (sortOrder === undefined || sortOrder === null) {
    return 0;
  }
  if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder)) {
    throw new AdminCampaignTaskError(
      "INVALID_SORT_ORDER",
      "sortOrder must be an integer.",
      422,
    );
  }
  return sortOrder;
}

/**
 * Resolves a campaign and campaign version by identifier.
 * Checks that the campaign exists.
 * If allowArchived is false (default, for mutation operations), checks that the campaign is not ARCHIVED.
 * Checks that the version exists for this campaign.
 */
export async function resolveCampaignVersion(
  tx: any,
  campaignId: string,
  versionIdentifier: string,
  options?: { allowArchived?: boolean },
): Promise<{
  campaign: { id: string; status: CampaignStatus };
  version: { id: string; versionNumber: number };
}> {
  const campaign = await tx.promoCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true, status: true },
  });

  if (!campaign) {
    throw new AdminCampaignTaskError(
      "CAMPAIGN_NOT_FOUND",
      `Campaign '${campaignId}' was not found.`,
      404,
    );
  }

  if (!options?.allowArchived && campaign.status === "ARCHIVED") {
    throw new AdminCampaignTaskError(
      "CAMPAIGN_ARCHIVED",
      "Cannot modify tasks of an archived campaign.",
      422,
    );
  }

  const isNumeric = /^\d+$/.test(versionIdentifier.trim());
  const version = isNumeric
    ? await tx.campaignVersion.findUnique({
        where: {
          campaignId_versionNumber: {
            campaignId,
            versionNumber: parseInt(versionIdentifier.trim(), 10),
          },
        },
        select: { id: true, versionNumber: true },
      })
    : await tx.campaignVersion.findFirst({
        where: {
          id: versionIdentifier.trim(),
          campaignId,
        },
        select: { id: true, versionNumber: true },
      });

  if (!version) {
    throw new AdminCampaignTaskError(
      "VERSION_NOT_FOUND",
      `Campaign version '${versionIdentifier}' was not found for campaign '${campaignId}'.`,
      404,
    );
  }

  return { campaign, version };
}

// ---------------------------------------------------------------------------
// createCampaignTask
// ---------------------------------------------------------------------------

export async function createCampaignTask(
  prisma: PrismaClient,
  input: CreateCampaignTaskInput,
): Promise<CreateCampaignTaskResult> {
  if (
    !input.campaignId ||
    typeof input.campaignId !== "string" ||
    !input.campaignId.trim()
  ) {
    throw new AdminCampaignTaskError(
      "MISSING_CAMPAIGN_ID",
      "campaignId is required.",
      422,
    );
  }
  if (
    !input.versionIdentifier ||
    typeof input.versionIdentifier !== "string" ||
    !input.versionIdentifier.trim()
  ) {
    throw new AdminCampaignTaskError(
      "MISSING_VERSION_IDENTIFIER",
      "version identifier is required.",
      422,
    );
  }
  if (
    !input.adminUserId ||
    typeof input.adminUserId !== "string" ||
    !input.adminUserId.trim()
  ) {
    throw new AdminCampaignTaskError("MISSING_ACTOR", "adminUserId is required.", 422);
  }

  validateTaskCode(input.taskCode);
  validateTitle(input.title);
  const taskType = validateTaskType(input.taskType);
  const points = validatePoints(input.points);
  const sortOrder = validateSortOrder(input.sortOrder);
  const isRequired = input.isRequired !== undefined ? Boolean(input.isRequired) : true;

  if (
    input.requirementMetadata !== undefined &&
    input.requirementMetadata !== null &&
    (typeof input.requirementMetadata !== "object" ||
      Array.isArray(input.requirementMetadata))
  ) {
    throw new AdminCampaignTaskError(
      "INVALID_METADATA",
      "requirementMetadata must be a JSON object or null.",
      422,
    );
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Verify campaign & version
    const { version } = await resolveCampaignVersion(
      tx,
      input.campaignId,
      input.versionIdentifier,
    );

    // 2. Check taskCode uniqueness in this version
    const existing = await tx.campaignTask.findUnique({
      where: {
        versionId_taskCode: {
          versionId: version.id,
          taskCode: input.taskCode.trim(),
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw new AdminCampaignTaskError(
        "TASK_CODE_CONFLICT",
        `A task with taskCode '${input.taskCode.trim()}' already exists in version ${version.versionNumber}.`,
        409,
      );
    }

    // 3. Create task
    const task = await tx.campaignTask.create({
      data: {
        versionId: version.id,
        taskCode: input.taskCode.trim(),
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        taskType,
        points,
        isRequired,
        sortOrder,
        requirementMetadata: (input.requirementMetadata as any) ?? undefined,
      },
    });

    // 4. Record audit log
    const audit = await recordAuditLog(tx, {
      actorId: input.adminUserId,
      actorIp: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      action: "CAMPAIGN_TASK_CREATED",
      entityType: "CampaignTask",
      entityId: task.id,
      newValues: {
        campaignId: input.campaignId,
        versionId: version.id,
        taskCode: task.taskCode,
        title: task.title,
        taskType: task.taskType,
        points: task.points,
        isRequired: task.isRequired,
        sortOrder: task.sortOrder,
      },
    });

    return {
      success: true as const,
      task: formatCampaignTaskOutput(task),
      auditLogId: audit.id,
    };
  });
}

// ---------------------------------------------------------------------------
// updateCampaignTask
// ---------------------------------------------------------------------------

export async function updateCampaignTask(
  prisma: PrismaClient,
  input: UpdateCampaignTaskInput,
): Promise<UpdateCampaignTaskResult> {
  if (
    !input.campaignId ||
    typeof input.campaignId !== "string" ||
    !input.campaignId.trim()
  ) {
    throw new AdminCampaignTaskError(
      "MISSING_CAMPAIGN_ID",
      "campaignId is required.",
      422,
    );
  }
  if (
    !input.versionIdentifier ||
    typeof input.versionIdentifier !== "string" ||
    !input.versionIdentifier.trim()
  ) {
    throw new AdminCampaignTaskError(
      "MISSING_VERSION_IDENTIFIER",
      "version identifier is required.",
      422,
    );
  }
  if (!input.taskId || typeof input.taskId !== "string" || !input.taskId.trim()) {
    throw new AdminCampaignTaskError("MISSING_TASK_ID", "taskId is required.", 422);
  }
  if (
    !input.adminUserId ||
    typeof input.adminUserId !== "string" ||
    !input.adminUserId.trim()
  ) {
    throw new AdminCampaignTaskError("MISSING_ACTOR", "adminUserId is required.", 422);
  }

  const updateData: any = {};
  if (input.taskCode !== undefined) {
    validateTaskCode(input.taskCode);
    updateData.taskCode = input.taskCode.trim();
  }
  if (input.title !== undefined) {
    validateTitle(input.title);
    updateData.title = input.title.trim();
  }
  if (input.description !== undefined) {
    updateData.description = input.description?.trim() ?? null;
  }
  if (input.taskType !== undefined) {
    updateData.taskType = validateTaskType(input.taskType);
  }
  if (input.points !== undefined) {
    updateData.points = validatePoints(input.points);
  }
  if (input.isRequired !== undefined) {
    updateData.isRequired = Boolean(input.isRequired);
  }
  if (input.sortOrder !== undefined) {
    updateData.sortOrder = validateSortOrder(input.sortOrder);
  }
  if (input.requirementMetadata !== undefined) {
    if (
      input.requirementMetadata !== null &&
      (typeof input.requirementMetadata !== "object" ||
        Array.isArray(input.requirementMetadata))
    ) {
      throw new AdminCampaignTaskError(
        "INVALID_METADATA",
        "requirementMetadata must be a JSON object or null.",
        422,
      );
    }
    updateData.requirementMetadata = input.requirementMetadata ?? null;
  }

  if (Object.keys(updateData).length === 0) {
    throw new AdminCampaignTaskError(
      "NO_FIELDS_TO_UPDATE",
      "At least one field to update must be provided.",
      422,
    );
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Verify campaign & version
    const { version } = await resolveCampaignVersion(
      tx,
      input.campaignId,
      input.versionIdentifier,
    );

    // 2. Fetch existing task
    const task = await tx.campaignTask.findFirst({
      where: {
        id: input.taskId.trim(),
        versionId: version.id,
      },
    });

    if (!task) {
      throw new AdminCampaignTaskError(
        "TASK_NOT_FOUND",
        `Task '${input.taskId}' was not found in version '${input.versionIdentifier}'.`,
        404,
      );
    }

    // 3. If taskCode changed, check collision
    if (updateData.taskCode && updateData.taskCode !== task.taskCode) {
      const existing = await tx.campaignTask.findUnique({
        where: {
          versionId_taskCode: {
            versionId: version.id,
            taskCode: updateData.taskCode,
          },
        },
        select: { id: true },
      });
      if (existing) {
        throw new AdminCampaignTaskError(
          "TASK_CODE_CONFLICT",
          `A task with taskCode '${updateData.taskCode}' already exists in version ${version.versionNumber}.`,
          409,
        );
      }
    }

    const oldValues = {
      taskCode: task.taskCode,
      title: task.title,
      description: task.description,
      taskType: task.taskType,
      points: task.points,
      isRequired: task.isRequired,
      sortOrder: task.sortOrder,
      requirementMetadata: task.requirementMetadata,
    };

    const updated = await tx.campaignTask.update({
      where: { id: task.id },
      data: updateData,
    });

    const newValues = {
      taskCode: updated.taskCode,
      title: updated.title,
      description: updated.description,
      taskType: updated.taskType,
      points: updated.points,
      isRequired: updated.isRequired,
      sortOrder: updated.sortOrder,
      requirementMetadata: updated.requirementMetadata,
    };

    const audit = await recordAuditLog(tx, {
      actorId: input.adminUserId,
      actorIp: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      action: "CAMPAIGN_TASK_UPDATED",
      entityType: "CampaignTask",
      entityId: updated.id,
      oldValues,
      newValues,
    });

    return {
      success: true as const,
      task: formatCampaignTaskOutput(updated),
      auditLogId: audit.id,
    };
  });
}

// ---------------------------------------------------------------------------
// deleteCampaignTask
// ---------------------------------------------------------------------------

export async function deleteCampaignTask(
  prisma: PrismaClient,
  input: DeleteCampaignTaskInput,
): Promise<DeleteCampaignTaskResult> {
  if (
    !input.campaignId ||
    typeof input.campaignId !== "string" ||
    !input.campaignId.trim()
  ) {
    throw new AdminCampaignTaskError(
      "MISSING_CAMPAIGN_ID",
      "campaignId is required.",
      422,
    );
  }
  if (
    !input.versionIdentifier ||
    typeof input.versionIdentifier !== "string" ||
    !input.versionIdentifier.trim()
  ) {
    throw new AdminCampaignTaskError(
      "MISSING_VERSION_IDENTIFIER",
      "version identifier is required.",
      422,
    );
  }
  if (!input.taskId || typeof input.taskId !== "string" || !input.taskId.trim()) {
    throw new AdminCampaignTaskError("MISSING_TASK_ID", "taskId is required.", 422);
  }
  if (
    !input.adminUserId ||
    typeof input.adminUserId !== "string" ||
    !input.adminUserId.trim()
  ) {
    throw new AdminCampaignTaskError("MISSING_ACTOR", "adminUserId is required.", 422);
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Verify campaign & version
    const { version } = await resolveCampaignVersion(
      tx,
      input.campaignId,
      input.versionIdentifier,
    );

    // 2. Fetch task
    const task = await tx.campaignTask.findFirst({
      where: {
        id: input.taskId.trim(),
        versionId: version.id,
      },
    });

    if (!task) {
      throw new AdminCampaignTaskError(
        "TASK_NOT_FOUND",
        `Task '${input.taskId}' was not found in version '${input.versionIdentifier}'.`,
        404,
      );
    }

    const oldValues = {
      taskCode: task.taskCode,
      title: task.title,
      description: task.description,
      taskType: task.taskType,
      points: task.points,
      isRequired: task.isRequired,
      sortOrder: task.sortOrder,
    };

    // 3. Delete task
    await tx.campaignTask.delete({
      where: { id: task.id },
    });

    // 4. Record audit log
    const audit = await recordAuditLog(tx, {
      actorId: input.adminUserId,
      actorIp: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      action: "CAMPAIGN_TASK_DELETED",
      entityType: "CampaignTask",
      entityId: task.id,
      oldValues,
    });

    return {
      success: true as const,
      deletedTaskId: task.id,
      auditLogId: audit.id,
    };
  });
}

// ---------------------------------------------------------------------------
// listCampaignTasks
// ---------------------------------------------------------------------------

export async function listCampaignTasks(
  prisma: PrismaClient,
  input: { campaignId: string; versionIdentifier: string },
): Promise<ListCampaignTasksResult> {
  const { version } = await resolveCampaignVersion(
    prisma as any,
    input.campaignId,
    input.versionIdentifier,
    { allowArchived: true },
  );

  const tasks = await prisma.campaignTask.findMany({
    where: { versionId: version.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return {
    tasks: tasks.map(formatCampaignTaskOutput),
    total: tasks.length,
  };
}

// ---------------------------------------------------------------------------
// getCampaignTask
// ---------------------------------------------------------------------------

export async function getCampaignTask(
  prisma: PrismaClient,
  input: { campaignId: string; versionIdentifier: string; taskId: string },
): Promise<CampaignTaskOutput> {
  const { version } = await resolveCampaignVersion(
    prisma as any,
    input.campaignId,
    input.versionIdentifier,
    { allowArchived: true },
  );

  const task = await prisma.campaignTask.findFirst({
    where: {
      id: input.taskId.trim(),
      versionId: version.id,
    },
  });

  if (!task) {
    throw new AdminCampaignTaskError(
      "TASK_NOT_FOUND",
      `Task '${input.taskId}' was not found in version '${input.versionIdentifier}'.`,
      404,
    );
  }

  return formatCampaignTaskOutput(task);
}
