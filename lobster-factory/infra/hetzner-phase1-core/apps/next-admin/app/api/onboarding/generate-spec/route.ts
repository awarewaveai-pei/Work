import { NextResponse } from "next/server";
import { resolveOpsRole } from "../../../../lib/ops-role";
import { getSupabaseWriteClient } from "../../../../lib/supabase-server";
import { generateWebsiteSpec } from "../../../../lib/onboarding/spec-generator";
import type { IntakeForm } from "../../../../lib/onboarding/intake-form";

export async function POST(request: Request) {
  const resolved = resolveOpsRole(request);
  const allowed = ["owner", "admin", "operator"] as const;
  if (!(allowed as readonly string[]).includes(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden", role: resolved.role }, { status: 403 });
  }

  // C1: null-check before any DB or Claude call
  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });

  let body: { intake_form_id?: string; form?: IntakeForm; organization_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  let form: IntakeForm;
  const intake_form_id: string | undefined = body.intake_form_id;

  // Accept either an intake_form_id (lookup DB) or inline form object
  if (intake_form_id) {
    const { data, error } = await supabase
      .from("intake_forms")
      .select("form_data")
      .eq("id", intake_form_id)
      .single();
    if (error || !data) {
      return NextResponse.json({ ok: false, error: "intake_form_not_found" }, { status: 404 });
    }
    form = data.form_data as IntakeForm;
  } else if (body.form) {
    form = body.form;
  } else {
    return NextResponse.json(
      { ok: false, error: "provide_intake_form_id_or_form" },
      { status: 422 }
    );
  }

  // Generate spec via Claude (C1 guard is above, no wasted API spend if DB is down)
  const result = await generateWebsiteSpec(form, intake_form_id);
  if (result.ok === false) {
    // M6: omit raw Claude output from client response; errors surface via error code
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  // Persist spec
  const { data: specRow, error: specError } = await supabase
    .from("website_specs")
    .insert({
      intake_form_id: intake_form_id ?? null,
      organization_id: body.organization_id ?? null,
      spec_data: result.spec,
      generated_by: result.spec.generated_by,
    })
    .select("id")
    .single();

  if (specError) {
    return NextResponse.json({ ok: false, error: specError.message }, { status: 500 });
  }

  // Mark intake form as spec_generated (M8: capture error for observability)
  if (intake_form_id) {
    const { error: updateErr } = await supabase
      .from("intake_forms")
      .update({ status: "spec_generated" })
      .eq("id", intake_form_id);
    if (updateErr) console.error("[generate-spec] failed to update intake_form status:", updateErr.message);
  }

  return NextResponse.json(
    { ok: true, website_spec_id: specRow.id, spec: result.spec },
    { status: 201 }
  );
}
