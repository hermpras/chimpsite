import { prisma } from "@/server/db";
import { equipInventoryItem, InventoryError } from "@/server/inventory/items";
import { authenticateRequest } from "@/server/auth/session";

export async function POST(request: Request): Promise<Response> {
  const session = await authenticateRequest(prisma).catch(() => null);
  if (!session?.userId) {
    return Response.json(
      { error: "UNAUTHENTICATED", message: "Authentication required to equip items." },
      { status: 401 },
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const itemId = body?.itemId;

    if (!itemId || typeof itemId !== "string" || !itemId.trim()) {
      return Response.json(
        { error: "MISSING_ITEM_ID", message: "A valid itemId string is required." },
        { status: 400 },
      );
    }

    const result = await equipInventoryItem(prisma, session.userId, itemId.trim());
    return Response.json(result);
  } catch (err) {
    if (err instanceof InventoryError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }

    console.error("POST /api/user/inventory/equip error:", err);
    return Response.json(
      { error: "INTERNAL_SERVER_ERROR", message: "Failed to equip inventory item." },
      { status: 500 },
    );
  }
}
