import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth/session";
import {
  getUtcCycleForTime,
  isWithinClaimWindow,
} from "@/server/drops/schedule";
import { calculateTransparentProbabilities } from "@/server/drops/claim";
import { ensureActiveCyclePeriod } from "@/server/drops/auto-replenish";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const now = new Date();

  // Find active drop (or scheduled)
  const drop = await prisma.drop.findFirst({
    where: {
      status: { in: ["ACTIVE", "SCHEDULED"] },
      startsAt: { lte: now },
      endsAt: { gte: now },
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

  if (!drop) {
    const defaultCycle = getUtcCycleForTime(now);
    return Response.json({
      active: false,
      message: "No drop event is currently active.",
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
  try {
    const session = await authenticateRequest(prisma);
    if (session && activePeriod && prisma.claim?.findFirst) {
      const existingClaim = await prisma.claim.findFirst({
        where: {
          userId: session.userId,
          periodId: activePeriod.id,
        },
        select: { id: true },
      });
      userHasClaimed = Boolean(existingClaim);
    }
  } catch {
    // Non-blocking optional check
  }

  return Response.json({
    active: true,
    userHasClaimed,
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
