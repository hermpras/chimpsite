# Environment Variables Reference & Configuration Guide

**Workspace**: `ChimpHood Site`  
**Target Runtime**: Node.js 20+ (Next.js 16 App Router)  
**Related Decisions**: [DEC-001](./pending-decisions.md) (Iron Session), [DEC-002](./pending-decisions.md) (wagmi v3), [DEC-003](./pending-decisions.md) (X OAuth 2.0 PKCE), [DEC-006](./pending-decisions.md) (EVM Chain Default 1), [DEC-010](./pending-decisions.md) (Admin Role RBAC)

---

## 1. Overview

ChimpHood uses standard environment variable configurations loaded through Next.js environment resolution (`.env.local` for development, system environment variables in staging and production).

All secret keys and sensitive credentials are read strictly on the server-side and never exposed to the client bundle. The application adheres to a **fail-closed** security pattern: when security-critical configuration is missing or misconfigured, affected endpoints immediately fail with clear server-side log diagnostics and safe, non-leaking HTTP error responses to callers.

---

## 2. Environment Variables Matrix

| Variable Name                 | Required                    | Default                 | Scope               | Description                                                                                 |
| :---------------------------- | :-------------------------- | :---------------------- | :------------------ | :------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                | **Yes**                     | —                       | Server              | PostgreSQL connection string for Prisma ORM v7                                              |
| `SESSION_SECRET`              | **Yes**                     | —                       | Server              | 32+ character key for Iron Session cookie encryption (`chimphood_session`)                  |
| `SIWE_DOMAIN`                 | **Yes** (for SIWE)          | —                       | Server              | Expected domain for EIP-4361 SIWE message validation (fails closed if unset)                |
| `SIWE_URI`                    | **Yes** (for SIWE)          | —                       | Server              | Expected canonical origin URI for SIWE message validation (fails closed if unset)           |
| `ALLOWED_CHAIN_IDS`           | No                          | `1`                     | Server / Public API | Comma-separated EVM chain IDs allowed for wallet authentication                             |
| `X_CLIENT_ID`                 | Optional / Feature          | —                       | Server              | Twitter / X OAuth 2.0 Client ID for social identity verification                            |
| `X_CLIENT_SECRET`             | Optional / Feature          | —                       | Server              | Twitter / X OAuth 2.0 Client Secret                                                         |
| `X_REDIRECT_URI`              | Optional / Feature          | —                       | Server              | Twitter / X OAuth 2.0 Redirect URI registered in developer portal                           |
| `NEXT_PUBLIC_APP_URL`         | No                          | `http://localhost:3000` | Shared / Client     | Canonical public URL used for absolute links                                                |
| `CRON_SECRET`                 | Optional / Cron             | —                       | Server              | Bearer secret token used to authorize automated background jobs (Vercel Cron)               |
| `UPSTASH_REDIS_REST_URL`      | **Yes** (Prod/Serverless)   | —                       | Server              | Upstash Redis REST API URL for distributed rate limiting & OAuth replay protection          |
| `UPSTASH_REDIS_REST_TOKEN`    | **Yes** (Prod/Serverless)   | —                       | Server              | Upstash Redis REST API bearer token for distributed rate limiting & OAuth replay protection |
| `INITIAL_SUPER_ADMIN_ADDRESS` | Optional (Bootstrap script) | —                       | Server / CLI        | 0x-prefixed EVM wallet address to initialize the primary SUPER_ADMIN role (Task B-3)        |
| `NODE_ENV`                    | Automatic                   | `development`           | Node.js Runtime     | Environment mode (`development`, `production`, `test`)                                      |

---

## 3. Detailed Variable Specifications

### 3.1 Database Configuration

#### `DATABASE_URL`

- **Purpose**: Specifies the connection endpoint to the PostgreSQL 15+ database instance managed by Prisma ORM v7.
- **Format**: `postgresql://<USER>:<PASSWORD>@<HOST>:<PORT>/<DATABASE>?schema=public`
- **Example (Local Docker)**:
  ```env
  DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chimphood_dev?schema=public"
  ```
- **Example (Production / Hosted PostgreSQL)**:
  ```env
  DATABASE_URL="postgresql://chimphood_user:SecretPassword123@db.chimphood.xyz:5432/chimphood_prod?schema=public&sslmode=require"
  ```

---

### 3.2 Authentication & Session Secrets

#### `SESSION_SECRET`

- **Purpose**: Used by `iron-session` (DEC-001) to symmetrically seal and encrypt the `chimphood_session` HTTP-only cookie.
- **Requirements**: Must be a cryptographically strong string of **at least 32 characters** (256 bits).
- **Generation**:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- **Behavior**: If unset or shorter than 32 characters, `POST /api/auth/verify` and session endpoints fail immediately with HTTP 500 before consuming nonces or executing state mutations.

---

### 3.3 Sign-In with Ethereum (SIWE / EIP-4361)

#### `SIWE_DOMAIN`

- **Purpose**: Enforces domain binding on SIWE messages to protect against phishing and cross-origin authentication relay attacks.
- **Format**: Hostname or hostname with port (must match the browser's `window.location.host` exactly).
- **Local Dev**: `localhost:3000` _(Note: include port 3000 during local development)_.
- **Production**: `chimphood.xyz` (or your production hostname without protocol or path).
- **Failure Mode**: Mismatched domain returns generic HTTP 401 with server diagnostics `AUTH_FAILED:SIWE_DOMAIN_MISMATCH`.

#### `SIWE_URI`

- **Purpose**: Enforces URI origin binding on SIWE messages.
- **Format**: Full origin URL matching browser's `window.location.origin` (must **not** have a trailing slash).
- **Local Dev**: `http://localhost:3000`
- **Production**: `https://chimphood.xyz`
- **Failure Mode**: Mismatched URI returns generic HTTP 401 with server diagnostics `AUTH_FAILED:SIWE_URI_MISMATCH`.

#### `ALLOWED_CHAIN_IDS`

- **Purpose**: Restricts SIWE login to authorized EVM networks per DEC-006.
- **Default**: `1` (Ethereum Mainnet).
- **Format**: Comma-separated positive integers without spaces or trailing commas (e.g. `1,11155111` for Mainnet and Sepolia).
- **Public Visibility**: Exposed safely to clients via `GET /api/auth/config` to prompt users to switch networks if connected to an unsupported chain.

---

### 3.4 X (Twitter) OAuth 2.0 PKCE

#### `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_REDIRECT_URI`

- **Purpose**: Used for Twitter OAuth 2.0 with PKCE to bind social identities to User accounts (`server/social/x.ts`).
- **Required Scopes in Developer Portal**: `users.read`, `tweet.read`, `offline.access`.
- **Fail-Closed Behavior (DEC-003)**:
  - If any of these variables are unset, the social integration endpoints (`/api/social/x/connect`, `/api/social/x/callback`, `/api/social/x/status`) return HTTP 503 (`SERVICE_UNAVAILABLE`) with a clear message indicating social linking is unconfigured.
  - Core features (wallet login, trait claiming, whitelist status checking) continue functioning without degradation.

---

### 3.5 General Application Settings

#### `NEXT_PUBLIC_APP_URL`

- **Purpose**: Public base URL used for client-side redirection, metadata, and canonical links.
- **Default**: `http://localhost:3000`
- **Production**: `https://chimphood.xyz`

#### `NODE_ENV`

- **Purpose**: Standard Node.js environment flag.
- **Values**: `development`, `production`, `test`.
- **Effects**:
  - In `production`, session cookies automatically enable `secure: true` (requiring HTTPS).
  - In `development`, Prisma query logging is enabled for debugging.

---

### 3.6 Cron Job Authorization

#### `CRON_SECRET`

- **Purpose**: Secures background automation routes against unauthorized execution.
- **Header Format**: Requests must supply `Authorization: Bearer <CRON_SECRET>`.
- **Routes protected**:
  - `/api/cron/sweep-gifts` (Task 2-A) — hourly gift expiry sweep, Vercel schedule `0 * * * *`
  - `/api/cron/cleanup-auth` (Task 2-C) — auth nonce & session cleanup, Vercel schedule `*/15 * * * *`
  - `/api/cron/reconcile-queue` (Task O-4) — hourly whitelist queue reconciliation, Vercel schedule `0 * * * *`
- **Fail-Closed Behavior**: If `CRON_SECRET` is unset on the server, cron routes fail immediately with HTTP 500 (`SERVER_MISCONFIGURED`). Requests with invalid or missing bearer tokens are rejected with HTTP 401 (`UNAUTHORIZED`).
- **Generation**:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

---

### 3.7 Distributed Rate Limiting & OAuth State Storage (Upstash Redis)

#### `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

- **Purpose**: Supplies REST API credentials for `@upstash/ratelimit` and `@upstash/redis` to provide:
  1. Shared distributed rate limiting across serverless invocations and multi-instance deployments (Task 0-C / DEC-002).
  2. Distributed atomic replay protection for X (Twitter) OAuth 2.0 PKCE states with TTL (Task 0-D / F9).
- **Format**:
  - `UPSTASH_REDIS_REST_URL`: Canonical HTTPS REST URL from Upstash Console (e.g. `https://your-database.upstash.io`).
  - `UPSTASH_REDIS_REST_TOKEN`: Upstash REST bearer token.
- **Fail-Closed Behavior**:
  - In serverless/production deployments, rate-limited endpoints fail closed with HTTP 500 (`Authentication unavailable` / `Authentication service temporarily unavailable`) if either variable is unset or if Redis operations fail.
  - In X OAuth callback (`/api/social/x/callback`), missing credentials or Redis failures fail closed with HTTP 500 (`OAUTH_STORAGE_NOT_CONFIGURED` / `OAUTH_STORAGE_ERROR`), clearing the state cookie.
  - The application strictly prohibits silent fallback to in-memory stores and does not forge false 429 rate limit responses on infrastructure failure.
- **Security**: Never expose to client bundles; accessed exclusively via server-side modules (`lib/auth/rate-limit.ts`, `server/social/x.ts`).

---

### 3.8 Super Admin Bootstrap Configuration (Task B-3)

#### `INITIAL_SUPER_ADMIN_ADDRESS`

- **Purpose**: Specifies the initial EVM wallet address to be granted `SUPER_ADMIN` privileges in staging or production environments using the isolated bootstrap script (`server/admin/bootstrap.ts`).
- **Scope**: Server / CLI only. Never exposed to browser or client bundles.
- **Format**: Valid 0x-prefixed 40-hex-character EVM address (e.g., `0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed`). Automatically normalized to lowercase prior to database persistence.
- **Required Environment Variables**:
  - `DATABASE_URL`: PostgreSQL connection string (must have read/write access to `User`, `WalletIdentity`, `AdminRole`, `AuditLog`).
  - `INITIAL_SUPER_ADMIN_ADDRESS`: EVM wallet address to bootstrap (required if not passed as CLI argument).
- **Fail-Closed & Validation Behavior**:
  - If neither the CLI argument nor `INITIAL_SUPER_ADMIN_ADDRESS` is provided, or if the format is invalid (not 0x + 40 hex characters), the script immediately exits with code 1 and a clear diagnostic message.
- **Behavior when Super Admin Already Exists**:
  - **Different Wallet**: If an active (unbanned) Super Admin already exists in the database for a different account, execution is **strictly rejected** with exit code 1 (`SUPER_ADMIN_ALREADY_EXISTS`). No new records are created, and existing accounts, roles, permissions, and ban records are left completely untouched.
  - **Same Wallet (Pengulangan / Idempotency)**: If executed repeatedly with the _same_ wallet address as the active Super Admin, the script completes idempotently (`ALREADY_SUPER_ADMIN`), ensuring wildcard permissions (`*`) without creating duplicates, demoting permissions, or changing ban status.
  - **Banned Super Admin**: If the only existing Super Admin is banned (`isBanned: true`), the platform has no _active_ Super Admin; bootstrapping a new wallet is permitted to restore administrative operations, while the banned account remains banned and all `BanRecord`s remain intact.
- **Concurrency & Transaction Safety**:
  - Operates inside an atomic database transaction.
  - Uses PostgreSQL transaction-level advisory locks (`SELECT pg_advisory_xact_lock(837264821)`) for cross-process concurrency and an in-process mutex for concurrent worker threads.
  - If two bootstrap processes race concurrently, exactly one succeeds and the other rejects without creating duplicate Super Admins.
- **Ban Integrity & Non-Tampering**:
  - Never clears user ban status (`isBanned` is preserved).
  - Never modifies, revokes, or deletes `BanRecord` entries.
- **Audit Logging**:
  - Every creation or promotion is immutably logged to `AuditLog` (`action: "BOOTSTRAP_SUPER_ADMIN"`).
- **Isolation & Security**:
  - Strictly isolated from HTTP traffic; no public endpoints exist for admin promotion.
  - Decoupled from `devPromoteToAdmin` (which is blocked in production).
  - Does NOT run automatically on server startup.
  - Never logs secrets, connection strings, or authentication tokens to stdout/stderr.
- **Explicit Operator Execution**:
  ```bash
  # Option 1: Via npm script with environment variable
  INITIAL_SUPER_ADMIN_ADDRESS="0x..." DATABASE_URL="postgresql://..." npm run admin:bootstrap

  # Option 2: Via npm script with CLI argument
  DATABASE_URL="postgresql://..." npm run admin:bootstrap -- 0x...

  # Option 3: Via standalone Node runner
  DATABASE_URL="postgresql://..." node scripts/bootstrap-super-admin.mjs 0x...
  ```

---

## 4. Setup Guide

### 4.1 Local Development Quickstart

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Generate your session secret:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. Paste the generated string as `SESSION_SECRET` in `.env.local`.
4. Ensure `SIWE_DOMAIN="localhost:3000"` and `SIWE_URI="http://localhost:3000"` are configured.
5. Start development:
   ```bash
   npm run dev
   ```

### 4.2 Production Deployment Checklist

- [ ] Set `NODE_ENV=production`.
- [ ] Configure production `DATABASE_URL` with SSL mode enabled (`sslmode=require`).
- [ ] Generate and set a distinct 64-character hex string for `SESSION_SECRET`.
- [ ] Set `SIWE_DOMAIN` to production domain without protocol (e.g., `chimphood.xyz`).
- [ ] Set `SIWE_URI` to production HTTPS URL without trailing slash (e.g., `https://chimphood.xyz`).
- [ ] Configure `ALLOWED_CHAIN_IDS` matching supported production networks.
- [ ] Generate and set `CRON_SECRET` for Vercel Cron authorization (`/api/cron/sweep-gifts`, `/api/cron/cleanup-auth`, `/api/cron/reconcile-queue`).
- [ ] Configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for shared distributed rate limiting and OAuth state replay protection.
- [ ] If X integration is enabled, configure registered OAuth 2.0 credentials and production redirect URI.
- [ ] Bootstrap initial `SUPER_ADMIN` wallet using the isolated script: `INITIAL_SUPER_ADMIN_ADDRESS="0x..." npm run admin:bootstrap`.
- [ ] Run verification suite: `npm run test && npm run typecheck && npm run lint`.
