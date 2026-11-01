-- CreateEnum
CREATE TYPE "WLSlotReviewStatus" AS ENUM ('NOT_REVIEWED', 'UNDER_REVIEW', 'VALID', 'FLAGGED');

-- AlterTable
ALTER TABLE "WLSlot" ADD COLUMN     "reviewNotes" TEXT,
ADD COLUMN     "reviewStatus" "WLSlotReviewStatus" NOT NULL DEFAULT 'NOT_REVIEWED',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedBy" TEXT;

-- CreateIndex
CREATE INDEX "WLSlot_programId_reviewStatus_idx" ON "WLSlot"("programId", "reviewStatus");
