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
  projectId: requiredArg("projectId"),
  siteId: requiredArg("siteId"),
  siteName: getArg("siteName", "workflow-run-writecheck"),
  workflowVersionId: getArg(
    "workflowVersionId",
    "d6d3cfe2-5aba-4458-84a6-37237d6df347" // create-wp-site workflow version
  ),
};

assert(isUuid(input.organizationId), "organizationId must be uuid");
assert(isUuid(input.workspaceId), "workspaceId must be uuid");
assert(isUuid(input.projectId), "projectId must be uuid");
assert(isUuid(input.siteId), "siteId must be uuid");
assert(isUuid(input.workflowVersionId), "workflowVersionId must be uuid");

const row = {
  id: crypto.randomUUID(),
  workflow_version_id: input.workflowVersionId,
  organization_id: input.organizationId,
  workspace_id: input.workspaceId,
  project_id: input.projectId,
  site_id: input.siteId,
  environment_id: null,
  parent_run_id: null,
  trigger_type: "create-wp-site",
  trigger_ref: input.siteName,
  actor_type: "system",
  actor_ref: null,
  status: "pending",
  risk_level: "medium",
  input_snapshot: {
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    siteId: input.siteId,
    siteName: input.siteName,
  },
  output_snapshot: {},
  artifacts: [],
};

const execute = getArg("execute", "0") === "1";
const supabaseUrl = process.env.LOBSTER_SUPABASE_URL || "";
const serviceRoleKey = process.env.LOBSTER_SUPABASE_SERVICE_ROLE_KEY || "";

if (!execute) {
  console.log(
    JSON.stringify(
      {
        mode: "dryrun",
        message:
          "Set --execute=1 with LOBSTER_SUPABASE_URL and LOBSTER_SUPABASE_SERVICE_ROLE_KEY to perform actual insert.",
        table: "workflow_runs",
        row,
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

const res = await fetch(`${supabaseUrl}/rest/v1/workflow_runs`, {
  method: "POST",
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  },
  body: JSON.stringify([row]),
});

if (!res.ok) {
  const text = await res.text().catch(() => "");
  throw new Error(`Supabase insert failed: ${res.status} ${res.statusText} ${text}`);
}

const json = await res.json();
const inserted = Array.isArray(json) ? json[0] : null;
assert(inserted && inserted.id === row.id, "insert response must contain inserted row id");

console.log(
  JSON.stringify(
    {
      mode: "execute",
      table: "workflow_runs",
      insertedId: row.id,
      ok: true,
    },
    null,
    2
  )
);
