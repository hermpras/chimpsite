/**
 * Server Admin Bootstrap Service (Task B-3)
 *
 * Isolated Super Admin initialization mechanism for staging/production environments.
 * Strictly decoupled from devPromoteToAdmin (which is disabled in production).
 *
 * Security & Invariants:
 *  - Validates and normalizes EVM wallet address to lowercase.
 *  - Only creates/promotes the initial Super Admin when no active Super Admin exists.
 *  - Rejects execution if an active Super Admin already exists in the system.
 *  - Idempotent: repeated runs for the same wallet do not duplicate records or demote roles/permissions.
 *  - Safe against concurrent execution via atomic transactions and database advisory locking.
 *  - Operates atomically inside a database transaction with audit trail logging (DEC-011).
 *  - Never alters user ban status or modifies/deletes BanRecords.
 *  - Never logs secrets, connection strings, or auth credentials.
 */

import type { PrismaClient } from "@prisma/client";
import { normalizeAddress, shortenAddress } from "@/lib/auth/address";
import { recordAuditLog } from "@/server/audit/audit";

export class BootstrapError extends Error {
  code: string;
  constructor(message: string, code = "BOOTSTRAP_ERROR") {
    super(message);
    this.name = "BootstrapError";
    this.code = code;
  }
}

export type BootstrapAction = "CREATED" | "PROMOTED" | "ALREADY_SUPER_ADMIN";

export interface BootstrapResult {
  ok: true;
  action: BootstrapAction;
  userId: string;
  address: string;
  role: "SUPER_ADMIN";
  permissions: string[];
  message: string;
  auditLogId?: string | null;
}

export interface BootstrapOptions {
  /** Identifier of the assigner / actor recorded in audit log. Defaults to "INITIAL_BOOTSTRAP". */
  assignedBy?: string;
  actorIp?: string | null;
  userAgent?: string | null;
}

/**
 * Validates and normalizes an EVM address string for the bootstrap script.
 * Throws a descriptive BootstrapError if the address is empty, non-string, or invalid.
 */
export function validateBootstrapAddress(rawAddress: unknown): string {
  if (
    rawAddress === undefined ||
    rawAddress === null ||
    typeof rawAddress !== "string" ||
    rawAddress.trim() === ""
  ) {
    throw new BootstrapError(
      "INITIAL_SUPER_ADMIN_ADDRESS is not set or empty. Please specify a valid EVM wallet address.",
      "MISSING_BOOTSTRAP_ADDRESS",
    );
  }

  const trimmed = rawAddress.trim();
  try {
    return normalizeAddress(trimmed);
  } catch {
    throw new BootstrapError(
      `Invalid EVM wallet address: "${trimmed}". Address must be a 0x-prefixed 40-hex-character string.`,
      "INVALID_BOOTSTRAP_ADDRESS",
    );
  }
}

/**
 * In-process mutex to serialize concurrent bootstrap invocations within the same Node runtime.
 */
class AsyncLock {
  private queue: Promise<void> = Promise.resolve();

  async acquire(): Promise<() => void> {
    let release: () => void;
    const nextLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const currentLock = this.queue;
    this.queue = this.queue.then(() => nextLock);
    await currentLock;
    return release!;
  }
}

const inProcessLock = new AsyncLock();

/**
 * Executes the Super Admin bootstrap operation safely and idempotently.
 *
 * Flow:
 *  1. Resolve target address from parameter or INITIAL_SUPER_ADMIN_ADDRESS environment variable.
 *  2. Validate and normalize address to lowercase.
 *  3. In a transaction (with advisory lock for cross-process concurrency):
 *     - Check if an active (unbanned) Super Admin already exists in the system.
 *     - If an active Super Admin exists:
 *         * If it belongs to the target wallet: complete idempotently without alterations.
 *         * If it belongs to a different account: reject with SUPER_ADMIN_ALREADY_EXISTS.
 *     - If no active Super Admin exists:
 *         * If user + wallet does not exist: create User (SUPER_ADMIN), WalletIdentity, AdminRole (SUPER_ADMIN, ["*"]), AuditLog.
 *         * If user exists but has no AdminRole: promote User (SUPER_ADMIN), create AdminRole (SUPER_ADMIN, ["*"]), AuditLog. (Preserves ban status).
 *         * If user exists and already has AdminRole:
 *             - If roleType === "SUPER_ADMIN": ensure "*" wildcard is in permissions. Return ALREADY_SUPER_ADMIN. (Preserves ban status).
 *             - If roleType !== "SUPER_ADMIN": upgrade role to "SUPER_ADMIN", ensure "*" is included in permissions, create AuditLog. (Preserves ban status).
 */
export async function bootstrapSuperAdmin(
  prisma: PrismaClient,
  rawAddress?: string,
  options?: BootstrapOptions,
): Promise<BootstrapResult> {
  const addressToValidate =
    rawAddress !== undefined ? rawAddress : process.env.INITIAL_SUPER_ADMIN_ADDRESS;

  const normalizedAddress = validateBootstrapAddress(addressToValidate);
  const assignedBy = options?.assignedBy ?? "INITIAL_BOOTSTRAP";

  const releaseMutex = await inProcessLock.acquire();
  try {
    return await prisma.$transaction(async (tx) => {
      // 0. Acquire PostgreSQL transaction-level advisory lock for cross-process concurrency safety
      if (typeof (tx as any).$executeRaw === "function") {
        try {
          await (tx as any).$executeRaw`SELECT pg_advisory_xact_lock(837264821)`;
        } catch {
          // Ignore in test or SQLite environments that do not support pg_advisory_xact_lock
        }
      }

      // 1. Check if WalletIdentity exists for this normalized address
      const wallet = await tx.walletIdentity.findUnique({
        where: { address: normalizedAddress },
        include: {
          user: {
            include: {
              adminRole: true,
            },
          },
        },
      });

      // 2. Check if ANY active (unbanned) Super Admin already exists in the database
      const existingActiveAdminRole = await tx.adminRole.findFirst({
        where: {
          roleType: "SUPER_ADMIN",
          user: {
            isBanned: false,
          },
        },
        include: {
          user: {
            include: {
              wallet: true,
            },
          },
        },
      });

      const existingActiveUser = await tx.user.findFirst({
        where: {
          role: "SUPER_ADMIN",
          isBanned: false,
        },
        include: {
          wallet: true,
          adminRole: true,
        },
      });

      const activeSuperAdmin = existingActiveAdminRole?.user ?? existingActiveUser;

      // If an active Super Admin exists, verify whether it is the target wallet
      if (activeSuperAdmin) {
        const isSameUser =
          (wallet && wallet.userId === activeSuperAdmin.id) ||
          activeSuperAdmin.wallet?.address.toLowerCase() === normalizedAddress;

        if (!isSameUser) {
          throw new BootstrapError(
            `An active Super Admin already exists in the system (User ID: ${activeSuperAdmin.id}). Bootstrap can only be run when no active Super Admin exists.`,
            "SUPER_ADMIN_ALREADY_EXISTS",
          );
        }
      }

      // -------------------------------------------------------------------------
      // Scenario 1: Clean State — Neither User nor WalletIdentity exists
      // -------------------------------------------------------------------------
      if (!wallet) {
        const newUser = await tx.user.create({
          data: {
            role: "SUPER_ADMIN",
            isBanned: false,
            wallet: {
              create: {
                address: normalizedAddress,
                chainId: 1,
              },
            },
            adminRole: {
              create: {
                roleType: "SUPER_ADMIN",
                permissions: ["*"],
                assignedBy,
              },
            },
          },
          include: {
            adminRole: true,
          },
        });

        let auditLogId: string | null = null;
        if (newUser.adminRole) {
          const audit = await recordAuditLog(tx, {
            actorId: newUser.id,
            actorIp: options?.actorIp ?? null,
            userAgent: options?.userAgent ?? null,
            action: "BOOTSTRAP_SUPER_ADMIN",
            entityType: "AdminRole",
            entityId: newUser.adminRole.id,
            newValues: {
              roleType: "SUPER_ADMIN",
              permissions: ["*"],
              address: normalizedAddress,
            },
            metadata: {
              source: "INITIAL_BOOTSTRAP",
              action: "CREATED",
              assignedBy,
            },
          });
          auditLogId = audit.id;
        }

        return {
          ok: true,
          action: "CREATED",
          userId: newUser.id,
          address: normalizedAddress,
          role: "SUPER_ADMIN",
          permissions: ["*"],
          message: `Successfully created User and initialized SUPER_ADMIN for wallet ${shortenAddress(normalizedAddress)}.`,
          auditLogId,
        };
      }

      // -------------------------------------------------------------------------
      // Scenario 2: Existing User without AdminRole
      // -------------------------------------------------------------------------
      const user = wallet.user;
      const existingAdminRole = user.adminRole;

      if (!existingAdminRole) {
        await tx.user.update({
          where: { id: user.id },
          data: {
            role: "SUPER_ADMIN",
          },
        });

        const newAdminRole = await tx.adminRole.create({
          data: {
            userId: user.id,
            roleType: "SUPER_ADMIN",
            permissions: ["*"],
            assignedBy,
          },
        });

        const audit = await recordAuditLog(tx, {
          actorId: user.id,
          actorIp: options?.actorIp ?? null,
          userAgent: options?.userAgent ?? null,
          action: "BOOTSTRAP_SUPER_ADMIN",
          entityType: "AdminRole",
          entityId: newAdminRole.id,
          oldValues: {
            userRole: user.role,
            hasAdminRole: false,
          },
          newValues: {
            roleType: "SUPER_ADMIN",
            permissions: ["*"],
            address: normalizedAddress,
          },
          metadata: {
            source: "INITIAL_BOOTSTRAP",
            action: "PROMOTED",
            assignedBy,
          },
        });

        return {
          ok: true,
          action: "PROMOTED",
          userId: user.id,
          address: normalizedAddress,
          role: "SUPER_ADMIN",
          permissions: ["*"],
          message: `Successfully promoted existing user ${user.id} (${shortenAddress(normalizedAddress)}) to SUPER_ADMIN.`,
          auditLogId: audit.id,
        };
      }

      // -------------------------------------------------------------------------
      // Scenario 3: User already has AdminRole
      // -------------------------------------------------------------------------
      if (existingAdminRole.roleType === "SUPER_ADMIN") {
        const currentPermissions = Array.isArray(existingAdminRole.permissions)
          ? (existingAdminRole.permissions as string[])
          : [];
        const hasWildcard = currentPermissions.includes("*");
        const permissions = hasWildcard
          ? currentPermissions
          : [...currentPermissions, "*"];

        // If missing wildcard, append "*" without dropping existing permissions
        if (!hasWildcard) {
          await tx.adminRole.update({
            where: { id: existingAdminRole.id },
            data: { permissions },
          });
        }

        // Ensure user record is marked SUPER_ADMIN (preserves existing ban status)
        if (user.role !== "SUPER_ADMIN") {
          await tx.user.update({
            where: { id: user.id },
            data: { role: "SUPER_ADMIN" },
          });
        }

        return {
          ok: true,
          action: "ALREADY_SUPER_ADMIN",
          userId: user.id,
          address: normalizedAddress,
          role: "SUPER_ADMIN",
          permissions,
          message: `Wallet ${shortenAddress(normalizedAddress)} already possesses SUPER_ADMIN role. No changes required.`,
          auditLogId: null,
        };
      }

      // Existing AdminRole is a lower tier (ADMIN, MODERATOR, AUDITOR) -> upgrade to SUPER_ADMIN
      const previousRoleType = existingAdminRole.roleType;
      const previousPermissions = Array.isArray(existingAdminRole.permissions)
        ? [...(existingAdminRole.permissions as string[])]
        : [];
      const upgradedPermissions = previousPermissions.includes("*")
        ? previousPermissions
        : [...previousPermissions, "*"];

      await tx.user.update({
        where: { id: user.id },
        data: {
          role: "SUPER_ADMIN",
        },
      });

      const updatedRole = await tx.adminRole.update({
        where: { id: existingAdminRole.id },
        data: {
          roleType: "SUPER_ADMIN",
          permissions: upgradedPermissions,
          assignedBy,
        },
      });

      const audit = await recordAuditLog(tx, {
        actorId: user.id,
        actorIp: options?.actorIp ?? null,
        userAgent: options?.userAgent ?? null,
        action: "BOOTSTRAP_SUPER_ADMIN",
        entityType: "AdminRole",
        entityId: updatedRole.id,
        oldValues: {
          roleType: previousRoleType,
          permissions: previousPermissions,
        },
        newValues: {
          roleType: "SUPER_ADMIN",
          permissions: upgradedPermissions,
          address: normalizedAddress,
        },
        metadata: {
          source: "INITIAL_BOOTSTRAP",
          action: "PROMOTED",
          previousRole: previousRoleType,
          assignedBy,
        },
      });

      return {
        ok: true,
        action: "PROMOTED",
        userId: user.id,
        address: normalizedAddress,
        role: "SUPER_ADMIN",
        permissions: upgradedPermissions,
        message: `Successfully upgraded user ${user.id} (${shortenAddress(normalizedAddress)}) from ${previousRoleType} to SUPER_ADMIN.`,
        auditLogId: audit.id,
      };
    });
  } finally {
    releaseMutex();
  }
}

/**
 * CLI execution handler for standalone bootstrap invocations.
 */
export async function runBootstrapCli(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  injectedPrisma?: PrismaClient,
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
ChimpHood Super Admin Bootstrap Script (Task B-3)
=================================================
Initializes the initial SUPER_ADMIN role safely in staging and production.

Usage:
  INITIAL_SUPER_ADMIN_ADDRESS=0x... npm run admin:bootstrap
  or
  npm run admin:bootstrap -- 0x...
  or
  node scripts/bootstrap-super-admin.mjs [0x...]

Environment Variables:
  DATABASE_URL                (Required) PostgreSQL connection string
  INITIAL_SUPER_ADMIN_ADDRESS (Required if not provided via CLI argument)

Invariants:
  - Validates EVM address and normalizes to lowercase.
  - Only creates/promotes the initial Super Admin when no active Super Admin exists.
  - Rejects execution if an active Super Admin already exists in the database.
  - Safe for repeated executions with the same address (idempotent; never downgrades or duplicates).
  - Preserves user ban status and never modifies or deletes BanRecords.
  - Concurrency protected via transactions, in-process mutex, and advisory locking.
  - No secrets, tokens, or database credentials are ever logged.
`);
    return 0;
  }

  // 1. Resolve address argument or environment variable
  const rawAddress = argv[0] || env.INITIAL_SUPER_ADMIN_ADDRESS;

  // 2. Validate address format
  try {
    validateBootstrapAddress(rawAddress);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[BOOTSTRAP CONFIG ERROR] ${message}`);
    return 1;
  }

  // 3. Ensure DATABASE_URL is configured
  if (!env.DATABASE_URL && !injectedPrisma) {
    console.error(
      "[BOOTSTRAP CONFIG ERROR] DATABASE_URL environment variable is not set. Please provide a valid database connection string.",
    );
    return 1;
  }

  let db = injectedPrisma;
  if (!db) {
    const { prisma } = await import("@/lib/prisma");
    db = prisma;
  }

  try {
    const result = await bootstrapSuperAdmin(db, rawAddress, {
      assignedBy: "CLI_INITIAL_BOOTSTRAP",
    });

    console.log(`[BOOTSTRAP SUCCESS] ${result.message}`);
    console.log(`  Action:      ${result.action}`);
    console.log(`  User ID:     ${result.userId}`);
    console.log(`  Wallet:      ${result.address}`);
    console.log(`  Role:        ${result.role}`);
    console.log(`  Permissions: ${JSON.stringify(result.permissions)}`);
    return 0;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[BOOTSTRAP EXECUTION ERROR] ${message}`);
    return 1;
  } finally {
    if (!injectedPrisma) {
      await db.$disconnect().catch(() => {});
    }
  }
}
