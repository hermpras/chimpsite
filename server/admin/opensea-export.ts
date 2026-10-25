import type { PrismaClient, WLProgramStatus } from "@prisma/client";
import { isValidAddress, normalizeAddress } from "@/lib/auth/address";

// ---------------------------------------------------------------------------
// Error Class
// ---------------------------------------------------------------------------

export class OpenSeaExportError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = "OpenSeaExportError";
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Status & Ban Evaluation Helpers
// ---------------------------------------------------------------------------

/**
 * Evaluates whether a whitelist program is closed / frozen.
 * Export is strictly prohibited while registration is active.
 * A program is considered closed/frozen if:
 * 1. Its status is "FINALIZED" or "CLOSED", OR
 * 2. Its endsAt timestamp is defined and now >= endsAt.
 */
export function isProgramClosed(
  program: {
    status: WLProgramStatus | string;
    endsAt?: Date | string | null;
  },
  now: Date = new Date(),
): boolean {
  if (program.status === "FINALIZED" || program.status === "CLOSED") {
    return true;
  }
  if (program.endsAt) {
    const endsDate = new Date(program.endsAt);
    if (!isNaN(endsDate.getTime()) && endsDate <= now) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether a user has an active ban or whitelist disqualification.
 */
export function isUserBanned(
  user: {
    isBanned?: boolean;
    banRecords?: Array<{
      isActive: boolean;
      expiresAt: Date | string | null;
      scope: string;
    }>;
  },
  now: Date = new Date(),
): boolean {
  if (user.isBanned) return true;
  if (user.banRecords && user.banRecords.length > 0) {
    return user.banRecords.some((b) => {
      if (!b.isActive) return false;
      if (b.expiresAt) {
        const exp = new Date(b.expiresAt);
        if (!isNaN(exp.getTime()) && exp <= now) return false;
      }
      return b.scope === "FULL_SYSTEM" || b.scope === "WL_DISQUALIFIED";
    });
  }
  return false;
}

// ---------------------------------------------------------------------------
// Allowlist Retrieval Functions
// ---------------------------------------------------------------------------

/**
 * Retrieves valid, active GTD wallet addresses for a program.
 * - Filters for WLSlot with status ALLOCATED or CONFIRMED.
 * - Excludes banned or disqualified users.
 * - Validates and normalizes EVM addresses to lowercase.
 * - Deduplicates wallet addresses.
 */
export async function getGTDWallets(
  prisma: PrismaClient,
  programId: string,
  now: Date = new Date(),
): Promise<string[]> {
  const slots = await prisma.wLSlot.findMany({
    where: {
      programId,
      status: { in: ["ALLOCATED", "CONFIRMED"] },
    },
    orderBy: { slotNumber: "asc" },
    include: {
      user: {
        include: {
          wallet: true,
          banRecords: {
            where: { isActive: true },
          },
          wlQualifications: {
            where: { programId },
          },
        },
      },
    },
  });

  const addresses: string[] = [];
  const seen = new Set<string>();

  for (const slot of slots) {
    const user = slot.user;
    if (!user) continue;

    // 1. Exclude banned users
    if (isUserBanned(user, now)) continue;

    // 2. Exclude users with revoked or disqualified status
    const qual = user.wlQualifications?.[0];
    if (qual && (qual.status === "REVOKED" || qual.status === "DISQUALIFIED")) {
      continue;
    }

    // 3. Validate EVM address
    const rawAddress = user.wallet?.address;
    if (!rawAddress || typeof rawAddress !== "string") continue;
    const trimmed = rawAddress.trim();
    const cleanAddress = trimmed.startsWith("0X") ? `0x${trimmed.slice(2)}` : trimmed;
    if (!isValidAddress(cleanAddress)) continue;

    // 4. Normalize to lowercase 40-hex
    const norm = normalizeAddress(cleanAddress);

    // 5. Deduplicate
    if (!seen.has(norm)) {
      seen.add(norm);
      addresses.push(norm);
    }
  }

  return addresses;
}

/**
 * Retrieves valid FCFS wallet addresses for a program.
 * - Filters for WLQueueEntry with status WAITING.
 * - Ordered by queue priority (priorityScore DESC, joinedAt ASC, queueNumber ASC).
 * - Excludes banned or disqualified users.
 * - STRICT DISJOINT GUARANTEE: Excludes all wallets present in GTD allowlist.
 * - Validates and normalizes EVM addresses to lowercase.
 * - Deduplicates wallet addresses.
 */
export async function getFCFSWallets(
  prisma: PrismaClient,
  programId: string,
  gtdWalletSet: Set<string>,
  now: Date = new Date(),
): Promise<string[]> {
  const queueEntries = await prisma.wLQueueEntry.findMany({
    where: {
      programId,
      status: "WAITING",
    },
    orderBy: [
      { priorityScore: "desc" },
      { joinedAt: "asc" },
      { queueNumber: "asc" },
    ],
    include: {
      user: {
        include: {
          wallet: true,
          banRecords: {
            where: { isActive: true },
          },
          wlQualifications: {
            where: { programId },
          },
        },
      },
    },
  });

  const addresses: string[] = [];
  const seen = new Set<string>();

  for (const entry of queueEntries) {
    const user = entry.user;
    if (!user) continue;

    // 1. Exclude banned users
    if (isUserBanned(user, now)) continue;

    // 2. Exclude users with revoked or disqualified status
    const qual = user.wlQualifications?.[0];
    if (qual && (qual.status === "REVOKED" || qual.status === "DISQUALIFIED")) {
      continue;
    }

    // 3. Validate EVM address
    const rawAddress = user.wallet?.address;
    if (!rawAddress || typeof rawAddress !== "string") continue;
    const trimmed = rawAddress.trim();
    const cleanAddress = trimmed.startsWith("0X") ? `0x${trimmed.slice(2)}` : trimmed;
    if (!isValidAddress(cleanAddress)) continue;

    // 4. Normalize to lowercase 40-hex
    const norm = normalizeAddress(cleanAddress);

    // 5. STRICT DISJOINT GUARANTEE: GTD wallets must never appear in FCFS
    if (gtdWalletSet.has(norm)) continue;

    // 6. Deduplicate within FCFS
    if (!seen.has(norm)) {
      seen.add(norm);
      addresses.push(norm);
    }
  }

  return addresses;
}

// ---------------------------------------------------------------------------
// CSV Formatting
// ---------------------------------------------------------------------------

/**
 * Formats allowlist wallets into OpenSea SeaDrop CSV format:
 * - NO header line.
 * - Each row: wallet_address,mint_limit (with limit = 1).
 * - Line delimiter: \n.
 */
export function formatOpenSeaAllowlistCsv(wallets: string[]): string {
  if (wallets.length === 0) return "";
  return wallets.map((addr) => `${addr},1`).join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Main Export Service
// ---------------------------------------------------------------------------

export type OpenSeaAllowlistStage = "gtd" | "fcfs";

export interface ExportOpenSeaAllowlistOptions {
  prisma: PrismaClient;
  programIdOrSlug?: string | null;
  stage: OpenSeaAllowlistStage | string;
  now?: Date;
}

export interface ExportOpenSeaAllowlistResult {
  filename: string;
  csv: string;
  count: number;
  stage: OpenSeaAllowlistStage;
  program: {
    id: string;
    slug: string;
    name: string;
    status: WLProgramStatus;
  };
}

/**
 * Main export service function for OpenSea SeaDrop allowlist CSV generation.
 */
export async function exportOpenSeaAllowlist(
  options: ExportOpenSeaAllowlistOptions,
): Promise<ExportOpenSeaAllowlistResult> {
  const { prisma, programIdOrSlug, now = new Date() } = options;

  // 1. Validate stage
  const rawStage = (options.stage || "").trim().toLowerCase();
  if (rawStage !== "gtd" && rawStage !== "fcfs") {
    throw new OpenSeaExportError(
      "INVALID_EXPORT_STAGE",
      `Export stage must be either 'gtd' or 'fcfs' (received: '${options.stage}').`,
      400,
    );
  }
  const stage = rawStage as OpenSeaAllowlistStage;

  // 2. Resolve program by identifier (ID or slug), or fallback to main/latest program
  let program;
  if (programIdOrSlug && programIdOrSlug.trim()) {
    const ident = programIdOrSlug.trim();
    program = await prisma.wLProgram.findFirst({
      where: {
        OR: [{ id: ident }, { slug: ident }],
      },
    });
  } else {
    program = await prisma.wLProgram.findUnique({
      where: { slug: "chimphood-wl-main" },
    });
    if (!program) {
      program = await prisma.wLProgram.findFirst({
        orderBy: { createdAt: "desc" },
      });
    }
  }

  if (!program) {
    throw new OpenSeaExportError(
      "PROGRAM_NOT_FOUND",
      "Whitelist program was not found.",
      404,
    );
  }

  // 3. Strict freeze invariant: Registration must be closed or finalized
  if (!isProgramClosed(program, now)) {
    throw new OpenSeaExportError(
      "PROGRAM_NOT_FINALIZED",
      `Whitelist program '${program.name}' (status: ${program.status}) is still active. Export is only permitted after registration has closed or finalized.`,
      409,
    );
  }

  // 4. Resolve GTD wallets
  const gtdWallets = await getGTDWallets(prisma, program.id, now);
  const gtdWalletSet = new Set(gtdWallets);

  let targetWallets: string[];
  let filename: string;

  if (stage === "gtd") {
    targetWallets = gtdWallets;
    filename = "chimphood-gtd-allowlist.csv";
  } else {
    // FCFS: pass gtdWalletSet so GTD wallets are strictly excluded
    targetWallets = await getFCFSWallets(prisma, program.id, gtdWalletSet, now);
    filename = "chimphood-fcfs-allowlist.csv";
  }

  const csv = formatOpenSeaAllowlistCsv(targetWallets);

  return {
    filename,
    csv,
    count: targetWallets.length,
    stage,
    program: {
      id: program.id,
      slug: program.slug,
      name: program.name,
      status: program.status,
    },
  };
}
