import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  exportOpenSeaAllowlist,
  getGTDWallets,
  getFCFSWallets,
  isProgramClosed,
  isUserBanned,
  formatOpenSeaAllowlistCsv,
  OpenSeaExportError,
} from "@/server/admin/opensea-export";

describe("OpenSea Allowlist Export Service", () => {
  let mockPrisma: any;

  const validAddress1 = "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed";
  const validAddress2 = "0x71c89f074d310ec5e427773cb20a44ef69d7a229";
  const validAddress3 = "0x8626f6940e2eb28930efb4cef49b2d1f2c9c1199";
  const validAddress4 = "0x000000000000000000000000000000000000dEaD";

  beforeEach(() => {
    mockPrisma = {
      wLProgram: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      wLSlot: {
        findMany: vi.fn(),
      },
      wLQueueEntry: {
        findMany: vi.fn(),
      },
    };
  });

  describe("Program Status Evaluation (isProgramClosed)", () => {
    it("returns true for status FINALIZED or CLOSED", () => {
      expect(isProgramClosed({ status: "FINALIZED" })).toBe(true);
      expect(isProgramClosed({ status: "CLOSED" })).toBe(true);
    });

    it("returns false for status UPCOMING, OPEN, or PAUSED when endsAt is in future or null", () => {
      const future = new Date(Date.now() + 100000);
      expect(isProgramClosed({ status: "UPCOMING", endsAt: null })).toBe(false);
      expect(isProgramClosed({ status: "OPEN", endsAt: future })).toBe(false);
      expect(isProgramClosed({ status: "PAUSED", endsAt: null })).toBe(false);
    });

    it("returns true when endsAt timestamp has passed, even if status is OPEN", () => {
      const past = new Date(Date.now() - 100000);
      expect(isProgramClosed({ status: "OPEN", endsAt: past })).toBe(true);
    });
  });

  describe("Ban Evaluation (isUserBanned)", () => {
    it("returns true if user.isBanned is true", () => {
      expect(isUserBanned({ isBanned: true })).toBe(true);
    });

    it("returns true if user has active FULL_SYSTEM or WL_DISQUALIFIED ban record", () => {
      expect(
        isUserBanned({
          isBanned: false,
          banRecords: [
            {
              isActive: true,
              expiresAt: null,
              scope: "WL_DISQUALIFIED",
            },
          ],
        }),
      ).toBe(true);

      expect(
        isUserBanned({
          isBanned: false,
          banRecords: [
            {
              isActive: true,
              expiresAt: new Date(Date.now() + 60000),
              scope: "FULL_SYSTEM",
            },
          ],
        }),
      ).toBe(true);
    });

    it("returns false if ban record is expired or inactive", () => {
      expect(
        isUserBanned({
          isBanned: false,
          banRecords: [
            {
              isActive: false,
              expiresAt: null,
              scope: "FULL_SYSTEM",
            },
            {
              isActive: true,
              expiresAt: new Date(Date.now() - 60000), // expired
              scope: "WL_DISQUALIFIED",
            },
          ],
        }),
      ).toBe(false);
    });

    it("returns false for unrelated ban scopes like CLAIM_RESTRICTED or GIFT_RESTRICTED", () => {
      expect(
        isUserBanned({
          isBanned: false,
          banRecords: [
            {
              isActive: true,
              expiresAt: null,
              scope: "GIFT_RESTRICTED",
            },
          ],
        }),
      ).toBe(false);
    });
  });

  describe("CSV Formatting (formatOpenSeaAllowlistCsv)", () => {
    it("returns empty string for empty wallet list", () => {
      expect(formatOpenSeaAllowlistCsv([])).toBe("");
    });

    it("formats each row as address,1 without header and ends with newline", () => {
      const csv = formatOpenSeaAllowlistCsv([validAddress1, validAddress2]);
      const lines = csv.trim().split("\n");
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe(`${validAddress1},1`);
      expect(lines[1]).toBe(`${validAddress2},1`);
      expect(csv.endsWith("\n")).toBe(true);
    });
  });

  describe("GTD Allowlist Generation (getGTDWallets)", () => {
    it("extracts active ALLOCATED and CONFIRMED slots, normalizes addresses, and skips banned/disqualified", async () => {
      mockPrisma.wLSlot.findMany.mockResolvedValueOnce([
        {
          id: "slot_1",
          slotNumber: 1,
          status: "ALLOCATED",
          user: {
            id: "user_1",
            isBanned: false,
            wallet: { address: validAddress1.toUpperCase() }, // Full uppercase including 0X prefix
            banRecords: [],
            wlQualifications: [{ status: "QUALIFIED" }],
          },
        },
        {
          id: "slot_2",
          slotNumber: 2,
          status: "CONFIRMED",
          user: {
            id: "user_2",
            isBanned: false,
            wallet: { address: validAddress2 },
            banRecords: [],
            wlQualifications: [{ status: "QUALIFIED" }],
          },
        },
        {
          id: "slot_3",
          slotNumber: 3,
          status: "ALLOCATED",
          user: {
            id: "user_banned",
            isBanned: true, // Should be excluded!
            wallet: { address: validAddress3 },
            banRecords: [],
            wlQualifications: [{ status: "QUALIFIED" }],
          },
        },
        {
          id: "slot_4",
          slotNumber: 4,
          status: "ALLOCATED",
          user: {
            id: "user_disqualified",
            isBanned: false,
            wallet: { address: validAddress4 },
            banRecords: [],
            wlQualifications: [{ status: "REVOKED" }], // Should be excluded!
          },
        },
        {
          id: "slot_5",
          slotNumber: 5,
          status: "ALLOCATED",
          user: {
            id: "user_invalid_addr",
            isBanned: false,
            wallet: { address: "not-an-evm-address" }, // Invalid!
            banRecords: [],
            wlQualifications: [{ status: "QUALIFIED" }],
          },
        },
      ]);

      const wallets = await getGTDWallets(mockPrisma, "prog_1");

      expect(wallets).toHaveLength(2);
      expect(wallets[0]).toBe(validAddress1.toLowerCase());
      expect(wallets[1]).toBe(validAddress2.toLowerCase());
    });

    it("deduplicates multiple slots associated with the same normalized wallet address", async () => {
      mockPrisma.wLSlot.findMany.mockResolvedValueOnce([
        {
          id: "slot_1",
          slotNumber: 1,
          status: "ALLOCATED",
          user: {
            id: "user_1",
            isBanned: false,
            wallet: { address: validAddress1.toLowerCase() },
            banRecords: [],
            wlQualifications: [{ status: "QUALIFIED" }],
          },
        },
        {
          id: "slot_2",
          slotNumber: 2,
          status: "CONFIRMED",
          user: {
            id: "user_1_duplicate",
            isBanned: false,
            wallet: { address: "0x" + validAddress1.slice(2).toUpperCase() },
            banRecords: [],
            wlQualifications: [{ status: "QUALIFIED" }],
          },
        },
      ]);

      const wallets = await getGTDWallets(mockPrisma, "prog_1");

      expect(wallets).toHaveLength(1);
      expect(wallets[0]).toBe(validAddress1.toLowerCase());
    });
  });

  describe("FCFS Allowlist Generation (getFCFSWallets)", () => {
    it("extracts WAITING queue entries and strictly excludes all GTD wallets", async () => {
      const gtdSet = new Set<string>([validAddress1.toLowerCase()]);

      mockPrisma.wLQueueEntry.findMany.mockResolvedValueOnce([
        {
          id: "q_1",
          queueNumber: 1,
          status: "WAITING",
          priorityScore: 100,
          user: {
            id: "user_in_gtd",
            isBanned: false,
            wallet: { address: validAddress1 }, // In GTD! Must be excluded!
            banRecords: [],
            wlQualifications: [{ status: "QUALIFIED" }],
          },
        },
        {
          id: "q_2",
          queueNumber: 2,
          status: "WAITING",
          priorityScore: 50,
          user: {
            id: "user_fcfs_valid",
            isBanned: false,
            wallet: { address: validAddress2 },
            banRecords: [],
            wlQualifications: [{ status: "QUALIFIED" }],
          },
        },
        {
          id: "q_3",
          queueNumber: 3,
          status: "WAITING",
          priorityScore: 10,
          user: {
            id: "user_fcfs_banned",
            isBanned: false,
            wallet: { address: validAddress3 },
            banRecords: [{ isActive: true, expiresAt: null, scope: "WL_DISQUALIFIED" }], // Banned!
            wlQualifications: [{ status: "QUALIFIED" }],
          },
        },
      ]);

      const wallets = await getFCFSWallets(mockPrisma, "prog_1", gtdSet);

      // Only validAddress2 should be in FCFS
      expect(wallets).toHaveLength(1);
      expect(wallets[0]).toBe(validAddress2.toLowerCase());
      expect(wallets.includes(validAddress1.toLowerCase())).toBe(false);
    });

    it("deduplicates multiple queue entries for the same wallet", async () => {
      const gtdSet = new Set<string>();

      mockPrisma.wLQueueEntry.findMany.mockResolvedValueOnce([
        {
          id: "q_1",
          queueNumber: 1,
          status: "WAITING",
          priorityScore: 50,
          user: {
            id: "user_1",
            isBanned: false,
            wallet: { address: validAddress2.toLowerCase() },
            banRecords: [],
            wlQualifications: [{ status: "QUALIFIED" }],
          },
        },
        {
          id: "q_2",
          queueNumber: 2,
          status: "WAITING",
          priorityScore: 40,
          user: {
            id: "user_2_dup",
            isBanned: false,
            wallet: { address: "0x" + validAddress2.slice(2).toUpperCase() },
            banRecords: [],
            wlQualifications: [{ status: "QUALIFIED" }],
          },
        },
      ]);

      const wallets = await getFCFSWallets(mockPrisma, "prog_1", gtdSet);
      expect(wallets).toHaveLength(1);
      expect(wallets[0]).toBe(validAddress2.toLowerCase());
    });
  });

  describe("exportOpenSeaAllowlist Service Orchestration", () => {
    const frozenProgram = {
      id: "prog_finalized",
      slug: "chimphood-wl-main",
      name: "ChimpHood Whitelist Genesis",
      status: "FINALIZED",
      endsAt: null,
    };

    it("rejects invalid stage parameter", async () => {
      await expect(
        exportOpenSeaAllowlist({
          prisma: mockPrisma,
          stage: "invalid-stage",
        }),
      ).rejects.toThrow(OpenSeaExportError);
    });

    it("throws 404 if program is not found", async () => {
      mockPrisma.wLProgram.findFirst.mockResolvedValueOnce(null);
      mockPrisma.wLProgram.findUnique.mockResolvedValueOnce(null);

      await expect(
        exportOpenSeaAllowlist({
          prisma: mockPrisma,
          stage: "gtd",
          programIdOrSlug: "nonexistent",
        }),
      ).rejects.toMatchObject({
        code: "PROGRAM_NOT_FOUND",
        status: 404,
      });
    });

    it("throws 409 if program is still open / active", async () => {
      mockPrisma.wLProgram.findFirst.mockResolvedValueOnce({
        id: "prog_open",
        slug: "chimphood-wl-main",
        name: "Active Program",
        status: "OPEN",
        endsAt: new Date(Date.now() + 100000), // in future
      });

      await expect(
        exportOpenSeaAllowlist({
          prisma: mockPrisma,
          stage: "gtd",
          programIdOrSlug: "prog_open",
        }),
      ).rejects.toMatchObject({
        code: "PROGRAM_NOT_FINALIZED",
        status: 409,
      });
    });

    it("exports GTD allowlist with filename chimphood-gtd-allowlist.csv", async () => {
      mockPrisma.wLProgram.findFirst.mockResolvedValueOnce(frozenProgram);

      mockPrisma.wLSlot.findMany.mockResolvedValueOnce([
        {
          id: "slot_1",
          slotNumber: 1,
          status: "ALLOCATED",
          user: {
            id: "u1",
            isBanned: false,
            wallet: { address: validAddress1 },
            banRecords: [],
            wlQualifications: [{ status: "QUALIFIED" }],
          },
        },
      ]);

      const result = await exportOpenSeaAllowlist({
        prisma: mockPrisma,
        stage: "gtd",
        programIdOrSlug: frozenProgram.id,
      });

      expect(result.filename).toBe("chimphood-gtd-allowlist.csv");
      expect(result.count).toBe(1);
      expect(result.stage).toBe("gtd");
      expect(result.csv).toBe(`${validAddress1.toLowerCase()},1\n`);
    });

    it("exports FCFS allowlist with filename chimphood-fcfs-allowlist.csv and guarantees disjointness", async () => {
      mockPrisma.wLProgram.findFirst.mockResolvedValueOnce(frozenProgram);

      // GTD slot query (run even for FCFS to guarantee disjointness!)
      mockPrisma.wLSlot.findMany.mockResolvedValueOnce([
        {
          id: "slot_1",
          slotNumber: 1,
          status: "ALLOCATED",
          user: {
            id: "u1",
            isBanned: false,
            wallet: { address: validAddress1 },
            banRecords: [],
            wlQualifications: [{ status: "QUALIFIED" }],
          },
        },
      ]);

      // FCFS queue query contains u1 (who has GTD slot) and u2 (who only has FCFS)
      mockPrisma.wLQueueEntry.findMany.mockResolvedValueOnce([
        {
          id: "q_1",
          queueNumber: 1,
          status: "WAITING",
          priorityScore: 100,
          user: {
            id: "u1",
            isBanned: false,
            wallet: { address: validAddress1 }, // Must be excluded because it's in GTD!
            banRecords: [],
            wlQualifications: [{ status: "QUALIFIED" }],
          },
        },
        {
          id: "q_2",
          queueNumber: 2,
          status: "WAITING",
          priorityScore: 80,
          user: {
            id: "u2",
            isBanned: false,
            wallet: { address: validAddress2 },
            banRecords: [],
            wlQualifications: [{ status: "QUALIFIED" }],
          },
        },
      ]);

      const result = await exportOpenSeaAllowlist({
        prisma: mockPrisma,
        stage: "fcfs",
        programIdOrSlug: frozenProgram.id,
      });

      expect(result.filename).toBe("chimphood-fcfs-allowlist.csv");
      expect(result.count).toBe(1);
      expect(result.stage).toBe("fcfs");
      expect(result.csv).toBe(`${validAddress2.toLowerCase()},1\n`);
      expect(result.csv.includes(validAddress1.toLowerCase())).toBe(false);
    });
  });
});
