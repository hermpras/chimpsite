/**
 * GET /api/auth/config — public login configuration.
 *
 * Returns the EVM chain IDs accepted for SIWE login so the client can
 * prompt a network switch before requesting a signature. No secrets.
 */
import { getAllowedChainIds } from "@/server/auth/config";

export async function GET(): Promise<Response> {
  try {
    return Response.json({ allowedChainIds: getAllowedChainIds() });
  } catch (err) {
    console.error("GET /api/auth/config failed:", err);
    return Response.json({ error: "Configuration unavailable." }, { status: 500 });
  }
}
