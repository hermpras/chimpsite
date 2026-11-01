import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getPreExportAuditSummary,
  resolveProgramForAudit,
  OpenSeaExportError,
} from "@/server/admin/opensea-export";

vi.mock("@/server/whitelist/qualification", () => ({
  executeQualificationEvaluation: vi.fn(),
}));

import { executeQualificationEvaluation } from "@/server/whitelist/qualification";

describe("Pre-Export Audit Summary Service (Task 4.1)", () => {
  let mockPrisma: any;

  const validAddress1 = "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed";
  const validAddress2 = "0x71c89f074d310ec5e427773cb20a44ef69d7a229";
  const validAddress3 = "0x8626f6940e2eb28930efb4cef49b2d1f2c9c1199";
  const validAddress4 = "0x000000000000000000000000000000000000dead";

  const defaultProgram = {
    id: "prog_1",
    slug: "chimphood-wl-main",
    name: "Main Program",
    status: "FINALIZED",
    totalSlots: 100,
    allocatedSlotsCount: 2,
    createdAt: new Date("2026-10-01"),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma = {
      wLProgram: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      wLSlot: {
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      wLQueueEntry: {
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      wLQualification: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
      },
      wLStatusHistory: {
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
    };
  });

  describe("Program Resolution Guard (resolveProgramForAudit)", () => {
    it("resolves specific program when programIdOrSlug is provided", async () => {
      mockPrisma.wLProgram.findFirst.mockResolvedValueOnce(defaultProgram);

      const resolved = await resolveProgramForAudit(mockPrisma, "prog_1");
      expect(resolved.id).toBe("prog_1");
      expect(mockPrisma.wLProgram.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ id: "prog_1" }, { slug: "prog_1" }] },
      });
    });

    it("throws 404 PROGRAM_NOT_FOUND if programIdOrSlug does not exist", async () => {
      mockPrisma.wLProgram.findFirst.mockResolvedValueOnce(null);

      await expect(
        resolveProgramForAudit(mockPrisma, "nonexistent"),
      ).rejects.toMatchObject({
        code: "PROGRAM_NOT_FOUND",
        status: 404,
      });
    });

    it("throws 404 NO_PROGRAMS_FOUND if omitted and 0 programs exist", async () => {
      mockPrisma.wLProgram.findMany.mockResolvedValueOnce([]);

      await expect(resolveProgramForAudit(mockPrisma)).rejects.toMatchObject({
        code: "NO_PROGRAMS_FOUND",
        status: 404,
      });
    });

    it("auto-selects single program when omitted and exactly 1 program exists", async () => {
      mockPrisma.wLProgram.findMany.mockResolvedValueOnce([defaultProgram]);

      const resolved = await resolveProgramForAudit(mockPrisma);
      expect(resolved.id).toBe("prog_1");
    });

    it("throws 400 AMBIGUOUS_PROGRAM_SELECTION when omitted and >1 programs exist", async () => {
      mockPrisma.wLProgram.findMany.mockResolvedValueOnce([
        defaultProgram,
        { ...defaultProgram, id: "prog_2", slug: "prog-two" },
      ]);

      await expect(resolveProgramForAudit(mockPrisma)).rejects.toMatchObject({
        code: "AMBIGUOUS_PROGRAM_SELECTION",
        status: 400,
      });
    });
  });

  describe("Zero Database Mutation Guarantee (AC-4.1.1)", () => {
    it("guarantees zero writes/mutations to wLSlot, wLQueueEntry, wLQualification, wLStatusHistory, and auditLog", async () => {
      mockPrisma.wLProgram.findFirst.mockResolvedValueOnce(defaultProgram);
      mockPrisma.wLSlot.findMany.mockResolvedValueOnce([]);
      mockPrisma.wLQueueEntry.findMany.mockResolvedValueOnce([]);

      const result = await getPreExportAuditSummary({
        prisma: mockPrisma,
        programIdOrSlug: defaultProgram.id,
      });

      expect(result).toBeDefined();
      expect(mockPrisma.wLProgram.create).not.toHaveBeenCalled();
      expect(mockPrisma.wLProgram.update).not.toHaveBeenCalled();
      expect(mockPrisma.wLSlot.create).not.toHaveBeenCalled();
      expect(mockPrisma.wLSlot.update).not.toHaveBeenCalled();
      expect(mockPrisma.wLQueueEntry.create).not.toHaveBeenCalled();
      expect(mockPrisma.wLQueueEntry.update).not.toHaveBeenCalled();
      expect(mockPrisma.wLQualification.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.wLStatusHistory.create).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it("evaluates qualifications with readOnly: true and allowClosed: true", async () => {
      mockPrisma.wLProgram.findFirst.mockResolvedValueOnce({
        ...defaultProgram,
        status: "CLOSED",
      });
      mockPrisma.wLSlot.findMany.mockResolvedValueOnce([]);
      mockPrisma.wLQueueEntry.findMany.mockResolvedValueOnce([
        {
          id: "q_1",
          status: "WAITING",
          user: {
            id: "u_candidate_1",
            isBanned: false,
            wallet: { address: validAddress1 },
          },
        },
      ]);

      (executeQualificationEvaluation as any).mockResolvedValueOnce({
        qualified: true,
        phase: "QUALIFIED",
        missingRequirements: [],
      });

      const result = await getPreExportAuditSummary({
        prisma: mockPrisma,
        programIdOrSlug: defaultProgram.id,
      });

      expect(result.fcfs.qualifiedReadyCount).toBe(1);
      expect(executeQualificationEvaluation).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({
          userId: "u_candidate_1",
          programId: defaultProgram.id,
          readOnly: true,
          allowClosed: true,
        }),
        expect.any(Date),
      );
    });
  });

  describe("5-Category MECE Accounting & Disjoint Set Verification", () => {
    it("correctly partitions all directory entries into 5 mutually exclusive categories without overlap", async () => {
      mockPrisma.wLProgram.findFirst.mockResolvedValueOnce({
        ...defaultProgram,
        totalSlots: 10,
        allocatedSlotsCount: 2,
      });

      // Active GTD slots in DB:
      // slot 1 has validAddress1 (FLAGGED)
      // slot 2 has validAddress2 (VALID)
      mockPrisma.wLSlot.findMany.mockResolvedValueOnce([
        {
          id: "slot_1",
          slotNumber: 1,
          status: "ALLOCATED",
          reviewStatus: "FLAGGED",
          user: {
            id: "user_gtd_1",
            isBanned: false,
            wallet: { address: validAddress1 },
          },
        },
        {
          id: "slot_2",
          slotNumber: 2,
          status: "CONFIRMED",
          reviewStatus: "VALID",
          user: {
            id: "user_gtd_2",
            isBanned: false,
            wallet: { address: validAddress2 },
          },
        },
      ]);

      // FCFS Directory with 6 participants covering every possible state:
      // 1. user_banned: isBanned = true -> bannedOrDisqualified
      // 2. user_cancelled: status CANCELLED -> inactiveDirectoryEntries
      // 3. user_processed: status PROCESSED -> alreadyGtd
      // 4. user_under: status WAITING, qualified = false -> underQualified
      // 5. user_overlap: status WAITING, qualified = true, wallet = validAddress1 (overlaps with GTD slot 1!) -> alreadyGtd
      // 6. user_ready: status WAITING, qualified = true, wallet = validAddress3 (no GTD) -> qualifiedReady
      mockPrisma.wLQueueEntry.findMany.mockResolvedValueOnce([
        {
          id: "q_banned",
          status: "WAITING",
          user: {
            id: "user_banned",
            isBanned: true,
            wallet: { address: "0x1111111111111111111111111111111111111111" },
          },
        },
        {
          id: "q_cancelled",
          status: "CANCELLED",
          user: {
            id: "user_cancelled",
            isBanned: false,
            wallet: { address: "0x2222222222222222222222222222222222222222" },
          },
        },
        {
          id: "q_processed",
          status: "PROCESSED",
          user: {
            id: "user_processed",
            isBanned: false,
            wallet: { address: "0x3333333333333333333333333333333333333333" },
          },
        },
        {
          id: "q_under",
          status: "WAITING",
          user: {
            id: "user_under",
            isBanned: false,
            wallet: { address: "0x4444444444444444444444444444444444444444" },
          },
        },
        {
          id: "q_overlap",
          status: "WAITING",
          user: {
            id: "user_overlap",
            isBanned: false,
            wallet: { address: validAddress1 }, // Overlaps with GTD slot 1
          },
        },
        {
          id: "q_ready",
          status: "WAITING",
          user: {
            id: "user_ready",
            isBanned: false,
            wallet: { address: validAddress3 }, // Disjoint from GTD
          },
        },
      ]);

      // Mock executeQualificationEvaluation:
      // user_under -> qualified: false
      // user_overlap -> qualified: true
      // user_ready -> qualified: true
      (executeQualificationEvaluation as any).mockImplementation(
        async (_prisma: any, input: any) => {
          if (input.userId === "user_under") {
            return { qualified: false, missingRequirements: ["Missing traits"] };
          }
          return { qualified: true, missingRequirements: [] };
        },
      );

      const summary = await getPreExportAuditSummary({
        prisma: mockPrisma,
        programIdOrSlug: defaultProgram.id,
      });

      // GTD Metrics
      expect(summary.gtd.totalSlots).toBe(10);
      expect(summary.gtd.allocatedCount).toBe(2);
      expect(summary.gtd.vacantCount).toBe(8);
      expect(summary.gtd.flaggedCount).toBe(1); // slot_1 is FLAGGED
      expect(summary.gtd.walletsCount).toBe(2);

      // FCFS MECE Accounting
      expect(summary.fcfs.totalDirectoryEntries).toBe(6);
      expect(summary.fcfs.bannedOrDisqualifiedCount).toBe(1); // user_banned
      expect(summary.fcfs.inactiveDirectoryEntriesCount).toBe(1); // user_cancelled
      expect(summary.fcfs.underQualifiedCount).toBe(1); // user_under
      expect(summary.fcfs.alreadyGtdCount).toBe(2); // user_processed + user_overlap
      expect(summary.fcfs.qualifiedReadyCount).toBe(1); // user_ready
      expect(summary.fcfs.accountingBalanceCheck).toBe(true);

      // Verify mathematical balance:
      const sum =
        summary.fcfs.bannedOrDisqualifiedCount +
        summary.fcfs.inactiveDirectoryEntriesCount +
        summary.fcfs.underQualifiedCount +
        summary.fcfs.alreadyGtdCount +
        summary.fcfs.qualifiedReadyCount;
      expect(sum).toBe(summary.fcfs.totalDirectoryEntries);

      // Real Dynamic Disjoint Set Verification:
      // user_overlap matched validAddress1 in GTD!
      expect(summary.disjointVerification.disjointSetVerified).toBe(false);
      expect(summary.disjointVerification.overlappingWalletsCount).toBe(1);
      expect(summary.disjointVerification.overlappingWallets).toContain(
        validAddress1.toLowerCase(),
      );
    });

    it("verifies disjointSetVerified === true when zero qualified candidates overlap with GTD", async () => {
      mockPrisma.wLProgram.findFirst.mockResolvedValueOnce(defaultProgram);

      mockPrisma.wLSlot.findMany.mockResolvedValueOnce([
        {
          id: "slot_1",
          slotNumber: 1,
          status: "ALLOCATED",
          user: {
            id: "user_gtd_1",
            isBanned: false,
            wallet: { address: validAddress1 },
          },
        },
      ]);

      mockPrisma.wLQueueEntry.findMany.mockResolvedValueOnce([
        {
          id: "q_1",
          status: "WAITING",
          user: {
            id: "user_candidate_1",
            isBanned: false,
            wallet: { address: validAddress2 }, // Disjoint from validAddress1
          },
        },
        {
          id: "q_2",
          status: "WAITING",
          user: {
            id: "user_candidate_2",
            isBanned: false,
            wallet: { address: validAddress3 }, // Disjoint from validAddress1
          },
        },
      ]);

      (executeQualificationEvaluation as any).mockResolvedValue({
        qualified: true,
        missingRequirements: [],
      });

      const summary = await getPreExportAuditSummary({
        prisma: mockPrisma,
        programIdOrSlug: defaultProgram.id,
      });

      expect(summary.disjointVerification.disjointSetVerified).toBe(true);
      expect(summary.disjointVerification.overlappingWalletsCount).toBe(0);
      expect(summary.disjointVerification.overlappingWallets).toEqual([]);
      expect(summary.fcfs.qualifiedReadyCount).toBe(2);
      expect(summary.fcfs.alreadyGtdCount).toBe(0);
      expect(summary.fcfs.accountingBalanceCheck).toBe(true);
    });

    it("counts revoked participants under bannedOrDisqualifiedCount and strictly excludes them from qualifiedReadyCount (DEC-022)", async () => {
      mockPrisma.wLProgram.findFirst.mockResolvedValueOnce(defaultProgram);
      mockPrisma.wLSlot.findMany.mockResolvedValueOnce([]); // No GTD slots

      mockPrisma.wLQueueEntry.findMany.mockResolvedValueOnce([
        {
          id: "q_revoked",
          status: "WAITING",
          user: {
            id: "user_revoked",
            isBanned: false,
            wallet: { address: validAddress1 },
            banRecords: [],
            wlQualifications: [{ status: "REVOKED" }],
          },
        },
        {
          id: "q_valid",
          status: "WAITING",
          user: {
            id: "user_valid",
            isBanned: false,
            wallet: { address: validAddress2 },
            banRecords: [],
            wlQualifications: [{ status: "QUALIFIED" }],
          },
        },
      ]);

      (executeQualificationEvaluation as any).mockResolvedValue({
        qualified: true,
        missingRequirements: [],
      });

      const summary = await getPreExportAuditSummary({
        prisma: mockPrisma,
        programIdOrSlug: defaultProgram.id,
      });

      // user_revoked must be counted in bannedOrDisqualifiedCount, NOT in qualifiedReadyCount
      expect(summary.fcfs.totalDirectoryEntries).toBe(2);
      expect(summary.fcfs.bannedOrDisqualifiedCount).toBe(1);
      expect(summary.fcfs.qualifiedReadyCount).toBe(1);
      expect(summary.fcfs.accountingBalanceCheck).toBe(true);
    });
  });
});
