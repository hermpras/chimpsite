import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth/session";
import { normalizeAddress } from "@/lib/auth/address";
import { normalizeXAvatarUrl } from "@/lib/social/x-avatar";

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await authenticateRequest(prisma);
    if (!session) {
      return Response.json({ error: "UNAUTHORIZED", message: "Authentication required." }, { status: 401 });
    }

    const url = new URL(request.url);
    const rawQuery = url.searchParams.get("username") || url.searchParams.get("query") || url.searchParams.get("q");
    const traitId = url.searchParams.get("traitId") || undefined;

    if (!rawQuery || !rawQuery.trim()) {
      return Response.json(
        { error: "INVALID_INPUT", message: "Username or wallet address query is required." },
        { status: 400 },
      );
    }

    const query = rawQuery.trim();
    const cleanUsername = query.replace(/^@/, "").trim();
    const now = new Date();

    // Try finding by X username first, or by wallet address if formatted as 0x...
    let targetUser = null;

    if (cleanUsername.startsWith("0x") && cleanUsername.length === 42) {
      let normalized: string;
      try {
        normalized = normalizeAddress(cleanUsername);
      } catch {
        normalized = cleanUsername.toLowerCase();
      }

      const walletRecord = await prisma.walletIdentity.findUnique({
        where: { address: normalized },
        include: {
          user: {
            include: {
              wallet: true,
              xIdentity: true,
              wlSlots: {
                where: { status: { in: ["ALLOCATED", "CONFIRMED"] } },
              },
              banRecords: {
                where: {
                  isActive: true,
                  scope: { in: ["FULL_SYSTEM", "GIFT_RESTRICTED"] },
                  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                },
              },
            },
          },
        },
      });

      if (walletRecord?.user) {
        targetUser = walletRecord.user;
      }
    }

    // If not found by address or query was an X username, search XIdentity
    if (!targetUser) {
      const xRecord = await prisma.xIdentity.findFirst({
        where: {
          username: {
            equals: cleanUsername,
            mode: "insensitive",
          },
        },
        include: {
          user: {
            include: {
              wallet: true,
              xIdentity: true,
              wlSlots: {
                where: { status: { in: ["ALLOCATED", "CONFIRMED"] } },
              },
              banRecords: {
                where: {
                  isActive: true,
                  scope: { in: ["FULL_SYSTEM", "GIFT_RESTRICTED"] },
                  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                },
              },
            },
          },
        },
      });

      if (xRecord?.user) {
        targetUser = xRecord.user;
      }
    }

    if (!targetUser) {
      return Response.json(
        {
          error: "RECIPIENT_NOT_FOUND",
          message: `No ChimpHood account found linked to @${cleanUsername}. Recipient must be a registered ChimpHood user with a connected X account.`,
        },
        { status: 404 },
      );
    }

    const isSelf =
      targetUser.id === session.userId ||
      (session.address && targetUser.wallet?.address?.toLowerCase() === session.address.toLowerCase());

    const isBanned = Boolean(targetUser.isBanned) || ((targetUser as any).banRecords?.length ?? 0) > 0;
    const isWlAllocated = ((targetUser as any).wlSlots?.length ?? 0) > 0;

    let alreadyOwnsTrait = false;
    if (traitId) {
      const count = await prisma.inventoryItem.count({
        where: {
          ownerId: targetUser.id,
          traitId,
        },
      });
      alreadyOwnsTrait = count > 0;
    }

    const canReceive = !isSelf && !isBanned && !isWlAllocated && !alreadyOwnsTrait && Boolean(targetUser.wallet?.address);

    return Response.json({
      success: true,
      recipient: {
        userId: targetUser.id,
        address: targetUser.wallet?.address || null,
        xUsername: targetUser.xIdentity?.username || null,
        xName: targetUser.xIdentity?.name || null,
        profileImageUrl: normalizeXAvatarUrl(targetUser.xIdentity?.profileImageUrl) || null,
        isSelf,
        isBanned,
        isWlAllocated,
        alreadyOwnsTrait,
        canReceive,
      },
    });
  } catch (err: unknown) {
    console.error("[RecipientLookup] Unexpected error:", err);
    return Response.json(
      {
        error: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : "Failed to lookup recipient.",
      },
      { status: 500 },
    );
  }
}
