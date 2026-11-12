import type { PrismaClient, WLProgramStatus } from "@prisma/client";
import { isValidAddress, normalizeAddress } from "@/lib/auth/address";
import { executeQualificationEvaluation } from "../whitelist/qualification";

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
        select: {
          id: true,
          isBanned: true,
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
 * - Ordered chronologically by registration (joinedAt ASC, queueNumber ASC).
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
      { joinedAt: "asc" },
      { queueNumber: "asc" },
    ],
    include: {
      user: {
        select: {
          id: true,
          isBanned: true,
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

    // 2. Exclude revoked participants (DEC-022 Full WL Disqualification Policy)
    if (user.wlQualifications?.some((q) => q.status === "REVOKED")) continue;

    // 3. Evaluate qualification status via centralized qualification engine (Task 4.3)
    const qualResult = await executeQualificationEvaluation(
      prisma,
      {
        userId: user.id,
        programId,
        readOnly: true,
        allowClosed: true,
      },
      now,
    );

    if (!qualResult.qualified) {
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

  // 2. Resolve program deterministically (Task 4.1 / 4.2 / 4.3)
  const program = await resolveProgramForAudit(prisma, programIdOrSlug);

  // 3. Strict freeze invariant: Registration must be closed or finalized
  if (!isProgramClosed(program, now)) {
    throw new OpenSeaExportError(
      "PROGRAM_NOT_FINALIZED",
      `Whitelist program '${program.name}' (status: ${program.status}) is still active. Export is only permitted after registration has closed or finalized.`,
      409,
    );
  }

  // 4. Resolve GTD wallets (Task 4.2: FLAGGED included while REVOKED excluded)
  const gtdWallets = await getGTDWallets(prisma, program.id, now);
  const gtdWalletSet = new Set(gtdWallets);

  let targetWallets: string[];
  let filename: string;

  if (stage === "gtd") {
    targetWallets = gtdWallets;
    filename = "elychimp-gtd-allowlist.csv";
  } else {
    // FCFS (Task 4.3): Only qualified candidates, strictly excluding GTD wallets
    targetWallets = await getFCFSWallets(prisma, program.id, gtdWalletSet, now);
    filename = "elychimp-fcfs-allowlist.csv";

    // Strict runtime disjointness assertion
    const overlapping = targetWallets.filter((w) => gtdWalletSet.has(w));
    if (overlapping.length > 0) {
      throw new OpenSeaExportError(
        "DISJOINT_SET_VIOLATION",
        `Internal integrity violation: FCFS export contains ${overlapping.length} wallet(s) already present in GTD allowlist.`,
        500,
      );
    }
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

// ---------------------------------------------------------------------------
// Pre-Export Audit Summary Types & Service (Task 4.1)
// ---------------------------------------------------------------------------

export interface PreExportAuditSummaryResult {
  program: {
    id: string;
    slug: string;
    name: string;
    status: WLProgramStatus;
    totalSlots: number;
    allocatedSlotsCount: number;
  };
  gtd: {
    totalSlots: number;
    allocatedCount: number;
    vacantCount: number;
    flaggedCount: number;
    walletsCount: number;
  };
  fcfs: {
    totalDirectoryEntries: number;
    bannedOrDisqualifiedCount: number;
    inactiveDirectoryEntriesCount: number;
    underQualifiedCount: number;
    alreadyGtdCount: number;
    qualifiedReadyCount: number;
    accountingBalanceCheck: boolean;
  };
  disjointVerification: {
    disjointSetVerified: boolean;
    overlappingWalletsCount: number;
    overlappingWallets: string[];
  };
  timestamp: string;
}

export interface GetPreExportAuditSummaryOptions {
  prisma: PrismaClient;
  programIdOrSlug?: string | null;
  now?: Date;
}

/**
 * Resolves program deterministically according to agreed AC-4.1.4:
 * 1. If programIdOrSlug is provided -> find by ID or slug. Throw 404 if not found.
 * 2. If omitted:
 *    - Count total programs in DB.
 *    - If 0 -> throw 404 NO_PROGRAMS_FOUND.
 *    - If 1 -> return that single program.
 *    - If > 1 -> throw 400 AMBIGUOUS_PROGRAM_SELECTION.
 */
export async function resolveProgramForAudit(
  prisma: PrismaClient,
  programIdOrSlug?: string | null,
) {
  if (programIdOrSlug && programIdOrSlug.trim()) {
    const ident = programIdOrSlug.trim();
    const program = await prisma.wLProgram.findFirst({
      where: {
        OR: [{ id: ident }, { slug: ident }],
      },
    });
    if (!program) {
      throw new OpenSeaExportError(
        "PROGRAM_NOT_FOUND",
        `Whitelist program '${ident}' was not found.`,
        404,
      );
    }
    return program;
  }

  const allPrograms = await prisma.wLProgram.findMany({
    orderBy: { createdAt: "desc" },
  });

  if (allPrograms.length === 0) {
    throw new OpenSeaExportError(
      "NO_PROGRAMS_FOUND",
      "No whitelist programs found in the database.",
      404,
    );
  }

  if (allPrograms.length === 1) {
    return allPrograms[0];
  }

  throw new OpenSeaExportError(
    "AMBIGUOUS_PROGRAM_SELECTION",
    "Multiple whitelist programs exist. Please specify 'programId' or 'slug' query parameter.",
    400,
  );
}

/**
 * Generates Pre-Export Audit Summary (Task 4.1) prior to OpenSea allowlist export.
 *
 * Guarantees:
 * - Read-only qualification evaluation via executeQualificationEvaluation (readOnly: true, allowClosed: true).
 * - Exact 5-category MECE accounting for FCFS directory.
 * - Dynamic disjoint set verification comparing qualified candidates directly against active GTD wallets.
 * - Flagged active slot audit count visibility.
 */
export async function getPreExportAuditSummary(
  options: GetPreExportAuditSummaryOptions,
): Promise<PreExportAuditSummaryResult> {
  const { prisma, programIdOrSlug, now = new Date() } = options;

  // 1. Resolve program deterministically
  const program = await resolveProgramForAudit(prisma, programIdOrSlug);

  // 2. Query GTD slots
  const slots = await prisma.wLSlot.findMany({
    where: { programId: program.id },
    orderBy: { slotNumber: "asc" },
    include: {
      user: {
        select: {
          id: true,
          isBanned: true,
          wallet: true,
          banRecords: {
            where: { isActive: true },
          },
          wlQualifications: {
            where: { programId: program.id },
          },
        },
      },
    },
  });

  const activeSlots = slots.filter(
    (s) => s.status === "ALLOCATED" || s.status === "CONFIRMED",
  );
  const totalSlots = program.totalSlots;
  const allocatedCount = activeSlots.length;
  const vacantCount = Math.max(0, totalSlots - allocatedCount);
  const flaggedCount = activeSlots.filter(
    (s: any) => s.reviewStatus === "FLAGGED",
  ).length;

  const gtdWallets: string[] = [];
  const gtdWalletSet = new Set<string>();

  for (const slot of activeSlots) {
    const user = slot.user;
    if (!user) continue;
    if (isUserBanned(user, now)) continue;

    const rawAddress = user.wallet?.address;
    if (!rawAddress || typeof rawAddress !== "string") continue;
    const trimmed = rawAddress.trim();
    const cleanAddress = trimmed.startsWith("0X") ? `0x${trimmed.slice(2)}` : trimmed;
    if (!isValidAddress(cleanAddress)) continue;

    const norm = normalizeAddress(cleanAddress);
    if (!gtdWalletSet.has(norm)) {
      gtdWalletSet.add(norm);
      gtdWallets.push(norm);
    }
  }

  // 3. Query FCFS directory entries
  const queueEntries = await prisma.wLQueueEntry.findMany({
    where: { programId: program.id },
    orderBy: [
      { joinedAt: "asc" },
      { queueNumber: "asc" },
    ],
    include: {
      user: {
        select: {
          id: true,
          isBanned: true,
          wallet: true,
          banRecords: {
            where: { isActive: true },
          },
          wlQualifications: {
            where: { programId: program.id },
          },
        },
      },
    },
  });

  const totalDirectoryEntries = queueEntries.length;

  let bannedOrDisqualifiedCount = 0;
  let inactiveDirectoryEntriesCount = 0;
  let underQualifiedCount = 0;
  let alreadyGtdCount = 0;
  let qualifiedReadyCount = 0;

  interface QualifiedCandidate {
    userId: string;
    walletAddress: string;
  }
  const qualifiedCandidates: QualifiedCandidate[] = [];

  for (const entry of queueEntries) {
    const user = entry.user;

    // A. Banned or punitive disqualification (including GTD revocation per DEC-022)
    const isRevoked = user?.wlQualifications?.some((q: any) => q.status === "REVOKED");
    if (!user || isUserBanned(user, now) || isRevoked) {
      bannedOrDisqualifiedCount++;
      continue;
    }

    // B. Inactive directory entries (CANCELLED / EXPIRED)
    if (entry.status === "CANCELLED" || entry.status === "EXPIRED") {
      inactiveDirectoryEntriesCount++;
      continue;
    }

    // C. Entry was already processed into GTD
    if (entry.status === "PROCESSED") {
      alreadyGtdCount++;
      continue;
    }

    // D. Evaluate qualification for candidate via read-only engine
    const qualResult = await executeQualificationEvaluation(
      prisma,
      {
        userId: user.id,
        programId: program.id,
        readOnly: true,
        allowClosed: true,
      },
      now,
    );

    if (!qualResult.qualified) {
      underQualifiedCount++;
      continue;
    }

    // Check EVM wallet validity
    const rawAddress = user.wallet?.address;
    if (!rawAddress || typeof rawAddress !== "string") {
      underQualifiedCount++;
      continue;
    }
    const trimmed = rawAddress.trim();
    const cleanAddress = trimmed.startsWith("0X") ? `0x${trimmed.slice(2)}` : trimmed;
    if (!isValidAddress(cleanAddress)) {
      underQualifiedCount++;
      continue;
    }

    const norm = normalizeAddress(cleanAddress);
    qualifiedCandidates.push({
      userId: user.id,
      walletAddress: norm,
    });
  }

  // 4. Dynamic Disjoint Set Comparison:
  // Compare qualified candidates directly against active GTD wallets BEFORE final classification into alreadyGtd vs qualifiedReady
  const overlappingWalletsSet = new Set<string>();

  for (const candidate of qualifiedCandidates) {
    if (gtdWalletSet.has(candidate.walletAddress)) {
      overlappingWalletsSet.add(candidate.walletAddress);
      alreadyGtdCount++;
    } else {
      qualifiedReadyCount++;
    }
  }

  const overlappingWallets = Array.from(overlappingWalletsSet);
  const overlappingWalletsCount = overlappingWallets.length;
  const disjointSetVerified = overlappingWalletsCount === 0;

  // 5. Accounting balance check
  const accountingBalanceCheck =
    totalDirectoryEntries ===
    bannedOrDisqualifiedCount +
      inactiveDirectoryEntriesCount +
      underQualifiedCount +
      alreadyGtdCount +
      qualifiedReadyCount;

  return {
    program: {
      id: program.id,
      slug: program.slug,
      name: program.name,
      status: program.status,
      totalSlots: program.totalSlots,
      allocatedSlotsCount: program.allocatedSlotsCount,
    },
    gtd: {
      totalSlots,
      allocatedCount,
      vacantCount,
      flaggedCount,
      walletsCount: gtdWallets.length,
    },
    fcfs: {
      totalDirectoryEntries,
      bannedOrDisqualifiedCount,
      inactiveDirectoryEntriesCount,
      underQualifiedCount,
      alreadyGtdCount,
      qualifiedReadyCount,
      accountingBalanceCheck,
    },
    disjointVerification: {
      disjointSetVerified,
      overlappingWalletsCount,
      overlappingWallets,
    },
    timestamp: now.toISOString(),
  };
}
