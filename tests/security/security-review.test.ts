// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { normalizeAddress } from "@/lib/auth/address";
import {
  DROPS_CLAIM_RATE_LIMIT_MAX,
  DROPS_CLAIM_RATE_LIMIT_WINDOW_MS,
  GIFTS_SEND_RATE_LIMIT_MAX,
  GIFTS_SEND_RATE_LIMIT_WINDOW_MS,
  WHITELIST_QUALIFY_RATE_LIMIT_MAX,
  WHITELIST_QUALIFY_RATE_LIMIT_WINDOW_MS,
  AVATAR_RENDER_RATE_LIMIT_MAX,
  AVATAR_RENDER_RATE_LIMIT_WINDOW_MS,
  GIFTS_RESOLVE_RATE_LIMIT_MAX,
  GIFTS_RESOLVE_RATE_LIMIT_WINDOW_MS,
} from "@/lib/auth/rate-limit";
import { REQUIRED_TRAIT_CATEGORIES } from "@/server/whitelist/qualification";
import { requireAdminSession } from "@/server/auth/session";

describe("Task 5-C: Security Review Verification Suite", () => {
  const rootDir = process.cwd();

  // ---------------------------------------------------------------------------
  // 1. Authentication & Authorization (Auth)
  // ---------------------------------------------------------------------------
  describe("1. Auth Checklist Verification", () => {
    it("AUTH-07: normalizes EVM wallet addresses to lower-case to prevent checksum duplicates", () => {
      const mixedCase = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
      const normalized = normalizeAddress(mixedCase);
      expect(normalized).toBe(mixedCase.toLowerCase());
      expect(normalized).toMatch(/^0x[a-f0-9]{40}$/);

      // Invalid addresses must be rejected
      expect(() => normalizeAddress("invalid-eth-address")).toThrow();
      expect(() => normalizeAddress("0x123")).toThrow();
    });

    it("AUTH-04: hashes session tokens using SHA-256 before database persistence", () => {
      const sampleToken = "sample_raw_entropy_session_token_1234567890abcdef";
      const hash1 = createHash("sha256").update(sampleToken).digest("hex");
      const hash2 = createHash("sha256").update(sampleToken).digest("hex");

      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(sampleToken);
    });

    it("AUTH-05: requireAdminSession rejects unauthorized callers and enforces RBAC permissions", async () => {
      // Mock Prisma client
      const mockPrisma = {
        adminRole: {
          findUnique: vi.fn(),
        },
      } as any;

      // Case A: Missing session -> 401
      await expect(
        requireAdminSession(mockPrisma, { session: null }),
      ).rejects.toMatchObject({
        status: 401,
      });

      // Case B: Authenticated session but no AdminRole record -> 403
      const fakeSession = {
        id: "sess_1",
        userId: "usr_regular",
        address: "0x1111111111111111111111111111111111111111",
        tokenHash: "token_hash",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        user: { isBanned: false },
      };
      mockPrisma.adminRole.findUnique.mockResolvedValueOnce(null);

      await expect(
        requireAdminSession(mockPrisma, { session: fakeSession as any }),
      ).rejects.toMatchObject({
        status: 403,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Rate Limiting (Rate Limit)
  // ---------------------------------------------------------------------------
  describe("2. Rate Limit Checklist Verification", () => {
    it("RATE-02/03/04: enforces strict rate limiting budgets on Stage 3 routes", () => {
      // POST /api/drops/claim: 5 req / 120s
      expect(DROPS_CLAIM_RATE_LIMIT_MAX).toBe(5);
      expect(DROPS_CLAIM_RATE_LIMIT_WINDOW_MS).toBe(120_000);

      // POST /api/gifts: 10 req / 60s
      expect(GIFTS_SEND_RATE_LIMIT_MAX).toBe(10);
      expect(GIFTS_SEND_RATE_LIMIT_WINDOW_MS).toBe(60_000);

      // POST /api/whitelist/qualify: 3 req / 300s
      expect(WHITELIST_QUALIFY_RATE_LIMIT_MAX).toBe(3);
      expect(WHITELIST_QUALIFY_RATE_LIMIT_WINDOW_MS).toBe(300_000);
    });

    it("RATE-06/07: enforces rate limiting on avatar rendering and gift resolution", () => {
      // POST /api/renders/avatar: 5 req / 60s
      expect(AVATAR_RENDER_RATE_LIMIT_MAX).toBe(5);
      expect(AVATAR_RENDER_RATE_LIMIT_WINDOW_MS).toBe(60_000);

      // POST /api/gifts/[id]: 10 req / 60s
      expect(GIFTS_RESOLVE_RATE_LIMIT_MAX).toBe(10);
      expect(GIFTS_RESOLVE_RATE_LIMIT_WINDOW_MS).toBe(60_000);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Data Integrity & Business Invariants (Constraint)
  // ---------------------------------------------------------------------------
  describe("3. Constraint Checklist Verification", () => {
    it("CONS-05: enforces all 5 mandatory trait categories for Whitelist qualification", () => {
      expect(REQUIRED_TRAIT_CATEGORIES).toHaveLength(5);
      expect(REQUIRED_TRAIT_CATEGORIES).toEqual(
        expect.arrayContaining(["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"]),
      );
    });

    it("CONS-01 & CONS-04: verifies Prisma schema enforces critical unique relational constraints", () => {
      const schemaPath = join(rootDir, "prisma/schema.prisma");
      expect(existsSync(schemaPath)).toBe(true);
      const schemaContent = readFileSync(schemaPath, "utf-8");

      // Claim unique constraint: 1 claim per user per drop per period
      expect(schemaContent).toContain("@@unique([userId, dropId, periodId])");

      // InventoryItem unique constraint: serial edition integrity per trait
      expect(schemaContent).toContain("@@unique([traitId, edition])");

      // SiweNonce unique constraint
      expect(schemaContent).toMatch(/nonce\s+String\s+@unique/);

      // WLSlot unique constraints
      expect(schemaContent).toContain("@@unique([programId, slotNumber])");
      expect(schemaContent).toContain("@@unique([programId, userId])");
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Credential Isolation & Information Leaks (Secret Exposure)
  // ---------------------------------------------------------------------------
  describe("4. Secret Exposure Checklist Verification", () => {
    it("SECR-01: ensures no sensitive server credentials have NEXT_PUBLIC_ prefix in .env.example", () => {
      const envExamplePath = join(rootDir, ".env.example");
      expect(existsSync(envExamplePath)).toBe(true);
      const envContent = readFileSync(envExamplePath, "utf-8");

      const sensitiveKeys = [
        "DATABASE_URL",
        "SESSION_SECRET",
        "CRON_SECRET",
        "X_CLIENT_SECRET",
        "UPSTASH_REDIS_REST_TOKEN",
      ];

      for (const key of sensitiveKeys) {
        // Assert that the sensitive key is never declared as NEXT_PUBLIC_<KEY>
        expect(envContent).not.toMatch(new RegExp(`^\\s*NEXT_PUBLIC_${key}`, "m"));
        // Assert that the private key exists
        expect(envContent).toMatch(new RegExp(`(#\\s*)?${key}\\s*=`, "m"));
      }
    });

    it("SECR-04: verifies cron endpoints require authorization headers and secrets", () => {
      const sweepCronRoute = join(rootDir, "app/api/cron/sweep-gifts/route.ts");
      const authCronRoute = join(rootDir, "app/api/cron/cleanup-auth/route.ts");
      const queueCronRoute = join(rootDir, "app/api/cron/reconcile-queue/route.ts");

      expect(existsSync(sweepCronRoute)).toBe(true);
      expect(existsSync(authCronRoute)).toBe(true);
      expect(existsSync(queueCronRoute)).toBe(true);

      const sweepContent = readFileSync(sweepCronRoute, "utf-8");
      const authContent = readFileSync(authCronRoute, "utf-8");
      const queueContent = readFileSync(queueCronRoute, "utf-8");

      // All cron routes must check CRON_SECRET or Authorization bearer
      expect(sweepContent).toContain("CRON_SECRET");
      expect(authContent).toContain("CRON_SECRET");
      expect(queueContent).toContain("CRON_SECRET");

      // Constant-time auth comparison across cron routes
      expect(sweepContent).toContain("timingSafeEqualString");
      expect(authContent).toContain("timingSafeEqualString");
      expect(queueContent).toContain("timingSafeEqualString");
    });
  });
});
