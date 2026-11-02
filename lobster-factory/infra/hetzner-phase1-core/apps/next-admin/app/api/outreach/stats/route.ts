import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { outreachDb } from "@/lib/outreach/db-client";
import { effectiveOrgId, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { aggregateStats, type StatsEvent, type StatsLead, type StatsMessage, type StatsReply } from "@/lib/outreach/stats";

// Cold Outreach — the stats page (SPEC §5.9, card C7). Read-only; the grouping is lib/outreach/stats.ts.
// ?from / ?to (YYYY-MM-DD or ISO) bound the messages' created_at; everything else is read for those messages' leads.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;
const MAX_MESSAGES = 10000;
const IN_CHUNK = 200;

class ReadError extends Error {}

async function chunked<T>(ids: string[], read: (part: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await read(ids.slice(i, i + IN_CHUNK));
    if (error) throw new ReadError(error.message);
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

async function readMessages(supabase: SupabaseClient, org: string | null, from: string | null, to: string | null): Promise<StatsMessage[]> {
  const out: StatsMessage[] = [];
  for (let offset = 0; offset < MAX_MESSAGES; offset += PAGE) {
    let q = supabase.from("co_messages").select("id, lead_id, output_type, variant_label, angle, created_at")
      .in("output_type", ["cold_email", "followup"]).order("created_at", { ascending: true }).order("id").range(offset, offset + PAGE - 1);
    if (org) q = q.eq("organization_id", org);
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lt("created_at", to);
    const { data, error } = await q;
    if (error) throw new ReadError(error.message);
    const rows = (data ?? []) as StatsMessage[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

function bound(raw: string | null, endOfDay: boolean): string | null | undefined {
  if (!raw) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00+08:00`) : new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(raw)) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const supabase = await outreachDb(req, params.get("orgSlug"));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const rawOrgId = params.get("organizationId");
  if (rawOrgId && !UUID_RE.test(rawOrgId)) return NextResponse.json({ ok: false, error: "organizationId must be a uuid" }, { status: 400 });
  let orgFilter: string | null;
  try { orgFilter = effectiveOrgId(req, rawOrgId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const from = bound(params.get("from"), false);
  const to = bound(params.get("to"), true);
  if (from === undefined || to === undefined) return NextResponse.json({ ok: false, error: "from / to must be a date (YYYY-MM-DD)" }, { status: 400 });

  try {
    const messages = await readMessages(supabase, orgFilter, from, to);
    const messageIds = messages.map((m) => m.id);
    const leadIds = [...new Set(messages.map((m) => m.lead_id))];
    const [events, replies, leads] = await Promise.all([
      chunked<StatsEvent>(messageIds, (p) => supabase.from("co_sending_events").select("message_id, lead_id, event_type")
        .in("event_type", ["draft_created", "sent", "hard_bounced", "soft_bounced"]).in("message_id", p)),
      chunked<StatsReply>(leadIds, (p) => supabase.from("co_replies").select("lead_id, kind, reply_type").in("lead_id", p)),
      chunked<StatsLead>(leadIds, (p) => supabase.from("co_leads").select("id, service_profile_id, status").in("id", p)),
    ]);
    const profileIds = [...new Set(leads.map((l) => l.service_profile_id).filter((v): v is string => !!v))];
    const profiles = await chunked<{ id: string; service_name: string | null }>(profileIds, (p) =>
      supabase.from("co_service_profiles").select("id, service_name").in("id", p));
    const profileNames = new Map(profiles.map((p) => [p.id, p.service_name ?? ""] as const));
    const rows = aggregateStats({ messages, events, replies, leads, profileNames });
    return NextResponse.json({ ok: true, rows, truncated: messages.length >= MAX_MESSAGES });
  } catch (e) {
    if (e instanceof ReadError) return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    throw e;
  }
}
