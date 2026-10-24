import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateBootstrapAddress,
  bootstrapSuperAdmin,
  runBootstrapCli,
  BootstrapError,
} from "@/server/admin/bootstrap";
import type { PrismaClient } from "@prisma/client";

interface MockStore {
  users: Array<{
    id: string;
    role: string;
    isBanned: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>;
  walletIdentities: Array<{
    id: string;
    userId: string;
    address: string;
    chainId: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  adminRoles: Array<{
    id: string;
    userId: string;
    roleType: string;
    permissions: string[];
    assignedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  auditLogs: Array<{
    id: string;
    actorId: string | null;
    actorIp: string | null;
    userAgent: string | null;
    action: string;
    entityType: string;
    entityId: string;
    oldValues: unknown;
    newValues: unknown;
    metadata: unknown;
    createdAt: Date;
  }>;
}

function createMockPrisma() {
  const store: MockStore = {
    users: [],
    walletIdentities: [],
    adminRoles: [],
    auditLogs: [],
  };

  const createTxClient = () => {
    return {
      walletIdentity: {
        findUnique: vi.fn(async ({ where, include }: any) => {
          const wallet = store.walletIdentities.find(
            (w) => w.address.toLowerCase() === where.address?.toLowerCase(),
          );
          if (!wallet) return null;

          if (include?.user) {
            const user = store.users.find((u) => u.id === wallet.userId);
            if (!user) return null;

            const adminRole = include.user.include?.adminRole
              ? store.adminRoles.find((r) => r.userId === user.id) || null
              : undefined;

            return {
              ...wallet,
              user: {
                ...user,
                ...(adminRole !== undefined ? { adminRole } : {}),
              },
            };
          }
          return wallet;
        }),
      },
      user: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.users.find((u) => u.id === where.id) || null;
        }),
        create: vi.fn(async ({ data, include }: any) => {
          const userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const user = {
            id: userId,
            role: data.role || "USER",
            isBanned: data.isBanned ?? false,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          store.users.push(user);

          let createdWallet: any = null;
          if (data.wallet?.create) {
            createdWallet = {
              id: `wal_${Date.now()}`,
              userId,
              address: data.wallet.create.address,
              chainId: data.wallet.create.chainId || 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            store.walletIdentities.push(createdWallet);
          }

          let createdAdminRole: any = null;
          if (data.adminRole?.create) {
            createdAdminRole = {
              id: `adm_${Date.now()}`,
              userId,
              roleType: data.adminRole.create.roleType,
              permissions: data.adminRole.create.permissions || [],
              assignedBy: data.adminRole.create.assignedBy || null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            store.adminRoles.push(createdAdminRole);
          }

          return {
            ...user,
            ...(include?.adminRole ? { adminRole: createdAdminRole } : {}),
            ...(include?.wallet ? { wallet: createdWallet } : {}),
          };
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const user = store.users.find((u) => u.id === where.id);
          if (!user) throw new Error("User not found");
          if (data.role !== undefined) user.role = data.role;
          if (data.isBanned !== undefined) user.isBanned = data.isBanned;
          user.updatedAt = new Date();
          return user;
        }),
      },
      adminRole: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.adminRoles.find((r) => r.userId === where.userId) || null;
        }),
        create: vi.fn(async ({ data }: any) => {
          // Verify unique constraint on userId
          const existing = store.adminRoles.find((r) => r.userId === data.userId);
          if (existing) {
            const err = new Error("Unique constraint failed on the fields: (`userId`)");
            (err as any).code = "P2002";
            throw err;
          }

          const record = {
            id: `adm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            userId: data.userId,
            roleType: data.roleType,
            permissions: data.permissions || [],
            assignedBy: data.assignedBy || null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          store.adminRoles.push(record);
          return record;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const role = store.adminRoles.find((r) => r.id === where.id);
          if (!role) throw new Error("AdminRole not found");
          if (data.roleType !== undefined) role.roleType = data.roleType;
          if (data.permissions !== undefined) role.permissions = data.permissions;
          if (data.assignedBy !== undefined) role.assignedBy = data.assignedBy;
          role.updatedAt = new Date();
          return role;
        }),
      },
      auditLog: {
        create: vi.fn(async ({ data }: any) => {
          const record = {
            id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            createdAt: new Date(),
          };
          store.auditLogs.push(record);
          return { id: record.id };
        }),
      },
    };
  };

  const client: any = {
    ...createTxClient(),
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      const tx = createTxClient();
      return await cb(tx);
    }),
    $disconnect: vi.fn(async () => {}),
  };

  return { client: client as unknown as PrismaClient, store };
}

describe("Task B-3: Super Admin Bootstrap Service", () => {
  const VALID_CHECKSUM_ADDRESS = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
  const NORMALIZED_ADDRESS = "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed";
  const SECOND_VALID_ADDRESS = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";

  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.INITIAL_SUPER_ADMIN_ADDRESS;
    delete process.env.INITIAL_SUPER_ADMIN_ADDRESS;
  });

  // ---------------------------------------------------------------------------
  // 1. Address Validation & Normalization
  // ---------------------------------------------------------------------------
  describe("Address Validation & Normalization", () => {
    it("normalizes a valid mixed-case checksummed address to lowercase", () => {
      const result = validateBootstrapAddress(VALID_CHECKSUM_ADDRESS);
      expect(result).toBe(NORMALIZED_ADDRESS);
    });

    it("trims whitespace around a valid address and normalizes to lowercase", () => {
      const padded = `   ${VALID_CHECKSUM_ADDRESS}   `;
      const result = validateBootstrapAddress(padded);
      expect(result).toBe(NORMALIZED_ADDRESS);
    });

    it("accepts an already lower-cased valid EVM address", () => {
      const result = validateBootstrapAddress(NORMALIZED_ADDRESS);
      expect(result).toBe(NORMALIZED_ADDRESS);
    });

    it("throws BootstrapError when address is undefined", () => {
      expect(() => validateBootstrapAddress(undefined)).toThrow(BootstrapError);
      expect(() => validateBootstrapAddress(undefined)).toThrow(
        /INITIAL_SUPER_ADMIN_ADDRESS is not set or empty/,
      );
    });

    it("throws BootstrapError when address is null", () => {
      expect(() => validateBootstrapAddress(null)).toThrow(BootstrapError);
      expect(() => validateBootstrapAddress(null)).toThrow(
        /INITIAL_SUPER_ADMIN_ADDRESS is not set or empty/,
      );
    });

    it("throws BootstrapError when address is empty string or whitespace only", () => {
      expect(() => validateBootstrapAddress("")).toThrow(BootstrapError);
      expect(() => validateBootstrapAddress("   ")).toThrow(
        /INITIAL_SUPER_ADMIN_ADDRESS is not set or empty/,
      );
    });

    it("throws BootstrapError when address is not a string", () => {
      expect(() => validateBootstrapAddress(12345)).toThrow(BootstrapError);
      expect(() => validateBootstrapAddress({})).toThrow(
        /INITIAL_SUPER_ADMIN_ADDRESS is not set or empty/,
      );
    });

    it("rejects EVM address missing 0x prefix", () => {
      const noPrefix = VALID_CHECKSUM_ADDRESS.slice(2);
      expect(() => validateBootstrapAddress(noPrefix)).toThrow(BootstrapError);
      expect(() => validateBootstrapAddress(noPrefix)).toThrow(
        /Invalid EVM wallet address/,
      );
    });

    it("rejects EVM address that is too short or too long", () => {
      expect(() => validateBootstrapAddress("0x123")).toThrow(BootstrapError);
      expect(() => validateBootstrapAddress(NORMALIZED_ADDRESS + "extra")).toThrow(
        BootstrapError,
      );
    });

    it("rejects EVM address containing non-hex characters", () => {
      const invalidHex = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeZZZ";
      expect(() => validateBootstrapAddress(invalidHex)).toThrow(BootstrapError);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Configuration Handling (Environment & Arguments)
  // ---------------------------------------------------------------------------
  describe("Configuration Handling", () => {
    it("fails closed when neither argument nor INITIAL_SUPER_ADMIN_ADDRESS env is provided", async () => {
      const { client } = createMockPrisma();
      delete process.env.INITIAL_SUPER_ADMIN_ADDRESS;

      await expect(bootstrapSuperAdmin(client)).rejects.toThrow(BootstrapError);
      await expect(bootstrapSuperAdmin(client)).rejects.toThrow(
        /INITIAL_SUPER_ADMIN_ADDRESS is not set or empty/,
      );
    });

    it("uses INITIAL_SUPER_ADMIN_ADDRESS from environment when rawAddress is omitted", async () => {
      const { client, store } = createMockPrisma();
      process.env.INITIAL_SUPER_ADMIN_ADDRESS = VALID_CHECKSUM_ADDRESS;

      const result = await bootstrapSuperAdmin(client);
      expect(result.ok).toBe(true);
      expect(result.address).toBe(NORMALIZED_ADDRESS);
      expect(result.action).toBe("CREATED");
      expect(store.adminRoles).toHaveLength(1);
    });

    it("prefers explicit rawAddress argument over environment variable", async () => {
      const { client } = createMockPrisma();
      process.env.INITIAL_SUPER_ADMIN_ADDRESS = VALID_CHECKSUM_ADDRESS;

      const result = await bootstrapSuperAdmin(client, SECOND_VALID_ADDRESS);
      expect(result.ok).toBe(true);
      expect(result.address).toBe(SECOND_VALID_ADDRESS.toLowerCase());
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Clean State Bootstrap (User and Wallet Do Not Exist)
  // ---------------------------------------------------------------------------
  describe("Scenario 1: Clean State Bootstrap", () => {
    it("creates User with role SUPER_ADMIN, WalletIdentity, and AdminRole with wildcard permission", async () => {
      const { client, store } = createMockPrisma();

      const result = await bootstrapSuperAdmin(client, VALID_CHECKSUM_ADDRESS, {
        assignedBy: "TEST_SUITE",
      });

      expect(result.ok).toBe(true);
      expect(result.action).toBe("CREATED");
      expect(result.role).toBe("SUPER_ADMIN");
      expect(result.permissions).toEqual(["*"]);
      expect(result.address).toBe(NORMALIZED_ADDRESS);
      expect(result.auditLogId).toBeDefined();

      // Verify User in store
      expect(store.users).toHaveLength(1);
      const user = store.users[0];
      expect(user.role).toBe("SUPER_ADMIN");
      expect(user.isBanned).toBe(false);

      // Verify WalletIdentity in store
      expect(store.walletIdentities).toHaveLength(1);
      const wallet = store.walletIdentities[0];
      expect(wallet.userId).toBe(user.id);
      expect(wallet.address).toBe(NORMALIZED_ADDRESS);
      expect(wallet.chainId).toBe(1);

      // Verify AdminRole in store
      expect(store.adminRoles).toHaveLength(1);
      const adminRole = store.adminRoles[0];
      expect(adminRole.userId).toBe(user.id);
      expect(adminRole.roleType).toBe("SUPER_ADMIN");
      expect(adminRole.permissions).toEqual(["*"]);
      expect(adminRole.assignedBy).toBe("TEST_SUITE");

      // Verify AuditLog in store (DEC-011)
      expect(store.auditLogs).toHaveLength(1);
      const audit = store.auditLogs[0];
      expect(audit.action).toBe("BOOTSTRAP_SUPER_ADMIN");
      expect(audit.entityType).toBe("AdminRole");
      expect(audit.entityId).toBe(adminRole.id);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Existing User without AdminRole
  // ---------------------------------------------------------------------------
  describe("Scenario 2: Existing User without AdminRole", () => {
    it("promotes an existing standard USER to SUPER_ADMIN and assigns AdminRole", async () => {
      const { client, store } = createMockPrisma();

      // Pre-seed an existing user who previously signed in
      const existingUser = {
        id: "usr_existing_123",
        role: "USER",
        isBanned: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const existingWallet = {
        id: "wal_existing_123",
        userId: existingUser.id,
        address: NORMALIZED_ADDRESS,
        chainId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.users.push(existingUser);
      store.walletIdentities.push(existingWallet);

      const result = await bootstrapSuperAdmin(client, VALID_CHECKSUM_ADDRESS);

      expect(result.ok).toBe(true);
      expect(result.action).toBe("PROMOTED");
      expect(result.userId).toBe(existingUser.id);
      expect(result.role).toBe("SUPER_ADMIN");
      expect(result.permissions).toEqual(["*"]);

      // Verify User record updated
      expect(existingUser.role).toBe("SUPER_ADMIN");

      // Verify AdminRole created
      expect(store.adminRoles).toHaveLength(1);
      expect(store.adminRoles[0].userId).toBe(existingUser.id);
      expect(store.adminRoles[0].roleType).toBe("SUPER_ADMIN");
      expect(store.adminRoles[0].permissions).toEqual(["*"]);

      // Verify AuditLog recorded
      expect(store.auditLogs).toHaveLength(1);
      expect(store.auditLogs[0].action).toBe("BOOTSTRAP_SUPER_ADMIN");
      expect(store.auditLogs[0].newValues).toMatchObject({
        roleType: "SUPER_ADMIN",
        permissions: ["*"],
      });
    });

    it("unbans user if the target user was previously banned", async () => {
      const { client, store } = createMockPrisma();

      const bannedUser = {
        id: "usr_banned_123",
        role: "USER",
        isBanned: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const wallet = {
        id: "wal_banned_123",
        userId: bannedUser.id,
        address: NORMALIZED_ADDRESS,
        chainId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.users.push(bannedUser);
      store.walletIdentities.push(wallet);

      const result = await bootstrapSuperAdmin(client, VALID_CHECKSUM_ADDRESS);
      expect(result.ok).toBe(true);
      expect(bannedUser.isBanned).toBe(false);
      expect(bannedUser.role).toBe("SUPER_ADMIN");
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Idempotency & Repeated Execution
  // ---------------------------------------------------------------------------
  describe("Scenario 3: Idempotency & Repeated Execution", () => {
    it("is completely idempotent: repeated execution does not duplicate records or demote roles", async () => {
      const { client, store } = createMockPrisma();

      // First run: Creates the Super Admin
      const firstRun = await bootstrapSuperAdmin(client, VALID_CHECKSUM_ADDRESS);
      expect(firstRun.ok).toBe(true);
      expect(firstRun.action).toBe("CREATED");
      expect(store.users).toHaveLength(1);
      expect(store.walletIdentities).toHaveLength(1);
      expect(store.adminRoles).toHaveLength(1);

      const createdUserId = store.users[0].id;
      const createdRoleId = store.adminRoles[0].id;

      // Second run: Same address
      const secondRun = await bootstrapSuperAdmin(client, VALID_CHECKSUM_ADDRESS);
      expect(secondRun.ok).toBe(true);
      expect(secondRun.action).toBe("ALREADY_SUPER_ADMIN");
      expect(secondRun.userId).toBe(createdUserId);
      expect(secondRun.role).toBe("SUPER_ADMIN");
      expect(secondRun.permissions).toEqual(["*"]);

      // Third run: Same address in lowercase
      const thirdRun = await bootstrapSuperAdmin(client, NORMALIZED_ADDRESS);
      expect(thirdRun.ok).toBe(true);
      expect(thirdRun.action).toBe("ALREADY_SUPER_ADMIN");

      // Verify no duplicate entities were created
      expect(store.users).toHaveLength(1);
      expect(store.walletIdentities).toHaveLength(1);
      expect(store.adminRoles).toHaveLength(1);

      // Verify role and permissions were not modified or corrupted
      expect(store.adminRoles[0].id).toBe(createdRoleId);
      expect(store.adminRoles[0].roleType).toBe("SUPER_ADMIN");
      expect(store.adminRoles[0].permissions).toEqual(["*"]);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Behavior when AdminRole Already Exists
  // ---------------------------------------------------------------------------
  describe("Scenario 4: Behavior when AdminRole already exists", () => {
    it("upgrades MODERATOR role to SUPER_ADMIN and adds wildcard permission", async () => {
      const { client, store } = createMockPrisma();

      const existingUser = {
        id: "usr_mod_1",
        role: "MODERATOR",
        isBanned: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const wallet = {
        id: "wal_mod_1",
        userId: existingUser.id,
        address: NORMALIZED_ADDRESS,
        chainId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const existingRole = {
        id: "adm_mod_1",
        userId: existingUser.id,
        roleType: "MODERATOR",
        permissions: ["REVIEW_EVIDENCE"],
        assignedBy: "DEV_PORTAL",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.users.push(existingUser);
      store.walletIdentities.push(wallet);
      store.adminRoles.push(existingRole);

      const result = await bootstrapSuperAdmin(client, VALID_CHECKSUM_ADDRESS);

      expect(result.ok).toBe(true);
      expect(result.action).toBe("PROMOTED");
      expect(result.role).toBe("SUPER_ADMIN");
      expect(result.permissions).toContain("*");
      expect(result.permissions).toContain("REVIEW_EVIDENCE");

      // Verify updated in store without duplicates
      expect(store.adminRoles).toHaveLength(1);
      expect(existingRole.roleType).toBe("SUPER_ADMIN");
      expect(existingRole.permissions).toEqual(["REVIEW_EVIDENCE", "*"]);
      expect(existingUser.role).toBe("SUPER_ADMIN");

      // Verify audit log has oldValues and newValues
      expect(store.auditLogs).toHaveLength(1);
      const audit = store.auditLogs[0];
      expect(audit.oldValues).toMatchObject({ roleType: "MODERATOR" });
      expect(audit.newValues).toMatchObject({ roleType: "SUPER_ADMIN" });
    });

    it("upgrades ADMIN role to SUPER_ADMIN without demoting any permissions", async () => {
      const { client, store } = createMockPrisma();

      const existingUser = {
        id: "usr_adm_1",
        role: "ADMIN",
        isBanned: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const wallet = {
        id: "wal_adm_1",
        userId: existingUser.id,
        address: NORMALIZED_ADDRESS,
        chainId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const existingRole = {
        id: "adm_role_1",
        userId: existingUser.id,
        roleType: "ADMIN",
        permissions: ["MANAGE_DROPS", "MANAGE_WL", "MANAGE_BANS"],
        assignedBy: "FOUNDER",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.users.push(existingUser);
      store.walletIdentities.push(wallet);
      store.adminRoles.push(existingRole);

      const result = await bootstrapSuperAdmin(client, VALID_CHECKSUM_ADDRESS);

      expect(result.ok).toBe(true);
      expect(result.action).toBe("PROMOTED");
      expect(result.role).toBe("SUPER_ADMIN");
      expect(result.permissions).toContain("*");
      expect(existingRole.roleType).toBe("SUPER_ADMIN");
      expect(existingRole.permissions).toEqual([
        "MANAGE_DROPS",
        "MANAGE_WL",
        "MANAGE_BANS",
        "*",
      ]);
    });

    it("ensures SUPER_ADMIN role with custom permissions gains wildcard without duplicates", async () => {
      const { client, store } = createMockPrisma();

      const existingUser = {
        id: "usr_super_1",
        role: "SUPER_ADMIN",
        isBanned: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const wallet = {
        id: "wal_super_1",
        userId: existingUser.id,
        address: NORMALIZED_ADDRESS,
        chainId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const existingRole = {
        id: "adm_super_1",
        userId: existingUser.id,
        roleType: "SUPER_ADMIN",
        permissions: ["CUSTOM_PERMISSION"],
        assignedBy: "SYSTEM",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.users.push(existingUser);
      store.walletIdentities.push(wallet);
      store.adminRoles.push(existingRole);

      const result = await bootstrapSuperAdmin(client, VALID_CHECKSUM_ADDRESS);

      expect(result.ok).toBe(true);
      expect(result.action).toBe("ALREADY_SUPER_ADMIN");
      expect(result.permissions).toContain("*");
      expect(result.permissions).toContain("CUSTOM_PERMISSION");
      expect(existingRole.permissions).toEqual(["CUSTOM_PERMISSION", "*"]);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Security & Information Leakage Protection
  // ---------------------------------------------------------------------------
  describe("Security & Secret Isolation", () => {
    it("never includes secrets or sensitive tokens in the returned result", async () => {
      const { client } = createMockPrisma();

      const result = await bootstrapSuperAdmin(client, VALID_CHECKSUM_ADDRESS);
      const serialized = JSON.stringify(result);

      // Verify no sensitive tokens or DB connection keys are leaked
      expect(serialized).not.toContain("password");
      expect(serialized).not.toContain("DATABASE_URL");
      expect(serialized).not.toContain("SESSION_SECRET");
      expect(serialized).not.toContain("CRON_SECRET");
    });
  });

  // ---------------------------------------------------------------------------
  // 8. CLI Runner Tests (runBootstrapCli)
  // ---------------------------------------------------------------------------
  describe("CLI Runner (runBootstrapCli)", () => {
    it("exits with 0 when called with --help or -h", async () => {
      const codeHelp = await runBootstrapCli(["--help"]);
      expect(codeHelp).toBe(0);

      const codeH = await runBootstrapCli(["-h"]);
      expect(codeH).toBe(0);
    });

    it("returns exit code 1 with error message when address is missing", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const code = await runBootstrapCli([], {});
      expect(code).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[BOOTSTRAP CONFIG ERROR]"),
      );
      errorSpy.mockRestore();
    });

    it("returns exit code 1 with error message when address is invalid", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const code = await runBootstrapCli(["not-a-valid-eth-address"], {});
      expect(code).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[BOOTSTRAP CONFIG ERROR]"),
      );
      errorSpy.mockRestore();
    });

    it("returns exit code 1 when DATABASE_URL is missing", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const code = await runBootstrapCli([VALID_CHECKSUM_ADDRESS], {
        // empty env without DATABASE_URL
      });
      expect(code).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("DATABASE_URL environment variable is not set"),
      );
      errorSpy.mockRestore();
    });

    it("returns exit code 0 on successful execution when injected with prisma", async () => {
      const { client } = createMockPrisma();
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const code = await runBootstrapCli(
        [VALID_CHECKSUM_ADDRESS],
        { DATABASE_URL: "postgresql://localhost:5432/test" },
        client,
      );
      expect(code).toBe(0);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[BOOTSTRAP SUCCESS]"));
      logSpy.mockRestore();
    });
  });
});
