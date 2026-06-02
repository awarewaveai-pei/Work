import { NextResponse } from "next/server";
import { resolveOpsRole } from "../../../../lib/ops-role";
import { getSupabaseWriteClient } from "../../../../lib/supabase-server";
import type { IntakeForm } from "../../../../lib/onboarding/intake-form";

export async function POST(request: Request) {
  const resolved = resolveOpsRole(request);
  const allowed = ["owner", "admin", "operator"] as const;
  if (!(allowed as readonly string[]).includes(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden", role: resolved.role }, { status: 403 });
  }

  let body: { form: IntakeForm; organization_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { form, organization_id } = body;
  if (!form?.company_name || !form?.industry || !form?.primary_goal?.length) {
    return NextResponse.json(
      { ok: false, error: "missing_required_fields", required: ["company_name", "industry", "primary_goal"] },
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
