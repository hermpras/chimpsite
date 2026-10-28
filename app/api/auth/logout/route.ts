/**
 * POST /api/auth/logout — end the current session.
 *
 * Revokes the session token server-side (when one exists) and destroys the
 * session cookie. Best-effort and idempotent: always returns 200 so the
 * client can clear local state regardless of server outcome.
 *
 * The Prisma client is imported dynamically so loading this module never
 * touches the database. Uses the global Response (no next/server import).
 */
import {
  destroySessionCookie,
  getSessionData,
  revokeSessionToken,
} from "@/server/auth/session";

export async function POST(): Promise<Response> {
  try {
    const { prisma } = await import("@/server/db");
    const data = await getSessionData();
    if (data?.token) {
      await revokeSessionToken(prisma, data.token);
    }
    await destroySessionCookie();
  } catch (err) {
    // Logout must never fail the request — the client clears local state anyway.
    console.error("POST /api/auth/logout failed:", err);
  }
  return Response.json({ ok: true });
}
