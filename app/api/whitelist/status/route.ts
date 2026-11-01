import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth/session";
import {
  evaluateUserQualification,
  WhitelistError,
  REQUIRED_TRAIT_CATEGORIES,
} from "@/server/whitelist/qualification";
import { normalizeAddress } from "@/lib/auth/address";
import { normalizeXAvatarUrl } from "@/lib/social/x-avatar";
import type { WLSlotReviewStatus } from "@/lib/whitelist/client";

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

      // Check for active GTD slot in closed/finalized program
      const existingSlot =
        targetUserId && prisma.wLSlot?.findFirst
          ? await prisma.wLSlot.findFirst({
              where: {
                programId: program.id,
                userId: targetUserId,
                status: { in: ["ALLOCATED", "CONFIRMED"] },
              },
              select: {
                slotNumber: true,
                status: true,
                reviewStatus: true,
                reviewedAt: true,
                allocatedAt: true,
              },
            })
          : null;

      if (existingSlot) {
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
            qualified: true,
            isFullyQualified: true,
            phase: "SLOT_ALLOCATED" as const,
            slotNumber: existingSlot.slotNumber,
            reviewStatus: existingSlot.reviewStatus as WLSlotReviewStatus,
            reviewedAt: existingSlot.reviewedAt
              ? existingSlot.reviewedAt.toISOString()
              : null,
            allocatedAt: existingSlot.allocatedAt
              ? existingSlot.allocatedAt.toISOString()
              : undefined,
            missingRequirements: [],
            details: {
              hasVerifiedWallet: Boolean(targetAddress),
              hasLinkedX,
              xUsername,
              xProfileImageUrl,
              heldCategories: [] as string[],
              missingCategories: [],
              completedMandatoryTasksCount: 0,
              totalMandatoryTasksCount: 0,
              isBanned: false,
            },
          },
        });
      }

      // Check if user has revoked status in closed/finalized program (DEC-022)
      const qualRecordClosed =
        targetUserId && prisma.wLQualification?.findUnique
          ? await prisma.wLQualification.findUnique({
              where: {
                programId_userId: {
                  programId: program.id,
                  userId: targetUserId,
                },
              },
              select: { status: true, reason: true },
            })
          : null;

      const revokedSlotClosed =
        targetUserId && prisma.wLSlot?.findFirst
          ? await prisma.wLSlot.findFirst({
              where: {
                programId: program.id,
                userId: targetUserId,
                status: { in: ["REVOKED_MANUAL_ADMIN", "REVOKED_SYSTEM"] },
              },
              select: { id: true, notes: true },
            })
          : null;

      const isRevokedClosed =
        qualRecordClosed?.status === "REVOKED" || Boolean(revokedSlotClosed);

      if (isRevokedClosed) {
        const revokeReason =
          qualRecordClosed?.reason ||
          revokedSlotClosed?.notes ||
          "Whitelist qualification has been revoked by an administrator.";

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
            isFullyQualified: false,
            phase: "REVOKED" as const,
            missingRequirements: [revokeReason],
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

      // Check for FCFS directory registration in closed/finalized program
      const existingQueueEntry =
        targetUserId && prisma.wLQueueEntry?.findUnique
          ? await prisma.wLQueueEntry.findUnique({
              where: {
                programId_userId: {
                  programId: program.id,
                  userId: targetUserId,
                },
              },
              select: {
                queueNumber: true,
                joinedAt: true,
              },
            })
          : null;

      if (existingQueueEntry) {
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
            isFullyQualified: false,
            phase: "FCFS_REGISTERED" as const,
            queueNumber: existingQueueEntry.queueNumber,
            joinedAt: existingQueueEntry.joinedAt.toISOString(),
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
          isFullyQualified: false,
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

  // 1. Check if user holds an active GTD slot (ALLOCATED / CONFIRMED)
  // GTD allocation takes strict precedence (DEC-014, DEC-015, Requirement 1, 6)
  const activeGtdSlot =
    targetUserId && prisma.wLSlot?.findFirst
      ? await prisma.wLSlot.findFirst({
          where: {
            programId: program.id,
            userId: targetUserId,
            status: { in: ["ALLOCATED", "CONFIRMED"] },
          },
          select: {
            slotNumber: true,
            status: true,
            reviewStatus: true,
            reviewedAt: true,
            allocatedAt: true,
          },
        })
      : null;

  // 2. Check if user has revoked status (DEC-022 Full WL Disqualification Policy)
  const qualRecord =
    targetUserId && prisma.wLQualification?.findUnique
      ? await prisma.wLQualification.findUnique({
          where: {
            programId_userId: {
              programId: program.id,
              userId: targetUserId,
            },
          },
          select: { status: true, reason: true },
        })
      : null;

  const revokedSlot =
    targetUserId && prisma.wLSlot?.findFirst
      ? await prisma.wLSlot.findFirst({
          where: {
            programId: program.id,
            userId: targetUserId,
            status: { in: ["REVOKED_MANUAL_ADMIN", "REVOKED_SYSTEM"] },
          },
          select: { id: true, notes: true },
        })
      : null;

  const isRevoked =
    result.phase === "REVOKED" ||
    qualRecord?.status === "REVOKED" ||
    Boolean(revokedSlot);

  // 3. Check if user is registered in the FCFS Directory (WLQueueEntry)
  // (DEC-013, DEC-017, Requirement 2, 4)
  const fcfsEntry =
    targetUserId && prisma.wLQueueEntry?.findUnique
      ? await prisma.wLQueueEntry.findUnique({
          where: {
            programId_userId: {
              programId: program.id,
              userId: targetUserId,
            },
          },
          select: {
            queueNumber: true,
            joinedAt: true,
            status: true,
          },
        })
      : null;

  const isFullyQualified = result.missingRequirements.length === 0;

  let finalStatus;

  // Priority 1: User holds an active GTD slot (DEC-014, DEC-015, Requirement 1, 6)
  if (activeGtdSlot) {
    finalStatus = {
      qualified: true,
      isFullyQualified,
      phase: "SLOT_ALLOCATED" as const,
      slotNumber: activeGtdSlot.slotNumber,
      reviewStatus: activeGtdSlot.reviewStatus as WLSlotReviewStatus,
      reviewedAt: activeGtdSlot.reviewedAt
        ? activeGtdSlot.reviewedAt.toISOString()
        : null,
      allocatedAt: activeGtdSlot.allocatedAt
        ? activeGtdSlot.allocatedAt.toISOString()
        : undefined,
      missingRequirements: result.missingRequirements,
      details: result.details,
    };
  }
  // Priority 2: User is REVOKED (DEC-022: Full Disqualification strictly takes priority over FCFS)
  else if (isRevoked) {
    const revokeReason =
      qualRecord?.reason ||
      revokedSlot?.notes ||
      "Whitelist qualification has been revoked by an administrator.";
    const missingReqs =
      result.missingRequirements.length > 0
        ? result.missingRequirements
        : [revokeReason];

    finalStatus = {
      qualified: false,
      isFullyQualified: false,
      phase: "REVOKED" as const,
      missingRequirements: missingReqs,
      details: result.details,
    };
  }
  // Priority 3: User is registered in FCFS Directory (DEC-013, DEC-017, Requirement 2, 3, 4, 5)
  else if (fcfsEntry) {
    finalStatus = {
      qualified: isFullyQualified,
      isFullyQualified,
      phase: "FCFS_REGISTERED" as const,
      queueNumber: fcfsEntry.queueNumber,
      joinedAt: fcfsEntry.joinedAt.toISOString(),
      missingRequirements: result.missingRequirements,
      details: result.details,
    };
  }
  // Priority 4: Ineligible / Not Registered
  else {
    finalStatus = {
      qualified: false,
      isFullyQualified: false,
      phase: "NONE" as const,
      missingRequirements: result.missingRequirements,
      details: result.details,
    };
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
    status: finalStatus,
  });
}
