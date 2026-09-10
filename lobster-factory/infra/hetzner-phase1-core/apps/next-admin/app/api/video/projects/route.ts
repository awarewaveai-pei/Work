import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, effectiveOrgId, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODES = new Set(["quick_video", "short_drama", "footage_edit"]);
const STAGES = new Set(["create", "produce", "review", "release", "measure", "archived"]);

function guard(req: Request): Response | null { return canCreateAiImageJob(resolveOpsRole(req).role) ? null : NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }); }
function denied(error: unknown): Response | null { return error instanceof OrgAccessError ? toOrgAccessResponse(error) : null; }

export async function GET(req: Request): Promise<Response> {
  const fail = guard(req); if (fail) return fail;
  const requested = new URL(req.url).searchParams.get("organizationId")?.trim() || null;
  let organizationId: string | null;
  try { organizationId = effectiveOrgId(req, requested); } catch (error) { return denied(error) ?? NextResponse.json({ ok: false, error: "invalid_organization" }, { status: 400 }); }
  const db = getSupabaseWriteClient(); if (!db) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });
  let projects = db.from("media_production_projects").select("id, organization_id, title, production_mode, lifecycle_stage, brief_json, active_story_bible_revision_id, active_candidate_asset_id, active_release_id, created_at, updated_at").order("updated_at", { ascending: false }).limit(100);
  if (organizationId) projects = projects.eq("organization_id", organizationId);
  const { data, error } = await projects;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(req: Request): Promise<Response> {
  const fail = guard(req); if (fail) return fail;
  let body: Record<string, unknown>; try { body = await req.json() as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  let organizationId: string | null;
  try { organizationId = effectiveOrgId(req, typeof body.organizationId === "string" ? body.organizationId.trim() : null); } catch (error) { return denied(error) ?? NextResponse.json({ ok: false, error: "invalid_organization" }, { status: 400 }); }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const productionMode = typeof body.productionMode === "string" ? body.productionMode : "";
  if (!organizationId || !UUID.test(organizationId) || !title || !MODES.has(productionMode)) return NextResponse.json({ ok: false, error: "organizationId, title and valid productionMode required" }, { status: 400 });
  const db = getSupabaseWriteClient(); if (!db) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });
  const inserted = await db.from("media_production_projects").insert({ organization_id: organizationId, title, production_mode: productionMode, lifecycle_stage: "create", brief_json: body.brief && typeof body.brief === "object" && !Array.isArray(body.brief) ? body.brief : {} }).select().single();
  if (inserted.error) return NextResponse.json({ ok: false, error: inserted.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: inserted.data }, { status: 201 });
}

export async function PATCH(req: Request): Promise<Response> {
  const fail = guard(req); if (fail) return fail;
  let body: Record<string, unknown>; try { body = await req.json() as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id : "";
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "project id required" }, { status: 400 });
  const db = getSupabaseWriteClient(); if (!db) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });
  const existing = await db.from("media_production_projects").select("organization_id").eq("id", id).maybeSingle();
  if (existing.error) return NextResponse.json({ ok: false, error: existing.error.message }, { status: 500 });
  if (!existing.data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  try { assertOrgAccess(req, existing.data.organization_id); } catch (error) { return denied(error) ?? NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }); }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.lifecycleStage === "string") { if (!STAGES.has(body.lifecycleStage)) return NextResponse.json({ ok: false, error: "invalid lifecycleStage" }, { status: 400 }); patch.lifecycle_stage = body.lifecycleStage; }
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
  if (body.brief && typeof body.brief === "object" && !Array.isArray(body.brief)) patch.brief_json = body.brief;
  const updated = await db.from("media_production_projects").update(patch).eq("id", id).select().single();
  if (updated.error) return NextResponse.json({ ok: false, error: updated.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: updated.data });
}
