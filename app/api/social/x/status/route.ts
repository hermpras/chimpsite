import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth/session";
import { isXConfigured } from "@/server/social/x";

export async function GET(): Promise<Response> {
  const configured = isXConfigured();
  const session = await authenticateRequest(prisma);

  if (!session) {
    return Response.json({ configured, authenticated: false });
  }

  const identity = await prisma.xIdentity.findUnique({
    where: { userId: session.userId },
    select: {
      xId: true,
      username: true,
      name: true,
      profileImageUrl: true,
      connectedAt: true,
    },
  });

  return Response.json({
    configured,
    authenticated: true,
    connected: Boolean(identity),
    identity,
  });
}
