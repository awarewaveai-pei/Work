#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function mustExist(relPath) {
  const p = path.join(repoRoot, relPath);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing A9 governance file: ${relPath}`);
  }
  return p;
}

function mustInclude(filePath, token, label) {
  const text = fs.readFileSync(filePath, "utf8");
  if (!text.includes(token)) {
    throw new Error(`${label} must include token: ${token}`);
  }
}

const lifecycleDoc = mustExist("docs/operations/ARTIFACTS_LIFECYCLE_POLICY.md");
const iamDoc = mustExist("docs/operations/ARTIFACTS_IAM_BOUNDARY.md");
const remotePutDoc = mustExist("docs/operations/REMOTE_PUT_ARTIFACTS.md");
const migrationRunbook = mustExist("docs/operations/R2_TO_S3_MIGRATION_RUNBOOK.md");
const policyPath = mustExist("policies/artifacts/artifacts-governance-baseline.json");
mustExist("scripts/audit-artifacts-governance.mjs");

mustInclude(lifecycleDoc, "## 3) 留存與刪除（原則）", "ARTIFACTS_LIFECYCLE_POLICY.md");
mustInclude(iamDoc, "## Baseline principles", "ARTIFACTS_IAM_BOUNDARY.md");
mustInclude(iamDoc, "## Required controls", "ARTIFACTS_IAM_BOUNDARY.md");
mustInclude(remotePutDoc, "LOBSTER_ARTIFACTS_PRESIGN_URL", "REMOTE_PUT_ARTIFACTS.md");
mustInclude(migrationRunbook, "## 4) Rollback plan", "R2_TO_S3_MIGRATION_RUNBOOK.md");

const policyRaw = fs.readFileSync(policyPath, "utf8");
let policy;
try {
  policy = JSON.parse(policyRaw);
} catch (e) {
  throw new Error(`Invalid JSON in artifacts governance policy: ${e instanceof Error ? e.message : String(e)}`);
}

if (policy?.version !== 1) throw new Error("artifacts-governance-baseline.json: version must be 1");
if (!policy?.provider_strategy) {
  throw new Error("artifacts-governance-baseline.json: provider_strategy is required");
}
if (policy.provider_strategy.mode !== "portable_single_provider") {
  throw new Error("artifacts-governance-baseline.json: provider_strategy.mode must be portable_single_provider");
}
if (!Array.isArray(policy.provider_strategy.supported) || policy.provider_strategy.supported.length < 2) {
  throw new Error("artifacts-governance-baseline.json: provider_strategy.supported must include at least two providers");
}
if (policy.provider_strategy.contract !== "presigned_put_http") {
  throw new Error("artifacts-governance-baseline.json: provider_strategy.contract must be presigned_put_http");
}
if (!policy?.retention || Number(policy.retention.staging_days) <= 0) {
  throw new Error("artifacts-governance-baseline.json: retention.staging_days must be > 0");
}
if (!policy?.iam || policy.iam.enforce_tenant_prefix !== true) {
  throw new Error("artifacts-governance-baseline.json: iam.enforce_tenant_prefix must be true");
}
if (Number(policy?.iam?.presign_ttl_minutes_max) > 60) {
  throw new Error("artifacts-governance-baseline.json: iam.presign_ttl_minutes_max should be <= 60");
}
if (policy?.audit?.report_enabled !== true) {
  throw new Error("artifacts-governance-baseline.json: audit.report_enabled must be true");
}

console.log("Artifacts governance validation PASSED ✅");
