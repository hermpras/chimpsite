import { defineConfig, devices } from "@playwright/test";

/**
 * Validates that the database connection string strictly targets the local
 * "chimphood_test" PostgreSQL database on localhost, 127.0.0.1, or ::1.
 * Throws an immediate error if a remote, staging, or production database URL is detected.
 */
export function assertSafeLocalTestDatabase(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    const isLocalhost = host === "localhost" || host === "127.0.0.1";
    const dbName = parsed.pathname.replace(/^\//, "").split("?")[0];

    if (!isLocalhost || dbName !== "chimphood_test") {
      throw new Error(
        `[DATABASE_SECURITY_GUARD] Playwright E2E execution is strictly restricted to local database "chimphood_test" on localhost / 127.0.0.1. Attempted connection to host "${host}" and database "${dbName}". Aborting test execution to protect remote environments.`,
      );
    }
    return urlStr;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.startsWith("[DATABASE_SECURITY_GUARD]")
    ) {
      throw err;
    }
    throw new Error(
      `[DATABASE_SECURITY_GUARD] Invalid or malformed database URL for E2E testing: "${urlStr}". Aborting test execution.`,
    );
  }
}

export const LOCAL_E2E_DATABASE_URL = assertSafeLocalTestDatabase(
  "postgresql://hermawanprastiyanto@localhost:5432/chimphood_test",
);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "/tmp/playwright-results",
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: {
    command: "npx next dev --webpack -p 3000",
    url: "http://localhost:3000/profile",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: LOCAL_E2E_DATABASE_URL,
      X_API_BASE_URL: "http://127.0.0.1:9999",
      X_CLIENT_ID: "mock-e2e-x-client-id",
      X_CLIENT_SECRET: "mock-e2e-x-client-secret",
      X_REDIRECT_URI: "http://localhost:3000/api/social/x/callback",
    },
  },
});
