import type { PrismaClient, TraitCategory } from "@prisma/client";
import { recordAuditLog } from "../audit/audit";

export const REQUIRED_TRAIT_CATEGORIES: TraitCategory[] = [
  "BG",
  "FUR",
  "CLOTHING",
  "HEADWEAR",
  "EYEWEAR",
];

export class WhitelistError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = "WhitelistError";
    this.code = code;
    this.status = status;
  }
}

export interface QualificationCheckResult {
  qualified: boolean;
  phase: "NONE" | "QUALIFIED" | "IN_QUEUE" | "SLOT_ALLOCATED" | "REVOKED";
  qualifiedAt?: Date;
  slotNumber?: number;
  queueNumber?: number;
  queueRank?: number;
  missingRequirements: string[];
  details: {
    hasVerifiedWallet: boolean;
    hasLinkedX: boolean;
    xUsername?: string;
    heldCategories: TraitCategory[];
    missingCategories: TraitCategory[];
    completedMandatoryTasksCount: number;
    totalMandatoryTasksCount: number;
    isBanned: boolean;
  };
}

export const MAX_WL_RETRIES = 5;

/**
 * Checks if an error is a unique constraint collision on slotNumber within WLSlot.
 */
export function isWlSlotNumberCollision(err: unknown): boolean {
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  ) {
    const pErr = err as {
      meta?: { target?: unknown; modelName?: string };
      message?: string;
    };
    const target = pErr.meta?.target;
    const targetStr = Array.isArray(target)
      ? target.join(",")
      : typeof target === "string"
        ? target
        : "";
    const message = pErr.message || "";
    const modelName = pErr.meta?.modelName || "";

    if (targetStr.includes("userId") || (!targetStr && message.includes("userId"))) {
      return false;
    }

    if (
      targetStr.includes("slotNumber") ||
      message.includes("slotNumber") ||
      (modelName === "WLSlot" && message.includes("slotNumber"))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if an error is a unique constraint collision on queueNumber within WLQueueEntry.
 */
export function isWlQueueNumberCollision(err: unknown): boolean {
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  ) {
    const pErr = err as {
      meta?: { target?: unknown; modelName?: string };
      message?: string;
    };
    const target = pErr.meta?.target;
    const targetStr = Array.isArray(target)
      ? target.join(",")
      : typeof target === "string"
        ? target
        : "";
    const message = pErr.message || "";
    const modelName = pErr.meta?.modelName || "";

    if (targetStr.includes("userId") || (!targetStr && message.includes("userId"))) {
      return false;
    }

    if (
      targetStr.includes("queueNumber") ||
      message.includes("queueNumber") ||
      (modelName === "WLQueueEntry" && message.includes("queueNumber"))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if error is a serialization failure or deadlock conflict.
 */
export function isWlWriteConflictOrDeadlock(err: unknown): boolean {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code?: unknown }).code;
    return code === "P2034" || code === "40001" || code === "40P01";
  }
  return false;
}

/**
 * Determines whether a database error is an expected retryable concurrency conflict.
 * Unrelated unique constraints or application errors are NOT retried.
 */
export function isRetryableWlConcurrencyConflict(err: unknown): boolean {
  return (
    isWlSlotNumberCollision(err) ||
    isWlQueueNumberCollision(err) ||
    isWlWriteConflictOrDeadlock(err)
  );
}

export type PrismaTransactionClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];

/**
 * Computes the lowest unoccupied slot number 1..totalSlots, or null if capacity full.
 */
async function findLowestAvailableSlotNumber(
  tx: PrismaTransactionClient,
  programId: string,
  totalSlots: number,
): Promise<number | null> {
  const existingSlots = await tx.wLSlot.findMany({
    where: {
      programId,
      status: { in: ["ALLOCATED", "CONFIRMED"] },
    },
    select: { slotNumber: true },
  });
  const occupied = new Set<number>(
    existingSlots.map((s: { slotNumber: number }) => s.slotNumber),
  );
  let slotNumber = 1;
  while (occupied.has(slotNumber)) {
    slotNumber++;
  }
  return slotNumber <= totalSlots ? slotNumber : null;
}

/**
 * Determines the next sequential queue number for the program.
 */
async function getNextQueueNumber(
  tx: PrismaTransactionClient,
  programId: string,
): Promise<number> {
  const highestQueueEntry = await tx.wLQueueEntry.findFirst({
    where: { programId },
    orderBy: { queueNumber: "desc" },
    select: { queueNumber: true },
  });
  return (highestQueueEntry?.queueNumber ?? 0) + 1;
}

/**
 * Checks all qualification requirements and assigns slot or queue entry.
 * Safely handles concurrency collisions on slot and queue number allocations via bounded retries.
 */
export async function evaluateUserQualification(
  prisma: PrismaClient,
  input: {
    userId: string;
    programId: string;
    now?: Date;
    maxRetries?: number;
    readOnly?: boolean;
  },
): Promise<QualificationCheckResult> {
  const maxRetries = input.readOnly ? 0 : (input.maxRetries ?? MAX_WL_RETRIES);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const now = input.now ?? new Date();

    try {
      return await prisma.$transaction(async (tx) => {
        // 1. Fetch user with relations
        const user = await tx.user.findUnique({
          where: { id: input.userId },
          include: {
            wallet: true,
            xIdentity: true,
            banRecords: { where: { isActive: true } },
          },
        });

        if (!user) {
          throw new WhitelistError("USER_NOT_FOUND", "User not found.", 404);
        }

        const program = await tx.wLProgram.findUnique({
          where: { id: input.programId },
        });
        if (!program) {
          throw new WhitelistError(
            "PROGRAM_NOT_FOUND",
            "Whitelist program not found.",
            404,
          );
        }

        if (program.status !== "OPEN") {
          throw new WhitelistError(
            "PROGRAM_NOT_ACTIVE",
            `Whitelist program is not open (current status: ${program.status}).`,
            400,
          );
        }

        const missingRequirements: string[] = [];

        // Check ban
        const isBanned = user.banRecords.some(
          (b) => b.scope === "FULL_SYSTEM" || b.scope === "WL_DISQUALIFIED",
        );
        if (isBanned) {
          missingRequirements.push("Account is banned or disqualified from Whitelist.");
        }

        // Check wallet verification
        const hasVerifiedWallet = Boolean(user.wallet?.address);
        if (!hasVerifiedWallet) {
          missingRequirements.push("Verified EVM wallet required.");
        }

        // Check linked X account
        const hasLinkedX = Boolean(user.xIdentity?.xId);
        if (!hasLinkedX) {
          missingRequirements.push("Linked X (Twitter) account required.");
        }

        // 2. Check 5 Trait Categories
        const inventoryItems = await tx.inventoryItem.findMany({
          where: { ownerId: input.userId },
          include: { trait: true },
        });
        const heldCategoriesSet = new Set<TraitCategory>(
          inventoryItems.map((item) => item.trait.category),
        );
        const heldCategories = Array.from(heldCategoriesSet);
        const missingCategories = REQUIRED_TRAIT_CATEGORIES.filter(
          (cat) => !heldCategoriesSet.has(cat),
        );

        if (missingCategories.length > 0) {
          missingRequirements.push(
            `Missing trait categories: ${missingCategories.join(", ")}.`,
          );
        }

        // 3. Check Mandatory Campaigns & Tasks (Strictly ACTIVE campaigns only)
        const campaigns = await tx.promoCampaign.findMany({
          where: {
            wlProgramId: input.programId,
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

        let totalMandatoryTasksCount = 0;
        let completedMandatoryTasksCount = 0;

        for (const campaign of campaigns) {
          const currentVersion = campaign.versions[0];
          if (!currentVersion) continue;

          for (const task of currentVersion.tasks) {
            totalMandatoryTasksCount++;
            // Check verified progress or approved evidence submission
            const progress = await tx.taskProgress.findUnique({
              where: {
                userId_versionId_taskId: {
                  userId: input.userId,
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

            const isTaskDone =
              progress?.status === "VERIFIED" ||
              (progress?.evidenceSubmissions && progress.evidenceSubmissions.length > 0);

            if (isTaskDone) {
              completedMandatoryTasksCount++;
            } else {
              missingRequirements.push(`Incomplete task: "${task.title}".`);
            }
          }
        }

        const isQualified = missingRequirements.length === 0;

        // Check if user already holds an allocated/confirmed slot
        const existingSlot = await tx.wLSlot.findUnique({
          where: {
            programId_userId: {
              programId: input.programId,
              userId: input.userId,
            },
          },
        });

        if (
          existingSlot &&
          (existingSlot.status === "ALLOCATED" || existingSlot.status === "CONFIRMED")
        ) {
          return {
            qualified: true,
            phase: "SLOT_ALLOCATED",
            slotNumber: existingSlot.slotNumber,
            missingRequirements: [],
            details: {
              hasVerifiedWallet,
              hasLinkedX,
              xUsername: user.xIdentity?.username,
              heldCategories,
              missingCategories,
              completedMandatoryTasksCount,
              totalMandatoryTasksCount,
              isBanned,
            },
          };
        }

        // Read-only path: return qualification status without mutating database records
        if (input.readOnly) {
          if (!isQualified) {
            const existingQual = await tx.wLQualification.findUnique({
              where: {
                programId_userId: {
                  programId: input.programId,
                  userId: input.userId,
                },
              },
            });
            return {
              qualified: false,
              phase: existingQual?.status === "REVOKED" ? "REVOKED" : "NONE",
              missingRequirements,
              details: {
                hasVerifiedWallet,
                hasLinkedX,
                xUsername: user.xIdentity?.username,
                heldCategories,
                missingCategories,
                completedMandatoryTasksCount,
                totalMandatoryTasksCount,
                isBanned,
              },
            };
          }

          if (
            existingSlot &&
            (existingSlot.status === "ALLOCATED" || existingSlot.status === "CONFIRMED")
          ) {
            return {
              qualified: true,
              phase: "SLOT_ALLOCATED",
              slotNumber: existingSlot.slotNumber,
              missingRequirements: [],
              details: {
                hasVerifiedWallet,
                hasLinkedX,
                xUsername: user.xIdentity?.username,
                heldCategories,
                missingCategories,
                completedMandatoryTasksCount,
                totalMandatoryTasksCount,
                isBanned,
              },
            };
          }

          const existingQueueEntry = await tx.wLQueueEntry.findUnique({
            where: {
              programId_userId: {
                programId: input.programId,
                userId: input.userId,
              },
            },
          });

          if (existingQueueEntry && existingQueueEntry.status === "WAITING") {
            const earlierInQueueCount = await tx.wLQueueEntry.count({
              where: {
                programId: input.programId,
                status: "WAITING",
                OR: [
                  { joinedAt: { lt: existingQueueEntry.joinedAt } },
                  {
                    AND: [
                      { joinedAt: existingQueueEntry.joinedAt },
                      { queueNumber: { lt: existingQueueEntry.queueNumber } },
                    ],
                  },
                ],
              },
            });

            return {
              qualified: true,
              phase: "IN_QUEUE",
              queueNumber: existingQueueEntry.queueNumber,
              queueRank: earlierInQueueCount + 1,
              missingRequirements: [],
              details: {
                hasVerifiedWallet,
                hasLinkedX,
                xUsername: user.xIdentity?.username,
                heldCategories,
                missingCategories,
                completedMandatoryTasksCount,
                totalMandatoryTasksCount,
                isBanned,
              },
            };
          }

          const existingQual = await tx.wLQualification.findUnique({
            where: {
              programId_userId: {
                programId: input.programId,
                userId: input.userId,
              },
            },
          });

          return {
            qualified: true,
            phase: existingQual?.status === "QUALIFIED" ? "QUALIFIED" : "NONE",
            qualifiedAt: existingQual?.qualifiedAt,
            missingRequirements: [],
            details: {
              hasVerifiedWallet,
              hasLinkedX,
              xUsername: user.xIdentity?.username,
              heldCategories,
              missingCategories,
              completedMandatoryTasksCount,
              totalMandatoryTasksCount,
              isBanned,
            },
          };
        }

        // 4. Handle Disqualified / Ineligible
        if (!isQualified) {
          const existingQual = await tx.wLQualification.findUnique({
            where: {
              programId_userId: {
                programId: input.programId,
                userId: input.userId,
              },
            },
          });

          if (existingQual && existingQual.status === "QUALIFIED") {
            await tx.wLQualification.update({
              where: { id: existingQual.id },
              data: {
                status: "DISQUALIFIED",
                disqualifiedAt: now,
                reason: missingRequirements.join("; "),
              },
            });
            await tx.wLStatusHistory.create({
              data: {
                programId: input.programId,
                userId: input.userId,
                fromPhase: "QUALIFIED",
                toPhase: "REVOKED",
                action: "DISQUALIFIED_REQUIREMENTS_UNMET",
                metadata: { missingRequirements },
              },
            });
          }

          return {
            qualified: false,
            phase: "NONE",
            missingRequirements,
            details: {
              hasVerifiedWallet,
              hasLinkedX,
              xUsername: user.xIdentity?.username,
              heldCategories,
              missingCategories,
              completedMandatoryTasksCount,
              totalMandatoryTasksCount,
              isBanned,
            },
          };
        }

        // 5. User is QUALIFIED!
        const existingQual = await tx.wLQualification.findUnique({
          where: {
            programId_userId: {
              programId: input.programId,
              userId: input.userId,
            },
          },
        });

        // "If a submission is rejected and the user later qualifies again, use the new qualification timestamp."
        const qualifiedAt =
          existingQual?.status === "QUALIFIED" ? existingQual.qualifiedAt : now;

        await tx.wLQualification.upsert({
          where: {
            programId_userId: {
              programId: input.programId,
              userId: input.userId,
            },
          },
          create: {
            programId: input.programId,
            userId: input.userId,
            status: "QUALIFIED",
            qualifiedAt,
          },
          update: {
            status: "QUALIFIED",
            qualifiedAt,
            disqualifiedAt: null,
            reason: null,
          },
        });

        // 6. Capacity allocation vs Queue
        const activeSlotsCount = await tx.wLSlot.count({
          where: {
            programId: input.programId,
            status: { in: ["ALLOCATED", "CONFIRMED"] },
          },
        });

        // Check if any users are waiting in the queue ahead of this user
        const nextWaitingEntry = await tx.wLQueueEntry.findFirst({
          where: {
            programId: input.programId,
            status: "WAITING",
          },
          orderBy: [{ joinedAt: "asc" }, { queueNumber: "asc" }],
          select: { id: true, userId: true },
        });

        const isEligibleForDirectSlot =
          activeSlotsCount < program.totalSlots &&
          (!nextWaitingEntry || nextWaitingEntry.userId === input.userId);

        if (isEligibleForDirectSlot) {
          const availableSlotNumber = await findLowestAvailableSlotNumber(
            tx,
            input.programId,
            program.totalSlots,
          );

          if (availableSlotNumber !== null) {
            const newSlot = await tx.wLSlot.create({
              data: {
                programId: input.programId,
                userId: input.userId,
                slotNumber: availableSlotNumber,
                status: "ALLOCATED",
                allocatedAt: now,
                allocatedBy: "QUALIFICATION_ENGINE",
              },
            });

            await tx.wLProgram.update({
              where: { id: input.programId },
              data: { allocatedSlotsCount: { increment: 1 } },
            });

            // If user had a waiting queue entry, mark it PROCESSED
            await tx.wLQueueEntry.updateMany({
              where: {
                programId: input.programId,
                userId: input.userId,
                status: "WAITING",
              },
              data: {
                status: "PROCESSED",
                processedAt: now,
              },
            });

            await tx.wLStatusHistory.create({
              data: {
                programId: input.programId,
                userId: input.userId,
                fromPhase: "QUALIFIED",
                toPhase: "SLOT_ALLOCATED",
                action: "SLOT_ALLOCATED_CAPACITY_AVAILABLE",
                metadata: { slotNumber: newSlot.slotNumber },
              },
            });

            return {
              qualified: true,
              phase: "SLOT_ALLOCATED",
              qualifiedAt,
              slotNumber: newSlot.slotNumber,
              missingRequirements: [],
              details: {
                hasVerifiedWallet,
                hasLinkedX,
                xUsername: user.xIdentity?.username,
                heldCategories,
                missingCategories,
                completedMandatoryTasksCount,
                totalMandatoryTasksCount,
                isBanned,
              },
            };
          }
        }

        // Capacity is full or user must enter queue
        const existingQueueEntry = await tx.wLQueueEntry.findUnique({
          where: {
            programId_userId: {
              programId: input.programId,
              userId: input.userId,
            },
          },
        });

        let queueNumber: number;
        let joinedAt: Date;

        if (existingQueueEntry && existingQueueEntry.status === "WAITING") {
          queueNumber = existingQueueEntry.queueNumber;
          joinedAt = existingQueueEntry.joinedAt;
        } else {
          queueNumber = await getNextQueueNumber(tx, input.programId);
          joinedAt = qualifiedAt;

          await tx.wLQueueEntry.upsert({
            where: {
              programId_userId: {
                programId: input.programId,
                userId: input.userId,
              },
            },
            create: {
              programId: input.programId,
              userId: input.userId,
              queueNumber,
              joinedAt,
              priorityScore: 0,
              status: "WAITING",
            },
            update: {
              queueNumber,
              joinedAt,
              status: "WAITING",
              processedAt: null,
            },
          });

          await tx.wLStatusHistory.create({
            data: {
              programId: input.programId,
              userId: input.userId,
              fromPhase: "QUALIFIED",
              toPhase: "IN_QUEUE",
              action: "JOINED_QUEUE_CAPACITY_FULL",
              metadata: { queueNumber },
            },
          });
        }

        // Calculate queue rank (how many waiting users have earlier joinedAt or smaller queueNumber)
        const earlierInQueueCount = await tx.wLQueueEntry.count({
          where: {
            programId: input.programId,
            status: "WAITING",
            OR: [
              { joinedAt: { lt: joinedAt } },
              { AND: [{ joinedAt: joinedAt }, { queueNumber: { lt: queueNumber } }] },
            ],
          },
        });

        return {
          qualified: true,
          phase: "IN_QUEUE",
          qualifiedAt,
          queueNumber,
          queueRank: earlierInQueueCount + 1,
          missingRequirements: [],
          details: {
            hasVerifiedWallet,
            hasLinkedX,
            xUsername: user.xIdentity?.username,
            heldCategories,
            missingCategories,
            completedMandatoryTasksCount,
            totalMandatoryTasksCount,
            isBanned,
          },
        };
      });
    } catch (err: unknown) {
      if (isRetryableWlConcurrencyConflict(err) && attempt < maxRetries) {
        continue;
      }
      throw err;
    }
  }

  throw new WhitelistError(
    "CONCURRENCY_COLLISION_RETRYABLE",
    "A concurrency collision occurred during whitelist allocation. Please retry.",
    409,
  );
}

/**
 * Reconciles open WL slots with queued participants (first-qualified-first-allocated).
 * Safely handles concurrency collisions and guarantees idempotency.
 */
export async function reconcileQueueSlots(
  prisma: PrismaClient,
  programId: string,
  now: Date = new Date(),
  maxRetries: number = MAX_WL_RETRIES,
): Promise<{ slotsFilled: number; openSlotsRemaining: number }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const program = await tx.wLProgram.findUnique({
          where: { id: programId },
        });
        if (!program) {
          throw new WhitelistError("PROGRAM_NOT_FOUND", "Program not found.", 404);
        }
        if (program.status !== "OPEN") {
          throw new WhitelistError(
            "PROGRAM_NOT_ACTIVE",
            `Whitelist program is not open (current status: ${program.status}).`,
            400,
          );
        }

        const activeSlotsCount = await tx.wLSlot.count({
          where: {
            programId,
            status: { in: ["ALLOCATED", "CONFIRMED"] },
          },
        });

        const openSlotsCount = program.totalSlots - activeSlotsCount;
        if (openSlotsCount <= 0) {
          return { slotsFilled: 0, openSlotsRemaining: 0 };
        }

        // Fetch waiting queue entries ordered strictly by joinedAt ASC, then queueNumber ASC
        const waitingEntries = await tx.wLQueueEntry.findMany({
          where: {
            programId,
            status: "WAITING",
          },
          orderBy: [{ joinedAt: "asc" }, { queueNumber: "asc" }],
          take: openSlotsCount,
        });

        if (waitingEntries.length === 0) {
          return { slotsFilled: 0, openSlotsRemaining: openSlotsCount };
        }

        let slotsFilled = 0;
        for (const entry of waitingEntries) {
          // Re-verify remaining capacity before allocating next slot
          const currentActiveCount = await tx.wLSlot.count({
            where: {
              programId,
              status: { in: ["ALLOCATED", "CONFIRMED"] },
            },
          });
          if (currentActiveCount >= program.totalSlots) {
            break;
          }

          // Atomic transition: mark as PROCESSED only if still WAITING
          const updatedEntry = await tx.wLQueueEntry.updateMany({
            where: {
              id: entry.id,
              status: "WAITING",
            },
            data: {
              status: "PROCESSED",
              processedAt: now,
            },
          });

          // Another concurrent reconciler already handled this entry
          if (updatedEntry.count === 0) {
            continue;
          }

          const slotNumber = await findLowestAvailableSlotNumber(
            tx,
            programId,
            program.totalSlots,
          );

          if (slotNumber === null) {
            // Capacity exhausted concurrently; restore entry status and stop
            await tx.wLQueueEntry.update({
              where: { id: entry.id },
              data: {
                status: "WAITING",
                processedAt: null,
              },
            });
            break;
          }

          await tx.wLSlot.create({
            data: {
              programId,
              userId: entry.userId,
              slotNumber,
              status: "ALLOCATED",
              allocatedAt: now,
              allocatedBy: "QUEUE_RECONCILER",
            },
          });

          await tx.wLStatusHistory.create({
            data: {
              programId,
              userId: entry.userId,
              fromPhase: "IN_QUEUE",
              toPhase: "SLOT_ALLOCATED",
              action: "RECONCILED_FROM_QUEUE",
              metadata: { slotNumber, queueNumber: entry.queueNumber },
            },
          });

          slotsFilled++;
        }

        if (slotsFilled > 0) {
          await tx.wLProgram.update({
            where: { id: programId },
            data: { allocatedSlotsCount: { increment: slotsFilled } },
          });
        }

        const finalActiveSlotsCount = await tx.wLSlot.count({
          where: {
            programId,
            status: { in: ["ALLOCATED", "CONFIRMED"] },
          },
        });

        return {
          slotsFilled,
          openSlotsRemaining: Math.max(0, program.totalSlots - finalActiveSlotsCount),
        };
      });
    } catch (err: unknown) {
      if (isRetryableWlConcurrencyConflict(err) && attempt < maxRetries) {
        continue;
      }
      throw err;
    }
  }

  throw new WhitelistError(
    "CONCURRENCY_COLLISION_RETRYABLE",
    "A concurrency collision occurred during queue reconciliation. Please retry.",
    409,
  );
}

/**
 * Read-only status evaluation that performs zero mutations or side-effects.
 */
export async function getUserQualificationStatus(
  prisma: PrismaClient,
  input: {
    userId: string;
    programId: string;
    now?: Date;
  },
): Promise<QualificationCheckResult> {
  return evaluateUserQualification(prisma, {
    ...input,
    readOnly: true,
  });
}
