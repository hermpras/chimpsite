import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth/session";
import { sendGift, GiftError } from "@/server/inventory/gift";
import { normalizeAddress } from "@/lib/auth/address";
import { readLimitedBody } from "@/lib/auth/body-limit";

export async function GET(): Promise<Response> {
  const session = await authenticateRequest(prisma);
  if (!session) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const [sentGifts, receivedGifts] = await Promise.all([
    prisma.gift.findMany({
      where: { senderId: session.userId },
      orderBy: { createdAt: "desc" },
      include: {
        inventoryItem: { include: { trait: true } },
        receiver: {
          select: {
            id: true,
            wallet: {
              select: {
                address: true,
              },
            },
          },
        },
      },
    }),
    prisma.gift.findMany({
      where: { receiverId: session.userId },
      orderBy: { createdAt: "desc" },
      include: {
        inventoryItem: { include: { trait: true } },
        sender: {
          select: {
            id: true,
            wallet: {
              select: {
                address: true,
              },
            },
          },
        },
      },
    }),
  ]);

  return Response.json({ sentGifts, receivedGifts });
}

export async function POST(request: Request): Promise<Response> {
  const session = await authenticateRequest(prisma);
  if (!session) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const bodyResult = await readLimitedBody(request);
  if (!bodyResult.ok) {
    const status = bodyResult.reason === "too_large" ? 413 : 400;
    return Response.json({ error: bodyResult.reason }, { status });
  }

  let body: { receiverAddress?: string; inventoryItemId?: string };
  try {
    body = JSON.parse(bodyResult.text);
  } catch {
    return Response.json({ error: "MALFORMED_JSON" }, { status: 400 });
  }

  if (!body.receiverAddress || !body.inventoryItemId) {
    return Response.json(
      {
        error: "INVALID_INPUT",
        message: "receiverAddress and inventoryItemId are required.",
      },
      { status: 400 },
    );
  }

  let normalizedReceiverAddress: string;
  try {
    normalizedReceiverAddress = normalizeAddress(body.receiverAddress);
  } catch {
    return Response.json(
      {
        error: "INVALID_ADDRESS",
        message: "Recipient address is not a valid EVM address.",
      },
      { status: 400 },
    );
  }

  // Find recipient user
  const receiverWallet = await prisma.walletIdentity.findUnique({
    where: { address: normalizedReceiverAddress },
  });
  if (!receiverWallet) {
    return Response.json(
      {
        error: "RECEIVER_NOT_FOUND",
        message: "No ChimpHood account found for the specified recipient address.",
      },
      { status: 404 },
    );
  }

  try {
    const gift = await sendGift(prisma, {
      senderId: session.userId,
      receiverId: receiverWallet.userId,
      inventoryItemId: body.inventoryItemId,
    });

    return Response.json({ success: true, gift });
  } catch (err: unknown) {
    if (err instanceof GiftError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error("POST /api/gifts error:", err);
    return Response.json(
      { error: "SERVER_ERROR", message: "Failed to initiate gift." },
      { status: 500 },
    );
  }
}
