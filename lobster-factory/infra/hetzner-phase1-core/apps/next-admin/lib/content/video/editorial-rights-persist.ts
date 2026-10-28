import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rightsAssetsFromSources, runEditorialQa, runRightsQa, type AutomatedQaReport } from "./editorial-rights-qa";
import { automaticQaIssuance } from "./qa-issuance";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EditorialRightsResult =
  | { ok: true; persisted: Array<{ id: string; qaKind: string; status: string; reportSha256: string }>; reports: AutomatedQaReport[] }
  | { ok: false; status: number; error: string };

/**
 * Run deterministic editorial and rights checks and persist both immutable reports. All release-relevant evidence is
 * derived from server-owned asset metadata (the route and the project auto-advance job share this one function).
 */
export async function persistEditorialRightsQa(
  db: SupabaseClient,
  { organizationId, candidateAssetId, candidateChecksum }: { organizationId: string; candidateAssetId: string; candidateChecksum: string },
): Promise<EditorialRightsResult> {
  const candidate = await db.from("media_assets")
    .select("id, organization_id, checksum_sha256, metadata")
    .eq("id", candidateAssetId)
    .maybeSingle();
  if (candidate.error) return { ok: false, status: 502, error: "candidate_asset_lookup_failed" };
  if (!candidate.data || candidate.data.organization_id !== organizationId) return { ok: false, status: 404, error: "candidate_asset_not_found" };
  if (candidate.data.checksum_sha256 && candidate.data.checksum_sha256 !== candidateChecksum) return { ok: false, status: 409, error: "candidate_checksum_mismatch" };

  const metadata = candidate.data.metadata && typeof candidate.data.metadata === "object" && !Array.isArray(candidate.data.metadata)
    ? candidate.data.metadata as Record<string, unknown>
    : {};
  const editorialInput = { title: metadata.title, script: metadata.script, requiredTerms: metadata.requiredTerms, forbiddenTerms: metadata.forbiddenTerms };
  const provenance = metadata.provenance && typeof metadata.provenance === "object" && !Array.isArray(metadata.provenance)
    ? metadata.provenance as Record<string, unknown>
    : {};
  const referenceLists = [
    metadata.rightsAssetIds,
    metadata.rights_asset_ids,
    metadata.sourceAssetIds,
    metadata.source_asset_ids,
    provenance.sourceArtifactIds,
  ];
  // D7: a video made by this tool carries the origin of every asset it used; its own row has no rights fields.
  const recordedSources = Array.isArray(metadata.rightsSources) && metadata.rightsSources.length > 0 ? metadata.rightsSources : null;
  const evidenceIds = [...(recordedSources ? [] : [candidateAssetId]), ...referenceLists.flatMap((value) => Array.isArray(value) ? value : [])]
    .filter((value): value is string => typeof value === "string" && UUID.test(value));
  const assetRows = await db.from("media_assets").select("id, organization_id, metadata").eq("organization_id", organizationId).in("id", [...new Set(evidenceIds)]);
  if (assetRows.error) return { ok: false, status: 502, error: "rights_asset_lookup_failed" };
  const byId = new Map((assetRows.data ?? []).map((row) => [String(row.id), row]));
  if ([...new Set(evidenceIds)].some((assetId) => !byId.has(assetId))) {
    return { ok: false, status: 422, error: "rights evidence references an unknown tenant asset" };
  }
  const storedRights = [...new Set(evidenceIds)].map((assetId) => {
    const row = byId.get(assetId);
    const assetMetadata = row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
    return {
      assetId,
      status: assetMetadata.rights_status ?? assetMetadata.rightsStatus,
      licenseRef: assetMetadata.license_ref ?? assetMetadata.licenseRef,
      sourceRef: assetMetadata.source_ref ?? assetMetadata.sourceRef,
      expiresAt: assetMetadata.rights_expires_at ?? assetMetadata.rightsExpiresAt,
    };
  });
  const rightsInput = { assets: [...(recordedSources ? rightsAssetsFromSources(recordedSources) : []), ...storedRights] };
  const reports = [runEditorialQa(editorialInput), runRightsQa(rightsInput)];
  const persisted: Array<{ id: string; qaKind: string; status: string; reportSha256: string }> = [];
  for (const report of reports) {
    const reportJson = { ...report, issuance: automaticQaIssuance(report.detector.id) };
    const stableReport = { ...reportJson, checkedAt: undefined };
    const reportSha256 = createHash("sha256").update(JSON.stringify(stableReport)).digest("hex");
    const existing = await db.from("media_qa_reports").select("id, status").eq("organization_id", organizationId).eq("candidate_asset_id", candidateAssetId).eq("candidate_checksum", candidateChecksum).eq("qa_kind", report.qaKind).eq("report_sha256", reportSha256).maybeSingle();
    if (existing.error) return { ok: false, status: 502, error: "qa_report_lookup_failed" };
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
      report_json: reportJson,
      report_sha256: reportSha256,
    }).select("id, status").single();
    if (inserted.error || !inserted.data) return { ok: false, status: 500, error: inserted.error?.message ?? "qa_report_insert_failed" };
    persisted.push({ id: String(inserted.data.id), qaKind: report.qaKind, status: String(inserted.data.status), reportSha256 });
  }
  return { ok: true, persisted, reports: reports as AutomatedQaReport[] };
}
