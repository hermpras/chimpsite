import { describe, it, expect, vi, beforeEach } from "vitest";
import { listFcfsDirectory, AdminFcfsDirectoryError } from "@/server/admin/fcfs-directory";
import * as qualEngine from "@/server/whitelist/qualification";

describe("FCFS Directory Service (DEC-013, DEC-017, Phase 6)", () => {
  let mockPrisma: any;
  let mockProgram: any;
  let mockQueueEntries: any[];

  beforeEach(() => {
    vi.clearAllMocks();

    mockProgram = {
      id: "prog-genesis",
      slug: "genesis",
      name: "ChimpHood Genesis",
      status: "OPEN",
      totalSlots: 500,
      allocatedSlotsCount: 450,
      createdAt: new Date("2026-10-01T00:00:00Z"),
    };

    mockQueueEntries = [
      {
        id: "qe-2",
        userId: "user-2",
        programId: "prog-genesis",
        queueNumber: 2,
        joinedAt: new Date("2026-10-02T10:00:00Z"),
        status: "WAITING",
        user: {
          id: "user-2",
          isBanned: false,
          wallet: { address: "0x2222222222222222222222222222222222222222" },
          xIdentity: {
            xId: "x-2",
            username: "chimp_beta",
            name: "Beta Chimp",
            profileImageUrl: "https://x.com/avatar2.png",
          },
          banRecords: [],
        },
      },
      {
        id: "qe-1",
        userId: "user-1",
        programId: "prog-genesis",
        queueNumber: 1,
        joinedAt: new Date("2026-10-01T10:00:00Z"),
        status: "WAITING",
        user: {
          id: "user-1",
          isBanned: false,
          wallet: { address: "0x1111111111111111111111111111111111111111" },
          xIdentity: {
            xId: "x-1",
            username: "chimp_alpha",
            name: "Alpha Chimp",
            profileImageUrl: "https://x.com/avatar1.png",
          },
          banRecords: [],
        },
      },
      {
        id: "qe-3",
        userId: "user-3",
        programId: "prog-genesis",
        queueNumber: 3,
        joinedAt: new Date("2026-10-03T10:00:00Z"),
        status: "WAITING",
        user: {
          id: "user-3",
          isBanned: false,
          wallet: { address: "0x3333333333333333333333333333333333333333" },
          xIdentity: {
            xId: "x-3",
            username: "chimp_gamma",
            name: "Gamma Chimp",
            profileImageUrl: null,
          },
          banRecords: [],
        },
      },
    ];

    mockPrisma = {
      wLProgram: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.id === mockProgram.id || where.slug === mockProgram.slug) {
            return mockProgram;
          }
          return null;
        }),
        findFirst: vi.fn(async () => mockProgram),
      },
      wLQueueEntry: {
        findMany: vi.fn(async ({ orderBy, where }: any) => {
          // Verify that query strictly uses joinedAt asc and queueNumber asc
          expect(orderBy).toEqual([
            { joinedAt: "asc" },
            { queueNumber: "asc" },
          ]);

          let filtered = [...mockQueueEntries];
          if (where?.user?.OR) {
            const rawSearch = where.user.OR[1].xIdentity.username.contains;
            const lowerSearch = where.user.OR[0].wallet.address.contains;
            filtered = filtered.filter(
              (e) =>
                e.user.wallet.address.toLowerCase().includes(lowerSearch) ||
                e.user.xIdentity.username.includes(rawSearch),
            );
          }

          // Sort by joinedAt ASC, queueNumber ASC
          return filtered.sort((a, b) => {
            const timeDiff = a.joinedAt.getTime() - b.joinedAt.getTime();
            if (timeDiff !== 0) return timeDiff;
            return a.queueNumber - b.queueNumber;
          });
        }),
      },
    };
  });

  it("lists entries strictly sorted by joinedAt ASC, queueNumber ASC without priorityScore", async () => {
    vi.spyOn(qualEngine, "executeQualificationEvaluation").mockResolvedValue({
      qualified: true,
      phase: "NONE",
      missingRequirements: [],
      details: {
        hasVerifiedWallet: true,
        hasLinkedX: true,
        heldCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
        missingCategories: [],
        completedMandatoryTasksCount: 2,
        totalMandatoryTasksCount: 2,
        isBanned: false,
      },
    } as any);

    const result = await listFcfsDirectory(mockPrisma);

    expect(result.entries).toHaveLength(3);
    expect(result.entries[0].userId).toBe("user-1");
    expect(result.entries[0].queueNumber).toBe(1);
    expect(result.entries[1].userId).toBe("user-2");
    expect(result.entries[1].queueNumber).toBe(2);
    expect(result.entries[2].userId).toBe("user-3");
    expect(result.entries[2].queueNumber).toBe(3);

    expect(result.program.vacantCount).toBe(50); // 500 - 450
  });

  it("evaluates qualification status correctly for each participant", async () => {
    vi.spyOn(qualEngine, "executeQualificationEvaluation").mockImplementation(
      async (_prisma: any, { userId }: any) => {
        if (userId === "user-1") {
          return {
            qualified: true,
            phase: "NONE",
            missingRequirements: [],
            details: {
              hasVerifiedWallet: true,
              hasLinkedX: true,
              heldCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
              missingCategories: [],
              completedMandatoryTasksCount: 1,
              totalMandatoryTasksCount: 1,
              isBanned: false,
            },
          } as any;
        } else {
          return {
            qualified: false,
            phase: "NONE",
            missingRequirements: ["Missing 2 trait categories: CLOTHING, EYEWEAR"],
            details: {
              hasVerifiedWallet: true,
              hasLinkedX: true,
              heldCategories: ["BG", "FUR", "HEADWEAR"],
              missingCategories: ["CLOTHING", "EYEWEAR"],
              completedMandatoryTasksCount: 1,
              totalMandatoryTasksCount: 1,
              isBanned: false,
            },
          } as any;
        }
      },
    );

    const result = await listFcfsDirectory(mockPrisma);

    expect(result.entries[0].qualification.isFullyQualified).toBe(true);
    expect(result.entries[0].qualification.heldCategoriesCount).toBe(5);

    expect(result.entries[1].qualification.isFullyQualified).toBe(false);
    expect(result.entries[1].qualification.heldCategoriesCount).toBe(3);
    expect(result.entries[1].qualification.missingCategories).toEqual(["CLOTHING", "EYEWEAR"]);
  });

  it("filters with qualifiedOnly: true to return only fully qualified candidates", async () => {
    vi.spyOn(qualEngine, "executeQualificationEvaluation").mockImplementation(
      async (_prisma: any, { userId }: any) => {
        return {
          qualified: userId === "user-1",
          phase: "NONE",
          missingRequirements: userId === "user-1" ? [] : ["Incomplete tasks"],
          details: {
            hasVerifiedWallet: true,
            hasLinkedX: true,
            heldCategories: ["BG"],
            missingCategories: [],
            completedMandatoryTasksCount: 0,
            totalMandatoryTasksCount: 1,
            isBanned: false,
          },
        } as any;
      },
    );

    const result = await listFcfsDirectory(mockPrisma, { qualifiedOnly: true });

    expect(result.total).toBe(1);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].userId).toBe("user-1");
  });

  it("filters by search term matching wallet address or X username", async () => {
    vi.spyOn(qualEngine, "executeQualificationEvaluation").mockResolvedValue({
      qualified: true,
      phase: "NONE",
      missingRequirements: [],
      details: {},
    } as any);

    const result = await listFcfsDirectory(mockPrisma, { search: "chimp_beta" });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].user.xIdentity?.username).toBe("chimp_beta");
  });

  it("throws AdminFcfsDirectoryError when no program exists", async () => {
    mockPrisma.wLProgram.findUnique.mockResolvedValue(null);
    mockPrisma.wLProgram.findFirst.mockResolvedValue(null);

    await expect(listFcfsDirectory(mockPrisma)).rejects.toThrow(AdminFcfsDirectoryError);
  });

  it("proves strictly read-only execution: zero create, update, or mutation calls across all models", async () => {
    const slotCreateSpy = vi.fn();
    const slotUpdateSpy = vi.fn();
    const queueCreateSpy = vi.fn();
    const queueUpdateSpy = vi.fn();
    const qualCreateSpy = vi.fn();
    const qualUpdateSpy = vi.fn();
    const historyCreateSpy = vi.fn();
    const auditCreateSpy = vi.fn();

    mockPrisma.wLSlot = { create: slotCreateSpy, update: slotUpdateSpy, updateMany: slotUpdateSpy };
    mockPrisma.wLQueueEntry.create = queueCreateSpy;
    mockPrisma.wLQueueEntry.update = queueUpdateSpy;
    mockPrisma.wLQueueEntry.updateMany = queueUpdateSpy;
    mockPrisma.wLQualification = { create: qualCreateSpy, update: qualUpdateSpy, upsert: qualUpdateSpy };
    mockPrisma.wLStatusHistory = { create: historyCreateSpy };
    mockPrisma.auditLog = { create: auditCreateSpy };

    // Real read-only qualification evaluation
    vi.spyOn(qualEngine, "executeQualificationEvaluation").mockResolvedValue({
      qualified: true,
      phase: "NONE",
      missingRequirements: [],
      details: {
        hasVerifiedWallet: true,
        hasLinkedX: true,
        heldCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
        missingCategories: [],
        completedMandatoryTasksCount: 2,
        totalMandatoryTasksCount: 2,
        isBanned: false,
      },
    } as any);

    // Call directory with search and filter
    await listFcfsDirectory(mockPrisma, { search: "chimp", qualifiedOnly: true, limit: 10, offset: 0 });

    // Assert strictly zero mutations
    expect(slotCreateSpy).toHaveBeenCalledTimes(0);
    expect(slotUpdateSpy).toHaveBeenCalledTimes(0);
    expect(queueCreateSpy).toHaveBeenCalledTimes(0);
    expect(queueUpdateSpy).toHaveBeenCalledTimes(0);
    expect(qualCreateSpy).toHaveBeenCalledTimes(0);
    expect(qualUpdateSpy).toHaveBeenCalledTimes(0);
    expect(historyCreateSpy).toHaveBeenCalledTimes(0);
    expect(auditCreateSpy).toHaveBeenCalledTimes(0);
  });
});
