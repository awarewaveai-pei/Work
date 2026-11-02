import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { outreachDb } from "@/lib/outreach/db-client";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { findSuppressed } from "@/lib/outreach/suppression";
import { upsertContact } from "@/lib/crm/fluentcrm";
import { listBridgeClients } from "@/lib/payments/woo";

// Cold Outreach -- a warm lead goes into FluentCRM (SPEC §5.8, D16, card C6.3). POST {leadId}. A lead is eligible when it
// has said yes (consent_status replied / opted_in / form_submitted / customer) and no marketing or all-scope suppression
// matches it. The bridge site is the host of the organization's active wp_sites row that also is a configured bridge
// client; none = 422 no_bridge. The plugin creates the contact only: no sequence, no mail.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SYNC_CONSENT = ["replied", "opted_in", "form_submitted", "customer"];
const hostOf = (url: string): string | null => { try { return new URL(url).host.toLowerCase(); } catch { return null; } };

export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }
  const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
  if (!UUID_RE.test(leadId)) return NextResponse.json({ ok: false, error: "leadId must be a uuid" }, { status: 400 });
  const supabase = await outreachDb(req, typeof body.orgSlug === "string" ? body.orgSlug.trim() || null : null);
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const { data, error } = await supabase.from("co_leads").select("id, organization_id, name, contact_name, email, website, consent_status, do_not_contact").eq("id", leadId).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "lead not found" }, { status: 404 });
  const lead = data as { id: string; organization_id: string | null; name: string | null; contact_name: string | null; email: string | null; website: string | null;
    consent_status: string; do_not_contact: boolean | null };
  try { assertOrgAccess(req, lead.organization_id); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  const email = lead.email?.trim().toLowerCase() ?? "";
  const notEligible = (reason: string) => NextResponse.json({ ok: false, error: "not_eligible", reason }, { status: 422 });
  if (!SYNC_CONSENT.includes(lead.consent_status)) return notEligible("consent");
  // A person stopped by hand (followups stop) has no suppression row: the flag itself refuses (Codex C6 F2).
  if (lead.do_not_contact) return notEligible("do_not_contact");
  if (!email) return notEligible("no_email");
  let suppressed: boolean[];
  try { suppressed = await findSuppressed(supabase, lead.organization_id, [{ email, website: lead.website, name: lead.name }], ["marketing", "all"]); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
  if (suppressed[0]) return notEligible("suppressed");

  // wp_sites lives in the main database, whichever database this org's outreach data is in.
  const main = getSupabaseWriteClient();
  if (!main) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const { data: sites, error: sErr } = lead.organization_id
    ? await main.from("wp_sites").select("url").eq("organization_id", lead.organization_id).eq("active", true)
    : { data: [], error: null };
  if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });
  const hosts = new Set(((sites ?? []) as Array<{ url: string }>).map((s) => hostOf(s.url)).filter((h): h is string => !!h));
  const client = listBridgeClients().find((c) => { const h = hostOf(c.baseUrl); return !!h && hosts.has(h); });
  if (!client) return NextResponse.json({ ok: false, error: "no_bridge" }, { status: 422 });

  const now = new Date().toISOString();
  // first_name is the person, not the company (Codex C6 F4)
  const res = await upsertContact({ email, first_name: (lead.contact_name ?? lead.name) ?? undefined, tags: ["outreach-warm"] }, { clientId: client.id });
  // The system-mode gate refused the write: nothing reached FluentCRM, the lead is not "failed" (Codex C6 F3).
  if (res.ok === false && res.blockedMode) return NextResponse.json({ ok: false, error: res.error, mode: res.blockedMode }, { status: 423 });
  if (!res.ok || res.value.status !== "committed" || res.value.contact_id == null) {
    const why = "error" in res ? res.error : res.value.reason ?? res.value.status;
    await supabase.from("co_leads").update({ fluentcrm_sync_status: "failed", updated_at: now }).eq("id", lead.id);
    await supabase.from("co_timeline_events").insert({ organization_id: lead.organization_id, lead_id: lead.id, event_type: "fluentcrm_sync_failed", title: "FluentCRM 同步失敗", description: why });
    return NextResponse.json({ ok: false, error: "sync_failed", reason: why }, { status: 502 });
  }
  const contactId = String(res.value.contact_id);
  const { error: uErr } = await supabase.from("co_leads").update({ fluentcrm_contact_id: contactId, fluentcrm_sync_status: "synced", fluentcrm_last_synced_at: now, updated_at: now }).eq("id", lead.id);
  if (uErr) return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });
  await supabase.from("co_timeline_events").insert({ organization_id: lead.organization_id, lead_id: lead.id, event_type: "fluentcrm_synced", title: "已同步到 FluentCRM", metadata: { contact_id: contactId, bridge: client.baseUrl } });
  return NextResponse.json({ ok: true, contactId });
}
