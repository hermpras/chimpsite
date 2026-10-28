-- AlterTable
ALTER TABLE "DropPoolItem"
  ADD CONSTRAINT "DropPoolItem_remainingStock_non_negative"
  CHECK ("remainingStock" >= 0);

ALTER TABLE "DropPoolItem"
  ADD CONSTRAINT "DropPoolItem_allocatedStock_non_negative"
  CHECK ("allocatedStock" >= 0);

ALTER TABLE "DropPoolItem"
  ADD CONSTRAINT "DropPoolItem_claimedStock_non_negative"
  CHECK ("claimedStock" >= 0);
