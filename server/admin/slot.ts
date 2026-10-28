import type { PrismaClient, Prisma } from "@prisma/client";

export {
  revokeWlSlot,
  revokeSlot,
  WlSlotRevokeError,
  AdminSlotRevokeError,
  type RevokeWlSlotInput,
  type RevokeWlSlotResult,
  validateRevokeWlSlotInput,
} from "../whitelist/revoke";

export class AdminSlotError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = "AdminSlotError";
    this.code = code;
    this.status = status;
  }
}

export interface ListAdminWlSlotsFilter {
  programId?: string;
  status?: string;
  userId?: string;
  address?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AdminWlSlotItem {
  id: string;
  slotNumber: number;
  programId: string;
  programName?: string;
  programSlug?: string;
  userId: string;
  walletAddress: string | null;
  status: string;
  allocatedAt: string;
  confirmedAt: string | null;
  allocatedBy: string | null;
  notes: string | null;
}

export interface ListAdminWlSlotsResult {
  slots: AdminWlSlotItem[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Lists allocated whitelist slots with pagination, safe filters, and wallet address details.
 * Invariant: Read-only query; never modifies queue order, qualification timestamps,
 * capacity, or allocation rules.
 */
export async function listAdminWlSlots(
  prisma: PrismaClient,
  filter: ListAdminWlSlotsFilter = {},
): Promise<ListAdminWlSlotsResult> {
  const limit = Math.min(Math.max(1, Number(filter.limit) || 20), 100);
  const offset = Math.max(0, Number(filter.offset) || 0);

  const where: Prisma.WLSlotWhereInput = {};

  if (filter.programId && filter.programId.trim()) {
    where.programId = filter.programId.trim();
  }

  if (filter.status && filter.status.trim()) {
    where.status = filter.status.trim() as any;
  }

  if (filter.userId && filter.userId.trim()) {
    where.userId = filter.userId.trim();
  }

  if (filter.address && filter.address.trim()) {
    where.user = {
      wallet: {
        address: filter.address.trim().toLowerCase(),
      },
    };
  }

  if (filter.search && filter.search.trim()) {
    const rawSearch = filter.search.trim();
    const lowerSearch = rawSearch.toLowerCase();

    const searchConditions: Prisma.WLSlotWhereInput[] = [
      { id: { contains: rawSearch } },
      { userId: { contains: rawSearch } },
      { user: { wallet: { address: { contains: lowerSearch } } } },
    ];

    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchConditions }];
      delete where.OR;
    } else {
      where.OR = searchConditions;
    }
  }

  const [slots, total] = await Promise.all([
    prisma.wLSlot.findMany({
      where,
      orderBy: [{ allocatedAt: "desc" }, { slotNumber: "asc" }],
      skip: offset,
      take: limit,
      select: {
        id: true,
        programId: true,
        slotNumber: true,
        userId: true,
        status: true,
        allocatedAt: true,
        confirmedAt: true,
        allocatedBy: true,
        notes: true,
        program: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        user: {
          select: {
            id: true,
            wallet: {
              select: {
                address: true,
              },
            },
          },
        },
      },
    }),
    prisma.wLSlot.count({ where }),
  ]);

  return {
    slots: slots.map((s) => ({
      id: s.id,
      slotNumber: s.slotNumber,
      programId: s.programId,
      programName: s.program?.name,
      programSlug: s.program?.slug,
      userId: s.userId ?? s.user?.id ?? "",
      walletAddress: s.user?.wallet?.address ?? null,
      status: s.status,
      allocatedAt: s.allocatedAt.toISOString(),
      confirmedAt: s.confirmedAt ? s.confirmedAt.toISOString() : null,
      allocatedBy: s.allocatedBy,
      notes: s.notes,
    })),
    total,
    limit,
    offset,
  };
}
