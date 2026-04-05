import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ManifestExecutionMode = "off" | "dry_run" | "apply";

/**
 * Staging-only manifest shell execution (M3).
 * - `off`: do not spawn bash (default).
 * - `dry_run`: `install-from-manifest.sh` with DRY_RUN=1 (preview / comparable to dryrun JSON).
 * - `apply`: real wp-cli side effects (still requires manifest target=staging-only + workflow staging guard).
 */
export function getManifestExecutionMode(): ManifestExecutionMode {
  const steps = (process.env.LOBSTER_EXECUTE_MANIFEST_STEPS || "").toLowerCase();
  if (steps !== "true" && steps !== "1") return "off";
  const m = (process.env.LOBSTER_MANIFEST_EXECUTION_MODE || "dry_run").toLowerCase();
  if (m === "apply") return "apply";
  return "dry_run";
}

export function resolveLobsterRepoRoot(): string {
  const fromEnv = process.env.LOBSTER_REPO_ROOT?.trim();
  if (fromEnv) {
    const root = path.resolve(fromEnv);
    const probe = path.join(root, "packages", "manifests", "wc-core.json");
    if (fs.existsSync(probe)) return root;
    throw new Error(
      `LOBSTER_REPO_ROOT is set but missing packages/manifests/wc-core.json at ${probe}`
    );
  }
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 16; i++) {
    const probe = path.join(dir, "packages", "manifests", "wc-core.json");
    if (fs.existsSync(probe)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "Could not resolve lobster-factory repo root. Set LOBSTER_REPO_ROOT for serverless/bundled runs."
  );
}

export function resolveInstallScriptPath(repoRoot: string): string {
  return path.join(
    repoRoot,
    "templates",
    "woocommerce",
    "scripts",
    "install-from-manifest.sh"
  );
}

export interface RunInstallManifestStagingParams {
  manifestAbsolutePath: string;
  wpRootPath: string;
  dryRun: boolean;
  timeoutMs?: number;
  maxAttempts?: number;
}

export interface RunInstallManifestStagingResult {
  dryRun: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  attempts: number;
  scriptPath: string;
}

function getBashExecutable(): string {
  const override = process.env.LOBSTER_BASH?.trim();
  if (override) return override;
  return process.platform === "win32" ? "bash.exe" : "bash";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface RunOnceOutcome {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function runOnce(p: {
  bash: string;
  scriptPath: string;
  manifestPath: string;
  wpRootPath: string;
  dryRun: boolean;
  timeoutMs: number;
}): Promise<RunOnceOutcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(p.bash, [p.scriptPath, p.manifestPath, p.wpRootPath], {
      env: {
        ...process.env,
        DRY_RUN: p.dryRun ? "1" : "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c) => {
      stdout += String(c);
    });
    child.stderr?.on("data", (c) => {
      stderr += String(c);
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }, p.timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr, timedOut });
    });
  });
}

/**
 * Runs `templates/woocommerce/scripts/install-from-manifest.sh` under bash.
 * Retries once on non-zero exit (2s backoff). Throws after exhausting attempts.
 */
export async function runInstallFromManifestStaging(
  params: RunInstallManifestStagingParams
): Promise<RunInstallManifestStagingResult> {
  const timeoutMs = params.timeoutMs ?? 120_000;
  const maxAttempts = Math.max(1, params.maxAttempts ?? 2);
  const repoRoot = resolveLobsterRepoRoot();
  const scriptPath = resolveInstallScriptPath(repoRoot);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`install script missing: ${scriptPath}`);
  }
  if (!fs.existsSync(params.manifestAbsolutePath)) {
    throw new Error(`manifest not found: ${params.manifestAbsolutePath}`);
  }
  let wpIsDir = false;
  try {
    wpIsDir = fs.statSync(params.wpRootPath).isDirectory();
  } catch {
    wpIsDir = false;
  }
  if (!wpIsDir) {
    throw new Error(`wp root is not a directory: ${params.wpRootPath}`);
  }

  const bash = getBashExecutable();
  let lastStdout = "";
  let lastStderr = "";
  let lastExit: number | null = null;
  let lastTimedOut = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await runOnce({
      bash,
      scriptPath,
      manifestPath: params.manifestAbsolutePath,
      wpRootPath: params.wpRootPath,
      dryRun: params.dryRun,
      timeoutMs,
    });
    lastStdout = result.stdout;
    lastStderr = result.stderr;
    lastExit = result.exitCode;
    lastTimedOut = result.timedOut;

    if (result.timedOut) {
      if (attempt < maxAttempts) await sleep(2000);
      continue;
    }
    if (result.exitCode === 0) {
      return {
        dryRun: params.dryRun,
        exitCode: 0,
        stdout: lastStdout,
        stderr: lastStderr,
        timedOut: false,
        attempts: attempt,
        scriptPath,
      };
    }
    if (attempt < maxAttempts) await sleep(2000);
  }

  const msg = `install-from-manifest failed after ${maxAttempts} attempt(s): exit=${lastExit}, timedOut=${lastTimedOut}\n${lastStderr.slice(0, 4000)}`;
  const err = new Error(msg);
  (err as Error & { details?: unknown }).details = {
    stdout: lastStdout,
    stderr: lastStderr,
    exitCode: lastExit,
    timedOut: lastTimedOut,
    scriptPath,
  };
  throw err;
}
