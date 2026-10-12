# Technical Handoff Document: Stage 1

**Date**: October 13, 2026  
**Status**: Stage 1 Complete (Data Model & Database Foundation)  
**Workspace**: `/Users/hermawanprastiyanto/Desktop/ChimpHood Site`

---

## 1. Executive Summary

Stage 1 focuses on establishing the PostgreSQL database foundation using Prisma ORM v7. This foundation encompasses 26 entity models across 6 ChimpHood product subdomains without involving blockchain minting or on-chain contracts. All models enforce product business rules, relational integrity constraints, performance indexes for low-latency queries, and an isolated initial SQL migration script ready for review.

---

## 2. Data Model Architecture & Subdomains

### 2.1 Identity & Authentication

- **`User`**: Central account entity. Holds role (`UserRole`), ban status, and 1:1 relations to wallet and social identities.
- **`WalletIdentity`**: Primary user identity. Wallet address (`address`) is `@unique` and must be normalized (lowercase).
- **`XIdentity`**: X (Twitter) social identity. Snowflake ID (`xId`) is `@unique` with indexed X handle.
- **`SiweNonce`**: Ephemeral nonce for Sign-In with Ethereum (SIWE) flow with expiration timestamp.
- **`AuthSession`**: Authenticated user session with unique token, IP tracking, user-agent, and validity window.

### 2.2 Traits & Inventory

- **`TraitCategory`**: Fixed 5-category enum: `BG`, `FUR`, `CLOTHING`, `HEADWEAR`, `EYEWEAR`.
- **`Trait`**: Master trait catalog (unique slug, name, category, rarity, optional max supply, active status).
- **`InventoryItem`**: Each copy of a trait is an individual item entity.
  - Has a single `ownerId` (exactly 1 active owner).
  - Constraint `@@unique([traitId, edition])` guarantees trait serial edition uniqueness.
  - Includes `isLocked` flag to freeze items during pending gifts and prevent double transfers.

### 2.3 Drops & Claims

- **`Drop`**: Periodic drop event (unique slug, status, UTC time window).
- **`DropPeriod`**: Specific drop window in UTC.
  - `configLockAt`: Stock configuration cutoff time (at least 15 minutes prior to `startsAt`).
  - `isStockLocked` & period status prevent opening periods without verified stock allocation.
  - Constraint `@@unique([dropId, periodIndex])`.
- **`DropPoolItem`**: Stock allocation per trait for the corresponding period.
  - Tracks `allocatedStock`, `claimedStock`, `remainingStock`, and RNG `weight`.
  - Constraint `@@unique([periodId, traitId])`.
- **`Claim`**: Item acquisition transaction.
  - Constraint `@@unique([userId, dropId, periodId])` strictly enforces **one claim per wallet per drop per period**.
  - Associates 1 specific `InventoryItem` with the claim recipient.

### 2.4 Gifts

- **`Gift`**: Item transfer mechanism between users without minting new copies.
  - Links sender (`senderId`), recipient (`receiverId`), and item (`inventoryItemId`).
  - Lifecycle statuses: `PENDING`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `CANCELLED`.
  - Expiration (`expiresAt`) set to 24 hours UTC from creation.
  - Index `@@index([status, expiresAt])` for automated sweeps of expired pending gifts.
  - Cancellation/rejection reason field and decision timestamp (`decidedAt`).

### 2.5 Campaign & Evidence

- **`PromoCampaign`**: Promotional campaign strictly linked to a whitelist program (`wlProgramId`).
- **`CampaignVersion`**: Isolated campaign rule version.
  - Historical progress does not automatically roll over to new versions.
  - Explicit compatibility mode via `CampaignCompatibilityMode` (`FRESH_START`, `EXPLICIT_MAPPED`, `LEGACY_CARRIED`).
  - Self-referential relation `compatibleFromVersionId` for version lineage mapping.
  - Constraint `@@unique([campaignId, versionNumber])`.
- **`CampaignTask`**: Specific campaign task within a version (`taskCode`, `taskType`, requirement JSON metadata).
  - Constraint `@@unique([versionId, taskCode])`.
- **`TaskProgress`**: User task progress record for a specific version.
  - Constraint `@@unique([userId, versionId, taskId])`.
- **`EvidenceSubmission`**: User task completion proof (URL/screenshot/text) with moderator/admin review workflow.

### 2.6 Whitelist (WL) Lifecycle

- **`WLProgram`**: Whitelist program (slot capacity `totalSlots`, allocated slot counter, status).
- **`WLQualification`**: Participant eligibility qualification stage (`status: QUALIFIED / DISQUALIFIED / REVOKED`).
  - Constraint `@@unique([programId, userId])`.
- **`WLQueueEntry`**: Queue stage for qualified participants.
  - High-precision timestamp (`joinedAt`), priority score (`priorityScore`), and stable sequence number (`queueNumber`).
  - Constraints `@@unique([programId, queueNumber])` and `@@unique([programId, userId])`.
  - Composite index `@@index([programId, status, priorityScore, joinedAt, queueNumber])`.
- **`WLSlot`**: Permanent slot allocation stage.
  - Allocated slots are not automatically revoked (`status: ALLOCATED / CONFIRMED / REVOKED_MANUAL_ADMIN`).
  - Constraint `@@unique([programId, slotNumber])` (one slot index per user).
  - Constraint `@@unique([programId, userId])` (one slot per user per program).
- **`WLStatusHistory`**: Comprehensive audit trail of participant WL phase transitions (`NONE` -> `QUALIFIED` -> `IN_QUEUE` -> `SLOT_ALLOCATED`).

### 2.7 Security, Administration & Audit

- **`UserRole`** & **`AdminRole`**: System privilege hierarchy (`USER`, `MODERATOR`, `ADMIN`, `SUPER_ADMIN`) and `AdminRole` model for granular permissions (`permissions: String[]`).
- **`BanRecord`**: Enforcement records with type (`PERMANENT`, `TEMPORARY`, `SHADOWBAN`, `FEATURE_RESTRICTION`), scope (`FULL_SYSTEM`, `CLAIM_RESTRICTED`, `GIFT_RESTRICTED`, `WL_DISQUALIFIED`), reason, evidence, issuer, and expiration.
- **`AbuseFlag`**: Automated or manual flagging for anomalous activities (sybil clusters, botting, duplicate X handles, burst claims) with severity level and investigation status.
- **`AuditLog`**: Immutable audit trail for all administrative actions and sensitive data mutations (`actorId`, `action`, `entityType`, `entityId`, `oldValues`, `newValues`, metadata, IP, user-agent).

---

## 3. Constraint Matrix & Enforcing Mechanism

| Invariant / Business Rule                             | Enforcement Mechanism                                                | Notes / Stage                                                              |
| ----------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Wallet address unique & lowercase                     | Prisma `@unique` + PostgreSQL CHECK regex                            | Normalized in backend prior to storage.                                    |
| X Snowflake ID unique                                 | Prisma `@unique`                                                     | Prevents multi-profile linking of a single X account.                      |
| 1 claim per user per drop per period                  | Prisma `@@unique([userId, dropId, periodId])`                        | Enforced directly at PostgreSQL index level.                               |
| 1 trait copy per edition                              | Prisma `@@unique([traitId, edition])`                                | Trait collection serial number integrity.                                  |
| 1 inventory item has exactly 1 active owner           | Foreign Key `ownerId` -> `User.id`                                   | Exactly one owner relation foreign key per item.                           |
| 1 WL slot per slotNumber & per user                   | Prisma `@@unique([programId, slotNumber])` & `([programId, userId])` | Prevents slot duplicate grabbing.                                          |
| Stable WL queue tie-breaker                           | Prisma `@@unique([programId, queueNumber])`                          | Deterministic, indexed queue ordering.                                     |
| Stock must not be negative (`>= 0`)                   | PostgreSQL `CHECK (allocated_stock >= 0)`                            | Enforced via SQL constraint and server code validation.                    |
| Users holding an active WL slot cannot claim drops    | Server Transaction Check                                             | Checked before `tx.claim.create`: ensure no active `WLSlot` record exists. |
| Stock configuration locked 15 min before period start | Server Transaction Check                                             | Validation `configLockAt <= startsAt - 15m` before period activation.      |
| Pending gifts expire in 24h & re-evaluate eligibility | Cron / Worker + Row Locking (`SELECT FOR UPDATE`)                    | Re-validated upon recipient acceptance within atomic transaction.          |

---

## 4. Prisma 7 Configuration & Database Migration

### 4.1 Prisma 7 Setup

Under Prisma 7 conventions, schema datasource migration and configuration reside in `prisma.config.ts` using the `defineConfig` helper from `@prisma/config`. The `url` property inside `prisma/schema.prisma` is omitted in accordance with Prisma 7 specifications.

### 4.2 SQL Migration Status

- The initial migration script was generated without connecting to a remote database using:
  ```bash
  npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script --output prisma/migrations/20261013000000_init_chimphood_stage1/migration.sql
  ```
- Migration file location: `prisma/migrations/20261013000000_init_chimphood_stage1/migration.sql` (876 lines of PostgreSQL DDL covering CREATE TYPE, CREATE TABLE, CREATE INDEX, and ADD CONSTRAINT).
- **WARNING**: This migration has **NOT YET BEEN APPLIED** to any live database. Production Supabase and remote databases were not connected or altered, per Stage 1 constraints.

### 4.3 Prerequisites & Local Database Application Steps (Upon Approval)

1. Provision local PostgreSQL 15+ (e.g. via Docker):
   ```bash
   docker run --name chimphood-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=chimphood_dev -p 5432:5432 -d postgres:16-alpine
   ```
2. Verify connection string in `.env.local`:
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chimphood_dev?schema=public"
   ```
3. Apply migration:
   ```bash
   npx prisma migrate deploy
   ```
   or run the SQL script via `psql`:
   ```bash
   psql -h localhost -U postgres -d chimphood_dev -f prisma/migrations/20261013000000_init_chimphood_stage1/migration.sql
   ```

---

## 5. Verification Summary & Test Results

All verification processes executed in the local sandbox environment:

| Command                   | Purpose                                      | Result              |
| ------------------------- | -------------------------------------------- | ------------------- |
| `npx prisma validate`     | Validate schema AST integrity and syntax     | ✅ Valid (0 error)  |
| `npm run prisma:generate` | Generate Prisma Client v7.10.0 TypeScript    | ✅ Success (229ms)  |
| `npm run typecheck`       | Strict TypeScript type-checking (`tsc`)      | ✅ Passed (0 error) |
| `npm run lint`            | Next.js ESLint code linting                  | ✅ Passed (0 error) |
| `npm run test`            | Vitest test suite (unit, components, schema) | ✅ Passed (20/20)   |
| `npm run build`           | Next.js production build (`next build`)      | ✅ Success (6/6)    |
| `npm run format:check`    | Prettier formatting validation               | ✅ Passed (0 issue) |

---

## 6. Files Created & Modified

1. `prisma/schema.prisma` (Updated): Defines 26 data models, 22 enums, relations, unique constraints, and performance indexes.
2. `prisma.config.ts` (Created): Prisma 7 configuration for schema path and migration datasource URL.
3. `prisma/migrations/20261013000000_init_chimphood_stage1/migration.sql` (Created): Complete initial SQL migration DDL script for PostgreSQL.
4. `tests/schema.test.ts` (Created): Test suite verifying schema specification compliance, trait categories, client model exports, key relations, and DDL file integrity.
5. `tests/pages.test.tsx` (Updated): Test suite asserting English headings, Whitelist portal, Profile placeholders, and prevention of Indonesian UI copy.
6. `tests/placeholder.test.tsx` (Updated): Test suite verifying English props and defaults for foundation UI components.
7. `docs/pending-decisions.md` (Updated): Registry tracking status DEC-001 through DEC-013 with Stage 1 resolutions and Stage 2 pending items.
8. `docs/handoff.md` (Updated): Comprehensive technical handoff documentation.
9. `README.md` (Updated): Project status, architecture overview, and Prisma 7 run instructions.

---

## 7. Risks & Readiness for Stage 2

### Key Considerations Prior to Stage 2 (Authentication & Identity):

1. **Session Provider Selection (DEC-001)**: Finalize whether to use Auth.js (NextAuth v5) with Prisma Adapter or cookie-encrypted Iron Session prior to writing authentication API routes.
2. **Wallet Connector Selection (DEC-002)**: Align client-side dependency choice (Wagmi v2 vs RainbowKit) ensuring React 19 and Next.js 16 compatibility.
3. **Address Normalization**: The SIWE wallet input pipeline must strictly call `address.toLowerCase()` before querying the database to prevent EVM checksum casing duplicates (e.g., `0xAbC...` vs `0xabc...`).
