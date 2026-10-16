import type { PrismaClient } from "@prisma/client";

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

export async function recordAuditLog(prisma: PrismaClient, input: CreateAuditLogInput) {
  return prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      actorIp: input.actorIp ?? null,
      userAgent: input.userAgent ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      oldValues: (input.oldValues as any) ?? undefined,
      newValues: (input.newValues as any) ?? undefined,
      metadata: (input.metadata as any) ?? undefined,
    },
  });
}
