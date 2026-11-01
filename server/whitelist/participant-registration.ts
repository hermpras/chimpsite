import type { PrismaClient, WLQueueEntry } from "@prisma/client";
import { WhitelistError } from "./qualification";
import { lockWlProgramForUpdate } from "./capacity-guard";

export class ParticipantRegistrationError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = "ParticipantRegistrationError";
    this.code = code;
    this.status = status;
  }
}

export interface RegisterParticipantInput {
  userId: string;
  programId?: string;
  now?: Date;
  maxRetries?: number;
}

export interface RegisterParticipantResult {
  entry: WLQueueEntry;
  isNewRegistration: boolean;
}

/**
 * Checks if a Prisma error represents a unique constraint violation on queueNumber.
 */
export function isQueueNumberCollision(err: unknown): boolean {
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

    if (targetStr.includes("userId") || (!targetStr && message.includes("userId"))) {
      return false;
    }

    if (
      targetStr.includes("queueNumber") ||
      (targetStr.includes("WLQueueEntry") && targetStr.includes("queueNumber")) ||
      (!targetStr && message.includes("queueNumber"))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Concurrency-Safe, Idempotent FCFS Directory Participant Registration (DEC-013, DEC-017).
 *
 * Automatically records participants in the FCFS Directory (WLQueueEntry) when they have
 * connected an EVM wallet AND an X (Twitter) account.
 *
 * Guarantees:
 * 1. Unconditional: Does not require 5 traits or task completion.
 * 2. Immutable: joinedAt and queueNumber are strictly preserved once initially assigned.
 * 3. Idempotent: Calling multiple times returns the existing record without modifying it.
 * 4. Concurrency-Safe: Assigns sequential queueNumber safely under WLProgram row-level lock.
 */
export async function registerParticipantInDirectory(
  prisma: any,
  input: RegisterParticipantInput,
): Promise<RegisterParticipantResult> {
  const maxRetries = input.maxRetries ?? 5;
  const now = input.now ?? new Date();

  if (!input.userId || typeof input.userId !== "string" || !input.userId.trim()) {
    throw new ParticipantRegistrationError("USER_ID_REQUIRED", "User ID is required.", 400);
  }

  // If already in a transaction, execute single attempt within current transaction
  const executeInTx = async (tx: any): Promise<RegisterParticipantResult> => {
    // 1. Resolve target program
    let programId: string;
    if (input.programId) {
      programId = input.programId;
    } else {
      const openProgram = await tx.wLProgram.findFirst({
        where: { status: "OPEN" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (!openProgram) {
        throw new ParticipantRegistrationError(
          "NO_OPEN_PROGRAM",
          "No open Whitelist program found to register participant.",
          404,
        );
      }
      programId = openProgram.id;
    }

    // 2. Check user existence and prerequisites (EVM wallet and X identity)
    const user = await tx.user.findUnique({
      where: { id: input.userId },
      include: {
        wallet: true,
        xIdentity: true,
      },
    });

    if (!user) {
      throw new ParticipantRegistrationError("USER_NOT_FOUND", "User not found.", 404);
    }

    if (!user.wallet?.address) {
      throw new ParticipantRegistrationError(
        "WALLET_REQUIRED",
        "EVM wallet connection is required for FCFS Directory registration.",
        400,
      );
    }

    if (!user.xIdentity?.xId) {
      throw new ParticipantRegistrationError(
        "X_IDENTITY_REQUIRED",
        "Linked X (Twitter) account is required for FCFS Directory registration.",
        400,
      );
    }

    // 3. Idempotency Check: if entry already exists, return immutably
    const existingEntry = await tx.wLQueueEntry.findUnique({
      where: {
        programId_userId: {
          programId,
          userId: input.userId,
        },
      },
    });

    if (existingEntry) {
      return {
        entry: existingEntry,
        isNewRegistration: false,
      };
    }

    // 4. Lock WLProgram to serialize concurrent registrations
    await lockWlProgramForUpdate(tx, programId);

    // Double-check existence after acquiring lock
    const existingAfterLock = await tx.wLQueueEntry.findUnique({
      where: {
        programId_userId: {
          programId,
          userId: input.userId,
        },
      },
    });

    if (existingAfterLock) {
      return {
        entry: existingAfterLock,
        isNewRegistration: false,
      };
    }

    // 5. Determine next sequential queue number
    const highestEntry = await tx.wLQueueEntry.findFirst({
      where: { programId },
      orderBy: { queueNumber: "desc" },
      select: { queueNumber: true },
    });
    const nextQueueNumber = (highestEntry?.queueNumber ?? 0) + 1;

    // 6. Create immutable registration record
    const entry = await tx.wLQueueEntry.create({
      data: {
        programId,
        userId: input.userId,
        queueNumber: nextQueueNumber,
        joinedAt: now,
        priorityScore: 0,
        status: "WAITING",
      },
    });

    // 7. Record status history
    await tx.wLStatusHistory.create({
      data: {
        programId,
        userId: input.userId,
        fromPhase: "NONE",
        toPhase: "IN_QUEUE",
        action: "FCFS_DIRECTORY_REGISTERED",
        metadata: {
          queueNumber: nextQueueNumber,
          joinedAt: now.toISOString(),
        },
        createdAt: now,
      },
    });

    return {
      entry,
      isNewRegistration: true,
    };
  };

  // If prisma has $transaction, wrap in transaction with bounded retry
  if (typeof prisma.$transaction === "function") {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await prisma.$transaction(async (tx: any) => {
          return await executeInTx(tx);
        });
      } catch (err: unknown) {
        // If unique constraint collision on userId, user was registered concurrently; return existing entry
        if (
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as { code?: unknown }).code === "P2002"
        ) {
          const pErr = err as { meta?: { target?: unknown } };
          const target = pErr.meta?.target;
          const targetStr = Array.isArray(target) ? target.join(",") : String(target ?? "");
          if (targetStr.includes("userId")) {
            const existing = await prisma.wLQueueEntry.findFirst({
              where: {
                userId: input.userId,
                ...(input.programId ? { programId: input.programId } : {}),
              },
            });
            if (existing) {
              return { entry: existing, isNewRegistration: false };
            }
          }
        }

        // If collision on queueNumber or write conflict, retry with backoff + jitter
        if (isQueueNumberCollision(err) && attempt < maxRetries) {
          const delay = 50 * Math.pow(2, attempt) + Math.floor(Math.random() * 25);
          await new Promise((res) => setTimeout(res, delay));
          continue;
        }

        throw err;
      }
    }
  }

  // Direct tx execution fallback
  return executeInTx(prisma);
}
