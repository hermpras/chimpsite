import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import jitiFactory from "jiti";
const jiti = jitiFactory(process.cwd(), { alias: { "@": process.cwd() } });
const { prisma } = jiti("./server/db.ts");
const { getUtcCycleForTime } = jiti("./server/drops/schedule.ts");

const INITIAL_TRAITS = [
  {
    slug: "cyber-jungle-bg",
    name: "Cyber Jungle",
    category: "BG",
    rarity: "COMMON",
    description: "Lush cybernetic jungle canopy bathed in neon bioluminescence.",
    imageUrl: "https://assets.chimphood.io/traits/cyber-jungle.png",
    maxSupply: 1000,
    defaultStock: 85,
    defaultWeight: 85,
  },
  {
    slug: "stealth-hoodie",
    name: "Stealth Hoodie",
    category: "CLOTHING",
    rarity: "UNCOMMON",
    description: "Matte black tactical hoodie with holographic ChimpHood insignias.",
    imageUrl: "https://assets.chimphood.io/traits/stealth-hoodie.png",
    maxSupply: 800,
    defaultStock: 65,
    defaultWeight: 65,
  },
  {
    slug: "golden-fur",
    name: "Golden Fur",
    category: "FUR",
    rarity: "RARE",
    description: "Gleaming golden cyber-primate fur coated with nanites.",
    imageUrl: "https://assets.chimphood.io/traits/golden-fur.png",
    maxSupply: 500,
    defaultStock: 50,
    defaultWeight: 50,
  },
  {
    slug: "laser-visor",
    name: "Laser Visor",
    category: "EYEWEAR",
    rarity: "EPIC",
    description: "High-spec targeting visor emitting dual crimson lasers.",
    imageUrl: "https://assets.chimphood.io/traits/laser-visor.png",
    maxSupply: 300,
    defaultStock: 40,
    defaultWeight: 40,
  },
  {
    slug: "cyber-halo",
    name: "Cyber Halo",
    category: "HEADWEAR",
    rarity: "LEGENDARY",
    description: "Floating golden cybernetic halo radiating pure decentralized energy.",
    imageUrl: "https://assets.chimphood.io/traits/cyber-halo.png",
    maxSupply: 100,
    defaultStock: 10,
    defaultWeight: 10,
  },
];

async function seed() {
  console.log("Seeding initial traits across all 5 categories...");
  const createdTraits = [];

  for (const traitData of INITIAL_TRAITS) {
    const trait = await prisma.trait.upsert({
      where: { slug: traitData.slug },
      update: {
        name: traitData.name,
        category: traitData.category,
        rarity: traitData.rarity,
        description: traitData.description,
        imageUrl: traitData.imageUrl,
        maxSupply: traitData.maxSupply,
        isActive: true,
      },
      create: {
        slug: traitData.slug,
        name: traitData.name,
        category: traitData.category,
        rarity: traitData.rarity,
        description: traitData.description,
        imageUrl: traitData.imageUrl,
        maxSupply: traitData.maxSupply,
        isActive: true,
      },
    });
    createdTraits.push(trait);
    console.log(`  ✓ Trait [${trait.category}]: ${trait.name} (${trait.id})`);
  }

  const now = new Date();
  const cycle = getUtcCycleForTime(now);

  console.log("\nEnsuring active Genesis Drop event...");
  const dropStartsAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dropEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const drop = await prisma.drop.upsert({
    where: { slug: "genesis-drop" },
    update: {
      status: "ACTIVE",
      startsAt: dropStartsAt,
      endsAt: dropEndsAt,
    },
    create: {
      slug: "genesis-drop",
      title: "ChimpHood Genesis Trait Drop",
      description: "Hourly drop event allocating exclusive traits across 5 core categories.",
      status: "ACTIVE",
      startsAt: dropStartsAt,
      endsAt: dropEndsAt,
    },
  });
  console.log(`  ✓ Drop: ${drop.title} (${drop.id})`);

  console.log("\nConfiguring current active Drop Period aligned with UTC cycle...");
  console.log(`  Cycle Starts: ${cycle.startsAt.toISOString()}`);
  console.log(`  Claim Window Ends: ${cycle.claimWindowEndsAt.toISOString()}`);
  console.log(`  Cycle Ends: ${cycle.endsAt.toISOString()}`);

  const periodIndex = Math.floor(
    (cycle.startsAt.getTime() - new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).getTime()) /
      (2 * 60 * 60 * 1000),
  );

  const period = await prisma.dropPeriod.upsert({
    where: {
      dropId_periodIndex: {
        dropId: drop.id,
        periodIndex,
      },
    },
    update: {
      status: "ACTIVE",
      startsAt: cycle.startsAt,
      endsAt: cycle.endsAt,
      configLockAt: cycle.configLockAt,
      isStockLocked: true,
    },
    create: {
      dropId: drop.id,
      periodIndex,
      status: "ACTIVE",
      startsAt: cycle.startsAt,
      endsAt: cycle.endsAt,
      configLockAt: cycle.configLockAt,
      isStockLocked: true,
    },
  });
  console.log(`  ✓ DropPeriod #${period.periodIndex} (${period.id}) is ACTIVE`);

  console.log("\nCleaning up any legacy pool items in active period...");
  const validTraitIds = createdTraits.map((t) => t.id);
  await prisma.dropPoolItem.deleteMany({
    where: {
      periodId: period.id,
      traitId: { notIn: validTraitIds },
      claimedStock: 0,
    },
  });

  console.log("\nAllocating default 250 units stock across 5 traits in DropPoolItems...");
  for (const trait of createdTraits) {
    const traitDef = INITIAL_TRAITS.find((t) => t.slug === trait.slug);
    const stock = traitDef?.defaultStock ?? 50;
    const weight = traitDef?.defaultWeight ?? 50;

    const poolItem = await prisma.dropPoolItem.upsert({
      where: {
        periodId_traitId: {
          periodId: period.id,
          traitId: trait.id,
        },
      },
      update: {
        allocatedStock: stock,
        remainingStock: stock,
        weight: weight,
      },
      create: {
        periodId: period.id,
        traitId: trait.id,
        allocatedStock: stock,
        claimedStock: 0,
        remainingStock: stock,
        weight: weight,
      },
    });
    console.log(`  ✓ Stock allocated: [${trait.rarity}] ${trait.name} -> ${stock} stock (weight: ${weight})`);
  }

  console.log("\nDrop & Stock Seed complete! Ready for live claiming test.");
}

seed()
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
