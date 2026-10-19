"use client";
// 智慧連結 (SOCIAL_MANAGER_PLAN.md C26; mock v16 renderSmart): the brand's one public link page. Left: title, one line,
// button colour, the links (shown / text / url / order / delete / add) with each one's clicks; right: the same LinkPage
// the public sees, in a phone-wide frame. Edits stay on this screen until 儲存; 發布中 / 先不發布 saves at once.
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, type SmartLinkData } from "../api";
import Icon from "../Icon";
import { TAG_TOKEN, type Tag } from "../model";
import type { SlotContext } from "../SocialManager";
import { slugProblem, urlProblem } from "@/lib/social/smartlink-rules";
import LinkPage from "./LinkPage";
import "./smartlinks.css";

type Colour = Tag["colour"];
type Draft = { slug: string; title: string; bio: string; colour: Colour; published: boolean };
type Row = { key: string; id?: string; title: string; url: string; active: boolean; clicks: number };
const COLOURS = Object.keys(TAG_TOKEN) as Colour[];
const COLOUR_NAMES: Record<Colour, string> = { a: "紅", b: "主色", c: "綠", d: "黃", e: "藍" };
let seq = 0;

export default function SmartLinks({ ctx }: { ctx: SlotContext }) {
  const brand = ctx.brand;
  const canWrite = brand.role === "owner" || brand.role === "editor";
  const [base, setBase] = useState("");
  const [saved, setSaved] = useState<string | null>(null);   // the slug the public page is on now
  const [draft, setDraft] = useState<Draft | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [hint, setHint] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    const r: SmartLinkData = await api.smartLink(brand.id);
    setBase(r.base);
    setSaved(r.link?.slug ?? null);
    setDraft(r.link ?? { slug: r.suggested, title: brand.name, bio: "", colour: "b", published: false });
    setRows(r.items.map((i) => ({ key: i.id, ...i })));
    setDirty(false);
  }, [brand.id, brand.name]);

  useEffect(() => { load().catch((e) => setHint({ text: e instanceof Error ? e.message : String(e), error: true })); }, [load]);

  if (!draft) return <section className="sm-panel" aria-label="智慧連結"><div className="sm-ptop"><h2>智慧連結</h2></div><p className="sm-muted sm-sl-pad">{hint?.text ?? "載入中…"}</p></section>;

  const edit = (patch: Partial<Draft>) => { setDraft({ ...draft, ...patch }); setDirty(true); };
  const editRow = (key: string, patch: Partial<Row>) => { setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r))); setDirty(true); };
  const moveUp = (i: number) => { const n = [...rows]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setRows(n); setDirty(true); };
  const remove = (key: string) => { setRows(rows.filter((r) => r.key !== key)); setDirty(true); };

  function add() {
    const t = newTitle.trim(), u = newUrl.trim();
    if (!t || !u) return setHint({ text: "按鈕文字和網址都要填。", error: true });
    const wrong = urlProblem(u);
    if (wrong) return setHint({ text: wrong, error: true });
    setRows([...rows, { key: `new-${++seq}`, title: t, url: u, active: true, clicks: 0 }]);
    setNewTitle(""); setNewUrl(""); setDirty(true);
    setHint({ text: "已加上。按「儲存」後公開頁才會出現。" });
  }

  async function save(next: Draft = draft as Draft) {
    const bad = slugProblem(next.slug);
    if (bad) return setHint({ text: bad, error: true });
    const i = rows.findIndex((r) => !r.title.trim() || urlProblem(r.url.trim()));
    if (i >= 0) return setHint({ text: `第 ${i + 1} 個連結：${rows[i].title.trim() ? urlProblem(rows[i].url.trim()) : "按鈕文字要填。"}`, error: true });
    setBusy(true);
    try {
      await api.saveSmartLink(brand.id, next, rows.map((r) => ({ ...(r.id ? { id: r.id } : {}), title: r.title.trim(), url: r.url.trim(), active: r.active })));
      await load();
      setHint({ text: next.published ? "已儲存，公開頁已更新。" : "已儲存。這頁目前不公開。" });
    } catch (e) {
      setHint({ text: e instanceof ApiError ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!saved) return setHint({ text: "先儲存，才有可以複製的連結。", error: true });
    try {
      await navigator.clipboard.writeText(`${base}${saved}`);
      setHint({ text: `已複製 ${base}${saved}` });
    } catch {
      setHint({ text: `請手動複製：${base}${saved}`, error: true });
    }
  }

  const shown = rows.filter((r) => r.active);
  const total = rows.reduce((a, r) => a + r.clicks, 0);
  const host = base.replace(/^https?:\/\//, "");
  return (
    <section className="sm-panel sm-sl" aria-label="智慧連結">
      <div className="sm-ptop sm-sl-top">
        <h2>智慧連結</h2>
        <span className="sm-muted sm-note">放在個人簡介的一個連結。打開是一頁，列出官網、報名表和各平台。</span>
        <span className="sm-r sm-sl-acts">
          <label className="sm-sl-url"><span className="sm-muted">{host}</span>
            <input type="text" value={draft.slug} disabled={!canWrite} aria-label="網址最後的名字" placeholder="例如 soulful"
              onChange={(e) => edit({ slug: e.target.value.toLowerCase().replace(/\s+/g, "") })} /></label>
          <button type="button" onClick={copy}><Icon name="copy" />複製連結</button>
          <span className="sm-seg" role="group" aria-label="發布">
            <button type="button" className={draft.published ? "sm-on" : ""} aria-pressed={draft.published} disabled={!canWrite || busy}
              onClick={() => { const n = { ...draft, published: true }; setDraft(n); void save(n); }}>發布中</button>
            <button type="button" className={draft.published ? "" : "sm-on"} aria-pressed={!draft.published} disabled={!canWrite || busy}
              onClick={() => { const n = { ...draft, published: false }; setDraft(n); void save(n); }}>先不發布</button>
          </span>
          {canWrite && <button type="button" className="btn-primary" disabled={!dirty || busy} onClick={() => void save()}>儲存</button>}
        </span>
      </div>
      <div className="sm-sl-grid">
        <div className="sm-sl-form">
          {!canWrite && <p className="sm-muted">你的角色只能查看，不能修改這一頁。</p>}
          <div className="sm-sl-row">
            <label className="sm-sl-f1"><span className="sm-muted">頁面標題</span>
              <input type="text" value={draft.title} maxLength={120} disabled={!canWrite} onChange={(e) => edit({ title: e.target.value })} /></label>
            <label className="sm-sl-f2"><span className="sm-muted">一句介紹</span>
              <input type="text" value={draft.bio} maxLength={300} disabled={!canWrite} placeholder="例如：用畫畫說出說不出口的事" onChange={(e) => edit({ bio: e.target.value })} /></label>
            <div><span className="sm-muted">按鈕顏色</span>
              <span className="sm-sl-sws">{COLOURS.map((k) => (
                <button key={k} type="button" className={`sm-sl-sw ${draft.colour === k ? "sm-on" : ""}`} style={{ background: `var(${TAG_TOKEN[k]})` }}
                  aria-label={`按鈕顏色：${COLOUR_NAMES[k]}`} aria-pressed={draft.colour === k} disabled={!canWrite} onClick={() => edit({ colour: k })} />))}</span></div>
          </div>
          <h3 className="sm-muted sm-sl-h">連結（{rows.length} 個，近 28 天共點了 {total} 次）</h3>
          <div className="sm-sl-list">
            {rows.length ? rows.map((r, i) => (
              <div key={r.key} className="sm-sl-item">
                <input type="checkbox" checked={r.active} disabled={!canWrite} aria-label={`顯示「${r.title}」`} onChange={(e) => editRow(r.key, { active: e.target.checked })} />
                <input type="text" value={r.title} maxLength={80} disabled={!canWrite} aria-label="按鈕文字" onChange={(e) => editRow(r.key, { title: e.target.value })} />
                <input type="url" value={r.url} maxLength={2048} disabled={!canWrite} aria-label="網址" onChange={(e) => editRow(r.key, { url: e.target.value })} />
                <span className="sm-muted sm-sl-n">{r.id ? `點了 ${r.clicks} 次` : "還沒儲存"}</span>
                <span className="sm-sl-btns">
                  <button type="button" className="sm-ibtn" aria-label={`把「${r.title}」往上移`} disabled={!canWrite || i === 0} onClick={() => moveUp(i)}><Icon name="up" /></button>
                  <button type="button" className="sm-ibtn" aria-label={`刪除「${r.title}」`} disabled={!canWrite} onClick={() => remove(r.key)}><Icon name="trash" /></button>
                </span>
              </div>)) : <p className="sm-muted">還沒有連結。在下面加第一個。</p>}
          </div>
          {canWrite && (
            <div className="sm-sl-add">
              <input type="text" value={newTitle} maxLength={80} placeholder="按鈕文字，例如：預約" aria-label="新按鈕文字" onChange={(e) => setNewTitle(e.target.value)} />
              <input type="url" value={newUrl} placeholder="https://" aria-label="新網址" onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
              <button type="button" onClick={add}><Icon name="plus" />加連結</button>
            </div>)}
          <p className={`sm-sl-hint ${hint?.error ? "sm-err" : "sm-muted"}`} role="status">{hint?.text ?? (dirty ? "有還沒儲存的修改。" : "")}</p>
        </div>
        <div className="sm-sl-prev">
          <h3 className="sm-muted sm-sl-h">別人打開會看到</h3>
          <div className="sm-sl-phone">
            <LinkPage title={draft.title} bio={draft.bio} colour={draft.colour} items={shown.map((r) => ({ id: r.key, title: r.title }))} />
            {!draft.published && <p className="sm-err sm-sl-closed">先不發布：別人打開會看到「這頁還沒開放」。</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
