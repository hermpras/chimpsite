import type { PrismaClient } from "@prisma/client";

export interface UserDropEligibilityResult {
  isEligible: boolean;
  hasWallet: boolean;
  hasLinkedX: boolean;
  xUsername: string | null;
  totalMandatoryTasksCount: number;
  completedMandatoryTasksCount: number;
  areMandatoryTasksCompleted: boolean;
  isBanned: boolean;
  hasAllocatedSlot: boolean;
  missingRequirements: string[];
}

/**
 * Evaluates whether a user satisfies all prerequisites to claim drops.
 * Prerequisites:
 * 1. Verified EVM Wallet connection.
 * 2. Linked X (Twitter) social identity.
 * 3. Completion of all mandatory campaign tasks under active campaigns.
 * 4. Account not banned from claiming drops.
 * 5. Account does NOT hold an allocated or confirmed Whitelist slot.
 */
export async function checkUserDropEligibility(
  prismaOrTx: any,
  userId: string,
  now: Date = new Date(),
): Promise<UserDropEligibilityResult> {
  const missingRequirements: string[] = [];

  if (!userId || typeof userId !== "string") {
    return {
      isEligible: false,
      hasWallet: false,
      hasLinkedX: false,
      xUsername: null,
      totalMandatoryTasksCount: 0,
      completedMandatoryTasksCount: 0,
      areMandatoryTasksCompleted: false,
      isBanned: false,
      hasAllocatedSlot: false,
      missingRequirements: ["Valid user ID required."],
    };
  }

  // 1. Fetch user with wallet, xIdentity, active claim bans, and active/confirmed wlSlots
  const user = await prismaOrTx.user?.findUnique({
    where: { id: userId },
    select: {
      id: true,
      wallet: {
        select: {
          address: true,
        },
      },
      xIdentity: {
        select: {
          xId: true,
          username: true,
        },
      },
      banRecords: {
        where: {
          isActive: true,
          scope: { in: ["FULL_SYSTEM", "CLAIM_RESTRICTED"] },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: {
          id: true,
          isActive: true,
          expiresAt: true,
          scope: true,
        },
      },
      wlSlots: {
        where: {
          status: { in: ["ALLOCATED", "CONFIRMED"] },
        },
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!user) {
    return {
      isEligible: false,
      hasWallet: false,
      hasLinkedX: false,
      xUsername: null,
      totalMandatoryTasksCount: 0,
      completedMandatoryTasksCount: 0,
      areMandatoryTasksCompleted: false,
      isBanned: false,
      hasAllocatedSlot: false,
      missingRequirements: ["User account not found."],
    };
  }

  const hasWallet = Boolean(user.wallet?.address);
  if (!hasWallet) {
    missingRequirements.push("Verified EVM wallet connection required.");
  }

  const hasLinkedX = Boolean(user.xIdentity?.xId);
  const xUsername = user.xIdentity?.username ?? null;
  if (!hasLinkedX) {
    missingRequirements.push("Linked X (Twitter) account required.");
  }

  const isBanned = Boolean(
    user.banRecords &&
      user.banRecords.some(
        (b: any) =>
          b.isActive &&
          (!b.expiresAt || new Date(b.expiresAt) > now) &&
          (b.scope === "FULL_SYSTEM" || b.scope === "CLAIM_RESTRICTED"),
      ),
  );
  if (isBanned) {
    missingRequirements.push("Your account is restricted from claiming drops.");
  }

  // Check if user already holds an allocated or confirmed Whitelist slot
  let hasAllocatedSlot = false;
  if (Array.isArray(user.wlSlots)) {
    // Whitelist slot relation was explicitly loaded: non-empty means slot held, empty array means no slot
    hasAllocatedSlot = user.wlSlots.length > 0;
  } else if (typeof prismaOrTx.wLSlot?.findFirst === "function") {
    // Fallback only if wlSlots relation is unavailable in partial mock
    const slot = await prismaOrTx.wLSlot.findFirst({
      where: {
        userId,
        status: { in: ["ALLOCATED", "CONFIRMED"] },
      },
      select: { id: true },
    });
    hasAllocatedSlot = Boolean(slot);
  }

  if (hasAllocatedSlot) {
    missingRequirements.push("Users holding an allocated Whitelist slot cannot claim drops.");
  }

  // 2. Check Mandatory Tasks (all active campaigns under the active WL program)
  let totalMandatoryTasksCount = 0;
  let completedMandatoryTasksCount = 0;

  if (typeof prismaOrTx.promoCampaign?.findMany === "function") {
    let programId: string | undefined;
    if (typeof prismaOrTx.wLProgram?.findFirst === "function") {
      const openProgram = await prismaOrTx.wLProgram.findFirst({
        where: { status: "OPEN" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      programId = openProgram?.id;
    }

    const campaigns = await prismaOrTx.promoCampaign.findMany({
      where: {
        ...(programId ? { wlProgramId: programId } : {}),
        status: "ACTIVE",
      },
      include: {
        versions: {
          where: { isCurrent: true },
          include: {
            tasks: {
              where: { isRequired: true },
            },
          },
        },
      },
    });

    // P1.2: Batch query current-version mandatory TaskProgress records
    interface TaskPair {
      versionId: string;
      taskId: string;
    }
    const currentTaskPairs: TaskPair[] = [];

    for (const campaign of campaigns) {
      const currentVersion = campaign.versions?.[0];
      if (!currentVersion || !currentVersion.tasks) continue;
      for (const task of currentVersion.tasks) {
        currentTaskPairs.push({
          versionId: currentVersion.id,
          taskId: task.id,
        });
      }
    }

    const hasBatchSupport = typeof prismaOrTx.taskProgress?.findMany === "function";
    const progressMap = new Map<string, any>();

    if (hasBatchSupport && currentTaskPairs.length > 0) {
      // Execute 1 batch query with exact (versionId, taskId) pairs via OR clause scoped by userId
      const batchProgresses: any[] = await prismaOrTx.taskProgress.findMany({
        where: {
          userId,
          OR: currentTaskPairs.map((pair) => ({
            versionId: pair.versionId,
            taskId: pair.taskId,
          })),
        },
        include: {
          evidenceSubmissions: {
            where: { status: "APPROVED" },
            select: { id: true },
          },
        },
      });

      for (const p of batchProgresses) {
        progressMap.set(`${p.versionId}:${p.taskId}`, p);
      }
    }

    for (const campaign of campaigns) {
      const currentVersion = campaign.versions?.[0];
      if (!currentVersion || !currentVersion.tasks) continue;

      for (const task of currentVersion.tasks) {
        totalMandatoryTasksCount++;

        let isTaskDone = false;

        if (hasBatchSupport) {
          const progress = progressMap.get(`${currentVersion.id}:${task.id}`);
          isTaskDone =
            progress?.status === "VERIFIED" ||
            Boolean(progress?.evidenceSubmissions && progress.evidenceSubmissions.length > 0);
        } else if (typeof prismaOrTx.taskProgress?.findUnique === "function") {
          // Backward-compatible fallback for partial mocks without findMany
          const progress = await prismaOrTx.taskProgress.findUnique({
            where: {
              userId_versionId_taskId: {
                userId,
                versionId: currentVersion.id,
                taskId: task.id,
              },
            },
            include: {
              evidenceSubmissions: {
                where: { status: "APPROVED" },
              },
            },
          });

          isTaskDone =
            progress?.status === "VERIFIED" ||
            Boolean(progress?.evidenceSubmissions && progress.evidenceSubmissions.length > 0);
        }

        // Carry-over check for LEGACY_CARRIED versions (Requirement B: Preserve serial dynamic traversal)
        if (
          !isTaskDone &&
          currentVersion.compatibilityMode === "LEGACY_CARRIED" &&
          currentVersion.compatibleFromVersionId &&
          typeof prismaOrTx.campaignVersion?.findUnique === "function" &&
          typeof prismaOrTx.campaignTask?.findUnique === "function"
        ) {
          let ancestorVersionId: string | null = currentVersion.compatibleFromVersionId;
          const visited = new Set<string>([currentVersion.id]);

          while (ancestorVersionId && !isTaskDone) {
            if (visited.has(ancestorVersionId)) break;
            visited.add(ancestorVersionId);

            const ancestorVersion = await prismaOrTx.campaignVersion.findUnique({
              where: { id: ancestorVersionId },
              select: {
                id: true,
                campaignId: true,
                compatibilityMode: true,
                compatibleFromVersionId: true,
              },
            });

            if (!ancestorVersion || ancestorVersion.campaignId !== campaign.id) break;

            const ancestorTask = await prismaOrTx.campaignTask.findUnique({
              where: {
                versionId_taskCode: {
                  versionId: ancestorVersion.id,
                  taskCode: task.taskCode,
                },
              },
              select: { id: true },
            });

            if (ancestorTask && typeof prismaOrTx.taskProgress?.findUnique === "function") {
              const ancestorProgress = await prismaOrTx.taskProgress.findUnique({
                where: {
                  userId_versionId_taskId: {
                    userId,
                    versionId: ancestorVersion.id,
                    taskId: ancestorTask.id,
                  },
                },
                include: {
                  evidenceSubmissions: {
                    where: { status: "APPROVED" },
                  },
                },
              });

              if (
                ancestorProgress?.status === "VERIFIED" ||
                Boolean(
                  ancestorProgress?.evidenceSubmissions &&
                    ancestorProgress.evidenceSubmissions.length > 0,
                )
              ) {
                isTaskDone = true;
                break;
              }
            }

            if (ancestorVersion.compatibilityMode !== "LEGACY_CARRIED") break;
            ancestorVersionId = ancestorVersion.compatibleFromVersionId;
          }
        }

        if (isTaskDone) {
          completedMandatoryTasksCount++;
        }
      }
    }
  }

  const areMandatoryTasksCompleted =
    totalMandatoryTasksCount === 0 || completedMandatoryTasksCount >= totalMandatoryTasksCount;

  if (!areMandatoryTasksCompleted) {
    missingRequirements.push(
      `Complete all mandatory campaign tasks (${completedMandatoryTasksCount}/${totalMandatoryTasksCount} completed).`,
    );
  }

  const isEligible =
    hasWallet && hasLinkedX && areMandatoryTasksCompleted && !isBanned && !hasAllocatedSlot;

  return {
    isEligible,
    hasWallet,
    hasLinkedX,
    xUsername,
    totalMandatoryTasksCount,
    completedMandatoryTasksCount,
    areMandatoryTasksCompleted,
    isBanned,
    hasAllocatedSlot,
    missingRequirements,
  };
}
