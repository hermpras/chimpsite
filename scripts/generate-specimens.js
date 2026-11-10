const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SPECIMENS = [
  {
    id: "specimen-1",
    name: "Solar Drifter",
    layers: ["sky.png", "gold.png", "varsity-jacket.png", "matrix-shades.png", "snapback.png"]
  },
  {
    id: "specimen-2",
    name: "Stealth Heist",
    layers: ["dusk.png", "cocoa.png", "money-heist-suit.png", "mirror-shield.png", "black-beanie.png"]
  },
  {
    id: "specimen-3",
    name: "Obsidian Rocker",
    layers: ["dusk.png", "skeleton.png", "rockstar-jacket.png", "aviator-gold.png", "fedora.png"]
  },
  {
    id: "specimen-4",
    name: "High Roller",
    layers: ["amber.png", "pearl.png", "joker-suit.png", "bubblegum.png", "small-black-rectangle.png", "buzz-cut.png"]
  },
  {
    id: "specimen-5",
    name: "Vice City",
    layers: ["mint.png", "cocoa.png", "hawaiian-shirt.png"]
  },
  {
    id: "specimen-6",
    name: "Sukajan Ronin",
    layers: ["sand.png", "gold.png", "sukajan.png", "top-hat.png"]
  },
  {
    id: "specimen-7",
    name: "Street Vanguard",
    layers: ["sky.png", "pearl.png", "hoodie.png", "red-visor.png", "ball-cap.png"]
  },
  {
    id: "specimen-8",
    name: "Midnight Syndicate",
    layers: ["abyss.png", "obsidian.png", "tuxedo.png", "cigarette.png", "officer-cap.png"]
  },
  {
    id: "specimen-9",
    name: "Outland Nomad",
    layers: ["ice.png", "ember.png", "explorer-jacket.png", "retro-3d.png", "cowboy-hat.png"]
  },
  {
    id: "specimen-10",
    name: "Crimson Outlaw",
    layers: ["dusk.png", "cocoa.png", "leather-jacket.png", "bandana-red.png", "black-beanie.png"]
  }
];

async function buildAll() {
  const outDir = path.join(process.cwd(), 'public', 'specimens');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const traitsDir = path.join(process.cwd(), 'public', 'traits');

  for (const s of SPECIMENS) {
    const validLayers = [];
    for (const l of s.layers) {
      const filename = path.basename(l);
      const filePath = path.join(traitsDir, filename);
      if (fs.existsSync(filePath)) {
        validLayers.push(filePath);
      } else {
        console.error(`ERROR: Missing layer: ${filePath}`);
        process.exit(1);
      }
    }

    const [base, ...overlays] = validLayers;
    const compositeList = overlays.map(file => ({ input: file }));

    // 1. Composite all layers on the native 240x240 integer grid
    const buffer240 = await sharp(base)
      .composite(compositeList)
      .png()
      .toBuffer();

    // 2. Exact 3x integer nearest-neighbor upscale to 720x720
    // Every 10px art block becomes an exact 30px block with zero edge seams
    const destFile = path.join(outDir, `${s.id}.png`);
    await sharp(buffer240)
      .resize(720, 720, { kernel: 'nearest' })
      .png({ compressionLevel: 9 })
      .toFile(destFile);

    console.log(`✓ Generated ${s.id}.png (${s.name})`);
  }
}

buildAll().catch(err => {
  console.error(err);
  process.exit(1);
});
