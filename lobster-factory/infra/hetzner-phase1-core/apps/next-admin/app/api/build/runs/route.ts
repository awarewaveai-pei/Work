import { NextResponse } from "next/server";
import {
  buildConsolePlan,
  normalizeBuildRequest,
  validateBuildRequest,
  type BuildRunRequest,
  type BuildRunStatus,
} from "../../../../lib/build-console/contracts";
import { resolveOpsRole } from "../../../../lib/ops-role";
import { getSupabaseWriteClient } from "../../../../lib/supabase-server";

function canCreateBuildRun(role: string): boolean {
  return role === "owner" || role === "admin" || role === "operator";
}

async function parseBody(request: Request): Promise<BuildRunRequest | null> {
  try {
    return (await request.json()) as BuildRunRequest;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const resolved = resolveOpsRole(request);
  const role = resolved.role;
  if (!canCreateBuildRun(role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role }, { status: 403 });
  }

  const body = await parseBody(request);
  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const input = normalizeBuildRequest(body);
  const errors = validateBuildRequest(input);
  if (errors.length) {
    return NextResponse.json({ ok: false, error: "validation_failed", details: errors.join("; ") }, { status: 400 });
  }

  const plan = buildConsolePlan(input);
  const requestedMode = input.executionMode ?? "plan_only";
  if (requestedMode === "enqueue" && plan.blockers.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "profile_gate_blocked",
        details: plan.blockers.join("; "),
        plan,
      },
      { status: 409 },
    );
  }

  const runId = crypto.randomUUID();
  const traceId = `build-console-${runId}`;
  const createdAt = new Date().toISOString();

  let status: BuildRunStatus = plan.blockers.length ? "blocked" : "planned";
  let supabaseRunId: string | undefined;
  const dbWrite = {
    attempted: requestedMode === "enqueue",
    executed: false,
    table: requestedMode === "enqueue" ? ("ops_action_runs" as const) : null,
    error: undefined as string | undefined,
  };

  if (requestedMode === "enqueue") {
    const supabase = getSupabaseWriteClient();
    if (!supabase) {
      return NextResponse.json(
        {
          ok: false,
          error: "supabase_write_not_configured",
          details: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enqueue guarded build runs.",
          plan,
        },
        { status: 503 },
      );
    }

    const { data: action, error: actionError } = await supabase
      .from("ops_action_catalog")
      .select("id,enabled")
      .eq("action_key", plan.actionKey)
      .single();

    if (actionError || !action?.id) {
      return NextResponse.json(
        {
          ok: false,
          error: "action_catalog_missing",
          details: actionError?.message ?? `Missing ${plan.actionKey}`,
          plan,
        },
        { status: 409 },
      );
    }

    if (action.enabled === false) {
      return NextResponse.json(
        {
          ok: false,
          error: "action_disabled",
          details: `${plan.actionKey} is disabled in ops_action_catalog`,
          plan,
        },
        { status: 409 },
      );
    }

    const { data: inserted, error: insertError } = await supabase
      .from("ops_action_runs")
      .insert({
        id: runId,
        action_id: action.id,
        organization_id: input.organizationId,
        workspace_id: input.workspaceId ?? null,
        project_id: input.projectId ?? null,
        site_id: input.siteId ?? null,
        environment_id: null,
        actor_user_id: input.actorUserId ?? null,
        actor_role: role,
        status: "pending",
        approval_required: plan.approvalRequired,
        approval_status: plan.approvalRequired ? "pending" : "none",
        trace_id: traceId,
        input_payload: input,
        output_payload: { plan },
        metadata: {
          source: "build-console",
          role_source: resolved.source,
          profile: plan.profile,
          workflow_id: plan.workflowId,
          apply_mode: plan.applyMode,
          smoke_profile: plan.smokeProfile,
        },
      })
      .select("id")
      .single();

    if (insertError) {
      dbWrite.error = insertError.message;
      return NextResponse.json(
        {
          ok: false,
          error: "enqueue_failed",
          details: insertError.message,
          plan,
        },
        { status: 409 },
      );
    }

    await supabase.from("ops_audit_events").insert({
      organization_id: input.organizationId,
      workspace_id: input.workspaceId ?? null,
      actor_user_id: input.actorUserId ?? null,
      actor_role: role,
      event_type: "build_run_enqueued",
      target_type: "ops_action_runs",
      target_id: inserted.id,
      trace_id: traceId,
      payload: {
        profile: plan.profile,
        action_key: plan.actionKey,
        workflow_id: plan.workflowId,
        approval_required: plan.approvalRequired,
        role_source: resolved.source,
      },
    });

    dbWrite.executed = true;
    supabaseRunId = inserted.id;
    status = "queued";
  }

  return NextResponse.json({
    ok: true,
    run: {
      id: runId,
      traceId,
      status,
      executionMode: requestedMode,
      createdAt,
      plan,
      inputSnapshot: input,
      supabaseRunId,
      dbWrite,
    },
  });
}
