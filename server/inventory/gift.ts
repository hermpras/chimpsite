import type { PrismaClient } from "@prisma/client";

export class GiftError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = "GiftError";
    this.code = code;
    this.status = status;
  }
}

export interface SendGiftInput {
  senderId: string;
  receiverId: string;
  inventoryItemId: string;
  now?: Date;
}

export interface ResolveGiftInput {
  userId: string; // The user acting (receiver for accept/reject, sender for cancel)
  giftId: string;
  reason?: string;
  now?: Date;
}

export const GIFT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export function getUtcDayBounds(date: Date = new Date()): {
  startOfDay: Date;
  endOfDay: Date;
} {
  const startOfDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  return { startOfDay, endOfDay };
}

/**
 * Initiates a gift transaction for a duplicate trait copy.
 */
export async function sendGift(prisma: PrismaClient, input: SendGiftInput) {
  const now = input.now ?? new Date();

  if (input.senderId === input.receiverId) {
    throw new GiftError("CANNOT_GIFT_SELF", "You cannot send a gift to yourself.", 400);
  }

  return prisma.$transaction(async (tx) => {
    // 1. Check ban restrictions for sender and receiver
    const senderBan = await tx.banRecord.findFirst({
      where: {
        userId: input.senderId,
        isActive: true,
        scope: { in: ["FULL_SYSTEM", "GIFT_RESTRICTED"] },
      },
    });
    if (senderBan) {
      throw new GiftError(
        "SENDER_GIFT_RESTRICTED",
        "Your account is restricted from gifting.",
        403,
      );
    }

    const receiverBan = await tx.banRecord.findFirst({
      where: {
        userId: input.receiverId,
        isActive: true,
        scope: { in: ["FULL_SYSTEM", "GIFT_RESTRICTED"] },
      },
    });
    if (receiverBan) {
      throw new GiftError(
        "RECEIVER_GIFT_RESTRICTED",
        "The recipient is restricted from receiving gifts.",
        403,
      );
    }

    // 2. Invariant: 1 gift per wallet per UTC calendar day
    const { startOfDay, endOfDay } = getUtcDayBounds(now);
    const existingGiftToday = await tx.gift.findFirst({
      where: {
        senderId: input.senderId,
        createdAt: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
    });
    if (existingGiftToday) {
      throw new GiftError(
        "DAILY_GIFT_LIMIT_EXCEEDED",
        "Each wallet may send at most one gift per UTC day.",
        429,
      );
    }

    // 3. Verify item ownership and locked state
    const item = await tx.inventoryItem.findUnique({
      where: { id: input.inventoryItemId },
      include: { trait: true },
    });
    if (!item || item.ownerId !== input.senderId) {
      throw new GiftError("ITEM_NOT_OWNED", "Item not found in your inventory.", 404);
    }
    if (item.isLocked) {
      throw new GiftError(
        "ITEM_LOCKED",
        "This item is currently locked in another pending operation.",
        409,
      );
    }

    // 4. Invariant: Sender must own at least 2 copies (only extra duplicate copies may be sent)
    const ownedCopiesCount = await tx.inventoryItem.count({
      where: {
        ownerId: input.senderId,
        traitId: item.traitId,
      },
    });
    if (ownedCopiesCount < 2) {
      throw new GiftError(
        "DUPLICATE_ONLY_RULE",
        "Only extra duplicate copies may be gifted; you must retain at least one copy.",
        400,
      );
    }

    // 5. Invariant: Recipient must NOT already own this exact trait
    const recipientOwnedCount = await tx.inventoryItem.count({
      where: {
        ownerId: input.receiverId,
        traitId: item.traitId,
      },
    });
    if (recipientOwnedCount > 0) {
      throw new GiftError(
        "RECIPIENT_ALREADY_OWNS_TRAIT",
        "The recipient already owns this trait. Gifts cannot duplicate a trait already in recipient inventory.",
        409,
      );
    }

    // 6. Lock the inventory item
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: {
        isLocked: true,
        lockReason: "PENDING_GIFT",
      },
    });

    // 7. Create Gift record (expires in 24 hours)
    const expiresAt = new Date(now.getTime() + GIFT_EXPIRY_MS);
    const gift = await tx.gift.create({
      data: {
        senderId: input.senderId,
        receiverId: input.receiverId,
        inventoryItemId: item.id,
        status: "PENDING",
        expiresAt,
        createdAt: now,
      },
      include: {
        inventoryItem: { include: { trait: true } },
        sender: { include: { wallet: true } },
        receiver: { include: { wallet: true } },
      },
    });

    return gift;
  });
}

/**
 * Accepts a pending gift. Transference occurs atomically.
 */
export async function acceptGift(prisma: PrismaClient, input: ResolveGiftInput) {
  const now = input.now ?? new Date();

  const result = await prisma.$transaction(async (tx) => {
    const gift = await tx.gift.findUnique({
      where: { id: input.giftId },
      include: { inventoryItem: true },
    });

    if (!gift) {
      throw new GiftError("GIFT_NOT_FOUND", "Gift not found.", 404);
    }
    if (gift.receiverId !== input.userId) {
      throw new GiftError(
        "UNAUTHORIZED",
        "Only the intended recipient can accept this gift.",
        403,
      );
    }
    if (gift.status !== "PENDING") {
      throw new GiftError(
        "GIFT_NOT_PENDING",
        `Gift is already ${gift.status.toLowerCase()}.`,
        409,
      );
    }

    // Expiry check
    if (now > gift.expiresAt) {
      const expireUpdate = await tx.gift.updateMany({
        where: { id: gift.id, status: "PENDING" },
        data: { status: "EXPIRED", decidedAt: now },
      });
      if (expireUpdate.count === 0) {
        throw new GiftError("GIFT_NOT_PENDING", "Gift is no longer pending.", 409);
      }
      await tx.inventoryItem.update({
        where: { id: gift.inventoryItemId },
        data: { isLocked: false, lockReason: null },
      });
      return { outcome: "EXPIRED" as const };
    }

    // Re-verify recipient does not already own the trait
    const recipientOwnedCount = await tx.inventoryItem.count({
      where: {
        ownerId: input.userId,
        traitId: gift.inventoryItem.traitId,
      },
    });
    if (recipientOwnedCount > 0) {
      const rejectUpdate = await tx.gift.updateMany({
        where: { id: gift.id, status: "PENDING" },
        data: {
          status: "REJECTED",
          rejectionReason: "Recipient acquired trait prior to gift acceptance.",
          decidedAt: now,
        },
      });
      if (rejectUpdate.count === 0) {
        throw new GiftError("GIFT_NOT_PENDING", "Gift is no longer pending.", 409);
      }
      // Unlock item and return to sender
      await tx.inventoryItem.update({
        where: { id: gift.inventoryItemId },
        data: { isLocked: false, lockReason: null },
      });
      return { outcome: "RECIPIENT_ALREADY_OWNS_TRAIT" as const };
    }

    // Atomically transition gift state from PENDING to ACCEPTED
    const updateGiftResult = await tx.gift.updateMany({
      where: {
        id: gift.id,
        status: "PENDING",
      },
      data: {
        status: "ACCEPTED",
        decidedAt: now,
      },
    });

    if (updateGiftResult.count === 0) {
      throw new GiftError("GIFT_NOT_PENDING", "Gift is no longer pending.", 409);
    }

    // Transfer item ownership to recipient, update provenance to GIFT, and unlock
    const updatedItem = await tx.inventoryItem.update({
      where: { id: gift.inventoryItemId },
      data: {
        ownerId: input.userId,
        acquiredVia: "GIFT",
        isLocked: false,
        lockReason: null,
      },
      include: { trait: true },
    });

    const updatedGift = await tx.gift.findUnique({
      where: { id: gift.id },
    });

    return {
      outcome: "SUCCESS" as const,
      gift: updatedGift!,
      item: updatedItem,
    };
  });

  if (result.outcome === "EXPIRED") {
    throw new GiftError("GIFT_EXPIRED", "This gift has expired after 24 hours.", 410);
  }

  if (result.outcome === "RECIPIENT_ALREADY_OWNS_TRAIT") {
    throw new GiftError(
      "RECIPIENT_ALREADY_OWNS_TRAIT",
      "You already own this trait. The gift cannot be accepted.",
      409,
    );
  }

  return { gift: result.gift, item: result.item };
}

/**
 * Rejects or cancels a pending gift and unlocks the sender's item.
 */
export async function rejectOrCancelGift(
  prisma: PrismaClient,
  input: ResolveGiftInput & { action: "REJECT" | "CANCEL" },
) {
  const now = input.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    const gift = await tx.gift.findUnique({
      where: { id: input.giftId },
    });

    if (!gift) {
      throw new GiftError("GIFT_NOT_FOUND", "Gift not found.", 404);
    }

    if (input.action === "REJECT" && gift.receiverId !== input.userId) {
      throw new GiftError(
        "UNAUTHORIZED",
        "Only the recipient can reject this gift.",
        403,
      );
    }

    if (input.action === "CANCEL" && gift.senderId !== input.userId) {
      throw new GiftError("UNAUTHORIZED", "Only the sender can cancel this gift.", 403);
    }

    if (gift.status !== "PENDING") {
      throw new GiftError(
        "GIFT_NOT_PENDING",
        `Gift is already ${gift.status.toLowerCase()}.`,
        409,
      );
    }

    const status = input.action === "REJECT" ? "REJECTED" : "CANCELLED";
    const updateGiftResult = await tx.gift.updateMany({
      where: {
        id: gift.id,
        status: "PENDING",
      },
      data: {
        status,
        decidedAt: now,
        rejectionReason:
          input.action === "REJECT"
            ? (input.reason ?? "Rejected by recipient")
            : undefined,
        cancellationReason:
          input.action === "CANCEL" ? (input.reason ?? "Cancelled by sender") : undefined,
      },
    });

    if (updateGiftResult.count === 0) {
      throw new GiftError("GIFT_NOT_PENDING", "Gift is no longer pending.", 409);
    }

    // Unlock the item only after winning the conditional transition from PENDING
    await tx.inventoryItem.update({
      where: { id: gift.inventoryItemId },
      data: { isLocked: false, lockReason: null },
    });

    const updatedGift = await tx.gift.findUnique({
      where: { id: gift.id },
    });

    return updatedGift!;
  });
}

/**
 * Sweeps expired pending gifts (older than 24h) and unlocks items.
 */
export async function sweepExpiredGifts(prisma: PrismaClient, now: Date = new Date()) {
  const expiredGifts = await prisma.gift.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: now },
    },
  });

  const processed: string[] = [];

  for (const gift of expiredGifts) {
    try {
      await prisma.$transaction(async (tx) => {
        const updateResult = await tx.gift.updateMany({
          where: { id: gift.id, status: "PENDING" },
          data: { status: "EXPIRED", decidedAt: now },
        });
        if (updateResult.count > 0) {
          await tx.inventoryItem.update({
            where: { id: gift.inventoryItemId },
            data: { isLocked: false, lockReason: null },
          });
          processed.push(gift.id);
        }
      });
    } catch (err) {
      console.error(`Failed to sweep expired gift ${gift.id}:`, err);
    }
  }

  return { processedCount: processed.length, giftIds: processed };
}
