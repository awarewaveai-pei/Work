/** Pure Release gate. Persistence, RLS and delivery adapters provide the records. */
export type QaKind = "technical" | "caption" | "editorial" | "rights";
export interface ReleaseQaRecord { readonly id: string; readonly kind: QaKind; readonly status: "passed" | "warned" | "failed" | "superseded"; readonly candidateAssetId: string; readonly candidateChecksum: string; readonly profileId: string; readonly profileVersion: string; }
export interface ReleaseGateInput { readonly candidateAssetId: string; readonly candidateChecksum: string; readonly requiredKinds: readonly QaKind[]; readonly reports: readonly ReleaseQaRecord[]; }
export interface ReleaseGateResult { readonly ok: boolean; readonly code: "approved" | "missing_qa" | "failed_qa" | "stale_qa" | "duplicate_kind"; readonly reportIds: readonly string[]; readonly message: string; }

export function evaluateReleaseGate(input: ReleaseGateInput): ReleaseGateResult {
  const selected: ReleaseQaRecord[] = [];
  for (const kind of input.requiredKinds) {
    const matches = input.reports.filter((report) => report.kind === kind && report.candidateAssetId === input.candidateAssetId);
    if (matches.length > 1) return { ok: false, code: "duplicate_kind", reportIds: matches.map((r) => r.id), message: `QA kind ${kind} has multiple current reports` };
    const report = matches[0];
    if (!report) return { ok: false, code: "missing_qa", reportIds: selected.map((r) => r.id), message: `missing required QA: ${kind}` };
    if (report.candidateChecksum !== input.candidateChecksum) return { ok: false, code: "stale_qa", reportIds: [report.id], message: `QA ${report.id} does not match candidate checksum` };
    if (report.status === "failed" || report.status === "superseded") return { ok: false, code: "failed_qa", reportIds: [report.id], message: `QA ${report.id} is not releasable` };
    selected.push(report);
  }
  return { ok: true, code: "approved", reportIds: selected.map((r) => r.id), message: "all required QA passed or explicitly warned" };
}
