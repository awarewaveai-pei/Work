import crypto from "node:crypto";

function getArg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (!hit) return fallback;
  return hit.slice(prefix.length);
}

function requiredArg(name) {
  const v = getArg(name);
  if (!v) throw new Error(`Missing required arg: --${name}=...`);
  return v;
}

function assert(cond, msg) {
  if (!cond) throw new Error(`Validation failed: ${msg}`);
}

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(v || "")
  );
}

const input = {
  organizationId: requiredArg("organizationId"),
  workspaceId: requiredArg("workspaceId"),
  siteId: requiredArg("siteId"),
  environmentId: requiredArg("environmentId"),
  workflowRunId: requiredArg("workflowRunId"),
  packageVersionId: getArg(
    "packageVersionId",
    "9819a867-36b9-4470-bdb9-611a0751dba6"
  ),
  manifestId: getArg("manifestId", "8760d0ba-35ae-483a-8fa6-abd19f5c6d4d"),
  manifestPath: getArg("manifestPath", "packages/manifests/wc-core.json"),
  wpRootPath: getArg("wpRootPath", "D:\\Work\\dummy"),
};

for (const [k, v] of Object.entries(input)) {
  if (k.endsWith("Path")) continue;
  assert(isUuid(v), `${k} must be uuid`);
}

const installRunId = crypto.randomUUID();
const nowIso = new Date().toISOString();

const insertRow = {
  id: installRunId,
  organization_id: input.organizationId,
  workspace_id: input.workspaceId,
  site_id: input.siteId,
  environment_id: input.environmentId,
  package_version_id: input.packageVersionId,
  manifest_id: input.manifestId,
  workflow_run_id: input.workflowRunId,
  triggered_by_user_id: null,
  triggered_by_agent_id: null,
  status: "pending",
  result_summary: {},
  logs_ref: null,
  rollback_run_id: null,
  metadata: {
    manifestPath: input.manifestPath,
    wpRootPath: input.wpRootPath,
    environmentType: "staging",
  },
};

const updates = [
  {
    step: "mark_running",
    patch: {
      status: "running",
      started_at: nowIso,
      result_summary: { phase: "install_started" },
    },
  },
  {
    step: "mark_completed",
    patch: {
      status: "completed",
      ended_at: new Date().toISOString(),
      result_summary: { phase: "install_completed", checks: ["homepage", "plugins"] },
      logs_ref: "logs://package-install-runs/example",
    },
  },
];

const execute = getArg("execute", "0") === "1";
const supabaseUrl = process.env.LOBSTER_SUPABASE_URL || "";
const serviceRoleKey = process.env.LOBSTER_SUPABASE_SERVICE_ROLE_KEY || "";

if (!execute) {
  console.log(
    JSON.stringify(
      {
        mode: "dryrun",
        message:
          "Set --execute=1 with LOBSTER_SUPABASE_URL and LOBSTER_SUPABASE_SERVICE_ROLE_KEY to execute insert and status transitions.",
        table: "package_install_runs",
        insertRow,
        updates,
      },
      null,
      2
    )
  );
  process.exit(0);
}

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing LOBSTER_SUPABASE_URL or LOBSTER_SUPABASE_SERVICE_ROLE_KEY while --execute=1"
  );
}

const baseHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const insertRes = await fetch(`${supabaseUrl}/rest/v1/package_install_runs`, {
  method: "POST",
  headers: baseHeaders,
  body: JSON.stringify([insertRow]),
});
if (!insertRes.ok) {
  const text = await insertRes.text().catch(() => "");
  throw new Error(`Insert failed: ${insertRes.status} ${insertRes.statusText} ${text}`);
}

for (const u of updates) {
  const patchRes = await fetch(
    `${supabaseUrl}/rest/v1/package_install_runs?id=eq.${installRunId}`,
    {
      method: "PATCH",
      headers: baseHeaders,
      body: JSON.stringify(u.patch),
    }
  );
  if (!patchRes.ok) {
    const text = await patchRes.text().catch(() => "");
    throw new Error(
      `Update failed at ${u.step}: ${patchRes.status} ${patchRes.statusText} ${text}`
    );
  }
}

console.log(
  JSON.stringify(
    {
      mode: "execute",
      table: "package_install_runs",
      installRunId,
      flow: ["pending", "running", "completed"],
      ok: true,
    },
    null,
    2
  )
);
