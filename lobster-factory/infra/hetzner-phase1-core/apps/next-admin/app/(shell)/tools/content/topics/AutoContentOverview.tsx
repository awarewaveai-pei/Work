"use client";
// The auto-content views besides the topic list (AUTO_CONTENT P9.3; R8: each on its own page under 題目 in the side
// menu). ClientOverview = pick a client, then its sites' numbers, each with a link to that site's topics;
// FlowCells = the picked site's five steps, each with its status, its control and its cost. All numbers arrive from the
// server page in one piece (overview-load.ts); the controls reuse the existing components and APIs, so the old pages
// (/ops/schedules, /tools/content/sites) show the same values. Buttons only, no dropdowns; colors are theme tokens.
import { useState, type ReactNode } from "react";
import type { ManagedSite } from "@/app/api/content/sites/route";
import { useDoorHref, useOnDoor } from "@/app/DoorContext";
import type { OverviewRow } from "@/lib/content/topics/overview";
import { NAV_FIRST, type PickOrg } from "@/app/(shell)/ops/clients/nav-orgs";
import type { TrendCell } from "@/lib/content/topics/overview-load";
import type { Topic } from "@/lib/content/topics/store";
import { planCostTwd } from "@/lib/content/topics/cost";
import { usdToNtd } from "@/lib/ai/cost-calculator";
import { DAILY_START_CAP } from "@/lib/content/topics/tick";
import PublishModeButtons from "../sites/PublishModeButtons";
import TopicModeButtons from "../sites/TopicModeButtons";
import DailyTrendButtons from "../sites/DailyTrendButtons";

const card: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 };
const muted: React.CSSProperties = { color: "var(--text-muted)", fontSize: "var(--font-size-xs)" };
// Each site is one block of labelled cells that wrap, so the page never scrolls sideways at any width.
const CELLS = "repeat(auto-fit, minmax(104px, 1fr))";

const T = {
  heading: "客戶",
  noSite: "這個客戶還沒有可用的網站。",
  openTopics: "看這個網站的題目",
  cols: ["客戶・網站", "總開關", "每天上限", "題目", "發布", "本月提案／上次嘗試", "待核准", "進行中", "失敗", "未開通", "本月 AI 花費（所有工具）"],
  costLink: "到成本頁看明細",
  on: "開", off: "關", ai: "AI 挑", human: "人挑", auto: "自動發", review: "人審",
  proposed: "已提案", notProposed: "本月未提案", never: "未嘗試",
  notOpened: "未開通", ok: "—",
};
// every amount a person reads is NT$ (operator rule); spendUsd stays the stored unit
const fmtUsd = (n: number) => `NT$${usdToNtd(n).toFixed(0)}`;
const taipeiText = (iso: string | null) => (iso ? new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : T.never);

/** The topics page of one site: the staff page, or the door's own page on a product door. */
export const TOPICS_PAGE = "/tools/content/topics";
export const topicsSiteHref = (base: string, siteId: string) => `${base}?site=${encodeURIComponent(siteId)}`;

/** Staff only: the shared client picker (search + one row per client, OrgPicker.tsx), handed in by StaffTopicsBoard so a
 *  door page never imports an /api/ops caller. A door holds one client and gets none. */
export type ClientPickerSlot = (p: { orgs: PickOrg[]; total: number; selected: string | null; onPick: (org: PickOrg | null) => void }) => ReactNode;

/** What is wrong with a client's sites, as its picker name says it (the old table's problems-first job); null = nothing. */
function problemTag(rows: OverviewRow[]): string | null {
  if (!rows.some((r) => r.problem)) return null;
  const failed = rows.reduce((n, r) => n + r.failed, 0);
  return [failed && `失敗 ${failed}`, rows.some((r) => r.notOpened) && T.notOpened, rows.some((r) => r.lastError) && "出錯"].filter(Boolean).join("、");
}

/** The picker's first page; a picked client past it goes first, so its button shows as picked (OrgPicker contract). */
const firstPage = (orgs: PickOrg[], picked: string | null) => {
  const i = orgs.findIndex((o) => o.id === picked);
  return i < NAV_FIRST ? orgs.slice(0, NAV_FIRST) : [orgs[i], ...orgs.slice(0, NAV_FIRST - 1)];
};

/** The 客戶 page: pick a client (staff), then that client's sites, one block of numbers each, with a link to its topics.
 *  The picker lists clients problems first (overview order) with a red dot and what is wrong; a client found by search
 *  with no site here says so. A door (no picker) shows its own sites. */
export function ClientOverview({ rows, note, siteId, picker }: { rows: OverviewRow[]; note: string | null; siteId: string; picker?: ClientPickerSlot }) {
  const base = useDoorHref(TOPICS_PAGE) ?? TOPICS_PAGE;
  const costsHref = useDoorHref("/ops/costs");   // a staff page: a door has none, so the link is hidden there
  const [orgId, setOrgId] = useState(rows.find((r) => r.siteId === siteId)?.organizationId ?? rows[0]?.organizationId ?? null);
  const byOrg = new Map<string, OverviewRow[]>();
  for (const r of rows) byOrg.set(r.organizationId, [...(byOrg.get(r.organizationId) ?? []), r]);
  const orgs: PickOrg[] = [...byOrg.entries()].map(([id, rs]) => {
    const tag = problemTag(rs);
    return { id, slug: id, name: tag ? `${rs[0].orgName}（${tag}）` : rs[0].orgName, color: tag ? "var(--red)" : "var(--text-muted)", brandColors: [] };
  });
  const shown = picker ? (orgId ? byOrg.get(orgId) ?? [] : []) : rows;
  return (
    <section style={{ display: "grid", gap: 12 }} aria-label={T.heading}>
      {note && <div style={{ ...muted, color: "var(--yellow)" }}>{note}</div>}
      {picker?.({ orgs: firstPage(orgs, orgId), total: orgs.length, selected: orgId, onPick: (o) => setOrgId(o?.id ?? null) })}
      {picker && orgId && !shown.length && <p style={{ margin: 0, color: "var(--text-muted)" }}>{T.noSite}</p>}
      {shown.map((r) => {
        const cell = (i: number, v: ReactNode, color?: string) => (
          <span key={i} style={{ display: "grid", gap: 2, minWidth: 0 }}>
            <span style={muted}>{T.cols[i]}</span>
            <span style={{ color, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>{v}</span>
          </span>
        );
        return (
          <div key={r.siteId} style={{ ...card, display: "grid", gridTemplateColumns: CELLS, gap: 8, alignItems: "start", fontSize: "var(--font-size-sm)",
            background: r.problem ? "color-mix(in srgb, var(--red) 6%, var(--card-bg))" : "var(--card-bg)" }}>
            <span style={{ gridColumn: "1 / -1", minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 600 }}>{r.orgName}</span>
              <span style={muted}>{r.siteName}</span>
              {r.lastError && <span style={{ display: "block", ...muted, color: "var(--red)" }}>{r.lastError}</span>}
            </span>
            {cell(1, r.enabled ? T.on : T.off, r.enabled ? "var(--green)" : "var(--text-muted)")}
            {cell(2, r.dailyLimit ?? DAILY_START_CAP)}
            {cell(3, r.topicGate === "ai" ? T.ai : T.human)}
            {cell(4, r.publishGate === "auto" ? T.auto : T.review)}
            {cell(5, <>{r.proposedThisMonth ? T.proposed : T.notProposed}<br />{taipeiText(r.attemptedAt)}</>, r.proposedThisMonth ? "var(--text-primary)" : "var(--text-muted)")}
            {cell(6, r.pending, r.pending ? "var(--accent-text)" : "var(--text-muted)")}
            {cell(7, r.inProgress)}
            {cell(8, r.failed, r.failed ? "var(--red)" : "var(--text-muted)")}
            {cell(9, r.notOpened ? T.notOpened : T.ok, r.notOpened ? "var(--red)" : "var(--text-muted)")}
            {cell(10, fmtUsd(r.spendUsd))}
            <a className="btn btn-secondary" href={topicsSiteHref(base, r.siteId)} style={{ gridColumn: "1 / -1", justifySelf: "start" }}>{T.openTopics}</a>
          </div>
        );
      })}
      {costsHref && <a href={costsHref} style={{ fontSize: "var(--font-size-xs)" }}>{T.costLink}</a>}
    </section>
  );
}

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
  const topicsHref = topicsSiteHref(useDoorHref(TOPICS_PAGE) ?? TOPICS_PAGE, site.id);
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
