import type { PrismaClient } from "@prisma/client";
import { executeQualificationEvaluation, REQUIRED_TRAIT_CATEGORIES } from "../whitelist/qualification";
import { normalizeXAvatarUrl } from "@/lib/social/x-avatar";

export class AdminFcfsDirectoryError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = "AdminFcfsDirectoryError";
    this.code = code;
    this.status = status;
  }
}

export interface ListFcfsDirectoryFilter {
  programId?: string;
  search?: string;
  qualifiedOnly?: boolean;
  limit?: number;
  offset?: number;
  now?: Date;
}

export interface FcfsDirectoryUser {
  id: string;
  walletAddress: string | null;
  xIdentity: {
    xId: string;
    username: string;
    name: string | null;
    profileImageUrl: string | null;
  } | null;
  isBanned: boolean;
}

export interface FcfsDirectoryQualification {
  isFullyQualified: boolean;
  heldCategories: string[];
  heldCategoriesCount: number;
  missingCategories: string[];
  tasksCompleted: boolean;
  completedTasksCount: number;
  totalTasksCount: number;
  isBanned: boolean;
  missingRequirements: string[];
}

export interface FcfsDirectoryEntry {
  id: string;
  userId: string;
  programId: string;
  queueNumber: number;
  joinedAt: Date;
  status: string;
  user: FcfsDirectoryUser;
  qualification: FcfsDirectoryQualification;
}

export interface ListFcfsDirectoryResult {
  entries: FcfsDirectoryEntry[];
  total: number;
  limit: number;
  offset: number;
  program: {
    id: string;
    name: string;
    slug: string;
    status: string;
    totalSlots: number;
    allocatedSlotsCount: number;
    vacantCount: number;
  };
}

/**
 * Lists participants in the FCFS Directory ordered strictly by joinedAt ASC, queueNumber ASC (DEC-013, DEC-017).
 * Evaluates live qualification checklist (5 trait categories, mandatory campaign tasks, ban status).
 */
export async function listFcfsDirectory(
  prisma: PrismaClient,
  filter: ListFcfsDirectoryFilter = {},
): Promise<ListFcfsDirectoryResult> {
  const limit = Math.min(Math.max(1, Number(filter.limit) || 20), 100);
  const offset = Math.max(0, Number(filter.offset) || 0);
  const now = filter.now ?? new Date();

  // 1. Resolve canonical / active program
  let program;
  if (filter.programId && filter.programId.trim()) {
    program = await prisma.wLProgram.findUnique({
      where: { id: filter.programId.trim() },
    });
    if (!program) {
      program = await prisma.wLProgram.findUnique({
        where: { slug: filter.programId.trim() },
      });
    }
  }

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

  if (!program) {
    throw new AdminFcfsDirectoryError(
      "PROGRAM_NOT_FOUND",
      "No Whitelist program found.",
      404,
    );
  }

  const vacantCount = Math.max(0, program.totalSlots - program.allocatedSlotsCount);

  // 2. Build where filter for queue entries
  const where: any = {
    programId: program.id,
  };

  const searchParam = filter.search?.trim();
  if (searchParam) {
    const rawSearch = searchParam;
    const lowerSearch = rawSearch.toLowerCase();
    where.user = {
      OR: [
        { wallet: { address: { contains: lowerSearch } } },
        { xIdentity: { username: { contains: rawSearch } } },
      ],
    };
  }

  // 3. Query all candidates matching base filters ordered strictly by joinedAt ASC, queueNumber ASC
  const queueEntries = await prisma.wLQueueEntry.findMany({
    where,
    orderBy: [
      { joinedAt: "asc" },
      { queueNumber: "asc" },
    ],
    include: {
      user: {
        select: {
          id: true,
          isBanned: true,
          wallet: {
            select: { address: true },
          },
          xIdentity: {
            select: {
              xId: true,
              username: true,
              name: true,
              profileImageUrl: true,
            },
          },
          banRecords: {
            where: { isActive: true },
          },
        },
      },
    },
  });

  // 4. Evaluate qualifications in memory using centralized qualification engine
  const evaluatedEntries: FcfsDirectoryEntry[] = [];

  for (const entry of queueEntries) {
    const user = entry.user;
    if (!user) continue;

    const isBanned = Boolean(user.isBanned || (user.banRecords && user.banRecords.length > 0));

    let qualResult;
    try {
      qualResult = await executeQualificationEvaluation(
        prisma,
        {
          userId: user.id,
          programId: program.id,
          readOnly: true,
          allowClosed: true,
        },
        now,
      );
    } catch {
      qualResult = {
        qualified: false,
        phase: "NONE" as const,
        missingRequirements: ["Evaluation failed"],
        details: {
          hasVerifiedWallet: Boolean(user.wallet?.address),
          hasLinkedX: Boolean(user.xIdentity?.xId),
          heldCategories: [],
          missingCategories: REQUIRED_TRAIT_CATEGORIES,
          completedMandatoryTasksCount: 0,
          totalMandatoryTasksCount: 0,
          isBanned,
        },
      };
    }

    const details = qualResult.details;
    const heldCategories = details?.heldCategories ?? [];
    const missingCategories = details?.missingCategories ?? REQUIRED_TRAIT_CATEGORIES;
    const completedTasksCount = details?.completedMandatoryTasksCount ?? 0;
    const totalTasksCount = details?.totalMandatoryTasksCount ?? 0;
    const tasksCompleted = totalTasksCount > 0 ? completedTasksCount >= totalTasksCount : true;
    const isFullyQualified = Boolean(qualResult.qualified);

    // Apply qualifiedOnly filter if requested
    if (filter.qualifiedOnly && !isFullyQualified) {
      continue;
    }

    evaluatedEntries.push({
      id: entry.id,
      userId: entry.userId,
      programId: entry.programId,
      queueNumber: entry.queueNumber,
      joinedAt: entry.joinedAt,
      status: entry.status,
      user: {
        id: user.id,
        walletAddress: user.wallet?.address ?? null,
        xIdentity: user.xIdentity
          ? {
              xId: user.xIdentity.xId,
              username: user.xIdentity.username,
              name: user.xIdentity.name,
              profileImageUrl: normalizeXAvatarUrl(user.xIdentity.profileImageUrl),
            }
          : null,
        isBanned,
      },
      qualification: {
        isFullyQualified,
        heldCategories,
        heldCategoriesCount: heldCategories.length,
        missingCategories,
        tasksCompleted,
        completedTasksCount,
        totalTasksCount,
        isBanned,
        missingRequirements: qualResult.missingRequirements ?? [],
      },
    });
  }

  const total = evaluatedEntries.length;
  const paginatedEntries = evaluatedEntries.slice(offset, offset + limit);

  return {
    entries: paginatedEntries,
    total,
    limit,
    offset,
    program: {
      id: program.id,
      name: program.name,
      slug: program.slug,
      status: program.status,
      totalSlots: program.totalSlots,
      allocatedSlotsCount: program.allocatedSlotsCount,
      vacantCount,
    },
  };
}
