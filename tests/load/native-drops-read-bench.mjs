/**
 * Elychimp — Native GET-Only Load Test Harness
 * File: tests/load/native-drops-read-bench.mjs
 *
 * Dedicated zero-dependency HTTP GET benchmark runner for local ST-01, ST-02, and ST-03.
 * Strictly uses built-in Node.js modules (http, url, fs, path, process).
 *
 * Security & Isolation Guarantees:
 *   1. Loopback-Only: Hostname is hardlocked to localhost, 127.0.0.1, or ::1.
 *   2. HTTP-Only: Protocols other than "http:" (including https) are strictly rejected.
 *   3. GET-Only: Method is hardcoded to HTTP GET. No mutation methods permitted.
 *   4. Endpoint-Restricted: Only /api/drops/current and /api/drops/user-status (opt-in).
 *   5. Non-Following Redirects: 3xx responses are tracked as redirect events, never followed.
 *   6. Credential-Free: Sends zero cookies, authorization headers, or session tokens.
 *   7. Database-Isolated: Zero direct database connections or imports.
 *   8. Concurrency-Bound: Strict VU worker pool with 2000ms request timeout.
 *   9. Zero URL Auth/Query: Rejects embedded user:pass and query strings in target URL.
 *  10. Path-Traversal Hardened: --out is strictly confined inside tests/load/results/.
 *
 * Supported Scenarios:
 *   - ST-01: 50 concurrent VUs, 60 seconds duration
 *   - ST-02: 100 concurrent VUs, 60 seconds duration
 *   - ST-03: 250 concurrent VUs, 120 seconds duration
 *   - smoke: 2 concurrent VUs, 3 seconds duration (dry-run validation only)
 *
 * Usage:
 *   node tests/load/native-drops-read-bench.mjs --help
 *   node tests/load/native-drops-read-bench.mjs --scenario st-01
 *   node tests/load/native-drops-read-bench.mjs --scenario st-02
 *   node tests/load/native-drops-read-bench.mjs --scenario st-03
 *   node tests/load/native-drops-read-bench.mjs --scenario smoke
 *   node tests/load/native-drops-read-bench.mjs --endpoint user-status --scenario st-01
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ALLOWED_RESULTS_DIR = path.resolve(__dirname, "results");

export const ALLOWED_LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

export const ALLOWED_ENDPOINTS = {
  current: "/api/drops/current",
  "user-status": "/api/drops/user-status",
};

export const SCENARIOS = {
  "st-01": {
    id: "ST-01",
    vus: 50,
    durationSec: 60,
    targetP95Ms: 300,
    targetErrorRatePct: 0.0,
    description: "Drops Page Load Baseline (50 VU / 60s)",
  },
  "st-02": {
    id: "ST-02",
    vus: 100,
    durationSec: 60,
    targetP95Ms: 500,
    targetErrorRatePct: 0.1,
    description: "Drops Page Load Medium (100 VU / 60s)",
  },
  "st-03": {
    id: "ST-03",
    vus: 250,
    durationSec: 120,
    targetP95Ms: 800,
    targetErrorRatePct: 0.1,
    description: "Drops Page Load Peak (250 VU / 120s)",
  },
  smoke: {
    id: "SMOKE",
    vus: 2,
    durationSec: 3,
    targetP95Ms: 1000,
    targetErrorRatePct: 0.0,
    description: "Smoke Dry-Run (2 VU / 3s)",
  },
};

export const REQUEST_TIMEOUT_MS = 2000;
export const MAX_RESPONSE_BODY_BYTES = 1024 * 1024; // 1 MB safety ceiling

/**
 * Validates that a hostname is strictly local loopback.
 */
export function isLoopbackHostname(hostname) {
  if (typeof hostname !== "string") return false;
  const clean = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return ALLOWED_LOOPBACK_HOSTS.has(clean) || clean === "::1";
}

/**
 * Validates target URL against strict security and isolation rules.
 * Throws informative error if URL attempts remote connection or unsupported configuration.
 */
export function validateTargetUrl(rawUrl, endpointKey = "current") {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new Error("[SECURITY_GUARD] Target URL must be a non-empty string.");
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (err) {
    throw new Error(`[SECURITY_GUARD] Malformed target URL: "${rawUrl}". Error: ${err.message}`);
  }

  // 1. Enforce HTTP protocol (reject https and other schemes)
  if (parsed.protocol !== "http:") {
    throw new Error(
      `[SECURITY_GUARD] Protocol "${parsed.protocol}" is rejected. Only "http:" is allowed to prevent remote or secure tunnel redirection.`,
    );
  }

  // 2. Reject embedded credentials (username/password)
  if (parsed.username || parsed.password) {
    throw new Error(
      "[SECURITY_GUARD] Embedded credentials (username/password) in target URL are strictly prohibited.",
    );
  }

  // 3. Enforce strict loopback hostname
  const hostOnly = parsed.hostname;
  if (!isLoopbackHostname(hostOnly)) {
    throw new Error(
      `[SECURITY_GUARD] Target host "${hostOnly}" is NOT an authorized loopback address. Refusing connection to prevent remote/production traffic.`,
    );
  }

  // 4. Port validation (default 3000 if empty, otherwise 1-65535)
  if (parsed.port) {
    const portNum = Number(parsed.port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      throw new Error(`[SECURITY_GUARD] Invalid port number "${parsed.port}".`);
    }
  }

  // 5. Endpoint path validation
  const expectedPath = ALLOWED_ENDPOINTS[endpointKey];
  if (!expectedPath) {
    throw new Error(
      `[SECURITY_GUARD] Unsupported endpoint key "${endpointKey}". Allowed: ${Object.keys(ALLOWED_ENDPOINTS).join(", ")}.`,
    );
  }

  if (parsed.pathname !== expectedPath) {
    throw new Error(
      `[SECURITY_GUARD] Pathname "${parsed.pathname}" does not match authorized endpoint "${expectedPath}". Execution aborted.`,
    );
  }

  // 6. Reject query strings entirely
  if (rawUrl.includes("?") || (parsed.search && parsed.search !== "")) {
    throw new Error(
      `[SECURITY_GUARD] Query strings in target URL are strictly prohibited. Received "${parsed.search || "?"}".`,
    );
  }

  // 7. Reject URL hash fragments
  if (parsed.hash && parsed.hash !== "") {
    throw new Error("[SECURITY_GUARD] URL hash fragments are not permitted.");
  }

  return parsed;
}

/**
 * Validates output path strictly within tests/load/results/.
 * Prevents path traversal, external paths, symlink escapes, and overwriting source/config files.
 */
export function validateOutputPath(rawOutPath, defaultScenarioKey = "st-01") {
  const targetPath = rawOutPath
    ? path.resolve(process.cwd(), rawOutPath)
    : path.join(ALLOWED_RESULTS_DIR, `${defaultScenarioKey.toLowerCase()}-report.json`);

  const normalizedTarget = path.normalize(targetPath);
  const normalizedResultsDir = path.normalize(ALLOWED_RESULTS_DIR);

  // Enforce boundary strictly inside ALLOWED_RESULTS_DIR
  const rel = path.relative(normalizedResultsDir, normalizedTarget);
  if (rel.startsWith("..") || path.isAbsolute(rel) || rel === "") {
    throw new Error(
      `[SECURITY_GUARD] Invalid output path: "${rawOutPath}". Artifacts may only be written strictly inside "${ALLOWED_RESULTS_DIR}". Path traversal and external paths are prohibited.`,
    );
  }

  // File extension restriction: strictly .json
  const parsed = path.parse(normalizedTarget);
  if (parsed.ext.toLowerCase() !== ".json") {
    throw new Error(
      `[SECURITY_GUARD] Output file must have ".json" extension. Disallowed file type: "${parsed.ext}".`,
    );
  }

  // Prevent writing to protected filenames or dangerous targets
  const baseLower = parsed.base.toLowerCase();
  if (
    baseLower.startsWith(".env") ||
    baseLower === "package.json" ||
    baseLower === "package-lock.json" ||
    baseLower.endsWith(".ts") ||
    baseLower.endsWith(".mjs") ||
    baseLower.endsWith(".js")
  ) {
    throw new Error(
      `[SECURITY_GUARD] Refusing to write to protected filename "${parsed.base}".`,
    );
  }

  // Symlink escape validation
  if (fs.existsSync(normalizedTarget)) {
    try {
      const lstat = fs.lstatSync(normalizedTarget);
      if (lstat.isSymbolicLink()) {
        const real = fs.realpathSync(normalizedTarget);
        const relReal = path.relative(normalizedResultsDir, real);
        if (relReal.startsWith("..") || path.isAbsolute(relReal)) {
          throw new Error(
            `[SECURITY_GUARD] Symbolic link "${normalizedTarget}" points outside results directory to "${real}". Execution aborted.`,
          );
        }
      }
    } catch (err) {
      if (err.message.includes("[SECURITY_GUARD]")) throw err;
    }
  }

  // Verify parent directories are not symlinks pointing outside
  let currentDir = path.dirname(normalizedTarget);
  while (currentDir && currentDir !== normalizedResultsDir && currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(currentDir)) {
      try {
        const lstat = fs.lstatSync(currentDir);
        if (lstat.isSymbolicLink()) {
          const real = fs.realpathSync(currentDir);
          const relReal = path.relative(normalizedResultsDir, real);
          if (relReal.startsWith("..") || path.isAbsolute(relReal)) {
            throw new Error(
              `[SECURITY_GUARD] Parent directory "${currentDir}" is a symlink pointing outside results directory to "${real}".`,
            );
          }
        }
      } catch (err) {
        if (err.message.includes("[SECURITY_GUARD]")) throw err;
      }
    }
    currentDir = path.dirname(currentDir);
  }

  return normalizedTarget;
}

/**
 * Calculates statistical percentiles from an array of numbers.
 */
export function calculatePercentiles(sortedNumbers) {
  if (!Array.isArray(sortedNumbers) || sortedNumbers.length === 0) {
    return { min: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0, avg: 0 };
  }

  const len = sortedNumbers.length;
  const min = sortedNumbers[0];
  const max = sortedNumbers[len - 1];

  const getP = (p) => {
    const index = Math.min(len - 1, Math.max(0, Math.floor(len * p)));
    return sortedNumbers[index];
  };

  const sum = sortedNumbers.reduce((acc, val) => acc + val, 0);
  const avg = Number((sum / len).toFixed(2));

  return {
    min,
    p50: getP(0.5),
    p90: getP(0.9),
    p95: getP(0.95),
    p99: getP(0.99),
    max,
    avg,
  };
}

/**
 * Evaluates benchmark criteria including duration, latency, errors, and interruption.
 * Interrupted runs or runs under 95% planned duration MUST NOT pass.
 */
export function evaluateCriteria({
  isInterrupted = false,
  actualDurationSec = 0,
  plannedDurationSec = 60,
  p95Ms = 0,
  targetP95Ms = 800,
  errorRatePct = 0,
  targetErrorRatePct = 0.1,
  networkErrors = 0,
}) {
  const minDurationThreshold = Number((plannedDurationSec * 0.95).toFixed(2));
  const durationSatisfied = actualDurationSec >= minDurationThreshold;
  const p95Satisfied = p95Ms <= targetP95Ms;
  const errorRateSatisfied = errorRatePct <= targetErrorRatePct;
  const networkErrorsSatisfied = networkErrors === 0;

  // An interrupted run MUST always be marked as failed/not passed
  const passed =
    !isInterrupted &&
    durationSatisfied &&
    p95Satisfied &&
    errorRateSatisfied &&
    networkErrorsSatisfied;

  return {
    interrupted: isInterrupted,
    durationSatisfied,
    minDurationRequiredSec: minDurationThreshold,
    actualDurationSec,
    p95Satisfied,
    errorRateSatisfied,
    networkErrorsSatisfied,
    passed,
  };
}

/**
 * Parses CLI arguments.
 */
export function parseCliArgs(argv = process.argv.slice(2)) {
  const options = {
    scenario: "st-01",
    endpoint: "current",
    baseUrl: "http://localhost:3000",
    out: null,
    help: false,
    vus: null,
    duration: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--scenario" || arg === "-s") {
      options.scenario = (argv[++i] || "").toLowerCase();
    } else if (arg.startsWith("--scenario=")) {
      options.scenario = arg.split("=")[1].toLowerCase();
    } else if (arg === "--endpoint" || arg === "-e") {
      options.endpoint = (argv[++i] || "").toLowerCase();
    } else if (arg.startsWith("--endpoint=")) {
      options.endpoint = arg.split("=")[1].toLowerCase();
    } else if (arg === "--url" || arg === "-u") {
      options.baseUrl = argv[++i] || options.baseUrl;
    } else if (arg.startsWith("--url=")) {
      options.baseUrl = arg.split("=")[1] || options.baseUrl;
    } else if (arg === "--out" || arg === "-o") {
      options.out = argv[++i] || null;
    } else if (arg.startsWith("--out=")) {
      options.out = arg.split("=")[1] || null;
    } else if (arg === "--vus") {
      options.vus = parseInt(argv[++i], 10);
    } else if (arg.startsWith("--vus=")) {
      options.vus = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--duration") {
      options.duration = parseInt(argv[++i], 10);
    } else if (arg.startsWith("--duration=")) {
      options.duration = parseInt(arg.split("=")[1], 10);
    }
  }

  return options;
}

/**
 * Prints help instructions.
 */
export function printHelp() {
  console.log(`
Elychimp — Native GET-Only Load Test Harness
==================================================================

Usage:
  node tests/load/native-drops-read-bench.mjs [options]

Options:
  --scenario, -s   Scenario to execute: st-01 | st-02 | st-03 | smoke (default: st-01)
  --endpoint, -e   Target endpoint: current | user-status (default: current)
  --url, -u        Base URL (default: http://localhost:3000, must be loopback)
  --out, -o        Output path for JSON summary artifact (must be inside tests/load/results/)
  --vus            Override Virtual Users count (e.g. 50, 100, 250)
  --duration       Override Duration in seconds (e.g. 60, 120)
  --help, -h       Display this help message

Scenarios:
  st-01            50 concurrent VUs for 60 seconds (Target P95 <= 300ms, Error 0%)
  st-02            100 concurrent VUs for 60 seconds (Target P95 <= 500ms, Error <= 0.1%)
  st-03            250 concurrent VUs for 120 seconds (Target P95 <= 800ms, Error <= 0.1%)
  smoke            2 concurrent VUs for 3 seconds (Fast dry-run test)

Safety Restrictions:
  - Protocol must be http:// (HTTPS and remote domains rejected).
  - Host must be loopback: localhost, 127.0.0.1, or ::1.
  - Method is strictly hardcoded to HTTP GET.
  - Zero cookies, auth headers, or query parameters allowed.
  - Output files are strictly confined to tests/load/results/.
==================================================================
`);
}

/**
 * Executes an individual HTTP GET request against the target URL.
 * Latency is measured from request initiation until response body is completely drained.
 */
export function executeSingleGet(urlObj, agent, workerId) {
  return new Promise((resolve) => {
    const reqStart = Date.now();
    let isSettled = false;

    const finalize = (result) => {
      if (isSettled) return;
      isSettled = true;
      resolve(result);
    };

    const req = http.request(
      urlObj,
      {
        method: "GET", // STRICTLY HARDCODED TO GET
        agent,
        headers: {
          Accept: "application/json",
          "User-Agent": `Elychimp-BenchWorker/${workerId}`,
          Connection: "keep-alive",
        },
      },
      (res) => {
        let bytesReceived = 0;
        let isRedirect = false;

        const statusCode = res.statusCode || 0;
        if (statusCode >= 300 && statusCode < 400) {
          isRedirect = true;
        }

        res.on("data", (chunk) => {
          bytesReceived += chunk.length;
          // Protect against memory exhaustion from abnormal huge responses
          if (bytesReceived > MAX_RESPONSE_BODY_BYTES) {
            res.destroy();
          }
        });

        res.on("end", () => {
          const latencyMs = Date.now() - reqStart;
          finalize({
            success: statusCode >= 200 && statusCode < 300,
            statusCode,
            latencyMs,
            isRedirect,
            bytesReceived,
            error: null,
          });
        });

        res.on("error", (err) => {
          const latencyMs = Date.now() - reqStart;
          finalize({
            success: false,
            statusCode: statusCode || 0,
            latencyMs,
            isRedirect: false,
            bytesReceived,
            error: err.message,
          });
        });
      },
    );

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`REQUEST_TIMEOUT_${REQUEST_TIMEOUT_MS}MS`));
    });

    req.on("error", (err) => {
      const latencyMs = Date.now() - reqStart;
      finalize({
        success: false,
        statusCode: 0,
        latencyMs,
        isRedirect: false,
        bytesReceived: 0,
        error: err.message,
      });
    });

    req.end();
  });
}

/**
 * Main benchmark orchestrator function.
 */
export async function runBenchmark(cliOptions = parseCliArgs()) {
  if (cliOptions.help) {
    printHelp();
    return { exitCode: 0 };
  }

  const endpointKey = cliOptions.endpoint || "current";
  const scenarioKey = cliOptions.scenario || "st-01";
  const scenarioDef = SCENARIOS[scenarioKey];

  if (!scenarioDef && (!cliOptions.vus || !cliOptions.duration)) {
    throw new Error(
      `[CONFIGURATION_ERROR] Unknown scenario "${scenarioKey}". Allowed: ${Object.keys(SCENARIOS).join(", ")}.`,
    );
  }

  const vus = cliOptions.vus || scenarioDef.vus;
  const durationSec = cliOptions.duration || scenarioDef.durationSec;
  const scenarioId = scenarioDef?.id || "CUSTOM";
  const targetP95Ms = scenarioDef?.targetP95Ms || 800;
  const targetErrorRatePct = scenarioDef?.targetErrorRatePct || 0.1;

  // 1. Build and validate target URL before starting any work
  const pathPart = ALLOWED_ENDPOINTS[endpointKey];
  const fullTargetString = `${cliOptions.baseUrl.replace(/\/$/, "")}${pathPart}`;
  const validatedUrl = validateTargetUrl(fullTargetString, endpointKey);

  // 2. Validate output path before spawning any workers or touching filesystem
  const validatedOutPath = validateOutputPath(cliOptions.out, scenarioKey);

  console.log("==================================================================");
  console.log("Elychimp — Native GET-Only Load Test Harness");
  console.log("==================================================================");
  console.log(`Scenario:           ${scenarioId} (${scenarioDef?.description || "Custom"})`);
  console.log(`Target URL:         ${validatedUrl.href}`);
  console.log(`HTTP Method:        GET (Hardcoded)`);
  console.log(`Virtual Users (VU): ${vus} concurrent workers`);
  console.log(`Duration:           ${durationSec} seconds`);
  console.log(`Timeout:            ${REQUEST_TIMEOUT_MS} ms per request`);
  console.log(`Loopback Security:  VERIFIED (${validatedUrl.hostname})`);
  console.log(`Auth Headers:       NONE (Anonymous read-only)`);
  console.log(`Output Artifact:    ${validatedOutPath}`);
  console.log("==================================================================\n");

  const agent = new http.Agent({
    keepAlive: true,
    maxSockets: vus * 2,
    maxTotalSockets: vus * 4,
    timeout: REQUEST_TIMEOUT_MS,
  });

  const stats = {
    totalRequests: 0,
    successful: 0,
    httpErrors: 0,
    networkErrors: 0,
    timeouts: 0,
    redirects: 0,
    statuses: {},
    latencies: [],
    startTime: Date.now(),
  };

  let isRunning = true;
  let isInterrupted = false;

  const stopTimer = setTimeout(() => {
    isRunning = false;
  }, durationSec * 1000);

  const sigintHandler = () => {
    if (!isInterrupted) {
      isInterrupted = true;
      isRunning = false;
      console.log("\n[INTERRUPT] Received SIGINT. Draining in-flight requests cleanly...");
    }
  };
  process.on("SIGINT", sigintHandler);

  async function worker(workerId) {
    while (isRunning) {
      stats.totalRequests++;
      const result = await executeSingleGet(validatedUrl, agent, workerId);

      stats.latencies.push(result.latencyMs);

      if (result.isRedirect) {
        stats.redirects++;
      }

      if (result.statusCode > 0) {
        stats.statuses[result.statusCode] = (stats.statuses[result.statusCode] || 0) + 1;
        if (result.statusCode >= 200 && result.statusCode < 300) {
          stats.successful++;
        } else if (result.statusCode >= 400) {
          stats.httpErrors++;
        }
      } else {
        stats.networkErrors++;
        stats.statuses["ERR"] = (stats.statuses["ERR"] || 0) + 1;
        if (result.error && result.error.includes("TIMEOUT")) {
          stats.timeouts++;
        }
      }
    }
  }

  console.log(`Spawning ${vus} concurrent client workers... Benchmark in progress.`);
  const workers = Array.from({ length: vus }, (_, i) => worker(i));
  await Promise.all(workers);

  clearTimeout(stopTimer);
  process.removeListener("SIGINT", sigintHandler);
  agent.destroy();

  const totalDurationMs = Date.now() - stats.startTime;
  const actualDurationSec = Number((totalDurationMs / 1000).toFixed(2));
  const rps = actualDurationSec > 0 ? Number((stats.totalRequests / actualDurationSec).toFixed(2)) : 0;

  stats.latencies.sort((a, b) => a - b);
  const percentiles = calculatePercentiles(stats.latencies);

  const totalErrors = stats.httpErrors + stats.networkErrors;
  const errorRatePct =
    stats.totalRequests > 0
      ? Number(((totalErrors / stats.totalRequests) * 100).toFixed(3))
      : 0.0;

  // Evaluate success criteria including duration threshold and interruption
  const criteriaCheck = evaluateCriteria({
    isInterrupted,
    actualDurationSec,
    plannedDurationSec: durationSec,
    p95Ms: percentiles.p95,
    targetP95Ms,
    errorRatePct,
    targetErrorRatePct,
    networkErrors: stats.networkErrors,
  });

  const executionStatus = isInterrupted
    ? "ABORTED (INTERRUPTED BY SIGINT)"
    : criteriaCheck.passed
      ? "PASSED"
      : "FAILED";

  console.log("\n=================== BENCHMARK EXECUTION SUMMARY ===================");
  console.log(`Execution Status:    ${executionStatus}`);
  console.log(`Scenario:            ${scenarioId}`);
  console.log(`Target:              ${validatedUrl.href}`);
  console.log(`Total Requests:      ${stats.totalRequests}`);
  console.log(`Successful (2xx):    ${stats.successful}`);
  console.log(`HTTP Errors (4xx/5xx): ${stats.httpErrors}`);
  console.log(`Network Errors:      ${stats.networkErrors}`);
  console.log(`Timeouts (>2000ms):  ${stats.timeouts}`);
  console.log(`Redirects (3xx):     ${stats.redirects}`);
  console.log(`Actual Duration:     ${actualDurationSec}s (Planned: ${durationSec}s)`);
  console.log(`Duration Valid:      ${criteriaCheck.durationSatisfied ? "YES (>= 95%)" : "NO (Under 95% threshold)"}`);
  console.log(`Throughput:          ${rps} req/sec`);
  console.log(`Error Rate:          ${errorRatePct}% (Target: <= ${targetErrorRatePct}%)`);
  console.log("-------------------------------------------------------------------");
  console.log("Status Code Distribution:");
  for (const [code, count] of Object.entries(stats.statuses)) {
    const pct = stats.totalRequests > 0 ? ((count / stats.totalRequests) * 100).toFixed(1) : "0.0";
    console.log(`  HTTP ${code}: ${count} (${pct}%)`);
  }
  console.log("-------------------------------------------------------------------");
  console.log("Latency Distribution (ms from request start to body drain):");
  console.log(`  p50 (Median):       ${percentiles.p50} ms`);
  console.log(`  p90:                ${percentiles.p90} ms`);
  console.log(`  p95:                ${percentiles.p95} ms (Target: <= ${targetP95Ms} ms)`);
  console.log(`  p99:                ${percentiles.p99} ms`);
  console.log(`  Max:                ${percentiles.max} ms`);
  console.log(`  Avg:                ${percentiles.avg} ms`);
  console.log("-------------------------------------------------------------------");
  console.log("Measurement Notice:");
  console.log("  * Latency is calculated from request initiation until body is completely received.");
  console.log("  * Throughput represents local single-machine client concurrency, not serverless capacity.");
  console.log("===================================================================\n");

  const reportData = {
    scenario: scenarioId,
    targetUrl: validatedUrl.href,
    endpointKey,
    vus,
    plannedDurationSec: durationSec,
    actualDurationSec,
    timestamp: new Date().toISOString(),
    metrics: {
      totalRequests: stats.totalRequests,
      successful: stats.successful,
      httpErrors: stats.httpErrors,
      networkErrors: stats.networkErrors,
      timeouts: stats.timeouts,
      redirects: stats.redirects,
      errorRatePct,
      rps,
      latencyMs: percentiles,
      statusCodes: stats.statuses,
    },
    targets: {
      targetP95Ms,
      targetErrorRatePct,
    },
    criteriaCheck,
    measurementDefinition:
      "Latency measured from request initiation until response body is completely received.",
    disclaimer:
      "Benchmark executed from single-machine local test client. Results reflect local loopback client performance.",
  };

  // Save report artifact to validated results path
  try {
    const outDir = path.dirname(validatedOutPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(validatedOutPath, JSON.stringify(reportData, null, 2), "utf8");
    console.log(`Saved benchmark artifact to: ${validatedOutPath}\n`);
  } catch (err) {
    console.warn(`[WARNING] Failed to write artifact to "${validatedOutPath}": ${err.message}`);
  }

  return {
    exitCode: criteriaCheck.passed ? 0 : 1,
    reportData,
  };
}

// Automatically invoke if executed directly via Node.js CLI
const isDirectRun =
  !process.env.VITEST &&
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  runBenchmark()
    .then(({ exitCode }) => {
      process.exit(exitCode);
    })
    .catch((err) => {
      console.error("\n[FATAL ERROR] Benchmark runner aborted:", err.message);
      process.exit(1);
    });
}
