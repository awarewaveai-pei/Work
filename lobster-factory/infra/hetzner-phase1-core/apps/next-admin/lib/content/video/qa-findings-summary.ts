export type QaFindingSummary = { rule: string; severity: string; message: string; format?: string };

const MAX_FINDINGS = 20;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pushFindings(out: QaFindingSummary[], list: unknown, ruleKeys: string[], format?: string): void {
  if (!Array.isArray(list)) return;
  for (const f of list) {
    if (out.length >= MAX_FINDINGS) return;
    if (!isRecord(f)) continue;
    const rule = ruleKeys.map((k) => f[k]).find((v) => typeof v === "string") as string | undefined;
    out.push({
      rule: rule ?? "",
      severity: typeof f.severity === "string" ? f.severity : "",
      message: typeof f.message === "string" ? f.message : "",
      ...(format ? { format } : {}),
    });
  }
}

/** Reduce a media_qa_reports.report_json to at most 20 findings; the raw JSON never goes to the browser. */
export function summarizeQaFindings(reportJson: unknown): QaFindingSummary[] {
  if (!isRecord(reportJson)) return [];
  const out: QaFindingSummary[] = [];
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
        if (isRecord(section)) pushFindings(out, section.findings, ["ruleId", "code"], fmt);
      }
    }
  }
  return out;
}
