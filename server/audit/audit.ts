import type { Prisma, PrismaClient } from "@prisma/client";

export interface CreateAuditLogInput {
  actorId?: string | null;
  actorIp?: string | null;
  userAgent?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Accepts either a full PrismaClient or a transaction-scoped client.
 * When a transaction client is supplied, the write participates in that
 * transaction so audit failures roll back the enclosing business operation.
 */
export type AuditLogClient = PrismaClient | Prisma.TransactionClient;

/**
 * Persist an audit log entry.
 *
 * Throws on database errors — the caller (and any enclosing Prisma
 * $transaction) must handle or propagate the failure. There is no silent
 * null-return fallback: a missing audit record must not be swallowed,
 * because the enclosing business transaction should roll back.
 */
export async function recordAuditLog(
  prisma: AuditLogClient,
  input: CreateAuditLogInput,
): Promise<{ id: string }> {
  return prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      actorIp: input.actorIp ?? null,
      userAgent: input.userAgent ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      oldValues: (input.oldValues as Prisma.InputJsonValue) ?? undefined,
      newValues: (input.newValues as Prisma.InputJsonValue) ?? undefined,
      metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
    },
    select: { id: true },
  });
}
