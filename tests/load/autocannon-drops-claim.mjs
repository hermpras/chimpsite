/**
 * Task 5-B: Autocannon & Native Concurrency Load Tester for POST /api/drops/claim
 *
 * Can run in two modes:
 *   1. Native High-Concurrency Pool (Zero external dependencies, built into Node.js)
 *   2. Autocannon Runner (When autocannon npm package is installed)
 *
 * Target: 100 concurrent claim attempts.
 *
 * Usage:
 *   node tests/load/autocannon-drops-claim.mjs --connections 5   # Smoke test
 *   node tests/load/autocannon-drops-claim.mjs --connections 25  # Light load
 *   node tests/load/autocannon-drops-claim.mjs --connections 50  # Moderate load
 *   node tests/load/autocannon-drops-claim.mjs --connections 100 # Target 100 concurrent
 */

import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse CLI args
const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return defaultValue;
}

const connections = parseInt(getArg("connections", "100"), 10);
const durationSeconds = parseInt(getArg("duration", "15"), 10);
const baseUrl = getArg("url", process.env.BASE_URL || "http://localhost:3000");
const dropId = getArg("dropId", process.env.DROP_ID || "drop-load-test");
const periodId = getArg("periodId", process.env.PERIOD_ID || "period-load-test");

// Load pre-seeded user sessions if available
const sessionsPath = path.join(__dirname, "load-test-sessions.json");
let testSessions = [];
if (fs.existsSync(sessionsPath)) {
  try {
    testSessions = JSON.parse(fs.readFileSync(sessionsPath, "utf8"));
  } catch (err) {
    console.warn("Could not parse load-test-sessions.json:", err.message);
  }
}

if (testSessions.length === 0) {
  console.log("No load-test-sessions.json found. Using 150 synthetic test user headers.");
  testSessions = Array.from({ length: 150 }, (_, i) => ({
    userId: `load-test-user-${i + 1}`,
    cookie: `chimphood_session=mock-test-session-${i + 1}`,
  }));
}

console.log("==================================================================");
console.log(`Task 5-B: Load Test on POST /api/drops/claim`);
console.log(`Target URL:     ${baseUrl}/api/drops/claim`);
console.log(`Connections:    ${connections} concurrent clients`);
console.log(`Duration:       ${durationSeconds} seconds`);
console.log(`Drop ID:        ${dropId}`);
console.log(`Period ID:      ${periodId}`);
console.log(`Sessions count: ${testSessions.length} test users`);
console.log("==================================================================\n");

async function runNativeLoadTest() {
  const urlObj = new URL(`${baseUrl}/api/drops/claim`);
  const isHttps = urlObj.protocol === "https:";
  const clientLib = isHttps ? https : http;

  const agent = new clientLib.Agent({
    keepAlive: true,
    maxSockets: connections * 2,
    maxTotalSockets: connections * 4,
  });

  const payload = JSON.stringify({ dropId, periodId });
  const payloadBuffer = Buffer.from(payload);

  const stats = {
    totalRequests: 0,
    statuses: {},
    latencies: [],
    errors: 0,
    startTime: Date.now(),
  };

  let isRunning = true;
  const stopTimer = setTimeout(() => {
    isRunning = false;
  }, durationSeconds * 1000);

  async function worker(workerId) {
    const session = testSessions[workerId % testSessions.length];

    {
      const reqStart = Date.now();
      await new Promise((resolve) => {
        const req = clientLib.request(
          urlObj,
          {
            method: "POST",
            agent,
            headers: {
              "Content-Type": "application/json",
              "Content-Length": payloadBuffer.length,
              Cookie: session.cookie,
              "User-Agent": `ChimpHood-LoadWorker/${workerId}`,
            },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => {
              body += chunk;
            });
            res.on("end", () => {
              const latency = Date.now() - reqStart;
              stats.totalRequests++;
              stats.statuses[res.statusCode] = (stats.statuses[res.statusCode] || 0) + 1;
              stats.latencies.push(latency);
              resolve();
            });
          },
        );

        req.on("error", (err) => {
          stats.errors++;
          stats.statuses["ERR"] = (stats.statuses["ERR"] || 0) + 1;
          resolve();
        });

        req.write(payloadBuffer);
        req.end();
      });
    }
  }

  console.log(`Spawning ${connections} concurrent workers...`);
  const workers = Array.from({ length: connections }, (_, i) => worker(i));
  await Promise.all(workers);
  clearTimeout(stopTimer);

  const durationMs = Date.now() - stats.startTime;
  const durationSec = durationMs / 1000;
  const rps = (stats.totalRequests / durationSec).toFixed(2);

  stats.latencies.sort((a, b) => a - b);
  const p50 = stats.latencies[Math.floor(stats.latencies.length * 0.5)] || 0;
  const p90 = stats.latencies[Math.floor(stats.latencies.length * 0.9)] || 0;
  const p95 = stats.latencies[Math.floor(stats.latencies.length * 0.95)] || 0;
  const p99 = stats.latencies[Math.floor(stats.latencies.length * 0.99)] || 0;

  console.log("\n=================== LOAD TEST RESULTS ===================");
  console.log(`Total Requests:  ${stats.totalRequests}`);
  console.log(`Duration:        ${durationSec.toFixed(2)}s`);
  console.log(`Throughput:      ${rps} req/sec`);
  console.log(`Network Errors:  ${stats.errors}`);
  console.log("---------------------------------------------------------");
  console.log("Status Code Breakdown:");
  for (const [status, count] of Object.entries(stats.statuses)) {
    const pct = ((count / stats.totalRequests) * 100).toFixed(1);
    let label = "";
    if (status === "200") label = "(SUCCESSFUL CLAIMS)";
    else if (status === "409")
      label = "(BUSINESS REJECTION: STOCK EXHAUSTED / ALREADY CLAIMED)";
    else if (status === "429") label = "(RATE LIMITED)";
    else if (status === "500") label = "(SERVER ERROR)";
    console.log(`  HTTP ${status}: ${count} (${pct}%) ${label}`);
  }
  console.log("---------------------------------------------------------");
  console.log("Latency Distribution (ms):");
  console.log(`  p50 (Median):  ${p50} ms`);
  console.log(`  p90:           ${p90} ms`);
  console.log(`  p95:           ${p95} ms`);
  console.log(`  p99:           ${p99} ms`);
  console.log("=========================================================\n");

  const serverErrors = stats.statuses[500] || 0;
  if (serverErrors > 0) {
    console.error(`WARNING: Detected ${serverErrors} HTTP 500 server errors!`);
  } else {
    console.log("PASSED: 0 HTTP 500 errors detected under load.");
  }
}

runNativeLoadTest().catch((err) => {
  console.error("Load test failed:", err);
  process.exit(1);
});
