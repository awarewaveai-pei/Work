"use client";
// 數據分析 (SOCIAL_MANAGER_PLAN.md C24; mock v16 renderAnalytics): channels on the left (全部頻道 first), 7 / 28 / 90
// days, six cards that pick the chart, this period against the one before, the posts that went out. Numbers come from
// the daily snapshots (lib/social/metrics.ts); a number a platform does not give is "—" with the reason, never a 0,
// and a chart with no data says why instead of drawing.
import { useEffect, useState } from "react";
import type { Analytics as Data, Metric, Stored } from "@/lib/social/metrics";
import { api } from "../../api";
import { PfMark } from "../../Calendar";
import EmptyState from "../../EmptyState";
import { platformOf, shortDate, zoned, type Account } from "../../model";
import type { SlotContext } from "../../SocialManager";
import "./analytics.css";

const CARDS: Array<{ m: Metric; name: string; unit: string }> = [
  { m: "followers", name: "追蹤者", unit: "" }, { m: "reach", name: "觸及", unit: "" }, { m: "impressions", name: "曝光", unit: "" },
  { m: "engagement", name: "互動", unit: "" }, { m: "rate", name: "互動率", unit: "%" }, { m: "posts", name: "發文數", unit: "" },
];
const FIELD_NAMES: Record<Stored, string> = { followers: "追蹤者", reach: "觸及", impressions: "曝光", engagement: "互動", posts: "發文數" };
/** the stored fields a card stands on (互動率 = 互動 / 觸及) */
const NEEDS: Record<Metric, Stored[]> = { followers: ["followers"], reach: ["reach"], impressions: ["impressions"], engagement: ["engagement"], rate: ["reach", "engagement"], posts: ["posts"] };
const PERIODS = [7, 28, 90] as const;
const SOURCE: Record<string, string> = { facebook: "Facebook 經 Postiz", bluesky: "Bluesky 公開資料" };
const COLLECT_NOTE = "每天台灣時間 03:30 收集一次";

const num = (v: number | null, unit = "") => (v == null ? "—" : `${v.toLocaleString()}${unit}`);

export default function Analytics({ ctx }: { ctx: SlotContext }) {
  const { brand, accounts } = ctx;
  const [acct, setAcct] = useState<string | null>(null);
  const [days, setDays] = useState<(typeof PERIODS)[number]>(28);
  const [metric, setMetric] = useState<Metric>("reach");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = accounts.filter((a) => a.status !== "disabled");
  const one = acct ? shown.find((a) => a.id === acct) ?? null : null;

  useEffect(() => {
    let live = true;
    setError(null);
    api.metrics(brand.id, days, acct).then((r) => { if (live) setData(r.analytics); }).catch((e) => { if (live) setError(String(e instanceof Error ? e.message : e)); });
    return () => { live = false; };
  }, [brand.id, days, acct]);

  if (!shown.length) return (
    <section className="sm-panel" aria-label="數據分析">
      <div className="sm-ptop"><h2>數據分析</h2></div>
      <EmptyState icon="chart" line="還沒有可以分析的頻道" hint="連接社群帳號後，這裡會出現追蹤者、觸及和互動。" button="到設定連接帳號" onButton={() => ctx.setView("settings")} />
    </section>
  );

  const byId = new Map(shown.map((a) => [a.id, a]));
  const name = (id: string) => { const a = byId.get(id); return a ? `${a.label}（${platformOf(a.platform).name}）` : "已移除的頻道"; };
  // why a card or the chart has no number: the channels' reasons for the fields it stands on
  const whyNot = (m: Metric) => {
    const out: string[] = [];
    for (const g of data?.gaps ?? []) if (g.fields.some((f) => NEEDS[m].includes(f))) out.push(`${name(g.account_id)}：${g.reason}`);
    for (const id of data?.empty ?? []) out.push(`${name(id)}：這段期間還沒有收集到資料，${COLLECT_NOTE}`);
    return out;
  };
  const sources = [...new Set(shown.filter((a) => !acct || a.id === acct).map((a) => SOURCE[a.platform]).filter(Boolean))];

  return (
    <div className="an-grid">
      <section className="sm-panel an-chan" aria-label="選頻道">
        <div className="sm-ptop"><h2>選頻道</h2></div>
        <div className="sm-clist">
          <div className={`sm-crow${!acct ? " sm-on" : ""}`}>
            <button type="button" className="sm-cmain" aria-pressed={!acct} onClick={() => setAcct(null)}>
              <span className="sm-aav"><span className="sm-av">全</span></span>
              <span className="sm-nm"><b>全部頻道</b><span>{shown.length} 個加總</span></span>
            </button>
          </div>
          {shown.map((a) => <ChannelRow key={a.id} a={a} on={acct === a.id} pick={() => setAcct(a.id)} />)}
        </div>
      </section>

      <section className="sm-panel an-main" aria-label="數據分析">
        <div className="sm-ptop an-top">
          <h2>{one ? one.label : "全部頻道"}</h2>
          <span className="sm-muted">
            {sources.length ? `資料來自 ${sources.join("、")}，${COLLECT_NOTE}。` : "這些頻道的平台還沒開放分析資料。"}
            {data?.latestDay ? ` 最新一天：${shortDate(data.latestDay)}` : ""}
          </span>
          <span className="an-r">
            <span className="sm-seg" role="group" aria-label="期間">
              {PERIODS.map((d) => <button key={d} type="button" className={days === d ? "sm-on" : ""} aria-pressed={days === d} onClick={() => setDays(d)}>{d} 天</button>)}
            </span>
            {data && <span className="sm-muted">{shortDate(data.period.from)} – {shortDate(data.period.to)}</span>}
          </span>
        </div>
        {error ? <p className="sm-err an-pad" role="alert">讀不到數據：{error}</p> : !data ? <p className="sm-muted an-pad">載入中…</p> : (
          <div className="an-body">
            <div className="an-kpi">
              {CARDS.map(({ m, name: t, unit }) => {
                const k = data.kpis[m], why = k.value == null ? whyNot(m) : [];
                const delta = k.value != null && k.prev != null && k.prev > 0 ? Math.round(((k.value - k.prev) / k.prev) * 100) : null;
                return (
                  <button key={m} type="button" className={`an-card${metric === m ? " an-on" : ""}`} aria-pressed={metric === m} title={why.join("\n") || undefined} onClick={() => setMetric(m)}>
                    <span className="sm-muted">{t}</span>
                    <b>{num(k.value, unit)}</b>
                    {k.value == null ? <span className="sm-muted">沒有資料</span>
                      : delta == null ? <span className="sm-muted">上一期沒有可比的數字</span>
                      : <span className={delta >= 0 ? "an-up" : "an-down"}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% 比上一期</span>}
                  </button>
                );
              })}
            </div>
            <Chart data={data} metric={metric} why={whyNot(metric)} />
            {(data.gaps.length > 0 || data.empty.length > 0) && (
              <div className="an-notes">
                <b>沒有數字的原因</b>
                <ul>
                  {data.gaps.map((g) => <li key={`${g.account_id}${g.reason}`}>{name(g.account_id)}沒有{g.fields.map((f) => FIELD_NAMES[f]).join("、")}：{g.reason}。</li>)}
                  {data.empty.map((id) => <li key={id}>{name(id)}這段期間還沒有收集到資料，{COLLECT_NOTE}。</li>)}
                </ul>
              </div>
            )}
            <PostsTable data={data} byId={byId} tz={brand.default_timezone} />
          </div>
        )}
      </section>
    </div>
  );
}

function ChannelRow({ a, on, pick }: { a: Account; on: boolean; pick: () => void }) {
  return (
    <div className={`sm-crow${on ? " sm-on" : ""}`}>
      <button type="button" className="sm-cmain" aria-pressed={on} onClick={pick}>
        <span className="sm-aav">
          {a.picture ? <img className="sm-av" src={a.picture} alt="" /> : <span className="sm-av">{(a.label || "?").slice(0, 1)}</span>}
          <PfMark platform={a.platform} />
        </span>
        <span className="sm-nm" title={a.label}><b>{a.label}</b><span className={a.status === "expired" ? "sm-err" : ""}>{a.status === "expired" ? "授權已過期" : `${platformOf(a.platform).name} · ${a.handle || a.label}`}</span></span>
      </button>
    </div>
  );
}

const W = 640, H = 160;

/** The picked card's days: bars + line = this period, dashed = the one before, day by day. A day with no number is a
 *  gap, not a 0; with no number at all the box says why. */
function Chart({ data, metric, why }: { data: Data; metric: Metric; why: string[] }) {
  const card = CARDS.find((c) => c.m === metric)!;
  const { cur, prev } = data.series[metric];
  const all = [...cur, ...prev].filter((v): v is number => v != null);
  if (!cur.some((v) => v != null)) return (
    <div className="an-chart an-nodata" role="note">
      <b>{card.name}：這段期間沒有資料</b>
      {why.length ? <ul>{why.map((w) => <li key={w}>{w}</li>)}</ul> : <span className="sm-muted">{COLLECT_NOTE}。</span>}
    </div>
  );
  const n = cur.length, max = Math.max(1, ...all);
  const X = (i: number) => 20 + (n === 1 ? (W - 40) / 2 : (i * (W - 40)) / (n - 1));
  const Y = (v: number) => H - 18 - (v / max) * (H - 34);
  const path = (vs: Array<number | null>) => vs.map((v, i) => (v == null ? "" : `${i && vs[i - 1] != null ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`)).join(" ");
  const bw = Math.max(2, Math.min(10, (W - 40) / n - 2));
  const marks = [0, Math.floor((n - 1) / 2), n - 1];
  return (
    <div className="an-chart">
      <div className="an-lg">
        <b>{card.name}：每天</b>
        <span><i />這一期</span><span><i className="an-p" />上一期</span>
        <span className="sm-muted">最高 {max.toLocaleString()}{card.unit}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${card.name}趨勢圖`}>
        {[0, 1, 2, 3].map((k) => <line key={k} className="an-ax" x1="20" x2={W - 20} y1={Y((k * max) / 3)} y2={Y((k * max) / 3)} />)}
        {cur.map((v, i) => (v == null ? null : <rect key={i} className="an-bar" x={X(i) - bw / 2} y={Y(v * 0.6)} width={bw} height={H - 18 - Y(v * 0.6)}><title>{`${shortDate(data.days[i])}：${v.toLocaleString()}${card.unit}`}</title></rect>))}
        <path className="an-prev" d={path(prev)} />
        <path className="an-line" d={path(cur)} />
      </svg>
      <div className="an-xl">{marks.map((i, k) => <span key={k}>{shortDate(data.days[i])}</span>)}</div>
    </div>
  );
}

function PostsTable({ data, byId, tz }: { data: Data; byId: Map<string, Account>; tz: string }) {
  return (
    <div className="an-table">
      <table>
        <thead><tr><th aria-label="圖片" /><th>發佈</th><th>頻道</th><th>內容</th><th className="an-num">觸及</th><th className="an-num">互動</th><th className="an-num">互動率</th></tr></thead>
        <tbody>
          {data.posts.map((p) => {
            const at = zoned(p.published_at, tz);
            return (
              <tr key={p.id}>
                <td>{p.thumb ? <img className="an-thumb" src={p.thumb} alt="" /> : <span className="an-thumb">文字</span>}</td>
                <td className="an-nowrap">{shortDate(at.date)} {at.time}</td>
                <td className="an-nowrap">{p.account_ids.map((id) => <PfMark key={id} platform={byId.get(id)?.platform ?? "?"} />)}</td>
                <td className="an-ttl">{p.body}</td>
                <td className="an-num">{num(p.reach)}</td>
                <td className="an-num">{num(p.engagement)}</td>
                <td className="an-num">{num(p.rate, "%")}</td>
              </tr>
            );
          })}
          {!data.posts.length && <tr><td colSpan={7} className="sm-muted">這段期間沒有經這裡發佈的貼文。</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
