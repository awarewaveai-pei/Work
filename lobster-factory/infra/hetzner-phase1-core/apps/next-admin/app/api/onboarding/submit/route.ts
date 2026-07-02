import { NextResponse } from "next/server";
import { resolveOpsRole } from "../../../../lib/ops-role";
import { timingSafeEqual } from "../../../../lib/ops-inbox/verifyIngestToken";
import { getSupabaseWriteClient } from "../../../../lib/supabase-server";
import type { IntakeForm } from "../../../../lib/onboarding/intake-form";

// Auth: Supabase session (owner/admin/operator) OR server-to-server x-ops-sync-key.
// Same dual-path pattern as trigger-build/route.ts — needed so n8n can POST here.
const SYNC_KEY = process.env.OPS_PROXY_SHARED_SECRET ?? "";

export async function POST(request: Request) {
  const resolved = resolveOpsRole(request);
  const allowed = ["owner", "admin", "operator"] as const;
  const hasSyncKey = !!(SYNC_KEY && timingSafeEqual(request.headers.get("x-ops-sync-key") ?? "", SYNC_KEY));
  if (!(allowed as readonly string[]).includes(resolved.role) && !hasSyncKey) {
    return NextResponse.json({ ok: false, error: "forbidden", role: resolved.role }, { status: 403 });
  }

  let body: { form: IntakeForm; organization_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { form, organization_id } = body;
  // primary_goal was DEPRECATED 2026-06-05 (removed from the intake form) — requiring it here
  // hard-failed every real UI submission with missing_required_fields. Validate the fields the
  // form actually collects (see intake-form.ts required set): company_name, industry, pages_needed.
  if (!form?.company_name || !form?.industry || !form?.pages_needed?.length) {
    return NextResponse.json(
      { ok: false, error: "missing_required_fields", required: ["company_name", "industry", "pages_needed"] },
      { status: 422 }
    );
  }

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });

  const { data, error } = await supabase
    .from("intake_forms")
    .insert({
      organization_id: organization_id ?? null,
      form_data: form,
      submitted_by: resolved.role,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, intake_form_id: data.id }, { status: 201 });
}
