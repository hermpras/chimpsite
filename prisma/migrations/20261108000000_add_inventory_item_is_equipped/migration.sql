-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN "isEquipped" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "InventoryItem_ownerId_isEquipped_idx" ON "InventoryItem"("ownerId", "isEquipped");
