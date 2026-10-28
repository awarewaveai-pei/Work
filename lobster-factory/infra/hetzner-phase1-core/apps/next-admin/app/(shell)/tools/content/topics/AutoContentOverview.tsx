"use client";
// The two layers above the topic list (AUTO_CONTENT P9.3). OverviewTable = every site, one row each, problems first;
// FlowCells = the picked site's five steps, each with its status, its control and its cost. All numbers arrive from the
// server page in one piece (overview-load.ts); the controls reuse the existing components and APIs, so the old pages
// (/ops/schedules, /tools/content/sites) show the same values. Buttons only, no dropdowns; colors are theme tokens.
import type { ReactNode } from "react";
import type { ManagedSite } from "@/app/api/content/sites/route";
import { useOnDoor } from "@/app/DoorContext";
import { ScheduleTable } from "@/app/(shell)/ops/schedules/ScheduleTable";
import type { OverviewRow } from "@/lib/content/topics/overview";
import type { TrendCell } from "@/lib/content/topics/overview-load";
import type { Topic } from "@/lib/content/topics/store";
import { planCostTwd } from "@/lib/content/topics/cost";
import { DAILY_START_CAP } from "@/lib/content/topics/tick";
import PublishModeButtons from "../sites/PublishModeButtons";
import TopicModeButtons from "../sites/TopicModeButtons";

const card: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 };
const muted: React.CSSProperties = { color: "var(--text-muted)", fontSize: "var(--font-size-xs)" };
const GRID = "minmax(150px,1.3fr) minmax(70px,0.6fr) 56px 56px 56px 120px 64px 64px 64px 70px 90px";

const T = {
  heading: "全部客戶一覽",
  hint: "有問題的排在最上面。點一列看那個網站的五個步驟。",
  cols: ["客戶・網站", "總開關", "每天上限", "題目", "發布", "本月提案／上次嘗試", "待核准", "進行中", "失敗", "未開通", "本月 AI 花費（所有工具）"],
  costLink: "到成本頁看明細",
  on: "開", off: "關", ai: "AI 挑", human: "人挑", auto: "自動發", review: "人審",
  proposed: "已提案", notProposed: "本月未提案", never: "未嘗試",
  notOpened: "未開通", ok: "—",
};
const fmtUsd = (n: number) => `US$${n.toFixed(2)}`;
const taipeiText = (iso: string | null) => (iso ? new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : T.never);

export function OverviewTable({ rows, selected, onPick, note }: { rows: OverviewRow[]; selected: string; onPick: (siteId: string) => void; note: string | null }) {
  return (
    <section style={{ ...card, padding: 0, overflowX: "auto" }} aria-label={T.heading}>
      <div style={{ padding: "10px 12px 6px" }}>
        <div className="section-title" style={{ margin: 0 }}>{T.heading}</div>
        <div style={muted}>{T.hint}</div>
        {note && <div style={{ ...muted, color: "var(--yellow)" }}>{note}</div>}
      </div>
      <div style={{ minWidth: 980 }}>
        <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, padding: "6px 12px", ...muted, fontWeight: 600 }}>
          {T.cols.map((c) => <span key={c}>{c}</span>)}
        </div>
        {rows.map((r) => (
          <button key={r.siteId} type="button" onClick={() => onPick(r.siteId)} aria-pressed={r.siteId === selected}
            style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, alignItems: "center", width: "100%", textAlign: "left", padding: "8px 12px", cursor: "pointer",
              border: 0, borderTop: "1px solid var(--border)", color: "var(--text-primary)", fontSize: "var(--font-size-sm)",
              background: r.siteId === selected ? "var(--bg-hover)" : r.problem ? "color-mix(in srgb, var(--red) 6%, transparent)" : "transparent" }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 600 }}>{r.orgName}</span>
              <span style={muted}>{r.siteName}</span>
              {r.lastError && <span style={{ display: "block", ...muted, color: "var(--red)" }}>{r.lastError}</span>}
            </span>
            <span style={{ color: r.enabled ? "var(--green)" : "var(--text-muted)" }}>{r.enabled ? T.on : T.off}</span>
            <span>{r.dailyLimit ?? DAILY_START_CAP}</span>
            <span>{r.topicGate === "ai" ? T.ai : T.human}</span>
            <span>{r.publishGate === "auto" ? T.auto : T.review}</span>
            <span style={{ ...muted, color: r.proposedThisMonth ? "var(--text-primary)" : "var(--text-muted)" }}>
              {r.proposedThisMonth ? T.proposed : T.notProposed}<br />{taipeiText(r.attemptedAt)}
            </span>
            <span style={{ color: r.pending ? "var(--accent-text)" : "var(--text-muted)" }}>{r.pending}</span>
            <span>{r.inProgress}</span>
            <span style={{ color: r.failed ? "var(--red)" : "var(--text-muted)" }}>{r.failed}</span>
            <span style={{ color: r.notOpened ? "var(--red)" : "var(--text-muted)" }}>{r.notOpened ? T.notOpened : T.ok}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtUsd(r.spendUsd)}</span>
          </button>
        ))}
      </div>
      <div style={{ padding: "6px 12px 10px" }}><a href="/ops/costs" style={{ fontSize: "var(--font-size-xs)" }}>{T.costLink}</a></div>
    </section>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <div style={{ ...card, flex: "1 1 220px", minWidth: 0, display: "grid", gap: 6, alignContent: "start" }}>
      <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{n} {title}</div>
      {children}
    </div>
  );
}

export function FlowCells({ site, row, cell, topics, month, canSchedule, planButton, onSiteSaved }: {
  site: ManagedSite; row: OverviewRow; cell: TrendCell | undefined; topics: Topic[]; month: string; canSchedule: boolean; planButton: ReactNode; onSiteSaved: (s: ManagedSite) => void;
}) {
  const onDoor = useOnDoor();
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
          <span style={muted}>勾選核准或退回在下面的題目清單。</span>
          <TopicModeButtons site={site} onSaved={onSiteSaved} readOnly={onDoor} />
        </Step>
        <Step n="④" title="製作">
          <p style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>總開關{row.enabled ? "開" : "關"}；每天最多開始 {row.dailyLimit ?? DAILY_START_CAP} 題；進行中 {row.inProgress} 題。</p>
          <span style={muted}>這個開關管這個客戶的所有網站。</span>
          {!onDoor && canSchedule && site.org_slug && <ScheduleTable only={site.org_slug} jobOnly="content_pipeline" />}
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
