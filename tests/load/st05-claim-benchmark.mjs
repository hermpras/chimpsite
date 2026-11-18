/**
 * ST-05 Master Execution: Concurrent Claims Benchmark Harness
 * File: tests/load/st05-claim-benchmark.mjs
 *
 * Dedicated zero-dependency HTTP POST benchmark harness for ST-05.
 * Strictly uses built-in Node.js modules (http, fs, path, process, url).
 *
 * Target:
 *   - 100 concurrent authenticated synthetic users.
 *   - POST /api/drops/claim
 *   - Ramp-up: 75 seconds (10s @ 5 VU, 15s @ 25 VU, 20s @ 50 VU, 30s @ 100 VU)
 *   - Benchmark window: 30 seconds @ 100 VU
 *   - Target P95: <= 1200 ms
 *   - Target HTTP 500: zero
 *   - No automatic retries, no redirects followed.
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
const OUTPUT_FILE = path.join(RESULTS_DIR, "st-05-claim-benchmark-run-01.json");

// Security check: Target must be strictly local loopback
const parsedUrl = new URL(TARGET_URL);
const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
if (!allowedHosts.has(parsedUrl.hostname) || parsedUrl.protocol !== "http:") {
  console.error("FATAL: Target URL must strictly be HTTP on local loopback. Received:", TARGET_URL);
  process.exit(1);
}

// Load 100 synthetic sessions
const sessionsPath = path.resolve(__dirname, "load-test-sessions.json");
if (!fs.existsSync(sessionsPath)) {
  console.error("FATAL: load-test-sessions.json not found. Run fixture preparation first.");
  process.exit(1);
}

const sessions = JSON.parse(fs.readFileSync(sessionsPath, "utf8"));
if (!Array.isArray(sessions) || sessions.length < 100) {
  console.error(`FATAL: Expected at least 100 sessions, found ${sessions?.length}`);
  process.exit(1);
}

const testSessions = sessions.slice(0, 100);

console.log("==================================================================");
console.log("Elychimp — ST-05 Concurrent Claims Benchmark");
console.log(`Target URL:         ${TARGET_URL}`);
console.log(`Drop ID:            ${DROP_ID}`);
console.log(`Period ID:          ${PERIOD_ID}`);
console.log(`Synthetic Users:    ${testSessions.length}`);
console.log("Planned Ramp-up:    75 seconds (10s@5, 15s@25, 20s@50, 30s@100)");
console.log("Benchmark Window:   30 seconds @ 100 concurrent users");
console.log("Target P95 Latency: <= 1200 ms");
console.log("Target HTTP 500:    0");
console.log("==================================================================\n");

const agent = new http.Agent({
  keepAlive: true,
  maxSockets: 250,
  maxTotalSockets: 500,
});

const payload = JSON.stringify({ dropId: DROP_ID, periodId: PERIOD_ID });
const payloadBuffer = Buffer.from(payload);

// Statistics tracking
const allStats = {
  totalRequests: 0,
  successful: 0,       // 200 OK
  alreadyClaimed: 0,   // 409 ALREADY_CLAIMED_IN_PERIOD
  stockExhausted: 0,   // 409 STOCK_EXHAUSTED / STOCK_RACE_EXHAUSTED
  rateLimited: 0,      // 429 RATE_LIMITED
  serverErrors: 0,     // 500 SERVER_ERROR
  otherStatuses: {},
  networkErrors: 0,
  latencies: [],
  benchmarkWindowLatencies: [],
  benchmarkWindowRequests: 0,
};

let emergencyStopTriggered = false;
let emergencyStopReason = "";

function executeSingleClaim(userSession, userIndex) {
  return new Promise((resolve) => {
    if (emergencyStopTriggered) {
      resolve({ status: "ABORTED", latency: 0 });
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
          "User-Agent": `ST05-Worker/${userIndex + 1}`,
          Connection: "keep-alive",
        },
        timeout: 5000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });

        res.on("end", () => {
          const latency = Date.now() - reqStart;
          const status = res.statusCode || 0;

          allStats.totalRequests++;
          allStats.latencies.push(latency);

          if (currentPhase === "BENCHMARK_WINDOW") {
            allStats.benchmarkWindowRequests++;
            allStats.benchmarkWindowLatencies.push(latency);
          }

          if (status === 200) {
            allStats.successful++;
          } else if (status === 409) {
            try {
              const parsed = JSON.parse(body);
              if (parsed.error === "ALREADY_CLAIMED_IN_PERIOD") {
                allStats.alreadyClaimed++;
              } else if (
                parsed.error === "STOCK_EXHAUSTED" ||
                parsed.error === "STOCK_RACE_EXHAUSTED"
              ) {
                allStats.stockExhausted++;
              } else {
                allStats.otherStatuses[status] = (allStats.otherStatuses[status] || 0) + 1;
              }
            } catch {
              allStats.alreadyClaimed++;
            }
          } else if (status === 429) {
            allStats.rateLimited++;
          } else if (status >= 500) {
            allStats.serverErrors++;
            emergencyStopTriggered = true;
            emergencyStopReason = `CRITICAL: Received HTTP ${status} from server: ${body}`;
          } else {
            allStats.otherStatuses[status] = (allStats.otherStatuses[status] || 0) + 1;
          }

          resolve({ status, latency });
        });
      },
    );

    req.on("error", (err) => {
      allStats.networkErrors++;
      allStats.totalRequests++;
      resolve({ status: "ERR", error: err.message });
    });

    req.on("timeout", () => {
      req.destroy();
      allStats.networkErrors++;
      allStats.totalRequests++;
      resolve({ status: "TIMEOUT" });
    });

    req.write(payloadBuffer);
    req.end();
  });
}

let currentPhase = "INIT";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runWorkerLoop(userIndex, shouldStop) {
  const session = testSessions[userIndex];
  while (!shouldStop() && !emergencyStopTriggered) {
    await executeSingleClaim(session, userIndex);
    // Pacing delay between consecutive requests per user: 150-250ms
    const jitter = 150 + Math.floor(Math.random() * 100);
    await sleep(jitter);
  }
}

async function runStage(stageName, vus, durationSec) {
  console.log(`[STAGE] Starting ${stageName}: ${vus} concurrent users for ${durationSec}s...`);
  const stageStart = Date.now();
  let stopStage = false;

  const workers = [];
  for (let i = 0; i < vus; i++) {
    workers.push(runWorkerLoop(i, () => stopStage));
  }

  // Periodic heartbeat every 5s
  const interval = setInterval(() => {
    const elapsed = ((Date.now() - stageStart) / 1000).toFixed(1);
    console.log(
      `  [${elapsed}s / ${durationSec}s] Requests: ${allStats.totalRequests} | 200 OK: ${allStats.successful} | 409s: ${allStats.alreadyClaimed + allStats.stockExhausted} | 500 Err: ${allStats.serverErrors}`,
    );
    if (emergencyStopTriggered) {
      console.error(`EMERGENCY STOP TRIGGERED: ${emergencyStopReason}`);
      stopStage = true;
    }
  }, 5000);

  await sleep(durationSec * 1000);
  stopStage = true;
  clearInterval(interval);

  await Promise.all(workers);
  console.log(`[STAGE] Completed ${stageName}.\n`);
}

function calculatePercentiles(latencies) {
  if (latencies.length === 0) {
    return { min: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0, avg: 0 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  return {
    min: sorted[0],
    p50: sorted[Math.floor(sorted.length * 0.50)],
    p90: sorted[Math.floor(sorted.length * 0.90)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
    max: sorted[sorted.length - 1],
    avg: Number((sum / sorted.length).toFixed(2)),
  };
}

async function main() {
  const overallStart = Date.now();

  // 1. Ramp-up phase: 75 seconds total
  currentPhase = "RAMP_UP";
  console.log(">>> BEGINNING RAMP-UP PHASE (75 seconds) <<<");
  await runStage("Ramp-1 (5 VU)", 5, 10);
  if (emergencyStopTriggered) process.exit(1);

  await runStage("Ramp-2 (25 VU)", 25, 15);
  if (emergencyStopTriggered) process.exit(1);

  await runStage("Ramp-3 (50 VU)", 50, 20);
  if (emergencyStopTriggered) process.exit(1);

  await runStage("Ramp-4 (100 VU)", 100, 30);
  if (emergencyStopTriggered) process.exit(1);

  // 2. Benchmark window phase: 30 seconds @ 100 concurrent users
  currentPhase = "BENCHMARK_WINDOW";
  console.log(">>> BEGINNING BENCHMARK WINDOW (30 seconds @ 100 concurrent users) <<<");
  const windowStart = Date.now();
  await runStage("ST-05 Peak Benchmark (100 VU)", 100, 30);
  const windowDurationSec = (Date.now() - windowStart) / 1000;

  const totalDurationSec = (Date.now() - overallStart) / 1000;

  // Calculate metrics
  const totalPercentiles = calculatePercentiles(allStats.latencies);
  const windowPercentiles = calculatePercentiles(allStats.benchmarkWindowLatencies);
  const throughput = Number((allStats.totalRequests / totalDurationSec).toFixed(2));
  const windowThroughput = Number((allStats.benchmarkWindowRequests / windowDurationSec).toFixed(2));

  console.log("==================================================================");
  console.log("ST-05 BENCHMARK RESULTS SUMMARY");
  console.log("==================================================================");
  console.log(`Total Duration:           ${totalDurationSec.toFixed(2)}s`);
  console.log(`Total Requests:           ${allStats.totalRequests}`);
  console.log(`Overall Throughput:       ${throughput} req/sec`);
  console.log(`Benchmark Window Req:     ${allStats.benchmarkWindowRequests} (${windowThroughput} req/sec)`);
  console.log("------------------------------------------------------------------");
  console.log("HTTP Status Code Breakdown:");
  console.log(`  HTTP 200 (Success):     ${allStats.successful}`);
  console.log(`  HTTP 409 (Already Clm): ${allStats.alreadyClaimed}`);
  console.log(`  HTTP 409 (Stock Exh):   ${allStats.stockExhausted}`);
  console.log(`  HTTP 429 (Rate Limit):  ${allStats.rateLimited}`);
  console.log(`  HTTP 500 (Server Err):  ${allStats.serverErrors}`);
  for (const [st, cnt] of Object.entries(allStats.otherStatuses)) {
    console.log(`  HTTP ${st}:              ${cnt}`);
  }
  console.log(`  Network / Timeouts:     ${allStats.networkErrors}`);
  console.log("------------------------------------------------------------------");
  console.log("Benchmark Window Latencies (100 Concurrent Users):");
  console.log(`  Min:                    ${windowPercentiles.min} ms`);
  console.log(`  P50 (Median):           ${windowPercentiles.p50} ms`);
  console.log(`  P90:                    ${windowPercentiles.p90} ms`);
  console.log(`  P95 (Target <= 1200ms): ${windowPercentiles.p95} ms`);
  console.log(`  P99:                    ${windowPercentiles.p99} ms`);
  console.log(`  Max:                    ${windowPercentiles.max} ms`);
  console.log(`  Avg:                    ${windowPercentiles.avg} ms`);
  console.log("==================================================================");

  const p95Pass = windowPercentiles.p95 <= 1200;
  const zero500Pass = allStats.serverErrors === 0;
  const overallPass = p95Pass && zero500Pass;

  console.log(`P95 Threshold Target (<= 1200ms): ${p95Pass ? "PASSED" : "FAILED"} (${windowPercentiles.p95} ms)`);
  console.log(`Zero HTTP 500 Errors:             ${zero500Pass ? "PASSED" : "FAILED"} (${allStats.serverErrors})`);
  console.log(`ST-05 Concurrency Target Result:  ${overallPass ? "PASSED" : "FAILED"}\n`);

  // Write artifact
  const resultArtifact = {
    benchmark: "ST-05",
    scenario: "CONCURRENT_CLAIMS",
    timestamp: new Date().toISOString(),
    configuration: {
      targetUrl: TARGET_URL,
      dropId: DROP_ID,
      periodId: PERIOD_ID,
      totalUsers: testSessions.length,
      rampUpDurationSec: 75,
      benchmarkWindowSec: 30,
      targetP95Ms: 1200,
    },
    metrics: {
      totalDurationSec,
      totalRequests: allStats.totalRequests,
      overallThroughputRps: throughput,
      benchmarkWindow: {
        durationSec: windowDurationSec,
        requests: allStats.benchmarkWindowRequests,
        throughputRps: windowThroughput,
        latenciesMs: windowPercentiles,
      },
      overallLatenciesMs: totalPercentiles,
      statusCodes: {
        "200": allStats.successful,
        "409_ALREADY_CLAIMED": allStats.alreadyClaimed,
        "409_STOCK_EXHAUSTED": allStats.stockExhausted,
        "429": allStats.rateLimited,
        "500": allStats.serverErrors,
        ...allStats.otherStatuses,
      },
      networkErrors: allStats.networkErrors,
    },
    verification: {
      p95Satisfied: p95Pass,
      zero500Satisfied: zero500Pass,
      passed: overallPass,
    },
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(resultArtifact, null, 2), "utf8");
  console.log(`Benchmark artifact written to: ${OUTPUT_FILE}`);

  if (!overallPass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Benchmark execution failed:", err);
  process.exit(1);
});
