import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Content Studio generated-draft persistence (see migration 0041_content_drafts.sql).
// Autosaves every generated article so it survives reload / regenerate and is re-openable
// across machines. Service-role-only table; this route is the only accessor (ops-role gated).

const LIST_LIMIT = 100;
const MAX_MARKDOWN_BYTES = 600_000; // ~600KB guard — articles are far smaller; reject runaway payloads

interface DraftRow {
  id: string;
  organization_id: string | null;
  site_id: string | null;
  keyword: string;
  title: string | null;
  language: string | null;
  article_type: string | null;
  markdown: string;
  meta: unknown;
  slug_hint: string | null;
  seo_score: number | null;
  status: string;
  form_snapshot: unknown;
  created_at: string;
  updated_at: string;
}

function toFull(r: DraftRow) {
  return {
    id: r.id,
    organizationId: r.organization_id,
    siteId: r.site_id,
    keyword: r.keyword,
    title: r.title,
    language: r.language,
    articleType: r.article_type,
    markdown: r.markdown,
    meta: r.meta,
    slugHint: r.slug_hint,
    seoScore: r.seo_score,
    status: r.status,
    formSnapshot: r.form_snapshot,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toListItem(r: Omit<DraftRow, "markdown" | "meta" | "form_snapshot">) {
  return {
    id: r.id,
    keyword: r.keyword,
    title: r.title,
    language: r.language,
    articleType: r.article_type,
    slugHint: r.slug_hint,
    seoScore: r.seo_score,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

// GET /api/content/drafts            → list (light fields, newest first)
// GET /api/content/drafts?id=<uuid>  → single draft (full markdown + meta + form snapshot)
export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const id = new URL(req.url).searchParams.get("id");

  if (id) {
    const { data, error } = await supabase
      .from("content_drafts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, draft: toFull(data as DraftRow) });
  }

  const rawSiteId = new URL(req.url).searchParams.get("siteId");
  // Only filter by site_id when it is a valid UUID — env-sourced sites use non-UUID ids like "1",
  // which Postgres rejects with "invalid input syntax for type uuid" and returns a 500.
  const uuidRe    = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const siteId    = rawSiteId && uuidRe.test(rawSiteId) ? rawSiteId : null;
  let query = supabase
    .from("content_drafts")
    .select("id, organization_id, site_id, keyword, title, language, article_type, slug_hint, seo_score, status, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (siteId) query = query.eq("site_id", siteId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const drafts = (data as Array<Omit<DraftRow, "markdown" | "meta" | "form_snapshot">>).map(toListItem);
  return NextResponse.json({ ok: true, drafts });
}

// POST /api/content/drafts — upsert. Body { id?, keyword, markdown, title?, language?, articleType?,
// meta?, slugHint?, seoScore?, status?, formSnapshot?, siteId?, organizationId? }.
// With id → update that row; without → insert a new draft.
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const id       = str(body.id);
  const keyword  = str(body.keyword);
  const markdown = typeof body.markdown === "string" ? body.markdown : "";

  if (!keyword)  return NextResponse.json({ ok: false, error: "keyword required" }, { status: 400 });
  if (!markdown) return NextResponse.json({ ok: false, error: "markdown required" }, { status: 400 });
  if (Buffer.byteLength(markdown, "utf8") > MAX_MARKDOWN_BYTES)
    return NextResponse.json({ ok: false, error: "markdown too large" }, { status: 413 });

  const status = str(body.status);
  const seoRaw = body.seoScore;
  const seoScore = typeof seoRaw === "number" && Number.isFinite(seoRaw) ? Math.round(seoRaw) : null;

  // Columns common to insert + update. meta / form_snapshot are jsonb — pass through as-is (objects).
  const fields = {
    keyword,
    title:         str(body.title),
    language:      str(body.language),
    article_type:  str(body.articleType),
    markdown,
    meta:          (body.meta ?? null) as object | null,
    slug_hint:     str(body.slugHint),
    seo_score:     seoScore,
    ...(status === "published" || status === "archived" || status === "draft" ? { status } : {}),
    form_snapshot: (body.formSnapshot ?? null) as object | null,
    site_id:       str(body.siteId),
    organization_id: str(body.organizationId),
  };

  if (id) {
    const { data, error } = await supabase
      .from("content_drafts")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, draft: toFull(data as DraftRow) });
  }

  const { data, error } = await supabase
    .from("content_drafts")
    .insert(fields)
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, draft: toFull(data as DraftRow) }, { status: 201 });
}

// DELETE /api/content/drafts?id=<uuid>
export async function DELETE(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const { error } = await supabase.from("content_drafts").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
