import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function assertExists(relPath) {
  const p = path.join(repoRoot, relPath);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing required file: ${relPath} (${p})`);
  }
}

// 1) structural presence checks
const required = [
  "packages/db/migrations/0001_core.sql",
  "packages/db/migrations/0002_factory.sql",
  "packages/db/migrations/0003_agents_approvals_observability.sql",
  "packages/db/migrations/0004_rls_helpers.sql",
  "packages/db/migrations/0005_seed_minimum.sql",
  "packages/db/migrations/0006_seed_catalog.sql",
  "packages/manifests/wc-core.json",
  "packages/agents/src/configs/repair-agent.json",
  "packages/policies/approval/production-deploy-policy.json",
  "packages/policies/approval/v3-governance-gate-policy.json",
  "packages/policies/approval/wordpress-factory-execution-policy.json",
  "packages/policies/tool/repair-agent-policy.json",
  "scripts/validate-manifests.mjs",
  "scripts/validate-governance-configs.mjs",
  "scripts/validate-workflow-routing-policy.mjs",
  "scripts/run-v3-governance-gates.mjs",
  "packages/workflows/src/executor/installManifestStaging.ts",
  "scripts/execute-apply-manifest-staging.mjs",
  "scripts/rollback-apply-manifest-staging.mjs",
  "scripts/run-staging-pipeline-regression.mjs",
  "scripts/validate-staging-manifest-executor.mjs",
  "templates/woocommerce/scripts/rollback-from-manifest.sh",
  "docs/e2e/STAGING_PIPELINE_E2E_PAYLOAD.md",
  "docs/e2e/STAGING_PIPELINE_DRILL_REPORT_TEMPLATE.md",
  "docs/hosting/MOCK_HOSTING_ADAPTER.md",
  "packages/workflows/src/hosting/types.ts",
  "packages/workflows/src/hosting/mockStagingAdapter.ts",
  "packages/workflows/src/hosting/providerStubAdapter.ts",
  "packages/workflows/src/hosting/resolveStagingProvisioning.ts",
  "packages/workflows/src/artifacts/localArtifactSink.ts",
  "docs/hosting/HOSTING_ADAPTER_CONTRACT.md",
  "docs/hosting/HTTP_JSON_HOSTING_ADAPTER.md",
  "packages/workflows/src/hosting/providers/httpJsonStagingAdapter.ts",
  "docs/operations/LOCAL_ARTIFACTS_SINK.md",
  "docs/operations/REMOTE_PUT_ARTIFACTS.md",
  "packages/workflows/src/artifacts/artifactMode.ts",
  "packages/workflows/src/artifacts/remotePutArtifactSink.ts",
  "scripts/validate-workflows-integrations-baseline.mjs",
  "scripts/emit-staging-drill-report.mjs",
  "scripts/print-create-wp-site-payload.mjs",
  "packages/workflows/src/hosting/providers/README.md",
  "packages/workflows/src/hosting/providers/stagingProvisionContract.ts",
  "scripts/print-apply-manifest-payload.mjs",
  "docs/operations/LOBSTER_FACTORY_OPERATOR_RUNBOOK.md",
  "docs/e2e/OPERABLE_E2E_PLAYBOOK.md",
  "docs/operations/ARTIFACTS_LIFECYCLE_POLICY.md",
  "docs/operations/PRESIGN_BROKER_MINIMAL.md",
  "templates/lobster/presign-response.success.example.json",
  "scripts/validate-operable-e2e-skeleton.mjs",
  "scripts/validate-artifacts-governance.mjs",
  "scripts/audit-artifacts-governance.mjs",
  "docs/operations/ARTIFACTS_IAM_BOUNDARY.md",
  "docs/operations/R2_TO_S3_MIGRATION_RUNBOOK.md",
  "policies/artifacts/artifacts-governance-baseline.json",
];

for (const r of required) assertExists(r);

// 2) run content validation
console.log("Running manifest validation...");
execSync(`node "${path.join(repoRoot, "scripts", "validate-manifests.mjs")}"`, {
  stdio: "inherit",
});

console.log("Running governance validation...");
execSync(`node "${path.join(repoRoot, "scripts", "validate-governance-configs.mjs")}"`, {
  stdio: "inherit",
});

console.log("Running V3 governance gates...");
execSync(`node "${path.join(repoRoot, "scripts", "run-v3-governance-gates.mjs")}"`, {
  stdio: "inherit",
});

console.log("Running workflow routing policy validation...");
execSync(`node "${path.join(repoRoot, "scripts", "validate-workflow-routing-policy.mjs")}"`, {
  stdio: "inherit",
});

console.log("Running workflows integrations baseline validation...");
execSync(`node "${path.join(repoRoot, "scripts", "validate-workflows-integrations-baseline.mjs")}"`, {
  stdio: "inherit",
});

console.log("Running staging manifest executor structural validation...");
execSync(`node "${path.join(repoRoot, "scripts", "validate-staging-manifest-executor.mjs")}"`, {
  stdio: "inherit",
});

console.log("Running operable E2E skeleton validation...");
execSync(`node "${path.join(repoRoot, "scripts", "validate-operable-e2e-skeleton.mjs")}"`, {
  stdio: "inherit",
});

console.log("Running artifacts governance validation...");
execSync(`node "${path.join(repoRoot, "scripts", "validate-artifacts-governance.mjs")}"`, {
  stdio: "inherit",
});

console.log("Running doc link + canonical integrity...");
execSync(`node "${path.join(repoRoot, "scripts", "validate-doc-integrity.mjs")}"`, {
  stdio: "inherit",
  env: {
    ...process.env,
    LOBSTER_WORK_ROOT: path.resolve(repoRoot, ".."),
  },
});

console.log("Bootstrap validation PASSED ✅");

