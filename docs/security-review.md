# Security Review Checklist & Assessment (Task 5-C)

**Date**: October 23, 2026  
**Status**: Completed  
**Reference**: `chimphood-implementation-plan.md` v2 (Fase 5 — Stage 9: Testing / Task 5-C)  
**Acceptance Criteria**: Checklist auth, rate limit, constraint, secret exposure

---

## 1. Executive Summary

This document fulfills the acceptance criteria for **Task 5-C (Security Review)** by providing a systematic security verification checklist across four critical operational dimensions:

1. **Authentication & Authorization (Auth)**
2. **Rate Limiting & Abuse Prevention (Rate Limit)**
3. **Data Integrity & Business Invariants (Constraint)**
4. **Credential Isolation & Information Leaks (Secret Exposure)**

---

## 2. Checklist Matrix & Verification Status

### 2.1 Authentication & Authorization (`auth`)

| Check ID    | Verification Item                                  | Implementation Reference                                                                                        | Status  | Evidence / Notes                                                                                                                                   |
| :---------- | :------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------- | :-----: | :------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AUTH-01** | Nonce single-use consumption prior to verification | `server/auth/verify.ts`                                                                                         | ✅ PASS | Nonce is consumed conditionally via `siweNonce.updateMany({ where: { consumedAt: null, expiresAt: { gt: now } } })` before signature verification. |
| **AUTH-02** | SIWE message expiration & timestamp freshness      | `lib/auth/siwe.ts`, `server/auth/verify.ts`                                                                     | ✅ PASS | SIWE `issuedAt` must fall within 15-minute clock skew window; expired messages fail closed with `AUTH_FAILED:SIWE_MESSAGE_EXPIRED`.                |
| **AUTH-03** | Chain ID validation against server allowlist       | `server/auth/config.ts`, `lib/auth/siwe.ts`                                                                     | ✅ PASS | Rejects unauthorized chains with `AUTH_FAILED:SIWE_CHAIN_NOT_ALLOWED`. Default EVM chain: `[1]`.                                                   |
| **AUTH-04** | Session tokens hashed before persistence           | `server/auth/session.ts`                                                                                        | ✅ PASS | Raw 256-bit session token is sealed inside encrypted Iron Session cookie; database only stores `createHash("sha256").update(token).digest("hex")`. |
| **AUTH-05** | Admin RBAC role & permission enforcement           | `server/auth/session.ts` (`requireAdminSession`), `server/admin/ban.ts`                                         | ✅ PASS | Missing session yields 401; missing `AdminRole` yields 403; unauthorized permission yields 403. DEC-012: Moderator role restricted to `REVIEW_EVIDENCE` and `REVIEW_FLAGS`; permanent bans can only be revoked by `SUPER_ADMIN` (HTTP 403 `INSUFFICIENT_PRIVILEGE` for other roles). |
| **AUTH-06** | System & scoped ban enforcement across flows       | `server/admin/ban.ts`, `server/drops/claim.ts`, `server/inventory/gift.ts`, `server/whitelist/qualification.ts` | ✅ PASS | Active bans strictly prevent SIWE login, claim execution, gift initiation & acceptance, and whitelist qualification.                               |
| **AUTH-07** | Address casing normalization                       | `lib/auth/address.ts`                                                                                           | ✅ PASS | All EVM addresses are sanitized via `address.toLowerCase()` before queries or writes to avoid checksum duplicates.                                 |

### 2.2 Rate Limiting (`rate limit`)

| Check ID    | Verification Item                    | Implementation Reference                                                  | Status  | Evidence / Notes                                                                                                                             |
| :---------- | :----------------------------------- | :------------------------------------------------------------------------ | :-----: | :------------------------------------------------------------------------------------------------------------------------------------------- |
| **RATE-01** | Auth routes fixed-window rate limits | `app/api/auth/nonce/route.ts`, `app/api/auth/verify/route.ts`             | ✅ PASS | `10 req / 60s` per IP address. Returns HTTP 429 with `Retry-After` header.                                                                   |
| **RATE-02** | Drop claim rate budget               | `app/api/drops/claim/route.ts`                                            | ✅ PASS | `5 req / 120s` keyed by user wallet address, plus `10 req / 60s` per client IP address (DEC-012) to mitigate bot swarming and Sybil attacks. |
| **RATE-03** | Gift sending rate budget             | `app/api/gifts/route.ts`                                                  | ✅ PASS | `10 req / 60s` keyed by user wallet address.                                                                                                 |
| **RATE-04** | Whitelist qualification rate budget  | `app/api/whitelist/qualify/route.ts`                                      | ✅ PASS | `3 req / 300s` keyed by user wallet address to prevent qualification spamming.                                                               |
| **RATE-05** | Fail-closed limiter handling         | `lib/auth/rate-limit.ts`                                                  | ✅ PASS | If distributed rate limiter (Upstash Redis) fails or times out, critical routes fail closed with HTTP 500, refusing unauthorized bypass.     |
| **RATE-06** | Avatar render CPU budget & DoS guard | `app/api/renders/avatar/route.ts`, `app/api/renders/avatar/[id]/route.ts` | ✅ PASS | `5 req / 60s` on on-demand render; `GET /api/renders/avatar/[id]` prevents unauthenticated lazy-render spam against nonexistent identifiers. |
| **RATE-07** | Gift resolution rate budget          | `app/api/gifts/[id]/route.ts`                                             | ✅ PASS | `10 req / 60s` on `ACCEPT`, `REJECT`, and `CANCEL` actions keyed by user wallet address.                                                     |

### 2.3 Data Integrity & Constraints (`constraint`)

| Check ID    | Verification Item                       | Implementation Reference                                        | Status  | Evidence / Notes                                                                                                              |
| :---------- | :-------------------------------------- | :-------------------------------------------------------------- | :-----: | :---------------------------------------------------------------------------------------------------------------------------- |
| **CONS-01** | Single claim per wallet per drop period | `prisma/schema.prisma` (`Claim`)                                | ✅ PASS | Guaranteed at PostgreSQL index level: `@@unique([userId, dropId, periodId])`.                                                 |
| **CONS-02** | WL slot holder claim prohibition        | `server/drops/claim.ts`                                         | ✅ PASS | Active/confirmed WL slot holders cannot claim drops, preserving rewards for eligible non-slot holders.                        |
| **CONS-03** | Stock non-negativity constraint         | `prisma/migrations/20261013000001_add_stock_check_constraints/` | ✅ PASS | PostgreSQL table constraint `CHECK (remaining_stock >= 0)` combined with atomic decrement `remainingStock: { decrement: 1 }`. |
| **CONS-04** | Trait edition serial integrity          | `prisma/schema.prisma` (`InventoryItem`)                        | ✅ PASS | `@@unique([traitId, edition])` prevents duplicate edition generation.                                                         |
| **CONS-05** | Trait category whitelist requirement    | `server/whitelist/qualification.ts`                             | ✅ PASS | Exactly 5 mandatory trait categories required (`BG`, `FUR`, `CLOTHING`, `HEADWEAR`, `EYEWEAR`).                               |
| **CONS-06** | Gift duplicate retention rule           | `server/inventory/gift.ts`                                      | ✅ PASS | Sender must retain at least 1 copy of the trait (`count >= 2`); recipient must not already own the trait.                     |
| **CONS-07** | Gift daily quota & expiry window        | `server/inventory/gift.ts`, `app/api/gifts/route.ts`            | ✅ PASS | Maximum 1 gift per sender per UTC day; 24h expiration auto-releases locked item via lazy evaluation on accept and opportunistic sweep on fetch without cron. |
| **CONS-08** | Sybil cluster detection & non-auto-ban rule | `server/drops/claim.ts`                                         | ✅ PASS | DEC-012: Threshold of ≥ 5 distinct wallets per IP per drop cycle logs `AbuseFlag` and `AuditLog` for manual review. Strictly prohibits automated banning based on shared IP alone. |

### 2.4 Secret & Credential Exposure (`secret exposure`)

| Check ID    | Verification Item                    | Implementation Reference                                                  | Status  | Evidence / Notes                                                                                                                                                                                            |
| :---------- | :----------------------------------- | :------------------------------------------------------------------------ | :-----: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SECR-01** | Zero server secrets in client bundle | `docs/environment-variables.md`                                           | ✅ PASS | No secret (`DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`, `X_CLIENT_SECRET`, `UPSTASH_REDIS_REST_TOKEN`) uses `NEXT_PUBLIC_` prefix.                                                                      |
| **SECR-02** | Sanitized client error responses     | All API routes (`app/api/**`), `server/social/x.ts`                       | ✅ PASS | Errors return structured generic messages (e.g. `Unauthorized`, `Invalid request`, sanitized X OAuth code exchange); stack traces and raw external API errors are isolated to server logs.                  |
| **SECR-03** | Sanitized server logs                | `server/auth/verify.ts`, `server/auth/session.ts`                         | ✅ PASS | No cryptographic signatures, session cookies, private keys, or plain tokens are ever written to stdout or logs.                                                                                             |
| **SECR-04** | Cron endpoint constant-time auth     | `app/api/cron/sweep-gifts/route.ts`, `app/api/cron/cleanup-auth/route.ts` | ✅ PASS | Protected by `Authorization: Bearer <CRON_SECRET>` verified via constant-time SHA-256 comparison (`timingSafeEqualString`). Missing, invalid, or length-mismatched tokens immediately reject with HTTP 401. Scheduled crons removed in `vercel.json` per Task O-6; routes retained for manual/admin fallback. |

---

## 3. Automated Verification

The entire checklist is covered by automated unit, integration, and security assertion tests executed via Vitest (`tests/security/security-review.test.ts`).
