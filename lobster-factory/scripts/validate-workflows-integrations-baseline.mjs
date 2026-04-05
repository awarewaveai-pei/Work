#!/usr/bin/env node
/**
 * Structural gate: hosting resolver + provider stub + local artifact sink + task wiring.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const required = [
  "packages/workflows/src/hosting/types.ts",
  "packages/workflows/src/hosting/mockStagingAdapter.ts",
  "packages/workflows/src/hosting/providerStubAdapter.ts",
  "packages/workflows/src/hosting/resolveStagingProvisioning.ts",
  "packages/workflows/src/artifacts/localArtifactSink.ts",
  "packages/workflows/src/artifacts/artifactMode.ts",
  "packages/workflows/src/artifacts/remotePutArtifactSink.ts",
  "docs/operations/REMOTE_PUT_ARTIFACTS.md",
  "packages/workflows/src/trigger/create-wp-site.ts",
  "packages/workflows/src/trigger/apply-manifest.ts",
  "docs/hosting/MOCK_HOSTING_ADAPTER.md",
  "docs/hosting/HOSTING_ADAPTER_CONTRACT.md",
  "docs/operations/LOCAL_ARTIFACTS_SINK.md",
  "packages/workflows/src/hosting/providers/README.md",
  "packages/workflows/src/hosting/providers/stagingProvisionContract.ts",
  "packages/workflows/src/hosting/providers/httpJsonStagingAdapter.ts",
  "docs/hosting/HTTP_JSON_HOSTING_ADAPTER.md",
  "scripts/print-create-wp-site-payload.mjs",
  "scripts/print-apply-manifest-payload.mjs",
  "docs/operations/LOBSTER_FACTORY_OPERATOR_RUNBOOK.md",
  "docs/e2e/OPERABLE_E2E_PLAYBOOK.md",
  "docs/operations/ARTIFACTS_LIFECYCLE_POLICY.md",
  "scripts/validate-operable-e2e-skeleton.mjs",
  "docs/operations/PRESIGN_BROKER_MINIMAL.md",
  "templates/lobster/presign-response.success.example.json",
];

for (const rel of required) {
  const p = path.join(repoRoot, rel);
  if (!fs.existsSync(p)) throw new Error(`Missing workflows integration file: ${rel}`);
}

const cws = fs.readFileSync(
  path.join(repoRoot, "packages/workflows/src/trigger/create-wp-site.ts"),
  "utf8"
);
if (!cws.includes("resolveStagingProvisioning")) {
  throw new Error("create-wp-site.ts must use resolveStagingProvisioning");
}
if (!cws.includes("blocked_hosting_configuration")) {
  throw new Error("create-wp-site.ts must handle blocked hosting");
}

const am = fs.readFileSync(
  path.join(repoRoot, "packages/workflows/src/trigger/apply-manifest.ts"),
  "utf8"
);
if (!am.includes("writeApplyManifestLocalArtifacts")) {
  throw new Error("apply-manifest.ts must wire local artifact sink");
}
if (!am.includes("writeApplyManifestRemotePutArtifacts") || !am.includes("getArtifactsMode")) {
  throw new Error("apply-manifest.ts must wire remote PUT artifact sink");
}

const provReadme = fs.readFileSync(
  path.join(repoRoot, "packages/workflows/src/hosting/providers/README.md"),
  "utf8"
);
if (!provReadme.includes("StagingProvisionAdapter")) {
  throw new Error("providers/README.md must reference StagingProvisionAdapter");
}

const resolveHost = fs.readFileSync(
  path.join(repoRoot, "packages/workflows/src/hosting/resolveStagingProvisioning.ts"),
  "utf8"
);
if (!resolveHost.includes("http_json") || !resolveHost.includes("provisionHttpJsonStaging")) {
  throw new Error("resolveStagingProvisioning must wire http_json adapter");
}

const applyPayload = fs.readFileSync(
  path.join(repoRoot, "scripts", "print-apply-manifest-payload.mjs"),
  "utf8"
);
if (!applyPayload.includes("environmentType") || !applyPayload.includes("staging")) {
  throw new Error("print-apply-manifest-payload.mjs must enforce staging payload");
}

const runbook = fs.readFileSync(
  path.join(repoRoot, "docs", "operations", "LOBSTER_FACTORY_OPERATOR_RUNBOOK.md"),
  "utf8"
);
if (!runbook.includes("operator:sanity") || !runbook.includes("payload:apply-manifest")) {
  throw new Error("LOBSTER_FACTORY_OPERATOR_RUNBOOK.md must document sanity + payloads");
}

const operable = fs.readFileSync(
  path.join(repoRoot, "docs", "e2e", "OPERABLE_E2E_PLAYBOOK.md"),
  "utf8"
);
if (!operable.includes("A10") || !operable.includes("verify-build-gates")) {
  throw new Error("OPERABLE_E2E_PLAYBOOK.md must reference A10 and verify-build-gates");
}

console.log("Workflows integrations baseline validation PASSED ✅");
