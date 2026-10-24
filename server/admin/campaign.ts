import type {
  PrismaClient,
  CampaignStatus,
  CampaignCompatibilityMode,
} from "@prisma/client";
import { recordAuditLog } from "../audit/audit";

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
    // 1. Verify WLProgram exists
    const program = await tx.wLProgram.findUnique({
      where: { id: input.wlProgramId },
      select: { id: true },
    });
    if (!program) {
      throw new AdminCampaignError(
        "WL_PROGRAM_NOT_FOUND",
        `WL Program '${input.wlProgramId}' was not found.`,
        404,
      );
    }

    // 2. Check slug uniqueness
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
