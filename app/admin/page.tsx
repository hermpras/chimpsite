import React from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { checkAdminSession } from "@/server/auth/session";
import {
  AdminDashboardClient,
  type SerializedAdminSession,
} from "@/components/admin/AdminDashboardClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const authResult = await checkAdminSession(prisma);

  if (!authResult.ok) {
    notFound();
  }

  const serializedSession: SerializedAdminSession = {
    sessionId: authResult.session.sessionId,
    userId: authResult.session.userId,
    address: authResult.session.address,
    adminRole: {
      id: authResult.session.adminRole.id,
      userId: authResult.session.adminRole.userId,
      roleType: authResult.session.adminRole.roleType,
      permissions: authResult.session.adminRole.permissions,
      assignedBy: authResult.session.adminRole.assignedBy ?? null,
    },
  };

  return <AdminDashboardClient adminSession={serializedSession} />;
}
