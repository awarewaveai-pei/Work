import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = new Set(["technical", "caption", "editorial", "rights"]);
const STATUSES = new Set(["queued", "running", "passed", "warned", "failed", "superseded", "withdrawn"]);

/** Persist one immutable QA evidence record; Release creation consumes these records. */
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED !== "true") return NextResponse.json({ ok: false, error: "qa_persistence_disabled" }, { status: 503 });
  let body: Record<string, unknown>; try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const candidateAssetId = typeof body.candidateAssetId === "string" ? body.candidateAssetId : "";
  const candidateChecksum = typeof body.candidateChecksum === "string" ? body.candidateChecksum : "";
  const qaKind = typeof body.qaKind === "string" ? body.qaKind : "";
  const status = typeof body.status === "string" ? body.status : "";
  const capabilityId = typeof body.capabilityId === "string" ? body.capabilityId : "";
  const capabilityVersion = typeof body.capabilityVersion === "string" ? body.capabilityVersion : "";
  const profileId = typeof body.profileId === "string" ? body.profileId : "";
  const profileVersion = typeof body.profileVersion === "string" ? body.profileVersion : "";
  if (!UUID.test(organizationId) || !UUID.test(candidateAssetId) || candidateChecksum.length < 16 || candidateChecksum.length > 128 || !KINDS.has(qaKind) || !STATUSES.has(status) || !capabilityId || !capabilityVersion || !profileId || !profileVersion) return NextResponse.json({ ok: false, error: "invalid QA report fields" }, { status: 400 });
  try { assertOrgAccess(req, organizationId); } catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const reportJson = body.reportJson && typeof body.reportJson === "object" && !Array.isArray(body.reportJson) ? body.reportJson : {};
  const reportSha256 = createHash("sha256").update(JSON.stringify(reportJson)).digest("hex");
  const db = getSupabaseWriteClient(); if (!db) return new NextResponse("db unavailable", { status: 503 });
  const candidate = await db.from("media_assets").select("id, organization_id, checksum_sha256").eq("id", candidateAssetId).maybeSingle();
  if (candidate.error) return NextResponse.json({ ok: false, error: "candidate_asset_lookup_failed" }, { status: 502 });
  if (!candidate.data || candidate.data.organization_id !== organizationId) {
    return NextResponse.json({ ok: false, error: "candidate_asset_not_found" }, { status: 404 });
  }
  if (candidate.data.checksum_sha256 && candidate.data.checksum_sha256 !== candidateChecksum) {
    return NextResponse.json({ ok: false, error: "candidate_checksum_mismatch" }, { status: 409 });
  }
  const inserted = await db.from("media_qa_reports").insert({ organization_id: organizationId, candidate_asset_id: candidateAssetId, candidate_checksum: candidateChecksum, qa_kind: qaKind, capability_id: capabilityId, capability_version: capabilityVersion, profile_id: profileId, profile_version: profileVersion, status, report_json: reportJson, report_sha256: reportSha256, supersedes_report_id: UUID.test(String(body.supersedesReportId ?? "")) ? body.supersedesReportId : null }).select("id, organization_id, candidate_asset_id, qa_kind, status, report_sha256, created_at").single();
  if (inserted.error) return NextResponse.json({ ok: false, error: inserted.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, report: inserted.data }, { status: 201 });
}
