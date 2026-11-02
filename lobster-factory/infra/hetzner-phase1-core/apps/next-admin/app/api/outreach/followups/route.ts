import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { outreachDb } from "@/lib/outreach/db-client";
import { assertOrgAccess, effectiveOrgId, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";

// Cold Outreach — Follow-up scheduling (task T11). Mutates co_leads.next_followup_date /
// last_contact_date / do_not_contact. Reads go through the leads API (which already returns these
// columns); this route only does the date actions. Writes ops-role gated.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
// Follow-up dates are BUSINESS-day dates anchored to Asia/Taipei (the operator's home TZ), NOT the
// UTC server clock — otherwise dates drift one day for 00:00–08:00 Taipei (critic minor #2).
const BIZ_TZ = "Asia/Taipei";
const today = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: BIZ_TZ }).format(new Date());
const addDays = (n: number): string => {
  // Pure calendar arithmetic on the local date string (UTC-anchored midnight avoids DST drift).
  const d = new Date(`${today()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Guard uuid-typed columns up front so a bad id returns a clean 400, not a raw PG 22P02 leak.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Steps of a lead's follow-up sequence that are still to do (the others are sent, skipped or done by hand = 'copied').
const STEP_OPEN = ["draft", "approved", "needs_edit", "drafted", "sending"];
const DUE_LIMIT = 200;

// GET ?due=1[&organizationId=] — C5.1/C5.4: leads at status 'sent' whose next_followup_date is today (Taipei) or earlier,
// each with its next step = the lowest-version unsent follow-up row (null when the lead has none left).
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const supabase = await outreachDb(req, url.searchParams.get("orgSlug"));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const requested = str(url.searchParams.get("organizationId"));
  let orgFilter: string | null;
  try { orgFilter = effectiveOrgId(req, requested && UUID_RE.test(requested) ? requested : null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  let q = supabase.from("co_leads").select("id, organization_id, name, email, status, next_followup_date")
    .eq("status", "sent").eq("do_not_contact", false).lte("next_followup_date", today()).order("next_followup_date").limit(DUE_LIMIT);
  if (orgFilter) q = q.eq("organization_id", orgFilter);
  const { data: leads, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const rows = (leads ?? []) as Array<{ id: string }>;
  const steps = new Map<string, Record<string, unknown>>();
  if (rows.length) {
    const { data: msgs, error: mErr } = await supabase.from("co_messages")
      .select("id, lead_id, version, channel, status, subject, body, followup_delay_days")
      .in("lead_id", rows.map((l) => l.id)).eq("output_type", "followup").in("status", STEP_OPEN).order("version");
    if (mErr) return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 });
    for (const m of (msgs ?? []) as Array<Record<string, unknown>>) if (!steps.has(m.lead_id as string)) steps.set(m.lead_id as string, m);
  }
  return NextResponse.json({ ok: true, today: today(), due: rows.map((l) => ({ lead: l, step: steps.get(l.id) ?? null })) });
}

// POST { leadId, action, days?, date?, messageId?, orgSlug? }
//   action = set | snooze | complete | stop | step_done
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const supabase = await outreachDb(req, str(body.orgSlug));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const leadId = str(body.leadId);
  const action = str(body.action);
  if (!leadId) return NextResponse.json({ ok: false, error: "leadId required" }, { status: 400 });
  if (!UUID_RE.test(leadId)) return NextResponse.json({ ok: false, error: "leadId must be a uuid" }, { status: 400 });
  if (!action) return NextResponse.json({ ok: false, error: "action required" }, { status: 400 });

  // Verify caller owns this lead before mutating follow-up fields.
  const { data: leadOrg, error: orgErr } = await supabase.from("co_leads").select("organization_id").eq("id", leadId).maybeSingle();
  if (orgErr) return NextResponse.json({ ok: false, error: orgErr.message }, { status: 500 });
  if (!leadOrg) return NextResponse.json({ ok: false, error: "lead not found" }, { status: 404 });
  try { assertOrgAccess(req, (leadOrg as Record<string, unknown>).organization_id as string | null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  switch (action) {
    case "set": {
      const date = str(body.date);
      if (!date || !DATE_RE.test(date)) return NextResponse.json({ ok: false, error: "valid date (YYYY-MM-DD) required" }, { status: 400 });
      patch.next_followup_date = date;
      patch.status = "followup_due";
      break;
    }
    case "snooze": {
      const days = typeof body.days === "number" && Number.isFinite(body.days) ? Math.max(1, Math.round(body.days)) : 3;
      patch.next_followup_date = addDays(days);
      patch.status = "followup_due";
      break;
    }
    case "complete": {
      patch.last_contact_date = today();
      patch.next_followup_date = null;
      break;
    }
    case "stop": {
      patch.do_not_contact = true;
      patch.do_not_contact_reason = str(body.reason) ?? "manual stop (followups)";
      patch.next_followup_date = null;
      patch.status = "do_not_contact";
      break;
    }
    case "step_done": {
      // C5.4: a step done by hand (ig_dm / linkedin / phone). The lead's dates move on first and the step is marked
      // second: the date is computed without this step, so a retry after a failure between the two is harmless.
      const messageId = str(body.messageId);
      if (!messageId || !UUID_RE.test(messageId)) return NextResponse.json({ ok: false, error: "messageId (uuid) required" }, { status: 400 });
      const { data: step, error: stepErr } = await supabase.from("co_messages").select("id, lead_id, organization_id, output_type, channel, status, version")
        .eq("id", messageId).maybeSingle();
      if (stepErr) return NextResponse.json({ ok: false, error: stepErr.message }, { status: 500 });
      const st = step as { id: string; lead_id: string; organization_id: string | null; output_type: string; channel: string; status: string; version: number } | null;
      if (!st || st.lead_id !== leadId) return NextResponse.json({ ok: false, error: "step not found for this lead" }, { status: 404 });
      if (st.output_type !== "followup" || st.channel === "email") return NextResponse.json({ ok: false, error: "not_a_manual_step" }, { status: 400 });
      if (st.status !== "copied" && !STEP_OPEN.includes(st.status)) return NextResponse.json({ ok: false, error: `step already ${st.status}` }, { status: 409 });
      // Already done: a repeated press must not push the next step later (Codex C5 F2).
      if (st.status === "copied") return NextResponse.json({ ok: true, alreadyDone: true });
      // the next date = the lead's next unsent step (the rule co_mark_sent uses, 0153), else none
      const { data: nextStep, error: nextErr } = await supabase.from("co_messages").select("followup_delay_days")
        .eq("lead_id", leadId).eq("output_type", "followup").in("status", ["draft", "approved", "drafted"]).neq("id", messageId)
        .not("followup_delay_days", "is", null).order("followup_delay_days").order("created_at").limit(1);
      if (nextErr) return NextResponse.json({ ok: false, error: nextErr.message }, { status: 500 });
      const delay = ((nextStep ?? []) as Array<{ followup_delay_days: number }>)[0]?.followup_delay_days;
      patch.last_contact_date = today();
      patch.next_followup_date = delay === undefined ? null : addDays(delay);
      const { data: lead, error: leadErr } = await supabase.from("co_leads").update(patch).eq("id", leadId).select("*").maybeSingle();
      if (leadErr) return NextResponse.json({ ok: false, error: leadErr.message }, { status: 500 });
      if (!lead) return NextResponse.json({ ok: false, error: "lead not found" }, { status: 404 });
      if (st.status !== "copied") {
        const { error: doneErr } = await supabase.from("co_messages").update({ status: "copied" }).eq("id", messageId).in("status", STEP_OPEN);
        if (doneErr) return NextResponse.json({ ok: false, error: doneErr.message }, { status: 500 });
        const { error: tlErr } = await supabase.from("co_timeline_events").insert({ organization_id: st.organization_id, lead_id: leadId, event_type: "followup_step_done",
          title: `追蹤步驟 ${st.version}（${st.channel}）已由人完成`, metadata: { message_id: messageId, channel: st.channel } });
        if (tlErr) return NextResponse.json({ ok: true, lead, warning: `step done but its timeline row was not written: ${tlErr.message}` });
      }
      return NextResponse.json({ ok: true, lead });
    }
    default:
      return NextResponse.json({ ok: false, error: "action must be set|snooze|complete|stop|step_done" }, { status: 400 });
  }

  const { data, error } = await supabase.from("co_leads").update(patch).eq("id", leadId).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "lead not found" }, { status: 404 });
  return NextResponse.json({ ok: true, lead: data });
}
