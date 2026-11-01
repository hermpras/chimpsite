import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

/**
 * Backend Roadmap Item 3: k6 Load Test for POST /api/whitelist/qualify
 * Target: 100 concurrent requests without over-allocation or double slots.
 *
 * Usage:
 *   1. Smoke test:
 *      k6 run tests/load/k6-whitelist-qualify.js -e SCENARIO=smoke
 *   2. Gradual ramp-up:
 *      k6 run tests/load/k6-whitelist-qualify.js -e SCENARIO=ramp
 *   3. 100 Concurrent target:
 *      k6 run tests/load/k6-whitelist-qualify.js -e SCENARIO=target_100
 */

// Custom metrics
const wlSlotAllocated = new Counter("wl_slot_allocated");
const wlInQueue = new Counter("wl_in_queue");
const wlRateLimited = new Counter("wl_rate_limited");
const wlServerError = new Counter("wl_server_error");
const wlDuration = new Trend("wl_request_duration_ms");

let testSessions = [];
try {
  testSessions = JSON.parse(open("./whitelist-test-sessions.json"));
} catch {
  testSessions = Array.from({ length: 150 }, (_, i) => ({
    userId: `usr-wl-load-${String(i + 1).padStart(3, "0")}`,
    cookie: `chimphood_session=mock-test-session-${i + 1}`,
  }));
}

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const PROGRAM_ID = __ENV.PROGRAM_ID || "program-load-test";
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

  if (SCENARIO === "target_50") {
    return {
      peak_50: {
        executor: "constant-vus",
        vus: 50,
        duration: "20s",
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
        { duration: "10s", target: 5 },  // Smoke
        { duration: "15s", target: 25 }, // Light load
        { duration: "20s", target: 50 }, // Moderate load
        { duration: "30s", target: 100 }, // Peak 100 concurrent
        { duration: "10s", target: 0 },  // Cool down
      ],
    },
  };
}

export const options = {
  scenarios: getScenarios(),
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1000"],
    wl_server_error: ["count==0"],
  },
};

export default function k6WhitelistQualify() {
  const vuIndex = (__VU - 1) % testSessions.length;
  const session = testSessions[vuIndex];

  const url = `${BASE_URL}/api/whitelist/qualify`;
  const payload = JSON.stringify({
    programId: PROGRAM_ID,
  });

  const headers = {
    "Content-Type": "application/json",
    Cookie: session.cookie,
    "User-Agent": `ChimpHood-k6-VU-${__VU}`,
  };

  const res = http.post(url, payload, { headers });
  wlDuration.add(res.timings.duration);

  if (res.status === 200) {
    try {
      const body = JSON.parse(res.body);
      if (body.result?.phase === "SLOT_ALLOCATED") {
        wlSlotAllocated.add(1);
      } else if (body.result?.phase === "IN_QUEUE") {
        wlInQueue.add(1);
      }
    } catch {}
  } else if (res.status === 429) {
    wlRateLimited.add(1);
  } else if (res.status === 500) {
    wlServerError.add(1);
  }

  check(res, {
    "status is 200 or 429": (r) => r.status === 200 || r.status === 429,
    "no 500 server errors": (r) => r.status !== 500,
  });

  sleep(0.5);
}
