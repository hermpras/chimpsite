import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

/**
 * Task 5-B: k6 Load Test for POST /api/drops/claim
 * Target: 100 concurrent claims without stock over-allocation or race condition leaks.
 *
 * Usage:
 *   1. Smoke test:
 *      k6 run tests/load/k6-drops-claim.js -e SCENARIO=smoke
 *   2. Gradual ramp-up:
 *      k6 run tests/load/k6-drops-claim.js -e SCENARIO=ramp
 *   3. 100 Concurrent claims target:
 *      k6 run tests/load/k6-drops-claim.js -e SCENARIO=target_100
 */

// Custom metrics
const claimsSuccessful = new Counter("claims_successful");
const claimsStockExhausted = new Counter("claims_stock_exhausted");
const claimsAlreadyClaimed = new Counter("claims_already_claimed");
const claimsRateLimited = new Counter("claims_rate_limited");
const claimsServerError = new Counter("claims_server_error");
const claimDuration = new Trend("claim_request_duration_ms");

// Load pre-seeded user sessions if available, or fall back to mock cookies
let testSessions = [];
try {
  testSessions = JSON.parse(open("./load-test-sessions.json"));
} catch (e) {
  // If no pre-seeded session file exists, generate synthetic cookie templates
  testSessions = Array.from({ length: 150 }, (_, i) => ({
    userId: `load-test-user-${i + 1}`,
    cookie: `chimphood_session=mock-test-session-${i + 1}`,
  }));
}

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const DROP_ID = __ENV.DROP_ID || "drop-load-test";
const PERIOD_ID = __ENV.PERIOD_ID || "period-load-test";
const SCENARIO = __ENV.SCENARIO || "ramp";

function getScenarios() {
  if (SCENARIO === "smoke") {
    return {
      smoke: {
        executor: "constant-vus",
        vus: 5,
        duration: "10s",
      },
    };
  }

  if (SCENARIO === "target_100") {
    return {
      peak_100: {
        executor: "constant-vus",
        vus: 100,
        duration: "30s",
      },
    };
  }

  // Default: Gradual ramp-up (5 -> 25 -> 50 -> 100 VUs)
  return {
    gradual_ramp: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "10s", target: 5 }, // Smoke
        { duration: "15s", target: 25 }, // Light load
        { duration: "20s", target: 50 }, // Moderate load
        { duration: "30s", target: 100 }, // Target: 100 concurrent claims
        { duration: "10s", target: 0 }, // Cool down
      ],
    },
  };
}

export const options = {
  scenarios: getScenarios(),
  thresholds: {
    // 500 server errors should be less than 1%
    http_req_failed: ["rate<0.01"],
    // 95% of requests should complete within 1000ms under load
    http_req_duration: ["p(95)<1000"],
    claims_server_error: ["count==0"],
  },
};

export default function k6DropsClaim() {
  // Map virtual user (VU) to distinct test user session
  const vuIndex = (__VU - 1) % testSessions.length;
  const session = testSessions[vuIndex];

  const url = `${BASE_URL}/api/drops/claim`;
  const payload = JSON.stringify({
    dropId: DROP_ID,
    periodId: PERIOD_ID,
  });

  const params = {
    headers: {
      "Content-Type": "application/json",
      Cookie: session.cookie,
      "User-Agent": `ChimpHoodLoadTest-k6/VU-${__VU}`,
    },
    // Don't mark 4xx business responses (409, 429) as failed requests in k6 stats
    expectedStatusCodes: [200, 400, 401, 403, 409, 410, 429],
  };

  const start = Date.now();
  const res = http.post(url, payload, params);
  claimDuration.add(Date.now() - start);

  const status = res.status;

  if (status === 200) {
    claimsSuccessful.add(1);
    check(res, {
      "claim succeeded with 200": (r) => r.status === 200,
      "has claimId and inventoryItem": (r) => {
        try {
          const body = JSON.parse(r.body);
          return Boolean(body.success && body.claimId && body.inventoryItem);
        } catch {
          return false;
        }
      },
    });
  } else if (status === 409) {
    let errorCode = "UNKNOWN_409";
    try {
      errorCode = JSON.parse(res.body).error;
    } catch {}

    if (errorCode === "STOCK_EXHAUSTED" || errorCode === "STOCK_RACE_EXHAUSTED") {
      claimsStockExhausted.add(1);
    } else if (errorCode === "ALREADY_CLAIMED_IN_PERIOD") {
      claimsAlreadyClaimed.add(1);
    }
  } else if (status === 429) {
    claimsRateLimited.add(1);
  } else if (status >= 500) {
    claimsServerError.add(1);
  }

  // Small delay between requests per VU (100ms - 300ms)
  sleep(0.1 + Math.random() * 0.2);
}
