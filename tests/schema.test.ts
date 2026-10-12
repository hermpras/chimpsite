import { describe, it, expect } from "vitest";
import {
  Prisma,
  TraitCategory,
  UserRole,
  DropStatus,
  DropPeriodStatus,
  ClaimStatus,
  GiftStatus,
  CampaignStatus,
  CampaignCompatibilityMode,
  TaskType,
  TaskProgressStatus,
  EvidenceType,
  EvidenceStatus,
  WLProgramStatus,
  WLQualificationStatus,
  WLQueueStatus,
  WLSlotStatus,
  WLPhase,
  BanType,
  BanScope,
  AbuseFlagType,
  AbuseSeverity,
  AbuseFlagStatus,
  AdminRoleType,
} from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

describe("Stage 1 Data Model & Database Foundation", () => {
  describe("Prisma Client Model Names", () => {
    it("defines all 26 required domain models across all 6 subdomains", () => {
      const requiredModels = [
        // Identity & Auth
        "User",
        "WalletIdentity",
        "XIdentity",
        "SiweNonce",
        "AuthSession",
        // Traits & Inventory
        "Trait",
        "InventoryItem",
        // Drops & Claims
        "Drop",
        "DropPeriod",
        "DropPoolItem",
        "Claim",
        // Gifts
        "Gift",
        // Campaign & Evidence
        "PromoCampaign",
        "CampaignVersion",
        "CampaignTask",
        "TaskProgress",
        "EvidenceSubmission",
        // Whitelist
        "WLProgram",
        "WLQualification",
        "WLQueueEntry",
        "WLSlot",
        "WLStatusHistory",
        // Security & Administration
        "AdminRole",
        "BanRecord",
        "AbuseFlag",
        "AuditLog",
      ];

      for (const model of requiredModels) {
        expect(Prisma.ModelName).toHaveProperty(model);
      }
    });
  });

  describe("Trait Categories Specification", () => {
    it("enforces exactly 5 trait categories: BG, FUR, CLOTHING, HEADWEAR, EYEWEAR", () => {
      const categories = Object.values(TraitCategory);
      expect(categories).toEqual(
        expect.arrayContaining(["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"]),
      );
      expect(categories).toHaveLength(5);
    });
  });

  describe("Lifecycle & Domain Enums", () => {
    it("exports distinct WL lifecycle phases and statuses", () => {
      expect(WLSlotStatus.ALLOCATED).toBe("ALLOCATED");
      expect(WLSlotStatus.CONFIRMED).toBe("CONFIRMED");
      expect(WLSlotStatus.REVOKED_MANUAL_ADMIN).toBe("REVOKED_MANUAL_ADMIN");

      expect(WLQueueStatus.WAITING).toBe("WAITING");
      expect(WLQueueStatus.PROCESSED).toBe("PROCESSED");

      expect(WLQualificationStatus.QUALIFIED).toBe("QUALIFIED");
      expect(WLQualificationStatus.DISQUALIFIED).toBe("DISQUALIFIED");

      expect(WLPhase.QUALIFIED).toBe("QUALIFIED");
      expect(WLPhase.IN_QUEUE).toBe("IN_QUEUE");
      expect(WLPhase.SLOT_ALLOCATED).toBe("SLOT_ALLOCATED");
    });

    it("exports gift status transitions and campaign compatibility modes", () => {
      expect(GiftStatus.PENDING).toBe("PENDING");
      expect(GiftStatus.ACCEPTED).toBe("ACCEPTED");
      expect(GiftStatus.REJECTED).toBe("REJECTED");
      expect(GiftStatus.EXPIRED).toBe("EXPIRED");
      expect(GiftStatus.CANCELLED).toBe("CANCELLED");

      expect(CampaignCompatibilityMode.FRESH_START).toBe("FRESH_START");
      expect(CampaignCompatibilityMode.EXPLICIT_MAPPED).toBe("EXPLICIT_MAPPED");
      expect(CampaignCompatibilityMode.LEGACY_CARRIED).toBe("LEGACY_CARRIED");
    });
  });

  describe("Schema Declarative Constraints & Invariants", () => {
    const schemaContent = fs.readFileSync(
      path.resolve(__dirname, "../prisma/schema.prisma"),
      "utf-8",
    );

    it("verifies wallet identity has unique address", () => {
      expect(schemaContent).toContain("model WalletIdentity");
      expect(schemaContent).toMatch(/address\s+String\s+@unique/);
    });

    it("verifies X identity has unique xId", () => {
      expect(schemaContent).toContain("model XIdentity");
      expect(schemaContent).toMatch(/xId\s+String\s+@unique/);
    });

    it("verifies Claim enforces strictly one claim per user per drop per period", () => {
      expect(schemaContent).toContain("@@unique([userId, dropId, periodId])");
    });

    it("verifies InventoryItem enforces edition uniqueness per trait", () => {
      expect(schemaContent).toContain("@@unique([traitId, edition])");
    });

    it("verifies WLSlot enforces one slot per user and slotNumber uniqueness per program", () => {
      expect(schemaContent).toContain("@@unique([programId, slotNumber])");
      expect(schemaContent).toContain("@@unique([programId, userId])");
    });

    it("verifies WLQueueEntry enforces unique queueNumber tie-breaker per program", () => {
      expect(schemaContent).toContain("@@unique([programId, queueNumber])");
      expect(schemaContent).toContain("@@unique([programId, userId])");
    });

    it("verifies PromoCampaign enforces mandatory relationship with WLProgram", () => {
      expect(schemaContent).toContain("wlProgramId String");
      expect(schemaContent).toContain("wlProgram   WLProgram");
    });
  });

  describe("Migration SQL Artifact", () => {
    const migrationPath = path.resolve(
      __dirname,
      "../prisma/migrations/20261013000000_init_chimphood_stage1/migration.sql",
    );

    it("verifies migration SQL file exists and contains valid DDL definitions", () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
      const sqlContent = fs.readFileSync(migrationPath, "utf-8");

      expect(sqlContent).toContain('CREATE TYPE "TraitCategory"');
      expect(sqlContent).toContain('CREATE TABLE "User"');
      expect(sqlContent).toContain('CREATE TABLE "WalletIdentity"');
      expect(sqlContent).toContain('CREATE TABLE "InventoryItem"');
      expect(sqlContent).toContain('CREATE TABLE "Claim"');
      expect(sqlContent).toContain('CREATE TABLE "Gift"');
      expect(sqlContent).toContain('CREATE TABLE "PromoCampaign"');
      expect(sqlContent).toContain('CREATE TABLE "WLSlot"');
      expect(sqlContent).toContain('CREATE TABLE "WLQueueEntry"');
      expect(sqlContent).toContain('CREATE TABLE "AuditLog"');
      expect(sqlContent).toContain(
        'CREATE UNIQUE INDEX "Claim_userId_dropId_periodId_key"',
      );
      expect(sqlContent).toContain('CREATE UNIQUE INDEX "WLSlot_programId_userId_key"');
    });
  });
});
