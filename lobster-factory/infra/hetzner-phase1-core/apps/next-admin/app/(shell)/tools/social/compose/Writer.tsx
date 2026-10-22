"use client";
// 撰寫: tabs (共用 + one per channel), the text box with its media row and tool row, and the panels the tools open
// (mock .etabs / .box / #xtras). A channel tab shows the shared text read-only until 「另外寫一份」 gives it its own.
import { useRef, type ReactNode } from "react";
import { TEXT_RATES, TWD_RATE } from "@/lib/ai/cost-model";
import { BODY_LIMITS, bodyLength } from "@/lib/social/limits";
import { PfMark } from "../Calendar";
import { platformOf, type Account } from "../model";
import CIcon from "./icons";

export type Extra = "link" | "alt" | "texts" | "ai" | "emoji" | "notes";
const EXTRAS: Array<{ key: Extra; label: string; icon: Parameters<typeof CIcon>[0]["name"] }> = [
  { key: "link", label: "連結與 UTM", icon: "link" }, { key: "alt", label: "替代文字", icon: "eye" }, { key: "texts", label: "常用文字", icon: "lines" },
  { key: "ai", label: "AI 幫我寫", icon: "spark" }, { key: "emoji", label: "表情符號", icon: "smile" }, { key: "notes", label: "備註", icon: "note" },
];
const EMOJI = ["🎨", "🖍️", "🌈", "💛", "✨", "🌿", "🙂", "👉"];
// one rewrite of a post: about 1,000 tokens in and 400 out on Haiku (lib/ai/cost-model.ts rates)
const AI_RATE = TEXT_RATES["claude-haiku-5-5"];
const AI_NTD = Math.max(1, Math.round(((1000 * AI_RATE.inputPerM + 400 * AI_RATE.outputPerM) / 1e6) * TWD_RATE * 10) / 10);

export interface WriterProps {
  channels: Account[]; tab: string; onTab: (t: string) => void;
  body: string; custom: Record<string, string>; onText: (v: string) => void; onOwn: (id: string, own: boolean) => void;
  link: string; onLink: (v: string) => void; utm: boolean; onUtm: (v: boolean) => void; notes: string; onNotes: (v: string) => void;
  media: Array<{ media_id: string; alt_text: string | null }>; mediaPath: (id: string) => string | null; mediaKind: (id: string) => string | null;
  onAlt: (id: string, alt: string) => void; onRemoveMedia: (id: string) => void; onMoveMedia: (id: string, delta: -1 | 1) => void; onPickFile: () => void; cropOnUpload: boolean; onCropUpload: (on: boolean) => void; onOpenLibrary?: () => void;
  open: ReadonlySet<Extra>; onOpen: (k: Extra) => void; onAddComment: () => void;
  texts: Array<{ id: string; body: string }> | null; onSaveText: () => void;
  textFor: (a: Account) => string;
  /** shared text and media may change / this channel's own text may change / anything may change (notes too) */
  sharedEditable: boolean; channelEditable: (id: string) => boolean; writable: boolean;
  above?: ReactNode;
  /** comments, formats, this post's auto-reply: in the same scrolling column */
  below?: ReactNode;
}

export default function Writer(p: WriterProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const ch = p.tab === "all" ? null : p.channels.find((a) => a.id === p.tab) ?? null;
  const own = !!ch && p.custom[ch.id] != null;
  const editable = ch ? own && p.channelEditable(ch.id) : p.sharedEditable;
  const insert = (t: string, inline = false) => {
    const el = ref.current;
    if (!el || !editable) return;
    const v = el.value;
    p.onText(inline ? v.slice(0, el.selectionStart) + t + v.slice(el.selectionEnd) : `${v}\n${t}`.trim());
  };
  // the counter: the tightest channel of the tab (共用 = every channel; it says so)
  const counted = (ch ? [ch] : p.channels).filter((a) => BODY_LIMITS[a.platform]);
  const tight = counted.reduce<{ a: Account; n: number; max: number } | null>((best, a) => {
    const n = bodyLength(a.platform, p.textFor(a)), max = BODY_LIMITS[a.platform];
    return !best || n / max > best.n / best.max ? { a, n, max } : best;
  }, null);
  const over = (a: Account) => !!BODY_LIMITS[a.platform] && bodyLength(a.platform, p.textFor(a)) > BODY_LIMITS[a.platform];

  return (
    <>
      <div className="sm-etabs" role="tablist" aria-label="文字給哪個頻道">
        <button type="button" role="tab" aria-selected={p.tab === "all"} className={p.tab === "all" ? "sm-on" : ""} onClick={() => p.onTab("all")}><CIcon name="globe" />共用</button>
        {p.channels.map((a) => (
          <button type="button" role="tab" key={a.id} aria-selected={p.tab === a.id} className={p.tab === a.id ? "sm-on" : ""} onClick={() => p.onTab(a.id)}
            title={p.custom[a.id] != null ? "這個頻道另外寫了一份" : "這個頻道用共用文字"}>
            <PfMark platform={a.platform} />{a.label}{p.custom[a.id] != null && <i className="sm-cdot" aria-label="另外寫了一份" />}{over(a) && <i className="sm-cwarn" title="超過字數上限">!</i>}
          </button>
        ))}
      </div>
      <div className="sm-wscroll">
        {p.above}
        {ch && (
          <div className="sm-lockbar"><PfMark platform={ch.platform} />
            <span>{own ? `${ch.label} 用自己的一份文字。` : `${ch.label} 現在用共用文字。`}</span>
            {p.channelEditable(ch.id) && <button type="button" className="sm-lnk" onClick={() => p.onOwn(ch.id, !own)}>{own ? "改回共用文字" : "另外寫一份"}</button>}
          </div>
        )}
        <div className="sm-box">
          <textarea ref={ref} aria-label="貼文內容" value={ch ? (own ? p.custom[ch.id] : p.body) : p.body} readOnly={!editable}
            placeholder={ch ? "" : "寫一份文字，選的頻道都用這份。某個頻道要不同，點上面它的名字另外寫。"} onChange={(e) => p.onText(e.target.value)} />
          {(p.media.length > 0 || p.sharedEditable) && (
            <div className="sm-mrow">
              {p.media.map((m, i) => {
                const path = p.mediaPath(m.media_id);
                return (
                  <span key={m.media_id} className="sm-mt" title={`第 ${i + 1} 張`}>
                    {path ? p.mediaKind(m.media_id) === "video" ? <video src={path} muted preload="metadata" /> : <img src={path} alt={m.alt_text ?? ""} /> : <span>{p.mediaKind(m.media_id) === "video" ? "影片" : "圖"}</span>}
                    {p.sharedEditable && <span className="sm-morder"><button type="button" aria-label={`第 ${i + 1} 張往前`} disabled={i === 0} onClick={() => p.onMoveMedia(m.media_id, -1)}>↑</button><button type="button" aria-label={`第 ${i + 1} 張往後`} disabled={i === p.media.length - 1} onClick={() => p.onMoveMedia(m.media_id, 1)}>↓</button></span>}
                    {p.sharedEditable && <button type="button" className="sm-x" aria-label={`移除第 ${i + 1} 張`} onClick={() => p.onRemoveMedia(m.media_id)}><CIcon name="x" /></button>}
                  </span>
                );
              })}
              {p.sharedEditable && <button type="button" className="sm-madd" aria-label="從電腦加圖片或影片" title="從電腦加圖片或影片" onClick={p.onPickFile}><CIcon name="plus" /></button>}
              {p.sharedEditable && <label className="sm-ck"><input type="checkbox" checked={p.cropOnUpload} onChange={(e) => p.onCropUpload(e.target.checked)} />圖片裁成方形</label>}
              {p.sharedEditable && p.onOpenLibrary && <button type="button" className="sm-lnk" onClick={p.onOpenLibrary}>從媒體庫選</button>}
            </div>
          )}
          <div className="sm-tools">
            <button type="button" className="sm-ibtn" title="新增留言" aria-label="新增留言" disabled={!p.sharedEditable} onClick={p.onAddComment}><CIcon name="comment" /></button>
            {EXTRAS.map((x) => (
              <button type="button" key={x.key} className={`sm-ibtn${p.open.has(x.key) ? " sm-act" : ""}`} title={x.label} aria-label={x.label} aria-pressed={p.open.has(x.key)}
                disabled={!p.writable} onClick={() => p.onOpen(x.key)}><CIcon name={x.icon} /></button>
            ))}
            <button type="button" className="sm-ibtn" title="加圖片或影片" aria-label="加圖片或影片" disabled={!p.sharedEditable} onClick={p.onPickFile}><CIcon name="image" /></button>
            {tight && (
              <span className={`sm-cnt${tight.n > tight.max ? " sm-over" : ""}`} title={`${platformOf(tight.a.platform).name} 字數${!ch && counted.length > 1 ? "（顯示上限最緊的那個）" : ""}`}>
                <PfMark platform={tight.a.platform} /> {tight.n}／{tight.max.toLocaleString()}{tight.a.platform === "threads" ? " 位元組" : ""}
              </span>
            )}
          </div>
        </div>
        {EXTRAS.filter((x) => p.open.has(x.key)).map((x) => (
          <div className="sm-xtra" key={x.key}>
            <div className="sm-xh"><CIcon name={x.icon} />{x.label}<button type="button" className="sm-ibtn" aria-label={`收起${x.label}`} onClick={() => p.onOpen(x.key)}><CIcon name="x" /></button></div>
            <div className="sm-xb">
              {x.key === "link" && <>
                <input type="url" aria-label="連結" placeholder="https://" value={p.link} readOnly={!p.sharedEditable} onChange={(e) => p.onLink(e.target.value)} />
                <label className="sm-ck"><input type="checkbox" checked={p.utm} disabled={!p.sharedEditable} onChange={(e) => p.onUtm(e.target.checked)} />加 UTM</label>
                {p.link.trim() && <span className="sm-muted">{p.utm ? "發出時每個平台帶自己的 utm_source，utm_medium=social。" : "連結會接在文字後面發出。"}</span>}
              </>}
              {x.key === "alt" && (p.media.length ? p.media.map((m, i) => (
                <input key={m.media_id} type="text" aria-label={`第 ${i + 1} 張的替代文字`} placeholder={`給看不到圖的人描述第 ${i + 1} 張圖`} value={m.alt_text ?? ""}
                  readOnly={!p.sharedEditable} onChange={(e) => p.onAlt(m.media_id, e.target.value)} />
              )) : <span className="sm-muted">先加一張圖片。</span>)}
              {x.key === "texts" && <>
                {(p.texts ?? []).map((t) => <button type="button" key={t.id} title={t.body} disabled={!editable} onClick={() => insert(t.body)}>{t.body.slice(0, 12)}{t.body.length > 12 ? "…" : ""}</button>)}
                {p.texts && !p.texts.length && <span className="sm-muted">還沒有存過。</span>}
                {p.texts === null && <span className="sm-muted">載入中…</span>}
                <button type="button" className="sm-lnk" disabled={!p.body.trim()} onClick={p.onSaveText}>把目前文字存起來</button>
              </>}
              {x.key === "ai" && <>
                <button type="button" disabled title="AI 改寫還沒開放">改短一點</button>
                <button type="button" disabled title="AI 改寫還沒開放">口氣溫暖一點</button>
                <span className="sm-muted">每次約 NT${AI_NTD}，按了才花。這個功能還沒開放。</span>
              </>}
              {x.key === "emoji" && EMOJI.map((e) => <button type="button" key={e} className="sm-ibtn" aria-label={`加 ${e}`} disabled={!editable} onClick={() => insert(e, true)}>{e}</button>)}
              {x.key === "notes" && <input type="text" aria-label="備註" placeholder="給團隊看，不會發出去" value={p.notes} readOnly={!p.writable} onChange={(e) => p.onNotes(e.target.value)} />}
            </div>
          </div>
        ))}
        {p.below}
      </div>
    </>
  );
}
