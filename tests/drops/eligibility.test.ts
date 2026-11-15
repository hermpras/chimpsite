import { describe, it, expect, vi } from "vitest";
import { checkUserDropEligibility } from "@/server/drops/eligibility";

describe("checkUserDropEligibility", () => {
  const now = new Date("2026-11-05T12:00:00Z");

  it("returns not eligible if user is not found", async () => {
    const mockTx = {
      user: {
        findUnique: async () => null,
      },
    };

    const result = await checkUserDropEligibility(mockTx, "non-existent-user", now);
    expect(result.isEligible).toBe(false);
    expect(result.hasWallet).toBe(false);
    expect(result.hasLinkedX).toBe(false);
    expect(result.missingRequirements).toContain("User account not found.");
  });

  it("returns not eligible if wallet is missing", async () => {
    const mockTx = {
      user: {
        findUnique: async () => ({
          id: "u1",
          wallet: null,
          xIdentity: { xId: "x-123", username: "chimp_fan" },
          banRecords: [],
        }),
      },
      promoCampaign: {
        findMany: async () => [],
      },
    };

    const result = await checkUserDropEligibility(mockTx, "u1", now);
    expect(result.isEligible).toBe(false);
    expect(result.hasWallet).toBe(false);
    expect(result.hasLinkedX).toBe(true);
    expect(result.missingRequirements).toContain("Verified EVM wallet connection required.");
  });

  it("returns not eligible if X (Twitter) identity is missing", async () => {
    const mockTx = {
      user: {
        findUnique: async () => ({
          id: "u1",
          wallet: { address: "0x1111111111111111111111111111111111111111" },
          xIdentity: null,
          banRecords: [],
        }),
      },
      promoCampaign: {
        findMany: async () => [],
      },
    };

    const result = await checkUserDropEligibility(mockTx, "u1", now);
    expect(result.isEligible).toBe(false);
    expect(result.hasWallet).toBe(true);
    expect(result.hasLinkedX).toBe(false);
    expect(result.missingRequirements).toContain("Linked X (Twitter) account required.");
  });

  it("returns not eligible if user is banned from claims", async () => {
    const mockTx = {
      user: {
        findUnique: async () => ({
          id: "u1",
          wallet: { address: "0x1111111111111111111111111111111111111111" },
          xIdentity: { xId: "x-123", username: "chimp_fan" },
          banRecords: [
            {
              isActive: true,
              scope: "CLAIM_RESTRICTED",
              expiresAt: null,
            },
          ],
        }),
      },
      promoCampaign: {
        findMany: async () => [],
      },
    };

    const result = await checkUserDropEligibility(mockTx, "u1", now);
    expect(result.isEligible).toBe(false);
    expect(result.isBanned).toBe(true);
    expect(result.missingRequirements).toContain("Your account is restricted from claiming drops.");
  });

  it("returns not eligible if active mandatory campaign tasks are incomplete", async () => {
    const mockTx = {
      user: {
        findUnique: async () => ({
          id: "u1",
          wallet: { address: "0x1111111111111111111111111111111111111111" },
          xIdentity: { xId: "x-123", username: "chimp_fan" },
          banRecords: [],
        }),
      },
      wLProgram: {
        findFirst: async () => ({ id: "prog-1", status: "OPEN" }),
      },
      promoCampaign: {
        findMany: async () => [
          {
            id: "camp-1",
            versions: [
              {
                id: "v-1",
                isCurrent: true,
                tasks: [
                  { id: "task-1", isRequired: true, taskCode: "FOLLOW_X" },
                  { id: "task-2", isRequired: true, taskCode: "LIKE_RETWEET" },
                ],
              },
            ],
          },
        ],
      },
      taskProgress: {
        findUnique: async ({ where }: any) => {
          if (where.userId_versionId_taskId.taskId === "task-1") {
            return { status: "VERIFIED", evidenceSubmissions: [] };
          }
          return null; // task-2 is incomplete
        },
      },
    };

    const result = await checkUserDropEligibility(mockTx, "u1", now);
    expect(result.isEligible).toBe(false);
    expect(result.totalMandatoryTasksCount).toBe(2);
    expect(result.completedMandatoryTasksCount).toBe(1);
    expect(result.areMandatoryTasksCompleted).toBe(false);
    expect(result.missingRequirements).toContain(
      "Complete all mandatory campaign tasks (1/2 completed).",
    );
  });

  it("returns eligible when wallet and X are connected and all mandatory tasks are completed", async () => {
    const mockTx = {
      user: {
        findUnique: async () => ({
          id: "u1",
          wallet: { address: "0x1111111111111111111111111111111111111111" },
          xIdentity: { xId: "x-123", username: "chimp_fan" },
          banRecords: [],
        }),
      },
      wLProgram: {
        findFirst: async () => ({ id: "prog-1", status: "OPEN" }),
      },
      promoCampaign: {
        findMany: async () => [
          {
            id: "camp-1",
            versions: [
              {
                id: "v-1",
                isCurrent: true,
                tasks: [
                  { id: "task-1", isRequired: true, taskCode: "FOLLOW_X" },
                  { id: "task-2", isRequired: true, taskCode: "LIKE_RETWEET" },
                ],
              },
            ],
          },
        ],
      },
      taskProgress: {
        findUnique: async ({ where }: any) => {
          return { status: "VERIFIED", evidenceSubmissions: [] };
        },
      },
    };

    const result = await checkUserDropEligibility(mockTx, "u1", now);
    expect(result.isEligible).toBe(true);
    expect(result.hasWallet).toBe(true);
    expect(result.hasLinkedX).toBe(true);
    expect(result.hasAllocatedSlot).toBe(false);
    expect(result.xUsername).toBe("chimp_fan");
    expect(result.totalMandatoryTasksCount).toBe(2);
    expect(result.completedMandatoryTasksCount).toBe(2);
    expect(result.areMandatoryTasksCompleted).toBe(true);
    expect(result.missingRequirements).toHaveLength(0);
  });

  it("returns not eligible if user holds an allocated Whitelist slot via user.wlSlots", async () => {
    const mockTx = {
      user: {
        findUnique: async () => ({
          id: "u1",
          wallet: { address: "0x1111111111111111111111111111111111111111" },
          xIdentity: { xId: "x-123", username: "chimp_fan" },
          banRecords: [],
          wlSlots: [{ id: "slot-1", status: "ALLOCATED" }],
        }),
      },
      promoCampaign: {
        findMany: async () => [],
      },
    };

    const result = await checkUserDropEligibility(mockTx, "u1", now);
    expect(result.isEligible).toBe(false);
    expect(result.hasAllocatedSlot).toBe(true);
    expect(result.missingRequirements).toContain(
      "Users holding an allocated Whitelist slot cannot claim drops.",
    );
  });

  it("returns not eligible if user holds an allocated Whitelist slot via wLSlot.findFirst when relation is unavailable in partial mock", async () => {
    const mockTx = {
      user: {
        findUnique: async () => ({
          id: "u1",
          wallet: { address: "0x1111111111111111111111111111111111111111" },
          xIdentity: { xId: "x-123", username: "chimp_fan" },
          banRecords: [],
          // wlSlots omitted to simulate a partial mock where the relation is unavailable
        }),
      },
      wLSlot: {
        findFirst: async () => ({ id: "slot-gtd-1", status: "CONFIRMED" }),
      },
      promoCampaign: {
        findMany: async () => [],
      },
    };

    const result = await checkUserDropEligibility(mockTx, "u1", now);
    expect(result.isEligible).toBe(false);
    expect(result.hasAllocatedSlot).toBe(true);
    expect(result.missingRequirements).toContain(
      "Users holding an allocated Whitelist slot cannot claim drops.",
    );
  });

  it("does not issue a redundant wLSlot.findFirst query when wlSlots is already loaded as an empty array", async () => {
    const mockWlSlotFindFirst = vi.fn();
    const mockTx = {
      user: {
        findUnique: async () => ({
          id: "u1",
          wallet: { address: "0x1111111111111111111111111111111111111111" },
          xIdentity: { xId: "x-123", username: "chimp_fan" },
          banRecords: [],
          wlSlots: [], // Explicitly loaded empty array from PostgreSQL
        }),
      },
      wLSlot: {
        findFirst: mockWlSlotFindFirst,
      },
      promoCampaign: {
        findMany: async () => [],
      },
    };

    const result = await checkUserDropEligibility(mockTx, "u1", now);
    expect(result.hasAllocatedSlot).toBe(false);
    expect(mockWlSlotFindFirst).not.toHaveBeenCalled();
  });

  // =========================================================================
  // P1.2 BATCH ELIGIBILITY TESTS
  // =========================================================================

  it("1. calls batch findMany exactly once for multiple current-version mandatory tasks", async () => {
    const mockFindMany = vi.fn().mockResolvedValue([
      { versionId: "v-1", taskId: "t-1", status: "VERIFIED", evidenceSubmissions: [] },
      { versionId: "v-1", taskId: "t-2", status: "VERIFIED", evidenceSubmissions: [] },
      { versionId: "v-1", taskId: "t-3", status: "VERIFIED", evidenceSubmissions: [] },
    ]);
    const mockFindUnique = vi.fn();

    const mockTx = {
      user: {
        findUnique: async () => ({
          id: "u-batch-1",
          wallet: { address: "0x1111111111111111111111111111111111111111" },
          xIdentity: { xId: "x-1", username: "elychimp_fan" },
          banRecords: [],
          wlSlots: [],
        }),
      },
      promoCampaign: {
        findMany: async () => [
          {
            id: "camp-1",
            versions: [
              {
                id: "v-1",
                isCurrent: true,
                tasks: [
                  { id: "t-1", isRequired: true, taskCode: "TASK_1" },
                  { id: "t-2", isRequired: true, taskCode: "TASK_2" },
                  { id: "t-3", isRequired: true, taskCode: "TASK_3" },
                ],
              },
            ],
          },
        ],
      },
      taskProgress: {
        findMany: mockFindMany,
        findUnique: mockFindUnique,
      },
    };

    const result = await checkUserDropEligibility(mockTx, "u-batch-1", now);
    expect(result.isEligible).toBe(true);
    expect(result.totalMandatoryTasksCount).toBe(3);
    expect(result.completedMandatoryTasksCount).toBe(3);
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("2. does not call findUnique on current version when findMany batch support exists", async () => {
    const mockFindMany = vi.fn().mockResolvedValue([
      { versionId: "v-1", taskId: "t-1", status: "VERIFIED", evidenceSubmissions: [] },
    ]);
    const mockFindUnique = vi.fn();

    const mockTx = {
      user: {
        findUnique: async () => ({
          id: "u-1",
          wallet: { address: "0x1111111111111111111111111111111111111111" },
          xIdentity: { xId: "x-1", username: "fan" },
          banRecords: [],
          wlSlots: [],
        }),
      },
      promoCampaign: {
        findMany: async () => [
          {
            id: "camp-1",
            versions: [
              {
                id: "v-1",
                isCurrent: true,
                tasks: [{ id: "t-1", isRequired: true, taskCode: "T1" }],
              },
            ],
          },
        ],
      },
      taskProgress: {
        findMany: mockFindMany,
        findUnique: mockFindUnique,
      },
    };

    await checkUserDropEligibility(mockTx, "u-1", now);
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("3. scopes batch query with exact userId and exact OR pair filters", async () => {
    const mockFindMany = vi.fn().mockResolvedValue([]);
    const mockTx = {
      user: {
        findUnique: async () => ({
          id: "user-target-123",
          wallet: { address: "0x1111111111111111111111111111111111111111" },
          xIdentity: { xId: "x-1", username: "fan" },
          banRecords: [],
          wlSlots: [],
        }),
      },
      promoCampaign: {
        findMany: async () => [
          {
            id: "camp-A",
            versions: [
              {
                id: "v-A",
                isCurrent: true,
                tasks: [
                  { id: "task-A1", isRequired: true, taskCode: "CODE_A1" },
                  { id: "task-A2", isRequired: true, taskCode: "CODE_A2" },
                ],
              },
            ],
          },
        ],
      },
      taskProgress: {
        findMany: mockFindMany,
      },
    };

    await checkUserDropEligibility(mockTx, "user-target-123", now);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user-target-123",
        OR: [
          { versionId: "v-A", taskId: "task-A1" },
          { versionId: "v-A", taskId: "task-A2" },
        ],
      },
      include: {
        evidenceSubmissions: {
          where: { status: "APPROVED" },
          select: { id: true },
        },
      },
    });
  });

  it("4. does not cross-pair match between different campaign versions", async () => {
    // Campaign 1 has (v1, t1); Campaign 2 has (v2, t2)
    // Batch query must pass OR: [{ versionId: v1, taskId: t1 }, { versionId: v2, taskId: t2 }]
    // and NOT allow cross combinations like (v1, t2)
    const mockFindMany = vi.fn().mockResolvedValue([
      { versionId: "v-1", taskId: "t-1", status: "VERIFIED", evidenceSubmissions: [] },
      // Simulate an unexpected cross-pair (v-1, t-2) returning from DB; it must NOT satisfy t-2 in v-2!
      { versionId: "v-1", taskId: "t-2", status: "VERIFIED", evidenceSubmissions: [] },
    ]);

    const mockTx = {
      user: {
        findUnique: async () => ({
          id: "u-cross",
          wallet: { address: "0x1111111111111111111111111111111111111111" },
          xIdentity: { xId: "x-1", username: "fan" },
          banRecords: [],
          wlSlots: [],
        }),
      },
      promoCampaign: {
        findMany: async () => [
          {
            id: "camp-1",
            versions: [
              {
                id: "v-1",
                isCurrent: true,
                tasks: [{ id: "t-1", isRequired: true, taskCode: "T1" }],
              },
            ],
          },
          {
            id: "camp-2",
            versions: [
              {
                id: "v-2",
                isCurrent: true,
                tasks: [{ id: "t-2", isRequired: true, taskCode: "T2" }],
              },
            ],
          },
        ],
      },
      taskProgress: {
        findMany: mockFindMany,
      },
    };

    const result = await checkUserDropEligibility(mockTx, "u-cross", now);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        userId: "u-cross",
        OR: [
          { versionId: "v-1", taskId: "t-1" },
          { versionId: "v-2", taskId: "t-2" },
        ],
      },
      include: expect.anything(),
    });
    // t-1 (v-1) is verified; t-2 (v-2) has no (v-2:t-2) record in Map, so it is incomplete!
    expect(result.totalMandatoryTasksCount).toBe(2);
    expect(result.completedMandatoryTasksCount).toBe(1);
    expect(result.isEligible).toBe(false);
  });

  it("5. correctly handles mixed VERIFIED, APPROVED evidence, and incomplete statuses in batch", async () => {
    const mockFindMany = vi.fn().mockResolvedValue([
      // Task 1 is VERIFIED directly
      { versionId: "v-1", taskId: "t-1", status: "VERIFIED", evidenceSubmissions: [] },
      // Task 2 is NOT_STARTED but has an APPROVED evidence submission
      { versionId: "v-1", taskId: "t-2", status: "NOT_STARTED", evidenceSubmissions: [{ id: "ev-1" }] },
      // Task 3 is IN_PROGRESS without approved evidence
      { versionId: "v-1", taskId: "t-3", status: "IN_PROGRESS", evidenceSubmissions: [] },
      // Task 4 has no record in the DB (incomplete)
    ]);

    const mockTx = {
      user: {
        findUnique: async () => ({
          id: "u-mixed",
          wallet: { address: "0x1111111111111111111111111111111111111111" },
          xIdentity: { xId: "x-1", username: "fan" },
          banRecords: [],
          wlSlots: [],
        }),
      },
      promoCampaign: {
        findMany: async () => [
          {
            id: "camp-1",
            versions: [
              {
                id: "v-1",
                isCurrent: true,
                tasks: [
                  { id: "t-1", isRequired: true, taskCode: "T1" },
                  { id: "t-2", isRequired: true, taskCode: "T2" },
                  { id: "t-3", isRequired: true, taskCode: "T3" },
                  { id: "t-4", isRequired: true, taskCode: "T4" },
                ],
              },
            ],
          },
        ],
      },
      taskProgress: {
        findMany: mockFindMany,
      },
    };

    const result = await checkUserDropEligibility(mockTx, "u-mixed", now);
    expect(result.totalMandatoryTasksCount).toBe(4);
    expect(result.completedMandatoryTasksCount).toBe(2); // t-1 and t-2 are done
    expect(result.areMandatoryTasksCompleted).toBe(false);
    expect(result.isEligible).toBe(false);
    expect(result.missingRequirements).toContain(
      "Complete all mandatory campaign tasks (2/4 completed).",
    );
  });

  it("6. skips the batch query entirely when there are zero mandatory tasks", async () => {
    const mockFindMany = vi.fn();
    const mockTx = {
      user: {
        findUnique: async () => ({
          id: "u-zero",
          wallet: { address: "0x1111111111111111111111111111111111111111" },
          xIdentity: { xId: "x-1", username: "fan" },
          banRecords: [],
          wlSlots: [],
        }),
      },
      promoCampaign: {
        findMany: async () => [
          {
            id: "camp-1",
            versions: [
              {
                id: "v-1",
                isCurrent: true,
                tasks: [], // Zero mandatory tasks
              },
            ],
          },
        ],
      },
      taskProgress: {
        findMany: mockFindMany,
      },
    };

    const result = await checkUserDropEligibility(mockTx, "u-zero", now);
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(result.totalMandatoryTasksCount).toBe(0);
    expect(result.completedMandatoryTasksCount).toBe(0);
    expect(result.areMandatoryTasksCompleted).toBe(true);
    expect(result.isEligible).toBe(true);
  });

  it("7. LEGACY_CARRIED fallback remains serial and preserves taskCode mapping across versions", async () => {
    // Current version v-2 has task t-2b with taskCode "FOLLOW_X" (not yet done in v-2)
    // Ancestor version v-1 has task t-1a with same taskCode "FOLLOW_X" (done in v-1)
    const mockFindMany = vi.fn().mockResolvedValue([]); // Incomplete in v-2
    const mockCampaignVersionFindUnique = vi.fn().mockResolvedValue({
      id: "v-1",
      campaignId: "camp-1",
      compatibilityMode: "FRESH_START",
      compatibleFromVersionId: null,
    });
    const mockCampaignTaskFindUnique = vi.fn().mockResolvedValue({
      id: "t-1a",
    });
    const mockTaskProgressFindUnique = vi.fn().mockResolvedValue({
      status: "VERIFIED",
      evidenceSubmissions: [],
    });

    const mockTx = {
      user: {
        findUnique: async () => ({
          id: "u-legacy",
          wallet: { address: "0x1111111111111111111111111111111111111111" },
          xIdentity: { xId: "x-1", username: "fan" },
          banRecords: [],
          wlSlots: [],
        }),
      },
      promoCampaign: {
        findMany: async () => [
          {
            id: "camp-1",
            versions: [
              {
                id: "v-2",
                isCurrent: true,
                compatibilityMode: "LEGACY_CARRIED",
                compatibleFromVersionId: "v-1",
                tasks: [{ id: "t-2b", isRequired: true, taskCode: "FOLLOW_X" }],
              },
            ],
          },
        ],
      },
      taskProgress: {
        findMany: mockFindMany,
        findUnique: mockTaskProgressFindUnique,
      },
      campaignVersion: {
        findUnique: mockCampaignVersionFindUnique,
      },
      campaignTask: {
        findUnique: mockCampaignTaskFindUnique,
      },
    };

    const result = await checkUserDropEligibility(mockTx, "u-legacy", now);
    expect(result.isEligible).toBe(true);
    expect(result.completedMandatoryTasksCount).toBe(1);
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockCampaignVersionFindUnique).toHaveBeenCalledWith({
      where: { id: "v-1" },
      select: expect.anything(),
    });
    expect(mockCampaignTaskFindUnique).toHaveBeenCalledWith({
      where: {
        versionId_taskCode: {
          versionId: "v-1",
          taskCode: "FOLLOW_X",
        },
      },
      select: { id: true },
    });
    expect(mockTaskProgressFindUnique).toHaveBeenCalledWith({
      where: {
        userId_versionId_taskId: {
          userId: "u-legacy",
          versionId: "v-1",
          taskId: "t-1a",
        },
      },
      include: expect.anything(),
    });
  });

  it("8. missing ancestor task in previous version continues traversal to earlier ancestor", async () => {
    // Chain: v-3 (current) -> v-2 (ancestor, taskCode missing) -> v-1 (ancestor, taskCode present & verified)
    const mockFindMany = vi.fn().mockResolvedValue([]);
    const mockCampaignVersionFindUnique = vi.fn().mockImplementation(async ({ where }: any) => {
      if (where.id === "v-2") {
        return {
          id: "v-2",
          campaignId: "camp-1",
          compatibilityMode: "LEGACY_CARRIED",
          compatibleFromVersionId: "v-1",
        };
      }
      if (where.id === "v-1") {
        return {
          id: "v-1",
          campaignId: "camp-1",
          compatibilityMode: "FRESH_START",
          compatibleFromVersionId: null,
        };
      }
      return null;
    });

    const mockCampaignTaskFindUnique = vi.fn().mockImplementation(async ({ where }: any) => {
      if (where.versionId_taskCode.versionId === "v-2") {
        return null; // Task does not exist in v-2
      }
      if (where.versionId_taskCode.versionId === "v-1") {
        return { id: "t-v1" }; // Task exists in v-1
      }
      return null;
    });

    const mockTaskProgressFindUnique = vi.fn().mockResolvedValue({
      status: "VERIFIED",
      evidenceSubmissions: [],
    });

    const mockTx = {
      user: {
        findUnique: async () => ({
          id: "u-skip",
          wallet: { address: "0x1111111111111111111111111111111111111111" },
          xIdentity: { xId: "x-1", username: "fan" },
          banRecords: [],
          wlSlots: [],
        }),
      },
      promoCampaign: {
        findMany: async () => [
          {
            id: "camp-1",
            versions: [
              {
                id: "v-3",
                isCurrent: true,
                compatibilityMode: "LEGACY_CARRIED",
                compatibleFromVersionId: "v-2",
                tasks: [{ id: "t-v3", isRequired: true, taskCode: "LONG_CHAIN_TASK" }],
              },
            ],
          },
        ],
      },
      taskProgress: {
        findMany: mockFindMany,
        findUnique: mockTaskProgressFindUnique,
      },
      campaignVersion: {
        findUnique: mockCampaignVersionFindUnique,
      },
      campaignTask: {
        findUnique: mockCampaignTaskFindUnique,
      },
    };

    const result = await checkUserDropEligibility(mockTx, "u-skip", now);
    expect(result.isEligible).toBe(true);
    expect(result.completedMandatoryTasksCount).toBe(1);
    expect(mockCampaignVersionFindUnique).toHaveBeenCalledTimes(2);
  });

  it("9. stops LEGACY_CARRIED traversal on campaign boundary violation or cycle", async () => {
    const mockFindMany = vi.fn().mockResolvedValue([]);
    // Ancestor version belongs to a different campaign (camp-2 !== camp-1)
    const mockCampaignVersionFindUnique = vi.fn().mockResolvedValue({
      id: "v-alien",
      campaignId: "camp-DIFFERENT",
      compatibilityMode: "LEGACY_CARRIED",
      compatibleFromVersionId: null,
    });
    const mockCampaignTaskFindUnique = vi.fn();

    const mockTx = {
      user: {
        findUnique: async () => ({
          id: "u-boundary",
          wallet: { address: "0x1111111111111111111111111111111111111111" },
          xIdentity: { xId: "x-1", username: "fan" },
          banRecords: [],
          wlSlots: [],
        }),
      },
      promoCampaign: {
        findMany: async () => [
          {
            id: "camp-1",
            versions: [
              {
                id: "v-1",
                isCurrent: true,
                compatibilityMode: "LEGACY_CARRIED",
                compatibleFromVersionId: "v-alien",
                tasks: [{ id: "t-1", isRequired: true, taskCode: "TASK" }],
              },
            ],
          },
        ],
      },
      taskProgress: {
        findMany: mockFindMany,
      },
      campaignVersion: {
        findUnique: mockCampaignVersionFindUnique,
      },
      campaignTask: {
        findUnique: mockCampaignTaskFindUnique,
      },
    };

    const result = await checkUserDropEligibility(mockTx, "u-boundary", now);
    expect(result.isEligible).toBe(false);
    expect(result.completedMandatoryTasksCount).toBe(0);
    // Boundary check stops traversal immediately: campaignTask.findUnique should NOT be called
    expect(mockCampaignTaskFindUnique).not.toHaveBeenCalled();
  });

  it("10. partial mocks without findMany use backward-compatible findUnique fallback", async () => {
    const mockFindUnique = vi.fn().mockResolvedValue({
      status: "VERIFIED",
      evidenceSubmissions: [],
    });

    const mockTx = {
      user: {
        findUnique: async () => ({
          id: "u-fallback",
          wallet: { address: "0x1111111111111111111111111111111111111111" },
          xIdentity: { xId: "x-1", username: "fan" },
          banRecords: [],
          wlSlots: [],
        }),
      },
      promoCampaign: {
        findMany: async () => [
          {
            id: "camp-1",
            versions: [
              {
                id: "v-1",
                isCurrent: true,
                tasks: [
                  { id: "t-1", isRequired: true, taskCode: "T1" },
                  { id: "t-2", isRequired: true, taskCode: "T2" },
                ],
              },
            ],
          },
        ],
      },
      taskProgress: {
        // findMany is deliberately omitted to simulate legacy partial mock
        findUnique: mockFindUnique,
      },
    };

    const result = await checkUserDropEligibility(mockTx, "u-fallback", now);
    expect(result.isEligible).toBe(true);
    expect(result.completedMandatoryTasksCount).toBe(2);
    expect(mockFindUnique).toHaveBeenCalledTimes(2);
  });

  it("11. actual batch query errors propagate rather than silently falling back", async () => {
    const dbError = new Error("PostgreSQL connection terminated unexpectedly");
    const mockFindMany = vi.fn().mockRejectedValue(dbError);
    const mockFindUnique = vi.fn();

    const mockTx = {
      user: {
        findUnique: async () => ({
          id: "u-err",
          wallet: { address: "0x1111111111111111111111111111111111111111" },
          xIdentity: { xId: "x-1", username: "fan" },
          banRecords: [],
          wlSlots: [],
        }),
      },
      promoCampaign: {
        findMany: async () => [
          {
            id: "camp-1",
            versions: [
              {
                id: "v-1",
                isCurrent: true,
                tasks: [{ id: "t-1", isRequired: true, taskCode: "T1" }],
              },
            ],
          },
        ],
      },
      taskProgress: {
        findMany: mockFindMany,
        findUnique: mockFindUnique,
      },
    };

    await expect(checkUserDropEligibility(mockTx, "u-err", now)).rejects.toThrow(
      "PostgreSQL connection terminated unexpectedly",
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("12. user query uses select and excludes avatarPng and unrelated columns", async () => {
    let capturedSelect: any = null;
    const mockTx = {
      user: {
        findUnique: async ({ select }: any) => {
          capturedSelect = select;
          return {
            id: "u-select",
            wallet: { address: "0x1111111111111111111111111111111111111111" },
            xIdentity: { xId: "x-1", username: "fan" },
            banRecords: [],
            wlSlots: [],
          };
        },
      },
      promoCampaign: {
        findMany: async () => [],
      },
    };

    await checkUserDropEligibility(mockTx, "u-select", now);
    expect(capturedSelect).toBeDefined();
    expect(capturedSelect.id).toBe(true);
    expect(capturedSelect.wallet).toEqual({ select: { address: true } });
    expect(capturedSelect.xIdentity).toEqual({ select: { xId: true, username: true } });
    expect(capturedSelect.avatarPng).toBeUndefined();
    expect(capturedSelect.avatarUpdatedAt).toBeUndefined();
    expect(capturedSelect.role).toBeUndefined();
  });
});
