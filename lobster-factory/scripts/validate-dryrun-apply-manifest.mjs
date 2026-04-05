import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

function getArg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (!hit) throw new Error(`Missing required arg: --${name}=...`);
  return hit.slice(prefix.length);
}

function getMode() {
  const prefix = `--mode=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (!hit) return "strict";
  const mode = hit.slice(prefix.length).toLowerCase();
  if (mode !== "strict" && mode !== "fast") {
    throw new Error(`Invalid --mode=${mode} (expected strict|fast)`);
  }
  return mode;
}

function assert(cond, msg) {
  if (!cond) {
    throw new Error(`Validation failed: ${msg}`);
  }
}

function parseJsonMaybe(raw) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Dryrun output is not valid JSON: ${String(e?.message || e)}`);
  }
}

const args = {
  organizationId: getArg("organizationId"),
  workspaceId: getArg("workspaceId"),
  projectId: getArg("projectId"),
  siteId: getArg("siteId"),
  environmentId: getArg("environmentId"),
  wpRootPath: getArg("wpRootPath"),
  environmentType: getArg("environmentType"),
};

const mode = getMode();

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const dryrunScript = path.resolve(currentDir, "dryrun-apply-manifest.mjs");

const raw = execFileSync(
  process.execPath,
  [
    dryrunScript,
    `--organizationId=${args.organizationId}`,
    `--workspaceId=${args.workspaceId}`,
    `--projectId=${args.projectId}`,
    `--siteId=${args.siteId}`,
    `--environmentId=${args.environmentId}`,
    `--wpRootPath=${args.wpRootPath}`,
    `--environmentType=${args.environmentType}`,
  ],
  { encoding: "utf8" }
);

const data = parseJsonMaybe(raw);

// 1) installPlan gates
assert(data?.installPlan?.name === "wc-core", `installPlan.name must be "wc-core"`);
assert(
  data?.installPlan?.guardrails?.blockIfProduction === true,
  `installPlan.guardrails.blockIfProduction must be true`
);
assert(
  Array.isArray(data?.installPlan?.guardrails?.allowEnvironments) &&
    data.installPlan.guardrails.allowEnvironments.includes("staging"),
  `installPlan.guardrails.allowEnvironments must include "staging"`
);

// 2) row payload gates
assert(
  data?.workflowRunRow?.status === "pending",
  `workflowRunRow.status must be "pending"`
);
assert(
  data?.packageInstallRunRow?.status === "pending",
  `packageInstallRunRow.status must be "pending"`
);

// 3) FK/catalog ID gates
assert(
  data?.packageInstallRunRow?.package_version_id ===
    "9819a867-36b9-4470-bdb9-611a0751dba6",
  `packageInstallRunRow.package_version_id mismatch`
);
assert(
  data?.packageInstallRunRow?.manifest_id ===
    "8760d0ba-35ae-483a-8fa6-abd19f5c6d4d",
  `packageInstallRunRow.manifest_id mismatch`
);

assert(
  data?.workflowRunRow?.workflow_version_id ===
    "0161fdd2-2381-4ab5-bcf9-fe247507ac05",
  `workflowRunRow.workflow_version_id mismatch`
);

// 4) SQL template gates (cheap string checks)
if (mode === "strict") {
  assert(
    String(data?.dbWorkflowRunInsert || "").includes("insert into workflow_runs"),
    `dbWorkflowRunInsert must insert into workflow_runs`
  );
  assert(
    String(data?.dbPackageInstallRunInsert || "").includes(
      "insert into package_install_runs"
    ),
    `dbPackageInstallRunInsert must insert into package_install_runs`
  );
}

console.log(`Dryrun apply-manifest validation PASSED ✅ (mode=${mode})`);

