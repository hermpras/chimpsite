import type { Prisma, PrismaClient, WLProgramStatus } from "@prisma/client";
import { recordAuditLog } from "../audit/audit";

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class AdminWLProgramError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = "AdminWLProgramError";
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Valid enum values & transitions
// ---------------------------------------------------------------------------

export const VALID_WL_PROGRAM_STATUSES: WLProgramStatus[] = [
  "UPCOMING",
  "OPEN",
  "PAUSED",
  "FINALIZED",
  "CLOSED",
];

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface CreateWLProgramInput {
  slug: string;
  name: string;
  description?: string | null;
  /** Explicit capacity — strictly mandatory positive integer (> 0). No default. */
  totalSlots: number;
  status?: WLProgramStatus | string;
  startsAt: string | Date;
  endsAt?: string | Date | null;
  adminUserId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface UpdateWLProgramInput {
  programId: string;
  name?: string;
  description?: string | null;
  totalSlots?: number;
  status?: WLProgramStatus | string;
  startsAt?: string | Date;
  endsAt?: string | Date | null;
  adminUserId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface ListWLProgramsOptions {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface WLProgramSummaryOutput {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  totalSlots: number;
  allocatedSlotsCount: number;
  status: WLProgramStatus;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
  campaignsCount?: number;
  slotsCount?: number;
  queueEntriesCount?: number;
}

// ---------------------------------------------------------------------------
// Slug normalization & validation
// ---------------------------------------------------------------------------

export function normalizeSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Creates a new Whitelist Program.
 * Invariant: Capacity (totalSlots) must be explicitly specified as an integer > 0.
 * Invariant: Slug must be unique.
 */
export async function createWLProgram(
  prisma: PrismaClient,
  input: CreateWLProgramInput,
): Promise<{ program: WLProgramSummaryOutput; auditLogId: string }> {
  // 1. Validate name
  if (!input.name || typeof input.name !== "string" || !input.name.trim()) {
    throw new AdminWLProgramError("INVALID_NAME", "Program name is required.", 422);
  }
  const name = input.name.trim();

  // 2. Validate and normalize slug
  if (!input.slug || typeof input.slug !== "string" || !input.slug.trim()) {
    throw new AdminWLProgramError("INVALID_SLUG", "Program slug is required.", 422);
  }
  const slug = normalizeSlug(input.slug);
  if (!slug) {
    throw new AdminWLProgramError(
      "INVALID_SLUG",
      "Slug must contain alphanumeric characters or hyphens.",
      422,
    );
  }

  // 3. Explicit Capacity Validation — strictly required positive integer (> 0).
  if (
    input.totalSlots === undefined ||
    input.totalSlots === null ||
    typeof input.totalSlots !== "number" ||
    !Number.isInteger(input.totalSlots) ||
    input.totalSlots <= 0
  ) {
    throw new AdminWLProgramError(
      "INVALID_CAPACITY",
      "Capacity (totalSlots) must be explicitly specified as a positive integer (> 0). No default capacity is allowed.",
      422,
    );
  }
  const totalSlots = input.totalSlots;

  // 4. Validate startsAt
  if (!input.startsAt) {
    throw new AdminWLProgramError(
      "MISSING_STARTS_AT",
      "Program startsAt timestamp is required.",
      422,
    );
  }
  const startsAt = new Date(input.startsAt);
  if (isNaN(startsAt.getTime())) {
    throw new AdminWLProgramError(
      "INVALID_STARTS_AT",
      "Program startsAt must be a valid ISO date timestamp.",
      422,
    );
  }

  // 5. Validate endsAt (if provided)
  let endsAt: Date | null = null;
  if (input.endsAt) {
    endsAt = new Date(input.endsAt);
    if (isNaN(endsAt.getTime())) {
      throw new AdminWLProgramError(
        "INVALID_ENDS_AT",
        "Program endsAt must be a valid ISO date timestamp.",
        422,
      );
    }
    if (endsAt <= startsAt) {
      throw new AdminWLProgramError(
        "INVALID_DATE_RANGE",
        "Program endsAt must be after startsAt.",
        422,
      );
    }
  }

  // 6. Validate status (if provided, defaults to UPCOMING)
  let status: WLProgramStatus = "UPCOMING";
  if (input.status) {
    const rawStatus = input.status.toString().toUpperCase() as WLProgramStatus;
    if (!VALID_WL_PROGRAM_STATUSES.includes(rawStatus)) {
      throw new AdminWLProgramError(
        "INVALID_STATUS",
        `Invalid status '${input.status}'. Valid statuses are: ${VALID_WL_PROGRAM_STATUSES.join(", ")}.`,
        422,
      );
    }
    status = rawStatus;
  }

  // 7. Execute in transaction to verify uniqueness and write audit log
  return await prisma.$transaction(async (tx) => {
    // Check slug collision
    const existing = await tx.wLProgram.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (existing) {
      throw new AdminWLProgramError(
        "SLUG_CONFLICT",
        `A Whitelist Program with slug '${slug}' already exists.`,
        409,
      );
    }

    const created = await tx.wLProgram.create({
      data: {
        slug,
        name,
        description: input.description?.trim() || null,
        totalSlots,
        allocatedSlotsCount: 0,
        status,
        startsAt,
        endsAt,
      },
    });

    const audit = await recordAuditLog(tx, {
      actorId: input.adminUserId,
      actorIp: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      action: "WL_PROGRAM_CREATED",
      entityType: "WLProgram",
      entityId: created.id,
      oldValues: null,
      newValues: {
        id: created.id,
        slug: created.slug,
        name: created.name,
        totalSlots: created.totalSlots,
        status: created.status,
        startsAt: created.startsAt.toISOString(),
        endsAt: created.endsAt ? created.endsAt.toISOString() : null,
      },
      metadata: {
        slug: created.slug,
        name: created.name,
        totalSlots: created.totalSlots,
      },
    });

    return {
      program: {
        id: created.id,
        slug: created.slug,
        name: created.name,
        description: created.description,
        totalSlots: created.totalSlots,
        allocatedSlotsCount: created.allocatedSlotsCount,
        status: created.status,
        startsAt: created.startsAt.toISOString(),
        endsAt: created.endsAt ? created.endsAt.toISOString() : null,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
        campaignsCount: 0,
        slotsCount: 0,
        queueEntriesCount: 0,
      },
      auditLogId: audit.id,
    };
  });
}

/**
 * Updates an existing Whitelist Program.
 * Invariant: totalSlots cannot be reduced below allocatedSlotsCount.
 */
export async function updateWLProgram(
  prisma: PrismaClient,
  input: UpdateWLProgramInput,
): Promise<{ program: WLProgramSummaryOutput; auditLogId: string }> {
  if (
    !input.programId ||
    typeof input.programId !== "string" ||
    !input.programId.trim()
  ) {
    throw new AdminWLProgramError("INVALID_PROGRAM_ID", "programId is required.", 422);
  }
  const programId = input.programId.trim();

  return await prisma.$transaction(async (tx) => {
    const existing = await tx.wLProgram.findUnique({
      where: { id: programId },
    });
    if (!existing) {
      throw new AdminWLProgramError(
        "PROGRAM_NOT_FOUND",
        `Whitelist Program '${programId}' was not found.`,
        404,
      );
    }

    const oldValues: Record<string, unknown> = {
      name: existing.name,
      description: existing.description,
      totalSlots: existing.totalSlots,
      status: existing.status,
      startsAt: existing.startsAt.toISOString(),
      endsAt: existing.endsAt ? existing.endsAt.toISOString() : null,
    };

    const updateData: Prisma.WLProgramUpdateInput = {};
    const newValues: Record<string, unknown> = {};

    // Validate name update
    if (input.name !== undefined) {
      if (typeof input.name !== "string" || !input.name.trim()) {
        throw new AdminWLProgramError(
          "INVALID_NAME",
          "Program name cannot be empty.",
          422,
        );
      }
      updateData.name = input.name.trim();
      newValues.name = updateData.name;
    }

    // Validate description update
    if (input.description !== undefined) {
      updateData.description = input.description ? input.description.trim() : null;
      newValues.description = updateData.description;
    }

    // Validate totalSlots update
    if (input.totalSlots !== undefined) {
      if (
        typeof input.totalSlots !== "number" ||
        !Number.isInteger(input.totalSlots) ||
        input.totalSlots <= 0
      ) {
        throw new AdminWLProgramError(
          "INVALID_CAPACITY",
          "Capacity (totalSlots) must be a positive integer (> 0).",
          422,
        );
      }

      // Invariant: capacity cannot be lower than already allocated slots!
      if (input.totalSlots < existing.allocatedSlotsCount) {
        throw new AdminWLProgramError(
          "CAPACITY_EXCEEDED",
          `Cannot reduce capacity to ${input.totalSlots}. Program already has ${existing.allocatedSlotsCount} allocated slots.`,
          409,
        );
      }

      updateData.totalSlots = input.totalSlots;
      newValues.totalSlots = input.totalSlots;
    }

    // Validate status update
    if (input.status !== undefined) {
      const rawStatus = input.status.toString().toUpperCase() as WLProgramStatus;
      if (!VALID_WL_PROGRAM_STATUSES.includes(rawStatus)) {
        throw new AdminWLProgramError(
          "INVALID_STATUS",
          `Invalid status '${input.status}'. Valid statuses are: ${VALID_WL_PROGRAM_STATUSES.join(", ")}.`,
          422,
        );
      }
      updateData.status = rawStatus;
      newValues.status = rawStatus;
    }

    // Validate startsAt update
    let targetStartsAt = existing.startsAt;
    if (input.startsAt !== undefined) {
      const parsedStarts = new Date(input.startsAt);
      if (isNaN(parsedStarts.getTime())) {
        throw new AdminWLProgramError(
          "INVALID_STARTS_AT",
          "startsAt must be a valid ISO date timestamp.",
          422,
        );
      }
      targetStartsAt = parsedStarts;
      updateData.startsAt = parsedStarts;
      newValues.startsAt = parsedStarts.toISOString();
    }

    // Validate endsAt update
    if (input.endsAt !== undefined) {
      if (input.endsAt === null || input.endsAt === "") {
        updateData.endsAt = null;
        newValues.endsAt = null;
      } else {
        const parsedEnds = new Date(input.endsAt);
        if (isNaN(parsedEnds.getTime())) {
          throw new AdminWLProgramError(
            "INVALID_ENDS_AT",
            "endsAt must be a valid ISO date timestamp.",
            422,
          );
        }
        if (parsedEnds <= targetStartsAt) {
          throw new AdminWLProgramError(
            "INVALID_DATE_RANGE",
            "Program endsAt must be after startsAt.",
            422,
          );
        }
        updateData.endsAt = parsedEnds;
        newValues.endsAt = parsedEnds.toISOString();
      }
    }

    // If nothing changed, return existing
    if (Object.keys(updateData).length === 0) {
      return {
        program: {
          id: existing.id,
          slug: existing.slug,
          name: existing.name,
          description: existing.description,
          totalSlots: existing.totalSlots,
          allocatedSlotsCount: existing.allocatedSlotsCount,
          status: existing.status,
          startsAt: existing.startsAt.toISOString(),
          endsAt: existing.endsAt ? existing.endsAt.toISOString() : null,
          createdAt: existing.createdAt.toISOString(),
          updatedAt: existing.updatedAt.toISOString(),
        },
        auditLogId: "",
      };
    }

    const updated = await tx.wLProgram.update({
      where: { id: programId },
      data: updateData,
    });

    const audit = await recordAuditLog(tx, {
      actorId: input.adminUserId,
      actorIp: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      action: "WL_PROGRAM_UPDATED",
      entityType: "WLProgram",
      entityId: updated.id,
      oldValues,
      newValues,
      metadata: {
        slug: updated.slug,
        fieldsUpdated: Object.keys(updateData),
      },
    });

    return {
      program: {
        id: updated.id,
        slug: updated.slug,
        name: updated.name,
        description: updated.description,
        totalSlots: updated.totalSlots,
        allocatedSlotsCount: updated.allocatedSlotsCount,
        status: updated.status,
        startsAt: updated.startsAt.toISOString(),
        endsAt: updated.endsAt ? updated.endsAt.toISOString() : null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
      auditLogId: audit.id,
    };
  });
}

/**
 * Lists WL Programs with optional filters and counts.
 */
export async function listWLPrograms(
  prisma: PrismaClient,
  options?: ListWLProgramsOptions,
): Promise<{ programs: WLProgramSummaryOutput[]; total: number }> {
  const where: Prisma.WLProgramWhereInput = {};

  if (options?.status) {
    const rawStatus = options.status.toUpperCase() as WLProgramStatus;
    if (VALID_WL_PROGRAM_STATUSES.includes(rawStatus)) {
      where.status = rawStatus;
    }
  }

  if (options?.search && options.search.trim()) {
    const query = options.search.trim();
    where.OR = [
      { name: { contains: query, mode: "insensitive" } },
      { slug: { contains: query, mode: "insensitive" } },
      { id: { equals: query } },
    ];
  }

  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  const offset = Math.max(options?.offset ?? 0, 0);

  const [programs, total] = await Promise.all([
    prisma.wLProgram.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        _count: {
          select: {
            campaigns: true,
            slots: true,
            queueEntries: true,
          },
        },
      },
    }),
    prisma.wLProgram.count({ where }),
  ]);

  return {
    programs: programs.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      totalSlots: p.totalSlots,
      allocatedSlotsCount: p.allocatedSlotsCount,
      status: p.status,
      startsAt: p.startsAt.toISOString(),
      endsAt: p.endsAt ? p.endsAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      campaignsCount: p._count.campaigns,
      slotsCount: p._count.slots,
      queueEntriesCount: p._count.queueEntries,
    })),
    total,
  };
}

/**
 * Gets a single WL Program by ID or Slug.
 */
export async function getWLProgram(
  prisma: PrismaClient,
  idOrSlug: string,
): Promise<WLProgramSummaryOutput> {
  const identifier = idOrSlug.trim();
  const program = await prisma.wLProgram.findFirst({
    where: {
      OR: [{ id: identifier }, { slug: identifier }],
    },
    include: {
      _count: {
        select: {
          campaigns: true,
          slots: true,
          queueEntries: true,
        },
      },
    },
  });

  if (!program) {
    throw new AdminWLProgramError(
      "PROGRAM_NOT_FOUND",
      `Whitelist Program '${identifier}' was not found.`,
      404,
    );
  }

  return {
    id: program.id,
    slug: program.slug,
    name: program.name,
    description: program.description,
    totalSlots: program.totalSlots,
    allocatedSlotsCount: program.allocatedSlotsCount,
    status: program.status,
    startsAt: program.startsAt.toISOString(),
    endsAt: program.endsAt ? program.endsAt.toISOString() : null,
    createdAt: program.createdAt.toISOString(),
    updatedAt: program.updatedAt.toISOString(),
    campaignsCount: program._count.campaigns,
    slotsCount: program._count.slots,
    queueEntriesCount: program._count.queueEntries,
  };
}
