import type { PrismaClient, DropStatus, DropPeriodStatus } from "@prisma/client";
import {
  CYCLE_DURATION_MS,
  MIN_CONFIG_LOCK_LEAD_MS,
  canConfigureStock,
} from "../drops/schedule";
import { recordAuditLog } from "../audit/audit";

export class AdminDropError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = "AdminDropError";
    this.code = code;
    this.status = status;
  }
}

export const VALID_DROP_STATUSES: DropStatus[] = [
  "DRAFT",
  "SCHEDULED",
  "ACTIVE",
  "PAUSED",
  "ENDED",
];

export const VALID_DROP_PERIOD_STATUSES: DropPeriodStatus[] = [
  "PENDING_CONFIG",
  "CONFIGURED",
  "ACTIVE",
  "ENDED",
  "CANCELLED",
];

/**
 * Validates whether a given date precisely aligns with global 2-hour UTC cycles:
 * [00:00, 02:00, 04:00, 06:00, ..., 22:00 UTC]
 */
export function isAlignedToUtc2HourCycle(date: Date): boolean {
  return (
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0 &&
    date.getUTCHours() % 2 === 0
  );
}

/**
 * Generates an array of 2-hour UTC cycle windows between startsAt and endsAt.
 */
export function generate2HourCycleBoundaries(
  startsAt: Date,
  endsAt: Date,
): Array<{ startsAt: Date; endsAt: Date; configLockAt: Date; periodIndex: number }> {
  const periods: Array<{
    startsAt: Date;
    endsAt: Date;
    configLockAt: Date;
    periodIndex: number;
  }> = [];

  let currentStartMs = startsAt.getTime();
  const endMs = endsAt.getTime();
  let index = 1;

  while (currentStartMs + CYCLE_DURATION_MS <= endMs) {
    const cycleStartsAt = new Date(currentStartMs);
    const cycleEndsAt = new Date(currentStartMs + CYCLE_DURATION_MS);
    const configLockAt = new Date(currentStartMs - MIN_CONFIG_LOCK_LEAD_MS);

    periods.push({
      startsAt: cycleStartsAt,
      endsAt: cycleEndsAt,
      configLockAt,
      periodIndex: index,
    });

    currentStartMs += CYCLE_DURATION_MS;
    index++;
  }

  return periods;
}

export interface CreateDropInput {
  slug: string;
  title: string;
  description?: string | null;
  status?: DropStatus;
  startsAt: Date | string;
  endsAt: Date | string;
  generatePeriods?: boolean;
  adminUserId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface UpdateDropInput {
  title?: string;
  description?: string | null;
  status?: DropStatus;
  cycleDurationHours?: number;
  adminUserId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface CreatePeriodInput {
  dropId: string;
  startsAt: Date | string;
  adminUserId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface TraitStockConfigItem {
  traitId: string;
  stock: number;
  weight?: number;
}

export interface ConfigureStockInput {
  dropId: string;
  periodId: string;
  items: TraitStockConfigItem[];
  adminUserId: string;
  now?: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface ActivatePeriodInput {
  dropId: string;
  periodId: string;
  adminUserId: string;
  now?: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * List all drops with period counts, status, and timeline.
 */
export async function listAdminDrops(
  prisma: PrismaClient,
  params?: { limit?: number; offset?: number },
) {
  const limit = Math.min(Math.max(params?.limit ?? 20, 1), 100);
  const offset = Math.max(params?.offset ?? 0, 0);

  const [drops, total] = await Promise.all([
    prisma.drop.findMany({
      take: limit,
      skip: offset,
      orderBy: { startsAt: "desc" },
      include: {
        periods: {
          orderBy: { periodIndex: "asc" },
          select: {
            id: true,
            periodIndex: true,
            startsAt: true,
            endsAt: true,
            configLockAt: true,
            status: true,
            isStockConfigured: true,
            isStockLocked: true,
            _count: {
              select: { poolItems: true, claims: true },
            },
          },
        },
      },
    }),
    prisma.drop.count(),
  ]);

  return { drops, total, limit, offset };
}

/**
 * Get detailed drop information including all periods and pool stock.
 */
export async function getAdminDrop(prisma: PrismaClient, dropIdOrSlug: string) {
  const drop = await prisma.drop.findFirst({
    where: {
      OR: [{ id: dropIdOrSlug }, { slug: dropIdOrSlug }],
    },
    include: {
      periods: {
        orderBy: { periodIndex: "asc" },
        include: {
          poolItems: {
            include: {
              trait: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  category: true,
                  rarity: true,
                  imageUrl: true,
                  maxSupply: true,
                  isActive: true,
                },
              },
            },
          },
          _count: {
            select: { claims: true },
          },
        },
      },
    },
  });

  if (!drop) {
    throw new AdminDropError("DROP_NOT_FOUND", "Drop was not found.", 404);
  }

  return drop;
}

/**
 * Create a new Drop and optionally generate its 2-hour UTC cycles.
 */
export async function createAdminDrop(prisma: PrismaClient, input: CreateDropInput) {
  const title = input.title?.trim();
  if (!title || title.length < 3) {
    throw new AdminDropError(
      "INVALID_INPUT",
      "Title must be at least 3 characters.",
      400,
    );
  }

  const slug = input.slug?.trim().toLowerCase();
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    throw new AdminDropError(
      "INVALID_INPUT",
      "Slug must contain only lowercase alphanumeric characters and hyphens.",
      400,
    );
  }

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);

  if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
    throw new AdminDropError("INVALID_INPUT", "Invalid startsAt or endsAt date.", 400);
  }

  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new AdminDropError(
      "INVALID_INPUT",
      "endsAt must be strictly after startsAt.",
      400,
    );
  }

  // Verify startsAt aligns with 2-hour UTC cycle
  if (!isAlignedToUtc2HourCycle(startsAt)) {
    throw new AdminDropError(
      "CYCLE_NOT_ALIGNED",
      "Drop startsAt must align with global 2-hour UTC cycle boundaries (00:00, 02:00, 04:00, etc. UTC).",
      400,
    );
  }

  const status = input.status ?? "DRAFT";
  if (!VALID_DROP_STATUSES.includes(status)) {
    throw new AdminDropError(
      "INVALID_INPUT",
      `Invalid drop status. Allowed: ${VALID_DROP_STATUSES.join(", ")}`,
      400,
    );
  }

  // Check slug uniqueness
  const existing = await prisma.drop.findUnique({
    where: { slug },
  });
  if (existing) {
    throw new AdminDropError(
      "SLUG_CONFLICT",
      `Drop with slug "${slug}" already exists.`,
      409,
    );
  }

  const shouldGeneratePeriods = input.generatePeriods ?? true;
  const periodBoundaries = shouldGeneratePeriods
    ? generate2HourCycleBoundaries(startsAt, endsAt)
    : [];

  return await prisma.$transaction(async (tx) => {
    const drop = await tx.drop.create({
      data: {
        slug,
        title,
        description: input.description?.trim() || null,
        status,
        startsAt,
        endsAt,
      },
    });

    if (periodBoundaries.length > 0) {
      for (const p of periodBoundaries) {
        await tx.dropPeriod.create({
          data: {
            dropId: drop.id,
            periodIndex: p.periodIndex,
            startsAt: p.startsAt,
            endsAt: p.endsAt,
            configLockAt: p.configLockAt,
            status: "PENDING_CONFIG",
            isStockConfigured: false,
            isStockLocked: false,
          },
        });
      }
    }

    const auditLog = await recordAuditLog(tx, {
      actorId: input.adminUserId,
      actorIp: input.ipAddress,
      userAgent: input.userAgent,
      action: "CREATE_DROP",
      entityType: "Drop",
      entityId: drop.id,
      newValues: {
        slug: drop.slug,
        title: drop.title,
        status: drop.status,
        startsAt: drop.startsAt.toISOString(),
        endsAt: drop.endsAt.toISOString(),
        periodsGenerated: periodBoundaries.length,
      },
    });

    const createdDrop = await tx.drop.findUnique({
      where: { id: drop.id },
      include: {
        periods: {
          orderBy: { periodIndex: "asc" },
        },
      },
    });

    return {
      drop: createdDrop!,
      auditLogId: auditLog.id,
    };
  });
}

/**
 * Update Drop metadata or status.
 */
export async function updateAdminDrop(
  prisma: PrismaClient,
  dropId: string,
  input: UpdateDropInput,
) {
  const drop = await prisma.drop.findUnique({
    where: { id: dropId },
  });

  if (!drop) {
    throw new AdminDropError("DROP_NOT_FOUND", "Drop was not found.", 404);
  }

  const dataToUpdate: Record<string, unknown> = {};

  if (input.title !== undefined) {
    const trimmedTitle = input.title.trim();
    if (trimmedTitle.length < 3) {
      throw new AdminDropError(
        "INVALID_INPUT",
        "Title must be at least 3 characters.",
        400,
      );
    }
    dataToUpdate.title = trimmedTitle;
  }

  if (input.description !== undefined) {
    dataToUpdate.description = input.description?.trim() || null;
  }

  if (input.status !== undefined) {
    if (!VALID_DROP_STATUSES.includes(input.status)) {
      throw new AdminDropError(
        "INVALID_INPUT",
        `Invalid drop status. Allowed: ${VALID_DROP_STATUSES.join(", ")}`,
        400,
      );
    }
    dataToUpdate.status = input.status;
    // When activating or resuming a drop, ensure endsAt is perpetual (far future) so it runs continuously without manual intervention
    if (input.status === "ACTIVE" && drop.endsAt < new Date()) {
      dataToUpdate.endsAt = new Date("2099-12-31T23:59:59.999Z");
    }
  }

  if (input.cycleDurationHours !== undefined) {
    if (
      typeof input.cycleDurationHours !== "number" ||
      !Number.isInteger(input.cycleDurationHours) ||
      input.cycleDurationHours < 1 ||
      input.cycleDurationHours > 24
    ) {
      throw new AdminDropError(
        "INVALID_INPUT",
        "cycleDurationHours must be an integer between 1 and 24 (e.g. 2 for Standard, 5 for Hype Control).",
        400,
      );
    }
    dataToUpdate.cycleDurationHours = input.cycleDurationHours;
  }

  if (Object.keys(dataToUpdate).length === 0) {
    return { drop, auditLogId: null };
  }

  return await prisma.$transaction(async (tx) => {
    const updated = await tx.drop.update({
      where: { id: dropId },
      data: dataToUpdate,
      include: {
        periods: {
          orderBy: { periodIndex: "asc" },
        },
      },
    });

    const auditLog = await recordAuditLog(tx, {
      actorId: input.adminUserId,
      actorIp: input.ipAddress,
      userAgent: input.userAgent,
      action: "UPDATE_DROP",
      entityType: "Drop",
      entityId: drop.id,
      oldValues: {
        title: drop.title,
        description: drop.description,
        status: drop.status,
        cycleDurationHours: (drop as any).cycleDurationHours ?? 2,
      },
      newValues: dataToUpdate,
    });

    return {
      drop: updated,
      auditLogId: auditLog.id,
    };
  });
}

/**
 * Add an individual 2-hour UTC period to a drop.
 */
export async function createAdminDropPeriod(
  prisma: PrismaClient,
  input: CreatePeriodInput,
) {
  const drop = await prisma.drop.findUnique({
    where: { id: input.dropId },
    include: { periods: { orderBy: { periodIndex: "desc" }, take: 1 } },
  });

  if (!drop) {
    throw new AdminDropError("DROP_NOT_FOUND", "Drop was not found.", 404);
  }

  const startsAt = new Date(input.startsAt);
  if (isNaN(startsAt.getTime())) {
    throw new AdminDropError("INVALID_INPUT", "Invalid period startsAt date.", 400);
  }

  if (!isAlignedToUtc2HourCycle(startsAt)) {
    throw new AdminDropError(
      "CYCLE_NOT_ALIGNED",
      "Period startsAt must align with global 2-hour UTC cycle boundaries (00:00, 02:00, 04:00, etc. UTC).",
      400,
    );
  }

  const endsAt = new Date(startsAt.getTime() + CYCLE_DURATION_MS);
  const configLockAt = new Date(startsAt.getTime() - MIN_CONFIG_LOCK_LEAD_MS);

  // Next period index
  const nextIndex = (drop.periods[0]?.periodIndex ?? 0) + 1;

  // Check if a period overlapping or matching this startsAt already exists for this drop
  const existingPeriod = await prisma.dropPeriod.findFirst({
    where: {
      dropId: drop.id,
      startsAt,
    },
  });

  if (existingPeriod) {
    throw new AdminDropError(
      "PERIOD_ALREADY_EXISTS",
      "A period starting at this UTC cycle time already exists for this drop.",
      409,
    );
  }

  return await prisma.$transaction(async (tx) => {
    const period = await tx.dropPeriod.create({
      data: {
        dropId: drop.id,
        periodIndex: nextIndex,
        startsAt,
        endsAt,
        configLockAt,
        status: "PENDING_CONFIG",
        isStockConfigured: false,
        isStockLocked: false,
      },
    });

    const auditLog = await recordAuditLog(tx, {
      actorId: input.adminUserId,
      actorIp: input.ipAddress,
      userAgent: input.userAgent,
      action: "CREATE_DROP_PERIOD",
      entityType: "DropPeriod",
      entityId: period.id,
      newValues: {
        dropId: drop.id,
        periodIndex: period.periodIndex,
        startsAt: period.startsAt.toISOString(),
        endsAt: period.endsAt.toISOString(),
      },
    });

    return { period, auditLogId: auditLog.id };
  });
}

/**
 * Configure trait pool and stock per trait for a specific drop period.
 *
 * Enforces:
 * - Stock must be configured at least 15 minutes before period start.
 * - Stock cannot be modified after period has started.
 * - Stock cannot be modified if period is active, ended, cancelled, or stock locked.
 * - Valid trait IDs and non-negative integer stock.
 * - Default equal weight (100) -> equal probability across traits.
 */
export async function configurePeriodStock(
  prisma: PrismaClient,
  input: ConfigureStockInput,
) {
  const now = input.now ?? new Date();

  const period = await prisma.dropPeriod.findUnique({
    where: { id: input.periodId },
    include: { drop: true },
  });

  if (!period || period.dropId !== input.dropId) {
    throw new AdminDropError("PERIOD_NOT_FOUND", "Drop period was not found.", 404);
  }

  // 1. Invariant: Check freeze window and period start rules
  const timingCheck = canConfigureStock(period.startsAt, period.configLockAt, now);
  if (!timingCheck.allowed) {
    const isStarted = now.getTime() >= period.startsAt.getTime();
    throw new AdminDropError(
      isStarted ? "STOCK_PERIOD_STARTED" : "STOCK_CONFIG_LOCKED",
      timingCheck.reason || "Stock configuration is locked.",
      409,
    );
  }

  if (period.isStockLocked) {
    throw new AdminDropError(
      "STOCK_ALREADY_LOCKED",
      "Stock configuration for this period is already locked.",
      409,
    );
  }

  if (
    period.status === "ACTIVE" ||
    period.status === "ENDED" ||
    period.status === "CANCELLED"
  ) {
    throw new AdminDropError(
      "INVALID_PERIOD_STATUS",
      `Cannot configure stock when period status is ${period.status}.`,
      400,
    );
  }

  // 2. Validate input items
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new AdminDropError(
      "INVALID_INPUT",
      "Must provide at least one trait item with stock allocation.",
      400,
    );
  }

  const seenTraitIds = new Set<string>();
  let totalAllocated = 0;

  for (const item of input.items) {
    if (!item.traitId || typeof item.traitId !== "string") {
      throw new AdminDropError(
        "INVALID_INPUT",
        "Each item must have a valid traitId.",
        400,
      );
    }
    if (seenTraitIds.has(item.traitId)) {
      throw new AdminDropError(
        "DUPLICATE_TRAIT",
        `Duplicate traitId in configuration: ${item.traitId}`,
        400,
      );
    }
    seenTraitIds.add(item.traitId);

    if (
      typeof item.stock !== "number" ||
      !Number.isInteger(item.stock) ||
      item.stock < 0
    ) {
      throw new AdminDropError(
        "INVALID_STOCK",
        `Stock allocation for trait ${item.traitId} must be a non-negative integer.`,
        400,
      );
    }

    if (
      item.weight !== undefined &&
      (typeof item.weight !== "number" ||
        !Number.isInteger(item.weight) ||
        item.weight <= 0)
    ) {
      throw new AdminDropError(
        "INVALID_WEIGHT",
        `RNG weight for trait ${item.traitId} must be a positive integer.`,
        400,
      );
    }

    totalAllocated += item.stock;
  }

  if (totalAllocated <= 0) {
    throw new AdminDropError(
      "ZERO_STOCK",
      "Total allocated stock across all traits must be greater than zero.",
      400,
    );
  }

  // 3. Verify all traitIds exist and are active in database
  const traitIds = Array.from(seenTraitIds);
  const existingTraits = await prisma.trait.findMany({
    where: {
      id: { in: traitIds },
      isActive: true,
    },
  });

  if (existingTraits.length !== traitIds.length) {
    const existingIds = new Set(existingTraits.map((t) => t.id));
    const missing = traitIds.filter((id) => !existingIds.has(id));
    throw new AdminDropError(
      "TRAIT_NOT_FOUND",
      `One or more traits not found or inactive: ${missing.join(", ")}`,
      404,
    );
  }

  // 4. Atomic transaction to upsert pool items and update period status
  return await prisma.$transaction(async (tx) => {
    // Clean up previous pool items for this period (safe since period not started)
    await tx.dropPoolItem.deleteMany({
      where: { periodId: period.id },
    });

    // Create new pool items with default weight 100 (equal probability)
    for (const item of input.items) {
      await tx.dropPoolItem.create({
        data: {
          periodId: period.id,
          traitId: item.traitId,
          allocatedStock: item.stock,
          remainingStock: item.stock,
          claimedStock: 0,
          weight: item.weight ?? 100, // Equal probability by default
        },
      });
    }

    // Update period status to CONFIGURED
    const updatedPeriod = await tx.dropPeriod.update({
      where: { id: period.id },
      data: {
        isStockConfigured: true,
        status: "CONFIGURED",
      },
      include: {
        poolItems: {
          include: { trait: true },
        },
      },
    });

    const auditLog = await recordAuditLog(tx, {
      actorId: input.adminUserId,
      actorIp: input.ipAddress,
      userAgent: input.userAgent,
      action: "CONFIGURE_DROP_STOCK",
      entityType: "DropPeriod",
      entityId: period.id,
      newValues: {
        dropId: period.dropId,
        periodIndex: period.periodIndex,
        totalAllocated,
        traitsCount: input.items.length,
        items: input.items.map((i) => ({
          traitId: i.traitId,
          stock: i.stock,
          weight: i.weight ?? 100,
        })),
      },
    });

    return {
      period: updatedPeriod,
      auditLogId: auditLog.id,
    };
  });
}

/**
 * Open / Activate a Drop Period.
 *
 * Invariant:
 * - "Jika stock hilang atau tidak valid saat period seharusnya dimulai, period tidak dibuka."
 * - Cannot activate if stock is missing or invalid.
 * - Must be within period time window [startsAt, endsAt].
 */
export async function activateDropPeriod(
  prisma: PrismaClient,
  input: ActivatePeriodInput,
) {
  const now = input.now ?? new Date();

  const period = await prisma.dropPeriod.findUnique({
    where: { id: input.periodId },
    include: {
      drop: true,
      poolItems: true,
    },
  });

  if (!period || period.dropId !== input.dropId) {
    throw new AdminDropError("PERIOD_NOT_FOUND", "Drop period was not found.", 404);
  }

  if (period.status === "ACTIVE") {
    throw new AdminDropError(
      "PERIOD_ALREADY_ACTIVE",
      "Drop period is already active.",
      409,
    );
  }

  if (period.status === "ENDED" || period.status === "CANCELLED") {
    throw new AdminDropError(
      "PERIOD_CANNOT_ACTIVATE",
      `Cannot activate period with status ${period.status}.`,
      400,
    );
  }

  // Timing check: Must be within period cycle window
  if (now.getTime() < period.startsAt.getTime()) {
    throw new AdminDropError(
      "PERIOD_NOT_STARTED",
      `Period cannot be activated before its start time (${period.startsAt.toISOString()}).`,
      400,
    );
  }

  if (now.getTime() > period.endsAt.getTime()) {
    throw new AdminDropError(
      "PERIOD_ALREADY_ENDED",
      `Period window has already ended (${period.endsAt.toISOString()}).`,
      400,
    );
  }

  // INVARIANT: "Jika stock hilang atau tidak valid saat period seharusnya dimulai, period tidak dibuka."
  const totalRemainingStock = period.poolItems.reduce(
    (acc, item) => acc + item.remainingStock,
    0,
  );
  const totalAllocatedStock = period.poolItems.reduce(
    (acc, item) => acc + item.allocatedStock,
    0,
  );

  if (
    !period.isStockConfigured ||
    period.poolItems.length === 0 ||
    totalAllocatedStock <= 0 ||
    totalRemainingStock <= 0
  ) {
    throw new AdminDropError(
      "PERIOD_STOCK_INVALID",
      "Cannot open drop period: stock is missing, unconfigured, or invalid. Period remains closed.",
      400,
    );
  }

  return await prisma.$transaction(async (tx) => {
    // Transition period to ACTIVE, freeze stock
    const updatedPeriod = await tx.dropPeriod.update({
      where: { id: period.id },
      data: {
        status: "ACTIVE",
        isStockLocked: true,
      },
      include: {
        poolItems: {
          include: { trait: true },
        },
      },
    });

    // Ensure drop is ACTIVE if currently SCHEDULED or DRAFT
    if (period.drop.status === "SCHEDULED" || period.drop.status === "DRAFT") {
      await tx.drop.update({
        where: { id: period.dropId },
        data: { status: "ACTIVE" },
      });
    }

    const auditLog = await recordAuditLog(tx, {
      actorId: input.adminUserId,
      actorIp: input.ipAddress,
      userAgent: input.userAgent,
      action: "ACTIVATE_DROP_PERIOD",
      entityType: "DropPeriod",
      entityId: period.id,
      newValues: {
        periodId: period.id,
        dropId: period.dropId,
        periodIndex: period.periodIndex,
        status: "ACTIVE",
        isStockLocked: true,
      },
    });

    return {
      period: updatedPeriod,
      auditLogId: auditLog.id,
    };
  });
}

/**
 * List active traits available for drop pool configuration.
 */
export async function listAdminTraits(
  prisma: PrismaClient,
  options?: { includeInactive?: boolean },
) {
  return await prisma.trait.findMany({
    where: options?.includeInactive ? undefined : { isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      category: true,
      rarity: true,
      imageUrl: true,
      description: true,
      maxSupply: true,
      isActive: true,
    },
  });
}
