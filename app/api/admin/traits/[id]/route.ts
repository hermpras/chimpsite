import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import { syncActiveDropPeriodPool } from "@/server/drops/auto-replenish";
import { readLimitedBody } from "@/lib/auth/body-limit";
import { recordAuditLog } from "@/server/audit/audit";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  { params }: RouteParams,
): Promise<Response> {
  try {
    await requireAdminSession(prisma, "MANAGE_DROPS");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  const { id } = await params;
  const trait = await prisma.trait.findUnique({
    where: { id },
  });

  if (!trait) {
    return Response.json(
      { error: "NOT_FOUND", message: `Trait "${id}" not found.` },
      { status: 404 },
    );
  }

  return Response.json({ trait });
}

export async function PUT(
  request: Request,
  { params }: RouteParams,
): Promise<Response> {
  let adminSession;
  try {
    adminSession = await requireAdminSession(prisma, "MANAGE_DROPS");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  const { id } = await params;

  const bodyResult = await readLimitedBody(request);
  if (!bodyResult.ok) {
    const status = bodyResult.reason === "too_large" ? 413 : 400;
    return Response.json({ error: bodyResult.reason }, { status });
  }

  let body: any;
  try {
    body = JSON.parse(bodyResult.text);
  } catch {
    return Response.json(
      { error: "MALFORMED_JSON", message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  try {
    const { name, category, rarity, imageUrl, description, maxSupply, isActive } = body || {};

    const existing = await prisma.trait.findUnique({
      where: { id },
    });

    if (!existing) {
      return Response.json(
        { error: "NOT_FOUND", message: `Trait "${id}" not found.` },
        { status: 404 },
      );
    }

    const actorId = adminSession?.userId || (adminSession as any)?.user?.id || null;
    const ip = clientIp(request);
    const userAgent = request.headers.get("user-agent") ?? null;

    const runTx =
      typeof prisma.$transaction === "function"
        ? (cb: (tx: any) => Promise<any>) => prisma.$transaction(cb)
        : (cb: (tx: any) => Promise<any>) => cb(prisma);

    const updateData: any = {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(rarity !== undefined ? { rarity } : {}),
      ...(imageUrl !== undefined ? { imageUrl: imageUrl.trim() } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
      ...(maxSupply !== undefined
        ? { maxSupply: typeof maxSupply === "number" ? maxSupply : null }
        : {}),
      ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
    };

    const updated = await runTx(async (tx) => {
      const res = await tx.trait.update({
        where: { id },
        data: updateData,
      });

      if (tx.auditLog) {
        await recordAuditLog(tx, {
          actorId,
          actorIp: ip,
          userAgent,
          action: "TRAIT_UPDATED",
          entityType: "Trait",
          entityId: id,
          oldValues: {
            name: existing.name,
            category: existing.category,
            rarity: existing.rarity,
            imageUrl: existing.imageUrl,
            description: existing.description,
            maxSupply: existing.maxSupply,
            isActive: existing.isActive,
          },
          newValues: updateData,
        });
      }

      return res;
    });

    // Auto-sync active drop period pool in real-time
    await syncActiveDropPeriodPool(prisma);

    return Response.json({ success: true, trait: updated });
  } catch (err: unknown) {
    console.error("PUT /api/admin/traits/[id] error:", err);
    return Response.json(
      { error: "SERVER_ERROR", message: "Failed to update trait." },
      { status: 500 },
    );
  }
}

export const PATCH = PUT;

export async function DELETE(
  request: Request,
  { params }: RouteParams,
): Promise<Response> {
  let adminSession;
  try {
    adminSession = await requireAdminSession(prisma, "MANAGE_DROPS");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  const { id } = await params;
  try {
    const existing = await prisma.trait.findUnique({
      where: { id },
    });

    if (!existing) {
      return Response.json(
        { error: "NOT_FOUND", message: `Trait "${id}" not found.` },
        { status: 404 },
      );
    }

    const actorId = adminSession?.userId || (adminSession as any)?.user?.id || null;
    const ip = clientIp(request);
    const userAgent = request.headers.get("user-agent") ?? null;

    const runTx =
      typeof prisma.$transaction === "function"
        ? (cb: (tx: any) => Promise<any>) => prisma.$transaction(cb)
        : (cb: (tx: any) => Promise<any>) => cb(prisma);

    const inventoryCount = await prisma.inventoryItem.count({
      where: { traitId: id },
    });

    if (inventoryCount > 0) {
      const deactivated = await runTx(async (tx) => {
        const res = await tx.trait.update({
          where: { id },
          data: { isActive: false },
        });

        if (tx.auditLog) {
          await recordAuditLog(tx, {
            actorId,
            actorIp: ip,
            userAgent,
            action: "TRAIT_UPDATED",
            entityType: "Trait",
            entityId: id,
            oldValues: { isActive: existing.isActive },
            newValues: { isActive: false },
            metadata: { reason: "OWNED_INVENTORY_PRESERVED", inventoryCount },
          });
        }

        return res;
      });

      // Auto-sync active drop period pool in real-time
      await syncActiveDropPeriodPool(prisma);

      return Response.json({
        success: true,
        mode: "deactivated",
        message: `Trait "${existing.name}" has ${inventoryCount} inventory item(s). It was deactivated.`,
        trait: deactivated,
      });
    }

    const claimCount = await prisma.claim.count({
      where: { dropPoolItem: { traitId: id } },
    });

    if (claimCount > 0) {
      const deactivated = await runTx(async (tx) => {
        const res = await tx.trait.update({
          where: { id },
          data: { isActive: false },
        });

        if (tx.auditLog) {
          await recordAuditLog(tx, {
            actorId,
            actorIp: ip,
            userAgent,
            action: "TRAIT_UPDATED",
            entityType: "Trait",
            entityId: id,
            oldValues: { isActive: existing.isActive },
            newValues: { isActive: false },
            metadata: { reason: "CLAIM_HISTORY_PRESERVED", claimCount },
          });
        }

        return res;
      });

      // Auto-sync active drop period pool in real-time
      await syncActiveDropPeriodPool(prisma);

      return Response.json({
        success: true,
        mode: "deactivated",
        message: `Trait "${existing.name}" has claim history. It was deactivated.`,
        trait: deactivated,
      });
    }

    await runTx(async (tx) => {
      await tx.dropPoolItem.deleteMany({
        where: { traitId: id },
      });

      await tx.trait.delete({
        where: { id },
      });

      if (tx.auditLog) {
        await recordAuditLog(tx, {
          actorId,
          actorIp: ip,
          userAgent,
          action: "TRAIT_DELETED",
          entityType: "Trait",
          entityId: id,
          oldValues: {
            name: existing.name,
            slug: existing.slug,
            category: existing.category,
            rarity: existing.rarity,
            imageUrl: existing.imageUrl,
          },
        });
      }
    });

    // Auto-sync active drop period pool in real-time
    await syncActiveDropPeriodPool(prisma);

    return Response.json({
      success: true,
      mode: "deleted",
      message: `Trait "${existing.name}" was permanently deleted.`,
    });
  } catch (err: unknown) {
    console.error("DELETE /api/admin/traits/[id] error:", err);
    return Response.json(
      { error: "SERVER_ERROR", message: "Failed to delete trait." },
      { status: 500 },
    );
  }
}
