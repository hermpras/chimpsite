import type { PrismaClient, Drop, DropPeriod, DropPoolItem, Trait } from "@prisma/client";
import {
  CYCLE_DURATION_MS,
  DEFAULT_CYCLE_DURATION_HOURS,
  getUtcCycleForTime,
} from "./schedule";

export interface DefaultTraitTemplate {
  slug: string;
  name: string;
  category: "BG" | "FUR" | "CLOTHING" | "HEADWEAR" | "EYEWEAR";
  rarity: "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";
  description: string;
  imageUrl: string;
  maxSupply: number;
  stock: number;
  weight: number;
}

/**
 * 250 total stock distributed across 5 core categories (1 trait per category):
 * - Common BG (Cyber Jungle): 85 stock (34%)
 * - Uncommon CLOTHING (Stealth Hoodie): 65 stock (26%)
 * - Rare FUR (Golden Fur): 50 stock (20%)
 * - Epic EYEWEAR (Laser Visor): 40 stock (16%)
 * - Legendary HEADWEAR (Cyber Halo): 10 stock (4%)
 * Total stock = 250, Total weight = 250 (100%)
 */
export const DEFAULT_TRAIT_TEMPLATES: readonly DefaultTraitTemplate[] = [
  {
    slug: "cyber-jungle-bg",
    name: "Cyber Jungle",
    category: "BG",
    rarity: "COMMON",
    description: "Lush cybernetic jungle canopy bathed in neon bioluminescence.",
    imageUrl: "https://assets.chimphood.io/traits/cyber-jungle.png",
    maxSupply: 1000,
    stock: 85,
    weight: 85,
  },
  {
    slug: "stealth-hoodie",
    name: "Stealth Hoodie",
    category: "CLOTHING",
    rarity: "UNCOMMON",
    description: "Matte black tactical hoodie with holographic ChimpHood insignias.",
    imageUrl: "https://assets.chimphood.io/traits/stealth-hoodie.png",
    maxSupply: 800,
    stock: 65,
    weight: 65,
  },
  {
    slug: "golden-fur",
    name: "Golden Fur",
    category: "FUR",
    rarity: "RARE",
    description: "Gleaming golden cyber-primate fur coated with nanites.",
    imageUrl: "https://assets.chimphood.io/traits/golden-fur.png",
    maxSupply: 500,
    stock: 50,
    weight: 50,
  },
  {
    slug: "laser-visor",
    name: "Laser Visor",
    category: "EYEWEAR",
    rarity: "EPIC",
    description: "High-spec targeting visor emitting dual crimson lasers.",
    imageUrl: "https://assets.chimphood.io/traits/laser-visor.png",
    maxSupply: 300,
    stock: 40,
    weight: 40,
  },
  {
    slug: "cyber-halo",
    name: "Cyber Halo",
    category: "HEADWEAR",
    rarity: "LEGENDARY",
    description: "Floating golden cybernetic halo radiating pure decentralized energy.",
    imageUrl: "https://assets.chimphood.io/traits/cyber-halo.png",
    maxSupply: 100,
    stock: 10,
    weight: 10,
  },
] as const;

export const DEFAULT_CYCLE_STOCK_TOTAL = DEFAULT_TRAIT_TEMPLATES.reduce(
  (sum, t) => sum + t.stock,
  0,
); // Exactly 250

/**
 * Standard stock & probability distribution budgets summing to 250 units:
 * - Common: 85 (34%)
 * - Uncommon: 65 (26%)
 * - Rare: 50 (20%)
 * - Epic: 40 (16%)
 * - Legendary: 10 (4%)
 */
export const RARITY_STOCK_BUDGETS: Record<string, number> = {
  COMMON: 85,
  UNCOMMON: 65,
  RARE: 50,
  EPIC: 40,
  LEGENDARY: 10,
};

export interface TraitPoolAllocation {
  traitId: string;
  stock: number;
  weight: number;
}

/**
 * Dynamically distributes the 250 cycle stock across all active traits
 * in the catalog according to their rarity tier.
 */
export function calculateDynamicPoolAllocations(traits: Trait[]): TraitPoolAllocation[] {
  if (traits.length === 0) return [];

  const tiers: Record<string, Trait[]> = {
    COMMON: [],
    UNCOMMON: [],
    RARE: [],
    EPIC: [],
    LEGENDARY: [],
  };

  for (const t of traits) {
    if (tiers[t.rarity]) {
      tiers[t.rarity].push(t);
    } else {
      tiers.COMMON.push(t);
    }
  }

  const allocations: TraitPoolAllocation[] = [];

  for (const [rarity, tierTraits] of Object.entries(tiers)) {
    if (tierTraits.length === 0) continue;
    const budget = RARITY_STOCK_BUDGETS[rarity] ?? 50;
    const baseStock = Math.floor(budget / tierTraits.length);
    const remainder = budget % tierTraits.length;

    for (let i = 0; i < tierTraits.length; i++) {
      const trait = tierTraits[i];
      const stock = baseStock + (i < remainder ? 1 : 0);
      allocations.push({
        traitId: trait.id,
        stock: Math.max(1, stock),
        weight: Math.max(1, stock),
      });
    }
  }

  // Ensure total stock sums strictly to 250
  const currentTotal = allocations.reduce((sum, a) => sum + a.stock, 0);
  const diff = 250 - currentTotal;
  if (diff !== 0 && allocations.length > 0) {
    allocations[0].stock += diff;
    allocations[0].weight += diff;
  }

  return allocations;
}

/**
 * Ensures default traits exist ONLY on a fresh, completely empty database.
 * If traits already exist in the database, it preserves them and never resurrects deleted/deactivated traits.
 */
export async function ensureDefaultTraits(prisma: PrismaClient): Promise<Trait[]> {
  // 1. If database already has traits (configured by admin or seeded), respect database state
  if (prisma.trait?.findMany) {
    const existingActive = await prisma.trait.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { rarity: "asc" }, { name: "asc" }],
    });

    if (existingActive.length > 0) {
      return existingActive;
    }

    if (prisma.trait.count) {
      const totalCount = await prisma.trait.count();
      if (totalCount > 0) {
        return existingActive;
      }
    }
  }

  // 3. Only on a completely empty database, seed initial template traits
  const traits: Trait[] = [];
  for (const t of DEFAULT_TRAIT_TEMPLATES) {
    const record = await prisma.trait.upsert({
      where: { slug: t.slug },
      update: {},
      create: {
        slug: t.slug,
        name: t.name,
        category: t.category,
        rarity: t.rarity,
        description: t.description,
        imageUrl: t.imageUrl,
        maxSupply: t.maxSupply,
        isActive: true,
      },
    });
    traits.push(record);
  }
  return traits;
}

/**
 * Ensures an active perpetual Genesis Drop exists if no drop is currently configured or active.
 */
export async function ensurePerpetualGenesisDrop(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<Drop & { periods: Array<DropPeriod & { poolItems: Array<DropPoolItem & { trait: Trait }> }> }> {
  const perpetualEndsAt = new Date("2099-12-31T23:59:59.999Z");
  const startsAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  return (await prisma.drop.upsert({
    where: { slug: "genesis-drop" },
    update: {
      status: "ACTIVE",
      endsAt: perpetualEndsAt,
    },
    create: {
      slug: "genesis-drop",
      title: "ChimpHood Genesis Trait Drop",
      description: "Perpetual drop event allocating exclusive traits across 5 core categories.",
      status: "ACTIVE",
      startsAt,
      endsAt: perpetualEndsAt,
      cycleDurationHours: 2,
    },
    include: {
      periods: {
        orderBy: { periodIndex: "asc" },
        include: {
          poolItems: {
            include: { trait: true },
          },
        },
      },
    },
  })) as any;
}

export type PeriodWithPool = DropPeriod & {
  poolItems: Array<DropPoolItem & { trait: Trait }>;
};

/**
 * Lazily ensures an active DropPeriod exists for the current cycle with
 * the default 250-stock template.
 *
 * Supports both:
 * - 2-hour Standard Mode
 * - 5-hour Hype Control Mode (for supply scarcity strategy)
 *
 * This provides zero-admin maintenance: every cycle (2h or 5h), as soon as a user visits
 * or claims, the cycle is automatically replenished and active.
 */
export async function ensureActiveCyclePeriod(
  prisma: PrismaClient,
  drop: Drop,
  now: Date = new Date(),
): Promise<PeriodWithPool> {
  // If drop endsAt is in the past or within 24h of expiring, but drop.status is ACTIVE,
  // extend drop.endsAt to far future (perpetual mode) so it runs indefinitely without closing
  if (drop.status === "ACTIVE" && drop.endsAt <= now) {
    try {
      drop = await prisma.drop.update({
        where: { id: drop.id },
        data: { endsAt: new Date("2099-12-31T23:59:59.999Z") },
      });
    } catch {
      // Non-blocking fallback
    }
  }

  const cycleDurationHours =
    drop.cycleDurationHours && drop.cycleDurationHours !== 2
      ? drop.cycleDurationHours
      : DEFAULT_CYCLE_DURATION_HOURS;
  const cycle = getUtcCycleForTime(now, cycleDurationHours, drop.startsAt);
  const cycleDurationMs = cycleDurationHours * 60 * 60 * 1000;

  // 1. Close any expired active/configured periods
  await prisma.dropPeriod.updateMany({
    where: {
      dropId: drop.id,
      endsAt: { lt: now },
      status: { in: ["ACTIVE", "CONFIGURED", "PENDING_CONFIG"] },
    },
    data: {
      status: "ENDED",
    },
  });

  // 2. Check if a period already exists for this exact cycle start time
  const existingPeriod = await prisma.dropPeriod.findFirst({
    where: {
      dropId: drop.id,
      startsAt: cycle.startsAt,
    },
    include: {
      poolItems: {
        include: { trait: true },
      },
    },
  });

  if (existingPeriod && existingPeriod.status === "ACTIVE" && existingPeriod.poolItems.length > 0) {
    return existingPeriod as PeriodWithPool;
  }

  // 3. Ensure default traits exist
  const traits = await ensureDefaultTraits(prisma);
  const traitMap = new Map(traits.map((t) => [t.slug, t]));

  // 4. Calculate period index
  let periodIndex = 1;
  if (existingPeriod) {
    periodIndex = existingPeriod.periodIndex;
  } else {
    const latestPeriod = await prisma.dropPeriod.findFirst({
      where: { dropId: drop.id },
      orderBy: { periodIndex: "desc" },
      select: { periodIndex: true },
    });
    const calculatedIndex =
      Math.floor(
        (cycle.startsAt.getTime() - drop.startsAt.getTime()) / cycleDurationMs,
      ) + 1;
    periodIndex = Math.max((latestPeriod?.periodIndex ?? 0) + 1, Math.max(1, calculatedIndex));
  }

  // 5. Upsert period and seed default pool items atomically
  return await prisma.$transaction(async (tx) => {
    let periodRecord: DropPeriod;

    if (existingPeriod) {
      periodRecord = await tx.dropPeriod.update({
        where: { id: existingPeriod.id },
        data: {
          status: "ACTIVE",
          isStockConfigured: true,
          isStockLocked: true,
          startsAt: cycle.startsAt,
          endsAt: cycle.endsAt,
          configLockAt: cycle.configLockAt,
        },
      });
    } else {
      periodRecord = await tx.dropPeriod.upsert({
        where: {
          dropId_periodIndex: {
            dropId: drop.id,
            periodIndex,
          },
        },
        update: {
          status: "ACTIVE",
          isStockConfigured: true,
          isStockLocked: true,
          startsAt: cycle.startsAt,
          endsAt: cycle.endsAt,
          configLockAt: cycle.configLockAt,
        },
        create: {
          dropId: drop.id,
          periodIndex,
          status: "ACTIVE",
          isStockConfigured: true,
          isStockLocked: true,
          startsAt: cycle.startsAt,
          endsAt: cycle.endsAt,
          configLockAt: cycle.configLockAt,
        },
      });
    }

    // Clean up any pool items not in active traits (if unclaimed)
    const activeTraits = tx.trait?.findMany
      ? await tx.trait.findMany({
          where: { isActive: true },
          orderBy: [{ category: "asc" }, { rarity: "asc" }, { name: "asc" }],
        })
      : traits;

    const poolTraits = activeTraits.length > 0 ? activeTraits : traits;
    const allocations = calculateDynamicPoolAllocations(poolTraits);
    const validTraitIds = poolTraits.map((t) => t.id);

    await tx.dropPoolItem.deleteMany({
      where: {
        periodId: periodRecord.id,
        traitId: { notIn: validTraitIds },
        claimedStock: 0,
      },
    });

    // Provision pool items for each active trait
    for (const alloc of allocations) {
      await tx.dropPoolItem.upsert({
        where: {
          periodId_traitId: {
            periodId: periodRecord.id,
            traitId: alloc.traitId,
          },
        },
        update: {
          allocatedStock: alloc.stock,
          weight: alloc.weight,
        },
        create: {
          periodId: periodRecord.id,
          traitId: alloc.traitId,
          allocatedStock: alloc.stock,
          remainingStock: alloc.stock,
          claimedStock: 0,
          weight: alloc.weight,
        },
      });
    }

    const fullPeriod = await tx.dropPeriod.findUniqueOrThrow({
      where: { id: periodRecord.id },
      include: {
        poolItems: {
          include: { trait: true },
        },
      },
    });

    return fullPeriod as PeriodWithPool;
  });
}
