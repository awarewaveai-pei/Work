import { NextResponse } from "next/server";
import { resolveOpsRole, canWriteTenantConfig } from "@/lib/ops-role";
import { timingSafeEqual } from "@/lib/ops-inbox/verifyIngestToken";
import { getSupabaseServerClient, getSupabaseWriteClient } from "@/lib/supabase-server";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Auth: ops-role (owner/admin/operator) OR x-ops-sync-key for n8n server-to-server.
const SYNC_KEY = process.env.OPS_PROXY_SHARED_SECRET ?? "";

type QuoteStatus = "none" | "draft" | "pending_approval" | "approved" | "rejected";

function resolveAuth(req: Request): { allowed: boolean; role: string } {
  const resolved = resolveOpsRole(req);
  const hasSyncKey = !!(SYNC_KEY && timingSafeEqual(req.headers.get("x-ops-sync-key") ?? "", SYNC_KEY));
  const allowed =
    canWriteTenantConfig(resolved.role) ||
    resolved.role === "operator" ||
    hasSyncKey;
  return { allowed, role: resolved.role };
}

// GET /api/onboarding/quote?intake_form_id=<uuid>
export async function GET(req: Request): Promise<Response> {
  const { allowed, role } = resolveAuth(req);
  if (!allowed) return NextResponse.json({ ok: false, error: "forbidden", role }, { status: 403 });

  const url = new URL(req.url);
  const intakeFormId = url.searchParams.get("intake_form_id");
  if (!intakeFormId) return NextResponse.json({ ok: false, error: "intake_form_id required" }, { status: 400 });

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });

  const { data, error } = await supabase
    .from("intake_forms")
    .select("id, quote_data, quote_status, status, form_data, organization_id")
    .eq("id", intakeFormId)
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  try { assertOrgAccess(req, (data as Record<string, unknown>).organization_id as string | null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  return NextResponse.json({ ok: true, quote_data: data.quote_data, quote_status: data.quote_status, intake_status: data.status });
}

// POST /api/onboarding/quote — create or update draft quote
// Body: { intake_form_id, quote_data }
export async function POST(req: Request): Promise<Response> {
  const { allowed, role } = resolveAuth(req);
  if (!allowed) return NextResponse.json({ ok: false, error: "forbidden", role }, { status: 403 });

  let body: { intake_form_id?: string; quote_data?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { intake_form_id, quote_data } = body;
  if (!intake_form_id) return NextResponse.json({ ok: false, error: "intake_form_id required" }, { status: 422 });
  if (quote_data === undefined) return NextResponse.json({ ok: false, error: "quote_data required" }, { status: 422 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });

  // Verify form exists and quote isn't already approved
  const { data: existing, error: fetchErr } = await supabase
    .from("intake_forms")
    .select("id, quote_status, organization_id")
    .eq("id", intake_form_id)
    .single();

  if (fetchErr || !existing) return NextResponse.json({ ok: false, error: "intake_form_not_found" }, { status: 404 });

  try { assertOrgAccess(req, (existing as Record<string, unknown>).organization_id as string | null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  if (existing.quote_status === "approved") {
    return NextResponse.json({ ok: false, error: "quote_already_approved", detail: "Cannot modify an approved quote" }, { status: 409 });
  }

  const { error } = await supabase
    .from("intake_forms")
    .update({ quote_data, quote_status: "draft" })
    .eq("id", intake_form_id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, quote_status: "draft" });
}

// PATCH /api/onboarding/quote — transition quote status
// Body: { intake_form_id, action: "send"|"approve"|"reject"|"reset" }
export async function PATCH(req: Request): Promise<Response> {
  const { allowed, role } = resolveAuth(req);
  if (!allowed) return NextResponse.json({ ok: false, error: "forbidden", role }, { status: 403 });

  let body: { intake_form_id?: string; action?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { intake_form_id, action } = body;
  if (!intake_form_id) return NextResponse.json({ ok: false, error: "intake_form_id required" }, { status: 422 });
  if (!action || !["send", "approve", "reject", "reset"].includes(action)) {
    return NextResponse.json({ ok: false, error: "action must be: send | approve | reject | reset" }, { status: 422 });
  }

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });

  const { data: existing, error: fetchErr } = await supabase
    .from("intake_forms")
    .select("id, quote_status, quote_data, organization_id")
    .eq("id", intake_form_id)
    .single();

  if (fetchErr || !existing) return NextResponse.json({ ok: false, error: "intake_form_not_found" }, { status: 404 });

  try { assertOrgAccess(req, (existing as Record<string, unknown>).organization_id as string | null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  const current = existing.quote_status as QuoteStatus;

  // Transition table: valid (current → action → next)
  const transitions: Record<string, Record<string, QuoteStatus>> = {
    draft:              { send: "pending_approval", reject: "rejected", reset: "none" },
    pending_approval:   { approve: "approved", reject: "rejected", reset: "draft" },
    rejected:           { reset: "none" },
    none:               { reset: "none" },
    approved:           { reset: "none" },
  };

  const nextStatus = transitions[current]?.[action];
  if (!nextStatus) {
    return NextResponse.json({
      ok: false,
      error: "invalid_transition",
      detail: `Cannot '${action}' from state '${current}'`,
      current_status: current,
    }, { status: 409 });
  }

  // Guard: quote_data must exist before sending
  if (action === "send" && !existing.quote_data) {
    return NextResponse.json({ ok: false, error: "quote_data_required", detail: "Draft quote_data before sending" }, { status: 422 });
  }

  const { error } = await supabase
    .from("intake_forms")
    .update({ quote_status: nextStatus })
    .eq("id", intake_form_id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, previous_status: current, quote_status: nextStatus });
}
