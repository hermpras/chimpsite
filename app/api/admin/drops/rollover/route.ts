import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import { ensureActiveCyclePeriod } from "@/server/drops/auto-replenish";
import { getUtcCycleForTime } from "@/server/drops/schedule";
import { readLimitedBody } from "@/lib/auth/body-limit";
import {
  acquireDistributedLock,
  releaseDistributedLock,
  getDropReplenishLockKey,
} from "@/lib/redis/lock";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireAdminSession(prisma, "MANAGE_DROPS");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  const bodyResult = await readLimitedBody(request);
  if (!bodyResult.ok) {
    const status = bodyResult.reason === "too_large" ? 413 : 400;
    return Response.json({ error: bodyResult.reason }, { status });
  }

  let body: { dropId?: string };
  try {
    body = JSON.parse(bodyResult.text);
  } catch {
    return Response.json({ error: "MALFORMED_JSON" }, { status: 400 });
  }

  if (!body.dropId || typeof body.dropId !== "string") {
    return Response.json(
      { error: "INVALID_INPUT", message: "dropId is required." },
      { status: 400 },
    );
  }

  const drop = await prisma.drop.findUnique({
    where: { id: body.dropId },
  });

  if (!drop) {
    return Response.json(
      { error: "NOT_FOUND", message: "Drop event not found." },
      { status: 404 },
    );
  }

  const now = new Date();
  const cycleDurationHours = drop.cycleDurationHours ?? 2;
  const cycle = getUtcCycleForTime(now, cycleDurationHours, drop.startsAt);
  const lockKey = getDropReplenishLockKey(drop.id, cycle.startsAt.getTime());
  const lockResult = await acquireDistributedLock(lockKey, 15);
  const lockToken = lockResult.status === "ACQUIRED" ? lockResult.token : undefined;

  try {
    const period = await ensureActiveCyclePeriod(prisma, drop, now);

    return Response.json({
      success: true,
      message: `Cycle rollover successfully triggered. Active period is #${period.periodIndex}.`,
      period: {
        id: period.id,
        periodIndex: period.periodIndex,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
        status: period.status,
        totalStock: period.poolItems.reduce(
          (acc, item) => acc + item.remainingStock,
          0,
        ),
      },
    });
  } catch (err: unknown) {
    console.error("POST /api/admin/drops/rollover error:", err);
    return Response.json(
      {
        error: "ROLLOVER_FAILED",
        message: (err as Error).message || "Failed to execute cycle rollover.",
      },
      { status: 500 },
    );
  } finally {
    if (lockToken) {
      await releaseDistributedLock(lockKey, lockToken).catch(() => {});
    }
  }
}

export async function GET(): Promise<Response> {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST" },
  });
}
