import { prisma } from "@/server/db";
import {
  reconcileQueueSlots,
  reconcileAllOpenPrograms,
  WhitelistError,
} from "@/server/whitelist/qualification";
import { timingSafeEqualString } from "@/lib/auth/timing-safe";
import { readLimitedBody } from "@/lib/auth/body-limit";

function verifyCronAuth(request: Request): Response | null {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (!expectedSecret) {
    console.error(
      "CRON /api/cron/reconcile-queue rejected: CRON_SECRET is not configured on server.",
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

async function handleCronReconcile(request: Request): Promise<Response> {
  const authError = verifyCronAuth(request);
  if (authError) {
    return authError;
  }

  let programId: string | undefined;

  // 1. Check URL query parameters (supported on both GET and POST)
  try {
    const url = new URL(request.url);
    const queryProgramId = url.searchParams.get("programId");
    if (queryProgramId !== null) {
      if (queryProgramId.trim().length === 0) {
        return Response.json(
          {
            error: "INVALID_INPUT",
            message: "programId cannot be empty if specified.",
          },
          { status: 400 },
        );
      }
      programId = queryProgramId.trim();
    }
  } catch {
    // If URL parsing fails, ignore and proceed
  }

  // 2. For POST requests, inspect optional JSON request body if present
  if (request.method === "POST" && !programId) {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const bodyResult = await readLimitedBody(request);
      if (!bodyResult.ok) {
        const status = bodyResult.reason === "too_large" ? 413 : 400;
        return Response.json({ error: bodyResult.reason }, { status });
      }

      const text = bodyResult.text.trim();
      if (text.length > 0) {
        let body: Record<string, unknown>;
        try {
          body = JSON.parse(text);
        } catch {
          return Response.json(
            { error: "MALFORMED_JSON", message: "Request body must be valid JSON." },
            { status: 400 },
          );
        }

        if (typeof body !== "object" || body === null || Array.isArray(body)) {
          return Response.json(
            { error: "INVALID_INPUT", message: "Request body must be a JSON object." },
            { status: 400 },
          );
        }

        if (body.programId !== undefined) {
          if (typeof body.programId !== "string" || body.programId.trim().length === 0) {
            return Response.json(
              {
                error: "INVALID_INPUT",
                message: "programId must be a non-empty string.",
              },
              { status: 400 },
            );
          }
          programId = body.programId.trim();
        }
      }
    }
  }

  const now = new Date();

  // If specific programId is requested
  if (programId) {
    try {
      const result = await reconcileQueueSlots(prisma, programId, now);
      return Response.json({
        success: true,
        programId,
        slotsFilled: result.slotsFilled,
        openSlotsRemaining: result.openSlotsRemaining,
        totalSlotsFilled: result.slotsFilled,
        processedPrograms: 1,
        programs: [
          {
            programId,
            slotsFilled: result.slotsFilled,
            openSlotsRemaining: result.openSlotsRemaining,
          },
        ],
        at: now.toISOString(),
      });
    } catch (err: unknown) {
      if (err instanceof WhitelistError) {
        return Response.json(
          { error: err.code, message: err.message },
          { status: err.status },
        );
      }
      console.error(`Error reconciling program ${programId}:`, err);
      return Response.json(
        {
          error: "SERVER_ERROR",
          message: "An unexpected error occurred while reconciling whitelist queue.",
        },
        { status: 500 },
      );
    }
  }

  // Default: reconcile all open programs
  try {
    const result = await reconcileAllOpenPrograms(prisma, now);
    return Response.json({
      success: true,
      processedPrograms: result.processedPrograms,
      totalSlotsFilled: result.totalSlotsFilled,
      slotsFilled: result.totalSlotsFilled,
      programs: result.results,
      at: now.toISOString(),
    });
  } catch (err: unknown) {
    console.error("Error executing reconcileAllOpenPrograms:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while reconciling whitelist queues.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  return handleCronReconcile(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleCronReconcile(request);
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
