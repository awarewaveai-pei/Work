// A person who asked to hear from us (Meta lead-ad form, or its CSV export) becomes a WARM lead (SPEC §5.10, card C14.1):
// co_leads row -> co_convert_to_warm (0152: lead row lock, warm + consent, unsent cold mail skipped) -> FluentCRM contact
// tagged meta-lead-ad -> timeline. Never cold mail: cold-gate.ts isWarm refuses consent_source meta_lead_ad*.
// Idempotent on two keys: the Meta key (organization, source_url 'meta:leadgen/<id>', 0154) and (organization, lower(email))
// (0149). A repeat finds the row and only finishes what is missing: the FluentCRM sync when it is not 'synced'.
import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertContact } from "@/lib/crm/fluentcrm";
import { listBridgeClients } from "@/lib/payments/woo";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { checkProductionChangeAllowed } from "@/lib/system-modes/production-change-gate";
import { findSuppressed } from "./suppression";
import { isEmailSyntax } from "./verify-email";

export const WARM_TAG = "meta-lead-ad";
export const LEADGEN_PREFIX = "meta:leadgen/";
export const leadgenKey = (leadgenId: string): string => `${LEADGEN_PREFIX}${leadgenId}`;

// Already past the cold sequence in a way a lead form must not rewind: converting would turn a customer into 'warm'.
const KEEP_STATUS = ["warm", "synced_to_fluentcrm", "nurturing", "customer", "meeting_booked", "proposal_sent"];
const BLOCKED_STATUS = ["unsubscribed", "do_not_contact"];

export interface WarmLeadInput {
  orgId: string | null;
  email: string;
  name?: string | null;
  phone?: string | null;
  /** 'meta:leadgen/<id>' for a webhook lead; null for a CSV row (keyed by email alone). */
  sourceRef: string | null;
  consent: { source: string; at?: string | null };
}

export type WarmLeadResult =
  | { ok: true; leadId: string; created: boolean; cancelledCold: number; sync: "synced" | "already_synced" | "failed" | "not_eligible"; retryable: boolean; reason?: string }
  | { ok: false; reason: "invalid_email" | "blocked" | "db_error"; detail?: string };

interface LeadRow { id: string; status: string; do_not_contact: boolean; fluentcrm_sync_status: string; website: string | null; name: string | null }
const COLS = "id, status, do_not_contact, fluentcrm_sync_status, website, name";
const hostOf = (url: string): string | null => { try { return new URL(url).host.toLowerCase(); } catch { return null; } };

/** The bridge client of the organization's own WordPress site: its active wp_sites host matched to a configured bridge.
 *  The one copy of this rule; leads/sync-fluentcrm/route.ts uses it too. */
export async function bridgeClientId(orgId: string | null): Promise<string | null> {
  const main = getSupabaseWriteClient();
  if (!main || !orgId) return null;
  const { data, error } = await main.from("wp_sites").select("url").eq("organization_id", orgId).eq("active", true);
  if (error) return null;
  const hosts = new Set(((data ?? []) as Array<{ url: string }>).map((s) => hostOf(s.url)).filter((h): h is string => !!h));
  return listBridgeClients().find((c) => { const h = hostOf(c.baseUrl); return !!h && hosts.has(h); })?.id ?? null;
}

async function findLead(db: SupabaseClient, orgId: string | null, email: string, sourceRef: string | null): Promise<LeadRow | null> {
  const base = () => {
    const q = db.from("co_leads").select(COLS);
    return orgId ? q.eq("organization_id", orgId) : q.is("organization_id", null);
  };
  if (sourceRef) {
    const { data, error } = await base().eq("source_url", sourceRef).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data as LeadRow;
  }
  const { data, error } = await base().ilike("email", email.replace(/[\\%_]/g, "\\$&")).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as LeadRow | null) ?? null;
}

async function timeline(db: SupabaseClient, orgId: string | null, leadId: string, event_type: string, title: string, extra: { description?: string; metadata?: Record<string, unknown> } = {}): Promise<void> {
  const { error } = await db.from("co_timeline_events").insert({ organization_id: orgId, lead_id: leadId, event_type, title, ...extra });
  if (error) console.error(`[warm-leads] timeline ${event_type} for ${leadId}: ${error.message}`);
}

export async function captureWarmLead(db: SupabaseClient, input: WarmLeadInput): Promise<WarmLeadResult> {
  const email = input.email.trim().toLowerCase();
  if (!isEmailSyntax(email)) return { ok: false, reason: "invalid_email" };
  const { orgId, sourceRef } = input;
  const name = input.name?.trim() || null;
  const phone = input.phone?.trim() || null;
  const now = new Date().toISOString();

  try {
    let lead = await findLead(db, orgId, email, sourceRef);
    let created = false;
    if (!lead) {
      const { data, error } = await db.from("co_leads").insert({
        organization_id: orgId, name: name ?? email, email, phone, source_type: "meta_lead_ad", source_url: sourceRef, status: "new",
      }).select(COLS).single();
      if (error) {
        // A concurrent delivery of the same lead won the index: read its row (23505); anything else is a real failure.
        if (error.code !== "23505") return { ok: false, reason: "db_error", detail: error.message };
        lead = await findLead(db, orgId, email, sourceRef);
        if (!lead) return { ok: false, reason: "db_error", detail: error.message };
      } else {
        lead = data as LeadRow;
        created = true;
      }
    }
    const row = lead;
    if (row.do_not_contact || BLOCKED_STATUS.includes(row.status)) {
      await timeline(db, orgId, row.id, "lead_capture_blocked", "名單表單送出，但此人已退出或標記不可聯絡，未轉暖名單", { metadata: { source: input.consent.source } });
      return { ok: false, reason: "blocked" };
    }

    let cancelledCold = 0;
    if (!KEEP_STATUS.includes(row.status)) {
      const { data, error } = await db.rpc("co_convert_to_warm", { p_lead_id: row.id, p_consent: { status: "form_submitted", source: input.consent.source, at: input.consent.at || now } });
      if (error) return { ok: false, reason: "db_error", detail: error.message };
      if (data === -1) {  // opted out between our read and the lock (0154 co_convert_to_warm)
        await timeline(db, orgId, row.id, "lead_capture_blocked", "名單表單送出，但此人已退出或標記不可聯絡，未轉暖名單", { metadata: { source: input.consent.source } });
        return { ok: false, reason: "blocked" };
      }
      cancelledCold = typeof data === "number" ? data : 0;
      if (phone) await db.from("co_leads").update({ phone }).eq("id", row.id).is("phone", null);
      await timeline(db, orgId, row.id, "lead_captured", "名單表單送出，已轉暖名單", { metadata: { source: input.consent.source, source_ref: sourceRef, created, cancelled_cold: cancelledCold } });
    }

    if (row.fluentcrm_sync_status === "synced") return { ok: true, leadId: row.id, created, cancelledCold, sync: "already_synced", retryable: false };

    const notSynced = async (status: "failed" | "not_eligible", event: string, title: string, reason: string, retryable: boolean): Promise<WarmLeadResult> => {
      await db.from("co_leads").update({ fluentcrm_sync_status: status, updated_at: now }).eq("id", row.id);
      await timeline(db, orgId, row.id, event, title, { description: reason });
      return { ok: true, leadId: row.id, created, cancelledCold, sync: status, retryable, reason };
    };
    // A person on the marketing / all-scope suppression list is not added to FluentCRM, even after a form (same rule as C6).
    const [suppressed] = await findSuppressed(db, orgId, [{ email, website: row.website, name: row.name }], ["marketing", "all"]);
    if (suppressed) return await notSynced("not_eligible", "fluentcrm_sync_skipped", "在拒收名單，未同步到 FluentCRM", "suppressed", false);
    const clientId = await bridgeClientId(orgId);
    if (clientId === null) return await notSynced("failed", "fluentcrm_sync_failed", "FluentCRM 同步失敗", "no_bridge", false);
    // A write into a client's WordPress: the system-mode gate first (production-change-coverage.test.ts); blocked = try again later.
    const gate = await checkProductionChangeAllowed(getSupabaseWriteClient(), orgId);
    if (!gate.allowed) return await notSynced("failed", "fluentcrm_sync_failed", "系統模式暫停寫入，FluentCRM 稍後再同步", `blocked_mode:${gate.mode}`, true);

    const res = await upsertContact({ email, first_name: name ?? undefined, phone: phone ?? undefined, tags: [WARM_TAG] }, { clientId });
    if (!res.ok || res.value.status !== "committed" || res.value.contact_id == null) {
      return await notSynced("failed", "fluentcrm_sync_failed", "FluentCRM 同步失敗", "error" in res ? res.error : res.value.reason ?? res.value.status, true);
    }
    const contactId = String(res.value.contact_id);
    const { error: uErr } = await db.from("co_leads").update({ fluentcrm_contact_id: contactId, fluentcrm_sync_status: "synced", fluentcrm_last_synced_at: now, updated_at: now }).eq("id", row.id);
    if (uErr) return { ok: false, reason: "db_error", detail: uErr.message };
    await timeline(db, orgId, row.id, "fluentcrm_synced", "已同步到 FluentCRM", { metadata: { contact_id: contactId } });
    return { ok: true, leadId: row.id, created, cancelledCold, sync: "synced", retryable: false };
  } catch (e) {
    return { ok: false, reason: "db_error", detail: e instanceof Error ? e.message : String(e) };
  }
}
