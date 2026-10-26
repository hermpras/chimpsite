import type { PrismaClient, Drop, DropPeriod, DropPoolItem, Trait } from "@prisma/client";
import {
  CYCLE_DURATION_MS,
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
 * 250 total stock distributed across 5 categories and 6 traits:
 * - Common BG (Cyber Jungle): 65 stock (26%)
 * - Common HEADWEAR (Neon Beanie): 65 stock (26%)
 * - Uncommon CLOTHING (Stealth Hoodie): 50 stock (20%)
 * - Rare FUR (Golden Fur): 35 stock (14%)
 * - Epic EYEWEAR (Laser Visor): 25 stock (10%)
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
    stock: 65,
    weight: 65,
  },
  {
    slug: "neon-beanie",
    name: "Neon Beanie",
    category: "HEADWEAR",
    rarity: "COMMON",
    description: "Ribbed knit beanie with an integrated pulse indicator.",
    imageUrl: "https://assets.chimphood.io/traits/neon-beanie.png",
    maxSupply: 1000,
    stock: 65,
    weight: 65,
  },
  {
    slug: "stealth-hoodie",
    name: "Stealth Hoodie",
    category: "CLOTHING",
    rarity: "UNCOMMON",
    description: "Matte black tactical hoodie with holographic ChimpHood insignias.",
    imageUrl: "https://assets.chimphood.io/traits/stealth-hoodie.png",
    maxSupply: 800,
    stock: 50,
    weight: 50,
  },
  {
    slug: "golden-fur",
    name: "Golden Fur",
    category: "FUR",
    rarity: "RARE",
    description: "Gleaming golden cyber-primate fur coated with nanites.",
    imageUrl: "https://assets.chimphood.io/traits/golden-fur.png",
    maxSupply: 500,
    stock: 35,
    weight: 35,
  },
  {
    slug: "laser-visor",
    name: "Laser Visor",
    category: "EYEWEAR",
    rarity: "EPIC",
    description: "High-spec targeting visor emitting dual crimson lasers.",
    imageUrl: "https://assets.chimphood.io/traits/laser-visor.png",
    maxSupply: 300,
    stock: 25,
    weight: 25,
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
 * Ensures all default trait records exist in the database.
 */
export async function ensureDefaultTraits(prisma: PrismaClient): Promise<Trait[]> {
  const traits: Trait[] = [];
  for (const t of DEFAULT_TRAIT_TEMPLATES) {
    const record = await prisma.trait.upsert({
      where: { slug: t.slug },
      update: {
        name: t.name,
        category: t.category,
        rarity: t.rarity,
        description: t.description,
        imageUrl: t.imageUrl,
        maxSupply: t.maxSupply,
        isActive: true,
      },
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
  const cycleDurationHours = drop.cycleDurationHours ?? 2;
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

    // Provision pool items for each template trait
    for (const template of DEFAULT_TRAIT_TEMPLATES) {
      const trait = traitMap.get(template.slug);
      if (!trait) continue;

      await tx.dropPoolItem.upsert({
        where: {
          periodId_traitId: {
            periodId: periodRecord.id,
            traitId: trait.id,
          },
        },
        update: {
          // If already created, preserve claimedStock
          allocatedStock: template.stock,
          weight: template.weight,
        },
        create: {
          periodId: periodRecord.id,
          traitId: trait.id,
          allocatedStock: template.stock,
          remainingStock: template.stock,
          claimedStock: 0,
          weight: template.weight,
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
