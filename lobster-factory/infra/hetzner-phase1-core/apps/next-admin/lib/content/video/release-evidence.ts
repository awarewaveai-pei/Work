import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateReleaseGate, type QaKind, type ReleaseGateResult, type ReleaseQaRecord } from "./release-gate";
import { hasAutomaticQaIssuance } from "./qa-issuance";

export const REQUIRED_RELEASE_QA_KINDS = ["technical", "caption", "editorial", "rights"] as const satisfies readonly QaKind[];

const CAPABILITY_BY_KIND: Readonly<Record<QaKind, string>> = {
  technical: "video.qa.render",
  caption: "video.qa.caption",
  editorial: "media.qa.editorial",
  rights: "media.qa.rights",
};

export type StoredQaRow = {
  id: string;
  qa_kind: string;
  status: string;
  candidate_asset_id: string;
  candidate_checksum: string;
  profile_id: string;
  profile_version: string;
  capability_id: string;
  report_json: unknown;
  created_at: string;
};

function isQaKind(value: string): value is QaKind {
  return (REQUIRED_RELEASE_QA_KINDS as readonly string[]).includes(value);
}

/**
 * Rows are newest-first. Keep one server-issued record per kind; old browser
 * reports and reports from an earlier trust boundary cannot satisfy Release.
 */
export function selectTrustedReleaseQa(rows: readonly StoredQaRow[]): ReleaseQaRecord[] {
  const latest = new Map<QaKind, ReleaseQaRecord>();
  for (const row of rows) {
    if (!isQaKind(row.qa_kind) || latest.has(row.qa_kind)) continue;
    const capabilityId = CAPABILITY_BY_KIND[row.qa_kind];
    if (row.capability_id !== capabilityId || !hasAutomaticQaIssuance(row.report_json, capabilityId)) continue;
    if (!["passed", "warned", "failed", "superseded"].includes(row.status)) continue;
    latest.set(row.qa_kind, {
      id: row.id,
      kind: row.qa_kind,
      status: row.status as ReleaseQaRecord["status"],
      candidateAssetId: row.candidate_asset_id,
      candidateChecksum: row.candidate_checksum,
      profileId: row.profile_id,
      profileVersion: row.profile_version,
    });
  }
  return REQUIRED_RELEASE_QA_KINDS.flatMap((kind) => {
    const report = latest.get(kind);
    return report ? [report] : [];
  });
}

export type AuthoritativeReleaseEvidence =
  | { readonly ok: true; readonly reports: readonly ReleaseQaRecord[]; readonly gate: ReleaseGateResult }
  | { readonly ok: false; readonly status: 404 | 409 | 502; readonly error: string };

/** Resolve the candidate and all Release evidence from server-owned storage. */
export async function loadAuthoritativeReleaseEvidence(
  db: SupabaseClient,
  params: { readonly organizationId: string; readonly candidateAssetId: string; readonly candidateChecksum: string },
): Promise<AuthoritativeReleaseEvidence> {
  const candidate = await db
    .from("media_assets")
    .select("id, organization_id, checksum_sha256")
    .eq("id", params.candidateAssetId)
    .maybeSingle();
  if (candidate.error) return { ok: false, status: 502, error: "candidate_asset_lookup_failed" };
  if (!candidate.data || candidate.data.organization_id !== params.organizationId) {
    return { ok: false, status: 404, error: "candidate_asset_not_found" };
  }
  if (candidate.data.checksum_sha256 !== params.candidateChecksum) {
    return { ok: false, status: 409, error: "candidate_checksum_mismatch" };
  }

  const stored = await db
    .from("media_qa_reports")
    .select("id, qa_kind, status, candidate_asset_id, candidate_checksum, profile_id, profile_version, capability_id, report_json, created_at")
    .eq("organization_id", params.organizationId)
    .eq("candidate_asset_id", params.candidateAssetId)
    .eq("candidate_checksum", params.candidateChecksum)
    .in("qa_kind", [...REQUIRED_RELEASE_QA_KINDS])
    .order("created_at", { ascending: false })
    .limit(200);
  if (stored.error) return { ok: false, status: 502, error: "qa_report_lookup_failed" };
  const reports = selectTrustedReleaseQa((stored.data ?? []) as StoredQaRow[]);
  return {
    ok: true,
    reports,
    gate: evaluateReleaseGate({
      candidateAssetId: params.candidateAssetId,
      candidateChecksum: params.candidateChecksum,
      requiredKinds: REQUIRED_RELEASE_QA_KINDS,
      reports,
    }),
  };
}
