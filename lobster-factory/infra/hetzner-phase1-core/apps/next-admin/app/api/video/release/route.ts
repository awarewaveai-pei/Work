import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { canApproveMedia, canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { loadAuthoritativeReleaseEvidence } from "@/lib/content/video/release-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Promote a candidate to a durable Release after the same fail-closed QA gate as preflight. */
export async function POST(req: Request): Promise<Response> {
  if (!canApproveMedia(resolveOpsRole(req))) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED !== "true") return NextResponse.json({ ok: false, error: "release_persistence_disabled" }, { status: 503 });
  let body: Record<string, unknown>; try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const candidateAssetId = typeof body.candidateAssetId === "string" ? body.candidateAssetId : "";
  const candidateChecksum = typeof body.candidateChecksum === "string" ? body.candidateChecksum : "";
  if (!UUID.test(organizationId) || !UUID.test(candidateAssetId) || candidateChecksum.length < 16 || candidateChecksum.length > 128) return NextResponse.json({ ok: false, error: "organizationId/candidate/checksum required" }, { status: 400 });
  try { assertOrgAccess(req, organizationId); } catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const db = getSupabaseWriteClient(); if (!db) return new NextResponse("db unavailable", { status: 503 });
  const evidence = await loadAuthoritativeReleaseEvidence(db, { organizationId, candidateAssetId, candidateChecksum });
  if (evidence.ok === false) return NextResponse.json({ ok: false, error: evidence.error }, { status: evidence.status });
  if (!evidence.gate.ok) return NextResponse.json({ ok: false, code: evidence.gate.code, message: evidence.gate.message, reportIds: evidence.gate.reportIds }, { status: 409 });
  const release = await db.from("media_releases").insert({ organization_id: organizationId, candidate_asset_id: candidateAssetId, candidate_checksum: candidateChecksum, status: "release_approved", qa_report_ids: evidence.gate.reportIds, release_json: body.releaseJson ?? {}, approved_at: new Date().toISOString() }).select("id, organization_id, candidate_asset_id, status, qa_report_ids, created_at, approved_at").single();
  if (release.error) return NextResponse.json({ ok: false, error: release.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, release: release.data });
}

/** The approved Releases of some candidate videos (V5.1): which ratios are already released. No QA evidence leaves here. */
export async function GET(req: Request): Promise<Response> {
  if (!canCreateAiImageJob(resolveOpsRole(req).role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const organizationId = q.get("organizationId") ?? "";
  const ids = (q.get("candidateAssetIds") ?? "").split(",").filter(Boolean);
  if (!UUID.test(organizationId) || ids.length === 0 || ids.length > 10 || !ids.every((i) => UUID.test(i))) return NextResponse.json({ ok: false, error: "organizationId and candidateAssetIds required" }, { status: 400 });
  try { assertOrgAccess(req, organizationId); } catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const db = getSupabaseWriteClient(); if (!db) return new NextResponse("db unavailable", { status: 503 });
  const { data, error } = await db.from("media_releases").select("id, candidate_asset_id, candidate_checksum, created_at")
    .eq("organization_id", organizationId).eq("status", "release_approved").in("candidate_asset_id", ids).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}
