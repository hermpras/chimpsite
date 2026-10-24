# Task 5-B: Drops Load Tests (`/api/drops/claim`)

This directory contains repeatable load testing scripts and tools for verifying concurrency invariants on `POST /api/drops/claim` with a target load of **100 concurrent claims**.

---

## 1. Safety & Environment Isolation Policy (Rule 4)

> [!CAUTION]
> **DO NOT RUN LOAD TESTS AGAINST PRODUCTION OR ACTIVE SUPABASE.**  
> The active database credentials in `.env.local` point to the live Supabase database. Load tests MUST only be run against a dedicated local PostgreSQL test instance or an isolated staging environment. The seeder and verification scripts include automatic safeguards against executing on production database URLs.

### Required Environment for Live HTTP Load Testing

To run live HTTP load tests against the running Next.js server (`npm run dev` or `npm run start`), the following staging infrastructure is required:

1. **Isolated PostgreSQL Database**:
   - Local Docker container: `docker run --name chimphood-test-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16-alpine`
   - Migrations applied: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/chimphood_test npx prisma migrate deploy`
2. **Upstash Redis / Redis Mock**:
   - Redis URL and Token configured in `.env.local` for the sliding window rate limiter (`@chimphood/ratelimit`).
3. **Session Secret**:
   - `SESSION_SECRET` with at least 32 characters in `.env.local`.

---

## 2. Load Testing Scripts Overview

| File                                    | Purpose                                                                                                                                                                                 |
| :-------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/drops/claim-concurrency.test.ts` | **Automated In-Process Vitest Concurrency Test**: Simulates 100 concurrent claims with race conditions, stock contention, and Sybil attacks without hitting the live Supabase instance. |
| `tests/load/k6-drops-claim.js`          | **k6 Load Test Script**: Multi-stage VU ramp-up (5 -> 25 -> 50 -> 100 concurrent VUs) targeting the HTTP endpoint.                                                                      |
| `tests/load/autocannon-drops-claim.mjs` | **Autocannon / Native Load Tester**: Node.js script supporting gradual scaling to 100 concurrent connections with latency percentiles and HTTP status code tracking.                    |
| `tests/load/seed-load-test-data.ts`     | **Test Data Seeder**: Generates 100 isolated test users, active DB sessions, sealed cookies, and a test Drop with configurable stock in staging.                                        |
| `tests/load/verify-stock-invariants.ts` | **Post-Test Invariant Auditor**: Verifies that `remainingStock >= 0`, `claimedStock + remainingStock === allocatedStock`, claim counts match, and editions are unique.                  |

---

## 3. Step-by-Step Execution Guide (Staging Environment)

### Step 1: Seed Test Data in Staging

```bash
# Ensure DATABASE_URL points to local/staging PostgreSQL
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chimphood_test" \
SESSION_SECRET="your-32-character-secret-key-goes-here" \
npx tsx tests/load/seed-load-test-data.ts
```

This writes `tests/load/load-test-sessions.json` containing 100 unique user sessions and cookies.

### Step 2: Start the Next.js Server

```bash
npm run dev
# or for production performance:
# npm run build && npm run start
```

### Step 3: Run Load Tests

#### Option A: Using `k6`

```bash
# 1. Smoke test (5 VUs, 10s)
k6 run tests/load/k6-drops-claim.js -e SCENARIO=smoke

# 2. Gradual ramp-up (5 -> 25 -> 50 -> 100 VUs over 75s)
k6 run tests/load/k6-drops-claim.js -e SCENARIO=ramp

# 3. Peak 100 concurrent claims (100 VUs, 30s)
k6 run tests/load/k6-drops-claim.js -e SCENARIO=target_100
```

#### Option B: Using `autocannon` / Native Runner

```bash
# 1. Smoke test (5 concurrent clients)
node tests/load/autocannon-drops-claim.mjs --connections 5 --duration 10

# 2. Medium load (25 concurrent clients)
node tests/load/autocannon-drops-claim.mjs --connections 25 --duration 15

# 3. Heavy load (50 concurrent clients)
node tests/load/autocannon-drops-claim.mjs --connections 50 --duration 15

# 4. Target: 100 concurrent clients
node tests/load/autocannon-drops-claim.mjs --connections 100 --duration 20
```

### Step 4: Verify Database Invariants Post-Test

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chimphood_test" \
npx tsx tests/load/verify-stock-invariants.ts
```

---

## 4. In-Process Concurrency Test Suite (Vitest)

For continuous integration and isolated sandbox validation without cloud dependencies:

```bash
npx vitest run tests/drops/claim-concurrency.test.ts
```

Runs 4 rigorous concurrency scenarios:

1. **100 Concurrent claims with Stock Contention (20 stock)**: Confirms remaining stock never drops below 0 and exactly 20 items are allocated.
2. **100 Concurrent claims with 100 stock available**: Confirms 100% successful claim allocation with sequential, distinct editions.
3. **Sybil Race (100 concurrent claims from the SAME user)**: Confirms strictly 1 claim succeeds and 99 are rejected with 409 `ALREADY_CLAIMED_IN_PERIOD` or `STOCK_RACE_EXHAUSTED`.
4. **Emergency Cancellation mid-flight**: Confirms immediate cessation of claims and zero inventory leaks.
