"use client";
// One saved report as a page the browser prints (SOCIAL_MANAGER_PLAN.md C25: PDF = 列印 → 另存為 PDF, A4 landscape; no PDF generator).
// Numbers are the server's (lib/social/reports.ts loadReportData); a number nobody has is "—" with the reason at the foot.
import { useEffect, useRef, useState } from "react";
import type { Metric } from "@/lib/social/metrics";
import type { Report, ReportData } from "@/lib/social/reports";
import { COLOUR_VAR, spanDays } from "@/lib/social/report-period";
import { api } from "../api";
import { PfMark } from "../Calendar";
import { platformOf, shortDate, zoned } from "../model";
import { socialBase } from "../routes";
import "./report-view.css";

const METRICS: Array<{ m: Metric; name: string; unit: string }> = [
  { m: "followers", name: "追蹤者", unit: "" }, { m: "reach", name: "觸及", unit: "" }, { m: "impressions", name: "曝光", unit: "" },
  { m: "engagement", name: "互動", unit: "" }, { m: "rate", name: "互動率", unit: "%" }, { m: "posts", name: "發文數", unit: "" },
];
const num = (v: number | null | undefined, unit = "") => (v == null ? "—" : `${v.toLocaleString()}${unit}`);
const change = (v: number | null, prev: number | null) => (v == null || prev == null || prev <= 0 ? null : Math.round(((v - prev) / prev) * 100));

export default function ReportView({ id }: { id: string }) {
  const [state, setState] = useState<{ report: Report; data: ReportData } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const doc = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    api.report(id).then((r) => { if (live) setState(r); }).catch((e) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [id]);

  // Printing: only the report may reach the paper, and no ancestor may clip it to one screen. Walk up from the report,
  // mark each ancestor (let it grow) and each of its siblings (hide it); report-view.css reads the marks inside @media print.
  useEffect(() => {
    const el = doc.current;
    if (!el) return;
    const marked: Element[] = [];
    for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
      n.setAttribute("data-rv-anc", "");
      marked.push(n);
      for (const sib of Array.from(n.parentElement?.children ?? [])) if (sib !== n && n.parentElement !== document.documentElement) { sib.setAttribute("data-rv-hide", ""); marked.push(sib); }
    }
    return () => { for (const m of marked) { m.removeAttribute("data-rv-anc"); m.removeAttribute("data-rv-hide"); } };
  }, [state]);

  const base = typeof window === "undefined" ? "" : socialBase(window.location.pathname);
  if (error) return <p className="sm-err rv-note" role="alert">打不開這份報表：{error}</p>;
  if (!state) return <p className="sm-muted rv-note">載入中…</p>;
  const { report, data } = state;
  const has = (p: string) => (report.sections as string[]).includes(p);
  const byId = new Map(data.accounts.map((a) => [a.id, a]));
  const days = spanDays(data.period.from, data.period.to);
  const tz = data.brand.tz;
  const made = zoned(report.created_at, tz).date;
  const kpi = data.total.kpis;
  const accent = `var(${COLOUR_VAR[report.colour]})`;

  return (
    <>
      <div className="rv-bar">
        <a href={`${base}/reporting`}>← 回報表管理</a>
        <span className="sm-muted">列印時選「另存為 PDF」、橫向 A4，就是這份報表的 PDF。</span>
        <button type="button" className="btn-primary" onClick={() => window.print()}>列印／存成 PDF</button>
      </div>
      <div className="rv-doc" ref={doc} style={{ ["--rv-accent" as string]: accent }}>
        <section className="rv-page">
          <span className="rv-band" />
          <header className="rv-head">
            <span className="rv-logo">{data.brand.name.slice(0, 1)}</span>
            <span><b className="rv-title">{data.brand.name} · 社群成效報告</b><br /><span className="rv-sub">{report.name} · {data.period.from} 到 {data.period.to}（{days} 天）· {data.accounts.length} 個頻道 · 製作日 {made}</span></span>
          </header>
          {has("sum") && (
            <>
              <div className="rv-kpis">
                {METRICS.map(({ m, name, unit }) => <div key={m} className="rv-kpi"><span>{name}</span><b>{num(kpi[m].value, unit)}</b></div>)}
              </div>
              <Chart data={data} prev={has("cmp")} />
            </>
          )}
          {!has("sum") && <p className="rv-sub">這份報表沒有勾「摘要」。</p>}
        </section>

        {has("plat") && (
          <section className="rv-page">
            <h2>各平台成效</h2>
            <table>
              <thead><tr><th>頻道</th>{METRICS.map((x) => <th key={x.m} className="rv-n">{x.name}</th>)}</tr></thead>
              <tbody>
                {data.perAccount.map((row) => {
                  const a = byId.get(row.account_id);
                  return (
                    <tr key={row.account_id}>
                      <td>{a ? <><PfMark platform={a.platform} /> {a.label}</> : "已移除的頻道"}</td>
                      {METRICS.map((x) => <td key={x.m} className="rv-n">{num(row.kpis[x.m].value, x.unit)}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {has("top") && (
          <section className="rv-page">
            <h2>表現最好的 {data.top.length || 5} 則貼文</h2>
            <table>
              <thead><tr><th>發佈</th><th>頻道</th><th>內容</th><th className="rv-n">觸及</th><th className="rv-n">互動</th><th className="rv-n">互動率</th></tr></thead>
              <tbody>
                {data.top.map((p) => {
                  const at = zoned(p.published_at, tz);
                  return (
                    <tr key={p.id}>
                      <td className="rv-nw">{shortDate(at.date)} {at.time}</td>
                      <td className="rv-nw">{p.account_ids.map((id2) => <PfMark key={id2} platform={byId.get(id2)?.platform ?? "?"} />)}</td>
                      <td className="rv-clamp">{p.body}</td>
                      <td className="rv-n">{num(p.reach)}</td><td className="rv-n">{num(p.engagement)}</td><td className="rv-n">{num(p.rate, "%")}</td>
                    </tr>
                  );
                })}
                {!data.top.length && <tr><td colSpan={6} className="rv-sub">這段期間沒有經這裡發佈的貼文。</td></tr>}
              </tbody>
            </table>
          </section>
        )}

        {has("cmp") && (
          <section className="rv-page">
            <h2>和上一期比較</h2>
            <p className="rv-sub">上一期：{data.period.prevFrom} 到 {data.period.prevTo}（同樣 {days} 天）</p>
            <table>
              <thead><tr><th>項目</th><th className="rv-n">這一期</th><th className="rv-n">上一期</th><th className="rv-n">變化</th></tr></thead>
              <tbody>
                {METRICS.map(({ m, name, unit }) => {
                  const k = kpi[m], d = change(k.value, k.prev);
                  return <tr key={m}><td>{name}</td><td className="rv-n">{num(k.value, unit)}</td><td className="rv-n">{num(k.prev, unit)}</td><td className="rv-n">{d == null ? "—" : `${d >= 0 ? "▲" : "▼"} ${Math.abs(d)}%`}</td></tr>;
                })}
              </tbody>
            </table>
          </section>
        )}

        <footer className="rv-foot">
          {data.empty.length > 0 && <p>這段期間還沒收集到資料的頻道：{data.empty.map((id) => byId.get(id)?.label ?? "已移除的頻道").join("、")}（每天台灣時間 03:30 收集一次，這些頻道的數字是「還沒有」，不是 0）。</p>}
          {data.accounts.some((a) => a.platform === "facebook") && <p>Facebook 的每一天是太平洋時間的一天，和這份報表的日期線差幾個小時。</p>}
          {data.gaps.length > 0 && <p>沒有數字的原因：{[...new Set(data.gaps.map((g) => `${platformOf(byId.get(g.account_id)?.platform ?? "").name}：${g.reason}`))].join("；")}。</p>}
          <p>數字來自各平台的每日收集；「—」代表平台沒有提供，不是 0。</p>
        </footer>
      </div>
    </>
  );
}

const W = 900, H = 200;

/** Reach (or engagement when no channel has reach) day by day: solid = this period, dashed = the one before when the report compares. */
function Chart({ data, prev }: { data: ReportData; prev: boolean }) {
  const metric: Metric = data.total.series.reach.cur.some((v) => v != null) ? "reach" : "engagement";
  const { cur, prev: before } = data.total.series[metric];
  const all = [...cur, ...(prev ? before : [])].filter((v): v is number => v != null);
  const name = METRICS.find((x) => x.m === metric)!.name;
  if (!cur.some((v) => v != null)) return <p className="rv-sub">這段期間沒有每日資料可以畫趨勢。</p>;
  const n = cur.length, max = Math.max(1, ...all);
  const X = (i: number) => 10 + (n === 1 ? (W - 20) / 2 : (i * (W - 20)) / (n - 1)), Y = (v: number) => H - 14 - (v / max) * (H - 28);
  const path = (vs: Array<number | null>) => vs.map((v, i) => (v == null ? "" : `${i && vs[i - 1] != null ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`)).join(" ");
  return (
    <figure className="rv-chart">
      <figcaption>{name}：每天{prev ? "（虛線 = 上一期）" : ""}　最高 {max.toLocaleString()}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${name}趨勢圖`}>
        {[0, 1, 2, 3].map((k) => <line key={k} className="rv-ax" x1="10" x2={W - 10} y1={Y((k * max) / 3)} y2={Y((k * max) / 3)} />)}
        {prev && <path className="rv-prev" d={path(before)} />}
        <path className="rv-line" d={path(cur)} />
      </svg>
      <div className="rv-xl"><span>{shortDate(data.period.days[0])}</span><span>{shortDate(data.period.days[n - 1])}</span></div>
    </figure>
  );
}
