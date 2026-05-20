import type { IncidentSeverity, IncidentSource } from "@/lib/ops-inbox/types";
import type { RepairPolicy } from "./types";

export interface RepairSourcePolicy {
  source: IncidentSource;
  label: string;
  policy: RepairPolicy;
  family: "code_exception" | "availability_slo" | "infrastructure" | "product_behavior" | "manual";
  rationale: string;
  /** analysis_only 來源在人工確認 code-regression 根因後，是否可升級產生修復 PR */
  can_escalate_to_pr: boolean;
}

const REPAIR_SOURCE_POLICY_BY_SOURCE = {
  sentry: {
    source: "sentry",
    label: "Sentry",
    policy: "auto_repair",
    family: "code_exception",
    rationale: "錯誤堆疊與檔案脈絡足以在備份與核准後產生範圍受控的修復 PR。",
    can_escalate_to_pr: false, // 已是 auto_repair，不適用升級路徑
  },
  uptime_kuma: {
    source: "uptime_kuma",
    label: "Uptime Kuma",
    policy: "analysis_only",
    family: "availability_slo",
    rationale: "可用性異常可能來自程式、DNS、資料庫、nginx、容量或部署漂移，需先分析。分析確認為 code regression 後，可手動升級為修復 PR。",
    can_escalate_to_pr: true,
  },
  grafana: {
    source: "grafana",
    label: "Grafana",
    policy: "analysis_only",
    family: "availability_slo",
    rationale: "延遲、日誌與 SLO 告警必須先分流判讀，才能安全限定成程式修復 PR。確認是 code regression 後可升級。",
    can_escalate_to_pr: true,
  },
  posthog: {
    source: "posthog",
    label: "PostHog",
    policy: "analysis_only",
    family: "product_behavior",
    rationale: "商業與漏斗異常是診斷證據，不等於可直接自動修的程式錯誤。行為信號需人工判斷產品策略，禁止升級為自動修復 PR。",
    can_escalate_to_pr: false,
  },
  netdata: {
    source: "netdata",
    label: "Netdata",
    policy: "human_only",
    family: "infrastructure",
    rationale: "主機資源與容器健康多半需要操作者或基礎設施層處置。改程式碼無法解決 CPU / RAM / disk 問題。",
    can_escalate_to_pr: false,
  },
  manual: {
    source: "manual",
    label: "手動",
    policy: "triage_needed",
    family: "manual",
    rationale: "手動事件需先由操作者判定責任邊界，再決定是否進入自動化。",
    can_escalate_to_pr: false,
  },
} satisfies Record<IncidentSource, RepairSourcePolicy>;

export const REPAIR_SOURCE_POLICIES: RepairSourcePolicy[] = Object.values(REPAIR_SOURCE_POLICY_BY_SOURCE);

export function policyCatalogForSource(source: IncidentSource): RepairSourcePolicy {
  return REPAIR_SOURCE_POLICY_BY_SOURCE[source];
}

export function policyForIncident(source: IncidentSource, severity: IncidentSeverity): RepairPolicy {
  const catalogPolicy = policyCatalogForSource(source).policy;
  if (catalogPolicy !== "triage_needed") return catalogPolicy;
  if (severity === "critical") return "triage_needed";
  return source === "manual" ? "triage_needed" : "human_only";
}

/**
 * Critical severity incidents — 無論 source policy 為何 — 建立 RepairRun 時應強制設
 * needs_human_review = true。呼叫端在建立 RepairRun 前使用此函式決定該欄位。
 */
export function severityRequiresHumanReview(severity: IncidentSeverity): boolean {
  return severity === "critical";
}

export function repairPolicyLabel(policy: RepairPolicy): string {
  if (policy === "auto_repair") return "可自動修復";
  if (policy === "analysis_only") return "僅分析";
  if (policy === "human_only") return "人工處理";
  return "需分流";
}

export function canApprovePolicy(policy: RepairPolicy): boolean {
  return policy === "auto_repair" || policy === "analysis_only" || policy === "triage_needed";
}

export function needsGitHubIssue(policy: RepairPolicy): boolean {
  return policy === "auto_repair" || policy === "analysis_only" || policy === "triage_needed";
}
