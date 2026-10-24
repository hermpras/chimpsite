#!/usr/bin/env node
/**
 * Standalone Super Admin Bootstrap Script (Task B-3)
 *
 * Safely initializes or upgrades the primary SUPER_ADMIN role for ChimpHood
 * in staging or production environments.
 *
 * Usage:
 *   INITIAL_SUPER_ADMIN_ADDRESS=0x1234...5678 npm run admin:bootstrap
 *   or
 *   npm run admin:bootstrap -- 0x1234...5678
 *   or
 *   node scripts/bootstrap-super-admin.mjs [0x1234...5678]
 *
 * Security:
 *   - Strictly isolated from HTTP traffic; no public endpoints.
 *   - Completely independent from devPromoteToAdmin.
 *   - Fails closed if configuration is missing or invalid.
 *   - Never prints secrets, connection strings, or auth tokens to logs.
 *   - Idempotent: repeated runs do not duplicate or demote roles.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { runBootstrapCli } from "../server/admin/bootstrap";

export { runBootstrapCli };

// Auto-run if executed directly as entrypoint
if (process.env.NODE_ENV !== "test") {
  runBootstrapCli()
    .then((exitCode) => {
      process.exit(exitCode);
    })
    .catch((err) => {
      console.error(
        `[BOOTSTRAP FATAL ERROR] ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    });
}
