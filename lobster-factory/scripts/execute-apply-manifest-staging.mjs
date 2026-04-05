#!/usr/bin/env node
/**
 * Local staging manifest executor (M3).
 * Wraps templates/woocommerce/scripts/install-from-manifest.sh with the same guardrails as dryrun.
 *
 * Default: --execute=0 → DRY_RUN=1 (preview only).
 * --execute=1 → real wp-cli (requires wp in PATH + valid WP root).
 *
 * Requires: bash on PATH (Windows: Git `bash.exe`, or set LOBSTER_BASH).
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

function usage() {
  console.log(`
Local staging manifest executor (M3). Bash + install-from-manifest.sh.

Usage:
  node scripts/execute-apply-manifest-staging.mjs \\
    --organizationId=<uuid> --workspaceId=<uuid> --projectId=<uuid> \\
    --siteId=<uuid> --environmentId=<uuid> \\
    --wpRootPath=<abs-path> \\
    [--manifestPath=packages/manifests/wc-core.json] [--environmentType=staging] \\
    [--execute=0|1]

  --execute=0  DRY_RUN=1 (default)
  --execute=1  Real wp-cli

Env: LOBSTER_BASH, LOBSTER_MANIFEST_SHELL_TIMEOUT_MS (default 120000)
`);
}

function assertManifest(manifest, manifestPathForError) {
  if (manifest?.name !== "wc-core") {
    throw new Error(
      `execute-apply-manifest-staging only supports manifest.name="wc-core" (${manifestPathForError})`
    );
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
  if (!Array.isArray(manifest?.steps) || manifest.steps.length === 0) {
    throw new Error(`manifest.steps must be non-empty (${manifestPathForError})`);
  }
}

/** On Windows, `bash.exe` is often not on PATH; prefer Git for Windows if present. */
function resolveBashExecutable() {
  const fromEnv = process.env.LOBSTER_BASH?.trim();
  if (fromEnv) return fromEnv;
  if (process.platform !== "win32") return "bash";
  const candidates = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return "bash.exe";
}

function runBashOnce({ bash, scriptPath, manifestPath, wpRootPath, dryRun, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(bash, [scriptPath, manifestPath, wpRootPath], {
      env: { ...process.env, DRY_RUN: dryRun ? "1" : "0" },
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
    usage();
    return;
  }

  requiredArg("organizationId");
  requiredArg("workspaceId");
  requiredArg("projectId");
  requiredArg("siteId");
  requiredArg("environmentId");

  const environmentType = getArg("environmentType", "staging");
  if (environmentType !== "staging") {
    throw new Error("execute-apply-manifest-staging enforces environmentType=staging only");
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
    "install-from-manifest.sh"
  );
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Missing install script: ${scriptPath}`);
  }

  const bash = resolveBashExecutable();
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
    throw new Error(`install-from-manifest exited with code ${exitCode}`);
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: !execute,
        manifestPath,
        wpRootPath,
        scriptPath,
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
