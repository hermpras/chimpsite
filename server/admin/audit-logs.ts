import type { Prisma, PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Error Class
// ---------------------------------------------------------------------------

export class AdminAuditLogError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = "AdminAuditLogError";
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ListAuditLogsFilter {
  action?: string;
  entityType?: string;
  actorId?: string;
  from?: string | Date;
  to?: string | Date;
  limit?: number;
  offset?: number;
}

export interface AdminAuditLogActor {
  id: string;
  role: string;
  wallet?: { address: string } | null;
  xIdentity?: { username: string } | null;
}

export interface AdminAuditLogItem {
  id: string;
  actorId: string | null;
  actor?: AdminAuditLogActor | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValues: Prisma.JsonValue | null;
  newValues: Prisma.JsonValue | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
}

export interface ListAuditLogsResult {
  logs: AdminAuditLogItem[];
  total: number;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Service Function
// ---------------------------------------------------------------------------

/**
 * List audit logs with optional filters (action, entityType, actorId, date range)
 * and pagination (limit, offset).
 *
 * Enforces:
 * - Order: newest first (createdAt DESC) with stable tie-breaker (id DESC).
 * - Maximum limit: capped at 100.
 * - Safe projection: actorIp and userAgent are NOT returned.
 */
export async function listAuditLogs(
  prisma: PrismaClient,
  filter: ListAuditLogsFilter = {},
): Promise<ListAuditLogsResult> {
  const where: Prisma.AuditLogWhereInput = {};

  if (filter.action && filter.action.trim()) {
    where.action = filter.action.trim();
  }

  if (filter.entityType && filter.entityType.trim()) {
    where.entityType = filter.entityType.trim();
  }

  if (filter.actorId && filter.actorId.trim()) {
    where.actorId = filter.actorId.trim();
  }

  let fromDate: Date | undefined;
  if (filter.from !== undefined && filter.from !== null && filter.from !== "") {
    fromDate = typeof filter.from === "string" ? new Date(filter.from) : filter.from;
    if (isNaN(fromDate.getTime())) {
      throw new AdminAuditLogError(
        "INVALID_DATE_RANGE",
        "Invalid 'from' date format.",
        400,
      );
    }
  }

  let toDate: Date | undefined;
  if (filter.to !== undefined && filter.to !== null && filter.to !== "") {
    toDate = typeof filter.to === "string" ? new Date(filter.to) : filter.to;
    if (isNaN(toDate.getTime())) {
      throw new AdminAuditLogError(
        "INVALID_DATE_RANGE",
        "Invalid 'to' date format.",
        400,
      );
    }
  }

  if (fromDate && toDate && fromDate > toDate) {
    throw new AdminAuditLogError(
      "INVALID_DATE_RANGE",
      "'from' date must be before or equal to 'to' date.",
      400,
    );
  }

  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) where.createdAt.gte = fromDate;
    if (toDate) where.createdAt.lte = toDate;
  }

  let limit = 50;
  if (filter.limit !== undefined) {
    const parsedLimit = Number(filter.limit);
    if (isNaN(parsedLimit) || parsedLimit < 1) {
      throw new AdminAuditLogError(
        "INVALID_LIMIT",
        "Limit must be a positive integer between 1 and 100.",
        400,
      );
    }
    limit = Math.min(Math.floor(parsedLimit), 100);
  }

  let offset = 0;
  if (filter.offset !== undefined) {
    const parsedOffset = Number(filter.offset);
    if (isNaN(parsedOffset) || parsedOffset < 0) {
      throw new AdminAuditLogError(
        "INVALID_OFFSET",
        "Offset must be a non-negative integer.",
        400,
      );
    }
    offset = Math.floor(parsedOffset);
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        actorId: true,
        action: true,
        entityType: true,
        entityId: true,
        oldValues: true,
        newValues: true,
        metadata: true,
        createdAt: true,
        actor: {
          select: {
            id: true,
            role: true,
            wallet: {
              select: {
                address: true,
              },
            },
            xIdentity: {
              select: {
                username: true,
              },
            },
          },
        },
      },
    }),
  ]);

  return {
    logs: logs as AdminAuditLogItem[],
    total,
    limit,
    offset,
  };
}
