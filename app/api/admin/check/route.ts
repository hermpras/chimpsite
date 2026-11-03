/**
 * GET /api/admin/check
 *
 * Lightweight admin status verification endpoint for authorized UI elements
 * (such as displaying the Admin Portal link in the navbar).
 *
 * Always returns 200 { isAdmin: boolean, roleType?: string | null }.
 * Never leaks data or throws unhandled errors for non-admin users.
 */
import { checkAdminSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const { prisma } = await import("@/server/db");
    const result = await checkAdminSession(prisma);

    if (!result.ok) {
      return Response.json({ isAdmin: false, roleType: null });
    }

    return Response.json({
      isAdmin: true,
      roleType: result.session.adminRole.roleType,
    });
  } catch (err) {
    console.error("GET /api/admin/check error:", err);
    return Response.json({ isAdmin: false, roleType: null });
  }
}
