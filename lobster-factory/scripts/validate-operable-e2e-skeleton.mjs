#!/usr/bin/env node
/**
 * A10 structural gate: operable E2E playbook + artifacts lifecycle policy exist and reference core flows.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const workRoot = path.resolve(repoRoot, "..");

const required = [
  "docs/e2e/OPERABLE_E2E_PLAYBOOK.md",
  "docs/operations/ARTIFACTS_LIFECYCLE_POLICY.md",
  "docs/operations/PRESIGN_BROKER_MINIMAL.md",
  "templates/lobster/presign-response.success.example.json",
];

for (const rel of required) {
  const p = path.join(repoRoot, rel);
  if (!fs.existsSync(p)) throw new Error(`Operable E2E gate: missing ${rel}`);
}

const playbook = fs.readFileSync(
  path.join(repoRoot, "docs/e2e/OPERABLE_E2E_PLAYBOOK.md"),
  "utf8"
);
const mustPlay = [
  "STAGING_PIPELINE_E2E_PAYLOAD",
  "operator:sanity",
  "run-staging-pipeline-regression",
  "emit-staging-drill-report",
  "apply-manifest",
  "create-wp-site",
  "WORKLOG.md",
];
for (const s of mustPlay) {
  if (!playbook.includes(s)) {
    throw new Error(`OPERABLE_E2E_PLAYBOOK.md must mention: ${s}`);
  }
}

const policy = fs.readFileSync(
  path.join(repoRoot, "docs/operations/ARTIFACTS_LIFECYCLE_POLICY.md"),
  "utf8"
);
for (const s of ["logs_ref", "local", "remote_put", "presigned"]) {
  if (!policy.includes(s)) {
    throw new Error(`ARTIFACTS_LIFECYCLE_POLICY.md must mention: ${s}`);
  }
}

const sopPath = path.join(workRoot, "agency-os", "tenants", "NEW_TENANT_ONBOARDING_SOP.md");
if (!fs.existsSync(sopPath)) {
  throw new Error(`Expected agency SOP at ${sopPath} (monorepo bridge)`);
}
const sop = fs.readFileSync(sopPath, "utf8");
if (!sop.includes("OPERABLE_E2E_PLAYBOOK.md") || !sop.includes("Step 7")) {
  throw new Error("NEW_TENANT_ONBOARDING_SOP.md must include Step 7 + OPERABLE_E2E_PLAYBOOK bridge");
}

const examplePath = path.join(repoRoot, "templates", "lobster", "presign-response.success.example.json");
const example = JSON.parse(fs.readFileSync(examplePath, "utf8"));
if (!example.puts?.["stdout.log"]?.url || !example.puts?.["meta.json"]?.url) {
  throw new Error("presign-response.success.example.json must have puts.stdout.log.url and puts.meta.json.url");
}

console.log("Operable E2E skeleton validation PASSED ✅");
