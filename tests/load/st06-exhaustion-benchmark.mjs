/**
 * ST-06 Master Execution: Stock Exhaustion Benchmark Harness
 * File: tests/load/st06-exhaustion-benchmark.mjs
 *
 * Dedicated zero-dependency HTTP POST benchmark harness for ST-06.
 * Target:
 *   - Exactly 500 distinct authenticated synthetic users.
 *   - Available stock: exactly 50 units.
 *   - Endpoint: POST /api/drops/claim
 *   - Each user submits exactly ONE claim request.
 *   - Exactly 50 successful claims (HTTP 200).
 *   - Exactly 450 stock exhaustion rejections (HTTP 409 STOCK_EXHAUSTED).
 *   - Zero HTTP 500.
 *   - Zero network errors / timeouts.
 *   - Complete per-request telemetry logged.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TARGET_URL = process.env.TARGET_URL || "http://127.0.0.1:3000/api/drops/claim";
const DROP_ID = process.env.DROP_ID || "drop-load-test";
const PERIOD_ID = process.env.PERIOD_ID || "period-load-test";
const RESULTS_DIR = path.resolve(__dirname, "results");
const OUTPUT_FILE = path.join(RESULTS_DIR, "st-06-stock-exhaustion-benchmark.json");

if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// Security check: Target must be strictly local loopback
const parsedUrl = new URL(TARGET_URL);
const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
if (!allowedHosts.has(parsedUrl.hostname) || parsedUrl.protocol !== "http:") {
  console.error("FATAL: Target URL must strictly be HTTP on local loopback. Received:", TARGET_URL);
  process.exit(1);
}

// Load 500 synthetic sessions
const sessionsPath = path.resolve(__dirname, "st06-test-sessions.json");
if (!fs.existsSync(sessionsPath)) {
  console.error("FATAL: st06-test-sessions.json not found. Run fixture preparation first.");
  process.exit(1);
}

const sessions = JSON.parse(fs.readFileSync(sessionsPath, "utf8"));
if (!Array.isArray(sessions) || sessions.length !== 500) {
  console.error(`FATAL: Expected exactly 500 sessions, found ${sessions?.length}`);
  process.exit(1);
}

console.log("==================================================================");
console.log("Elychimp — ST-06 Stock Exhaustion Benchmark");
console.log(`Target URL:         ${TARGET_URL}`);
console.log(`Drop ID:            ${DROP_ID}`);
console.log(`Period ID:          ${PERIOD_ID}`);
console.log(`Synthetic Users:    ${sessions.length}`);
console.log("Target Stock:       50 units");
console.log("Expected Claims:    50 successful (HTTP 200)");
console.log("Expected Exhausted: 450 rejections (HTTP 409 STOCK_EXHAUSTED)");
console.log("Target HTTP 500:    0");
console.log("==================================================================\n");

const agent = new http.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxTotalSockets: 100,
});

const payload = JSON.stringify({ dropId: DROP_ID, periodId: PERIOD_ID });
const payloadBuffer = Buffer.from(payload);

// Statistics tracking
const stats = {
  totalRequests: 0,
  successful: 0,       // 200 OK
  stockExhausted: 0,   // 409 STOCK_EXHAUSTED / STOCK_RACE_EXHAUSTED
  alreadyClaimed: 0,   // 409 ALREADY_CLAIMED_IN_PERIOD
  rateLimited: 0,      // 429 RATE_LIMITED
  serverErrors: 0,     // 500 SERVER_ERROR
  otherStatuses: {},
  networkErrors: 0,
  latencies: [],
  perRequestResults: [],
};

let emergencyStopTriggered = false;
let emergencyStopReason = "";

function executeSingleClaim(userSession, userIndex) {
  return new Promise((resolve) => {
    if (emergencyStopTriggered) {
      const record = {
        userIndex,
        userId: userSession.userId,
        status: 0,
        error: "ABORTED_EMERGENCY_STOP",
        latency: 0,
      };
      stats.perRequestResults.push(record);
      resolve(record);
      return;
    }

    const reqStart = Date.now();
    const req = http.request(
      parsedUrl,
      {
        method: "POST",
        agent,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": payloadBuffer.length,
          Cookie: userSession.cookie,
          "User-Agent": `ST06-Worker/${userIndex + 1}`,
          Connection: "keep-alive",
        },
        timeout: 10000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });

        res.on("end", () => {
          const latency = Date.now() - reqStart;
          const status = res.statusCode || 0;

          stats.totalRequests++;
          stats.latencies.push(latency);

          let parsedBody = null;
          try {
            parsedBody = JSON.parse(body);
          } catch {}

          const record = {
            userIndex,
            userId: userSession.userId,
            statusCode: status,
            responseCode: parsedBody?.error || (status === 200 ? "SUCCESS" : "UNKNOWN"),
            claimId: parsedBody?.claimId,
            inventoryItemId: parsedBody?.inventoryItem?.id,
            edition: parsedBody?.inventoryItem?.edition,
            trait: parsedBody?.inventoryItem?.trait?.name,
            latency,
          };
          stats.perRequestResults.push(record);

          if (status === 200) {
            stats.successful++;
          } else if (status === 409) {
            if (
              parsedBody?.error === "STOCK_EXHAUSTED" ||
              parsedBody?.error === "STOCK_RACE_EXHAUSTED"
            ) {
              stats.stockExhausted++;
            } else if (parsedBody?.error === "ALREADY_CLAIMED_IN_PERIOD") {
              stats.alreadyClaimed++;
            } else {
              stats.otherStatuses[status] = (stats.otherStatuses[status] || 0) + 1;
            }
          } else if (status === 429) {
            stats.rateLimited++;
          } else if (status >= 500) {
            stats.serverErrors++;
            emergencyStopTriggered = true;
            emergencyStopReason = `CRITICAL: Received HTTP ${status} for user ${userSession.userId}: ${body}`;
          } else {
            stats.otherStatuses[status] = (stats.otherStatuses[status] || 0) + 1;
          }

          resolve(record);
        });
      },
    );

    req.on("error", (err) => {
      const latency = Date.now() - reqStart;
      stats.totalRequests++;
      stats.networkErrors++;
      const record = {
        userIndex,
        userId: userSession.userId,
        statusCode: 0,
        responseCode: "NETWORK_ERROR",
        error: err.message,
        latency,
      };
      stats.perRequestResults.push(record);
      resolve(record);
    });

    req.on("timeout", () => {
      req.destroy();
      const latency = Date.now() - reqStart;
      stats.totalRequests++;
      stats.networkErrors++;
      const record = {
        userIndex,
        userId: userSession.userId,
        statusCode: 0,
        responseCode: "TIMEOUT",
        error: "Socket timeout after 10000ms",
        latency,
      };
      stats.perRequestResults.push(record);
      resolve(record);
    });

    req.write(payloadBuffer);
    req.end();
  });
}

function calculatePercentile(latencies, percentile) {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

async function runBenchmark() {
  const startTime = Date.now();
  console.log(`[BENCHMARK] Launching 500 concurrent claim requests...`);

  // Launch all 500 distinct requests
  await Promise.all(
    sessions.map((session, index) => executeSingleClaim(session, index)),
  );

  const durationMs = Date.now() - startTime;
  const durationSec = durationMs / 1000;
  const throughput = (stats.totalRequests / durationSec).toFixed(2);

  const p50 = calculatePercentile(stats.latencies, 50);
  const p90 = calculatePercentile(stats.latencies, 90);
  const p95 = calculatePercentile(stats.latencies, 95);
  const p99 = calculatePercentile(stats.latencies, 99);
  const minLatency = stats.latencies.length > 0 ? Math.min(...stats.latencies) : 0;
  const maxLatency = stats.latencies.length > 0 ? Math.max(...stats.latencies) : 0;
  const avgLatency =
    stats.latencies.length > 0
      ? (stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length).toFixed(1)
      : 0;

  console.log("\n==================================================================");
  console.log("Elychimp — ST-06 Benchmark Execution Complete");
  console.log(`Execution Duration:    ${durationSec.toFixed(2)} seconds`);
  console.log(`Total Requests:        ${stats.totalRequests}`);
  console.log(`Throughput:            ${throughput} req/sec`);
  console.log("------------------------------------------------------------------");
  console.log(`Successful Claims:     ${stats.successful} (Expected: 50)`);
  console.log(`Stock Exhausted (409): ${stats.stockExhausted} (Expected: 450)`);
  console.log(`Already Claimed (409): ${stats.alreadyClaimed} (Expected: 0)`);
  console.log(`Rate Limited (429):    ${stats.rateLimited} (Expected: 0)`);
  console.log(`Server Errors (500):   ${stats.serverErrors} (Expected: 0)`);
  console.log(`Network Errors:        ${stats.networkErrors} (Expected: 0)`);
  console.log(`Other Statuses:        ${JSON.stringify(stats.otherStatuses)}`);
  console.log("------------------------------------------------------------------");
  console.log(`Latency Min:           ${minLatency} ms`);
  console.log(`Latency Avg:           ${avgLatency} ms`);
  console.log(`Latency P50:           ${p50} ms`);
  console.log(`Latency P90:           ${p90} ms`);
  console.log(`Latency P95:           ${p95} ms`);
  console.log(`Latency P99:           ${p99} ms`);
  console.log(`Latency Max:           ${maxLatency} ms`);
  console.log("==================================================================\n");

  const finalOutput = {
    meta: {
      benchmark: "ST-06 Stock Exhaustion Test",
      targetUrl: TARGET_URL,
      dropId: DROP_ID,
      periodId: PERIOD_ID,
      timestamp: new Date().toISOString(),
      durationMs,
      throughputReqSec: Number(throughput),
    },
    summary: {
      totalRequests: stats.totalRequests,
      successfulClaims: stats.successful,
      stockExhausted: stats.stockExhausted,
      alreadyClaimed: stats.alreadyClaimed,
      rateLimited: stats.rateLimited,
      serverErrors: stats.serverErrors,
      networkErrors: stats.networkErrors,
      otherStatuses: stats.otherStatuses,
      targetExpectedPass:
        stats.successful === 50 &&
        stats.stockExhausted === 450 &&
        stats.serverErrors === 0 &&
        stats.networkErrors === 0,
    },
    latency: {
      min: minLatency,
      avg: Number(avgLatency),
      p50,
      p90,
      p95,
      p99,
      max: maxLatency,
    },
    requests: stats.perRequestResults,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalOutput, null, 2), "utf8");
  console.log(`Saved benchmark results to: ${OUTPUT_FILE}`);

  if (emergencyStopTriggered) {
    console.error(`\n[EMERGENCY_STOP] ${emergencyStopReason}`);
    process.exit(1);
  }
}

runBenchmark().catch((err) => {
  console.error("Benchmark failed with uncaught exception:", err);
  process.exit(1);
});
