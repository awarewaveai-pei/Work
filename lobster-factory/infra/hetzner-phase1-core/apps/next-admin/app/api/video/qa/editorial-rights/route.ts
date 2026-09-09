import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { runEditorialQa, runRightsQa, type AutomatedQaReport } from "@/lib/content/video/editorial-rights-qa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Run deterministic editorial and rights checks and persist both immutable
 * reports.  Asset ownership is resolved server-side; caller supplied evidence
 * can only reference assets in the same organization.
 */
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED !== "true") return NextResponse.json({ ok: false, error: "qa_persistence_disabled" }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const organizationId = typeof body.organizationId === "string" ? body.organizationId.trim() : "";
  const candidateAssetId = typeof body.candidateAssetId === "string" ? body.candidateAssetId.trim() : "";
  const candidateChecksum = typeof body.candidateChecksum === "string" ? body.candidateChecksum.trim() : "";
  if (!UUID.test(organizationId) || !UUID.test(candidateAssetId) || candidateChecksum.length < 16 || candidateChecksum.length > 128) {
    return NextResponse.json({ ok: false, error: "organizationId/candidateAssetId/candidateChecksum invalid" }, { status: 400 });
  }
  try { assertOrgAccess(req, organizationId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });
  const candidate = await db.from("media_assets")
    .select("id, organization_id, checksum_sha256, metadata")
    .eq("id", candidateAssetId)
    .maybeSingle();
  if (candidate.error) return NextResponse.json({ ok: false, error: "candidate_asset_lookup_failed" }, { status: 502 });
  if (!candidate.data || candidate.data.organization_id !== organizationId) return NextResponse.json({ ok: false, error: "candidate_asset_not_found" }, { status: 404 });
  if (candidate.data.checksum_sha256 && candidate.data.checksum_sha256 !== candidateChecksum) return NextResponse.json({ ok: false, error: "candidate_checksum_mismatch" }, { status: 409 });

  const metadata = candidate.data.metadata && typeof candidate.data.metadata === "object" && !Array.isArray(candidate.data.metadata)
    ? candidate.data.metadata as Record<string, unknown>
    : {};
  const editorialInput = body.editorial && typeof body.editorial === "object" && !Array.isArray(body.editorial)
    ? body.editorial as Record<string, unknown>
    : { title: metadata.title, script: metadata.script, requiredTerms: metadata.requiredTerms, forbiddenTerms: metadata.forbiddenTerms };

  const rawRights = Array.isArray(body.rightsAssets) ? body.rightsAssets : [];
  const evidenceIds = [candidateAssetId, ...rawRights.map((item) => item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>).assetId : null)]
    .filter((value): value is string => typeof value === "string" && UUID.test(value));
  const assetRows = await db.from("media_assets").select("id, organization_id, metadata").eq("organization_id", organizationId).in("id", [...new Set(evidenceIds)]);
  if (assetRows.error) return NextResponse.json({ ok: false, error: "rights_asset_lookup_failed" }, { status: 502 });
  const byId = new Map((assetRows.data ?? []).map((row) => [String(row.id), row]));
  if (rawRights.some((item) => !item || typeof item !== "object" || Array.isArray(item) || typeof (item as Record<string, unknown>).assetId !== "string" || !byId.has(String((item as Record<string, unknown>).assetId)))) {
    return NextResponse.json({ ok: false, error: "rights evidence references an unknown tenant asset" }, { status: 422 });
  }
  const candidateMetadata = metadata;
  const candidateRights = {
    assetId: candidateAssetId,
    status: candidateMetadata.rights_status ?? candidateMetadata.rightsStatus,
    licenseRef: candidateMetadata.license_ref ?? candidateMetadata.licenseRef,
    sourceRef: candidateMetadata.source_ref ?? candidateMetadata.sourceRef,
    expiresAt: candidateMetadata.rights_expires_at ?? candidateMetadata.rightsExpiresAt,
  };
  const suppliedRights = rawRights.map((item) => {
    const value = item as Record<string, unknown>;
    const row = byId.get(String(value.assetId));
    const assetMetadata = row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
    return {
      assetId: value.assetId,
      status: value.status ?? assetMetadata.rights_status ?? assetMetadata.rightsStatus,
      licenseRef: value.licenseRef ?? assetMetadata.license_ref ?? assetMetadata.licenseRef,
      sourceRef: value.sourceRef ?? assetMetadata.source_ref ?? assetMetadata.sourceRef,
      expiresAt: value.expiresAt ?? assetMetadata.rights_expires_at ?? assetMetadata.rightsExpiresAt,
    };
  });
  const rightsInput = { assets: rawRights.length ? suppliedRights : [candidateRights] };
  const reports = [runEditorialQa(editorialInput), runRightsQa(rightsInput)];
  const persisted: Array<{ id: string; qaKind: string; status: string; reportSha256: string }> = [];
  for (const report of reports) {
    const stableReport = { ...report, checkedAt: undefined };
    const reportSha256 = createHash("sha256").update(JSON.stringify(stableReport)).digest("hex");
    const existing = await db.from("media_qa_reports").select("id, status").eq("organization_id", organizationId).eq("candidate_asset_id", candidateAssetId).eq("candidate_checksum", candidateChecksum).eq("qa_kind", report.qaKind).eq("report_sha256", reportSha256).maybeSingle();
    if (existing.error) return NextResponse.json({ ok: false, error: "qa_report_lookup_failed" }, { status: 502 });
    if (existing.data) {
      persisted.push({ id: String(existing.data.id), qaKind: report.qaKind, status: String(existing.data.status), reportSha256 });
      continue;
    }
    const inserted = await db.from("media_qa_reports").insert({
      organization_id: organizationId,
      candidate_asset_id: candidateAssetId,
      candidate_checksum: candidateChecksum,
      qa_kind: report.qaKind,
      capability_id: report.detector.id,
      capability_version: report.detector.version,
      profile_id: "video-editorial-rights-default",
      profile_version: "1.0.0",
      status: report.status,
      report_json: report,
      report_sha256: reportSha256,
    }).select("id, status").single();
    if (inserted.error || !inserted.data) return NextResponse.json({ ok: false, error: inserted.error?.message ?? "qa_report_insert_failed" }, { status: 500 });
    persisted.push({ id: String(inserted.data.id), qaKind: report.qaKind, status: String(inserted.data.status), reportSha256 });
  }
  return NextResponse.json({ ok: true, candidateAssetId, reports: persisted, results: reports as AutomatedQaReport[] }, { status: 201 });
}

