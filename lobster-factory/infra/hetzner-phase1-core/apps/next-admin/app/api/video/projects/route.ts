import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, effectiveOrgId, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { attachVideoAssets, ensureWorkbenchProject, FINISHED_VIDEO_MIME, PROJECT_COLUMNS as COLUMNS, updateProjectRow } from "@/lib/content/video/projects";
import { parseAutoBudget } from "@/lib/content/video/auto-run-budget";
import { rerenderSince } from "@/lib/content/video/rerender-mark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODES = new Set(["quick_video", "short_drama", "footage_edit"]);
const STAGES = new Set(["create", "produce", "review", "release", "measure", "archived"]);
// Same values as the 0138 check constraints; a bad value is a 400 here, not a 500 from the database.
const AUTONOMY = new Set(["guided", "auto_after_render", "full_auto"]);
const SOURCES = new Set(["manual", "script_forge", "content_topic", "video_workbench"]);   // 0164
const FORMATS = new Set(["16x9", "9x16", "4x5"]);

function guard(req: Request): Response | null { return canCreateAiImageJob(resolveOpsRole(req).role) ? null : NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }); }
function denied(error: unknown): Response | null { return error instanceof OrgAccessError ? toOrgAccessResponse(error) : null; }
const bad = (error: string) => NextResponse.json({ ok: false, error }, { status: 400 });

/** Fields a client may set on create or update; last_error is written only by the server (V6). */
function editable(body: Record<string, unknown>): Record<string, unknown> | string {
  const out: Record<string, unknown> = {};
  if (body.title !== undefined) { const t = typeof body.title === "string" ? body.title.trim() : ""; if (!t || t.length > 180) return "invalid title"; out.title = t; }
  if (body.lifecycleStage !== undefined) { if (!STAGES.has(String(body.lifecycleStage))) return "invalid lifecycleStage"; out.lifecycle_stage = body.lifecycleStage; }
  if (body.productionMode !== undefined) { if (!MODES.has(String(body.productionMode))) return "invalid productionMode"; out.production_mode = body.productionMode; }
  if (body.autonomy !== undefined) { if (!AUTONOMY.has(String(body.autonomy))) return "invalid autonomy"; out.autonomy = body.autonomy; out.last_error = null; }   // a new run clears the old stop reason
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
    // What the published video did (V8 / D5: operations is not a step, it is this section; the page shows it only when rows exist).
    const outcomes = releaseIds.length
      ? await db.from("media_outcome_snapshots").select("id, release_id, platform, maturity, observed_at, metrics")
        .eq("organization_id", project.data.organization_id).in("release_id", releaseIds).order("observed_at", { ascending: false }).limit(200)
      : { data: [], error: null };
    if (outcomes.error) return NextResponse.json({ ok: false, error: outcomes.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: project.data, assets: assets.data ?? [], releases: releases.data ?? [], deliveries: deliveries.data ?? [], outcomes: outcomes.data ?? [] });
  }
  let organizationId: string | null;
  try { organizationId = effectiveOrgId(req, url.searchParams.get("organizationId")?.trim() || null); } catch (error) { return denied(error) ?? bad("invalid_organization"); }
  let projects = db.from("media_production_projects").select(COLUMNS).order("updated_at", { ascending: false }).limit(100);
  if (url.searchParams.get("includeArchived") !== "1") projects = projects.neq("lifecycle_stage", "archived");
  if (organizationId) projects = projects.eq("organization_id", organizationId);
  const sourceRef = url.searchParams.get("sourceRef")?.trim();
  if (sourceRef) projects = projects.eq("source_ref", sourceRef);
  // The workbench lists the projects it did not make: excluded here, so the 100 newest are 100 of those.
  const excludeSource = url.searchParams.get("excludeSource");
  if (excludeSource !== null) {
    if (!SOURCES.has(excludeSource)) return bad("invalid excludeSource");
    projects = projects.neq("source", excludeSource);
  }
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
  if (source === "video_workbench" && !sourceRef) return bad("sourceRef required for video_workbench");
  const attach = body.attachAssetIds === undefined ? [] : body.attachAssetIds;
  if (!Array.isArray(attach) || attach.length > 50 || !attach.every((x) => typeof x === "string" && UUID.test(x))) return bad("attachAssetIds must be at most 50 asset ids");
  const db = getSupabaseWriteClient(); if (!db) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });
  let item: Record<string, unknown>; let created = true;
  if (source === "video_workbench") {
    // The workbench asks every time it needs its project: one row per (org, sourceRef), created on first ask.
    const ensured = await ensureWorkbenchProject(db, organizationId, sourceRef!, String(fields.title), { ...fields, production_mode: productionMode });
    if (ensured.ok === false) return NextResponse.json({ ok: false, error: ensured.error }, { status: 500 });
    item = ensured.item; created = ensured.created;
  } else {
    const inserted = await db.from("media_production_projects").insert({
      lifecycle_stage: "create", brief_json: {}, ...fields,
      organization_id: organizationId, production_mode: productionMode, source, source_ref: sourceRef,
    }).select(COLUMNS).single();
    if (inserted.error) return NextResponse.json({ ok: false, error: inserted.error.message }, { status: 500 });
    item = inserted.data;
  }
  const attached = await attachVideoAssets(db, organizationId, String(item.id), attach as string[]);
  if (attached.ok === false) return NextResponse.json({ ok: false, error: attached.error, item }, { status: 500 });
  return NextResponse.json({ ok: true, item, attached: attached.attached }, { status: created ? 201 : 200 });
}

/**
 * Plan U5 一鍵到草稿 (§12): the workbench's 停止／關閉／從這裡繼續 reach the server half of ONE run, named by its runId.
 * stop: brief_json.autoStop = runId (a later render of that run is refused and never re-arms the row: quick-render route),
 * and when the row's autoBudget is that run, autonomy guided (the schedule leaves it; project-advance-deps re-checks before
 * paying). resume: that run's autoStop removed; when the row's autoBudget is that run, budgetTwd = the new limit (never
 * below what was spent) and, once its renders reached the server (renderRatios), autonomy auto_after_render with
 * last_error cleared. armed = the row now runs that run.
 * resume + rerender:true (B26 part 2: the workbench's cut is outdated, it will render again): the row goes back to stage
 * produce and brief_json.autoRerender = {runId, at} -- auto-advance then waits for a render sent after `at` instead of
 * reviewing the earlier cut (rerender-mark.ts). Resumed again while the render it asked for is still on its way (no finished
 * cut since the mark), the mark keeps its time: moving it later would hide that in-flight render.
 */
async function autoRunChange(db: NonNullable<ReturnType<typeof getSupabaseWriteClient>>, org: string, id: string, raw: unknown): Promise<Response> {
  const run = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const runId = typeof run.runId === "string" && /^[A-Za-z0-9-]{1,64}$/.test(run.runId) ? run.runId : "";
  const budgetTwd = run.budgetTwd === undefined ? undefined : Number(run.budgetTwd);
  if (!runId || (run.action !== "stop" && run.action !== "resume")) return bad("autoRun needs a runId and action stop or resume");
  if (budgetTwd !== undefined && (run.action !== "resume" || !Number.isFinite(budgetTwd) || budgetTwd < 0)) return bad("budgetTwd is a limit >= 0 on resume only");
  if (run.rerender !== undefined && (run.action !== "resume" || typeof run.rerender !== "boolean")) return bad("rerender is true/false on resume only");
  const rerender = run.rerender === true;
  let armed = false, refused = "", keepAt: string | null = null;
  if (rerender) {
    const cur = await db.from("media_production_projects").select("brief_json").eq("organization_id", org).eq("id", id).maybeSingle();
    const since = rerenderSince(cur.data?.brief_json, runId);
    if (since) {
      const made = await db.from("media_assets").select("id").eq("organization_id", org).eq("media_project_id", id).eq("mime_type", FINISHED_VIDEO_MIME).eq("is_current", true).gte("created_at", since).limit(1);
      if (!made.error && !made.data?.length) keepAt = since;
    }
  }
  const saved = await updateProjectRow(db, org, id, (row) => {
    const brief = { ...((row.brief_json ?? {}) as Record<string, unknown>) }, budget = parseAutoBudget(brief.autoBudget);
    armed = false;
    if (run.action === "stop") return { brief_json: { ...brief, autoStop: runId }, ...((brief.autoBudget as { runId?: unknown } | undefined)?.runId === runId ? { autonomy: "guided" } : {}) };
    if (brief.autoStop === runId) delete brief.autoStop;
    if (budget?.runId !== runId) return { brief_json: brief };
    if (budgetTwd !== undefined && budgetTwd < budget.spentTwd) { refused = `上限不能低於已用的 NT$${budget.spentTwd}`; return null; }
    const next = { ...brief, autoBudget: { ...(brief.autoBudget as Record<string, unknown>), ...(budgetTwd !== undefined ? { budgetTwd } : {}) },
      ...(rerender ? { autoRerender: { runId, at: keepAt ?? new Date().toISOString() } } : {}) };
    const stage = rerender ? { lifecycle_stage: "produce" } : {};
    armed = !!budget.renderRatios?.length; // before its renders reached the server (quick-render route) they arm it themselves
    return armed ? { brief_json: next, autonomy: "auto_after_render", last_error: null, ...stage } : { brief_json: next, ...stage };
  });
  if (saved.ok === false) return NextResponse.json({ ok: false, error: saved.error }, { status: saved.error === "concurrent_update" ? 409 : 500 });
  if (refused) return NextResponse.json({ ok: false, error: refused }, { status: 409 });
  return NextResponse.json({ ok: true, item: saved.item, armed });
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
  if (body.autoRun !== undefined) {
    if (Object.keys(fields).length) return bad("autoRun cannot be combined with other fields");
    return autoRunChange(db, String(existing.data.organization_id), id, body.autoRun);
  }
  const updated = await db.from("media_production_projects").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id).select(COLUMNS).single();
  if (updated.error) return NextResponse.json({ ok: false, error: updated.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: updated.data });
}
