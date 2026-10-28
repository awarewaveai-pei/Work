/**
 * Deterministic editorial and rights checks for a candidate video.
 *
 * This module deliberately has no database or provider dependency.  The API
 * adapter supplies tenant-scoped metadata and persists the returned immutable
 * report.  Missing evidence is a failure so a release can never silently
 * bypass a rights decision.
 */
export type QaFindingSeverity = "error" | "warning";
export interface QaFinding {
  readonly code: string;
  readonly path: string;
  readonly severity: QaFindingSeverity;
  readonly message: string;
}
export type AutomatedQaStatus = "passed" | "warned" | "failed";
export interface AutomatedQaReport {
  readonly qaKind: "editorial" | "rights";
  readonly status: AutomatedQaStatus;
  readonly detector: { readonly id: string; readonly version: string };
  readonly findings: readonly QaFinding[];
  readonly checkedAt: string;
}

export interface EditorialQaInput {
  readonly title?: unknown;
  readonly script?: unknown;
  readonly requiredTerms?: unknown;
  readonly forbiddenTerms?: unknown;
}

export interface RightsEvidenceInput {
  readonly assets?: unknown;
}

export interface RightsAssetEvidence {
  readonly assetId: unknown;
  readonly status?: unknown;
  readonly licenseRef?: unknown;
  readonly sourceRef?: unknown;
  readonly expiresAt?: unknown;
}

const DETECTOR_VERSION = "1.0.0";
const MAX_TEXT = 100_000;

function report(
  qaKind: "editorial" | "rights",
  detectorId: string,
  findings: QaFinding[],
  checkedAt = new Date().toISOString(),
): AutomatedQaReport {
  const hasError = findings.some((finding) => finding.severity === "error");
  return {
    qaKind,
    status: hasError ? "failed" : findings.length > 0 ? "warned" : "passed",
    detector: { id: detectorId, version: DETECTOR_VERSION },
    findings,
    checkedAt,
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function terms(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLocaleLowerCase())
    .filter(Boolean)
    .slice(0, 100);
}

/** Check script completeness and deterministic brand/safety terms. */
export function runEditorialQa(input: EditorialQaInput): AutomatedQaReport {
  const findings: QaFinding[] = [];
  const title = text(input.title);
  const script = text(input.script);
  if (!title) findings.push({ code: "missing_title", path: "$.title", severity: "error", message: "影片標題不可為空" });
  if (!script) findings.push({ code: "missing_script", path: "$.script", severity: "error", message: "旁白或腳本不可為空" });
  if (script.length > MAX_TEXT) findings.push({ code: "script_too_long", path: "$.script", severity: "error", message: `腳本不可超過 ${MAX_TEXT} 字元` });

  const lowerScript = script.toLocaleLowerCase();
  for (const [index, term] of terms(input.forbiddenTerms).entries()) {
    if (lowerScript.includes(term)) findings.push({ code: "forbidden_term", path: `$.forbiddenTerms[${index}]`, severity: "error", message: `腳本含禁止詞：${term}` });
  }
  for (const [index, term] of terms(input.requiredTerms).entries()) {
    if (!lowerScript.includes(term) && !title.toLocaleLowerCase().includes(term)) findings.push({ code: "required_term_missing", path: `$.requiredTerms[${index}]`, severity: "warning", message: `腳本未包含必要詞：${term}` });
  }
  return report("editorial", "media.qa.editorial", findings);
}

/**
 * D7: rights evidence from the sources recorded when each asset was acquired (asset-origin.ts RightsSource).
 * Only a recorded origin can be "cleared"; `unknown` and an unticked upload stay not cleared, so the check fails.
 */
export function rightsAssetsFromSources(sources: unknown): RightsAssetEvidence[] {
  if (!Array.isArray(sources)) return [];
  return sources.map((raw, i) => {
    const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const assetId = `source-${i + 1}`;
    const url = text(s.url);
    if (s.kind === "ai_generated" && text(s.model) && text(s.provider)) {
      return { assetId, status: "cleared", licenseRef: "self-produced", sourceRef: `${text(s.provider)}/${text(s.model)}` };
    }
    if (s.kind === "pexels" && text(s.sourceRef)) {
      return { assetId, status: "cleared", licenseRef: "Pexels License", sourceRef: text(s.sourceRef) };
    }
    if (s.kind === "upload" && s.rightsConfirmed === true && url) {
      return { assetId, status: "cleared", licenseRef: "uploader-confirmed", sourceRef: url };
    }
    return { assetId, status: s.kind === "upload" ? "unconfirmed" : "unrecorded", licenseRef: "", sourceRef: url };
  });
}

/** Check every referenced asset has explicit, non-expired rights evidence. */
export function runRightsQa(input: RightsEvidenceInput): AutomatedQaReport {
  const findings: QaFinding[] = [];
  if (!Array.isArray(input.assets) || input.assets.length === 0) {
    findings.push({ code: "missing_rights_evidence", path: "$.assets", severity: "error", message: "至少需要一筆素材權利證據" });
    return report("rights", "media.qa.rights", findings);
  }
  const now = Date.now();
  const seen = new Set<string>();
  input.assets.slice(0, 500).forEach((raw, index) => {
    const path = `$.assets[${index}]`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      findings.push({ code: "invalid_asset_evidence", path, severity: "error", message: "權利證據必須是物件" });
      return;
    }
    const asset = raw as RightsAssetEvidence;
    const assetId = text(asset.assetId);
    if (!assetId) findings.push({ code: "missing_asset_id", path: `${path}.assetId`, severity: "error", message: "缺少素材 ID" });
    if (assetId && seen.has(assetId)) findings.push({ code: "duplicate_asset", path: `${path}.assetId`, severity: "error", message: "素材 ID 重複" });
    if (assetId) seen.add(assetId);
    const status = text(asset.status).toLocaleLowerCase();
    if (status !== "cleared") findings.push({ code: "rights_not_cleared", path: `${path}.status`, severity: "error", message: "素材必須明確標記 cleared" });
    if (!text(asset.licenseRef)) findings.push({ code: "missing_license_ref", path: `${path}.licenseRef`, severity: "error", message: "缺少授權或權利文件參照" });
    if (!text(asset.sourceRef)) findings.push({ code: "missing_source_ref", path: `${path}.sourceRef`, severity: "error", message: "缺少來源參照" });
    const expiresAt = text(asset.expiresAt);
    if (expiresAt) {
      const expiry = Date.parse(expiresAt);
      if (!Number.isFinite(expiry)) findings.push({ code: "invalid_expiry", path: `${path}.expiresAt`, severity: "error", message: "expiresAt 必須是 ISO 日期" });
      else if (expiry <= now) findings.push({ code: "rights_expired", path: `${path}.expiresAt`, severity: "error", message: "素材授權已過期" });
    }
  });
  return report("rights", "media.qa.rights", findings);
}

