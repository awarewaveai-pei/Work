import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { getOrgSupabaseWriteClient } from "@/lib/org-client";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";

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

// POST { leadId, action, days?, date?, orgSlug? }
//   action = set | snooze | complete | stop
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const supabase = await getOrgSupabaseWriteClient(str(body.orgSlug));
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
    default:
      return NextResponse.json({ ok: false, error: "action must be set|snooze|complete|stop" }, { status: 400 });
  }

  const { data, error } = await supabase.from("co_leads").update(patch).eq("id", leadId).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "lead not found" }, { status: 404 });
  return NextResponse.json({ ok: true, lead: data });
}
