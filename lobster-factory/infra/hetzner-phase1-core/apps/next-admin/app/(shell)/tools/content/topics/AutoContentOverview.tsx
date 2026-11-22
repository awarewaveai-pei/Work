"use client";
// 五步驟 (AUTO_CONTENT P9.3; R8: its own page under 題目 in the side menu): FlowCells = the picked site's five steps, each
// with its status, its control and its cost. All numbers arrive from the server page in one piece (overview-load.ts); the
// controls reuse the existing components and APIs, so the old pages (/ops/schedules, /tools/content/sites) show the same
// values. Buttons only, no dropdowns; colors are theme tokens. The client and site come from the client rail (ADR 020).
import type { ReactNode } from "react";
import type { ManagedSite } from "@/app/api/content/sites/route";
import { useDoorHref, useOnDoor } from "@/app/DoorContext";
import { withContext } from "@/lib/client-context/contract";
import type { OverviewRow } from "@/lib/content/topics/overview";
import type { TrendCell } from "@/lib/content/topics/overview-load";
import type { Topic } from "@/lib/content/topics/store";
import { planCostTwd } from "@/lib/content/topics/cost";
import { DAILY_START_CAP } from "@/lib/content/topics/tick";
import PublishModeButtons from "../sites/PublishModeButtons";
import TopicModeButtons from "../sites/TopicModeButtons";
import DailyTrendButtons from "../sites/DailyTrendButtons";

const card: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 };
const muted: React.CSSProperties = { color: "var(--text-muted)", fontSize: "var(--font-size-xs)" };
const taipeiText = (iso: string | null) => (iso ? new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "未嘗試");

/** The topics page of one site: the staff page, or the door's own page on a product door. */
export const TOPICS_PAGE = "/tools/content/topics";

// wide = the step holds a table (④'s schedule row, ~900px): it takes a row of its own, and its one column may shrink
// (minmax(0, 1fr)), so the table scrolls inside the card and never widens the page (S9, seen live 2026-11-19: scrollWidth 1925).
function Step({ n, title, children, wide }: { n: string; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <div style={{ ...card, flex: wide ? "1 1 100%" : "1 1 220px", minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6, alignContent: "start" }}>
      <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{n} {title}</div>
      {children}
    </div>
  );
}

export function FlowCells({ site, row, cell, topics, month, schedule, planButton, onSiteSaved }: {
  site: ManagedSite; row: OverviewRow; cell: TrendCell | undefined; topics: Topic[]; month: string;
  /** Step ④'s switch, given only by the staff page (StaffTopicsBoard); a door renders none and imports no /api/ops caller. */
  schedule?: ReactNode; planButton: ReactNode; onSiteSaved: (s: ManagedSite) => void;
}) {
  const onDoor = useOnDoor();
  const topicsHref = withContext(useDoorHref(TOPICS_PAGE) ?? TOPICS_PAGE, { org: row.organizationId, site: site.id });
  const proposedN = topics.filter((t) => t.source !== "manual").length;
  const pending = topics.filter((t) => t.status === "proposed").length;
  return (
    <section aria-label="五個步驟" style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: 8 }}>
        <Step n="①" title="搜集熱搜">
          {cell?.noMarket
            ? <p style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>此市場沒有熱搜來源，提案只靠品牌與知識庫。</p>
            : <p style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>
                最後一次 {cell?.lastFetchedOn ?? "還沒有"}；近 30 天 {cell?.count30 ?? 0} 筆<br />來源：{cell?.sources.length ? cell.sources.join("、") : "—"}
              </p>}
          <span style={muted}>本月行銷窗口內的節日與活動 {cell?.events ?? 0} 個。每天自動抓，不用按。</span>
        </Step>
        <Step n="②" title="提案題目">
          <p style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>
            {month} 已提案 {proposedN} 題{proposedN ? "" : "（本月還沒提案）"}<br />上次嘗試：{taipeiText(row.attemptedAt)}
          </p>
          {row.lastError && <span style={{ ...muted, color: "var(--red)" }}>失敗原因：{row.lastError}</span>}
          {row.notOpened && <span style={{ ...muted, color: "var(--red)" }}>未開通題目規劃，排程不會提案。</span>}
          {!onDoor && planButton}
        </Step>
        <Step n="③" title="挑題">
          <p style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>待核准 {pending} 題；目前由{row.topicGate === "ai" ? " AI 挑" : "人挑"}。</p>
          <span style={muted}>勾選核准或退回在<a href={topicsHref}>題目頁</a>。</span>
          <TopicModeButtons site={site} onSaved={onSiteSaved} readOnly={onDoor} />
          <DailyTrendButtons site={site} onSaved={onSiteSaved} readOnly={onDoor} />
        </Step>
        <Step n="④" title="製作" wide={!onDoor && !!schedule}>
          <p style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>總開關{row.enabled ? "開" : "關"}；每天最多開始 {row.dailyLimit ?? DAILY_START_CAP} 題；進行中 {row.inProgress} 題。</p>
          <span style={muted}>這個開關管這個客戶的所有網站。</span>
          {!onDoor && schedule && <div style={{ minWidth: 0, overflowX: "auto" }}>{schedule}</div>}
        </Step>
        <Step n="⑤" title="發布">
          <p style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>{row.publishGate === "auto" ? "AI 審核後自動發布" : "人工審核後發布"}（只管文章）。</p>
          <PublishModeButtons site={site} onSaved={onSiteSaved} readOnly={onDoor} />
        </Step>
      </div>
      <span style={muted}>提案一次約 NT${planCostTwd()}；其餘費用見各步驟與題目細節。</span>
    </section>
  );
}
