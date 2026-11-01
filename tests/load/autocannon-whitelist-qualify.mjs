/**
 * Backend Roadmap Item 3: HTTP Load Test for POST /api/whitelist/qualify
 *
 * Scenarios supported:
 *   1. Multi-User Concurrency (50 or 100 distinct users concurrently evaluating qualification)
 *   2. Duplicate Request Contention (1 user spamming 50-100 concurrent qualification requests)
 *   3. Last-Slot Contention (many users fighting for scarce remaining slots)
 *
 * Usage:
 *   node tests/load/autocannon-whitelist-qualify.mjs --connections 5   # Smoke test
 *   node tests/load/autocannon-whitelist-qualify.mjs --connections 50  # 50 concurrent requests
 *   node tests/load/autocannon-whitelist-qualify.mjs --connections 100 # 100 concurrent requests
 *   node tests/load/autocannon-whitelist-qualify.mjs --scenario duplicate --connections 50 # Single-user spam
 *   node tests/load/autocannon-whitelist-qualify.mjs --connections 100 --simulate-ips # Multi-IP test
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
 *   - TEST-NET-2: 198.51.100.0/24
 *   - TEST-NET-3: 203.0.113.0/24
 */
export function getDeterministicRfc5737Ip(index) {
  const safeIndex = Math.abs(Number(index) || 0);
  const subnet = Math.floor(safeIndex / 250);
  const host = (safeIndex % 250) + 1;
  if (subnet === 0) return `198.51.100.${host}`;
  if (subnet === 1) return `203.0.113.${host}`;
  return `192.0.2.${host}`;
}

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

export function hasFlag(argList, name) {
  return (
    argList.includes(`--${name}`) || argList.some((arg) => arg.startsWith(`--${name}=`))
  );
}

export function getArg(argList, name, defaultValue) {
  const idx = argList.indexOf(`--${name}`);
  if (idx !== -1 && argList[idx + 1]) {
    return argList[idx + 1];
  }
  const prefix = `--${name}=`;
  const found = argList.find((arg) => arg.startsWith(prefix));
  if (found) {
    return found.slice(prefix.length);
  }
  return defaultValue;
}

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
    "User-Agent": `ChimpHood-WhitelistLoadWorker/${workerId}`,
  };

  if (simulateIps) {
    headers["X-Forwarded-For"] = getDeterministicRfc5737Ip(sessionIndex);
  }

  return headers;
}

export async function runWhitelistLoadTest(customConfig = {}) {
  const args = process.argv.slice(2);

  const connections = parseInt(
    customConfig.connections ?? getArg(args, "connections", "50"),
    10,
  );
  const requestsPerWorker = parseInt(
    customConfig.requestsPerWorker ?? getArg(args, "requestsPerWorker", "1"),
    10,
  );
  const baseUrl =
    customConfig.baseUrl ?? getArg(args, "url", process.env.BASE_URL || "http://localhost:3000");
  const programId =
    customConfig.programId ?? getArg(args, "programId", process.env.PROGRAM_ID || "program-load-test");
  const scenario =
    customConfig.scenario ?? getArg(args, "scenario", process.env.SCENARIO || "multi-user");
  const simulateIps =
    customConfig.simulateIps ?? (hasFlag(args, "simulate-ips") || process.env.SIMULATE_IPS === "true");

  if (simulateIps && !isLocalhostUrl(baseUrl)) {
    throw new Error(
      `FATAL SAFETY ERROR: --simulate-ips is ONLY permitted when targeting localhost. Target was: ${baseUrl}`,
    );
  }

  // Load test sessions
  const sessionsPath =
    customConfig.sessionsPath ??
    path.join(__dirname, "whitelist-test-sessions.json");

  let testSessions = [];
  if (fs.existsSync(sessionsPath)) {
    try {
      testSessions = JSON.parse(fs.readFileSync(sessionsPath, "utf8"));
    } catch (err) {
      console.warn("Could not parse sessions JSON:", err.message);
    }
  }

  if (testSessions.length === 0) {
    // Generate fallback mock sessions if not seeded
    testSessions = Array.from({ length: 150 }, (_, i) => ({
      userId: `usr-wl-load-${String(i + 1).padStart(3, "0")}`,
      cookie: `chimphood_session=mock-test-session-${i + 1}`,
    }));
  }

  console.log("==================================================================");
  console.log(`HTTP Load Test: POST /api/whitelist/qualify`);
  console.log(`Target URL:     ${baseUrl}/api/whitelist/qualify`);
  console.log(`Scenario:       ${scenario.toUpperCase()}`);
  console.log(`Connections:    ${connections} concurrent clients`);
  console.log(`Requests/Worker:${requestsPerWorker}`);
  console.log(`Total Requests: ${connections * requestsPerWorker}`);
  console.log(`Program ID:     ${programId}`);
  console.log(`Sessions count: ${testSessions.length} available sessions`);
  console.log(
    `Simulate IPs:   ${
      simulateIps
        ? "ENABLED (RFC 5737 TEST-NET-2/3 deterministic IPs)"
        : "DISABLED"
    }`,
  );
  console.log("==================================================================\n");

  const urlObj = new URL(`${baseUrl}/api/whitelist/qualify`);
  const isHttps = urlObj.protocol === "https:";
  const clientLib = isHttps ? https : http;

  const agent = new clientLib.Agent({
    keepAlive: true,
    maxSockets: connections * 2,
    maxTotalSockets: connections * 4,
  });

  const payload = JSON.stringify({ programId });
  const payloadBuffer = Buffer.from(payload);

  const stats = {
    totalRequests: 0,
    statuses: {},
    phases: {
      SLOT_ALLOCATED: 0,
      IN_QUEUE: 0,
      QUALIFIED: 0,
      OTHER: 0,
    },
    latencies: [],
    errors: 0,
    startTime: Date.now(),
  };

  async function worker(workerId) {
    // In duplicate scenario, all workers use the same session (session index 0)
    // In multi-user / contention scenarios, each worker uses their own distinct session
    const sessionIndex = scenario === "duplicate" ? 0 : workerId % testSessions.length;
    const session = testSessions[sessionIndex];

    const headers = buildRequestHeaders({
      workerId,
      sessionIndex,
      cookie: session.cookie,
      payloadLength: payloadBuffer.length,
      simulateIps,
    });

    for (let r = 0; r < requestsPerWorker; r++) {
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

              if (res.statusCode === 200) {
                try {
                  const parsed = JSON.parse(body);
                  const phase = parsed.result?.phase;
                  if (phase && stats.phases[phase] !== undefined) {
                    stats.phases[phase]++;
                  } else {
                    stats.phases.OTHER++;
                  }
                } catch {
                  stats.phases.OTHER++;
                }
              }
              resolve();
            });
          },
        );

        req.on("error", () => {
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
  console.log("HTTP Status Code Breakdown:");
  for (const [status, count] of Object.entries(stats.statuses)) {
    const pct = ((count / stats.totalRequests) * 100).toFixed(1);
    let label = "";
    if (status === "200") label = "(SUCCESSFUL EVALUATION)";
    else if (status === "429") label = "(RATE LIMITED)";
    else if (status === "409") label = "(CONCURRENCY COLLISION RETRYABLE)";
    else if (status === "500") label = "(SERVER ERROR)";
    console.log(`  HTTP ${status}: ${count} (${pct}%) ${label}`);
  }
  console.log("---------------------------------------------------------");
  console.log("Qualification Phase Breakdown (HTTP 200):");
  console.log(`  SLOT_ALLOCATED: ${stats.phases.SLOT_ALLOCATED}`);
  console.log(`  IN_QUEUE:       ${stats.phases.IN_QUEUE}`);
  console.log(`  QUALIFIED:      ${stats.phases.QUALIFIED}`);
  console.log(`  OTHER:          ${stats.phases.OTHER}`);
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

  return {
    stats,
    durationSec,
    rps,
    p50,
    p90,
    p95,
    p99,
    serverErrors,
  };
}

const isDirectRun =
  !process.env.VITEST &&
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  runWhitelistLoadTest().catch((err) => {
    console.error("Whitelist load test failed:", err);
    process.exit(1);
  });
}
