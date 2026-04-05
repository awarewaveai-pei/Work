#!/usr/bin/env node
/**
 * C3-2: Emit a drill report markdown under agency-os/reports/e2e/ (canonical reports root).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function getArg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (!hit) return fallback;
  return hit.slice(prefix.length);
}

function workRoot() {
  if (process.env.LOBSTER_WORK_ROOT?.trim()) {
    return path.resolve(process.env.LOBSTER_WORK_ROOT.trim());
  }
  return path.resolve(repoRoot, "..");
}

function runExitCode(fn) {
  try {
    fn();
    return 0;
  } catch (e) {
    return typeof e?.status === "number" ? e.status : 1;
  }
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`
Usage: node scripts/emit-staging-drill-report.mjs [--runRegression=1|0] [--runBootstrap=0|1] [--wpRootPath=DIR] [--notes=text]

Writes: <WORK_ROOT>/agency-os/reports/e2e/staging-pipeline-drill-<stamp>.md
WORK_ROOT = LOBSTER_WORK_ROOT or parent of lobster-factory.
Optional --wpRootPath forwards to run-staging-pipeline-regression (enables 4/4 shell DRY_RUN when set).
`);
    return;
  }

  const runRegression = getArg("runRegression", "1") !== "0";
  const runBootstrap = getArg("runBootstrap", "0") === "1";
  const wpRootPath = getArg("wpRootPath", "");
  const notes = getArg("notes", "");

  const wr = workRoot();
  const e2eDir = path.join(wr, "agency-os", "reports", "e2e");
  fs.mkdirSync(e2eDir, { recursive: true });

  let regressionExit = "skipped";
  if (runRegression) {
    regressionExit = String(
      runExitCode(() => {
        const regArgs = [path.join(repoRoot, "scripts", "run-staging-pipeline-regression.mjs"), "--mode=fast"];
        if (wpRootPath) {
          regArgs.push(`--wpRootPath=${path.resolve(wpRootPath)}`);
        }
        execFileSync(process.execPath, regArgs, { stdio: "inherit", cwd: repoRoot, env: process.env });
      })
    );
  }

  let bootstrapExit = "skipped";
  if (runBootstrap) {
    bootstrapExit = String(
      runExitCode(() => {
        execFileSync(process.execPath, [path.join(repoRoot, "scripts", "bootstrap-validate.mjs")], {
          stdio: "inherit",
          cwd: repoRoot,
          env: process.env,
        });
      })
    );
  }

  const templatePath = path.join(repoRoot, "docs", "e2e", "STAGING_PIPELINE_DRILL_REPORT_TEMPLATE.md");
  let body = fs.readFileSync(templatePath, "utf8");
  body = body
    .replace("{{GENERATED_AT_UTC}}", new Date().toISOString())
    .replace("{{REGRESSION_EXIT_CODE}}", regressionExit)
    .replace("{{BOOTSTRAP_EXIT_CODE}}", bootstrapExit)
    .replace("{{FREE_TEXT}}", notes || "_None_");

  const outPath = path.join(e2eDir, `staging-pipeline-drill-${stamp()}.md`);
  fs.writeFileSync(outPath, body, "utf8");
  console.log(`Drill report written: ${outPath}`);
}

try {
  main();
} catch (e) {
  console.error(e?.stack || String(e));
  process.exitCode = 1;
}
