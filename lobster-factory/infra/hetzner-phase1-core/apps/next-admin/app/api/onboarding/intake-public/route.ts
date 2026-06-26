import { NextResponse } from "next/server";
import { timingSafeEqual } from "../../../../lib/security/timingSafeEqual";
import { getSupabaseWriteClient } from "../../../../lib/supabase-server";
import { generateWebsiteSpec } from "../../../../lib/onboarding/spec-generator";
import type { IntakeForm } from "../../../../lib/onboarding/intake-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Public customer intake door (server-to-server).
//
// Flow (Decision: 自動到預覽 + 1 鍵建站):
//   WP Fluent Form / n8n bridge (holds the token, server-side) → THIS endpoint
//     → store intake_forms → AI generate website spec (PREVIEW) → return spec.
//   It deliberately does NOT build the site. Building (= money + irreversible WP
//   provision) stays on the operator/payment-gated `trigger-build` route, so a
//   public submit can never auto-spend on a real build.
//
// Why a dedicated token (not the shared OPS_INBOX_INGEST_TOKEN): blast-radius
// isolation — same philosophy as verifyIngestSource() in lib/ops-inbox. The token
// lives only on the bridge (n8n / WP server), never ships to a browser.
//
// Spend guard: only exposure here is Claude spec-gen cost. A per-window rate limit
// bounds it. A public-web (browser-origin) form must add captcha before pointing
// directly at this endpoint — see EMBED/onboarding IA docs.
// ─────────────────────────────────────────────────────────────────────────────

const PUBLIC_INTAKE_WINDOW_MIN = 10;
const PUBLIC_INTAKE_MAX_PER_WINDOW = 5; // caps Claude spec spend from public abuse

function verifyIntakeToken(req: Request): boolean {
  const expected = process.env.ONBOARDING_PUBLIC_INTAKE_TOKEN;
  if (!expected) return false; // unset → endpoint is closed (fail-safe)
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(\S+)/i);
  if (!m) return false;
  return timingSafeEqual(m[1], expected);
}

export async function POST(request: Request) {
  if (!verifyIntakeToken(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { form?: IntakeForm };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // Required per intake-form.ts (primary_goal is deprecated 2026-06-05 — do NOT require it,
  // or schema-correct modern intakes 422-fail). pages_needed drives the sitemap.
  const form = body.form;
  if (!form?.company_name || !form?.industry || !form?.pages_needed?.length) {
    return NextResponse.json(
      { ok: false, error: "missing_required_fields", required: ["company_name", "industry", "pages_needed"] },
      { status: 422 },
    );
  }

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });

  // 1) Store intake FIRST, then gate. organization_id from a public body is NOT trusted
  // (org IDs aren't secret — forging one would inject intake/spec rows onto another tenant's
  // pipeline). Force null; org binding happens operator-side later in trigger-build.
  const { data: intakeRow, error: intakeErr } = await supabase
    .from("intake_forms")
    .insert({
      organization_id: null,
      form_data: form,
      submitted_by: "public_intake",
      status: "pending",
    })
    .select("id, submitted_at")
    .single();
  if (intakeErr || !intakeRow) {
    return NextResponse.json({ ok: false, error: "intake_store_failed" }, { status: 500 });
  }
  const intakeId = intakeRow.id as string;

  // 2) Spend gate (insert-then-ordinal). Count public intakes in the window AT OR BEFORE this
  // row's own timestamp = this request's ordinal position. The billable Claude call below runs
  // ONLY if we are within the cap. Unlike a pre-insert count (TOCTOU — a concurrent burst all
  // reads 0 and all proceed), this gate is evaluated AFTER our own committed insert, so it sees
  // concurrently-committed rows and rejects the 6th+ burst request before any Claude spend.
  // (A Postgres RPC / advisory-lock would make it fully atomic; this is the schema-free guard.)
  const windowStart = new Date(Date.now() - PUBLIC_INTAKE_WINDOW_MIN * 60_000).toISOString();
  const { count, error: countErr } = await supabase
    .from("intake_forms")
    .select("id", { count: "exact", head: true })
    .eq("submitted_by", "public_intake")
    .gte("submitted_at", windowStart)
    .lte("submitted_at", intakeRow.submitted_at as string);
  if (countErr || (count ?? 0) > PUBLIC_INTAKE_MAX_PER_WINDOW) {
    // Over cap (or can't verify) — roll back our own row so it doesn't count against future windows.
    const { error: rollbackErr } = await supabase.from("intake_forms").delete().eq("id", intakeId);
    if (rollbackErr) {
      // Lingering row only makes the NEXT window stricter (fails safe), but log for reconciliation.
      console.error("[intake-public] failed to roll back over-cap intake row:", rollbackErr.message);
    }
    if (countErr) return NextResponse.json({ ok: false, error: "rate_check_failed" }, { status: 503 });
    return NextResponse.json(
      { ok: false, error: "rate_limited", retry_after_seconds: PUBLIC_INTAKE_WINDOW_MIN * 60 },
      { status: 429 },
    );
  }

  // 3) AI spec (preview) — only reached when within the spend cap
  const result = await generateWebsiteSpec(form, intakeId);
  if (result.ok === false) {
    // Leave intake at "pending" so an operator can retry spec generation later.
    return NextResponse.json(
      { ok: false, error: "spec_generation_failed", intake_form_id: intakeId },
      { status: 502 },
    );
  }

  const { data: specRow, error: specErr } = await supabase
    .from("website_specs")
    .insert({
      intake_form_id: intakeId,
      organization_id: null, // untrusted on public path — bound operator-side later
      spec_data: result.spec,
      generated_by: result.spec.generated_by,
    })
    .select("id")
    .single();
  if (specErr || !specRow) {
    return NextResponse.json(
      { ok: false, error: "spec_store_failed", intake_form_id: intakeId },
      { status: 500 },
    );
  }

  const { error: statusErr } = await supabase
    .from("intake_forms")
    .update({ status: "spec_generated" })
    .eq("id", intakeId);
  if (statusErr) {
    // Spec exists but intake stayed 'pending' — log so an operator can reconcile (M8 pattern).
    console.error("[intake-public] failed to update intake_form status:", statusErr.message);
  }

  // Preview returned. Building is a separate, gated step (POST /api/onboarding/trigger-build
  // with ops role OR after payment confirmation) — never auto-triggered from here.
  return NextResponse.json(
    {
      ok: true,
      intake_form_id: intakeId,
      website_spec_id: specRow.id,
      spec: result.spec,
      next: "awaiting_build_approval",
    },
    { status: 201 },
  );
}
