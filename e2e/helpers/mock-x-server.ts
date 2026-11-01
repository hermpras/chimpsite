import http, { type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { Pool } from "pg";
import { assertSafeLocalTestDatabase, LOCAL_E2E_DATABASE_URL } from "../../playwright.config";

export interface MockXServerOptions {
  port?: number;
  mockUserId?: string;
  mockUsername?: string;
  mockName?: string;
  mockProfileImageUrl?: string;
}

export interface MockXServer {
  server: Server;
  port: number;
  stop: () => Promise<void>;
  getTokenRequests: () => Array<{ body: string; headers: http.IncomingHttpHeaders }>;
  getUserMeRequests: () => Array<{ url: string; headers: http.IncomingHttpHeaders }>;
}

/**
 * Creates and starts a lightweight local HTTP mock server for Twitter / X OAuth 2.0 API.
 * Intercepts server-side outbound requests for token exchange and user profile fetch
 * without contacting external Twitter API servers.
 */
export async function startMockXServer(
  options: MockXServerOptions = {},
): Promise<MockXServer> {
  const port = options.port ?? 9999;
  const mockUserId = options.mockUserId ?? "e2e_x_user_12345";
  const mockUsername = options.mockUsername ?? "e2e_tester";
  const mockName = options.mockName ?? "E2E Tester";
  const mockProfileImageUrl =
    options.mockProfileImageUrl ??
    "https://pbs.twimg.com/profile_images/1/avatar_normal.jpg";

  const tokenRequests: Array<{ body: string; headers: http.IncomingHttpHeaders }> = [];
  const userMeRequests: Array<{ url: string; headers: http.IncomingHttpHeaders }> = [];

  const server = http.createServer(
    (req: IncomingMessage, res: ServerResponse) => {
      const url = req.url || "/";
      const method = req.method || "GET";

      // 1. Token Exchange: POST /2/oauth2/token
      if (method === "POST" && url === "/2/oauth2/token") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          tokenRequests.push({ body, headers: req.headers });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              token_type: "bearer",
              expires_in: 7200,
              access_token: "mock_e2e_access_token_12345",
              scope: "tweet.read users.read offline.access",
            }),
          );
        });
        return;
      }

      // 2. Profile Fetch: GET /2/users/me
      if (method === "GET" && url.startsWith("/2/users/me")) {
        userMeRequests.push({ url, headers: req.headers });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            data: {
              id: mockUserId,
              username: mockUsername,
              name: mockName,
              profile_image_url: mockProfileImageUrl,
            },
          }),
        );
        return;
      }

      // Fallback 404 for unhandled paths
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found in Mock X Server" }));
    },
  );

  await new Promise<void>((resolve, reject) => {
    server.listen(port, "127.0.0.1", () => {
      resolve();
    });
    server.on("error", reject);
  });

  return {
    server,
    port,
    getTokenRequests: () => [...tokenRequests],
    getUserMeRequests: () => [...userMeRequests],
    stop: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

/**
 * Safely cleans up only E2E test data (XIdentity, derivative WLQueueEntry, and AuditLog)
 * created during E2E runs in the strictly verified local chimphood_test database.
 * Does NOT touch or delete records belonging to any other user.
 */
export async function cleanupXOAuthTestData(
  targetUsername = "e2e_tester",
  targetXId = "e2e_x_user_12345",
): Promise<void> {
  // Enforce local database isolation guard - never read process.env.DATABASE_URL
  const connectionString = assertSafeLocalTestDatabase(LOCAL_E2E_DATABASE_URL);

  const pool = new Pool({ connectionString });
  try {
    // 1. Locate specific test identity records to resolve exact entityId and userId
    const { rows } = await pool.query<{ id: string; userId: string }>(
      'SELECT id, "userId" FROM "XIdentity" WHERE "username" = $1 OR "xId" = $2',
      [targetUsername, targetXId],
    );

    const testIdentityIds = rows.map((r) => r.id);
    const testUserIds = rows.map((r) => r.userId).filter(Boolean);

    // 2. Clean up derivative whitelist entries created during auto-registration for this test user
    if (testUserIds.length > 0) {
      await pool.query(
        'DELETE FROM "WLQueueEntry" WHERE "userId" = ANY($1::text[])',
        [testUserIds],
      );
    }

    // 3. Clean up only the specific AuditLog records created for this E2E test identity.
    // Strictly scoped by action, entityType, and exact entityId / newValues identifiers.
    // We intentionally DO NOT delete by actorId to avoid deleting other legitimate audit events for this user.
    await pool.query(
      `DELETE FROM "AuditLog"
       WHERE "action" = 'X_IDENTITY_LINKED'
         AND "entityType" = 'XIdentity'
         AND (
           "newValues"->>'username' = $1
           OR "newValues"->>'xId' = $2
           OR ($3::text[] IS NOT NULL AND "entityId" = ANY($3::text[]))
         )`,
      [
        targetUsername,
        targetXId,
        testIdentityIds.length > 0 ? testIdentityIds : null,
      ],
    );

    // 4. Remove the test XIdentity record itself
    await pool.query(
      'DELETE FROM "XIdentity" WHERE "username" = $1 OR "xId" = $2',
      [targetUsername, targetXId],
    );
  } catch (err) {
    console.warn("cleanupXOAuthTestData warning:", err);
  } finally {
    await pool.end();
  }
}
