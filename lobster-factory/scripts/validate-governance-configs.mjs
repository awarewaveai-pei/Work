import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dir = path.dirname(__filename);
const repoRoot = path.resolve(__dir, "..");

async function readJson(relPath) {
  const filePath = path.join(repoRoot, relPath);
  const raw = await fs.readFile(filePath, "utf8");
  return { filePath, data: JSON.parse(raw) };
}

function isNonEmptyString(x) {
  return typeof x === "string" && x.trim().length > 0;
}
function isStringArray(x) {
  return Array.isArray(x) && x.every((v) => typeof v === "string");
}

const errors = [];
const skipV3PolicyCheck = process.argv.includes("--skip-v3-policy-check");

const governanceFiles = await Promise.all([
  readJson("packages/agents/src/configs/repair-agent.json"),
  readJson("packages/policies/approval/production-deploy-policy.json"),
  readJson("packages/policies/tool/repair-agent-policy.json"),
  ...(skipV3PolicyCheck ? [] : [readJson("packages/policies/approval/v3-governance-gate-policy.json")]),
]);

const [{ filePath: repairPath, data: repairAgent }, { filePath: prodPath, data: productionDeploy }, { filePath: repairPolicyPath, data: repairAgentPolicy }] =
  governanceFiles;
const v3Policy = skipV3PolicyCheck ? null : governanceFiles[3];

// repair-agent.json
if (!repairAgent || typeof repairAgent !== "object") errors.push(`${repairPath}: must be an object`);
if (!isNonEmptyString(repairAgent?.name)) errors.push(`${repairPath}: name must be string`);
if (!isNonEmptyString(repairAgent?.version)) errors.push(`${repairPath}: version must be string`);
if (!isNonEmptyString(repairAgent?.domain)) errors.push(`${repairPath}: domain must be string`);
if (!isStringArray(repairAgent?.allowedTools)) errors.push(`${repairPath}: allowedTools must be string[]`);
if (!isStringArray(repairAgent?.deniedTools)) errors.push(`${repairPath}: deniedTools must be string[]`);
if (!isStringArray(repairAgent?.requiresApprovalFor)) errors.push(`${repairPath}: requiresApprovalFor must be string[]`);
if (!repairAgent?.limits || typeof repairAgent.limits !== "object") errors.push(`${repairPath}: limits must be object`);
if (repairAgent?.limits?.maxSteps !== undefined && (typeof repairAgent.limits.maxSteps !== "number" || !Number.isFinite(repairAgent.limits.maxSteps))) {
  errors.push(`${repairPath}: limits.maxSteps must be a finite number when provided`);
}
if (repairAgent?.limits?.maxCostUsd !== undefined && (typeof repairAgent.limits.maxCostUsd !== "number" || !Number.isFinite(repairAgent.limits.maxCostUsd))) {
  errors.push(`${repairPath}: limits.maxCostUsd must be a finite number when provided`);
}

// production-deploy-policy.json
if (!productionDeploy || typeof productionDeploy !== "object") errors.push(`${prodPath}: must be an object`);
if (!isNonEmptyString(productionDeploy?.name)) errors.push(`${prodPath}: name must be string`);
if (!isNonEmptyString(productionDeploy?.resourceType)) errors.push(`${prodPath}: resourceType must be string`);
if (!Array.isArray(productionDeploy?.rules) || productionDeploy.rules.length === 0) errors.push(`${prodPath}: rules must be non-empty array`);
if (Array.isArray(productionDeploy?.rules)) {
  productionDeploy.rules.forEach((rule, i) => {
    if (!rule || typeof rule !== "object") return errors.push(`${prodPath}: rules[${i}] must be object`);
    const env = rule?.match?.environment;
    if (!isNonEmptyString(env)) errors.push(`${prodPath}: rules[${i}].match.environment must be string`);
    if (!Array.isArray(rule.requiredApprovals) || rule.requiredApprovals.length === 0) {
      errors.push(`${prodPath}: rules[${i}].requiredApprovals must be non-empty array`);
    } else {
      rule.requiredApprovals.forEach((ra, j) => {
        if (!isNonEmptyString(ra?.role)) errors.push(`${prodPath}: rules[${i}].requiredApprovals[${j}].role must be string`);
        if (typeof ra?.count !== "number" || !Number.isFinite(ra.count)) {
          errors.push(`${prodPath}: rules[${i}].requiredApprovals[${j}].count must be finite number`);
        }
      });
    }
    if (!isNonEmptyString(rule?.mode)) errors.push(`${prodPath}: rules[${i}].mode must be string`);
  });
}

// repair-agent-policy.json
if (!repairAgentPolicy || typeof repairAgentPolicy !== "object") errors.push(`${repairPolicyPath}: must be an object`);
if (!isNonEmptyString(repairAgentPolicy?.name)) errors.push(`${repairPolicyPath}: name must be string`);
if (!isStringArray(repairAgentPolicy?.allowedTools)) errors.push(`${repairPolicyPath}: allowedTools must be string[]`);
if (!isStringArray(repairAgentPolicy?.deniedTools)) errors.push(`${repairPolicyPath}: deniedTools must be string[]`);
if (!isStringArray(repairAgentPolicy?.requiresApprovalFor)) errors.push(`${repairPolicyPath}: requiresApprovalFor must be string[]`);
if (!repairAgentPolicy?.environmentConstraints || typeof repairAgentPolicy.environmentConstraints !== "object") {
  errors.push(`${repairPolicyPath}: environmentConstraints must be object`);
} else {
  if (!isStringArray(repairAgentPolicy.environmentConstraints.allowedEnvironments)) {
    errors.push(`${repairPolicyPath}: environmentConstraints.allowedEnvironments must be string[]`);
  }
  if (!isStringArray(repairAgentPolicy.environmentConstraints.blockedEnvironments)) {
    errors.push(`${repairPolicyPath}: environmentConstraints.blockedEnvironments must be string[]`);
  }
}

// v3-governance-gate-policy.json
if (v3Policy) {
  const { filePath: v3PolicyPath, data: v3GatePolicy } = v3Policy;
  if (!v3GatePolicy || typeof v3GatePolicy !== "object") {
    errors.push(`${v3PolicyPath}: must be an object`);
  } else {
    if (!isNonEmptyString(v3GatePolicy?.name)) errors.push(`${v3PolicyPath}: name must be string`);
    if (!isNonEmptyString(v3GatePolicy?.version)) errors.push(`${v3PolicyPath}: version must be string`);
    if (!isNonEmptyString(v3GatePolicy?.mode)) errors.push(`${v3PolicyPath}: mode must be string`);
    if (!Array.isArray(v3GatePolicy?.requiredChecks) || v3GatePolicy.requiredChecks.length === 0) {
      errors.push(`${v3PolicyPath}: requiredChecks must be non-empty array`);
    } else {
      const ids = new Set();
      v3GatePolicy.requiredChecks.forEach((check, i) => {
        if (!check || typeof check !== "object") return errors.push(`${v3PolicyPath}: requiredChecks[${i}] must be object`);
        if (!isNonEmptyString(check.id)) {
          errors.push(`${v3PolicyPath}: requiredChecks[${i}].id must be string`);
        } else if (ids.has(check.id)) {
          errors.push(`${v3PolicyPath}: duplicated requiredChecks id "${check.id}"`);
        } else {
          ids.add(check.id);
        }
        if (!isNonEmptyString(check.description)) errors.push(`${v3PolicyPath}: requiredChecks[${i}].description must be string`);
        if (!isNonEmptyString(check.command)) {
          errors.push(`${v3PolicyPath}: requiredChecks[${i}].command must be string`);
        } else if (!check.command.trim().startsWith("node scripts/")) {
          errors.push(`${v3PolicyPath}: requiredChecks[${i}].command must start with "node scripts/"`);
        }
        if (typeof check.blocking !== "boolean") errors.push(`${v3PolicyPath}: requiredChecks[${i}].blocking must be boolean`);
      });
    }
  }
}

if (errors.length) {
  console.error("Governance config validation FAILED:");
  for (const e of errors) console.error(" -", e);
  process.exitCode = 1;
} else {
  console.log("Governance config validation PASSED");
}

