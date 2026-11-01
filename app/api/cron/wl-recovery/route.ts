import { prisma } from "@/server/db";
import { processDurableRecoveryQueue } from "@/server/whitelist/durable-recovery";
import { timingSafeEqualString } from "@/lib/auth/timing-safe";

function verifyCronAuth(request: Request): Response | null {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (!expectedSecret) {
    console.error(
      "CRON /api/cron/wl-recovery rejected: CRON_SECRET is not configured on server.",
    );
    return Response.json(
      {
        error: "SERVER_MISCONFIGURED",
        message: "CRON_SECRET environment variable is not configured.",
      },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization")?.trim();
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return Response.json(
      {
        error: "UNAUTHORIZED",
        message: "Missing or invalid Authorization header. Expected Bearer token.",
      },
      { status: 401 },
    );
  }

  const token = authHeader.slice(7).trim();
  if (!timingSafeEqualString(token, expectedSecret)) {
    return Response.json(
      {
        error: "UNAUTHORIZED",
        message: "Invalid cron authorization token.",
      },
      { status: 401 },
    );
  }

  return null;
}

async function handleWlRecovery(request: Request): Promise<Response> {
  const authError = verifyCronAuth(request);
  if (authError) {
    return authError;
  }

  const now = new Date();
  try {
    const result = await processDurableRecoveryQueue(prisma, {
      now,
      maxBatchSize: 25,
      workerId: `cron-${now.getTime()}`,
    });

    return Response.json({
      success: true,
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      movedToDlq: result.movedToDlq,
      at: now.toISOString(),
    });
  } catch (error) {
    console.error("Error executing processDurableRecoveryQueue:", error);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message:
          "An unexpected error occurred while executing whitelist evaluation recovery.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  return handleWlRecovery(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleWlRecovery(request);
}

function methodNotAllowed(): Response {
  return Response.json(
    { error: "Method not allowed. Use GET or POST." },
    { status: 405, headers: { Allow: "GET, POST" } },
  );
}

export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
