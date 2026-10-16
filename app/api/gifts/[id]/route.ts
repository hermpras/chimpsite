import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth/session";
import { acceptGift, rejectOrCancelGift, GiftError } from "@/server/inventory/gift";
import { readLimitedBody } from "@/lib/auth/body-limit";

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await authenticateRequest(prisma);
  if (!session) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id: giftId } = await props.params;
  if (!giftId) {
    return Response.json({ error: "MISSING_ID" }, { status: 400 });
  }

  const bodyResult = await readLimitedBody(request);
  if (!bodyResult.ok) {
    const status = bodyResult.reason === "too_large" ? 413 : 400;
    return Response.json({ error: bodyResult.reason }, { status });
  }

  let body: { action?: "ACCEPT" | "REJECT" | "CANCEL"; reason?: string };
  try {
    body = JSON.parse(bodyResult.text);
  } catch {
    return Response.json({ error: "MALFORMED_JSON" }, { status: 400 });
  }

  if (!body.action || !["ACCEPT", "REJECT", "CANCEL"].includes(body.action)) {
    return Response.json(
      { error: "INVALID_ACTION", message: "Action must be ACCEPT, REJECT, or CANCEL." },
      { status: 400 },
    );
  }

  try {
    if (body.action === "ACCEPT") {
      const result = await acceptGift(prisma, {
        userId: session.userId,
        giftId,
      });
      return Response.json({ success: true, result });
    } else {
      const result = await rejectOrCancelGift(prisma, {
        userId: session.userId,
        giftId,
        action: body.action,
        reason: body.reason,
      });
      return Response.json({ success: true, result });
    }
  } catch (err: unknown) {
    if (err instanceof GiftError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error(`POST /api/gifts/${giftId} error:`, err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while resolving gift.",
      },
      { status: 500 },
    );
  }
}
