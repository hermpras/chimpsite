import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "@/server/db";
import { requireAdminSession, AdminAuthError } from "@/server/auth/session";

const VALID_CATEGORIES = ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"] as const;
const VALID_RARITIES = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"] as const;

export async function POST(request: Request): Promise<Response> {
  let session;
  try {
    session = await requireAdminSession(prisma, "MANAGE_DROPS");
  } catch (err: unknown) {
    if (err instanceof AdminAuthError) {
      return err.toResponse();
    }
    return Response.json(
      { error: "UNAUTHORIZED", message: "Admin authorization failed." },
      { status: 401 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const name = (formData.get("name") as string)?.trim();
    const category = (formData.get("category") as string)?.trim().toUpperCase();
    const rarity = (formData.get("rarity") as string)?.trim().toUpperCase() || "COMMON";
    const description = (formData.get("description") as string)?.trim();
    const maxSupplyStr = formData.get("maxSupply") as string | null;

    if (!name) {
      return Response.json(
        { error: "VALIDATION_ERROR", message: "Trait name is required." },
        { status: 400 },
      );
    }

    if (!VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])) {
      return Response.json(
        {
          error: "VALIDATION_ERROR",
          message: `Category must be one of: ${VALID_CATEGORIES.join(", ")}.`,
        },
        { status: 400 },
      );
    }

    if (!VALID_RARITIES.includes(rarity as (typeof VALID_RARITIES)[number])) {
      return Response.json(
        {
          error: "VALIDATION_ERROR",
          message: `Rarity must be one of: ${VALID_RARITIES.join(", ")}.`,
        },
        { status: 400 },
      );
    }

    if (!file) {
      return Response.json(
        { error: "VALIDATION_ERROR", message: "PNG image file is required." },
        { status: 400 },
      );
    }

    // Auto slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Process image with Sharp: enforce PNG and 240x240 pixel art
    const image = sharp(buffer);
    const metadata = await image.metadata();

    let processedBuffer: Buffer;
    if (metadata.width === 24 && metadata.height === 24) {
      // 10x integer upscale with nearest-neighbor to preserve sharp pixel art
      processedBuffer = await image
        .resize(240, 240, { kernel: "nearest", fit: "fill" })
        .png()
        .toBuffer();
    } else {
      // Normalize to 240x240
      processedBuffer = await image
        .resize(240, 240, { kernel: "nearest", fit: "fill" })
        .png()
        .toBuffer();
    }

    // Ensure storage directory exists
    const traitsDir = path.join(process.cwd(), "public/traits");
    await mkdir(traitsDir, { recursive: true });

    const fileName = `${slug}.png`;
    const filePath = path.join(traitsDir, fileName);
    await writeFile(filePath, processedBuffer);

    const imageUrl = `/traits/${fileName}`;
    const maxSupply = maxSupplyStr ? parseInt(maxSupplyStr, 10) : null;

    // Upsert trait in database
    const trait = await prisma.trait.upsert({
      where: { slug },
      create: {
        slug,
        name,
        category: category as (typeof VALID_CATEGORIES)[number],
        rarity: rarity as (typeof VALID_RARITIES)[number],
        description: description || null,
        imageUrl,
        maxSupply: Number.isNaN(maxSupply) ? null : maxSupply,
        isActive: true,
      },
      update: {
        name,
        category: category as (typeof VALID_CATEGORIES)[number],
        rarity: rarity as (typeof VALID_RARITIES)[number],
        description: description || null,
        imageUrl,
        maxSupply: Number.isNaN(maxSupply) ? null : maxSupply,
        isActive: true,
      },
    });

    return Response.json({ success: true, trait });
  } catch (err: unknown) {
    console.error("POST /api/admin/traits/upload error:", err);
    return Response.json(
      {
        error: "UPLOAD_FAILED",
        message: err instanceof Error ? err.message : "Failed to upload trait.",
      },
      { status: 500 },
    );
  }
}
