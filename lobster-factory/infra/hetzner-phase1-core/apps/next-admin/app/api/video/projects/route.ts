import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, effectiveOrgId, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODES = new Set(["quick_video", "short_drama", "footage_edit"]);
const STAGES = new Set(["create", "produce", "review", "release", "measure", "archived"]);
// Same values as the 0138 check constraints; a bad value is a 400 here, not a 500 from the database.
const AUTONOMY = new Set(["guided", "auto_after_render", "full_auto"]);
const SOURCES = new Set(["manual", "script_forge", "content_topic"]);
const FORMATS = new Set(["16x9", "9x16", "4x5"]);
const COLUMNS = "id, organization_id, title, production_mode, lifecycle_stage, autonomy, source, source_ref, formats, last_error, brief_json, active_story_bible_revision_id, active_candidate_asset_id, active_release_id, created_at, updated_at";

function guard(req: Request): Response | null { return canCreateAiImageJob(resolveOpsRole(req).role) ? null : NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }); }
function denied(error: unknown): Response | null { return error instanceof OrgAccessError ? toOrgAccessResponse(error) : null; }
const bad = (error: string) => NextResponse.json({ ok: false, error }, { status: 400 });

/** Fields a client may set on create or update; last_error is written only by the server (V6). */
function editable(body: Record<string, unknown>): Record<string, unknown> | string {
  const out: Record<string, unknown> = {};
  if (body.title !== undefined) { const t = typeof body.title === "string" ? body.title.trim() : ""; if (!t || t.length > 180) return "invalid title"; out.title = t; }
  if (body.lifecycleStage !== undefined) { if (!STAGES.has(String(body.lifecycleStage))) return "invalid lifecycleStage"; out.lifecycle_stage = body.lifecycleStage; }
  if (body.productionMode !== undefined) { if (!MODES.has(String(body.productionMode))) return "invalid productionMode"; out.production_mode = body.productionMode; }
  if (body.autonomy !== undefined) { if (!AUTONOMY.has(String(body.autonomy))) return "invalid autonomy"; out.autonomy = body.autonomy; }
  if (body.formats !== undefined) {
    const f = Array.isArray(body.formats) ? [...new Set(body.formats.map(String))] : [];
    if (!f.length || !f.every((x) => FORMATS.has(x))) return "invalid formats"; out.formats = f;
  }
  if (body.brief !== undefined) { if (!body.brief || typeof body.brief !== "object" || Array.isArray(body.brief)) return "invalid brief"; out.brief_json = body.brief; }
  return out;
}

/** ?id= → one project with its current assets (org-checked); otherwise the org's projects, archived left out. */
export async function GET(req: Request): Promise<Response> {
  const fail = guard(req); if (fail) return fail;
  const url = new URL(req.url);
  const db = getSupabaseWriteClient(); if (!db) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });
  const id = url.searchParams.get("id")?.trim() || "";
  if (id) {
    if (!UUID.test(id)) return bad("invalid id");
    const project = await db.from("media_production_projects").select(COLUMNS).eq("id", id).maybeSingle();
    if (project.error) return NextResponse.json({ ok: false, error: project.error.message }, { status: 500 });
    if (!project.data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    try { assertOrgAccess(req, project.data.organization_id); } catch (error) { return denied(error) ?? NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }); }
    const assets = await db.from("media_assets").select("id, object_url, mime_type, byte_size, checksum_sha256, metadata, created_at")
      .eq("media_project_id", id).eq("organization_id", project.data.organization_id).eq("is_current", true).order("created_at", { ascending: false });
    if (assets.error) return NextResponse.json({ ok: false, error: assets.error.message }, { status: 500 });
    // Where the project went: Releases of its assets and their delivery attempts (result page V2.2).
    const assetIds = (assets.data ?? []).map((a) => a.id);
    const releases = assetIds.length
      ? await db.from("media_releases").select("id, candidate_asset_id, status, created_at, approved_at, withdrawn_at")
        .eq("organization_id", project.data.organization_id).in("candidate_asset_id", assetIds).order("created_at", { ascending: false })
      : { data: [], error: null };
    if (releases.error) return NextResponse.json({ ok: false, error: releases.error.message }, { status: 500 });
    const releaseIds = (releases.data ?? []).map((r) => r.id);
    const deliveries = releaseIds.length
      ? await db.from("media_delivery_attempts").select("id, release_id, destination, variant, status, external_id, created_at")
        .eq("organization_id", project.data.organization_id).in("release_id", releaseIds).order("created_at", { ascending: false })
      : { data: [], error: null };
    if (deliveries.error) return NextResponse.json({ ok: false, error: deliveries.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: project.data, assets: assets.data ?? [], releases: releases.data ?? [], deliveries: deliveries.data ?? [] });
  }
  let organizationId: string | null;
  try { organizationId = effectiveOrgId(req, url.searchParams.get("organizationId")?.trim() || null); } catch (error) { return denied(error) ?? bad("invalid_organization"); }
  let projects = db.from("media_production_projects").select(COLUMNS).order("updated_at", { ascending: false }).limit(100);
  if (url.searchParams.get("includeArchived") !== "1") projects = projects.neq("lifecycle_stage", "archived");
  if (organizationId) projects = projects.eq("organization_id", organizationId);
  const { data, error } = await projects;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(req: Request): Promise<Response> {
  const fail = guard(req); if (fail) return fail;
  let body: Record<string, unknown>; try { body = await req.json() as Record<string, unknown>; } catch { return bad("invalid_json"); }
  let organizationId: string | null;
  try { organizationId = effectiveOrgId(req, typeof body.organizationId === "string" ? body.organizationId.trim() : null); } catch (error) { return denied(error) ?? bad("invalid_organization"); }
  const productionMode = typeof body.productionMode === "string" ? body.productionMode : "";
  if (!organizationId || !UUID.test(organizationId) || !MODES.has(productionMode) || body.title === undefined) return bad("organizationId, title and valid productionMode required");
  const fields = editable(body); if (typeof fields === "string") return bad(fields);
  const source = body.source === undefined ? "manual" : String(body.source);
  if (!SOURCES.has(source)) return bad("invalid source");
  const sourceRef = typeof body.sourceRef === "string" && body.sourceRef.trim() ? body.sourceRef.trim().slice(0, 200) : null;
  const db = getSupabaseWriteClient(); if (!db) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });
  const inserted = await db.from("media_production_projects").insert({
    lifecycle_stage: "create", brief_json: {}, ...fields,
    organization_id: organizationId, production_mode: productionMode, source, source_ref: sourceRef,
  }).select(COLUMNS).single();
  if (inserted.error) return NextResponse.json({ ok: false, error: inserted.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: inserted.data }, { status: 201 });
}

export async function PATCH(req: Request): Promise<Response> {
  const fail = guard(req); if (fail) return fail;
  let body: Record<string, unknown>; try { body = await req.json() as Record<string, unknown>; } catch { return bad("invalid_json"); }
  const id = typeof body.id === "string" ? body.id : "";
  if (!UUID.test(id)) return bad("project id required");
  const fields = editable(body); if (typeof fields === "string") return bad(fields);
  const db = getSupabaseWriteClient(); if (!db) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });
  const existing = await db.from("media_production_projects").select("organization_id").eq("id", id).maybeSingle();
  if (existing.error) return NextResponse.json({ ok: false, error: existing.error.message }, { status: 500 });
  if (!existing.data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  try { assertOrgAccess(req, existing.data.organization_id); } catch (error) { return denied(error) ?? NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }); }
  const updated = await db.from("media_production_projects").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id).select(COLUMNS).single();
  if (updated.error) return NextResponse.json({ ok: false, error: updated.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: updated.data });
}
