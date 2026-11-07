import { describe, it, expect } from "vitest";
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

  it("returns not eligible if user holds an allocated Whitelist slot via wLSlot.findFirst", async () => {
    const mockTx = {
      user: {
        findUnique: async () => ({
          id: "u1",
          wallet: { address: "0x1111111111111111111111111111111111111111" },
          xIdentity: { xId: "x-123", username: "chimp_fan" },
          banRecords: [],
          wlSlots: [],
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
});
