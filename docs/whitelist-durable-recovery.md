# Whitelist Eligibility Evaluation: Durable Recovery Queue

## Overview

Automatic Whitelist Eligibility Evaluation is triggered when a user completes qualification-altering actions:
1. Drop claim (`server/drops/claim.ts`)
2. Gift acceptance (`server/inventory/gift.ts`)
3. Task evidence approval by admin (`server/admin/evidence.ts`)
4. X OAuth account linking (`server/social/x.ts`)

To ensure evaluation failures (e.g. transient database deadlocks, network timeouts, serialization collisions) do not leave users un-evaluated when serverless instances cold-start, scale to zero, or redeploy, ChimpHood implements a **Durable Recovery Queue** powered by Upstash Redis.

---

## Important Architectural Distinction

> [!IMPORTANT]
> **Internal System Recovery Queue vs Participant FCFS Queue:**
> - **Internal System Recovery Queue (`chimphood:wl:recovery:*`)**: An asynchronous, internal system job retry pipeline for recovering evaluation tasks. It is **NOT** user-facing and contains only system execution metadata (`userId`, `programId`, `attempts`, `nextRetryAt`, `lastError`).
> - **Participant FCFS Directory (`WLQueueEntry`)**: The business queue for participants who qualified after GTD capacity was reached or who are awaiting OpenSea FCFS minting.
> - **DEC-018 Invariant**: Recovery execution strictly evaluates individual user eligibility. It **NEVER** runs queue reconciliation, auto-promotion, or slot re-allocation from FCFS to GTD. Revoked slots strictly remain vacant.
> - **DEC-022 Invariant**: Users with `REVOKED` qualification status remain permanently terminal and cannot be allocated a slot via recovery.

---

## Redis Data Model

The durable recovery queue uses standard Redis primitives compatible with Upstash Redis REST and Serverless:

| Key Pattern | Redis Type | Purpose | TTL / Expiration |
|---|---|---|---|
| `chimphood:wl:recovery:due` | Sorted Set (ZSET) | Schedules due recovery jobs. `score` is `nextRetryAt` epoch ms; `member` is `${userId}:${programId}`. | Persistent until completed or moved to DLQ |
| `chimphood:wl:recovery:job:${key}` | String (JSON) | Stores serialized `DurableRecoveryJob` payload (`userId`, `programId`, `attempts`, `maxAttempts`, `nextRetryAt`, `createdAt`, `lastError`, `leaseExpiresAt`, `claimedBy`). | Persistent until completed or moved to DLQ |
| `chimphood:wl:recovery:lock:${key}` | String | Distributed mutex ensuring only one worker instance processes a job at a time. Value is `workerId`. | Expiring TTL (default: 60s lease) |
| `chimphood:wl:recovery:dlq` | List (LPUSH) | Dead-Letter Queue storing permanently failed jobs (attempts >= maxAttempts) for administrative auditing. | Persistent |

---

## Multi-Instance Lease & Claim Lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant App as Business Event (Drop/Gift/Evidence/X)
    participant Redis as Upstash Redis
    participant Cron as Vercel Cron Worker (/api/cron/wl-recovery)
    participant DB as PostgreSQL (Prisma)
    participant DLQ as Dead-Letter Queue

    App->>DB: Commit core business transaction
    App->>DB: Attempt immediate evaluation (3x with backoff)
    alt Immediate Evaluation Fails
        App->>Redis: enqueueDurableRecovery (ZADD due + SET job)
    end

    Note over Cron,Redis: Every 5 minutes (Vercel Cron)
    Cron->>Redis: ZRANGEBYSCORE due 0 now (claim batch)
    loop For each due job
        Cron->>Redis: SET lock:${jobKey} workerId NX EX 60s
        alt Lease Acquired
            Cron->>DB: evaluateUserQualification (pessimistic lock)
            alt Evaluation Succeeded
                Cron->>Redis: ZREM due + DEL job + DEL lock
            else Evaluation Failed (attempts < 5)
                Cron->>Redis: Reschedule with exponential backoff (ZADD due nextRetryAt)
                Cron->>Redis: DEL lock
            else Max Attempts Reached (attempts >= 5)
                Cron->>DLQ: LPUSH dlq (deadLetterPayload)
                Cron->>Redis: ZREM due + DEL job + DEL lock
            end
        else Lock Contested
            Note over Cron: Another worker active; skip
        end
    end
```

### Leased Job Expiry & Recovery
If a serverless instance dies, crashes, or times out mid-processing, its `lock:${jobKey}` expires automatically after 60 seconds via Redis `EX`. On the next cron invocation, the job remains in `chimphood:wl:recovery:due` and can be claimed atomically by a healthy worker.

---

## Reliability Gap Handling

A critical distributed systems reliability boundary exists:
```
PostgreSQL Transaction Commits  ==>  Evaluation Fails  ==>  Redis Enqueue Fails
```

If Redis is unreachable when persisting the failed job:
1. **Business Transaction Protected**: The error is caught; the committed business transaction (`InventoryItem`, `EvidenceSubmission`, etc.) is **never** rolled back.
2. **Secondary In-Memory Failover**: The job is enqueued in the active process's in-memory retry queue (`evaluationRecoveryQueue`) to allow local retry while the node stays alive.
3. **Structured Critical Log**: A structured critical error is logged for alerting:
   ```json
   {
     "tag": "[CRITICAL_WL_EVALUATION_ORPHAN]",
     "userId": "user_123",
     "programId": "prog_abc",
     "error": "Upstash Redis connection timeout",
     "timestamp": "2026-11-01T12:00:00.000Z",
     "code": "REDIS_ENQUEUE_FAILURE"
   }
   ```
4. **PostgreSQL Ground-Truth**: The user's underlying qualification state (held traits, completed tasks, wallet, and X identity) is fully persisted in PostgreSQL. When the user completes any subsequent qualification event or when an admin re-triggers evaluation, qualification is evaluated from ground-truth data.

---

## Scheduler Configuration

The recovery worker is scheduled via Vercel Cron in [`vercel.json`](file:///Users/hermawanprastiyanto/Desktop/ChimpHood%20Site/vercel.json):

```json
{
  "regions": ["icn1"],
  "crons": [
    {
      "path": "/api/cron/wl-recovery",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

### Route Endpoint
- **URL**: `POST /api/cron/wl-recovery` (also accepts `GET` for Vercel Cron compatibility).
- **Authentication**: Requires `Authorization: Bearer <CRON_SECRET>`. Uses constant-time string comparison (`timingSafeEqualString`) to prevent timing attacks.
- **Batch Boundary**: Bounded to 25 jobs per execution to remain well within serverless invocation limits (10s–60s).

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | Yes (Prod) | Upstash Redis REST endpoint URL. |
| `UPSTASH_REDIS_REST_TOKEN` | Yes (Prod) | Upstash Redis REST access token. |
| `CRON_SECRET` | Yes (Prod) | Shared secret Bearer token used by Vercel Cron to authorize worker executions. |

In local development and test environments (`NODE_ENV === "test"` or unconfigured), an in-memory client automatically serves as the mock store.

---

## Operational Troubleshooting & Monitoring

### Inspecting Dead-Letter Queue (DLQ)
Permanently failed jobs are stored in `chimphood:wl:recovery:dlq`. Use `getDeadLetterQueue(limit)` in an administrative script or Redis CLI:
```bash
# Redis CLI inspection
LRANGE chimphood:wl:recovery:dlq 0 10
```

### Log Alerts
Monitor log streams (Vercel Log Drains / Datadog / CloudWatch) for:
- `[CRITICAL_WL_EVALUATION_ORPHAN]`: Indicates Upstash Redis is unreachable during recovery enqueue.
- `[WL Recovery] Maximum retry attempts (5) exceeded`: Indicates a user job moved to DLQ due to persistent evaluation failure (e.g. data anomaly).
