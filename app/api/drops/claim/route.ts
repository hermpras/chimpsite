import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth/session";
import { claimDrop, DropClaimError } from "@/server/drops/claim";
import { safeTriggerAvatarUpdate } from "@/server/inventory/avatar-renderer";
import { readLimitedBody } from "@/lib/auth/body-limit";
import {
  checkRateLimit,
  DROPS_CLAIM_RATE_LIMIT_MAX,
  DROPS_CLAIM_RATE_LIMIT_WINDOW_MS,
  DROPS_CLAIM_IP_RATE_LIMIT_MAX,
  DROPS_CLAIM_IP_RATE_LIMIT_WINDOW_MS,
  isValidClientIp,
} from "@/lib/auth/rate-limit";

function clientIp(request: Request): string {
  // In serverless deployments (such as Vercel), x-real-ip is set/overwritten by the
  // edge reverse proxy from the actual TCP socket and cannot be spoofed by clients.
  // Prefer x-real-ip when present and valid.
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp && isValidClientIp(realIp)) {
    return realIp;
  }

  // Fallback to x-forwarded-for (used in multi-hop proxies and test harnesses)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const candidate = forwarded.split(",")[0].trim();
    if (isValidClientIp(candidate)) {
      return candidate;
    }
  }

  return "unknown";
}

export async function POST(request: Request): Promise<Response> {
  const session = await authenticateRequest(prisma);
  if (!session) {
    return Response.json(
      { error: "UNAUTHORIZED", message: "Sign-in required to claim drops." },
      { status: 401 },
    );
  }

  const ip = clientIp(request);

  // Rate Limiting (Dual-layer: Wallet/Session + IP per DEC-012)
  try {
    // 1. Per-wallet / session rate limit
    const walletKey = `drops-claim:${session.address || session.userId}`;
    const walletLimit = await checkRateLimit(
      walletKey,
      DROPS_CLAIM_RATE_LIMIT_MAX,
      DROPS_CLAIM_RATE_LIMIT_WINDOW_MS,
    );
    if (!walletLimit.allowed) {
      return Response.json(
        {
          error: "RATE_LIMITED",
          message: "Too many claim attempts. Please try again later.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(walletLimit.retryAfterSeconds) },
        },
      );
    }

    // 2. DEC-012: Per-IP rate limit (strictly applied only when a valid IP is present)
    if (isValidClientIp(ip)) {
      const ipKey = `drops-claim-ip:${ip}`;
      const ipLimit = await checkRateLimit(
        ipKey,
        DROPS_CLAIM_IP_RATE_LIMIT_MAX,
        DROPS_CLAIM_IP_RATE_LIMIT_WINDOW_MS,
      );
      if (!ipLimit.allowed) {
        return Response.json(
          {
            error: "RATE_LIMITED",
            message: "Too many claim attempts. Please try again later.",
          },
          {
            status: 429,
            headers: { "Retry-After": String(ipLimit.retryAfterSeconds) },
          },
        );
      }
    }
  } catch (err: unknown) {
    console.error("POST /api/drops/claim rate limit failure:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "Rate limit service temporarily unavailable.",
      },
      { status: 500 },
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

    // Task 3-C: Trigger background avatar re-render on inventory acquisition
    safeTriggerAvatarUpdate(prisma, session.userId);

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
