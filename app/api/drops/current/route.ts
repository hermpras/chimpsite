import { createHash } from "node:crypto";
import { prisma } from "@/server/db";
import {
  getUtcCycleForTime,
  isWithinClaimWindow,
} from "@/server/drops/schedule";
import { calculateTransparentProbabilities } from "@/server/drops/claim";
import { ensureActiveCyclePeriod } from "@/server/drops/auto-replenish";
import {
  acquireDistributedLock,
  releaseDistributedLock,
  getDropReplenishLockKey,
} from "@/lib/redis/lock";
import {
  getRecentDropPullsFromRedis,
  seedRecentDropPullsToRedis,
  type RecentDropPull,
} from "@/lib/redis/recent-pulls";

export const dynamic = "force-dynamic";

const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10",
};

function generateWeakEtag(seed: string): string {
  const hash = createHash("sha256").update(seed).digest("hex").slice(0, 16);
  return `W/"${hash}"`;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const now = new Date();

  // Find active drop (scoped lean query without unbounded historical periods)
  let drop = await prisma.drop.findFirst({
    where: {
      status: "ACTIVE",
      startsAt: { lte: now },
    },
  });

  // If drop is active and its endsAt has passed, auto-extend to perpetual 2099
  if (drop && drop.endsAt <= now) {
    try {
      drop = await prisma.drop.update({
        where: { id: drop.id },
        data: { endsAt: new Date("2099-12-31T23:59:59.999Z") },
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
    const noDropEtag = generateWeakEtag(
      `no-drop:${nonActiveDrop?.id ?? "none"}:${nonActiveDrop?.status ?? "none"}:${defaultCycle.startsAt}`
    );

    if (request.headers.get("if-none-match") === noDropEtag) {
      return new Response(null, {
        status: 304,
        headers: { ...PUBLIC_CACHE_HEADERS, ETag: noDropEtag },
      });
    }

    return Response.json(
      {
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
      },
      { headers: { ...PUBLIC_CACHE_HEADERS, ETag: noDropEtag } },
    );
  }

  // Find active period scoped strictly to current time window (startsAt <= now <= endsAt)
  let activePeriod = prisma.dropPeriod?.findFirst
    ? await prisma.dropPeriod.findFirst({
        where: {
          dropId: drop.id,
          startsAt: { lte: now },
          endsAt: { gte: now },
        },
        orderBy: { startsAt: "desc" },
        include: {
          poolItems: {
            include: { trait: true },
          },
        },
      })
    : null;

  // Fallback for tests providing mock drop.periods
  if (!activePeriod && (drop as any).periods?.length) {
    activePeriod = (drop as any).periods.find(
      (p: any) => now >= new Date(p.startsAt) && now <= new Date(p.endsAt),
    );
  }

  const cycleDurationHours = (drop as any).cycleDurationHours ?? 2;
  const cycleDurationMs = cycleDurationHours * 60 * 60 * 1000;
  const calculatedCycle = getUtcCycleForTime(now, cycleDurationHours, drop.startsAt);

  // If no active period exists for this 2-hour cycle, or if existing period has no pool items,
  // auto-replenish protected by Redis distributed lock (Task P0.3)
  if (
    !activePeriod ||
    (activePeriod.status !== "PENDING_CONFIG" &&
      (!activePeriod.poolItems || activePeriod.poolItems.length === 0))
  ) {
    const lockKey = getDropReplenishLockKey(drop.id, calculatedCycle.startsAt.getTime());
    const lockResult = await acquireDistributedLock(lockKey, 15);

    if (lockResult.status === "ACQUIRED") {
      try {
        // Double-check PostgreSQL to verify if another instance completed replenishment
        const doubleCheckPeriod = prisma.dropPeriod?.findFirst
          ? await prisma.dropPeriod.findFirst({
              where: {
                dropId: drop.id,
                startsAt: { lte: now },
                endsAt: { gte: now },
              },
              orderBy: { startsAt: "desc" },
              include: {
                poolItems: {
                  include: { trait: true },
                },
              },
            })
          : null;

        if (
          doubleCheckPeriod &&
          doubleCheckPeriod.status === "ACTIVE" &&
          doubleCheckPeriod.poolItems &&
          doubleCheckPeriod.poolItems.length > 0
        ) {
          activePeriod = doubleCheckPeriod;
        } else {
          activePeriod = await ensureActiveCyclePeriod(prisma, drop, now);
        }
      } catch (err) {
        console.warn("Auto-replenish notice in GET /api/drops/current (leader):", err);
      } finally {
        await releaseDistributedLock(lockKey, lockResult.token);
      }
    } else if (lockResult.status === "CONTENTION") {
      // Follower: another instance is currently running replenishment.
      // Wait up to 300ms, then re-check PostgreSQL for the newly committed period.
      await new Promise((resolve) => setTimeout(resolve, 300));

      const followerCheckPeriod = prisma.dropPeriod?.findFirst
        ? await prisma.dropPeriod.findFirst({
            where: {
              dropId: drop.id,
              startsAt: { lte: now },
              endsAt: { gte: now },
            },
            orderBy: { startsAt: "desc" },
            include: {
              poolItems: {
                include: { trait: true },
              },
            },
          })
        : null;

      if (
        followerCheckPeriod &&
        followerCheckPeriod.status === "ACTIVE" &&
        followerCheckPeriod.poolItems &&
        followerCheckPeriod.poolItems.length > 0
      ) {
        activePeriod = followerCheckPeriod;
      } else {
        // Leader hasn't finished yet: return standby response with startsAt = calculatedCycle.startsAt
        // so frontend timer triggers auto-refresh after 1s rather than counting down 2 hours
        return Response.json(
          {
            active: true,
            periodActive: false,
            message: "Drop cycle initializing. Please standby.",
            drop: {
              id: drop.id,
              slug: drop.slug,
              title: drop.title,
              description: drop.description,
              status: drop.status,
              cycleDurationHours,
            },
            nextCycle: {
              startsAt: calculatedCycle.startsAt.toISOString(),
              endsAt: calculatedCycle.endsAt.toISOString(),
            },
          },
          { headers: { "Cache-Control": "no-store, max-age=0" } },
        );
      }
    } else {
      // REDIS_FAILURE (timeout, network outage, auth error):
      // Fallback directly to PostgreSQL existing path; PostgreSQL advisory transaction lock protects DB integrity
      try {
        activePeriod = await ensureActiveCyclePeriod(prisma, drop, now);
      } catch (err) {
        console.warn("Auto-replenish notice in GET /api/drops/current (fallback):", err);
      }
    }
  }

  // If no active period exists for current time window (e.g. between cycles),
  // query next upcoming period strictly starting after current time to expose countdown.
  // Note: Q4 (Recent Claims) is NOT queried on this path.
  if (!activePeriod) {
    const nextPeriod = prisma.dropPeriod?.findFirst
      ? await prisma.dropPeriod.findFirst({
          where: {
            dropId: drop.id,
            startsAt: { gt: now },
            status: { not: "CANCELLED" as const },
          },
          orderBy: { startsAt: "asc" },
          select: {
            id: true,
            periodIndex: true,
            startsAt: true,
            endsAt: true,
            status: true,
          },
        })
      : null;

    let resolvedNextPeriod = nextPeriod;
    if (!resolvedNextPeriod && (drop as any).periods?.length) {
      resolvedNextPeriod =
        (drop as any).periods
          .filter((p: any) => {
            if (p.status === "CANCELLED") return false;
            return new Date(p.startsAt).getTime() > now.getTime();
          })
          .sort(
            (a: any, b: any) =>
              new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
          )[0] ?? null;
    }

    const nextStartsAt = resolvedNextPeriod
      ? new Date(resolvedNextPeriod.startsAt)
      : now < calculatedCycle.startsAt
        ? calculatedCycle.startsAt
        : calculatedCycle.endsAt;
    const nextEndsAt = resolvedNextPeriod
      ? new Date(resolvedNextPeriod.endsAt)
      : new Date(nextStartsAt.getTime() + cycleDurationMs);

    const betweenEtag = generateWeakEtag(
      `between:${drop.id}:${nextStartsAt.getTime()}:${resolvedNextPeriod?.id ?? "none"}`
    );

    if (request.headers.get("if-none-match") === betweenEtag) {
      return new Response(null, {
        status: 304,
        headers: { ...PUBLIC_CACHE_HEADERS, ETag: betweenEtag },
      });
    }

    return Response.json(
      {
        active: true,
        drop: {
          id: drop.id,
          slug: drop.slug,
          title: drop.title,
          description: drop.description,
          status: drop.status,
          cycleDurationHours,
        },
        periodActive: false,
        message: "Drop is active, but current period is between cycles.",
        nextCycle: {
          startsAt: nextStartsAt.toISOString(),
          endsAt: nextEndsAt.toISOString(),
        },
        ...(resolvedNextPeriod
          ? {
              nextPeriod: {
                id: resolvedNextPeriod.id,
                periodIndex: resolvedNextPeriod.periodIndex,
                startsAt: new Date(resolvedNextPeriod.startsAt).toISOString(),
                endsAt: new Date(resolvedNextPeriod.endsAt).toISOString(),
                status: resolvedNextPeriod.status,
              },
            }
          : {}),
      },
      { headers: { ...PUBLIC_CACHE_HEADERS, ETag: betweenEtag } },
    );
  }

  // Active period exists: evaluate boundaries & stock aggregations
  const activePeriodStartsAt = new Date(activePeriod.startsAt);
  const activePeriodEndsAt = new Date(activePeriod.endsAt);

  const claimWindowActive =
    activePeriod.status === "ACTIVE" && isWithinClaimWindow(activePeriodStartsAt, now);
  const claimWindowEndsAt = new Date(activePeriodStartsAt.getTime() + 30 * 60 * 1000);
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

  // Deferred Parallelization (Stage 7C.7G):
  // Run Q3 (Next Period) and Q4 (Recent Claims) concurrently via Promise.all.
  // Q4 is fully error-isolated: errors or timeouts return [] and never fail the endpoint.
  const [nextPeriodResult, claimsResult] = await Promise.all([
    // Q3: Next chronological period starting at or after activePeriodEndsAt
    prisma.dropPeriod?.findFirst
      ? prisma.dropPeriod.findFirst({
          where: {
            dropId: drop.id,
            startsAt: { gte: activePeriodEndsAt },
            status: { not: "CANCELLED" as const },
          },
          orderBy: { startsAt: "asc" },
          select: {
            id: true,
            periodIndex: true,
            startsAt: true,
            endsAt: true,
            status: true,
          },
        })
      : Promise.resolve(null),

    // Q4: Recent claims with Upstash Redis List caching & PostgreSQL fallback (non-blocking optional query)
    (async (): Promise<RecentDropPull[]> => {
      try {
        const cached = await getRecentDropPullsFromRedis(drop.id, 8);
        if (cached && cached.length > 0) {
          return cached;
        }
      } catch {
        // Fall back to database query below
      }

      try {
        if (!prisma.claim?.findMany) return [];
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

        const pulls: RecentDropPull[] = (claims || []).map((c) => {
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
            claimedAt:
              c.claimedAt instanceof Date
                ? c.claimedAt.toISOString()
                : new Date(c.claimedAt).toISOString(),
          };
        });

        if (pulls.length > 0) {
          void seedRecentDropPullsToRedis(drop.id, pulls).catch(() => {});
        }

        return pulls;
      } catch {
        // Non-blocking optional query: isolated failure defaults to empty array
        return [];
      }
    })(),
  ]);

  let nextPeriod = nextPeriodResult;

  // Fallback for tests providing mock drop.periods
  if (!nextPeriod && (drop as any).periods?.length) {
    const minStart = activePeriodEndsAt;
    nextPeriod =
      (drop as any).periods
        .filter((p: any) => {
          if (p.status === "CANCELLED") return false;
          const pStart = new Date(p.startsAt).getTime();
          const target = minStart.getTime();
          return pStart >= target;
        })
        .sort(
          (a: any, b: any) =>
            new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
        )[0] ?? null;
  }

  const recentPulls = claimsResult || [];

  const nextCycleStartsAt = nextPeriod
    ? new Date(nextPeriod.startsAt)
    : activePeriodEndsAt;
  const nextCycleEndsAt = nextPeriod
    ? new Date(nextPeriod.endsAt)
    : new Date(activePeriodEndsAt.getTime() + cycleDurationMs);

  const activeEtag = generateWeakEtag(
    `${drop.id}:${activePeriod.id}:${activePeriod.periodIndex}:${activePeriod.status}:${totalRemainingStock}:${claimWindowActive}:${recentPulls[0]?.id ?? "none"}:${nextPeriod?.id ?? "none"}`
  );

  if (request.headers.get("if-none-match") === activeEtag) {
    return new Response(null, {
      status: 304,
      headers: {
        ...PUBLIC_CACHE_HEADERS,
        ETag: activeEtag,
      },
    });
  }

  return Response.json(
    {
      active: true,
      ...(recentPulls.length > 0 ? { recentPulls } : {}),
      drop: {
        id: drop.id,
        slug: drop.slug,
        title: drop.title,
        description: drop.description,
        status: drop.status,
        cycleDurationHours,
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
      nextCycle: {
        startsAt: nextCycleStartsAt.toISOString(),
        endsAt: nextCycleEndsAt.toISOString(),
      },
      ...(nextPeriod
        ? {
            nextPeriod: {
              id: nextPeriod.id,
              periodIndex: nextPeriod.periodIndex,
              startsAt: new Date(nextPeriod.startsAt).toISOString(),
              endsAt: new Date(nextPeriod.endsAt).toISOString(),
              status: nextPeriod.status,
            },
          }
        : {}),
      stock: {
        totalAllocated: totalAllocatedStock,
        totalRemaining: totalRemainingStock,
        isExhausted: totalRemainingStock === 0,
        poolItems: probabilities,
      },
    },
    {
      headers: {
        ...PUBLIC_CACHE_HEADERS,
        ETag: activeEtag,
      },
    },
  );
}
