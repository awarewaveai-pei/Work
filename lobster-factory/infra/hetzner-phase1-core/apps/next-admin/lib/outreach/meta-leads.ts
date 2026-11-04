// Meta lead-ad webhook (SPEC §5.10, card C14.2): a `leadgen` change of a Page we manage -> read the form answers from the
// Graph API with that Page's own token -> captureWarmLead (warm-leads.ts; stored first, FluentCRM second). The webhook
// route calls this after the signature check and before the social auto-reply module, which ignores `leadgen` changes.
// A delivery is retried by Meta only on a non-2xx answer, so `retry` counts what a resend can fix (Graph 5xx / 429 /
// network, database, FluentCRM bridge error); a missing token, an unknown Page or a form without a valid email is final.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrgSupabaseWriteClient } from "@/lib/org-client";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { getMetaSocialConfig, MetaSocialConfigError, type MetaSocialEnv } from "@/lib/social/meta-webhook";
import { findEnabledMetaAsset } from "@/lib/social/store";
import { captureWarmLead, leadgenKey } from "./warm-leads";

export interface LeadgenResult { received: number; captured: number; skipped: number; failed: number; retry: number }

const FIELDS = "field_data,created_time,form_id,ad_id,campaign_id";
const ID_RE = /^\d{1,30}$/;
const record = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

/** Graph sends an ISO string ("2026-11-02T10:00:00+0000"); the webhook value sends epoch seconds. */
function isoOf(v: string | null): string | null {
  if (!v) return null;
  const t = /^\d+$/.test(v) ? Number(v) * 1000 : Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** field_data = [{name, values:[...]}]: the first value of each answer, by the question's key. */
function answers(fieldData: unknown): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of Array.isArray(fieldData) ? fieldData : []) {
    const r = record(f);
    const v = Array.isArray(r?.values) ? str(r.values[0]) : null;
    const k = str(r?.name)?.toLowerCase();
    if (k && v && !out.has(k)) out.set(k, v);
  }
  return out;
}

/** The form's name for its FluentCRM tag (channels.ts). "retry" = Graph 5xx / 429 / network: the caller asks Meta to resend
 *  rather than capture without the tag for good; any other failure captures the lead without a form tag. */
async function formName(baseUrl: string, token: string, formId: string): Promise<string | null | "retry"> {
  if (!ID_RE.test(formId)) return null;
  try {
    const url = new URL(`${baseUrl}/${formId}`);
    url.searchParams.set("fields", "name");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (res.ok) return str(record(await res.json().catch(() => null))?.name);
    console.warn(`[meta-leads] form ${formId} name: Graph ${res.status}`);
    return res.status >= 500 || res.status === 429 ? "retry" : null;
  } catch (e) {
    console.warn(`[meta-leads] form ${formId} name: ${e instanceof Error ? e.message : String(e)}`);
    return "retry";
  }
}

async function orgDb(orgId: string): Promise<SupabaseClient> {
  const main = getSupabaseWriteClient();
  if (!main) throw new Error("Supabase not configured");
  const { data, error } = await main.from("organizations").select("slug").eq("id", orgId).maybeSingle();
  if (error) throw new Error(error.message);
  const db = await getOrgSupabaseWriteClient((data as { slug: string | null } | null)?.slug ?? null);
  if (!db) throw new Error("Supabase not configured");
  return db;
}

export async function handleLeadgenChanges(payload: unknown, env: MetaSocialEnv = process.env): Promise<LeadgenResult> {
  const result: LeadgenResult = { received: 0, captured: 0, skipped: 0, failed: 0, retry: 0 };
  const root = record(payload);
  if (!root || root.object !== "page") return result;
  for (const rawEntry of Array.isArray(root.entry) ? root.entry : []) {
    const entry = record(rawEntry);
    for (const rawChange of Array.isArray(entry?.changes) ? entry.changes : []) {
      const change = record(rawChange);
      if (change?.field !== "leadgen") continue;
      const value = record(change.value);
      result.received++;
      const leadgenId = str(value?.leadgen_id);
      const pageId = str(value?.page_id) ?? str(entry?.id);
      if (!leadgenId || !pageId || !ID_RE.test(leadgenId) || !ID_RE.test(pageId)) { result.skipped++; continue; }
      try {
        const asset = await findEnabledMetaAsset("facebook_page", pageId);
        if (!asset) { result.skipped++; continue; }
        const config = getMetaSocialConfig(asset, env);
        const url = new URL(`${config.baseUrl}/${leadgenId}`);
        url.searchParams.set("fields", FIELDS);
        const res = await fetch(url, { headers: { Authorization: `Bearer ${config.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
        const body = record(await res.json().catch(() => ({}))) ?? {};
        if (!res.ok || body.error) {
          console.error(`[meta-leads] leadgen ${leadgenId}: Graph ${res.status} ${str(record(body.error)?.message) ?? ""}`);
          if (res.status >= 500 || res.status === 429) result.retry++; else result.failed++;
          continue;
        }
        const a = answers(body.field_data);
        const name = a.get("full_name") ?? [a.get("first_name"), a.get("last_name")].filter(Boolean).join(" ");
        const at = isoOf(str(body.created_time) ?? str(value?.created_time));
        const formId = str(body.form_id) ?? str(value?.form_id) ?? "unknown";
        const form = await formName(config.baseUrl, config.accessToken, formId);
        if (form === "retry") { result.retry++; continue; }
        const captured = await captureWarmLead(await orgDb(asset.organizationId), {
          orgId: asset.organizationId, email: a.get("email") ?? "", name: name || null, phone: a.get("phone_number") ?? a.get("phone") ?? null,
          sourceRef: leadgenKey(leadgenId), consent: { source: `meta_lead_ad:${formId}`, at },
          channel: "meta_lead_ad", form,
        });
        if (!captured.ok) {
          console.error(`[meta-leads] leadgen ${leadgenId}: ${captured.reason}${"detail" in captured && captured.detail ? ` ${captured.detail}` : ""}`);
          if (captured.reason === "db_error") result.retry++; else result.failed++;
        } else if (captured.sync === "failed" && captured.retryable) {
          console.error(`[meta-leads] leadgen ${leadgenId}: FluentCRM ${captured.reason}`);
          result.retry++;
        } else result.captured++;
      } catch (e) {
        console.error(`[meta-leads] leadgen ${leadgenId}: ${e instanceof Error ? e.message : String(e)}`);
        if (e instanceof MetaSocialConfigError) result.failed++; else result.retry++;
      }
    }
  }
  return result;
}
