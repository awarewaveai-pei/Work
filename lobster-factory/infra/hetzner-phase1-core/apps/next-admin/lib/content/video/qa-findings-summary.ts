export type QaEvidence = Record<string, number | string | null>;
export type QaFindingSummary = { rule: string; severity: string; message: string; format?: string; evidence?: QaEvidence };

const MAX_FINDINGS = 20;
const NOT_PASSED = ["warned", "failed"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Only scalar evidence leaves the API (finite numbers, short strings, null); the raw report never does. */
function scalarEvidence(src: unknown): QaEvidence | undefined {
  if (!isRecord(src)) return undefined;
  const out: QaEvidence = {};
  for (const [k, v] of Object.entries(src)) {
    if (v === null) out[k] = null;
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v as number;
    else if (typeof v === "string" && v.length <= 80) out[k] = v as string;
  }
  return Object.keys(out).length ? out : undefined;
}

function pushFindings(out: QaFindingSummary[], list: unknown, ruleKeys: string[], format?: string): void {
  if (!Array.isArray(list)) return;
  for (const f of list) {
    if (out.length >= MAX_FINDINGS) return;
    if (!isRecord(f)) continue;
    const rule = ruleKeys.map((k) => f[k]).find((v) => typeof v === "string") as string | undefined;
    const evidence = scalarEvidence(f.evidence);
    out.push({
      rule: rule ?? "",
      severity: typeof f.severity === "string" ? f.severity : "",
      message: typeof f.message === "string" ? f.message : "",
      ...(format ? { format } : {}),
      ...(evidence ? { evidence } : {}),
    });
  }
}

/**
 * A section that is warned/failed but carries no findings (video-workbench backend/main-system.cjs renderEvidence
 * writes signal_qa as {status, audio, integratedLufs, truePeakDb} only) is explained from its own measurements,
 * with the producers' thresholds (≤ -70 LUFS = silent; -30..-6 LUFS; true peak ≤ -1 dBTP). Nothing readable -> qa.unexplained.
 */
function deriveSectionFindings(section: Record<string, unknown>, format: string): QaFindingSummary[] {
  const status = String(section.status ?? "");
  const lufs = section.integratedLufs;
  const peak = section.truePeakDb;
  const out: QaFindingSummary[] = [];
  const add = (rule: string, evidence?: QaEvidence) =>
    out.push({ rule, severity: status === "failed" ? "error" : "warn", message: "", format, ...(evidence ? { evidence } : {}) });
  if (section.audio === true && lufs === null) add("audio.loudness_unmeasured");
  else if (typeof lufs === "number" && lufs <= -70) add("audio.silent", { integratedLufs: lufs });
  else if (typeof lufs === "number" && (lufs < -30 || lufs > -6)) add("audio.loudness", { integratedLufs: lufs });
  if (typeof peak === "number" && peak > -1) add("audio.true_peak", { truePeakDb: peak });
  if (!out.length) add("qa.unexplained", { status });
  return out;
}

/**
 * Reduce a media_qa_reports.report_json to at most 20 findings; the raw JSON never goes to the browser.
 * Invariant: a warned/failed report (reportStatus = the row's status) always yields at least one finding,
 * so the page can say what is wrong (qa-labels.ts explainFinding turns it into cause + fix).
 */
export function summarizeQaFindings(reportJson: unknown, reportStatus?: string): QaFindingSummary[] {
  const out: QaFindingSummary[] = [];
  if (isRecord(reportJson)) {
    pushFindings(out, reportJson.findings, ["code", "ruleId"]);
    // Caption QA (caption-qa-persistence.ts) stores its reasons as violation codes, not findings objects.
    if (Array.isArray(reportJson.violations)) {
      for (const v of reportJson.violations) {
        if (out.length >= MAX_FINDINGS) break;
        if (typeof v === "string") out.push({ rule: v, severity: "error", message: v });
      }
    }
    if (isRecord(reportJson.formats)) {
      for (const [fmt, entry] of Object.entries(reportJson.formats)) {
        if (!isRecord(entry)) continue;
        for (const key of ["signalQa", "signal_qa", "technicalQa", "technical_qa"]) {
          const section = entry[key];
          if (!isRecord(section)) continue;
          const before = out.length;
          pushFindings(out, section.findings, ["ruleId", "code"], fmt);
          if (out.length === before && NOT_PASSED.includes(String(section.status))) {
            for (const f of deriveSectionFindings(section, fmt)) if (out.length < MAX_FINDINGS) out.push(f);
          }
        }
      }
    }
  }
  if (!out.length && reportStatus && NOT_PASSED.includes(reportStatus)) {
    out.push({ rule: "qa.unexplained", severity: reportStatus === "failed" ? "error" : "warn", message: "", evidence: { status: reportStatus } });
  }
  return out;
}
