import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
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
  if (!v) throw new Error(`Missing required arg: --${name}`);
  return v;
}

function escapeSqlString(s) {
  return String(s).replace(/'/g, "''");
}

function buildWorkflowRunInsertSql(spec) {
  const columns = [
    "id",
    "workflow_version_id",
    "organization_id",
    "workspace_id",
    "project_id",
    "site_id",
    "environment_id",
    "parent_run_id",
    "trigger_type",
    "trigger_ref",
    "actor_type",
    "actor_ref",
    "status",
    "risk_level",
    "input_snapshot",
    "output_snapshot",
    "artifacts",
  ];

  const values = [
    `'${escapeSqlString(spec.id)}'`,
    `'${escapeSqlString(spec.workflowVersionId)}'`,
    `'${escapeSqlString(spec.organizationId)}'`,
    spec.workspaceId ? `'${escapeSqlString(spec.workspaceId)}'` : "NULL",
    spec.projectId ? `'${escapeSqlString(spec.projectId)}'` : "NULL",
    spec.siteId ? `'${escapeSqlString(spec.siteId)}'` : "NULL",
    spec.environmentId ? `'${escapeSqlString(spec.environmentId)}'` : "NULL",
    spec.parentRunId ? `'${escapeSqlString(spec.parentRunId)}'` : "NULL",
    `'${escapeSqlString(spec.triggerType)}'`,
    spec.triggerRef ? `'${escapeSqlString(spec.triggerRef)}'` : "NULL",
    `'${escapeSqlString(spec.actorType)}'`,
    spec.actorRef ? `'${escapeSqlString(spec.actorRef)}'` : "NULL",
    `'${escapeSqlString(spec.status)}'`,
    `'${escapeSqlString(spec.riskLevel)}'`,
    `'${escapeSqlString(JSON.stringify(spec.inputSnapshot))}'::jsonb`,
    `'${escapeSqlString(JSON.stringify(spec.outputSnapshot))}'::jsonb`,
    `'${escapeSqlString(JSON.stringify(spec.artifacts))}'::jsonb`,
  ];

  return `insert into workflow_runs (${columns.join(", ")}) values (${values.join(
    ", "
  )}) returning id;`;
}

function buildPackageInstallRunInsertSql(spec) {
  const columns = [
    "id",
    "organization_id",
    "workspace_id",
    "site_id",
    "environment_id",
    "package_version_id",
    "manifest_id",
    "workflow_run_id",
    "triggered_by_user_id",
    "triggered_by_agent_id",
    "status",
    "result_summary",
    "logs_ref",
    "rollback_run_id",
    "metadata",
  ];

  const values = [
    `'${escapeSqlString(spec.id)}'`,
    `'${escapeSqlString(spec.organizationId)}'`,
    `'${escapeSqlString(spec.workspaceId)}'`,
    `'${escapeSqlString(spec.siteId)}'`,
    `'${escapeSqlString(spec.environmentId)}'`,
    `'${escapeSqlString(spec.packageVersionId)}'`,
    `'${escapeSqlString(spec.manifestId)}'`,
    spec.workflowRunId ? `'${escapeSqlString(spec.workflowRunId)}'` : "NULL",
    spec.triggeredByUserId ? `'${escapeSqlString(spec.triggeredByUserId)}'` : "NULL",
    spec.triggeredByAgentId ? `'${escapeSqlString(spec.triggeredByAgentId)}'` : "NULL",
    `'${escapeSqlString(spec.status)}'`,
    `'${escapeSqlString(JSON.stringify(spec.resultSummary))}'::jsonb`,
    spec.logsRef ? `'${escapeSqlString(spec.logsRef)}'` : "NULL",
    spec.rollbackRunId ? `'${escapeSqlString(spec.rollbackRunId)}'` : "NULL",
    `'${escapeSqlString(JSON.stringify(spec.metadata))}'::jsonb`,
  ];

  return `insert into package_install_runs (${columns.join(", ")}) values (${values.join(
    ", "
  )}) returning id;`;
}

async function main() {
  // Required tenant fields
  const organizationId = requiredArg("organizationId");
  const workspaceId = requiredArg("workspaceId");
  const projectId = requiredArg("projectId");
  const siteId = requiredArg("siteId");
  const environmentId = requiredArg("environmentId");

  const wpRootPath = requiredArg("wpRootPath");
  const manifestPathArg = getArg("manifestPath", "packages/manifests/wc-core.json");
  const environmentType = getArg("environmentType", "staging");

  if (environmentType !== "staging") {
    throw new Error("This dryrun enforces staging-only for apply-manifest");
  }

  const manifestPath = path.isAbsolute(manifestPathArg)
    ? manifestPathArg
    : path.join(repoRoot, manifestPathArg);

  const raw = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(raw);

  // Phase 1 constraints
  if (manifest?.name !== "wc-core") {
    throw new Error(`dryrun apply-manifest only supports manifest.name="wc-core"`);
  }
  if (manifest?.target !== "staging-only") {
    throw new Error(`wc-core manifest target must be "staging-only"`);
  }
  if (!manifest?.guardrails?.blockIfProduction) {
    throw new Error(`manifest.guardrails.blockIfProduction must be true`);
  }
  const allow = manifest?.guardrails?.allowEnvironments;
  if (!Array.isArray(allow) || !allow.includes("staging")) {
    throw new Error(`manifest.guardrails.allowEnvironments must include "staging"`);
  }
  if (!Array.isArray(manifest?.steps) || manifest.steps.length === 0) {
    throw new Error(`manifest.steps must be non-empty array`);
  }

  const LobsterCatalogIds = {
    wcCore: {
      packageVersionId: "9819a867-36b9-4470-bdb9-611a0751dba6",
      manifestId: "8760d0ba-35ae-483a-8fa6-abd19f5c6d4d",
    },
    workflows: {
      applyManifestWorkflowVersionId: "0161fdd2-2381-4ab5-bcf9-fe247507ac05",
    },
  };

  const workflowRunId = crypto.randomUUID();
  const packageInstallRunId = crypto.randomUUID();

  const dbWorkflowRunInsert = buildWorkflowRunInsertSql({
    id: workflowRunId,
    workflowVersionId: LobsterCatalogIds.workflows.applyManifestWorkflowVersionId,
    organizationId,
    workspaceId,
    projectId,
    siteId,
    environmentId,
    parentRunId: null,
    triggerType: "apply-manifest",
    triggerRef: manifestPathArg,
    actorType: "system",
    actorRef: null,
    status: "pending",
    riskLevel: "medium",
    inputSnapshot: {
      environmentId,
      organizationId,
      workspaceId,
      projectId,
      siteId,
      wpRootPath,
      manifestPath: manifestPathArg,
      environmentType,
    },
    outputSnapshot: {},
    artifacts: [],
  });

  const dbPackageInstallRunInsert = buildPackageInstallRunInsertSql({
    id: packageInstallRunId,
    organizationId,
    workspaceId,
    siteId,
    environmentId,
    packageVersionId: LobsterCatalogIds.wcCore.packageVersionId,
    manifestId: LobsterCatalogIds.wcCore.manifestId,
    workflowRunId,
    triggeredByUserId: null,
    triggeredByAgentId: null,
    status: "pending",
    resultSummary: {},
    logsRef: null,
    rollbackRunId: null,
    metadata: {
      manifestPath: manifestPathArg,
      wpRootPath,
      environmentType,
    },
  });

  const workflowRunRow = {
    id: workflowRunId,
    workflow_version_id: LobsterCatalogIds.workflows.applyManifestWorkflowVersionId,
    organization_id: organizationId,
    workspace_id: workspaceId,
    project_id: projectId,
    site_id: siteId,
    environment_id: environmentId,
    parent_run_id: null,
    trigger_type: "apply-manifest",
    trigger_ref: manifestPathArg,
    actor_type: "system",
    actor_ref: null,
    status: "pending",
    risk_level: "medium",
    input_snapshot: {
      environmentId,
      organizationId,
      workspaceId,
      projectId,
      siteId,
      wpRootPath,
      manifestPath: manifestPathArg,
      environmentType,
    },
    output_snapshot: {},
    artifacts: [],
  };

  const packageInstallRunRow = {
    id: packageInstallRunId,
    organization_id: organizationId,
    workspace_id: workspaceId,
    site_id: siteId,
    environment_id: environmentId,
    package_version_id: LobsterCatalogIds.wcCore.packageVersionId,
    manifest_id: LobsterCatalogIds.wcCore.manifestId,
    workflow_run_id: workflowRunId,
    triggered_by_user_id: null,
    triggered_by_agent_id: null,
    status: "pending",
    result_summary: {},
    logs_ref: null,
    rollback_run_id: null,
    metadata: {
      manifestPath: manifestPathArg,
      wpRootPath,
      environmentType,
    },
  };

  const installPlan = {
    name: manifest.name,
    version: manifest.version,
    steps: manifest.steps,
    postInstall: manifest.postInstall ?? [],
    verification: manifest.verification ?? [],
    rollback: manifest.rollback ?? { strategy: "restore_backup_snapshot" },
    guardrails: manifest.guardrails,
  };

  console.log(JSON.stringify({ installPlan, dbWorkflowRunInsert, dbPackageInstallRunInsert, workflowRunRow, packageInstallRunRow }, null, 2));
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exitCode = 1;
});

