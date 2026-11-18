/**
 * ST-07 Master Execution: Same-Wallet Concurrent Claim Benchmark Harness
 * File: tests/load/st07-claim-benchmark.mjs
 *
 * Dedicated zero-dependency HTTP POST benchmark harness for ST-07.
 * Target:
 *   - Exactly 50 simultaneous HTTP claim requests from the SAME authenticated wallet and user.
 *   - Endpoint: POST /api/drops/claim
 *   - Payload: { dropId: "drop-load-test", periodId: "period-load-test" }
 *   - All 50 requests share the EXACT same session cookie (usr-st07-single-001).
 *   - Coordinated start barrier: all 50 dispatched simultaneously.
 *   - Exactly one request per worker. Zero retries. Zero redirects.
 *   - Expected result:
 *       * HTTP 200 SUCCESS: 1
 *       * HTTP 409 ALREADY_CLAIMED_IN_PERIOD: 49
 *       * HTTP 409 STOCK_EXHAUSTED: 0
 *       * HTTP 429 RATE_LIMITED: 0
 *       * HTTP 500: 0
 *       * Network errors: 0
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
const TOTAL_CONCURRENT_REQUESTS = 50;

const RESULTS_DIR = path.resolve(__dirname, "results");
const OUTPUT_FILE = path.join(RESULTS_DIR, "st-07-same-wallet-concurrent-claim.json");

if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// Security check: Target must strictly be local loopback
const parsedUrl = new URL(TARGET_URL);
const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
if (!allowedHosts.has(parsedUrl.hostname) || parsedUrl.protocol !== "http:") {
  console.error("FATAL: Target URL must strictly be HTTP on local loopback. Received:", TARGET_URL);
  process.exit(1);
}

// Load ST-07 synthetic session
const sessionPath = path.resolve(__dirname, "st07-test-session.json");
if (!fs.existsSync(sessionPath)) {
  console.error("FATAL: st07-test-session.json not found. Run fixture preparation first.");
  process.exit(1);
}

const session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
if (!session.userId || !session.cookie) {
  console.error("FATAL: Invalid session file structure in st07-test-session.json");
  process.exit(1);
}

console.log("==================================================================");
console.log("Elychimp — ST-07 Same-Wallet Concurrent Claim Benchmark");
console.log(`Target URL:            ${TARGET_URL}`);
console.log(`Drop ID:               ${DROP_ID}`);
console.log(`Period ID:             ${PERIOD_ID}`);
console.log(`Target User ID:        ${session.userId}`);
console.log(`Target Wallet:         ${session.address}`);
console.log(`Simultaneous Requests: ${TOTAL_CONCURRENT_REQUESTS} (exact same wallet/session)`);
console.log("Expected Distribution: 1 x 200 SUCCESS, 49 x 409 ALREADY_CLAIMED_IN_PERIOD");
console.log("Zero Tolerance:        0 x 429, 0 x STOCK_EXHAUSTED, 0 x 500, 0 x errors");
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
  alreadyClaimed: 0,   // 409 ALREADY_CLAIMED_IN_PERIOD
  stockExhausted: 0,   // 409 STOCK_EXHAUSTED / STOCK_RACE_EXHAUSTED
  rateLimited: 0,      // 429 RATE_LIMITED
  serverErrors: 0,     // 500 SERVER_ERROR
  otherStatuses: {},
  networkErrors: 0,
  latencies: [],
  perRequestResults: [],
};

let emergencyStopTriggered = false;
let emergencyStopReason = "";

function executeSingleRequest(workerIndex) {
  return new Promise((resolve) => {
    if (emergencyStopTriggered) {
      const record = {
        workerIndex,
        userId: session.userId,
        statusCode: 0,
        responseCode: "ABORTED_EMERGENCY_STOP",
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
          Cookie: session.cookie,
          "User-Agent": `ST07-Worker/${workerIndex}`,
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
            workerIndex,
            userId: session.userId,
            statusCode: status,
            responseCode: parsedBody?.error || (status === 200 ? "SUCCESS" : "UNKNOWN"),
            message: parsedBody?.message,
            claimId: parsedBody?.claimId,
            inventoryItemId: parsedBody?.inventoryItem?.id,
            edition: parsedBody?.inventoryItem?.edition,
            trait: parsedBody?.inventoryItem?.trait?.name,
            latency,
          };
          stats.perRequestResults.push(record);

          if (status === 200) {
            stats.successful++;
            if (stats.successful > 1) {
              emergencyStopTriggered = true;
              emergencyStopReason = `CRITICAL INVARIANT VIOLATION: More than 1 successful claim received (count=${stats.successful})`;
            }
          } else if (status === 409) {
            if (parsedBody?.error === "ALREADY_CLAIMED_IN_PERIOD") {
              stats.alreadyClaimed++;
            } else if (
              parsedBody?.error === "STOCK_EXHAUSTED" ||
              parsedBody?.error === "STOCK_RACE_EXHAUSTED"
            ) {
              stats.stockExhausted++;
            } else {
              stats.otherStatuses[status] = (stats.otherStatuses[status] || 0) + 1;
            }
          } else if (status === 429) {
            stats.rateLimited++;
          } else if (status >= 500) {
            stats.serverErrors++;
            emergencyStopTriggered = true;
            emergencyStopReason = `CRITICAL: Received HTTP ${status} for worker ${workerIndex}: ${body}`;
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
      stats.latencies.push(latency);

      const record = {
        workerIndex,
        userId: session.userId,
        statusCode: 0,
        responseCode: "NETWORK_ERROR",
        error: err.message,
        latency,
      };
      stats.perRequestResults.push(record);

      emergencyStopTriggered = true;
      emergencyStopReason = `CRITICAL NETWORK ERROR on worker ${workerIndex}: ${err.message}`;
      resolve(record);
    });

    req.on("timeout", () => {
      req.destroy(new Error("Request timed out after 10000ms"));
    });

    req.write(payloadBuffer);
    req.end();
  });
}

function calculatePercentiles(latencies) {
  if (latencies.length === 0) return { min: 0, avg: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const getP = (p) => {
    const idx = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1);
    return sorted[idx];
  };
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0],
    avg: Number((sum / sorted.length).toFixed(1)),
    p50: getP(50),
    p90: getP(90),
    p95: getP(95),
    p99: getP(99),
    max: sorted[sorted.length - 1],
  };
}

async function runBenchmark() {
  const benchStartTime = Date.now();

  console.log(`[START] Dispatching all ${TOTAL_CONCURRENT_REQUESTS} requests simultaneously at barrier...`);

  // Launch all 50 workers concurrently
  const workerPromises = [];
  for (let i = 1; i <= TOTAL_CONCURRENT_REQUESTS; i++) {
    workerPromises.push(executeSingleRequest(i));
  }

  // Await all workers
  await Promise.all(workerPromises);

  const totalDurationMs = Date.now() - benchStartTime;
  const throughputReqSec = Number(((stats.totalRequests / totalDurationMs) * 1000).toFixed(2));
  const latencyStats = calculatePercentiles(stats.latencies);

  agent.destroy();

  console.log("\n==================================================================");
  console.log("ST-07 Benchmark Execution Completed");
  console.log("==================================================================");
  console.log(`Execution Duration:     ${totalDurationMs} ms`);
  console.log(`Total Requests:         ${stats.totalRequests}`);
  console.log(`Throughput:             ${throughputReqSec} req/sec`);
  console.log(`HTTP 200 (SUCCESS):     ${stats.successful} (Expected: 1)`);
  console.log(`HTTP 409 (ALREADY_CLAIM): ${stats.alreadyClaimed} (Expected: 49)`);
  console.log(`HTTP 409 (STOCK_EXH):   ${stats.stockExhausted} (Expected: 0)`);
  console.log(`HTTP 429 (RATE_LIMIT):  ${stats.rateLimited} (Expected: 0)`);
  console.log(`HTTP 500 (SERVER_ERR):  ${stats.serverErrors} (Expected: 0)`);
  console.log(`Network Errors:         ${stats.networkErrors} (Expected: 0)`);
  console.log("\nLatency Distribution (ms):");
  console.log(`  Min:  ${latencyStats.min} ms`);
  console.log(`  P50:  ${latencyStats.p50} ms`);
  console.log(`  P90:  ${latencyStats.p90} ms`);
  console.log(`  P95:  ${latencyStats.p95} ms`);
  console.log(`  P99:  ${latencyStats.p99} ms`);
  console.log(`  Max:  ${latencyStats.max} ms`);
  console.log(`  Avg:  ${latencyStats.avg} ms`);
  console.log("==================================================================\n");

  const targetPass =
    stats.totalRequests === 50 &&
    stats.successful === 1 &&
    stats.alreadyClaimed === 49 &&
    stats.stockExhausted === 0 &&
    stats.rateLimited === 0 &&
    stats.serverErrors === 0 &&
    stats.networkErrors === 0 &&
    !emergencyStopTriggered;

  const resultData = {
    meta: {
      benchmark: "ST-07 Same-Wallet Concurrent Claim Test",
      targetUrl: TARGET_URL,
      dropId: DROP_ID,
      periodId: PERIOD_ID,
      userId: session.userId,
      walletAddress: session.address,
      timestamp: new Date().toISOString(),
      durationMs: totalDurationMs,
      throughputReqSec,
    },
    summary: {
      totalRequests: stats.totalRequests,
      successfulClaims: stats.successful,
      alreadyClaimed: stats.alreadyClaimed,
      stockExhausted: stats.stockExhausted,
      rateLimited: stats.rateLimited,
      serverErrors: stats.serverErrors,
      networkErrors: stats.networkErrors,
      otherStatuses: stats.otherStatuses,
      targetExpectedPass: targetPass,
      emergencyStopTriggered,
      emergencyStopReason: emergencyStopReason || null,
    },
    latency: latencyStats,
    requests: stats.perRequestResults,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(resultData, null, 2));
  console.log(`Benchmark result saved to: ${OUTPUT_FILE}`);

  if (!targetPass) {
    console.error(`\n[FAIL] ST-07 Benchmark Did Not Meet Target Expectations.`);
    if (emergencyStopTriggered) {
      console.error(`Reason: ${emergencyStopReason}`);
    }
    process.exit(1);
  } else {
    console.log(`\n[PASS] ST-07 HTTP Concurrency Benchmark Succeeded with Exact Distribution!`);
  }
}

runBenchmark().catch((err) => {
  console.error("FATAL benchmark execution error:", err);
  process.exit(1);
});
