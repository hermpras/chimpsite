/**
 * ST-05 Local Upstash Redis REST Mock Server
 * File: tests/load/local-redis-mock.mjs
 *
 * Provides a lightweight loopback-only (127.0.0.1:8079) HTTP mock for Upstash Redis REST API.
 * Ensures Next.js rate limiting operates with zero external network access and zero latency overhead.
 */

import http from "node:http";

const PORT = 8079;
const HOST = "127.0.0.1";

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");

    // Standard pipeline response for Upstash sliding window ratelimit
    // Each command in pipeline receives { result: [remainingTokens, limit] }
    if (req.url === "/pipeline") {
      let commandCount = 1;
      try {
        const parsed = JSON.parse(body);
        if (Array.isArray(parsed)) {
          commandCount = parsed.length;
        }
      } catch {}

      const responses = Array.from({ length: commandCount }, () => ({
        result: [100, 100],
      }));
      res.writeHead(200);
      res.end(JSON.stringify(responses));
      return;
    }

    // Single eval/evalsha command response
    res.writeHead(200);
    res.end(JSON.stringify({ result: [100, 100] }));
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[LOCAL_REDIS_MOCK] Listening on http://${HOST}:${PORT}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
