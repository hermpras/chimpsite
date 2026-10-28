import type { PrismaClient, Prisma } from "@prisma/client";

export class AdminUsersError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = "AdminUsersError";
    this.code = code;
    this.status = status;
  }
}

export interface ListAdminUsersFilter {
  search?: string;
  address?: string;
  userId?: string;
  role?: string;
  isBanned?: boolean | string;
  limit?: number;
  offset?: number;
}

export interface AdminUserItem {
  id: string;
  role: string;
  isBanned: boolean;
  createdAt: string;
  updatedAt: string;
  wallet: {
    address: string;
    chainId: number;
    verifiedAt: string;
  } | null;
  xIdentity: {
    username: string;
    name: string | null;
  } | null;
  activeBan?: {
    id: string;
    banType: string;
    scope: string;
    reason: string;
    issuedAt: string;
    expiresAt: string | null;
  } | null;
}

export interface ListAdminUsersResult {
  users: AdminUserItem[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * List and search users for the Admin Portal.
 *
 * Security & Data Minimization:
 * - Omits sensitive columns (avatarPng binary bytes, auth tokens, session secrets).
 * - Enforces safe pagination with clamped limits (max 100).
 * - Allows searching by wallet address, User CUID, or X handle.
 */
export async function listAdminUsers(
  prisma: PrismaClient,
  filter: ListAdminUsersFilter = {},
): Promise<ListAdminUsersResult> {
  const limit = Math.min(Math.max(1, Number(filter.limit) || 20), 100);
  const offset = Math.max(0, Number(filter.offset) || 0);

  const where: Prisma.UserWhereInput = {};

  if (filter.role) {
    where.role = filter.role as any;
  }

  if (filter.isBanned !== undefined) {
    if (typeof filter.isBanned === "boolean") {
      where.isBanned = filter.isBanned;
    } else if (typeof filter.isBanned === "string") {
      if (filter.isBanned === "true") where.isBanned = true;
      if (filter.isBanned === "false") where.isBanned = false;
    }
  }

  if (filter.userId && filter.userId.trim()) {
    where.id = filter.userId.trim();
  }

  if (filter.address && filter.address.trim()) {
    where.wallet = {
      address: filter.address.trim().toLowerCase(),
    };
  }

  if (filter.search && filter.search.trim()) {
    const rawSearch = filter.search.trim();
    const lowerSearch = rawSearch.toLowerCase();

    const searchConditions: Prisma.UserWhereInput[] = [
      { id: { contains: rawSearch } },
      { wallet: { address: { contains: lowerSearch } } },
      { xIdentity: { username: { contains: rawSearch, mode: "insensitive" } } },
    ];

    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchConditions }];
      delete where.OR;
    } else {
      where.OR = searchConditions;
    }
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      select: {
        id: true,
        role: true,
        isBanned: true,
        createdAt: true,
        updatedAt: true,
        wallet: {
          select: {
            address: true,
            chainId: true,
            verifiedAt: true,
          },
        },
        xIdentity: {
          select: {
            username: true,
            name: true,
          },
        },
        banRecords: {
          where: { isActive: true },
          take: 1,
          orderBy: { issuedAt: "desc" },
          select: {
            id: true,
            banType: true,
            scope: true,
            reason: true,
            issuedAt: true,
            expiresAt: true,
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: users.map((u) => {
      const activeBan = u.banRecords && u.banRecords.length > 0 ? u.banRecords[0] : null;
      return {
        id: u.id,
        role: u.role,
        isBanned: u.isBanned,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
        wallet: u.wallet
          ? {
              address: u.wallet.address,
              chainId: u.wallet.chainId,
              verifiedAt: u.wallet.verifiedAt.toISOString(),
            }
          : null,
        xIdentity: u.xIdentity
          ? {
              username: u.xIdentity.username,
              name: u.xIdentity.name,
            }
          : null,
        activeBan: activeBan
          ? {
              id: activeBan.id,
              banType: activeBan.banType,
              scope: activeBan.scope,
              reason: activeBan.reason,
              issuedAt: activeBan.issuedAt.toISOString(),
              expiresAt: activeBan.expiresAt ? activeBan.expiresAt.toISOString() : null,
            }
          : null,
      };
    }),
    total,
    limit,
    offset,
  };
}
