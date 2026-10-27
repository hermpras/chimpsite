import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";

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
  try {
    const body = await request.json();
    const { name, category, rarity, imageUrl, description, maxSupply, isActive } = body;

    const existing = await prisma.trait.findUnique({
      where: { id },
    });

    if (!existing) {
      return Response.json(
        { error: "NOT_FOUND", message: `Trait "${id}" not found.` },
        { status: 404 },
      );
    }

    const updated = await prisma.trait.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(rarity !== undefined ? { rarity } : {}),
        ...(imageUrl !== undefined ? { imageUrl: imageUrl.trim() } : {}),
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
        ...(maxSupply !== undefined
          ? { maxSupply: typeof maxSupply === "number" ? maxSupply : null }
          : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      },
    });

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

    const inventoryCount = await prisma.inventoryItem.count({
      where: { traitId: id },
    });

    if (inventoryCount > 0) {
      const deactivated = await prisma.trait.update({
        where: { id },
        data: { isActive: false },
      });

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
      const deactivated = await prisma.trait.update({
        where: { id },
        data: { isActive: false },
      });

      return Response.json({
        success: true,
        mode: "deactivated",
        message: `Trait "${existing.name}" has claim history. It was deactivated.`,
        trait: deactivated,
      });
    }

    await prisma.dropPoolItem.deleteMany({
      where: { traitId: id },
    });

    await prisma.trait.delete({
      where: { id },
    });

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
