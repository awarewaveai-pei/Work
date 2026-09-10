import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { effectiveOrgId, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { canonicalStoryBibleSha256, prepareStoryBibleDraft, storyBibleAssetIds, StoryBibleValidationError } from "@/lib/content/video/story-bible-persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function accessError(error: unknown): Response | null {
  return error instanceof OrgAccessError ? toOrgAccessResponse(error) : null;
}

export async function GET(req: Request): Promise<Response> {
  if (!canCreateAiImageJob(resolveOpsRole(req).role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const requested = new URL(req.url).searchParams.get("organizationId");
  let organizationId: string | null;
  try { organizationId = effectiveOrgId(req, requested?.trim() || null); }
  catch (error) { return accessError(error) ?? NextResponse.json({ ok: false, error: "invalid organization" }, { status: 400 }); }
  if (!organizationId || !UUID.test(organizationId)) return NextResponse.json({ ok: false, error: "organizationId required" }, { status: 400 });
  const db = getSupabaseWriteClient(); if (!db) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });
  const query = db.from("media_story_bible_revisions").select("id, organization_id, series_id, revision, status, document_json, document_sha256, created_at, approved_at").eq("organization_id", organizationId).order("series_id").order("revision", { ascending: false }).limit(100);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(req: Request): Promise<Response> {
  if (!canCreateAiImageJob(resolveOpsRole(req).role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let body: Record<string, unknown>; try { body = await req.json() as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  let organizationId: string | null;
  try { organizationId = effectiveOrgId(req, typeof body.organizationId === "string" ? body.organizationId.trim() : null); }
  catch (error) { return accessError(error) ?? NextResponse.json({ ok: false, error: "invalid organization" }, { status: 400 }); }
  if (!organizationId || !UUID.test(organizationId)) return NextResponse.json({ ok: false, error: "organizationId required" }, { status: 400 });
  const candidate = body.storyBible;
  const seriesId = candidate && typeof candidate === "object" && !Array.isArray(candidate) && typeof (candidate as Record<string, unknown>).seriesId === "string" ? (candidate as Record<string, unknown>).seriesId : "";
  if (!seriesId) return NextResponse.json({ ok: false, error: "seriesId required" }, { status: 400 });
  const db = getSupabaseWriteClient(); if (!db) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });
  const latest = await db.from("media_story_bible_revisions").select("revision").eq("organization_id", organizationId).eq("series_id", seriesId).order("revision", { ascending: false }).limit(1).maybeSingle();
  if (latest.error) return NextResponse.json({ ok: false, error: latest.error.message }, { status: 500 });
  let document: Record<string, unknown>;
  try { document = prepareStoryBibleDraft(candidate, organizationId, Number(latest.data?.revision ?? 0) + 1); }
  catch (error) { if (error instanceof StoryBibleValidationError) return NextResponse.json({ ok: false, error: error.message, findings: error.findings }, { status: 422 }); return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "invalid_story_bible" }, { status: 400 }); }
  const assetIds = storyBibleAssetIds(document);
  if (assetIds.length) {
    const owned = await db.from("media_assets").select("id").eq("organization_id", organizationId).in("id", assetIds);
    if (owned.error) return NextResponse.json({ ok: false, error: owned.error.message }, { status: 500 });
    if ((owned.data ?? []).length !== assetIds.length) return NextResponse.json({ ok: false, error: "reference asset is missing or belongs to another organization" }, { status: 422 });
  }
  const inserted = await db.from("media_story_bible_revisions").insert({ organization_id: organizationId, series_id: seriesId, revision: document.revision, status: "draft", document_json: document, document_sha256: canonicalStoryBibleSha256(document) }).select("id, organization_id, series_id, revision, status, document_json, document_sha256, created_at, approved_at").single();
  if (inserted.error) return NextResponse.json({ ok: false, error: inserted.error.message }, { status: inserted.error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ ok: true, item: inserted.data }, { status: 201 });
}
