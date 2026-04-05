#!/usr/bin/env node
/**
 * C3-1: Staging pipeline regression (fixed payload, rerunnable).
 * - Structural executor check
 * - dryrun-apply-manifest JSON + validate-dryrun contract
 * - Optional: execute-apply-manifest-staging --execute=0 when --wpRootPath points to an existing directory
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const DEFAULT = {
  organizationId: "11111111-1111-1111-1111-111111111111",
  workspaceId: "22222222-2222-2222-2222-222222222222",
  projectId: "33333333-3333-3333-3333-333333333333",
  siteId: "44444444-4444-4444-4444-444444444444",
  environmentId: "55555555-5555-5555-5555-555555555555",
  manifestPath: "packages/manifests/wc-core.json",
  environmentType: "staging",
};

function getArg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (!hit) return fallback;
  return hit.slice(prefix.length);
}

function getMode() {
  const m = (getArg("mode", "fast") || "fast").toLowerCase();
  if (m !== "strict" && m !== "fast") {
    throw new Error(`Invalid --mode=${m} (expected strict|fast)`);
  }
  return m;
}

function runNode(scriptRel, extraArgs = []) {
  const script = path.join(repoRoot, scriptRel);
  execFileSync(process.execPath, [script, ...extraArgs], {
    stdio: "inherit",
    cwd: repoRoot,
    env: process.env,
  });
}

function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`
Usage: node scripts/run-staging-pipeline-regression.mjs [--mode=fast|strict] [--wpRootPath=DIR] [--skipShell=1]

Runs: validate-workflows-integrations-baseline -> validate-staging-manifest-executor -> validate-dryrun-apply-manifest
Optional: execute-apply-manifest-staging --execute=0 if wpRootPath is a directory and --skipShell not set.

Canonical payload: docs/e2e/STAGING_PIPELINE_E2E_PAYLOAD.md
`);
    return;
  }

  const mode = getMode();
  const wpRootArg = getArg("wpRootPath");
  const skipShell = getArg("skipShell", "0") === "1";

  const wpRootPath =
    wpRootArg ||
    path.join(repoRoot, "..", "dummy");
  const wpResolved = path.resolve(wpRootPath);
  if (!fs.existsSync(wpResolved)) {
    fs.mkdirSync(wpResolved, { recursive: true });
    console.log(`[regression] created dummy wp root for dryrun-only: ${wpResolved}`);
  }

  const tenantArgs = [
    `--organizationId=${DEFAULT.organizationId}`,
    `--workspaceId=${DEFAULT.workspaceId}`,
    `--projectId=${DEFAULT.projectId}`,
    `--siteId=${DEFAULT.siteId}`,
    `--environmentId=${DEFAULT.environmentId}`,
    `--wpRootPath=${wpResolved}`,
    `--manifestPath=${DEFAULT.manifestPath}`,
    `--environmentType=${DEFAULT.environmentType}`,
  ];

  console.log("\n== 1/4 workflows integrations (structural) ==\n");
  runNode("scripts/validate-workflows-integrations-baseline.mjs");

  console.log("\n== 2/4 staging manifest executor (structural) ==\n");
  runNode("scripts/validate-staging-manifest-executor.mjs");

  console.log("\n== 3/4 dryrun apply-manifest contract ==\n");
  runNode("scripts/validate-dryrun-apply-manifest.mjs", [`--mode=${mode}`, ...tenantArgs]);

  const useRealWp = Boolean(wpRootArg) && fs.statSync(wpResolved).isDirectory();
  if (!skipShell && useRealWp) {
    console.log("\n== 4/4 install shell dry preview (DRY_RUN) ==\n");
    runNode("scripts/execute-apply-manifest-staging.mjs", [...tenantArgs, "--execute=0"]);
  } else {
    console.log("\n== 4/4 install shell dry preview: SKIPPED ==")
    console.log(
      skipShell
        ? "(reason: --skipShell=1)"
        : "(reason: pass --wpRootPath= to a real WordPress root to run execute-apply-manifest-staging --execute=0)"
    );
  }

  console.log("\nStaging pipeline regression PASSED ✅\n");
}

try {
  main();
} catch (e) {
  console.error(e?.stack || String(e));
  process.exitCode = 1;
}
