"use server";

import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth/session";

/**
 * Development-only server action to grant SUPER_ADMIN privileges
 * to the currently authenticated session without requiring manual database editing.
 */
export async function devPromoteToAdmin(): Promise<{ ok: boolean; error?: string }> {
  if (process.env.NODE_ENV === "production") {
    return { ok: false, error: "Not allowed in production environment" };
  }

  const session = await authenticateRequest(prisma);
  if (!session) {
    return {
      ok: false,
      error: "No active session found. Please sign in with wallet first.",
    };
  }

  await prisma.adminRole.upsert({
    where: { userId: session.userId },
    create: {
      userId: session.userId,
      roleType: "SUPER_ADMIN",
      permissions: ["*"],
      assignedBy: "DEV_PORTAL",
    },
    update: {
      roleType: "SUPER_ADMIN",
      permissions: ["*"],
    },
  });

  return { ok: true };
}
