import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { evaluateReleaseGate, type QaKind, type ReleaseQaRecord } from "@/lib/content/video/release-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const KINDS: readonly QaKind[] = ["technical", "caption", "editorial", "rights"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Promote a candidate to a durable Release after the same fail-closed QA gate as preflight. */
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED !== "true") return NextResponse.json({ ok: false, error: "release_persistence_disabled" }, { status: 503 });
  let body: Record<string, unknown>; try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const candidateAssetId = typeof body.candidateAssetId === "string" ? body.candidateAssetId : "";
  const candidateChecksum = typeof body.candidateChecksum === "string" ? body.candidateChecksum : "";
  const requiredKinds = Array.isArray(body.requiredKinds) ? body.requiredKinds as QaKind[] : [];
  const reports = Array.isArray(body.reports) ? body.reports as ReleaseQaRecord[] : [];
  if (!UUID.test(organizationId) || !UUID.test(candidateAssetId) || candidateChecksum.length < 16 || candidateChecksum.length > 128 || requiredKinds.length === 0 || !reports.length) return NextResponse.json({ ok: false, error: "organizationId/candidate/checksum/QA required" }, { status: 400 });
  try { assertOrgAccess(req, organizationId); } catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  if (requiredKinds.some((k) => !KINDS.includes(k))) return NextResponse.json({ ok: false, error: "unknown QA kind" }, { status: 400 });
  if (reports.some((r) => !r || !UUID.test(r.id) || !KINDS.includes(r.kind))) return NextResponse.json({ ok: false, error: "QA report id/kind invalid" }, { status: 400 });
  const gate = evaluateReleaseGate({ organizationId, candidateAssetId, candidateChecksum, requiredKinds, reports } as never);
  if (!gate.ok) return NextResponse.json({ ok: false, code: gate.code, message: gate.message, reportIds: gate.reportIds }, { status: 409 });
  const db = getSupabaseWriteClient(); if (!db) return new NextResponse("db unavailable", { status: 503 });
  const candidate = await db.from("media_assets").select("id, organization_id, checksum_sha256").eq("id", candidateAssetId).maybeSingle();
  if (candidate.error) return NextResponse.json({ ok: false, error: "candidate_asset_lookup_failed" }, { status: 502 });
  if (!candidate.data || candidate.data.organization_id !== organizationId) return NextResponse.json({ ok: false, error: "candidate_asset_not_found" }, { status: 404 });
  if (candidate.data.checksum_sha256 && candidate.data.checksum_sha256 !== candidateChecksum) return NextResponse.json({ ok: false, error: "candidate_checksum_mismatch" }, { status: 409 });
  const qaRows = reports.filter((r) => gate.reportIds.includes(r.id)).map((r) => { const reportJson = { source: "release-api", reportId: r.id, kind: r.kind, status: r.status }; return { id: r.id, organization_id: organizationId, candidate_asset_id: candidateAssetId, candidate_checksum: candidateChecksum, qa_kind: r.kind, capability_id: "video.qa", capability_version: "1.0.0", profile_id: r.profileId, profile_version: r.profileVersion, status: r.status, report_json: reportJson, report_sha256: createHash("sha256").update(JSON.stringify(reportJson)).digest("hex") }; });
  const qa = await db.from("media_qa_reports").upsert(qaRows, { onConflict: "id", ignoreDuplicates: true });
  if (qa.error) return NextResponse.json({ ok: false, error: qa.error.message }, { status: 500 });
  const release = await db.from("media_releases").insert({ organization_id: organizationId, candidate_asset_id: candidateAssetId, candidate_checksum: candidateChecksum, status: "release_approved", qa_report_ids: gate.reportIds, release_json: body.releaseJson ?? {}, approved_at: new Date().toISOString() }).select("id, organization_id, candidate_asset_id, status, qa_report_ids, created_at, approved_at").single();
  if (release.error) return NextResponse.json({ ok: false, error: release.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, release: release.data });
}
