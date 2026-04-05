#!/usr/bin/env node
/**
 * Structural gate: M3 staging executor files exist (no wp-cli required).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const required = [
  "packages/workflows/src/executor/installManifestStaging.ts",
  "packages/workflows/src/trigger/apply-manifest.ts",
  "packages/workflows/src/db/supabase/supabaseRestInsert.ts",
  "scripts/execute-apply-manifest-staging.mjs",
  "scripts/rollback-apply-manifest-staging.mjs",
  "templates/woocommerce/scripts/install-from-manifest.sh",
  "templates/woocommerce/scripts/rollback-from-manifest.sh",
];

for (const rel of required) {
  const p = path.join(repoRoot, rel);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing M3 executor artifact: ${rel}`);
  }
}

console.log("Staging manifest executor structural validation PASSED ✅");
