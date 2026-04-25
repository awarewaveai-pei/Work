import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../lib/ops-role";
import { getSupabaseWriteClient } from "../../../../lib/supabase-server";

interface AiImageJobRequest {
  organizationId?: string;
  workspaceId?: string;
  projectId?: string;
  siteId?: string;
  prompt?: string;
  modelName?: string;
  provider?: string;
  actorUserId?: string;
}

function validatePayload(payload: AiImageJobRequest): string | null {
  if (!payload.organizationId) return "organizationId is required";
  if (!payload.prompt || payload.prompt.trim().length < 3) return "prompt is required (min length 3)";
  if (!payload.modelName) return "modelName is required";
  if (!payload.provider) return "provider is required";
  return null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  const resolved = resolveOpsRole(request);
  const role = resolved.role;
  if (!canCreateAiImageJob(role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role }, { status: 403 });
  }

  let payload: AiImageJobRequest;
  try {
    payload = (await request.json()) as AiImageJobRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const validationError = validatePayload(payload);
  if (validationError) {
    return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
  }

  if (payload.actorUserId && !isUuid(payload.actorUserId)) {
    return NextResponse.json({ ok: false, error: "actorUserId must be a UUID when provided" }, { status: 400 });
  }

  const supabase = getSupabaseWriteClient();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        error: "supabase_write_not_configured",
        hint: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for mutating ops endpoints.",
      },
      { status: 503 },
    );
  }

  const traceId = crypto.randomUUID();
  const { data, error } = await supabase
    .from("ai_image_jobs")
    .insert({
      organization_id: payload.organizationId,
      workspace_id: payload.workspaceId ?? null,
      project_id: payload.projectId ?? null,
      site_id: payload.siteId ?? null,
      prompt: payload.prompt,
      model_name: payload.modelName,
      provider: payload.provider,
      status: "queued",
      trace_id: traceId,
      created_by: payload.actorUserId ?? null,
      metadata: {
        actor_role: role,
        role_source: resolved.source,
        source: "next-admin",
      },
    })
    .select("id,status,trace_id,created_at")
    .single();

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "insert_failed",
        details: error.message,
      },
      { status: 409 },
    );
  }

  await supabase.from("ops_audit_events").insert({
    organization_id: payload.organizationId,
    workspace_id: payload.workspaceId ?? null,
    actor_user_id: payload.actorUserId ?? null,
    actor_role: role,
    event_type: "ai_image_job_created",
    target_type: "ai_image_jobs",
    target_id: data.id,
    trace_id: data.trace_id,
    payload: {
      provider: payload.provider,
      model_name: payload.modelName,
      role_source: resolved.source,
    },
  });

  return NextResponse.json({
    ok: true,
    job: data,
  });
}
