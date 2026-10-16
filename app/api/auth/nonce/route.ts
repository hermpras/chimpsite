/**
 * POST /api/auth/nonce — issue a one-time SIWE nonce.
 *
 * Optional JSON body: { address?: string } — when a normalized wallet address
 * is provided, the nonce is bound to it and /api/auth/verify accepts it
 * only for that address. Omit the body (or the field) for an unbound nonce.
 *
 * Response: { nonce, expiresAt } (expiresAt as ISO 8601). Never returns secrets.
 *
 * The Prisma client is imported dynamically so that loading this module
 * (e.g. in unit tests for the 405 handlers) never touches the database.
 * Uses the global Response (no next/server import) for the same reason.
 */
import { issueNonce } from "@/server/auth/nonce";
import { normalizeAddress } from "@/lib/auth/address";
import { readLimitedBody } from "@/lib/auth/body-limit";
import {
  checkRateLimit,
  NONCE_RATE_LIMIT_MAX,
  NONCE_RATE_LIMIT_WINDOW_MS,
} from "@/lib/auth/rate-limit";

/** Best-effort client IP for rate limiting. */
function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim() || "unknown";
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(request: Request): Promise<Response> {
  const limit = checkRateLimit(
    `siwe-nonce:${clientIp(request)}`,
    NONCE_RATE_LIMIT_MAX,
    NONCE_RATE_LIMIT_WINDOW_MS,
  );
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  // Optional nonce->address binding. A missing/unparseable JSON body means
  // an unbound nonce (backward compatible). A present-but-invalid address
  // is a 400 — validated here, before the database is touched.
  // Oversized or unreadable bodies are rejected before parsing.
  let boundAddress: string | undefined;
  const limited = await readLimitedBody(request);
  if (!limited.ok) {
    const status = limited.reason === "too_large" ? 413 : 400;
    return Response.json(
      { error: status === 413 ? "Request too large." : "Invalid request." },
      { status },
    );
  }
  try {
    const body: unknown = JSON.parse(limited.text);
    const raw = (body as { address?: unknown } | null)?.address;
    if (raw !== undefined) {
      if (typeof raw !== "string") {
        return Response.json({ error: "Invalid request." }, { status: 400 });
      }
      try {
        boundAddress = normalizeAddress(raw);
      } catch {
        return Response.json({ error: "Invalid wallet address." }, { status: 400 });
      }
    }
  } catch {
    // No usable JSON body — issue an unbound nonce.
  }

  try {
    const { prisma } = await import("@/server/db");
    const { nonce, expiresAt } = await issueNonce(
      prisma,
      boundAddress ? { address: boundAddress } : undefined,
    );
    return Response.json({ nonce, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    // Server-side log only — never leak DB/driver details to the client.
    console.error("POST /api/auth/nonce failed:", err);
    return Response.json({ error: "Failed to issue nonce." }, { status: 500 });
  }
}

function methodNotAllowed(): Response {
  return Response.json(
    { error: "Method not allowed. Use POST." },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
