import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import {
  normalizeLead,
  flagDuplicatesInBatch,
  isSuppressed,
  type RawLead,
  type SuppressionRow,
  type NormalizedLead,
} from "@/lib/outreach/normalize";
import { scoreLeadQuality, scoreContactability } from "@/lib/outreach/scoring";

// Cold Outreach — Lead Inbox import (task T5). Table: co_lead_inbox (migration 0048).
// Pipeline: normalize → dedup (within batch) → suppression check → mechanical scoring → classify.
// Writes ops-role gated; GET authed-only.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "co_lead_inbox";
const LIST_LIMIT = 200;
const MAX_BATCH = 500;

function classify(
  n: NormalizedLead,
  quality: number,
  contactability: number,
  isDup: boolean,
  suppressed: boolean,
): string {
  if (suppressed) return "risky";
  if (isDup) return "suspected_dup";
  if (!n.email && !n.phone && !n.social_url) return "no_contact";
  if (quality < 50) return "needs_data";
  if (quality >= 70 && contactability >= 50) return "high_quality";
  return "pending";
}

export async function GET(req: Request): Promise<Response> {
  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organizationId");
  const status = url.searchParams.get("status");
  let query = supabase.from(TABLE).select("*").order("created_at", { ascending: false }).limit(LIST_LIMIT);
  if (organizationId) query = query.eq("organization_id", organizationId);
  if (status) query = query.eq("inbox_status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

// POST — import one or many. Body: { organizationId?, leads: RawLead[] }  OR  { organizationId?, lead: RawLead }
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const organizationId = typeof body.organizationId === "string" && body.organizationId.trim() ? body.organizationId.trim() : null;
  const rawList: RawLead[] = Array.isArray(body.leads)
    ? (body.leads as RawLead[])
    : body.lead && typeof body.lead === "object"
      ? [body.lead as RawLead]
      : [];

  if (rawList.length === 0) return NextResponse.json({ ok: false, error: "leads[] or lead required" }, { status: 400 });
  if (rawList.length > MAX_BATCH) return NextResponse.json({ ok: false, error: `max ${MAX_BATCH} leads per import` }, { status: 413 });

  // Suppression rows for this org (email/domain/global scope).
  let suppression: SuppressionRow[] = [];
  {
    let sq = supabase.from("co_suppression_list").select("email, domain, scope").limit(5000);
    if (organizationId) sq = sq.eq("organization_id", organizationId);
    const { data } = await sq;
    if (Array.isArray(data)) suppression = data as SuppressionRow[];
  }

  const normalized = rawList.map(normalizeLead);
  const dupFlags = flagDuplicatesInBatch(normalized);

  const rows = normalized.map((n, i) => {
    const isDup = dupFlags[i];
    const suppressed = isSuppressed(n, suppression);
    const scorable = {
      name: n.normalized_name,
      industry: n.normalized_industry,
      website: n.website,
      social_url: n.social_url,
      email: n.email,
      phone: n.phone,
      contact_name: n.contact_name,
      contact_role: n.contact_role,
      observation: n.observation,
      source_url: n.source_url,
    };
    const quality = scoreLeadQuality(scorable, { isDuplicate: isDup });
    const contactability = scoreContactability(scorable, { doNotContact: suppressed });
    const inbox_status = classify(n, quality, contactability, isDup, suppressed);
    return {
      organization_id: organizationId,
      raw_payload: rawList[i] as object,
      normalized_name: n.normalized_name,
      normalized_industry: n.normalized_industry,
      website: n.website,
      social_url: n.social_url,
      email: n.email,
      phone: n.phone,
      region: n.region,
      source_type: n.source_type,
      source_url: n.source_url,
      quality_score: quality,
      contactability_score: contactability,
      duplicate_score: isDup ? 100 : 0,
      inbox_status,
      ai_notes: suppressed ? "suppression hit — do not contact" : null,
    };
  });

  const { data, error } = await supabase.from(TABLE).insert(rows).select("id, inbox_status");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const summary: Record<string, number> = {};
  for (const r of data ?? []) {
    const s = (r as { inbox_status: string }).inbox_status;
    summary[s] = (summary[s] ?? 0) + 1;
  }
  return NextResponse.json({ ok: true, imported: data?.length ?? 0, summary }, { status: 201 });
}

export async function DELETE(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });
  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
