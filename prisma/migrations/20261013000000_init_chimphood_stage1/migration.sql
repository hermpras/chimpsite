-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "TraitCategory" AS ENUM ('BG', 'FUR', 'CLOTHING', 'HEADWEAR', 'EYEWEAR');

-- CreateEnum
CREATE TYPE "TraitRarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY');

-- CreateEnum
CREATE TYPE "InventoryAcquisitionType" AS ENUM ('CLAIM', 'GIFT', 'ADMIN_AIRDROP', 'REWARD');

-- CreateEnum
CREATE TYPE "DropStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "DropPeriodStatus" AS ENUM ('PENDING_CONFIG', 'CONFIGURED', 'ACTIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GiftStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CampaignCompatibilityMode" AS ENUM ('FRESH_START', 'EXPLICIT_MAPPED', 'LEGACY_CARRIED');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('SOCIAL_X_FOLLOW', 'SOCIAL_X_REPOST', 'INVENTORY_HOLD', 'MANUAL_EVIDENCE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TaskProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('URL', 'IMAGE_URL', 'TEXT_PROOF', 'OAUTH_VERIFICATION');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WLProgramStatus" AS ENUM ('UPCOMING', 'OPEN', 'PAUSED', 'FINALIZED', 'CLOSED');

-- CreateEnum
CREATE TYPE "WLQualificationStatus" AS ENUM ('QUALIFIED', 'DISQUALIFIED', 'REVOKED');

-- CreateEnum
CREATE TYPE "WLQueueStatus" AS ENUM ('WAITING', 'PROCESSED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WLSlotStatus" AS ENUM ('ALLOCATED', 'CONFIRMED', 'REVOKED_MANUAL_ADMIN');

-- CreateEnum
CREATE TYPE "WLPhase" AS ENUM ('NONE', 'QUALIFIED', 'IN_QUEUE', 'SLOT_ALLOCATED', 'REVOKED');

-- CreateEnum
CREATE TYPE "BanType" AS ENUM ('PERMANENT', 'TEMPORARY', 'SHADOWBAN', 'FEATURE_RESTRICTION');

-- CreateEnum
CREATE TYPE "BanScope" AS ENUM ('FULL_SYSTEM', 'CLAIM_RESTRICTED', 'GIFT_RESTRICTED', 'WL_DISQUALIFIED');

-- CreateEnum
CREATE TYPE "AbuseFlagType" AS ENUM ('SYBIL_WALLET_CLUSTER', 'BOT_ACTIVITY', 'X_ACCOUNT_MISMATCH', 'RAPID_CLAIM_ATTEMPT', 'SUSPICIOUS_GIFT_LOOP', 'OTHER');

-- CreateEnum
CREATE TYPE "AbuseSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AbuseFlagStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'DISMISSED', 'CONFIRMED_ACTION_TAKEN');

-- CreateEnum
CREATE TYPE "AdminRoleType" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'AUDITOR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL DEFAULT 1,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT,
    "profileImageUrl" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiweNonce" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "address" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiweNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trait" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "TraitCategory" NOT NULL,
    "rarity" "TraitRarity" NOT NULL DEFAULT 'COMMON',
    "description" TEXT,
    "imageUrl" TEXT NOT NULL,
    "maxSupply" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trait_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "traitId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "edition" INTEGER NOT NULL,
    "acquiredVia" "InventoryAcquisitionType" NOT NULL DEFAULT 'CLAIM',
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Drop" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "DropStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Drop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DropPeriod" (
    "id" TEXT NOT NULL,
    "dropId" TEXT NOT NULL,
    "periodIndex" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "configLockAt" TIMESTAMP(3) NOT NULL,
    "isStockConfigured" BOOLEAN NOT NULL DEFAULT false,
    "isStockLocked" BOOLEAN NOT NULL DEFAULT false,
    "status" "DropPeriodStatus" NOT NULL DEFAULT 'PENDING_CONFIG',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DropPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DropPoolItem" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "traitId" TEXT NOT NULL,
    "allocatedStock" INTEGER NOT NULL,
    "claimedStock" INTEGER NOT NULL DEFAULT 0,
    "remainingStock" INTEGER NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DropPoolItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dropId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "dropPoolItemId" TEXT,
    "inventoryItemId" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'SUCCESS',
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gift" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "status" "GiftStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCampaign" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "wlProgramId" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignVersion" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "changeNotes" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "compatibilityMode" "CampaignCompatibilityMode" NOT NULL DEFAULT 'FRESH_START',
    "compatibleFromVersionId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignTask" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "taskCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "taskType" "TaskType" NOT NULL DEFAULT 'CUSTOM',
    "requirementMetadata" JSONB,
    "points" INTEGER NOT NULL DEFAULT 10,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" "TaskProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "verifiedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceSubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "taskProgressId" TEXT NOT NULL,
    "submissionType" "EvidenceType" NOT NULL DEFAULT 'URL',
    "payload" TEXT NOT NULL,
    "status" "EvidenceStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewerId" TEXT,
    "reviewerNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WLProgram" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "totalSlots" INTEGER NOT NULL,
    "allocatedSlotsCount" INTEGER NOT NULL DEFAULT 0,
    "status" "WLProgramStatus" NOT NULL DEFAULT 'UPCOMING',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WLProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WLQualification" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "WLQualificationStatus" NOT NULL DEFAULT 'QUALIFIED',
    "qualificationScore" INTEGER NOT NULL DEFAULT 0,
    "qualifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disqualifiedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WLQualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WLQueueEntry" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "queueNumber" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priorityScore" INTEGER NOT NULL DEFAULT 0,
    "status" "WLQueueStatus" NOT NULL DEFAULT 'WAITING',
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WLQueueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WLSlot" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "slotNumber" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "WLSlotStatus" NOT NULL DEFAULT 'ALLOCATED',
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "allocatedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WLSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WLStatusHistory" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromPhase" "WLPhase" NOT NULL DEFAULT 'NONE',
    "toPhase" "WLPhase" NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WLStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleType" "AdminRoleType" NOT NULL DEFAULT 'MODERATOR',
    "permissions" TEXT[],
    "assignedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BanRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "banType" "BanType" NOT NULL DEFAULT 'PERMANENT',
    "scope" "BanScope" NOT NULL DEFAULT 'FULL_SYSTEM',
    "reason" TEXT NOT NULL,
    "evidence" TEXT,
    "issuedById" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revocationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BanRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbuseFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "flagType" "AbuseFlagType" NOT NULL,
    "severity" "AbuseSeverity" NOT NULL DEFAULT 'LOW',
    "details" JSONB,
    "status" "AbuseFlagStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbuseFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorIp" TEXT,
    "userAgent" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldValues" JSONB,
    "newValues" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isBanned_idx" ON "User"("isBanned");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WalletIdentity_userId_key" ON "WalletIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletIdentity_address_key" ON "WalletIdentity"("address");

-- CreateIndex
CREATE INDEX "WalletIdentity_address_idx" ON "WalletIdentity"("address");

-- CreateIndex
CREATE UNIQUE INDEX "XIdentity_userId_key" ON "XIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "XIdentity_xId_key" ON "XIdentity"("xId");

-- CreateIndex
CREATE INDEX "XIdentity_xId_idx" ON "XIdentity"("xId");

-- CreateIndex
CREATE INDEX "XIdentity_username_idx" ON "XIdentity"("username");

-- CreateIndex
CREATE UNIQUE INDEX "SiweNonce_nonce_key" ON "SiweNonce"("nonce");

-- CreateIndex
CREATE INDEX "SiweNonce_nonce_expiresAt_idx" ON "SiweNonce"("nonce", "expiresAt");

-- CreateIndex
CREATE INDEX "SiweNonce_expiresAt_idx" ON "SiweNonce"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_token_key" ON "AuthSession"("token");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "AuthSession_token_idx" ON "AuthSession"("token");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_revokedAt_idx" ON "AuthSession"("expiresAt", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Trait_slug_key" ON "Trait"("slug");

-- CreateIndex
CREATE INDEX "Trait_category_idx" ON "Trait"("category");

-- CreateIndex
CREATE INDEX "Trait_rarity_idx" ON "Trait"("rarity");

-- CreateIndex
CREATE INDEX "Trait_isActive_idx" ON "Trait"("isActive");

-- CreateIndex
CREATE INDEX "InventoryItem_ownerId_idx" ON "InventoryItem"("ownerId");

-- CreateIndex
CREATE INDEX "InventoryItem_traitId_idx" ON "InventoryItem"("traitId");

-- CreateIndex
CREATE INDEX "InventoryItem_ownerId_isLocked_idx" ON "InventoryItem"("ownerId", "isLocked");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_traitId_edition_key" ON "InventoryItem"("traitId", "edition");

-- CreateIndex
CREATE UNIQUE INDEX "Drop_slug_key" ON "Drop"("slug");

-- CreateIndex
CREATE INDEX "Drop_status_startsAt_endsAt_idx" ON "Drop"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "DropPeriod_dropId_startsAt_endsAt_idx" ON "DropPeriod"("dropId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "DropPeriod_status_startsAt_idx" ON "DropPeriod"("status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "DropPeriod_dropId_periodIndex_key" ON "DropPeriod"("dropId", "periodIndex");

-- CreateIndex
CREATE INDEX "DropPoolItem_periodId_idx" ON "DropPoolItem"("periodId");

-- CreateIndex
CREATE INDEX "DropPoolItem_traitId_idx" ON "DropPoolItem"("traitId");

-- CreateIndex
CREATE UNIQUE INDEX "DropPoolItem_periodId_traitId_key" ON "DropPoolItem"("periodId", "traitId");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_inventoryItemId_key" ON "Claim"("inventoryItemId");

-- CreateIndex
CREATE INDEX "Claim_userId_claimedAt_idx" ON "Claim"("userId", "claimedAt");

-- CreateIndex
CREATE INDEX "Claim_dropId_periodId_idx" ON "Claim"("dropId", "periodId");

-- CreateIndex
CREATE INDEX "Claim_claimedAt_idx" ON "Claim"("claimedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_userId_dropId_periodId_key" ON "Claim"("userId", "dropId", "periodId");

-- CreateIndex
CREATE INDEX "Gift_senderId_status_idx" ON "Gift"("senderId", "status");

-- CreateIndex
CREATE INDEX "Gift_receiverId_status_idx" ON "Gift"("receiverId", "status");

-- CreateIndex
CREATE INDEX "Gift_inventoryItemId_idx" ON "Gift"("inventoryItemId");

-- CreateIndex
CREATE INDEX "Gift_status_expiresAt_idx" ON "Gift"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCampaign_slug_key" ON "PromoCampaign"("slug");

-- CreateIndex
CREATE INDEX "PromoCampaign_wlProgramId_idx" ON "PromoCampaign"("wlProgramId");

-- CreateIndex
CREATE INDEX "PromoCampaign_status_idx" ON "PromoCampaign"("status");

-- CreateIndex
CREATE INDEX "CampaignVersion_campaignId_isCurrent_idx" ON "CampaignVersion"("campaignId", "isCurrent");

-- CreateIndex
CREATE INDEX "CampaignVersion_startsAt_endsAt_idx" ON "CampaignVersion"("startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignVersion_campaignId_versionNumber_key" ON "CampaignVersion"("campaignId", "versionNumber");

-- CreateIndex
CREATE INDEX "CampaignTask_versionId_sortOrder_idx" ON "CampaignTask"("versionId", "sortOrder");

-- CreateIndex
CREATE INDEX "CampaignTask_taskType_idx" ON "CampaignTask"("taskType");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignTask_versionId_taskCode_key" ON "CampaignTask"("versionId", "taskCode");

-- CreateIndex
CREATE INDEX "TaskProgress_userId_status_idx" ON "TaskProgress"("userId", "status");

-- CreateIndex
CREATE INDEX "TaskProgress_versionId_status_idx" ON "TaskProgress"("versionId", "status");

-- CreateIndex
CREATE INDEX "TaskProgress_taskId_status_idx" ON "TaskProgress"("taskId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TaskProgress_userId_versionId_taskId_key" ON "TaskProgress"("userId", "versionId", "taskId");

-- CreateIndex
CREATE INDEX "EvidenceSubmission_status_createdAt_idx" ON "EvidenceSubmission"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EvidenceSubmission_userId_taskId_idx" ON "EvidenceSubmission"("userId", "taskId");

-- CreateIndex
CREATE INDEX "EvidenceSubmission_taskProgressId_idx" ON "EvidenceSubmission"("taskProgressId");

-- CreateIndex
CREATE INDEX "EvidenceSubmission_reviewerId_idx" ON "EvidenceSubmission"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "WLProgram_slug_key" ON "WLProgram"("slug");

-- CreateIndex
CREATE INDEX "WLProgram_status_idx" ON "WLProgram"("status");

-- CreateIndex
CREATE INDEX "WLProgram_startsAt_endsAt_idx" ON "WLProgram"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "WLQualification_programId_status_idx" ON "WLQualification"("programId", "status");

-- CreateIndex
CREATE INDEX "WLQualification_userId_idx" ON "WLQualification"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WLQualification_programId_userId_key" ON "WLQualification"("programId", "userId");

-- CreateIndex
CREATE INDEX "WLQueueEntry_programId_status_priorityScore_joinedAt_queueN_idx" ON "WLQueueEntry"("programId", "status", "priorityScore", "joinedAt", "queueNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WLQueueEntry_programId_userId_key" ON "WLQueueEntry"("programId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "WLQueueEntry_programId_queueNumber_key" ON "WLQueueEntry"("programId", "queueNumber");

-- CreateIndex
CREATE INDEX "WLSlot_programId_status_idx" ON "WLSlot"("programId", "status");

-- CreateIndex
CREATE INDEX "WLSlot_userId_idx" ON "WLSlot"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WLSlot_programId_slotNumber_key" ON "WLSlot"("programId", "slotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WLSlot_programId_userId_key" ON "WLSlot"("programId", "userId");

-- CreateIndex
CREATE INDEX "WLStatusHistory_programId_userId_createdAt_idx" ON "WLStatusHistory"("programId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "WLStatusHistory_userId_createdAt_idx" ON "WLStatusHistory"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WLStatusHistory_createdAt_idx" ON "WLStatusHistory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminRole_userId_key" ON "AdminRole"("userId");

-- CreateIndex
CREATE INDEX "AdminRole_roleType_idx" ON "AdminRole"("roleType");

-- CreateIndex
CREATE INDEX "BanRecord_userId_isActive_idx" ON "BanRecord"("userId", "isActive");

-- CreateIndex
CREATE INDEX "BanRecord_banType_isActive_idx" ON "BanRecord"("banType", "isActive");

-- CreateIndex
CREATE INDEX "BanRecord_scope_isActive_idx" ON "BanRecord"("scope", "isActive");

-- CreateIndex
CREATE INDEX "BanRecord_issuedAt_idx" ON "BanRecord"("issuedAt");

-- CreateIndex
CREATE INDEX "AbuseFlag_userId_status_idx" ON "AbuseFlag"("userId", "status");

-- CreateIndex
CREATE INDEX "AbuseFlag_severity_status_idx" ON "AbuseFlag"("severity", "status");

-- CreateIndex
CREATE INDEX "AbuseFlag_flagType_status_idx" ON "AbuseFlag"("flagType", "status");

-- CreateIndex
CREATE INDEX "AbuseFlag_createdAt_idx" ON "AbuseFlag"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "WalletIdentity" ADD CONSTRAINT "WalletIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XIdentity" ADD CONSTRAINT "XIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_traitId_fkey" FOREIGN KEY ("traitId") REFERENCES "Trait"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DropPeriod" ADD CONSTRAINT "DropPeriod_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DropPoolItem" ADD CONSTRAINT "DropPoolItem_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "DropPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DropPoolItem" ADD CONSTRAINT "DropPoolItem_traitId_fkey" FOREIGN KEY ("traitId") REFERENCES "Trait"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "DropPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_dropPoolItemId_fkey" FOREIGN KEY ("dropPoolItemId") REFERENCES "DropPoolItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCampaign" ADD CONSTRAINT "PromoCampaign_wlProgramId_fkey" FOREIGN KEY ("wlProgramId") REFERENCES "WLProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignVersion" ADD CONSTRAINT "CampaignVersion_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "PromoCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignVersion" ADD CONSTRAINT "CampaignVersion_compatibleFromVersionId_fkey" FOREIGN KEY ("compatibleFromVersionId") REFERENCES "CampaignVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTask" ADD CONSTRAINT "CampaignTask_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "CampaignVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProgress" ADD CONSTRAINT "TaskProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProgress" ADD CONSTRAINT "TaskProgress_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "CampaignVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProgress" ADD CONSTRAINT "TaskProgress_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "CampaignTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceSubmission" ADD CONSTRAINT "EvidenceSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceSubmission" ADD CONSTRAINT "EvidenceSubmission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "CampaignTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceSubmission" ADD CONSTRAINT "EvidenceSubmission_taskProgressId_fkey" FOREIGN KEY ("taskProgressId") REFERENCES "TaskProgress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceSubmission" ADD CONSTRAINT "EvidenceSubmission_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WLQualification" ADD CONSTRAINT "WLQualification_programId_fkey" FOREIGN KEY ("programId") REFERENCES "WLProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WLQualification" ADD CONSTRAINT "WLQualification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WLQueueEntry" ADD CONSTRAINT "WLQueueEntry_programId_fkey" FOREIGN KEY ("programId") REFERENCES "WLProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WLQueueEntry" ADD CONSTRAINT "WLQueueEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WLSlot" ADD CONSTRAINT "WLSlot_programId_fkey" FOREIGN KEY ("programId") REFERENCES "WLProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WLSlot" ADD CONSTRAINT "WLSlot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WLStatusHistory" ADD CONSTRAINT "WLStatusHistory_programId_fkey" FOREIGN KEY ("programId") REFERENCES "WLProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WLStatusHistory" ADD CONSTRAINT "WLStatusHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminRole" ADD CONSTRAINT "AdminRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BanRecord" ADD CONSTRAINT "BanRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BanRecord" ADD CONSTRAINT "BanRecord_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbuseFlag" ADD CONSTRAINT "AbuseFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbuseFlag" ADD CONSTRAINT "AbuseFlag_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
