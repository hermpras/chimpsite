import { prisma } from "@/server/db";
import { getUserInventory, InventoryError } from "@/server/inventory/items";
import { authenticateRequest } from "@/server/auth/session";

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const addressParam = url.searchParams.get("address");

    let address = addressParam;
    if (!address || !address.trim()) {
      // Fallback to authenticated session if address query param is omitted
      const session = await authenticateRequest(prisma).catch(() => null);
      if (session?.address) {
        address = session.address;
      }
    }

    if (!address || !address.trim()) {
      return Response.json(
        {
          error: "MISSING_ADDRESS",
          message: "Wallet address query parameter is required.",
        },
        { status: 400 },
      );
    }

    const inventory = await getUserInventory(prisma, address);
    return Response.json(inventory);
  } catch (err) {
    if (err instanceof InventoryError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }

    console.error("GET /api/user/inventory error:", err);
    return Response.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to retrieve user inventory.",
      },
      { status: 500 },
    );
  }
}
