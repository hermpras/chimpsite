import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Environment Variables Specification & Documentation (Task 0-E)", () => {
  const envExamplePath = path.resolve(process.cwd(), ".env.example");
  const docPath = path.resolve(process.cwd(), "docs/environment-variables.md");

  it("ensures .env.example exists and is non-empty", () => {
    expect(fs.existsSync(envExamplePath)).toBe(true);
    const content = fs.readFileSync(envExamplePath, "utf-8");
    expect(content.length).toBeGreaterThan(100);
  });

  it("ensures docs/environment-variables.md exists and is non-empty", () => {
    expect(fs.existsSync(docPath)).toBe(true);
    const content = fs.readFileSync(docPath, "utf-8");
    expect(content.length).toBeGreaterThan(500);
  });

  it("contains all active environment variables used in codebase", () => {
    const envExample = fs.readFileSync(envExamplePath, "utf-8");
    const activeVariables = [
      "DATABASE_URL",
      "NEXT_PUBLIC_APP_URL",
      "SESSION_SECRET",
      "SIWE_DOMAIN",
      "SIWE_URI",
      "ALLOWED_CHAIN_IDS",
      "X_CLIENT_ID",
      "X_CLIENT_SECRET",
      "X_REDIRECT_URI",
      "CRON_SECRET",
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
    ];

    for (const variable of activeVariables) {
      expect(
        envExample.includes(variable),
        `Expected .env.example to declare or document "${variable}"`,
      ).toBe(true);
    }
  });

  it("does not contain stale or deprecated placeholders from superseded specifications", () => {
    const envExample = fs.readFileSync(envExamplePath, "utf-8");
    const deprecatedPlaceholders = [
      "AUTH_SECRET",
      "NEXTAUTH_URL",
      "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
      "ADMIN_API_KEY",
    ];

    for (const placeholder of deprecatedPlaceholders) {
      expect(
        envExample.includes(placeholder),
        `Found deprecated/stale variable "${placeholder}" in .env.example`,
      ).toBe(false);
    }
  });

  it("ensures docs/environment-variables.md documents all active variables", () => {
    const docContent = fs.readFileSync(docPath, "utf-8");
    const documentedVariables = [
      "DATABASE_URL",
      "NEXT_PUBLIC_APP_URL",
      "SESSION_SECRET",
      "SIWE_DOMAIN",
      "SIWE_URI",
      "ALLOWED_CHAIN_IDS",
      "X_CLIENT_ID",
      "X_CLIENT_SECRET",
      "X_REDIRECT_URI",
      "CRON_SECRET",
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
      "NODE_ENV",
    ];

    for (const variable of documentedVariables) {
      expect(
        docContent.includes(variable),
        `Expected docs/environment-variables.md to document "${variable}"`,
      ).toBe(true);
    }
  });
});
