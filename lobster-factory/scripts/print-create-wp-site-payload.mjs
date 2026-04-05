#!/usr/bin/env node
/**
 * Print JSON payload for Trigger `create-wp-site` (copy-paste / CI artifact).
 * Uses same tenant UUIDs as docs/e2e/STAGING_PIPELINE_E2E_PAYLOAD.md (plus siteName).
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
};

function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`
Usage: node scripts/print-create-wp-site-payload.mjs [--siteName=My Staging] [--manifestSlug=wc-core]

Env (runtime on worker):
  LOBSTER_HOSTING_ADAPTER=none|mock|provider_stub|http_json
  LOBSTER_ENABLE_DB_WRITES, LOBSTER_SUPABASE_* (optional)
`);
    return;
  }

  const siteName = getArg("siteName", "demo-staging-site");
  const manifestSlug = getArg("manifestSlug", "wc-core");
  if (manifestSlug !== "wc-core") {
    throw new Error('Phase 1 only supports manifestSlug="wc-core"');
  }

  const payload = {
    organizationId: getArg("organizationId", DEFAULT.organizationId),
    workspaceId: getArg("workspaceId", DEFAULT.workspaceId),
    projectId: getArg("projectId", DEFAULT.projectId),
    siteId: getArg("siteId", DEFAULT.siteId),
    siteName,
    manifestSlug,
  };

  console.log(JSON.stringify(payload, null, 2));
  console.error(
    "\n# Tip: mock → mock_staging_provisioned; http_json (with URL+token) → vendor_staging_provisioned; none → pending_next_step."
  );
}

try {
  main();
} catch (e) {
  console.error(e?.stack || String(e));
  process.exitCode = 1;
}
