#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const workRoot = process.env.LOBSTER_WORK_ROOT?.trim()
  ? path.resolve(process.env.LOBSTER_WORK_ROOT.trim())
  : path.resolve(repoRoot, "..");

const policyPath = path.join(repoRoot, "policies", "artifacts", "artifacts-governance-baseline.json");
if (!fs.existsSync(policyPath)) {
  throw new Error(`Missing governance policy: ${policyPath}`);
}
const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
const retentionDays = Number(policy?.retention?.staging_days || 30);

const baseDir = process.env.LOBSTER_ARTIFACTS_BASE_DIR?.trim()
  ? path.resolve(process.env.LOBSTER_ARTIFACTS_BASE_DIR.trim())
  : path.join(workRoot, "agency-os", "reports", "artifacts", "lobster");
const applyManifestDir = path.join(baseDir, "apply-manifest");

const now = Date.now();
const retentionMs = retentionDays * 24 * 60 * 60 * 1000;

let runDirCount = 0;
let staleRunDirCount = 0;
let staleSamples = [];

if (fs.existsSync(applyManifestDir)) {
  const entries = fs.readdirSync(applyManifestDir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    runDirCount += 1;
    const p = path.join(applyManifestDir, e.name);
    const m = fs.statSync(p).mtimeMs;
    if (now - m > retentionMs) {
      staleRunDirCount += 1;
      if (staleSamples.length < 10) staleSamples.push(e.name);
    }
  }
}

const reportDir = path.join(workRoot, "agency-os", "reports", "operations");
fs.mkdirSync(reportDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(reportDir, `artifacts-governance-audit-${stamp}.md`);

const lines = [];
lines.push(`# Artifacts Governance Audit - ${stamp}`);
lines.push("");
lines.push("## Scope");
lines.push(`- repoRoot: \`${repoRoot}\``);
lines.push(`- workRoot: \`${workRoot}\``);
lines.push(`- artifactsBaseDir: \`${baseDir}\``);
lines.push(`- applyManifestDir: \`${applyManifestDir}\``);
lines.push("");
lines.push("## Policy snapshot");
lines.push(`- provider_strategy.mode: \`${policy?.provider_strategy?.mode}\``);
lines.push(`- provider_strategy.primary: \`${policy?.provider_strategy?.primary}\``);
lines.push(`- provider_strategy.supported: \`${(policy?.provider_strategy?.supported || []).join(", ")}\``);
lines.push(`- provider_strategy.contract: \`${policy?.provider_strategy?.contract}\``);
lines.push(`- retention.staging_days: \`${retentionDays}\``);
lines.push(`- iam.enforce_tenant_prefix: \`${policy?.iam?.enforce_tenant_prefix}\``);
lines.push(`- iam.allow_runtime_bucket_list: \`${policy?.iam?.allow_runtime_bucket_list}\``);
lines.push(`- iam.presign_ttl_minutes_max: \`${policy?.iam?.presign_ttl_minutes_max}\``);
lines.push(`- iam.required_prefix_template: \`${policy?.iam?.required_prefix_template}\``);
lines.push("");
lines.push("## Local artifacts findings");
lines.push(`- workflow run directories found: \`${runDirCount}\``);
lines.push(`- stale directories (>${retentionDays}d): \`${staleRunDirCount}\``);
if (staleSamples.length > 0) {
  lines.push("- stale sample run ids:");
  for (const s of staleSamples) lines.push(`  - \`${s}\``);
}
lines.push("");
lines.push("## Result");
if (staleRunDirCount > 0) {
  lines.push("- WARN: stale artifact directories exceed retention; schedule cleanup job.");
} else {
  lines.push("- PASS: no stale local artifact directories over retention baseline.");
}

fs.writeFileSync(reportPath, lines.join("\n") + "\n", "utf8");
console.log(`Artifacts governance audit report: ${reportPath}`);
