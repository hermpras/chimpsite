import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth/session";
import { claimDrop, DropClaimError } from "@/server/drops/claim";
import { readLimitedBody } from "@/lib/auth/body-limit";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(request: Request): Promise<Response> {
  const session = await authenticateRequest(prisma);
  if (!session) {
    return Response.json(
      { error: "UNAUTHORIZED", message: "Sign-in required to claim drops." },
      { status: 401 },
    );
  }

  const bodyResult = await readLimitedBody(request);
  if (!bodyResult.ok) {
    const status = bodyResult.reason === "too_large" ? 413 : 400;
    return Response.json({ error: bodyResult.reason }, { status });
  }

  let body: { dropId?: string; periodId?: string };
  try {
    body = JSON.parse(bodyResult.text);
  } catch {
    return Response.json({ error: "MALFORMED_JSON" }, { status: 400 });
  }

  if (
    !body.dropId ||
    typeof body.dropId !== "string" ||
    !body.periodId ||
    typeof body.periodId !== "string"
  ) {
    return Response.json(
      { error: "INVALID_INPUT", message: "dropId and periodId are required." },
      { status: 400 },
    );
  }

  try {
    const result = await claimDrop(prisma, {
      userId: session.userId,
      dropId: body.dropId,
      periodId: body.periodId,
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return Response.json({
      success: true,
      claimId: result.claim.id,
      claimedAt: result.claim.claimedAt,
      inventoryItem: {
        id: result.inventoryItem.id,
        edition: result.inventoryItem.edition,
        trait: result.trait,
      },
    });
  } catch (err: unknown) {
    if (err instanceof DropClaimError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error("POST /api/drops/claim unexpected error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while processing claim.",
      },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<Response> {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST" },
  });
}
