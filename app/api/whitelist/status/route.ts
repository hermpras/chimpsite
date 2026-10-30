import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth/session";
import {
  evaluateUserQualification,
  WhitelistError,
  REQUIRED_TRAIT_CATEGORIES,
} from "@/server/whitelist/qualification";
import { normalizeAddress } from "@/lib/auth/address";
import { normalizeXAvatarUrl } from "@/lib/social/x-avatar";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const addressParam = url.searchParams.get("address");
  const programSlug = url.searchParams.get("programSlug") || "chimphood-wl-main";

  // Find target program
  let program = await prisma.wLProgram.findUnique({
    where: { slug: programSlug },
  });

  if (!program) {
    program = await prisma.wLProgram.findFirst({
      where: { status: "OPEN" },
      orderBy: { createdAt: "desc" },
    });
  }

  if (!program) {
    program = await prisma.wLProgram.findFirst({
      orderBy: { createdAt: "desc" },
    });
  }

  let targetUserId: string | null = null;
  let targetAddress: string | null = null;

  if (addressParam) {
    try {
      const normalized = normalizeAddress(addressParam);
      const wallet = await prisma.walletIdentity.findUnique({
        where: { address: normalized },
      });
      if (wallet) {
        targetUserId = wallet.userId;
        targetAddress = normalized;
      }
    } catch {
      return Response.json({ error: "INVALID_ADDRESS" }, { status: 400 });
    }
  } else {
    const session = await authenticateRequest(prisma);
    if (session) {
      targetUserId = session.userId;
      targetAddress = session.address;
    }
  }

  if (!program) {
    let hasLinkedX = false;
    let xUsername: string | undefined;
    let xProfileImageUrl: string | null | undefined;
    if (targetUserId) {
      const user = await prisma.user.findUnique({
        where: { id: targetUserId },
        include: { xIdentity: true },
      });
      hasLinkedX = Boolean(user?.xIdentity);
      xUsername = user?.xIdentity?.username;
      xProfileImageUrl = normalizeXAvatarUrl(user?.xIdentity?.profileImageUrl);
    }
    return Response.json({
      configured: false,
      message: "No Whitelist program is currently active.",
      status: {
        qualified: false,
        phase: "NONE",
        missingRequirements: ["No active Whitelist program."],
        details: {
          hasVerifiedWallet: Boolean(targetAddress),
          hasLinkedX,
          xUsername,
          xProfileImageUrl,
          heldCategories: [],
          missingCategories: REQUIRED_TRAIT_CATEGORIES,
          completedMandatoryTasksCount: 0,
          totalMandatoryTasksCount: 0,
          isBanned: false,
        },
      },
    });
  }

  if (!targetUserId) {
    return Response.json({
      configured: true,
      program: {
        id: program.id,
        slug: program.slug,
        name: program.name,
        totalSlots: program.totalSlots,
        allocatedSlotsCount: program.allocatedSlotsCount,
        status: program.status,
      },
      authenticated: false,
      message: "Sign in or query an address to view Whitelist status.",
    });
  }

  let result;
  try {
    result = await evaluateUserQualification(prisma, {
      userId: targetUserId,
      programId: program.id,
      readOnly: true,
    });
  } catch (err) {
    // A non-OPEN program (e.g. FINALIZED, UPCOMING, CLOSED) causes
    // executeQualificationEvaluation to throw WhitelistError("PROGRAM_NOT_ACTIVE", ..., 400).
    // This is an expected, non-fatal condition for the status endpoint — the program
    // exists and should be shown to the caller; we simply cannot evaluate live eligibility.
    // Return the program information with a static ineligible status instead of propagating
    // a 400/500 to the client.
    if (err instanceof WhitelistError && err.code === "PROGRAM_NOT_ACTIVE") {
      let hasLinkedX = false;
      let xUsername: string | undefined;
      let xProfileImageUrl: string | null | undefined;
      if (targetUserId) {
        const user = await prisma.user.findUnique({
          where: { id: targetUserId },
          include: { xIdentity: true },
        });
        hasLinkedX = Boolean(user?.xIdentity);
        xUsername = user?.xIdentity?.username;
        xProfileImageUrl = normalizeXAvatarUrl(user?.xIdentity?.profileImageUrl);
      }

      return Response.json({
        configured: true,
        program: {
          id: program.id,
          slug: program.slug,
          name: program.name,
          totalSlots: program.totalSlots,
          allocatedSlotsCount: program.allocatedSlotsCount,
          status: program.status,
        },
        address: targetAddress,
        status: {
          qualified: false,
          phase: "NONE" as const,
          missingRequirements: [
            `Whitelist program is not accepting new qualifications (status: ${program.status}).`,
          ],
          details: {
            hasVerifiedWallet: Boolean(targetAddress),
            hasLinkedX,
            xUsername,
            xProfileImageUrl,
            heldCategories: [] as string[],
            missingCategories: REQUIRED_TRAIT_CATEGORIES,
            completedMandatoryTasksCount: 0,
            totalMandatoryTasksCount: 0,
            isBanned: false,
          },
        },
      });
    }

    // All other WhitelistErrors (USER_NOT_FOUND, PROGRAM_NOT_FOUND, etc.) and
    // unexpected errors propagate normally with their correct status codes.
    if (err instanceof WhitelistError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }

    console.error("GET /api/whitelist/status unexpected error:", err);
    return Response.json(
      { error: "SERVER_ERROR", message: "An unexpected error occurred." },
      { status: 500 },
    );
  }

  return Response.json({
    configured: true,
    program: {
      id: program.id,
      slug: program.slug,
      name: program.name,
      totalSlots: program.totalSlots,
      allocatedSlotsCount: program.allocatedSlotsCount,
      status: program.status,
    },
    address: targetAddress,
    status: result,
  });
}
