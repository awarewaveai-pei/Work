import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

async function readJson(relPath) {
  const filePath = path.join(repoRoot, relPath);
  const raw = await fs.readFile(filePath, "utf8");
  return { filePath, data: JSON.parse(raw) };
}

const errors = [];

const [{ filePath: riskPath, data: riskMatrix }, { filePath: policyPath, data: executionPolicy }] =
  await Promise.all([
    readJson("workflow-risk-matrix.json"),
    readJson("packages/policies/approval/wordpress-factory-execution-policy.json"),
  ]);

if (!Array.isArray(riskMatrix?.rules) || riskMatrix.rules.length === 0) {
  errors.push(`${riskPath}: rules must be non-empty array`);
}

if (!executionPolicy?.hard_requirements?.staging_first) {
  errors.push(`${policyPath}: hard_requirements.staging_first must be true`);
}
if (!executionPolicy?.hard_requirements?.production_requires_approval) {
  errors.push(`${policyPath}: hard_requirements.production_requires_approval must be true`);
}
if (!executionPolicy?.hard_requirements?.high_risk_requires_rollback) {
  errors.push(`${policyPath}: hard_requirements.high_risk_requires_rollback must be true`);
}

const requiredStages = [
  "precheck",
  "staging_provision",
  "manifest_apply",
  "smoke_validation",
  "decision_gate",
  "production_rollout",
];
for (const s of requiredStages) {
  if (!executionPolicy?.stages?.includes?.(s)) {
    errors.push(`${policyPath}: stages must include "${s}"`);
  }
}

const requiredAudit = ["workflow_runs", "approvals", "incidents", "artifacts"];
for (const table of requiredAudit) {
  if (!executionPolicy?.hard_requirements?.audit_tables?.includes?.(table)) {
    errors.push(`${policyPath}: audit_tables must include "${table}"`);
  }
}

function findRule(taskType) {
  return riskMatrix.rules.find((r) => r.task_type === taskType);
}

const deployProd = findRule("deploy_production");
if (!deployProd) {
  errors.push(`${riskPath}: missing deploy_production rule`);
} else {
  if (!deployProd.allowed_envs?.includes?.("production")) {
    errors.push(`${riskPath}: deploy_production must allow production env`);
  }
  if (!deployProd.approval_required) {
    errors.push(`${riskPath}: deploy_production must require approval`);
  }
  if (!deployProd.rollback_required) {
    errors.push(`${riskPath}: deploy_production must require rollback`);
  }
}

const manifestApply = findRule("manifest_apply");
if (!manifestApply) {
  errors.push(`${riskPath}: missing manifest_apply rule`);
} else {
  if (!manifestApply.allowed_envs?.includes?.("staging")) {
    errors.push(`${riskPath}: manifest_apply must allow staging env`);
  }
  if (manifestApply.tool !== "trigger") {
    errors.push(`${riskPath}: manifest_apply tool must be "trigger"`);
  }
}

const webhook = findRule("webhook_ingress");
if (!webhook) {
  errors.push(`${riskPath}: missing webhook_ingress rule`);
} else if (webhook.tool !== "n8n") {
  errors.push(`${riskPath}: webhook_ingress tool must be "n8n"`);
}

if (errors.length) {
  console.error("Workflow routing policy validation FAILED:");
  for (const e of errors) console.error(" -", e);
  process.exitCode = 1;
} else {
  console.log("Workflow routing policy validation PASSED");
}
