import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { isSafePublicHttps } from "@/lib/content/public-https";
import { staffOnly } from "@/lib/tenant-guard";
import { TRENDING_GEOS } from "@/lib/content/geos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Operator-managed trending sources (migration 0042_content_sources.sql). These rows are fetched
// per trending request and run as ephemeral search blocks (trending-sources.ts buildDbSearchBlocks).
// Service-role-only table; this route is the only accessor (ops-role gated). SSRF: url is validated
// with isSafePublicHttps at insert time AND re-checked at fetch time — same posture as env feeds.
// The table has no organization column: every tenant's trending reads it. A customer on a product door may read the
// list; adding, editing and deleting are staff-only (step-8 card decision D2).

// geos allowlist = the one region list (lib/content/geos.ts).
const VALID_GEOS: ReadonlySet<string> = new Set(TRENDING_GEOS);

interface SourceRow {
  id: string;
  label: string;
  url: string;
  geos: unknown;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

function toItem(r: SourceRow) {
  // geos stored as jsonb: "*" (all) or string[]; normalize unknown shapes to "*".
  const geos: string[] | "*" = Array.isArray(r.geos)
    ? (r.geos as unknown[]).filter((g): g is string => typeof g === "string")
    : "*";
  return {
    id: r.id,
    label: r.label,
    url: r.url,
    geos,
    enabled: r.enabled,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Parse the geos field from a request body. "*" / null / non-array ⇒ all geos. A non-empty array
// that filters to NOTHING (e.g. all typos) is a caller error ⇒ { error } so the route returns 400,
// instead of silently widening the source to every region. (critic 2026-06-16 Minor)
function parseGeos(raw: unknown): { geos: "*" | string[] } | { error: string } {
  if (raw === "*" || raw == null) return { geos: "*" };
  if (Array.isArray(raw)) {
    const list = raw.filter((g): g is string => typeof g === "string" && VALID_GEOS.has(g));
    if (list.length === 0) return { error: `geos 無有效地區（允許：${[...VALID_GEOS].join("/")}）` };
    return { geos: list };
  }
  return { geos: "*" };
}

// GET /api/content/sources — list operator-managed sources (newest first)
export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const { data, error } = await supabase
    .from("content_sources")
    .select("id, label, url, geos, enabled, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const sources = (data as SourceRow[]).map(toItem);
  return NextResponse.json({ ok: true, sources });
}

// POST /api/content/sources — add a source. Body { label, url, geos?: "*" | string[] }.
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });
  const denied = staffOnly(req);
  if (denied) return denied;

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const label = typeof body.label === "string" ? body.label.trim() : "";
  const url   = typeof body.url   === "string" ? body.url.trim()   : "";
  const geosParsed = parseGeos(body.geos);

  if (!label) return NextResponse.json({ ok: false, error: "名稱必填" }, { status: 400 });
  if (!url)   return NextResponse.json({ ok: false, error: "Feed 網址必填" }, { status: 400 });
  if (!isSafePublicHttps(url))
    return NextResponse.json({ ok: false, error: "網址必須是公開的 https 網址（不可為內部/私有位址）" }, { status: 400 });
  if ("error" in geosParsed) return NextResponse.json({ ok: false, error: geosParsed.error }, { status: 400 });
  const geos = geosParsed.geos;

  const { data, error } = await supabase
    .from("content_sources")
    .insert({ label, url, geos })
    .select("id, label, url, geos, enabled, created_at, updated_at")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, source: toItem(data as SourceRow) }, { status: 201 });
}

// PATCH /api/content/sources — toggle / edit. Body { id, enabled?, label?, url?, geos? }.
export async function PATCH(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });
  const denied = staffOnly(req);
  if (denied) return denied;

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.label === "string" && body.label.trim()) patch.label = body.label.trim();
  if ("geos" in body) {
    const gp = parseGeos(body.geos);
    if ("error" in gp) return NextResponse.json({ ok: false, error: gp.error }, { status: 400 });
    patch.geos = gp.geos;
  }
  if (typeof body.url === "string" && body.url.trim()) {
    const url = body.url.trim();
    if (!isSafePublicHttps(url))
      return NextResponse.json({ ok: false, error: "網址必須是公開的 https 網址" }, { status: 400 });
    patch.url = url;
  }

  const { data, error } = await supabase
    .from("content_sources")
    .update(patch)
    .eq("id", id)
    .select("id, label, url, geos, enabled, created_at, updated_at")
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  return NextResponse.json({ ok: true, source: toItem(data as SourceRow) });
}

// DELETE /api/content/sources?id=<uuid>
export async function DELETE(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });
  const denied = staffOnly(req);
  if (denied) return denied;

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const { error } = await supabase.from("content_sources").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
