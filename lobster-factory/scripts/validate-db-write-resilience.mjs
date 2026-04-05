import crypto from "node:crypto";

function getArg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (!hit) return fallback;
  return hit.slice(prefix.length);
}

const traceId = getArg("traceId", `resilience-${crypto.randomUUID()}`);
const execute = getArg("execute", "0") === "1";

const workflowRunRow = {
  id: crypto.randomUUID(),
  workflow_version_id: "d6d3cfe2-5aba-4458-84a6-37237d6df347",
  organization_id: "11111111-1111-1111-1111-111111111111",
  workspace_id: "22222222-2222-2222-2222-222222222222",
  project_id: "33333333-3333-3333-3333-333333333333",
  site_id: "44444444-4444-4444-4444-444444444444",
  environment_id: null,
  parent_run_id: null,
  trigger_type: "resilience-check",
  trigger_ref: "validate-db-write-resilience",
  actor_type: "system",
  actor_ref: null,
  status: "pending",
  risk_level: "medium",
  input_snapshot: { traceId },
  output_snapshot: {},
  artifacts: [],
};

const compensationPlan = {
  when: "workflow_runs insert succeeded but downstream failed",
  actions: [
    "patch workflow_runs.status=failed",
    "attach output_snapshot.error + traceId",
    "emit incident event for operator review",
  ],
};

if (!execute) {
  console.log(
    JSON.stringify(
      {
        mode: "dryrun",
        traceId,
        retryPolicy: {
          maxRetries: 2,
          baseDelayMs: 250,
          retryOn: [429, "5xx"],
        },
        observability: {
          includeTraceHeader: "x-lobster-trace-id",
          logFields: ["attempt", "status", "table", "traceId", "error"],
        },
        workflowRunRow,
        compensationPlan,
      },
      null,
      2
    )
  );
  process.exit(0);
}

const supabaseUrl = process.env.LOBSTER_SUPABASE_URL || "";
const serviceRoleKey = process.env.LOBSTER_SUPABASE_SERVICE_ROLE_KEY || "";
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing LOBSTER_SUPABASE_URL or LOBSTER_SUPABASE_SERVICE_ROLE_KEY while --execute=1"
  );
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
  "x-lobster-trace-id": traceId,
};

let attempts = 0;
let inserted = false;
let lastError = "";
for (let i = 0; i <= 2; i += 1) {
  attempts += 1;
  const res = await fetch(`${supabaseUrl}/rest/v1/workflow_runs`, {
    method: "POST",
    headers,
    body: JSON.stringify([workflowRunRow]),
  });
  if (res.ok) {
    inserted = true;
    break;
  }
  const text = await res.text().catch(() => "");
  lastError = `${res.status} ${res.statusText} ${text}`.trim();
  const retryable = res.status === 429 || res.status >= 500;
  if (!retryable || i === 2) break;
  await new Promise((r) => setTimeout(r, 250 * 2 ** i));
}

if (!inserted) {
  throw new Error(`Resilience check insert failed [traceId=${traceId}]: ${lastError}`);
}

console.log(
  JSON.stringify(
    {
      mode: "execute",
      traceId,
      attempts,
      insertedWorkflowRunId: workflowRunRow.id,
      compensationPlan,
      ok: true,
    },
    null,
    2
  )
);
