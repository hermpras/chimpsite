/**
 * POST /api/auth/verify — verify a SIWE message + signature and establish a session.
 *
 * Request (JSON): { message: string, signature: string }
 *   - `message` is the EIP-4361 SIWE message the wallet signed.
 *   - `signature` is the hex-encoded EIP-191 personal_sign signature.
 *
 * Success: 200 { address, userId } and the `chimphood_session` HttpOnly
 * cookie is set. The database stores only the SHA-256 hash of the token.
 *
 * Failures (generic messages only — no internal details leak):
 *   - 400 malformed request body
 *   - 401 malformed / expired / replayed / address-mismatched nonce,
 *     invalid signature, wrong domain/URI, disallowed chain
 *   - 403 banned account
 *   - 429 rate limited (per-IP fixed window)
 *   - 500 server error or SIWE misconfiguration
 *
 * The Prisma client and iron-session are imported dynamically so loading
 * this module (e.g. in unit tests for the 405 handlers) never touches the
 * database or the request scope. Uses the global Response (no next/server
 * import) for the same reason.
 */
import { SiweAuthError, verifySiweLogin } from "@/server/auth/verify";
import { getSiweConfig } from "@/server/auth/config";
import { sealSessionCookie } from "@/server/auth/session";
import { getSessionOptions } from "@/lib/auth/session";
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

/** Generic client-facing message per status — never internal details. */
function clientMessageFor(status: number): string {
  if (status === 400) return "Invalid request.";
  if (status === 403) return "Account suspended.";
  if (status === 413) return "Request too large.";
  if (status === 429) return "Too many requests. Please try again later.";
  return "Authentication failed.";
}

export async function POST(request: Request): Promise<Response> {
  const ip = clientIp(request);
  const limit = checkRateLimit(
    `siwe-verify:${ip}`,
    NONCE_RATE_LIMIT_MAX,
    NONCE_RATE_LIMIT_WINDOW_MS,
  );
  if (!limit.allowed) {
    return Response.json(
      { error: clientMessageFor(429) },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  let body: unknown;
  const limited = await readLimitedBody(request);
  if (!limited.ok) {
    const status = limited.reason === "too_large" ? 413 : 400;
    return Response.json({ error: clientMessageFor(status) }, { status });
  }
  try {
    body = JSON.parse(limited.text);
  } catch {
    return Response.json({ error: clientMessageFor(400) }, { status: 400 });
  }
  const message = (body as { message?: unknown } | null)?.message;
  const signature = (body as { signature?: unknown } | null)?.signature;
  if (
    typeof message !== "string" ||
    typeof signature !== "string" ||
    !message ||
    !signature
  ) {
    return Response.json({ error: clientMessageFor(400) }, { status: 400 });
  }

  let config;
  try {
    config = getSiweConfig();
  } catch (err) {
    // Server-side log only — the client learns nothing about the config.
    console.error("POST /api/auth/verify misconfigured:", err);
    return Response.json({ error: "Authentication unavailable." }, { status: 500 });
  }

  // Validate session configuration BEFORE any database work: a misconfigured
  // SESSION_SECRET must fail here — not after the nonce is consumed and the
  // session row is created.
  try {
    getSessionOptions();
  } catch (err) {
    console.error("POST /api/auth/verify misconfigured:", err);
    return Response.json({ error: "Authentication unavailable." }, { status: 500 });
  }

  try {
    const { prisma } = await import("@/server/db");
    const result = await verifySiweLogin(
      prisma,
      { message, signature },
      {
        expectedDomain: config.domain,
        expectedUri: config.uri,
        allowedChainIds: config.allowedChainIds,
        ipAddress: ip,
        userAgent: request.headers.get("user-agent") ?? undefined,
      },
    );
    await sealSessionCookie({
      userId: result.userId,
      address: result.address,
      token: result.rawToken,
    });
    return Response.json({ address: result.address, userId: result.userId });
  } catch (err) {
    if (err instanceof SiweAuthError) {
      // Rejection reason stays server-side; the client gets a generic message.
      console.error("POST /api/auth/verify rejected:", err.code);
      return Response.json(
        { error: clientMessageFor(err.status) },
        { status: err.status },
      );
    }
    console.error("POST /api/auth/verify failed:", err);
    return Response.json({ error: "Authentication failed." }, { status: 500 });
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
