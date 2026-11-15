import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth/session";
import { checkUserDropEligibility } from "@/server/drops/claim";

export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
};

export async function GET(): Promise<Response> {
  try {
    const session = await authenticateRequest(prisma).catch(() => null);
    if (!session) {
      return Response.json(
        { authenticated: false },
        { headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    const now = new Date();

    // Check for active drop
    const drop = await prisma.drop.findFirst({
      where: {
        status: "ACTIVE",
        startsAt: { lte: now },
      },
      select: { id: true },
    });

    if (!drop) {
      return Response.json(
        {
          authenticated: true,
          userHasClaimed: false,
          userEligibility: null,
        },
        { headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    // Find active period scoped to current time window
    const activePeriod = prisma.dropPeriod?.findFirst
      ? await prisma.dropPeriod.findFirst({
          where: {
            dropId: drop.id,
            startsAt: { lte: now },
            endsAt: { gte: now },
          },
          select: { id: true },
        })
      : null;

    // Check user eligibility
    const userEligibility = await checkUserDropEligibility(
      prisma,
      session.userId,
      now,
    );

    // Check if user has already claimed in this active period
    let userHasClaimed = false;
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

    return Response.json(
      {
        authenticated: true,
        userHasClaimed,
        userEligibility,
      },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (err: unknown) {
    console.error("GET /api/drops/user-status error:", err);
    return Response.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to retrieve user drop status.",
      },
      {
        status: 500,
        headers: PRIVATE_NO_STORE_HEADERS,
      },
    );
  }
}
