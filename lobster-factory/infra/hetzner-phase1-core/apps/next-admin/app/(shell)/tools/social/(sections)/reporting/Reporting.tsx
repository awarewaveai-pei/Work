"use client";
// 報表管理 (SOCIAL_MANAGER_PLAN.md C25; mock v16 renderReporting): pick channels, a period and what goes in -> a report page the
// browser prints as PDF (V1 is PDF only; no generator). The first-page preview and the saved report use the same numbers
// (lib/social/reports.ts loadReportData -> metrics.ts summarize). A number a platform does not give is "—", never a 0.
import { useEffect, useMemo, useState } from "react";
import type { Report, ReportData, ReportPart } from "@/lib/social/reports";
import { COLOUR_VAR, REPORT_COLOURS, PRESETS, REPORT_JOBS, presetPeriod, type Preset, type ReportKind } from "@/lib/social/report-period";
import { api, type ReportSchedules } from "../../api";
import { PfMark } from "../../Calendar";
import EmptyState from "../../EmptyState";
import { platformOf, shortDate } from "../../model";
import { socialBase } from "../../routes";
import type { SlotContext } from "../../SocialManager";
import "./reporting.css";

/** The automatic sends, in period order; the send day and hour are set on the staff schedules page. */
const SENDS = (Object.keys(REPORT_JOBS) as ReportKind[]).map((kind) => ({ kind, noun: REPORT_JOBS[kind].noun }));
const PER: Record<Preset, string> = { lastw: "上週", lastm: "上個月", lastq: "上一季", lasty: "去年" };
export const PARTS: Array<{ k: ReportPart; t: string }> = [
  { k: "sum", t: "摘要（追蹤者、觸及、互動）" }, { k: "plat", t: "各平台成效" }, { k: "top", t: "表現最好的 5 則貼文" }, { k: "cmp", t: "和上一期比較" },
];
const num = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString());
const toggle = <T,>(list: T[], v: T, on: boolean): T[] => (on ? [...list, v] : list.filter((x) => x !== v));
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function Reporting({ ctx }: { ctx: SlotContext }) {
  const { brand, accounts } = ctx;
  const canWrite = brand.role === "owner" || brand.role === "editor";
  const shown = accounts.filter((a) => a.status !== "disabled");
  const [per, setPer] = useState<Preset>("lastm");
  const [colour, setColour] = useState<(typeof REPORT_COLOURS)[number]>("a");
  // the channels left out, not the ones picked: the channel list loads after this page mounts, and a new channel starts in
  const [off, setOff] = useState<string[]>([]);
  const [parts, setParts] = useState<ReportPart[]>(["sum", "plat", "top", "cmp"]);
  const [name, setName] = useState("");
  const [past, setPast] = useState<Report[] | null>(null);
  const [preview, setPreview] = useState<ReportData | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [sends, setSends] = useState<ReportSchedules | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const range = useMemo(() => presetPeriod(ctx.today, per), [ctx.today, per]);
  const ids = shown.filter((a) => !off.includes(a.id)).map((a) => a.id);
  const idsKey = ids.join(",");

  const loadPast = () => api.reports(brand.id).then((r) => setPast(r.reports)).catch((e) => setHint(msg(e)));
  // the page stays mounted when the brand changes: drop the old brand's lists at once and ignore its late answers
  useEffect(() => {
    let live = true;
    setPast(null); setSends(null); setOff([]); setHint(null);
    api.reports(brand.id).then((r) => { if (live) setPast(r.reports); }).catch((e) => { if (live) setHint(msg(e)); });
    api.reportSchedules(brand.id).then((r) => { if (live) setSends(r.schedules); }).catch(() => { if (live) setSends(null); });
    return () => { live = false; };
  }, [brand.id]);
  useEffect(() => {
    if (!ids.length) { setPreview(null); setPreviewErr(null); return; }
    let live = true;
    setPreviewErr(null);
    api.reportPreview(brand.id, range.from, range.to, ids).then((r) => { if (live) setPreview(r.data); }).catch((e) => { if (live) { setPreview(null); setPreviewErr(msg(e)); } });
    return () => { live = false; };
  }, [brand.id, range.from, range.to, idsKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!shown.length) return (
    <section className="sm-panel" aria-label="報表管理">
      <div className="sm-ptop"><h2>報表管理</h2></div>
      <EmptyState icon="report" line="還沒有可以做報表的頻道" hint="連接社群帳號後，就能做每月成效報表給客戶。" button="到設定連接帳號" onButton={() => ctx.setView("settings")} />
    </section>
  );

  const open = (id: string) => { window.location.assign(`${socialBase(window.location.pathname)}/reports/${id}`); };

  async function make() {
    if (!ids.length) return setHint("至少選一個頻道。");
    setBusy(true);
    setHint(null);
    try {
      const { id } = await api.createReport(brand.id, { name: name.trim() || `${PER[per]}成效報告`, period_from: range.from, period_to: range.to, colour, account_ids: ids, sections: parts });
      open(id);
    } catch (e) {
      setHint(msg(e));
      setBusy(false);
    }
  }
  async function setMail(kind: ReportKind, on: boolean) {
    const flip = (v: boolean) => setSends((s) => (s ? { ...s, [kind]: { ...s[kind], enabled: v } } : s));
    flip(on);
    try { setSends((await api.setReportSchedule(brand.id, kind, on)).schedules); } catch (e) { flip(!on); setHint(msg(e)); }
  }
  async function remove(r: Report) {
    if (!window.confirm(`刪掉報表「${r.name}」？`)) return;
    try { await api.deleteReport(brand.id, r.id); await loadPast(); } catch (e) { setHint(msg(e)); }
  }

  const k = preview?.total.kpis;
  const line = preview ? (preview.total.series.reach.cur.some((v) => v != null) ? preview.total.series.reach.cur : preview.total.series.engagement.cur) : [];
  return (
    <section className="sm-panel" aria-label="報表管理">
      <div className="sm-ptop rp-top">
        <h2>報表管理</h2>
        <span className="sm-muted">選頻道、期間和內容，做成 PDF 成效報表。</span>
        <span className="rp-r">
          {hint && <span className="sm-err" role="alert">{hint}</span>}
          <button type="button" className="btn-primary" disabled={busy || !canWrite || !ids.length} title={canWrite ? undefined : "只有擁有者和編輯能產生報表"} onClick={make}>{busy ? "產生中…" : "產生 PDF 報表"}</button>
        </span>
      </div>
      <div className="rp-grid">
        <div className="rp-form">
          <div className="rp-row">
            <div>
              <h3 className="sm-muted">報表主色</h3>
              <span className="rp-sws">{REPORT_COLOURS.map((c) => <button key={c} type="button" className={`rp-sw${colour === c ? " rp-on" : ""}`} style={{ background: `var(${COLOUR_VAR[c]})` }} aria-pressed={colour === c} aria-label={`顏色 ${c}`} onClick={() => setColour(c)} />)}</span>
            </div>
            <div>
              <h3 className="sm-muted">期間</h3>
              <span className="sm-seg" role="group" aria-label="期間">{PRESETS.map((p) => <button key={p} type="button" className={per === p ? "sm-on" : ""} aria-pressed={per === p} onClick={() => setPer(p)}>{PER[p]}</button>)}</span>
              <div className="sm-muted">{shortDate(range.from)} – {shortDate(range.to)}</div>
            </div>
          </div>
          <label className="rp-name"><span className="sm-muted">報表名稱</span><input type="text" value={name} maxLength={120} placeholder={`${PER[per]}成效報告`} onChange={(e) => setName(e.target.value)} /></label>
          <div className="rp-row">
            <div>
              <h3 className="sm-muted">放進報表的頻道（{ids.length}/{shown.length}）</h3>
              {shown.map((a) => (
                <label key={a.id} className="rp-ck"><input type="checkbox" checked={!off.includes(a.id)} onChange={(e) => setOff((l) => toggle(l, a.id, !e.target.checked))} /><PfMark platform={a.platform} /> {a.label}</label>
              ))}
            </div>
            <div>
              <h3 className="sm-muted">內容</h3>
              {PARTS.map((p) => <label key={p.k} className="rp-ck"><input type="checkbox" checked={parts.includes(p.k)} onChange={(e) => setParts((l) => toggle(l, p.k, e.target.checked))} />{p.t}</label>)}
              {SENDS.map(({ kind, noun }) => (
                <div key={kind}>
                  <label className="rp-ck"><input type="checkbox" checked={!!sends?.[kind].enabled} disabled={!canWrite || sends === null} onChange={(e) => void setMail(kind, e.target.checked)} />自動寄{noun}給客戶{sends && `（${sends[kind].when}）`}</label>
                  {sends?.[kind].lastError && <div className="sm-err">上次自動寄出{noun}失敗：{sends[kind].lastError}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="rp-side">
          <h3 className="sm-muted">第一頁長這樣</h3>
          <div className="rp-page">
            <span className="rp-band" style={{ background: `var(${COLOUR_VAR[colour]})` }} />
            <div className="rp-ph1"><span className="rp-logo">{brand.name.slice(0, 1)}</span><span><b>{brand.name} · 社群成效報告</b><br /><span className="sm-muted">{PER[per]} · {ids.length} 個頻道</span></span></div>
            {previewErr ? <p className="sm-err" role="alert">讀不到數字：{previewErr}</p> : !ids.length ? <p className="sm-muted">選了頻道才有數字。</p> : !k ? <p className="sm-muted">載入中…</p> : (
              <>
                <div className="rp-mini">
                  {([["追蹤者", k.followers.value], ["觸及", k.reach.value], ["互動", k.engagement.value], ["發文", k.posts.value]] as const).map(([t, v]) => <div key={t}><span className="sm-muted">{t}</span><b>{num(v)}</b></div>)}
                </div>
                <Sparkline values={line} colour={colour} />
              </>
            )}
          </div>
          <h3 className="sm-muted">做過的報表</h3>
          <div className="rp-past">
            {past === null ? <span className="sm-muted">載入中…</span> : !past.length ? <span className="sm-muted">還沒有做過。</span> : past.map((r) => (
              <div key={r.id} className="rp-prow">
                <button type="button" className="rp-open" onClick={() => open(r.id)} aria-label={`打開 ${r.name}`}>{r.name}</button>
                <span className="sm-muted">{shortDate(r.created_at.slice(0, 10))} · PDF</span>
                {canWrite && <button type="button" onClick={() => void remove(r)} aria-label={`刪除 ${r.name}`}>刪除</button>}
              </div>
            ))}
          </div>
          {preview && preview.gaps.length > 0 && <p className="sm-muted">{[...new Set(preview.gaps.map((g) => `${platformOf(preview.accounts.find((a) => a.id === g.account_id)?.platform ?? "").name}：${g.reason}`))].join("；")}。</p>}
        </div>
      </div>
    </section>
  );
}

/** The days as one line; a day with no number is a gap. Inline SVG (no chart library). */
export function Sparkline({ values, colour }: { values: Array<number | null>; colour: (typeof REPORT_COLOURS)[number] }) {
  const have = values.filter((v): v is number => v != null);
  if (have.length < 2) return <p className="sm-muted">這段期間的每日資料不夠畫趨勢。</p>;
  const max = Math.max(1, ...have), n = values.length, W = 300, H = 70;
  const X = (i: number) => (n === 1 ? W / 2 : (i * W) / (n - 1)), Y = (v: number) => H - 6 - (v / max) * (H - 12);
  const d = values.map((v, i) => (v == null ? "" : `${i && values[i - 1] != null ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`)).join(" ");
  return <svg className="rp-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true"><path d={d} style={{ stroke: `var(${COLOUR_VAR[colour]})` }} /></svg>;
}
