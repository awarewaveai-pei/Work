#!/usr/bin/env node
/**
 * Staging rollback helper (C2-3 baseline): calls rollback-from-manifest.sh
 * with the same manifest guardrails as execute-apply-manifest-staging.mjs.
 *
 * Default --execute=0 → DRY_RUN=1.
 * --execute=1 → runs wp plugin deactivate (theme: warnings only in script).
 * ROLLBACK_DEEP=1 env → also plugin uninstall (destructive).
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function getArg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const match = process.argv.find((a) => a.startsWith(prefix));
  if (!match) return fallback;
  return match.slice(prefix.length);
}

function requiredArg(name) {
  const v = getArg(name);
  if (!v) throw new Error(`Missing required arg: --${name}=`);
  return v;
}

function assertManifest(manifest, manifestPathForError) {
  if (manifest?.name !== "wc-core") {
    throw new Error(`rollback only supports manifest.name="wc-core" (${manifestPathForError})`);
  }
  if (manifest?.target !== "staging-only") {
    throw new Error(`manifest target must be "staging-only" (${manifestPathForError})`);
  }
  if (!manifest?.guardrails?.blockIfProduction) {
    throw new Error(`manifest.guardrails.blockIfProduction must be true (${manifestPathForError})`);
  }
  const allow = manifest?.guardrails?.allowEnvironments;
  if (!Array.isArray(allow) || !allow.includes("staging")) {
    throw new Error(
      `manifest.guardrails.allowEnvironments must include "staging" (${manifestPathForError})`
    );
  }
}

function runBashOnce({ bash, scriptPath, manifestPath, wpRootPath, dryRun, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      DRY_RUN: dryRun ? "1" : "0",
    };
    const child = spawn(bash, [scriptPath, manifestPath, wpRootPath], {
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    const t = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(t);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(t);
      resolve(code ?? 1);
    });
  });
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`
Usage: node scripts/rollback-apply-manifest-staging.mjs
  --organizationId=<uuid> ... --environmentId=<uuid>
  --wpRootPath=<abs> [--manifestPath=packages/manifests/wc-core.json] [--execute=0|1]

Env: LOBSTER_BASH, LOBSTER_MANIFEST_SHELL_TIMEOUT_MS, ROLLBACK_DEEP=0|1
`);
    return;
  }

  requiredArg("organizationId");
  requiredArg("workspaceId");
  requiredArg("projectId");
  requiredArg("siteId");
  requiredArg("environmentId");

  const environmentType = getArg("environmentType", "staging");
  if (environmentType !== "staging") {
    throw new Error("rollback-apply-manifest-staging enforces environmentType=staging only");
  }

  const manifestPathArg = getArg("manifestPath", "packages/manifests/wc-core.json");
  const manifestPath = path.isAbsolute(manifestPathArg)
    ? manifestPathArg
    : path.join(repoRoot, manifestPathArg);

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }

  const raw = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(raw);
  assertManifest(manifest, manifestPath);

  const execute = getArg("execute", "0") === "1";
  const wpRootPath = path.resolve(requiredArg("wpRootPath"));
  if (!fs.statSync(wpRootPath).isDirectory()) {
    throw new Error(`wpRootPath is not a directory: ${wpRootPath}`);
  }

  const scriptPath = path.join(
    repoRoot,
    "templates",
    "woocommerce",
    "scripts",
    "rollback-from-manifest.sh"
  );
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Missing rollback script: ${scriptPath}`);
  }

  const bash =
    process.env.LOBSTER_BASH?.trim() ||
    (process.platform === "win32" ? "bash.exe" : "bash");
  const timeoutMs = Number(process.env.LOBSTER_MANIFEST_SHELL_TIMEOUT_MS || 120000);

  const exitCode = await runBashOnce({
    bash,
    scriptPath,
    manifestPath,
    wpRootPath,
    dryRun: !execute,
    timeoutMs,
  });

  if (exitCode !== 0) {
    throw new Error(`rollback-from-manifest exited with code ${exitCode}`);
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: !execute,
        manifestPath,
        wpRootPath,
        rollbackDeep: process.env.ROLLBACK_DEEP === "1",
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exitCode = 1;
});
