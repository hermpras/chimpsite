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
  - Index `@@index([status, expiresAt])` for querying and opportunistic expiration sweeps of pending gifts without scheduled cron.
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
- **`AuditLog`**: Immutable audit trail for all administrative actions and sensitive data mutations (`actorId`, `action`, `entityType`, `entityId`, `oldValues`, `newValues`, metadata, IP, user-agent). Read-only viewing via `GET /api/admin/audit-logs` strictly restricted to `SUPER_ADMIN`.

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
| Pending gifts expire in 24h & re-evaluate eligibility | Event-Driven Lazy Evaluation + Atomic Row Locking | Evaluated on-demand upon recipient acceptance (rejecting with 410 `GIFT_EXPIRED`) and opportunistic sweep on `GET /api/gifts` without cron. |

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

---

## 8. Stage 2 Progress — SIWE Authentication (In Progress)

**Date**: October 15, 2026
**Branch**: `feat/siwe-auth` — verified via `.git/HEAD`. `.git/logs/HEAD` shows 2 commits on `main` ("feat(init): project foundation & documentation (Phase 0)", "fix(i18n): make public website English-first") followed by a checkout to `feat/siwe-auth` with no subsequent commits: all Stage 2 changes below are uncommitted.

### Implemented (verified by file inspection)

- `POST /api/auth/nonce` (`app/api/auth/nonce/route.ts`): issues a one-time SIWE nonce via `generateNonce()`, persists `SiweNonce { nonce, expiresAt }` with the existing 10-minute TTL, returns `{ nonce, expiresAt }` only. Other HTTP methods → 405 with `Allow: POST`. DB failures → generic 500 (details server-logged only). Per-IP fixed-window rate limit: 10 req/60s with `Retry-After` on 429.
- `server/auth/nonce.ts`: `issueNonce(prisma)` — Prisma client passed as a parameter so the logic unit-tests without a database.
- `lib/auth/rate-limit.ts`: dependency-free in-memory limiter, documented as single-instance only (multi-instance production needs a shared store such as Redis/Upstash).
- `docs/pending-decisions.md`: DEC-001 recorded `RESOLVED (Oct 15, 2026)` → Iron Session (encrypted cookie) + server-side session records, with code evidence cited (`lib/auth/session.ts`, `iron-session@8.0.4` installed, no Auth.js).
- `.prettierignore`: added `*.prisma`, `*.tsbuildinfo`, `prisma/migrations/**`. Without these entries `prettier --check .` aborts with "No parser could be inferred" on `prisma/schema.prisma`, `prisma/migrations/*/migration.sql`, and `tsconfig.tsbuildinfo` — `format:check` could never pass.
- 13 new tests: `tests/auth/rate-limit.test.ts` (4), `tests/auth/nonce-service.test.ts` (3), `tests/auth/nonce-route.test.ts` (6).

### Not implemented / not done

- `POST /api/auth/verify` does **not** exist — `app/api/` contains only `auth/nonce/route.ts`.
- Session creation/validation, wallet/user creation, wallet UI, and X OAuth exist only as helpers (`lib/auth/*`) or schema models; no endpoint consumes them.
- No database was connected, no migration was applied, no `.env` files were inspected.
- The 13 new tests were written but **not executed** by the implementing agent (no shell access to the Mac).

### Operator-reported check results (not independently verified)

- Reported Oct 15, 2026: 33 tests passing (20 existing + 13 new — arithmetic consistent), typecheck/lint/build successful, Prettier failing on five files.
- `lib/auth/siwe.ts` was reformatted at 16:38 UTC Oct 15 (two statements collapsed to single lines; logic identical on inspection) — consistent with a `prettier --write` pass having already addressed formatting failures.
- As of this review, every parseable project file (44 files mirrored as exact copies) passes `prettier --check` with the project's own prettier 3.9.10 and `.prettierrc` (verified off-Mac, since the Mac exposes no shell to the agent). The five reported failures could not be reproduced — they appear already fixed.

### Verify endpoint implemented (Oct 15, 2026 — same session)

- `POST /api/auth/verify` (`app/api/auth/verify/route.ts`): accepts `{ message, signature }`; returns 200 `{ address, userId }` and sets the `chimphood_session` HttpOnly cookie. 400 malformed body, 401 auth failures (generic message only), 403 banned, 429 rate limited (10/min/IP), 500 server/misconfiguration. Other methods → 405 with `Allow: POST`.
- `server/auth/verify.ts` — `verifySiweLogin(prisma, input, opts)`: (1) light-parse message for nonce+address; (2) **atomic nonce consumption** via conditional `siweNonce.updateMany` (`nonce` + `consumedAt: null` + `expiresAt > now` + address binding `OR: [{ address: null }, { address }]`), requiring exactly 1 updated row — unknown/expired/replayed/address-mismatched nonces yield count 0 → 401, and a failed signature burns the nonce by design (no replay window); (3) full `verifySiweMessage` (signature, domain, URI, nonce equality, message expiry, chain allowlist) with failures mapped to generic 401; (4) race-safe wallet find-or-create (P2002 → re-read once); (5) banned users → 403; (6) session creation — only the SHA-256 token hash is persisted.
- **Nonce↔address binding**: schema `SiweNonce.address` (optional) is now honored. `POST /api/auth/nonce` accepts optional `{ address }` (validated via `normalizeAddress` → 400 on invalid; unparseable/missing body → unbound nonce, backward compatible) and `issueNonce(prisma, { address })` persists it. Verify accepts a bound nonce only for its address.
- `lib/auth/siwe.ts`: extended with optional `allowedChainIds` → `SIWE_CHAIN_NOT_ALLOWED` rejection (backward compatible).
- `server/auth/config.ts` — `getSiweConfig()`: `SIWE_DOMAIN`/`SIWE_URI` required (fail closed when unset — never derived from headers), `ALLOWED_CHAIN_IDS` optional, default `[1]` per DEC-006.
- `server/auth/session.ts` — `createSession` (hash-only persistence), `validateSessionToken` (unknown/expired/revoked/banned → null), `authenticateRequest` (cookie → DB, cookie userId must match DB session userId), `revokeSessionToken`, `revokeUserSessions`, `sealSessionCookie`, `destroySessionCookie`.
- `.env.example`: documented `SIWE_DOMAIN`, `SIWE_URI`, `ALLOWED_CHAIN_IDS`, `SESSION_SECRET` (commented placeholders; no secrets added).
- New/changed tests: `tests/auth/verify-service.test.ts` (13 — real ethers signing against a fake store: success, invalid signature, wrong domain/URI, expired + replayed nonces, disallowed/allowed chain IDs, binding mismatch/match, banned user, malformed input, P2002 race retry), `tests/auth/session.test.ts` (12 — hash-only storage, validation cases, revocation, authenticateRequest with mocked next/headers), `tests/auth/verify-route.test.ts` (6 — 405s), plus nonce address-binding and route-validation tests.
- Design decisions recorded (no new DEC entries created — operator may formalize): consume-before-verify ordering; env-configured (not header-derived) domain/URI; chain allowlist default `[1]`; ban check at login and at session validation.

### VM verification results (Oct 16, 2026 — agent-run, off-Mac)

All checks ran on the agent's VM against byte-identical copies of the Mac tree, installed with the project's own `package-lock.json` (`npm ci`), Prisma client generated from `prisma/schema.prisma`:

- `npx tsc --noEmit` — PASS
- `npx vitest run` — **70/70 PASS** (9 files; includes 13 verify-service tests with real ethers signing)
- `npx eslint .` — PASS
- `npx prettier --check .` — PASS
- `npx next build --webpack` — PASS (`/api/auth/nonce` and `/api/auth/verify` both present as dynamic routes)

Bugs found and fixed during this verification (all fixes are in the tree):

1. **Critical — nonce format incompatible with SIWE.** `generateNonce()` emitted base64url, but EIP-4361 requires the nonce to be alphanumeric and the `siwe` ABNF parser rejects `-`/`_` (`invalid message: max line number was 9`). Any issued nonce containing those characters would have made real logins fail at message parse. Fixed: `lib/auth/nonce.ts` now emits 43 alphanumeric chars (62^43 > 2^256, unbiased via rejection sampling); the nonce-service test regex was updated to `/^[A-Za-z0-9]{43}$/`.
2. `Wallet.createRandom()` throws under the jsdom test env (ethers v6 cross-realm Buffer shape rejected by its own `getBytes`). Fixed: `tests/auth/verify-service.test.ts` now runs with `// @vitest-environment node`.
3. `getIronSession()` is async in iron-session v8 — three call sites in `server/auth/session.ts` were missing `await` (would have called session methods on a Promise at runtime). Fixed.
4. `Wallet.createRandom()` returns `HDNodeWallet`, not `Wallet` (private-field mismatch) — the test's `signLogin` helper now takes a structural `TestSigner` interface. Fixed.
5. `vi.fn()` with a parameterless implementation types `mock.calls` as `[]` — three fakes in `tests/auth/session.test.ts` now declare explicit typed parameters. Fixed.

Note: `npm install` (without lockfile) fails in this VM with `Cannot read properties of null (reading 'edgesOut')`; `npm ci` with the project's lockfile works. Prisma engine downloads via the VM's egress proxy fail (ECONNRESET); the schema-engine binary was fetched with curl and wired via `PRISMA_SCHEMA_ENGINE_BINARY` purely for the verification environment — no project change.

### Auth table cleanup strategy (documented Oct 16, 2026 — NOT yet scheduled)

`SiweNonce` and `AuthSession` rows are never deleted by the application code.
This is safe to clean because:

- Consumed nonces (`consumedAt IS NOT NULL`) can never match the consume query again (it requires `consumedAt: null`).
- Expired nonces (`expiresAt <= now()`) can never match either (`expiresAt > now()` required).
- Expired sessions (`expiresAt <= now()`) always fail `validateSessionToken`.

Recommended statements for the future scheduled job (e.g. daily cron or
`pg_cron` — **no job has been created yet**):

```sql
DELETE FROM "SiweNonce"
WHERE "consumedAt" IS NOT NULL
   OR "expiresAt" < now() - interval '1 hour';

DELETE FROM "AuthSession"
WHERE "expiresAt" < now() - interval '1 day';
```

Notes:

- The 1-hour / 1-day grace periods are conservative and purely for forensics;
  nothing reads these rows after expiry.
- Do NOT delete unconsumed, unexpired nonces — those are live login attempts.
- Both deletes are index-friendly (`expiresAt` indexes exist on both tables).
- Run during off-peak hours once login volume grows.

### Audit follow-ups addressed (Oct 16, 2026)

Six findings from the read-only security audit were implemented on
`feat/siwe-auth` (no unrelated changes, no migrations, no secrets touched):

1. `POST /api/auth/verify` now validates session configuration
   (`getSessionOptions()`, i.e. `SESSION_SECRET`) _before_ consuming the nonce
   or creating any database records — misconfiguration returns 500 without
   side effects.
2. New `lib/auth/body-limit.ts` (`readLimitedBody`, 8 KB cap): both auth
   routes reject oversized bodies with 413 and unreadable bodies with 400
   before parsing.
3. `lib/auth/siwe.ts` now validates SIWE `issuedAt` against a freshness
   window (rejects timestamps older than 15 min or more than 5 min in the
   future).
4. `tests/auth/verify-route.test.ts` now covers route-level POST: success +
   cookie sealing, generic error mapping per status, unexpected-error 500,
   session-config failure ordering, SIWE-config failure, 413, malformed
   JSON, and missing fields. New `tests/auth/body-limit.test.ts` covers the
   size-limit helper.
5. Cleanup strategy documented above; no scheduled job created.
6. `lib/auth/rate-limit.ts` header now states the production requirement
   explicitly: shared/distributed rate limiting is REQUIRED for
   multi-instance/serverless deployments; in-memory limiter is for local
   dev / single-instance only.

### Client SIWE flow (Oct 16, 2026)

End-to-end wallet login is implemented on `feat/siwe-auth`:

- `lib/wagmi.ts`: wagmi v3 config (mainnet, `injected`/`metaMask`/
  `coinbaseWallet` connectors, `ssr: true`). DEC-002 resolved: wagmi
  built-in connectors + minimal custom UI, no RainbowKit/AppKit.
- `components/providers.tsx`: `WagmiProvider` + `QueryClientProvider`,
  mounted in `app/layout.tsx`.
- `lib/auth/client.ts`: browser helpers — `fetchAuthConfig`,
  `requestNonce` (address-bound), `buildSiweMessage` (domain/URI from
  `window.location`, 10-min expiry mirroring the nonce TTL), `verifySiwe`,
  `fetchSessionStatus`, `logoutRequest`, plus user-facing error mappers.
- `hooks/useSiweAuth.ts`: state machine (`checking` → `signed-out` /
  `wallet-only` → `signing` → `authenticated`). Login = connect → chain
  check against `GET /api/auth/config` (auto-switch prompt) → nonce →
  wallet signature → `POST /api/auth/verify` → server session cookie.
  The server session is the source of truth; wallet connection alone never
  implies authentication.
- New routes: `GET /api/auth/config` (public chain allowlist),
  `GET /api/auth/session` (session status), `POST /api/auth/logout`
  (revoke + destroy cookie, always 200).
- UI: `components/auth/WalletButton.tsx` (navbar, desktop + mobile),
  `components/auth/WalletConnectCard.tsx` (profile page). Stage 1 wallet
  placeholders removed; X OAuth / tier / inventory placeholders untouched.
- Tests: `config-route`, `session-route`, `logout-route`, `client`
  (message construction parsed back with the real siwe parser, fetch
  mapping, error mappers).

Error handling: signature cancellation (4001), missing wallet, wrong
network (switch prompt, then friendly error), expired/invalid nonce or
signature (generic retry message), 429 rate limit, 403 suspended account,
network failures — all mapped to user-facing messages, never raw errors.

NOT yet verified end-to-end: no wallet was available in the verification
environment, so the real browser signing flow (MetaMask popup → signature →
cookie) has not been exercised. Unit/integration coverage is green; the
first real-wallet login is still the proof.

Verification results (Oct 16, 2026, agent VM, byte-identical copies):
`prisma generate` PASS (v7.10.0; used the bundled engine binary via
`PRISMA_SCHEMA_ENGINE_BINARY` — engine download through the VM proxy fails
with ECONNRESET), `tsc` PASS, `eslint` PASS, `prettier` PASS, `vitest`
110/110 PASS (14 files), `next build` PASS (all five auth routes dynamic:
`/api/auth/config`, `/api/auth/logout`, `/api/auth/nonce`,
`/api/auth/session`, `/api/auth/verify`). Smoke test via `next start` +
curl: `/profile` 200 renders the new wallet UI (Stage 1 wallet placeholders
gone, X OAuth notice updated); `GET /api/auth/config` →
`{"allowedChainIds":[1]}`; `GET /api/auth/session` → 500 +
`{"authenticated":false}` when the DB is unreachable (safe failure mode).
The remote verification browser could not reach the VM's localhost, so no
screenshot was captured — HTML inspection confirmed the UI changes.

Test quirk found during verification: calling `mockClear()`/`mockReset()`
in `beforeEach` followed by `mockRejectedValue()` makes vitest 4.1.11 report
a false "unhandled error" failure even when the mock is never invoked and
Node reports no unhandled rejection; the route was proven correct
(500 + expected body). `tests/auth/session-route.test.ts` therefore sets
its mock implementation per-test without a reset.

### Diagnosing a 401 from POST /api/auth/verify

The endpoint always returns a generic 401 to the browser, but the server
log (`next dev` terminal) prints the machine-readable failure category:
`POST /api/auth/verify rejected: AUTH_FAILED:<reason>`. Reason codes only —
no signature, cookie, or secret is ever logged. Map the reason to the fix:

- `SIWE_DOMAIN_MISMATCH` — `SIWE_DOMAIN` in `.env.local` does not exactly
  equal the browser's `window.location.host`. For local dev this must be
  `localhost:3000` (host **plus port**). Also fails if you open the app via
  `127.0.0.1:3000` while the env says `localhost:3000` (or vice versa).
  Fix the env value, then **restart `next dev`** (env changes need a restart).
- `SIWE_URI_MISMATCH` — `SIWE_URI` must exactly equal
  `window.location.origin`, e.g. `http://localhost:3000` (no trailing slash).
- `SIWE_CHAIN_NOT_ALLOWED` — the wallet is on a chain outside
  `ALLOWED_CHAIN_IDS`. The client prompts a network switch first; if the
  switch was dismissed, sign-in fails here.
- `SIWE_MESSAGE_EXPIRED` / `SIWE_ISSUED_AT_INVALID` — clock skew between
  the browser and the server, or a message older than 15 minutes.
- `SIWE_VERIFICATION_FAILED` — the signature does not match the message
  (wrong key signed, or the message was altered after signing).
- `NONCE_INVALID` (logged without prefix) — unknown, expired, replayed, or
  address-mismatched nonce. Note the nonce is consumed _before_ signature
  verification, so a failed attempt burns the nonce; the client simply
  requests a new one on retry.

### Stage 2 finalization (Oct 16, 2026)

The temporary `[SIWE-DIAG]` diagnostic logging was removed from
`lib/auth/siwe.ts` after the local 401 was root-caused (stale
`SIWE_DOMAIN=localhost` in the running dev-server process; fixed by
`SIWE_DOMAIN=localhost:3000` + restart). The permanent, non-sensitive
failure categorization (`SiweVerifyError.reason` → server log
`AUTH_FAILED:<reason>`, generic 401 to the client) is kept. Final VM
verification on byte-identical copies: `prisma generate` PASS, `tsc` PASS,
`eslint` PASS, `prettier` PASS, `vitest` 113/113 PASS (15 files),
`next build` PASS (all five auth routes dynamic). The real browser flow
(connect → MetaMask sign → verify → session → refresh persistence →
logout revocation) was confirmed working locally by the operator.

---

## 9. Stage 3 Progress — Whitelist Lifecycle & Drops/Claims Engines (Oct 16, 2026)

### Implemented Architecture & Services:

1. **Drops & Claims Engine (`server/drops/`)**:
   - `schedule.ts`: Shared 2-hour UTC cycles (`[00:00-02:00, 02:00-04:00, ...]`) with 30-minute claim windows. 15-minute stock freeze window (`configLockAt <= startsAt - 15m`).
   - `claim.ts`: Atomic claim execution in PostgreSQL transaction. Strict invariant enforcement:
     - 1 claim per user per drop per period (`@@unique([userId, dropId, periodId])`).
     - Allocated/confirmed WL slot holders are strictly prohibited from claiming drops.
     - Atomic stock decrement (`remainingStock > 0` condition) prevents race-condition over-allocation.
     - Transparent pool item probability calculation.
     - Rejection of claims outside 30-minute window or when periods are emergency-cancelled.
     - Sequential trait edition minting.
   - API: `GET /api/drops/current` and `POST /api/drops/claim`.

2. **Gifting Engine (`server/inventory/gift.ts`)**:
   - Separate inventory workflow:
     - Category retention rule: sender must own >= 2 items in the trait category (`BG`, `FUR`, `CLOTHING`, `HEADWEAR`, `EYEWEAR`), retaining >= 1 item in the category after gifting.
     - Recipient must not already own the exact trait (`RECIPIENT_ALREADY_OWNS_TRAIT`).
     - Daily limit: strictly 1 gift sent per wallet per UTC calendar day.
     - 24-hour expiration (`expiresAt = createdAt + 24h`). Background crons are eliminated due to budget constraints; expiry is strictly enforced event-driven via lazy on-demand evaluation upon `acceptGift()` and opportunistic cleanup on `GET /api/gifts`. Expired gifts unlock sender item and cannot be accepted. Senders can also cancel pending gifts manually anytime.
     - Acceptance transfers item ownership to recipient atomically and unlocks item.
     - Cancellation/rejection unlocks the item for the sender.
   - API: `GET /api/gifts`, `POST /api/gifts`, `POST /api/gifts/[id]` (`ACCEPT`, `REJECT`, `CANCEL`), and `GET /api/gifts/recipient` (X username and EVM address lookup with pre-flight validation and fail-safe JSON error handling).
   - UI: `components/inventory/TraitGrid.tsx`, `components/inventory/GiftModal.tsx`, `components/inventory/GiftSection.tsx`, and `lib/inventory/gift-client.ts`.

3. **Whitelist Lifecycle & Qualification Engine (`server/whitelist/qualification.ts`)**:
   - 5 required trait categories (`BG`, `FUR`, `CLOTHING`, `HEADWEAR`, `EYEWEAR`).
   - Verified EVM wallet and linked X account required.
   - Mandatory campaign tasks verified.
   - First-qualified-first-allocated capacity: creates `WLSlot` when `allocatedSlotsCount < totalSlots`.
   - Queue management when capacity is full: creates `WLQueueEntry` ordered by `joinedAt` (timestamp when requirements were first satisfied) with stable tie-breaker `queueNumber`. No arbitrary priority score formula.
   - Re-qualification timestamp update: if user was disqualified/rejected and requalifies, `qualifiedAt` updates to the new qualification timestamp.
   - Queue reconciler: `reconcileQueueSlots` assigns newly available slots to queued users in proper queue order.
   - API: `GET /api/whitelist/status` (supports public address lookup and authenticated session) and `POST /api/whitelist/qualify`.

4. **Social & Auditing (`server/social/x.ts` & `server/audit/audit.ts`)**:
   - Fail-closed X OAuth 2.0 PKCE initiation and token exchange. Never fakes verification without real provider callback. Returns 503 if unconfigured.
   - Immutable audit logging helper for administrative mutations.
   - API: `GET /api/social/x/status`, `GET /api/social/x/connect`, `GET /api/social/x/callback`.

5. **UI & Client Integration**:
   - `app/whitelist/page.tsx`: Whitelist Status Checker, 5-category checklist, Phase badge, and Hourly Drop & Trait Claim card.
   - `app/profile/page.tsx`: Dynamic Whitelist status display and X identity status integration.
   - `lib/whitelist/client.ts` and `lib/drops/client.ts`: Client API helpers.

---

## 10. Initial Super Admin Bootstrap Mechanism (Task B-3)

### Overview

Task B-3 implements a production-grade, isolated bootstrap mechanism (`server/admin/bootstrap.ts`) to initialize the first `SUPER_ADMIN` account safely in staging and production environments.

### Core Security Invariants

1. **Isolated & Explicit Execution**:
   - Strictly executed out-of-band via CLI (`npm run admin:bootstrap`).
   - Decoupled from `devPromoteToAdmin` (`server/admin/dev-promote.ts`), which is blocked in production.
   - No public HTTP endpoints exist for admin promotion.
   - Never runs automatically during application startup.
2. **Environment Configuration**:
   - Requires `INITIAL_SUPER_ADMIN_ADDRESS` (or passed as CLI argument) and `DATABASE_URL`.
   - Never commits real wallet addresses or secrets to source code.
3. **Address Validation**:
   - Validates that the input is a valid 0x-prefixed 40-hex-character EVM address and normalizes to lowercase prior to database queries.
4. **First Super Admin Constraint**:
   - Only creates or promotes the Super Admin if no active (unbanned) Super Admin exists in the database.
5. **Rejection when Active Super Admin Already Exists**:
   - If an active Super Admin already exists for another wallet, the script **strictly rejects** execution with exit code 1 (`SUPER_ADMIN_ALREADY_EXISTS`), preserving all existing roles, permissions, and ban records without modification.
6. **Idempotent Repeated Runs**:
   - Running the script repeatedly with the _same_ wallet address is completely idempotent (`action: "ALREADY_SUPER_ADMIN"`). It ensures wildcard permissions (`*`) without creating duplicate records or modifying unaffected users.
7. **Concurrency Safety**:
   - Runs within an atomic database transaction.
   - Protected against multi-process race conditions via PostgreSQL transaction-level advisory locks (`SELECT pg_advisory_xact_lock(837264821)`).
   - Protected within the Node.js runtime via an in-process mutex queue (`AsyncLock`).
   - If concurrent bootstrap invocations race, strictly one succeeds and competing invocations fail closed.
8. **Ban Status Non-Tampering**:
   - Never clears user ban status (`isBanned` remains unchanged).
   - Never modifies, updates, or deletes `BanRecord` entries.
   - If the previous Super Admin was banned, a new active Super Admin may be bootstrapped to restore administration, leaving the banned account intact.
9. **Audit Trail**:
   - Administrative mutations are immutably logged to `AuditLog` (`action: "BOOTSTRAP_SUPER_ADMIN"`).

### Operator Usage

```bash
# Option 1: Via npm script with environment variable
INITIAL_SUPER_ADMIN_ADDRESS="0x..." DATABASE_URL="postgresql://..." npm run admin:bootstrap

# Option 2: Via npm script with CLI argument
DATABASE_URL="postgresql://..." npm run admin:bootstrap -- 0x...

# Option 3: Via standalone Node runner
DATABASE_URL="postgresql://..." node scripts/bootstrap-super-admin.mjs 0x...
```

---

## 11. DEC-012 Completion — Sybil Cluster Detection, Abuse Flags API/UI & Ban Hardening (Oct 28, 2026)

### 11.1 Sybil Cluster IP Detection & Non-Auto-Ban Rule
- **Threshold**: Detection triggers when ≥ 5 distinct wallets claim a drop from the exact same client IP address within a single drop cycle (`periodId`).
- **Investigation Signal Only**: Strictly creates `AbuseFlag` records with `flagType: SYBIL_WALLET_CLUSTER`, `severity: HIGH`, and `status: OPEN`.
- **Zero Automated Banning**: Shared IP alone never triggers automated account bans (`isBanned` remains unchanged).
- **Audit Logging**: Each flag creation logs `action: "ABUSE_FLAG_CREATED"` to PostgreSQL `AuditLog`.
- **Implementation**: `server/drops/claim.ts` (`checkAndFlagSybilCluster`).

### 11.2 Dual-Layer Rate Limiting on Drop Claims
- **Wallet/Session Budget**: 5 requests per 120,000ms (`DROPS_CLAIM_RATE_LIMIT_MAX`).
- **IP Budget**: 10 requests per 60,000ms (`DROPS_CLAIM_IP_RATE_LIMIT_MAX`).
- **Security Sanitization**: Client IP extracted safely via `x-real-ip` / `x-forwarded-for` and validated via `isValidClientIp()`. Rejects spoofed, malformed, or missing IP addresses safely without creating a shared global bucket.
- **Fail-Closed Strategy**: Rate limiter enforces HTTP 429 when budget is exceeded and fail-closed HTTP 500 if Redis connection fails.
- **Implementation**: `lib/auth/rate-limit.ts`, `app/api/drops/claim/route.ts`.

### 11.3 Permanent Ban Revocation Hardening
- **Hierarchy Invariant**: Permanent bans (`banType: PERMANENT`) may **only** be revoked by `SUPER_ADMIN`.
- **Rejection of Lower Roles**: Attempts by regular `ADMIN` or `MODERATOR` to lift a permanent ban are strictly rejected with HTTP 403 `INSUFFICIENT_PRIVILEGE`.
- **Audit Logging**: Successful revocations log `action: "REVOKE_BAN"` to `AuditLog`.
- **Implementation**: `server/admin/ban.ts` (`revokeBan`).

### 11.4 Moderator Permissions (Option B) & Admin Abuse Flags API
- **Schema-Preserving Permissions**: Utilizes existing `AdminRole` model without schema migration; grants `MODERATOR` accounts `permissions: ["REVIEW_EVIDENCE", "REVIEW_FLAGS"]`.
- **Endpoints**:
  - `GET /api/admin/abuse-flags`: Lists flags with filtering (`status`, `severity`, `flagType`, `userId`) and pagination (`limit`, `offset`). Requires `requireAdminSession(prisma, "REVIEW_FLAGS")`.
  - `GET /api/admin/abuse-flags/[id]`: Retrieves flag details with target user account profile and reviewer metadata.
  - `PATCH /api/admin/abuse-flags/[id]`: Updates investigation status (`OPEN`, `UNDER_REVIEW`, `DISMISSED`, `CONFIRMED_ACTION_TAKEN`) and resolution notes (up to 2048 chars). Logs `action: "ABUSE_FLAG_UPDATED"` to `AuditLog`.
- **Implementation**: `server/admin/abuse-flags.ts`, `app/api/admin/abuse-flags/**`, `lib/admin/client.ts`.

### 11.5 Admin Abuse Flags UI
- **Sidebar Integration**: Added `abuse-flags` tab with `ShieldAlert` icon to `ADMIN_NAV_ITEMS` in `components/admin/AdminSidebar.tsx` (gated by `REVIEW_FLAGS`).
- **Dashboard Client**: Modular tab rendering in `components/admin/AdminDashboardClient.tsx`.
- **Component Interface**: `components/admin/AdminAbuseFlags.tsx` includes real-time telemetry inspection modal, dynamic status and severity filters, pagination, and status update actions.
- **Overview Module**: Added quick navigation card in `components/admin/AdminOverview.tsx`.

### 11.6 End-to-End Test Verification
- Complete verification suite across all 6 stages:
  - `tests/integration/dec012-integration.test.ts` (6 end-to-end integration tests).
  - `tests/admin/abuse-flags.test.ts` (15 service tests).
  - `tests/admin/abuse-flags-route.test.ts` (20 route & auth tests).
  - `tests/admin/admin-abuse-flags-ui.test.tsx` (8 UI tests).
  - `tests/auth/stage3-rate-limiting.test.ts` (4 rate limiting budget tests).
  - Full suite status: 92 files, 1,124 tests passing (100%).

---

## 12. Super Admin Audit Log Dashboard & Query API (Oct 30, 2026) — DONE

### 12.1 Server-Side Access Control & Read-Only Invariant
- **Role Restriction**: Access strictly limited to `SUPER_ADMIN` via `requireAdminSession(prisma, { requiredRole: "SUPER_ADMIN" })`.
- **Enforced Rejections**: `ADMIN` and `MODERATOR` requests are rejected with HTTP 403 `FORBIDDEN`. Unauthenticated requests return HTTP 401 `UNAUTHORIZED`.
- **Read-Only Invariant**: Audit log is strictly read-only; mutation endpoints (`POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`) return HTTP 405 `Method Not Allowed`. No audit records can be edited or deleted.
- **Unchanged Logging Mechanism**: Existing mutation audit recording (`recordAuditLog` in `server/audit/audit.ts`) remains unmodified.

### 12.2 Query API & Privacy Protection
- **Endpoint**: `GET /api/admin/audit-logs`.
- **Filters**: Optional query filtering by `action`, `entityType`, `actorId`, and date range (`from`, `to`).
- **Date Validation**: Validates date formats; returns HTTP 400 `INVALID_DATE_RANGE` on malformed dates or when `from > to`.
- **Pagination & Ordering**: Supports `limit` and `offset` pagination, enforced maximum `limit` capped at 100 (default 50). Sorted newest first (`createdAt DESC`) with deterministic tie-breaker (`id DESC`).
- **Safe Projection (Anti-Leak)**: `actorIp` and `userAgent` are strictly omitted from database queries and response payloads to prevent exposure of sensitive infrastructure and telemetry data. Actor data includes only public display fields (`id`, `role`, `wallet.address`, `xIdentity.username`).

### 12.3 Admin Dashboard UI
- **Sidebar Integration**: Added `Audit Log` tab to `AdminSidebar.tsx` gated by `superAdminOnly: true`. Tab is rendered exclusively for `SUPER_ADMIN` accounts and hidden for lower roles.
- **Dashboard Guarding**: `AdminDashboardClient.tsx` verifies `isSuperAdmin` before rendering `<AdminAuditLog />` and displays an explicit access restricted banner if accessed by other roles.
- **Component Interface (`AdminAuditLog.tsx`)**:
  - Displays formatted timestamp, actor (with role badge and shortened wallet address), action badge, entity type, and entity ID.
  - Interactive filter form with inputs for action, entity type, actor ID, date range, page size selector, and Reset capability.
  - Safe detail modal inspecting `oldValues`, `newValues`, and `metadata` formatted as sanitized JSON.
  - Complete state handling for loading spinners, empty search results, API error banners with retry triggers, and 403 access denial.

### 12.4 Verification & Implementation Status
- **Implementation Commit**: `dd4156881d3bd17d25dc2876c87850eb12c54591`.
- **Test Suite**: 98 test files, 1,232 tests passing (100% pass rate).
- **TypeScript**: `tsc --noEmit` passed with 0 errors.
- **ESLint**: `eslint .` passed with 0 errors (17 pre-existing warnings in unrelated legacy components).
- **Production Build**: `next build --webpack` successfully compiled all pages and the new route `ƒ /api/admin/audit-logs`.


