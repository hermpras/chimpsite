import type { PrismaClient } from "@prisma/client";
import { isWithinClaimWindow } from "./schedule";

export class DropClaimError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = "DropClaimError";
    this.code = code;
    this.status = status;
  }
}

export const MAX_EDITION_RETRIES = 3;

export function isEditionCollision(err: unknown): boolean {
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  ) {
    const pErr = err as {
      meta?: { target?: unknown; modelName?: string };
      message?: string;
    };
    if (pErr.meta?.modelName === "InventoryItem") {
      return true;
    }
    if (pErr.meta?.target) {
      const targetStr = Array.isArray(pErr.meta.target)
        ? pErr.meta.target.join(",")
        : String(pErr.meta.target);
      if (targetStr.includes("userId")) {
        return false;
      }
      if (
        targetStr.includes("edition") ||
        targetStr.includes("traitId") ||
        targetStr.includes("InventoryItem")
      ) {
        return true;
      }
    }
    const message = pErr.message || "";
    if (message.includes("userId") || message.includes("periodId")) {
      return false;
    }
    if (message.includes("edition") || message.includes("InventoryItem")) {
      return true;
    }
    return !message.includes("Claim");
  }
  return false;
}

export function isClaimDuplicateViolation(err: unknown): boolean {
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  ) {
    const pErr = err as {
      meta?: { target?: unknown; modelName?: string };
      message?: string;
    };
    if (pErr.meta?.modelName === "Claim") {
      return true;
    }
    if (pErr.meta?.target) {
      const targetStr = Array.isArray(pErr.meta.target)
        ? pErr.meta.target.join(",")
        : String(pErr.meta.target);
      return targetStr.includes("userId") || targetStr.includes("periodId");
    }
    const message = pErr.message || "";
    return (
      message.includes("userId") ||
      message.includes("periodId") ||
      message.includes("Claim")
    );
  }
  return false;
}

export interface ClaimDropInput {
  userId: string;
  dropId: string;
  periodId: string;
  now?: Date;
  ipAddress?: string;
  userAgent?: string;
  /** Injected RNG between 0 and 1 for deterministic testing */
  randomSeed?: () => number;
  /** Bounded max retries on edition collision (defaults to MAX_EDITION_RETRIES) */
  maxRetries?: number;
}

export interface PoolItemProbability {
  poolItemId: string;
  traitId: string;
  traitName: string;
  category: string;
  rarity: string;
  remainingStock: number;
  weight: number;
  probabilityPercent: number;
}

/**
 * Calculates transparent percentage probability for each item in the pool with remaining stock.
 */
export function calculateTransparentProbabilities(
  items: Array<{
    id: string;
    traitId: string;
    remainingStock: number;
    weight: number;
    trait?: { name: string; category: string; rarity: string };
  }>,
): PoolItemProbability[] {
  const eligible = items.filter((item) => item.remainingStock > 0);
  const totalWeight = eligible.reduce((acc, item) => acc + item.weight, 0);

  if (totalWeight <= 0) {
    return [];
  }

  return eligible.map((item) => ({
    poolItemId: item.id,
    traitId: item.traitId,
    traitName: item.trait?.name ?? "Unknown Trait",
    category: item.trait?.category ?? "UNKNOWN",
    rarity: item.trait?.rarity ?? "COMMON",
    remainingStock: item.remainingStock,
    weight: item.weight,
    probabilityPercent: Number(((item.weight / totalWeight) * 100).toFixed(2)),
  }));
}

/**
 * Weighted roll selection based on item weights.
 */
export function selectWinningPoolItem<
  T extends { id: string; remainingStock: number; weight: number },
>(items: T[], rng: () => number = Math.random): T | null {
  const eligible = items.filter((item) => item.remainingStock > 0);
  const totalWeight = eligible.reduce((acc, item) => acc + item.weight, 0);
  if (totalWeight <= 0 || eligible.length === 0) {
    return null;
  }

  const roll = rng() * totalWeight;
  let cumulative = 0;
  for (const item of eligible) {
    cumulative += item.weight;
    if (roll < cumulative) {
      return item;
    }
  }

  return eligible[eligible.length - 1];
}

/**
 * Executes a drop claim atomically with strict invariant enforcement.
 * Safely handles concurrency collisions on unique trait edition numbers via bounded retries.
 */
export async function claimDrop(prisma: PrismaClient, input: ClaimDropInput) {
  const maxRetries = input.maxRetries ?? MAX_EDITION_RETRIES;
  const rng = input.randomSeed ?? Math.random;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const now = input.now ?? new Date();

    try {
      return await prisma.$transaction(async (tx) => {
        // 1. Check user ban records
        const activeBan = await tx.banRecord.findFirst({
          where: {
            userId: input.userId,
            isActive: true,
            scope: { in: ["FULL_SYSTEM", "CLAIM_RESTRICTED"] },
          },
        });
        if (activeBan) {
          throw new DropClaimError(
            "USER_BANNED_FROM_CLAIMS",
            "Your account is restricted from claiming drops.",
            403,
          );
        }

        // 2. Invariant: Users holding an active/confirmed WL slot CANNOT claim drops
        const existingWlSlot = await tx.wLSlot.findFirst({
          where: {
            userId: input.userId,
            status: { in: ["ALLOCATED", "CONFIRMED"] },
          },
        });
        if (existingWlSlot) {
          throw new DropClaimError(
            "WL_HOLDER_CLAIM_PROHIBITED",
            "Users holding an allocated Whitelist slot cannot claim drops.",
            403,
          );
        }

        // 3. Verify Drop and DropPeriod
        const period = await tx.dropPeriod.findUnique({
          where: { id: input.periodId },
          include: { drop: true },
        });

        if (!period || period.dropId !== input.dropId) {
          throw new DropClaimError("PERIOD_NOT_FOUND", "Drop period was not found.", 404);
        }

        // Drop lifecycle enforcement: Drop must be explicitly ACTIVE
        if (period.drop.status !== "ACTIVE") {
          if (period.drop.status === "PAUSED" || period.drop.status === "ENDED") {
            throw new DropClaimError(
              "PERIOD_CANCELLED",
              "The drop period is closed or has been cancelled by an administrator.",
              410,
            );
          }
          throw new DropClaimError(
            "DROP_NOT_ACTIVE",
            `Drop is not active (current status: ${period.drop.status}).`,
            400,
          );
        }

        // Period lifecycle enforcement: Period must be ACTIVE
        if (period.status !== "ACTIVE") {
          throw new DropClaimError(
            "PERIOD_CANCELLED",
            "The drop period is closed or has been cancelled by an administrator.",
            410,
          );
        }

        // Claim window validation (30-minute window from period.startsAt)
        if (!isWithinClaimWindow(period.startsAt, now)) {
          throw new DropClaimError(
            "CLAIM_WINDOW_CLOSED",
            "The 30-minute claim window for this period is not currently active.",
            400,
          );
        }

        // 4. Invariant: Strictly 1 claim per user per drop per period
        const existingClaim = await tx.claim.findUnique({
          where: {
            userId_dropId_periodId: {
              userId: input.userId,
              dropId: input.dropId,
              periodId: input.periodId,
            },
          },
        });
        if (existingClaim) {
          throw new DropClaimError(
            "ALREADY_CLAIMED_IN_PERIOD",
            "You have already claimed an item in this drop period.",
            409,
          );
        }

        // 5. Fetch pool items with positive remaining stock
        const poolItems = await tx.dropPoolItem.findMany({
          where: {
            periodId: input.periodId,
            remainingStock: { gt: 0 },
          },
          include: { trait: true },
        });

        if (poolItems.length === 0) {
          throw new DropClaimError(
            "STOCK_EXHAUSTED",
            "All stock for this drop period is currently exhausted. Please wait for the next period.",
            409,
          );
        }

        // 6. Transparent probability calculation and selection
        const winningItem = selectWinningPoolItem(poolItems, rng);
        if (!winningItem) {
          throw new DropClaimError("STOCK_EXHAUSTED", "Stock exhausted.", 409);
        }

        // 7. Atomic stock decrement (conditional update)
        const updateResult = await tx.dropPoolItem.updateMany({
          where: {
            id: winningItem.id,
            remainingStock: { gt: 0 },
          },
          data: {
            remainingStock: { decrement: 1 },
            claimedStock: { increment: 1 },
          },
        });

        if (updateResult.count === 0) {
          throw new DropClaimError(
            "STOCK_RACE_EXHAUSTED",
            "Stock for the selected trait was claimed concurrently. Please try again.",
            409,
          );
        }

        // 8. Determine next edition serial number for this trait
        const latestEdition = await tx.inventoryItem.findFirst({
          where: { traitId: winningItem.traitId },
          orderBy: { edition: "desc" },
          select: { edition: true },
        });
        const nextEdition = (latestEdition?.edition ?? 0) + 1;

        // 9. Create InventoryItem
        const inventoryItem = await tx.inventoryItem.create({
          data: {
            traitId: winningItem.traitId,
            ownerId: input.userId,
            edition: nextEdition,
            acquiredVia: "CLAIM",
          },
          include: { trait: true },
        });

        // 10. Record Claim
        const claim = await tx.claim.create({
          data: {
            userId: input.userId,
            dropId: input.dropId,
            periodId: input.periodId,
            dropPoolItemId: winningItem.id,
            inventoryItemId: inventoryItem.id,
            status: "SUCCESS",
            claimedAt: now,
            ipAddress: input.ipAddress ?? null,
            userAgent: input.userAgent ?? null,
          },
        });

        const probabilities = calculateTransparentProbabilities(poolItems);

        return {
          claim,
          inventoryItem,
          trait: inventoryItem.trait,
          probabilities,
        };
      });
    } catch (err: unknown) {
      if (isEditionCollision(err)) {
        if (attempt < maxRetries) {
          continue;
        }
        throw new DropClaimError(
          "EDITION_COLLISION_RETRYABLE",
          "Concurrent claim collision on edition allocation. Please retry your claim.",
          409,
        );
      }
      if (isClaimDuplicateViolation(err)) {
        throw new DropClaimError(
          "ALREADY_CLAIMED_IN_PERIOD",
          "You have already claimed an item in this drop period.",
          409,
        );
      }
      throw err;
    }
  }

  throw new DropClaimError(
    "EDITION_COLLISION_RETRYABLE",
    "Concurrent claim collision on edition allocation. Please retry your claim.",
    409,
  );
}
