import type { PrismaClient } from "@prisma/client";
import { isWithinClaimWindow } from "./schedule";
import { recordAuditLog } from "../audit/audit";

export const SYBIL_CLUSTER_IP_THRESHOLD = 5;

export interface SybilClusterParams {
  userId: string;
  dropId: string;
  periodId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  now?: Date;
}

/**
 * DEC-012: Sybil cluster detection on drop claims.
 * Triggers when >= 5 distinct wallets/users claim from the same IP within a single drop cycle.
 * Strictly records AbuseFlag for manual admin investigation; NEVER auto-bans based on IP.
 * Calculations are strictly scoped to `periodId` (single drop cycle), never accumulated across cycles.
 */
export async function checkAndFlagSybilCluster(
  tx: any,
  params: SybilClusterParams,
) {
  const ip = params.ipAddress?.trim();
  if (!ip || ip.toLowerCase() === "unknown") {
    return [];
  }

  // Safe fallback if tx doesn't support claim.findMany or abuseFlag (e.g. lightweight test mocks)
  if (
    typeof tx.claim?.findMany !== "function" ||
    !tx.abuseFlag ||
    typeof tx.abuseFlag.create !== "function"
  ) {
    return [];
  }

  const now = params.now ?? new Date();

  // Find all claims within this specific drop cycle from this IP
  const claimsWithIp = await tx.claim.findMany({
    where: {
      periodId: params.periodId,
      ipAddress: ip,
      status: "SUCCESS",
    },
    select: { userId: true },
  });

  const distinctUsers = new Set<string>(claimsWithIp.map((c: any) => c.userId));
  distinctUsers.add(params.userId);

  if (distinctUsers.size < SYBIL_CLUSTER_IP_THRESHOLD) {
    return [];
  }

  const clusterUserIds = Array.from(distinctUsers);
  const createdFlags: any[] = [];

  for (const clusterUserId of clusterUserIds) {
    let existingFlag: any = null;
    if (typeof tx.abuseFlag.findFirst === "function") {
      existingFlag = await tx.abuseFlag.findFirst({
        where: {
          userId: clusterUserId,
          flagType: "SYBIL_WALLET_CLUSTER",
          status: "OPEN",
        },
      });
    }

    if (!existingFlag) {
      const abuseFlag = await tx.abuseFlag.create({
        data: {
          userId: clusterUserId,
          flagType: "SYBIL_WALLET_CLUSTER",
          severity: "HIGH",
          status: "OPEN",
          details: {
            reason: `Sybil cluster IP threshold reached (>= ${SYBIL_CLUSTER_IP_THRESHOLD} distinct wallets in drop period)`,
            ipAddress: ip,
            periodId: params.periodId,
            dropId: params.dropId,
            clusterSize: distinctUsers.size,
            clusterUserIds,
            triggeringUserId: params.userId,
          },
          createdAt: now,
        },
      });

      createdFlags.push(abuseFlag);

      await recordAuditLog(tx, {
        actorId: params.userId,
        actorIp: ip,
        userAgent: params.userAgent ?? null,
        action: "ABUSE_FLAG_CREATED",
        entityType: "AbuseFlag",
        entityId: abuseFlag.id,
        newValues: {
          userId: clusterUserId,
          flagType: "SYBIL_WALLET_CLUSTER",
          severity: "HIGH",
          status: "OPEN",
          details: abuseFlag.details,
        },
        metadata: {
          reason: "Sybil cluster IP threshold reached",
          ipAddress: ip,
          periodId: params.periodId,
          distinctWalletsCount: distinctUsers.size,
        },
      });
    }
  }

  return createdFlags;
}

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
  imageUrl?: string;
  remainingStock: number;
  allocatedStock?: number;
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
    allocatedStock?: number;
    weight: number;
    trait?: { name: string; category: string; rarity: string; imageUrl?: string };
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
    ...(item.trait?.imageUrl ? { imageUrl: item.trait.imageUrl } : {}),
    remainingStock: item.remainingStock,
    ...(typeof item.allocatedStock === "number"
      ? { allocatedStock: item.allocatedStock }
      : {}),
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
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        });
        if (activeBan && (!activeBan.expiresAt || activeBan.expiresAt > now)) {
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

        // Re-verify period status to prevent race conditions with concurrent emergency close
        const activePeriodCheck = await tx.dropPeriod.findUnique({
          where: { id: input.periodId },
          select: { status: true },
        });
        if (!activePeriodCheck || activePeriodCheck.status !== "ACTIVE") {
          throw new DropClaimError(
            "PERIOD_CANCELLED",
            "The drop period is closed or has been cancelled by an administrator.",
            410,
          );
        }

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

        // 11. DEC-012: Sybil Cluster IP Detection & AbuseFlag Recording
        // Detects >= 5 distinct wallets per IP per drop cycle; creates AbuseFlag; strictly NO auto-ban.
        const abuseFlags = await checkAndFlagSybilCluster(tx, {
          userId: input.userId,
          dropId: input.dropId,
          periodId: input.periodId,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          now,
        });

        await recordAuditLog(tx, {
          actorId: input.userId,
          actorIp: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          action: "DROP_CLAIM_MINTED",
          entityType: "Claim",
          entityId: claim.id,
          newValues: {
            dropId: input.dropId,
            periodId: input.periodId,
            dropPoolItemId: winningItem.id,
            inventoryItemId: inventoryItem.id,
            traitId: winningItem.traitId,
            edition: nextEdition,
          },
        });

        const probabilities = calculateTransparentProbabilities(poolItems);

        return {
          claim,
          inventoryItem,
          trait: inventoryItem.trait,
          probabilities,
          abuseFlags,
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

export {
  emergencyCloseDropPeriod,
  emergencyCloseDropWindow,
  type EmergencyCloseDropInput,
  type EmergencyCloseDropResult,
} from "./emergency-close";
