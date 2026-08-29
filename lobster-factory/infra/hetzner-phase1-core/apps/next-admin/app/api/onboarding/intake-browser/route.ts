import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "../../../../lib/supabase-server";
import { generateWebsiteSpec } from "../../../../lib/onboarding/spec-generator";
import { coerceFluentFormPayload } from "../../../../lib/onboarding/coerce-fluent-form";
import { verifyTurnstileToken } from "../../../../lib/turnstile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Browser-origin public intake door.
//
// Same data pipeline as intake-public but designed for the React public form at
// /intake (app.aware-wave.com). Key differences from intake-public:
//   - No bearer token (browser cannot hold secrets safely).
//   - Rate limit keyed on `submitted_by = "browser_intake"` — same 5/10-min
//     insert-then-ordinal pattern as intake-public (they share no quota bucket).
//   - Returns a subset of the spec (enough for the thank-you view); the full
//     internal spec is available to operators via /ops/onboarding history.
//
// ⚠ SECURITY PRECONDITION (from intake-public/route.ts:25-26):
//   A public-web (browser-origin) form must add a server-verified captcha
//   (e.g. Cloudflare Turnstile) before this door is opened to production
//   traffic. Without it the global rate-limit bucket can be locked by a single
//   caller, denying the entire lead-capture funnel (one 6-req/10-min loop
//   saturates the shared counter for every prospect worldwide).
//
//   BROWSER_INTAKE_ENABLED env var gates this route. Leave unset (default) in
//   production until Cloudflare Turnstile verification is wired into both the
//   public form and this handler. Set to "true" only after the captcha check
//   is in place.
//
// Security: this path is listed in PUBLIC_API_PATHS and in the middleware matcher
// exclusion, so it receives no Supabase session cookie injection. Authorization
// comes from BROWSER_INTAKE_ENABLED gate + rate limit + body validation.
// ─────────────────────────────────────────────────────────────────────────────

const BROWSER_INTAKE_WINDOW_MIN = 10;
const BROWSER_INTAKE_MAX_PER_WINDOW = 5;

export async function POST(request: Request) {
  // Gate: TURNSTILE_SECRET_KEY is the production security gate. The form is open iff the secret
  // is present (captcha will be enforced below). BROWSER_INTAKE_ENABLED is a dev/staging bypass
  // restricted to NODE_ENV !== "production" so an env-var mistake cannot open the door in prod
  // without captcha — which would re-open the global-bucket DoS vector described above.
  // ⚠ Both NEXT_PUBLIC_TURNSTILE_SITE_KEY (frontend) and TURNSTILE_SECRET_KEY (backend) must be
  //   set together in every deploy; a mismatch silently breaks the form or disables captcha.
  const hasSecret = !!process.env.TURNSTILE_SECRET_KEY;
  const devBypass = !hasSecret && process.env.BROWSER_INTAKE_ENABLED === "true" && process.env.NODE_ENV !== "production";
  if (!hasSecret && !devBypass) {
    return NextResponse.json(
      { ok: false, error: "coming_soon", message: "Public intake form is coming soon." },
      { status: 503 },
    );
  }

  const rawText = await request.text();
  if (rawText.length > 65_536) {
    return NextResponse.json({ ok: false, error: "request_too_large" }, { status: 413 });
  }

  let body: { form?: Record<string, unknown>; turnstile_token?: string };
  try {
    body = JSON.parse(rawText) as { form?: Record<string, unknown>; turnstile_token?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // Verify Cloudflare Turnstile captcha when the secret key is configured.
  if (process.env.TURNSTILE_SECRET_KEY) {
    if (!body.turnstile_token) {
      return NextResponse.json({ ok: false, error: "captcha_required" }, { status: 422 });
    }
    const remoteip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
    const captchaOk = await verifyTurnstileToken(body.turnstile_token, remoteip);
    if (!captchaOk) {
      return NextResponse.json({ ok: false, error: "captcha_failed" }, { status: 422 });
    }
  }

  const form = body.form ? coerceFluentFormPayload(body.form) : undefined;
  if (!form?.company_name || !form?.industry || !form?.pages_needed?.length) {
    return NextResponse.json(
      { ok: false, error: "missing_required_fields", required: ["company_name", "industry", "pages_needed"] },
      { status: 422 },
    );
  }

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });

  const { data: intakeRow, error: intakeErr } = await supabase
    .from("intake_forms")
    .insert({
      organization_id: null,
      form_data: form,
      submitted_by: "browser_intake",
      status: "pending",
    })
    .select("id, submitted_at")
    .single();
  if (intakeErr || !intakeRow) {
    return NextResponse.json({ ok: false, error: "intake_store_failed" }, { status: 500 });
  }
  const intakeId = intakeRow.id as string;

  // Insert-then-ordinal rate limit — same pattern as intake-public.
  const windowStart = new Date(Date.now() - BROWSER_INTAKE_WINDOW_MIN * 60_000).toISOString();
  const { count, error: countErr } = await supabase
    .from("intake_forms")
    .select("id", { count: "exact", head: true })
    .eq("submitted_by", "browser_intake")
    .gte("submitted_at", windowStart)
    .lte("submitted_at", intakeRow.submitted_at as string);
  if (countErr || (count ?? 0) > BROWSER_INTAKE_MAX_PER_WINDOW) {
    await supabase.from("intake_forms").delete().eq("id", intakeId);
    if (countErr) return NextResponse.json({ ok: false, error: "rate_check_failed" }, { status: 503 });
    return NextResponse.json(
      { ok: false, error: "rate_limited", retry_after_seconds: BROWSER_INTAKE_WINDOW_MIN * 60 },
      { status: 429 },
    );
  }

  const result = await generateWebsiteSpec(form, intakeId);
  if (result.ok === false) {
    // Roll back the counted row so this failure doesn't consume a rate-limit slot
    // (an attacker could otherwise deliberately trigger Claude failures to fill the bucket).
    await supabase.from("intake_forms").delete().eq("id", intakeId);
    return NextResponse.json(
      { ok: false, error: "spec_generation_failed", intake_form_id: intakeId },
      { status: 502 },
    );
  }

  const { data: specRow, error: specErr } = await supabase
    .from("website_specs")
    .insert({
      intake_form_id: intakeId,
      organization_id: null,
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
    // M8 pattern: spec exists but intake stayed 'pending' — log for operator reconciliation.
    console.error("[intake-browser] intake status update failed", { intakeId, error: statusErr.message });
  }

  // Return the spec so the public thank-you view can display the design preview.
  // No trigger-build action is available to the public — that stays on ops/onboarding.
  return NextResponse.json(
    {
      ok: true,
      intake_form_id: intakeId,
      website_spec_id: specRow.id,
      spec: result.spec,
    },
    { status: 201 },
  );
}
