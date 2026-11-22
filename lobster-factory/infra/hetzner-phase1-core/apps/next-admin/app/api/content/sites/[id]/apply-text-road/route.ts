import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { siteRowGate } from "@/lib/content/wp-sites";
import { staffOnly } from "@/lib/tenant-guard";
import { TEXT_ROAD_FIELDS, type SiteContentDefaults } from "@/lib/content/brand-voice";
import { subscriptionRoadDenied } from "@/lib/content/text-road-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = { id: string; name: string; content_defaults: SiteContentDefaults | null };

// POST /api/content/sites/[id]/apply-text-road -- 「套用到所有網站」(card K7, operator 2026-11-22): this site's text road
// (TEXT_ROAD_FIELDS, nothing else) written onto every other active site of the SAME organization, found here from the
// site row -- the body names no site and no organization. Same gates as setting the fields one site at a time (PATCH
// [id]: staff, the site's organization, a subscription only by the owner). Each write is conditional on the site's whole
// content_defaults as read, so a site changed meanwhile is reported, not overwritten.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });
  const notStaff = staffOnly(req);
  if (notStaff) return notStaff;

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const denied = await siteRowGate(req, id);
  if (denied) return denied;

  const { data: src, error: srcErr } = await supabase.from("wp_sites").select("organization_id, content_defaults").eq("id", id).maybeSingle();
  if (srcErr) return NextResponse.json({ ok: false, error: srcErr.message }, { status: 500 });
  const source = src as { organization_id: string | null; content_defaults: SiteContentDefaults | null } | null;
  if (!source?.organization_id) return NextResponse.json({ ok: false, error: "這個網站沒有所屬客戶，沒有可套用的其他網站" }, { status: 400 });
  const road: Partial<Record<(typeof TEXT_ROAD_FIELDS)[number], unknown>> = {};
  for (const f of TEXT_ROAD_FIELDS) if (source.content_defaults?.[f] !== undefined) road[f] = source.content_defaults[f];
  // what is copied puts a subscription on the other sites only when the chain is not API only (a claude level left over
  // from an earlier chain is inert there)
  const subDenied = await subscriptionRoadDenied(req, { textChain: road.textChain }, async () => source.organization_id);
  if (subDenied) return subDenied;

  const { data: others, error: listErr } = await supabase.from("wp_sites").select("id, name, content_defaults")
    .eq("organization_id", source.organization_id).eq("active", true).neq("id", id);
  if (listErr) return NextResponse.json({ ok: false, error: listErr.message }, { status: 500 });

  const updated: string[] = [], conflicts: string[] = [];
  for (const t of (others ?? []) as Row[]) {
    const stored = (t.content_defaults ?? {}) as Record<string, unknown>;
    const next: Record<string, unknown> = { ...stored };
    for (const f of TEXT_ROAD_FIELDS) { delete next[f]; if (road[f] !== undefined) next[f] = road[f]; }
    // conditional on the WHOLE stored defaults as read (jsonb equality): a mode or any other field changed meanwhile is
    // never written back with its old value; that site is reported instead
    const write = supabase.from("wp_sites").update({ content_defaults: next, updated_at: new Date().toISOString() })
      .eq("id", t.id).eq("organization_id", source.organization_id);
    const { data, error } = await (t.content_defaults === null ? write.is("content_defaults", null)
      : write.eq("content_defaults", JSON.stringify(t.content_defaults))).select("id").maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message, updated }, { status: 500 });
    (data ? updated : conflicts).push(t.name);
  }
  return NextResponse.json({ ok: true, updated, conflicts });
}
