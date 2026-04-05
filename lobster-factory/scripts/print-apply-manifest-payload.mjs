#!/usr/bin/env node
/**
 * Print JSON payload for Trigger `apply-manifest` (copy-paste / CI).
 * Tenant UUIDs align with docs/e2e/STAGING_PIPELINE_E2E_PAYLOAD.md.
 */
function getArg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (!hit) return fallback;
  return hit.slice(prefix.length);
}

const DEFAULT = {
  organizationId: "11111111-1111-1111-1111-111111111111",
  workspaceId: "22222222-2222-2222-2222-222222222222",
  projectId: "33333333-3333-3333-3333-333333333333",
  siteId: "44444444-4444-4444-4444-444444444444",
  environmentId: "55555555-5555-5555-5555-555555555555",
};

function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`
Usage: node scripts/print-apply-manifest-payload.mjs [options]

Options (all optional; defaults match E2E payload doc):
  --wpRootPath=     WordPress root (default: D:\\\\Work\\\\dummy for dry tooling)
  --manifestPath=   default packages/manifests/wc-core.json
  --organizationId= --workspaceId= --projectId= --siteId= --environmentId=

Env (worker):
  LOBSTER_EXECUTE_MANIFEST_STEPS, LOBSTER_MANIFEST_EXECUTION_MODE, LOBSTER_ENABLE_DB_WRITES, ...
`);
    return;
  }

  const wpRootPath = getArg("wpRootPath", "D:\\Work\\dummy");
  const manifestPath = getArg("manifestPath", "packages/manifests/wc-core.json");

  const payload = {
    organizationId: getArg("organizationId", DEFAULT.organizationId),
    workspaceId: getArg("workspaceId", DEFAULT.workspaceId),
    projectId: getArg("projectId", DEFAULT.projectId),
    siteId: getArg("siteId", DEFAULT.siteId),
    environmentId: getArg("environmentId", DEFAULT.environmentId),
    wpRootPath,
    manifestPath,
    environmentType: "staging",
  };

  console.log(JSON.stringify(payload, null, 2));
  console.error(
    "\n# Tip: shell off by default; LOBSTER_EXECUTE_MANIFEST_STEPS=true + LOBSTER_MANIFEST_EXECUTION_MODE=dry_run|apply on worker."
  );
}

try {
  main();
} catch (e) {
  console.error(e?.stack || String(e));
  process.exitCode = 1;
}
