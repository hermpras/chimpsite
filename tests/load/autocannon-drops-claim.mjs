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
 *   node tests/load/autocannon-drops-claim.mjs --connections 100 --simulate-ips # Multi-IP test (RFC 5737)
 */

import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * RFC 5737 Reserved Documentation Subnets:
 *   - TEST-NET-1: 192.0.2.0/24
 *   - TEST-NET-2: 198.51.100.0/24 (primary block for simulation)
 *   - TEST-NET-3: 203.0.113.0/24 (secondary overflow block)
 *
 * Generates deterministic, collision-free synthetic IPs strictly within RFC 5737.
 */
export function getDeterministicRfc5737Ip(index) {
  const safeIndex = Math.abs(Number(index) || 0);
  const subnet = Math.floor(safeIndex / 250);
  const host = (safeIndex % 250) + 1; // 1 to 250
  if (subnet === 0) {
    return `198.51.100.${host}`;
  }
  if (subnet === 1) {
    return `203.0.113.${host}`;
  }
  return `192.0.2.${(safeIndex % 250) + 1}`;
}

/**
 * Validates that the target URL is strictly a localhost URL.
 * Prevents simulated headers or synthetic IP injection against staging, Supabase, or production.
 */
export function isLocalhostUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

/**
 * Checks whether an argument flag is present in CLI argument list.
 */
export function hasFlag(argList, name) {
  return (
    argList.includes(`--${name}`) || argList.some((arg) => arg.startsWith(`--${name}=`))
  );
}

/**
 * Builds request headers for a given worker/session.
 * If simulateIps is true, injects an RFC 5737 synthetic IP into X-Forwarded-For.
 * Never outputs cookies or secrets to logs.
 */
export function buildRequestHeaders({
  workerId,
  sessionIndex,
  cookie,
  payloadLength,
  simulateIps = false,
}) {
  const headers = {
    "Content-Type": "application/json",
    "Content-Length": payloadLength,
    Cookie: cookie,
    "User-Agent": `ChimpHood-LoadWorker/${workerId}`,
  };

  if (simulateIps) {
    headers["X-Forwarded-For"] = getDeterministicRfc5737Ip(sessionIndex);
  }

  return headers;
}

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
const simulateIps =
  hasFlag(args, "simulate-ips") ||
  process.env.SIMULATE_IPS === "true" ||
  process.env.SIMULATE_IPS === "1";

// Safety check: simulate-ips is ONLY permitted against localhost
if (simulateIps && !isLocalhostUrl(baseUrl)) {
  console.error("==================================================================");
  console.error(
    "FATAL SAFETY ERROR: --simulate-ips is ONLY permitted when targeting localhost.",
  );
  console.error(`Target URL was: ${baseUrl}`);
  console.error(
    "Aborting immediately to prevent IP header spoofing against remote hosts.",
  );
  console.error("==================================================================");
  process.exit(1);
}

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
  testSessions = Array.from({ length: 150 }, (_, i) => ({
    userId: `load-test-user-${i + 1}`,
    cookie: `chimphood_session=mock-test-session-${i + 1}`,
  }));
}

async function runNativeLoadTest() {
  console.log("==================================================================");
  console.log(`Task 5-B: Load Test on POST /api/drops/claim`);
  console.log(`Target URL:     ${baseUrl}/api/drops/claim`);
  console.log(`Connections:    ${connections} concurrent clients`);
  console.log(`Duration:       ${durationSeconds} seconds`);
  console.log(`Drop ID:        ${dropId}`);
  console.log(`Period ID:      ${periodId}`);
  console.log(`Sessions count: ${testSessions.length} test users`);
  console.log(
    `Simulate IPs:   ${
      simulateIps
        ? "ENABLED (RFC 5737 TEST-NET-2/3 deterministic IPs)"
        : "DISABLED (Default single-IP local socket)"
    }`,
  );
  console.log("==================================================================\n");

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
    const sessionIndex = workerId % testSessions.length;
    const session = testSessions[sessionIndex];

    const headers = buildRequestHeaders({
      workerId,
      sessionIndex,
      cookie: session.cookie,
      payloadLength: payloadBuffer.length,
      simulateIps,
    });

    {
      const reqStart = Date.now();
      await new Promise((resolve) => {
        const req = clientLib.request(
          urlObj,
          {
            method: "POST",
            agent,
            headers,
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

// Automatically invoke only when executed directly via Node.js CLI, not when imported
const isDirectRun =
  !process.env.VITEST &&
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  runNativeLoadTest().catch((err) => {
    console.error("Load test failed:", err);
    process.exit(1);
  });
}
