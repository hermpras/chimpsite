import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth/session";
import {
  getUtcCycleForTime,
  isWithinClaimWindow,
} from "@/server/drops/schedule";
import {
  calculateTransparentProbabilities,
  checkUserDropEligibility,
  type UserDropEligibilityResult,
} from "@/server/drops/claim";
import { ensureActiveCyclePeriod } from "@/server/drops/auto-replenish";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const now = new Date();

  // Find active drop
  let drop = await prisma.drop.findFirst({
    where: {
      status: "ACTIVE",
      startsAt: { lte: now },
    },
    include: {
      periods: {
        orderBy: { periodIndex: "asc" },
        include: {
          poolItems: {
            include: { trait: true },
          },
        },
      },
    },
  });

  // If drop is active and its endsAt has passed, auto-extend to perpetual 2099
  if (drop && drop.endsAt <= now) {
    try {
      drop = await prisma.drop.update({
        where: { id: drop.id },
        data: { endsAt: new Date("2099-12-31T23:59:59.999Z") },
        include: {
          periods: {
            orderBy: { periodIndex: "asc" },
            include: {
              poolItems: {
                include: { trait: true },
              },
            },
          },
        },
      });
    } catch {
      // Non-blocking fallback
    }
  }

  if (!drop) {
    // Check if there is a scheduled, paused, or ended drop explicitly set by admin
    const nonActiveDrop = await prisma.drop.findFirst({
      where: {
        status: { in: ["SCHEDULED", "PAUSED", "ENDED"] },
      },
      orderBy: { updatedAt: "desc" },
    });

    const defaultCycle = getUtcCycleForTime(now);
    return Response.json({
      active: false,
      message:
        nonActiveDrop?.status === "PAUSED"
          ? "Drop event is currently paused by administrator."
          : nonActiveDrop?.status === "SCHEDULED"
            ? "Drop event is scheduled."
            : "No drop event is currently active.",
      drop: nonActiveDrop
        ? {
            id: nonActiveDrop.id,
            slug: nonActiveDrop.slug,
            title: nonActiveDrop.title,
            status: nonActiveDrop.status,
          }
        : undefined,
      nextCycle: defaultCycle,
    });
  }

  // Find active period for now
  let activePeriod = drop.periods?.find((p) => now >= p.startsAt && now <= p.endsAt);

  // If no active period exists for this 2-hour cycle, or if existing period has no pool items,
  // auto-replenish from the default 250-stock template (unless explicitly marked PENDING_CONFIG)
  if (!activePeriod || (activePeriod.status !== "PENDING_CONFIG" && (!activePeriod.poolItems || activePeriod.poolItems.length === 0))) {
    try {
      activePeriod = await ensureActiveCyclePeriod(prisma, drop, now);
    } catch (err) {
      console.warn("Auto-replenish notice in GET /api/drops/current:", err);
    }
  }

  if (!activePeriod) {
    return Response.json({
      active: true,
      drop: { id: drop.id, slug: drop.slug, title: drop.title },
      periodActive: false,
      message: "Drop is active, but current period is between cycles.",
    });
  }

  const claimWindowActive =
    activePeriod.status === "ACTIVE" && isWithinClaimWindow(activePeriod.startsAt, now);
  const claimWindowEndsAt = new Date(activePeriod.startsAt.getTime() + 30 * 60 * 1000);
  const timeRemainingWindowMs = Math.max(0, claimWindowEndsAt.getTime() - now.getTime());

  const probabilities = calculateTransparentProbabilities(activePeriod.poolItems);
  const totalRemainingStock = activePeriod.poolItems.reduce(
    (acc, item) => acc + item.remainingStock,
    0,
  );
  const totalAllocatedStock = activePeriod.poolItems.reduce(
    (acc, item) => acc + item.allocatedStock,
    0,
  );

  let userHasClaimed = false;
  let userEligibility: UserDropEligibilityResult | null = null;
  try {
    const session = await authenticateRequest(prisma);
    if (session) {
      userEligibility = await checkUserDropEligibility(prisma, session.userId, now);
      if (activePeriod && prisma.claim?.findFirst) {
        const existingClaim = await prisma.claim.findFirst({
          where: {
            userId: session.userId,
            periodId: activePeriod.id,
          },
          select: { id: true },
        });
        userHasClaimed = Boolean(existingClaim);
      }
    }
  } catch {
    // Non-blocking optional check
  }

  let recentPulls: Array<{
    id: string;
    traitName: string;
    category: string;
    rarity: string;
    edition: number;
    imageUrl?: string;
    claimedBy: string;
    periodIndex: number;
    claimedAt: string;
  }> = [];

  try {
    if (prisma.claim?.findMany) {
      const claims = await prisma.claim.findMany({
        where: {
          dropId: drop.id,
          status: "SUCCESS",
        },
        orderBy: { claimedAt: "desc" },
        take: 8,
        include: {
          period: { select: { periodIndex: true } },
          inventoryItem: {
            include: { trait: true },
          },
          user: {
            select: {
              wallet: { select: { address: true } },
              xIdentity: { select: { username: true } },
            },
          },
        },
      });

      recentPulls = claims.map((c) => {
        const addr = c.user?.wallet?.address || "";
        const shortAddr =
          addr.length >= 10
            ? `${addr.slice(0, 6)}...${addr.slice(-4)}`
            : "Anonymous";
        const claimedBy = c.user?.xIdentity?.username
          ? `@${c.user.xIdentity.username}`
          : shortAddr;

        return {
          id: c.id,
          traitName: c.inventoryItem.trait.name,
          category: c.inventoryItem.trait.category,
          rarity: c.inventoryItem.trait.rarity,
          edition: c.inventoryItem.edition,
          imageUrl: c.inventoryItem.trait.imageUrl || undefined,
          claimedBy,
          periodIndex: c.period?.periodIndex ?? activePeriod.periodIndex,
          claimedAt: c.claimedAt.toISOString(),
        };
      });
    }
  } catch {
    // Non-blocking optional query
  }

  return Response.json({
    active: true,
    userHasClaimed,
    userEligibility: userEligibility ?? undefined,
    ...(recentPulls.length > 0 ? { recentPulls } : {}),
    drop: {
      id: drop.id,
      slug: drop.slug,
      title: drop.title,
      description: drop.description,
      status: drop.status,
      cycleDurationHours: (drop as any).cycleDurationHours ?? 2,
    },
    period: {
      id: activePeriod.id,
      periodIndex: activePeriod.periodIndex,
      startsAt: activePeriod.startsAt,
      endsAt: activePeriod.endsAt,
      status: activePeriod.status,
      isStockLocked: activePeriod.isStockLocked,
    },
    claimWindow: {
      isActive: claimWindowActive,
      startsAt: activePeriod.startsAt,
      endsAt: claimWindowEndsAt,
      timeRemainingMs: timeRemainingWindowMs,
    },
    stock: {
      totalAllocated: totalAllocatedStock,
      totalRemaining: totalRemainingStock,
      isExhausted: totalRemainingStock === 0,
      poolItems: probabilities,
    },
  });
}
