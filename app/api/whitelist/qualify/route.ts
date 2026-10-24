import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth/session";
import {
  evaluateUserQualification,
  WhitelistError,
} from "@/server/whitelist/qualification";
import { readLimitedBody } from "@/lib/auth/body-limit";
import {
  checkRateLimit,
  WHITELIST_QUALIFY_RATE_LIMIT_MAX,
  WHITELIST_QUALIFY_RATE_LIMIT_WINDOW_MS,
} from "@/lib/auth/rate-limit";

export async function POST(request: Request): Promise<Response> {
  const session = await authenticateRequest(prisma);
  if (!session) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const rateLimitKey = `whitelist-qualify:${session.address || session.userId}`;
    const limit = await checkRateLimit(
      rateLimitKey,
      WHITELIST_QUALIFY_RATE_LIMIT_MAX,
      WHITELIST_QUALIFY_RATE_LIMIT_WINDOW_MS,
    );
    if (!limit.allowed) {
      return Response.json(
        {
          error: "RATE_LIMITED",
          message: "Too many qualification requests. Please try again later.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        },
      );
    }
  } catch (err: unknown) {
    console.error("POST /api/whitelist/qualify rate limit failure:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "Rate limit service temporarily unavailable.",
      },
      { status: 500 },
    );
  }

  const bodyResult = await readLimitedBody(request);
  let programId: string | undefined;

  if (bodyResult.ok && bodyResult.text) {
    try {
      const parsed = JSON.parse(bodyResult.text);
      programId = parsed.programId;
    } catch {
      // Body is optional; fallback to active program
    }
  }

  let program = programId
    ? await prisma.wLProgram.findUnique({ where: { id: programId } })
    : await prisma.wLProgram.findFirst({
        where: { status: "OPEN" },
        orderBy: { createdAt: "desc" },
      });

  if (!program || program.status !== "OPEN") {
    return Response.json(
      { error: "NO_ACTIVE_PROGRAM", message: "No active Whitelist program found." },
      { status: 404 },
    );
  }

  try {
    const result = await evaluateUserQualification(prisma, {
      userId: session.userId,
      programId: program.id,
    });

    return Response.json({ success: true, programId: program.id, result });
  } catch (err: unknown) {
    if (err instanceof WhitelistError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error("POST /api/whitelist/qualify error:", err);
    return Response.json(
      { error: "SERVER_ERROR", message: "Failed to evaluate qualification." },
      { status: 500 },
    );
  }
}
