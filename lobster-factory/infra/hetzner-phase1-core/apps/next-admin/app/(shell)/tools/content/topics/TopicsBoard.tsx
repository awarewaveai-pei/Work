"use client";
// One site, one month: the topic list on the left, the clicked topic on the right (same layout as /ops/schedules).
// Buttons and checkboxes only, no dropdowns (memory feedback_no_dropdowns_multiselect). Every change goes through
// /api/content/topics*, which checks the site's organization; a stale page gets 409 and reloads.
import { useCallback, useEffect, useMemo, useState } from "react";
import { NEXT, TOPIC_FORMATS, canReschedule, daysIn, taipeiParts, type Topic, type TopicFormat, type TopicStatus } from "@/lib/content/topics/store";
import { planCostTwd, topicCostTwd } from "@/lib/content/topics/cost";
import { DAILY_START_CAP, makesNow } from "@/lib/content/topics/tick";
import { GridPicker } from "@/components/tools/GridPicker";
import type { TopicReview } from "@/lib/content/topics/review";
import type { TopicArtifacts } from "@/lib/content/topics/make";
import { autoPublishes, type SiteContentDefaults } from "@/lib/content/brand-voice";

const T = {
  noSites: "還沒有可用的客戶網站，先到 WordPress Sites 加一個。",
  plan: "AI 提案本月題目",
  planning: "AI 規劃中…",
  approveSel: "核准所選",
  rejectSel: "退回所選",
  empty: "這個月還沒有題目。按「AI 提案本月題目」，或在下面自己加一題。",
  pick: "點左邊一個題目，這裡會顯示細節。",
  add: "加一個題目",
  addBtn: "加入",
  title: "標題",
  keyword: "搜尋關鍵字",
  angle: "切入角度（選填）",
  formats: "要做的格式",
  saveFormats: "儲存格式",
  source: "來源",
  error: "上次失敗原因",
  reload: "有人剛改過，已重新載入。",
  kbHint: "從知識庫的資料夾加題目（點一下會填進上面）：",
  fromKb: "來源：知識庫",
  start: "核准並開始",
  started: "已開始製作，約 2 分鐘後按上個月／下個月再回來就看得到草稿。",
  // what starting makes follows the topic's formats, like its price (topicCostTwd)
  startHint: (f: TopicFormat[], auto: boolean, cap: number) => `立刻做成 ${[f.includes("article") && "WordPress 草稿", f.includes("social") && "社群草稿"].filter(Boolean).join("和")}，${auto ? "檢查全部通過就自動發布（網站設定：AI 審核後自動發布）" : "不會發布（網站設定：人工審核）"}；每天最多開始 ${cap} 題（在排程頁 Schedules 的「自動內容管線」改）。`,
  when: "排定時間（台北）",
  hour: "時間",
  pickDay: "選日期",
  pickHour: "選台北時間",
  saveWhen: "儲存時間",
  whenFixed: "製作中、已審核、正在發布或已發布，時間不能改。",
  movedTo: (m: string) => `已改到 ${m}，切到那個月就看得到。`,
  review: "規則審核",
  wpDraft: "打開 WordPress 草稿",
};
/** A search-run folder is named "<keyword> <YYYYMMDDHHmm>" (lib/collect/sinks/kb.ts); the keyword is the topic. */
const folderKeyword = (name: string) => name.replace(/\s*\d{12}$/, "").trim() || name;
const STATUS: Record<TopicStatus, [string, string]> = {
  proposed: ["提案", "var(--text-muted)"], approved: ["已核准", "var(--accent)"], rejected: ["已退回", "var(--text-muted)"],
  generating: ["製作中", "var(--yellow)"], drafted: ["已有草稿", "var(--yellow)"], waiting_video: ["等影片", "var(--yellow)"],
  embedded: ["影片已嵌入", "var(--yellow)"], reviewed: ["已審核", "var(--green)"], scheduled: ["已排程", "var(--green)"],
  published: ["已發布", "var(--green)"], failed: ["失敗", "var(--red)"],
};
const FORMAT: Record<TopicFormat, string> = { article: "文章", social: "社群", video: "影片", youtube: "YouTube" };
const SOURCE: Record<Topic["source"], string> = { trending: "熱門話題", kb: "知識庫", plan: "AI 規劃", manual: "手動" };
const ACTION_FOR: Partial<Record<TopicStatus, Array<[string, string]>>> = {
  proposed: [["approve", "核准"], ["reject", "退回"]],
  approved: [["reopen", "改回提案"]],
  rejected: [["reopen", "重新提案"]],
  failed: [["retry", "重試"]],
};

interface Site { id: string; name: string; organization_id?: string | null; contentDefaults?: SiteContentDefaults }
const card: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 };
const chip = (on: boolean): React.CSSProperties => ({
  padding: "4px 10px", borderRadius: 999, border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, cursor: "pointer",
  background: on ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent", color: "var(--text-primary)", fontSize: "var(--font-size-sm)",
});
const thisMonth = () => new Date().toISOString().slice(0, 7);
const shiftMonth = (m: string, by: number) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};
/** "12日 09:00" in Taipei time, or "—". */
const whenText = (t: Topic) => {
  if (!t.scheduled_for) return "—";
  const p = taipeiParts(t.scheduled_for);
  return `${p.day}日 ${String(p.hour).padStart(2, "0")}:00`;
};
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const dayText = (d: number) => `${d} 日`;
const daysOf = (month: string) => Array.from({ length: daysIn(month) }, (_, i) => i + 1);

export function TopicsBoard() {
  const [sites, setSites] = useState<Site[] | null>(null);
  const [siteId, setSiteId] = useState("");
  const [month, setMonth] = useState(thisMonth());
  const [topics, setTopics] = useState<Topic[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [selId, setSelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [draftFormats, setDraftFormats] = useState<TopicFormat[] | null>(null);
  const [add, setAdd] = useState({ day: 1, hour: 9, title: "", keyword: "", angle: "", formats: ["article", "social"] as TopicFormat[] });
  /** The selected topic's time being edited (Taipei); null = unchanged. */
  const [draftWhen, setDraftWhen] = useState<{ month: string; day: number; hour: number } | null>(null);
  const [dailyCap, setDailyCap] = useState(DAILY_START_CAP);
  const [fromFolder, setFromFolder] = useState<{ id: string; name: string } | null>(null);
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    void (async () => {
      try {
        const j = await (await fetch("/api/content/sites")).json() as { ok: boolean; sites?: Site[] };
        const list = (j.sites ?? []).filter((s) => s.organization_id);
        setSites(list);
        if (list[0]) setSiteId((cur) => cur || list[0].id);
      } catch { setSites([]); }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!siteId) return;
    const r = await fetch(`/api/content/topics?siteId=${encodeURIComponent(siteId)}&month=${month}&folders=1`);
    const j = await r.json() as { ok: boolean; topics?: Topic[]; folders?: Array<{ id: string; name: string }>; dailyCap?: number; error?: string };
    if (!j.ok) { setNote(j.error ?? `讀取失敗（${r.status}）`); return; }
    setTopics(j.topics ?? []);
    if (typeof j.dailyCap === "number") setDailyCap(j.dailyCap);
    setFolders(j.folders ?? []);
    setChecked(new Set());
  }, [siteId, month]);
  useEffect(() => { setSelId(""); setNote(""); void load(); }, [load]);

  const sel = topics.find((t) => t.id === selId);
  useEffect(() => { setDraftFormats(null); setDraftWhen(null); }, [selId]);
  const counts = useMemo(() => {
    const c: Partial<Record<TopicStatus, number>> = {};
    for (const t of topics) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [topics]);

  async function act(t: Topic, action: string, formats?: TopicFormat[], when?: { month: string; day: number; hour: number }): Promise<boolean> {
    const r = await fetch(`/api/content/topics/${t.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, version: t.version, ...(formats ? { formats } : {}), ...(when ?? {}) }),
    });
    if (r.status === 409) { setNote(T.reload); return false; }
    const j = await r.json() as { ok: boolean; error?: string };
    if (!j.ok) { setNote(j.error ?? `失敗（${r.status}）`); return false; }
    return true;
  }

  async function batch(action: "approve" | "reject") {
    setBusy(true); setNote("");
    try {
      for (const t of topics.filter((x) => checked.has(x.id) && x.status === "proposed")) await act(t, action);
    } finally { await load(); setBusy(false); }
  }

  async function one(action: string, formats?: TopicFormat[]) {
    if (!sel) return;
    setBusy(true); setNote("");
    try { await act(sel, action, formats); } finally { await load(); setBusy(false); }
  }

  async function saveWhen() {
    if (!sel || !draftWhen) return;
    setBusy(true); setNote("");
    try {
      const ok = await act(sel, "schedule", undefined, draftWhen);
      if (ok && draftWhen.month !== month) setNote(T.movedTo(draftWhen.month));
    } finally { await load(); setBusy(false); }
  }

  async function start() {
    if (!sel) return;
    setBusy(true); setNote("");
    try {
      const r = await fetch(`/api/content/topics/${sel.id}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: sel.version }) });
      const j = await r.json().catch(() => ({ ok: false })) as { ok: boolean; error?: string; code?: string };
      setNote(j.ok ? T.started : (j.error ?? j.code ?? `失敗（${r.status}）`));
    } finally { await load(); setBusy(false); }
  }

  async function plan() {
    setBusy(true); setNote("");
    try {
      const r = await fetch("/api/content/topics/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId, month }) });
      const j = await r.json() as { ok: boolean; added?: number; error?: string };
      setNote(j.ok ? `加了 ${j.added} 個題目。` : (j.error ?? `失敗（${r.status}）`));
    } finally { await load(); setBusy(false); }
  }

  async function addOne() {
    if (!add.title.trim() || !add.keyword.trim()) return;
    setBusy(true); setNote("");
    try {
      const r = await fetch("/api/content/topics", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, month, ...add, ...(fromFolder ? { source: "kb", sourceRef: { folder_id: fromFolder.id, text: fromFolder.name } } : {}) }) });
      const j = await r.json() as { ok: boolean; error?: string };
      if (j.ok) { setAdd({ day: 1, hour: 9, title: "", keyword: "", angle: "", formats: ["article", "social"] }); setFromFolder(null); }
      else setNote(j.error ?? `失敗（${r.status}）`);
    } finally { await load(); setBusy(false); }
  }

  if (!sites) return <p style={{ color: "var(--text-muted)" }}>…</p>;
  if (!sites.length) return <p style={{ color: "var(--text-muted)" }}>{T.noSites}</p>;
  const editable = sel && ["proposed", "approved"].includes(sel.status);
  const selWhen = sel?.scheduled_for ? taipeiParts(sel.scheduled_for) : { month, day: 1, hour: 9 };
  const when = draftWhen ?? selWhen;
  // a day past the end of the month just switched to (31 -> November) becomes its last day
  const setWhen = (w: { month: string; day: number; hour: number }) => setDraftWhen({ ...w, day: Math.min(w.day, daysIn(w.month)) });
  const formats = draftFormats ?? sel?.formats ?? [];
  const toggle = (list: TopicFormat[], f: TopicFormat) => (list.includes(f) ? list.filter((x) => x !== f) : [...list, f]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {sites.map((s) => <button key={s.id} type="button" style={chip(s.id === siteId)} onClick={() => setSiteId(s.id)}>{s.name}</button>)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <button type="button" className="btn btn-secondary" onClick={() => setMonth(shiftMonth(month, -1))}>‹ 上個月</button>
        <strong style={{ fontVariantNumeric: "tabular-nums" }}>{month}</strong>
        <button type="button" className="btn btn-secondary" onClick={() => setMonth(shiftMonth(month, 1))}>下個月 ›</button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void plan()} style={{ whiteSpace: "normal" }}>
          {busy ? T.planning : `${T.plan}（約 NT$${planCostTwd()}）`}
        </button>
      </div>
      <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "var(--font-size-sm)" }}>
        {(Object.keys(STATUS) as TopicStatus[]).filter((s) => counts[s]).map((s) => `${STATUS[s][0]} ${counts[s]}`).join(" · ") || "—"}
      </p>
      {note && <p style={{ margin: 0, color: "var(--yellow)", fontSize: "var(--font-size-sm)" }}>{note}</p>}

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 560px", minWidth: 0, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-secondary" disabled={busy || !checked.size} onClick={() => void batch("approve")}>{T.approveSel}</button>
            <button type="button" className="btn btn-ghost" disabled={busy || !checked.size} onClick={() => void batch("reject")}>{T.rejectSel}</button>
          </div>
          <div style={{ ...card, padding: 0, overflowX: "auto" }}>
            {!topics.length && <p style={{ margin: 0, padding: 14, color: "var(--text-muted)" }}>{T.empty}</p>}
            {topics.map((t) => (
              <div key={t.id} onClick={() => setSelId(t.id)}
                style={{ display: "grid", gridTemplateColumns: "28px 84px minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "9px 12px",
                  borderTop: "1px solid var(--border)", cursor: "pointer", background: t.id === selId ? "var(--bg-hover)" : undefined }}>
                <input type="checkbox" aria-label={t.title} disabled={t.status !== "proposed"} checked={checked.has(t.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setChecked((c) => { const n = new Set(c); if (e.target.checked) n.add(t.id); else n.delete(t.id); return n; })} />
                <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{whenText(t)}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", color: "var(--text-primary)" }}>{t.title}</span>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{t.formats.map((f) => FORMAT[f]).join("、")} · {SOURCE[t.source]}</span>
                </span>
                <span style={{ fontSize: "var(--font-size-xs)", color: STATUS[t.status][1], whiteSpace: "nowrap" }}>{STATUS[t.status][0]}</span>
              </div>
            ))}
          </div>

          <div style={{ ...card, display: "grid", gap: 8 }}>
            <div className="section-title" style={{ margin: 0 }}>{T.add}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <GridPicker value={Math.min(add.day, daysIn(month))} options={daysOf(month)} format={dayText} label={T.pickDay} columns={7} disabled={busy} onChange={(d) => setAdd({ ...add, day: d })} />
              <GridPicker value={add.hour} options={HOURS} format={hh} label={T.pickHour} disabled={busy} onChange={(h) => setAdd({ ...add, hour: h })} />
              <input id="topic-add-title" placeholder={T.title} value={add.title} style={{ flex: "2 1 220px", minWidth: 0 }} onChange={(e) => setAdd({ ...add, title: e.target.value })} />
              <input id="topic-add-keyword" placeholder={T.keyword} value={add.keyword} style={{ flex: "1 1 160px", minWidth: 0 }} onChange={(e) => setAdd({ ...add, keyword: e.target.value })} />
            </div>
            <input id="topic-add-angle" placeholder={T.angle} value={add.angle} onChange={(e) => setAdd({ ...add, angle: e.target.value })} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {TOPIC_FORMATS.map((f) => <button key={f} type="button" style={chip(add.formats.includes(f))}
                onClick={() => setAdd({ ...add, formats: toggle(add.formats, f).length ? toggle(add.formats, f) : add.formats })}>{FORMAT[f]}</button>)}
              <button type="button" className="btn btn-secondary" disabled={busy || !add.title.trim() || !add.keyword.trim()} onClick={() => void addOne()}>{T.addBtn}</button>
            </div>
            {fromFolder && <p style={{ margin: 0, fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{T.fromKb}：{fromFolder.name}</p>}
            {folders.length > 0 && (
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)" }}>{T.kbHint}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {folders.slice(0, 30).map((f) => <button key={f.id} type="button" style={chip(fromFolder?.id === f.id)}
                    onClick={() => { const k = folderKeyword(f.name); setFromFolder(f); setAdd({ ...add, title: k, keyword: k }); }}>{f.name}</button>)}
                </div>
              </div>
            )}
          </div>
        </div>

        <aside style={{ ...card, flex: "0 1 340px", minWidth: 0, display: "grid", gap: 10 }}>
          {!sel && <p style={{ margin: 0, color: "var(--text-muted)" }}>{T.pick}</p>}
          {sel && (
            <>
              <div>
                <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{sel.title}</div>
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)" }}>{sel.keyword} · {whenText(sel)} · <span style={{ color: STATUS[sel.status][1] }}>{STATUS[sel.status][0]}</span></div>
              </div>
              {sel.angle && <p style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>{sel.angle}</p>}
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: "var(--font-size-sm)" }}>{T.when}</div>
                {canReschedule(sel, new Date()) ? (
                  <>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <button type="button" className="btn btn-ghost" disabled={busy} aria-label="上個月" onClick={() => setWhen({ ...when, month: shiftMonth(when.month, -1) })}>‹</button>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{when.month}</span>
                      <button type="button" className="btn btn-ghost" disabled={busy} aria-label="下個月" onClick={() => setWhen({ ...when, month: shiftMonth(when.month, 1) })}>›</button>
                      <GridPicker value={when.day} options={daysOf(when.month)} format={dayText} label={T.pickDay} columns={7} disabled={busy} onChange={(d) => setWhen({ ...when, day: d })} />
                      <GridPicker value={when.hour} options={HOURS} format={hh} label={T.pickHour} disabled={busy} onChange={(h) => setWhen({ ...when, hour: h })} />
                    </div>
                    {draftWhen && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void saveWhen()}>{T.saveWhen}</button>}
                  </>
                ) : <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{T.whenFixed}</span>}
              </div>
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)" }}>
                {T.source}：{SOURCE[sel.source]}{typeof sel.source_ref.text === "string" && sel.source_ref.text ? `（${sel.source_ref.text}）` : ""}
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: "var(--font-size-sm)" }}>{T.formats}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {TOPIC_FORMATS.map((f) => <button key={f} type="button" disabled={!editable} style={chip(formats.includes(f))}
                    onClick={() => { const n = toggle(formats, f); if (n.length) setDraftFormats(n); }}>{FORMAT[f]}</button>)}
                </div>
                {editable && draftFormats && (
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void one("formats", draftFormats)}>{T.saveFormats}</button>
                )}
              </div>
              {sel.last_error && <p style={{ margin: 0, fontSize: "var(--font-size-sm)", color: "var(--red)" }}>{T.error}：{sel.last_error}</p>}
              {(() => {
                const url = (sel.artifacts as TopicArtifacts).article?.wp_edit_url;
                return typeof url === "string" && /^https:\/\//.test(url)
                  ? <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: "var(--font-size-sm)" }}>{T.wpDraft}</a> : null;
              })()}
              {sel.review && (
                <div style={{ display: "grid", gap: 4, fontSize: "var(--font-size-sm)" }}>
                  <div>{T.review}：<span style={{ color: (sel.review as TopicReview).pass ? "var(--green)" : "var(--red)" }}>{(sel.review as TopicReview).pass ? "通過" : "沒通過"}</span></div>
                  {((sel.review as TopicReview).checks ?? []).map((c) => (
                    <div key={c.name} style={{ color: c.pass ? "var(--text-muted)" : "var(--red)" }}>{c.pass ? "✓" : "✗"} {c.detail}</div>
                  ))}
                </div>
              )}
              {["proposed", "approved"].includes(sel.status) && makesNow(sel) && (
                <div style={{ display: "grid", gap: 4 }}>
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void start()} style={{ whiteSpace: "normal" }}>
                    {T.start}（約 NT${topicCostTwd(sel.formats).usual}{topicCostTwd(sel.formats).max > topicCostTwd(sel.formats).usual ? `，最多 NT$${topicCostTwd(sel.formats).max}` : ""}）
                  </button>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{T.startHint(sel.formats, autoPublishes(sites.find((s) => s.id === siteId)?.contentDefaults), dailyCap)}</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(ACTION_FOR[sel.status] ?? []).filter(([a]) => a !== "approve" || NEXT[sel.status].includes("approved")).map(([a, label]) => (
                  <button key={a} type="button" className="btn btn-secondary" disabled={busy} onClick={() => void one(a)}>{label}</button>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
