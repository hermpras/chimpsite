#!/usr/bin/env node
/**
 * Super Admin Bootstrap Runner (Task B-3)
 *
 * Node.js runner that uses jiti to execute scripts/bootstrap-super-admin.ts
 * without requiring pre-compilation or global tsx installations.
 */

import jitiFactory from "jiti";
import { resolve } from "node:path";

const jiti = jitiFactory(process.cwd(), {
  alias: {
    "@": process.cwd(),
  },
});

jiti(resolve(process.cwd(), "scripts/bootstrap-super-admin.ts"));
