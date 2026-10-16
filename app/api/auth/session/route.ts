/**
 * GET /api/auth/session — current session status.
 *
 * Returns { authenticated: true, address, userId } when the request carries
 * a valid session cookie, otherwise { authenticated: false }. Always 200
 * for a reachable server: this is a status check, not a gate.
 *
 * The Prisma client is imported dynamically so loading this module never
 * touches the database. Uses the global Response (no next/server import).
 */
import { authenticateRequest } from "@/server/auth/session";

export async function GET(): Promise<Response> {
  try {
    const { prisma } = await import("@/server/db");
    const session = await authenticateRequest(prisma);
    if (!session) {
      return Response.json({ authenticated: false });
    }
    return Response.json({
      authenticated: true,
      address: session.address,
      userId: session.userId,
    });
  } catch (err) {
    console.error("GET /api/auth/session failed:", err);
    return Response.json({ authenticated: false }, { status: 500 });
  }
}
