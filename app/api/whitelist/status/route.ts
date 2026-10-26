import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth/session";
import {
  evaluateUserQualification,
  REQUIRED_TRAIT_CATEGORIES,
} from "@/server/whitelist/qualification";
import { normalizeAddress } from "@/lib/auth/address";

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
    return Response.json({
      configured: false,
      message: "No Whitelist program is currently active.",
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
      } else {
        return Response.json({
          configured: true,
          program: { id: program.id, slug: program.slug, name: program.name },
          status: {
            qualified: false,
            phase: "NONE",
            missingRequirements: [
              "Wallet has never connected or signed in to ChimpHood.",
            ],
            details: {
              hasVerifiedWallet: false,
              hasLinkedX: false,
              heldCategories: [],
              missingCategories: REQUIRED_TRAIT_CATEGORIES,
              completedMandatoryTasksCount: 0,
              totalMandatoryTasksCount: 0,
              isBanned: false,
            },
          },
        });
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

  const result = await evaluateUserQualification(prisma, {
    userId: targetUserId,
    programId: program.id,
    readOnly: true,
  });

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
