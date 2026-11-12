import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import { listAdminTraits, AdminDropError } from "@/server/admin/drops";
import { syncActiveDropPeriodPool } from "@/server/drops/auto-replenish";
import { readLimitedBody } from "@/lib/auth/body-limit";
import { recordAuditLog } from "@/server/audit/audit";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * GET /api/admin/traits
 * List all active traits for drop pool stock configuration.
 * Auth: requireAdminSession("MANAGE_DROPS")
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminSession(prisma, "MANAGE_DROPS");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    console.error("GET /api/admin/traits admin auth error:", err);
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  try {
    const traits = await listAdminTraits(prisma, { includeInactive: true });
    return Response.json({ traits });
  } catch (err: unknown) {
    if (err instanceof AdminDropError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error("GET /api/admin/traits unexpected error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while listing traits.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
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
    const { name, slug: inputSlug, category, rarity, imageUrl, description, maxSupply } = body || {};

    if (!name || !category || !imageUrl) {
      return Response.json(
        { error: "VALIDATION_ERROR", message: "Name, category, and imageUrl are required." },
        { status: 400 },
      );
    }

    const slug =
      inputSlug?.trim() ||
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    const actorId = adminSession?.userId || (adminSession as any)?.user?.id || null;
    const ip = clientIp(request);
    const userAgent = request.headers.get("user-agent") ?? null;

    const runTx =
      typeof prisma.$transaction === "function"
        ? (cb: (tx: any) => Promise<any>) => prisma.$transaction(cb)
        : (cb: (tx: any) => Promise<any>) => cb(prisma);

    const trait = await runTx(async (tx) => {
      const saved = await tx.trait.upsert({
        where: { slug },
        create: {
          slug,
          name: name.trim(),
          category,
          rarity: rarity || "COMMON",
          imageUrl: imageUrl.trim(),
          description: description?.trim() || null,
          maxSupply: typeof maxSupply === "number" ? maxSupply : null,
          isActive: true,
        },
        update: {
          name: name.trim(),
          category,
          rarity: rarity || "COMMON",
          imageUrl: imageUrl.trim(),
          description: description?.trim() || null,
          maxSupply: typeof maxSupply === "number" ? maxSupply : null,
          isActive: true,
        },
      });

      if (tx.auditLog) {
        await recordAuditLog(tx, {
          actorId,
          actorIp: ip,
          userAgent,
          action: "TRAIT_CREATED",
          entityType: "Trait",
          entityId: saved.id,
          newValues: {
            slug: saved.slug,
            name: saved.name,
            category: saved.category,
            rarity: saved.rarity,
            imageUrl: saved.imageUrl,
            description: saved.description,
            maxSupply: saved.maxSupply,
            isActive: saved.isActive,
          },
        });
      }

      return saved;
    });

    // Auto-sync active drop period pool in real-time
    await syncActiveDropPeriodPool(prisma);

    return Response.json({ success: true, trait });
  } catch (err: unknown) {
    console.error("POST /api/admin/traits error:", err);
    return Response.json(
      { error: "SERVER_ERROR", message: "Failed to create or update trait." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request): Promise<Response> {
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
    const { id, name, category, rarity, imageUrl, description, maxSupply, isActive } = body || {};

    if (!id || typeof id !== "string") {
      return Response.json(
        { error: "VALIDATION_ERROR", message: "Trait ID is required." },
        { status: 400 },
      );
    }

    const existing = await prisma.trait.findUnique({
      where: { id },
    });

    if (!existing) {
      return Response.json(
        { error: "NOT_FOUND", message: `Trait with id "${id}" not found.` },
        { status: 404 },
      );
    }

    const VALID_CATEGORIES = ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"];
    const VALID_RARITIES = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"];

    if (category && !VALID_CATEGORIES.includes(category)) {
      return Response.json(
        { error: "VALIDATION_ERROR", message: `Invalid category: ${category}` },
        { status: 400 },
      );
    }

    if (rarity && !VALID_RARITIES.includes(rarity)) {
      return Response.json(
        { error: "VALIDATION_ERROR", message: `Invalid rarity: ${rarity}` },
        { status: 400 },
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
    console.error("PUT /api/admin/traits error:", err);
    return Response.json(
      { error: "SERVER_ERROR", message: "Failed to update trait." },
      { status: 500 },
    );
  }
}

export const PATCH = PUT;

export async function DELETE(request: Request): Promise<Response> {
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

  try {
    const { searchParams } = new URL(request.url);
    let traitId = searchParams.get("id");

    if (!traitId) {
      try {
        const bodyResult = await readLimitedBody(request);
        if (bodyResult.ok) {
          const body = JSON.parse(bodyResult.text);
          traitId = body?.id;
        }
      } catch {
        // no body provided
      }
    }

    if (!traitId || typeof traitId !== "string") {
      return Response.json(
        { error: "VALIDATION_ERROR", message: "Trait ID is required." },
        { status: 400 },
      );
    }

    const existing = await prisma.trait.findUnique({
      where: { id: traitId },
    });

    if (!existing) {
      return Response.json(
        { error: "NOT_FOUND", message: `Trait with id "${traitId}" not found.` },
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

    // Check if any users own this trait
    const inventoryCount = await prisma.inventoryItem.count({
      where: { traitId },
    });

    if (inventoryCount > 0) {
      // Deactivate instead of hard delete to preserve user inventory assets
      const deactivated = await runTx(async (tx) => {
        const res = await tx.trait.update({
          where: { id: traitId },
          data: { isActive: false },
        });

        if (tx.auditLog) {
          await recordAuditLog(tx, {
            actorId,
            actorIp: ip,
            userAgent,
            action: "TRAIT_UPDATED",
            entityType: "Trait",
            entityId: traitId,
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
        message: `Trait "${existing.name}" has ${inventoryCount} owned inventory item(s). It was deactivated (isActive: false) and removed from future drop cycles.`,
        trait: deactivated,
      });
    }

    // Check if any claims are attached to pool items of this trait
    const claimCount = await prisma.claim.count({
      where: { dropPoolItem: { traitId } },
    });

    if (claimCount > 0) {
      const deactivated = await runTx(async (tx) => {
        const res = await tx.trait.update({
          where: { id: traitId },
          data: { isActive: false },
        });

        if (tx.auditLog) {
          await recordAuditLog(tx, {
            actorId,
            actorIp: ip,
            userAgent,
            action: "TRAIT_UPDATED",
            entityType: "Trait",
            entityId: traitId,
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
        message: `Trait "${existing.name}" is referenced by ${claimCount} claim record(s). It was deactivated (isActive: false).`,
        trait: deactivated,
      });
    }

    // Clean up unreferenced drop pool items and delete trait inside transaction
    await runTx(async (tx) => {
      await tx.dropPoolItem.deleteMany({
        where: { traitId },
      });

      await tx.trait.delete({
        where: { id: traitId },
      });

      if (tx.auditLog) {
        await recordAuditLog(tx, {
          actorId,
          actorIp: ip,
          userAgent,
          action: "TRAIT_DELETED",
          entityType: "Trait",
          entityId: traitId,
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
    console.error("DELETE /api/admin/traits error:", err);
    return Response.json(
      { error: "SERVER_ERROR", message: "Failed to delete trait." },
      { status: 500 },
    );
  }
}

function methodNotAllowed(): Response {
  return Response.json(
    { error: "Method not allowed. Use GET, POST, PUT, or DELETE." },
    { status: 405, headers: { Allow: "GET, POST, PUT, DELETE" } },
  );
}

export const HEAD = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
