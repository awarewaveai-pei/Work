// Operator-facing text. C12: text summary + ops link only, never an image, never a query string.
import type { IncidentDraft } from "@/lib/ops-inbox/types";
import { severityFor } from "./config";
import { failureLabel } from "./labels";
import type { OrgRef, PageStateRow } from "./store";

export function fingerprintFor(orgId: string, s: Pick<PageStateRow, "page_id" | "kind">): string {
  return `site_watch:${orgId}:${s.page_id}:${s.kind}`;
}

/** Title and raw stay constant per (page, kind) so ops_incidents fingerprint_v2 stays stable. */
export function incidentDraft(org: OrgRef, s: PageStateRow): IncidentDraft & { fingerprint: string } {
  const fingerprint = fingerprintFor(org.id, s);
  const availability = s.kind === "availability";
  return {
    source: "site_watch",
    external_id: fingerprint,
    fingerprint,
    signal_type: availability ? "uptime" : "business",
    severity: severityFor(s.kind),
    service: "site_watch",
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    title: availability ? `網站打不開：${s.page_url}` : `網站畫面大幅變動：${s.page_url}`,
    message: availability
      ? `${failureLabel(s.last_failure_code)}；連續 ${s.failure_streak} 次。${s.last_message ?? ""}`.trim()
      : `與基準圖差異超過門檻；連續 ${s.failure_streak} 次。${s.last_message ?? ""}`.trim(),
    raw: { organization_id: org.id, page_id: s.page_id, kind: s.kind },
    tags: { client: org.slug, page_url: s.page_url, kind: s.kind },
    client_slug: org.slug,
  };
}

function link(publicUrl: string, org: OrgRef): string {
  return `${publicUrl.replace(/\/+$/, "")}/ops/clients/${org.slug}`;
}

export function alertText(org: OrgRef, s: PageStateRow, publicUrl: string): string {
  if (s.kind === "availability") {
    return [
      `🔴 網站打不開 — ${org.name}`,
      s.page_url,
      `原因：${failureLabel(s.last_failure_code)}（連續 ${s.failure_streak} 次）`,
      s.last_message ?? "",
      link(publicUrl, org),
    ].filter(Boolean).join("\n");
  }
  return [
    `🟡 網站畫面大幅變動 — ${org.name}`,
    s.page_url,
    `${s.last_message ?? "與基準圖差異超過門檻"}（連續 ${s.failure_streak} 次）`,
    "若是預期中的改版，到客戶頁「網站巡檢」按「接受為新基準」。",
    link(publicUrl, org),
  ].join("\n");
}

export function recoveryText(org: OrgRef, s: PageStateRow, publicUrl: string): string {
  const what = s.kind === "availability" ? "網站打不開" : "畫面變動";
  const head =
    s.recovery_reason === "disabled"
      ? `⏹ 網站巡檢已關閉，「${what}」告警結束追蹤 — ${org.name}`
      : s.recovery_reason === "page_removed"
        ? `⏹ 頁面已移出巡檢清單，「${what}」告警結束追蹤 — ${org.name}`
        : `✅ 已恢復（${what}）— ${org.name}`;
  return [head, s.page_url, link(publicUrl, org)].join("\n");
}
