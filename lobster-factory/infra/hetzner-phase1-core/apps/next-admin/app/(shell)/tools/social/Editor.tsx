"use client";
// The right panel's editor (mock: #ed). One text for every channel, a channel may have its own; meters per channel
// (lib/social/limits.ts, the server's own rule); first comment, link + UTM, alt text, saved texts, format; preview per
// channel on phone / desktop (lib/social/compose.ts builds the same text the sender sends); time + the four actions.
// What can change follows the server: content only in the editable states and never after a channel went out (0098);
// who may do what is lib/social/state.ts RULES (the buttons only mirror it; the server decides).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { overLimit, BODY_LIMITS, bodyLength } from "@/lib/social/limits";
import { withUtm } from "@/lib/social/compose";
import type { PostState } from "@/lib/social/state";
import { api, ApiError, type ListRow, type MediaItem, type PostInput, type SavedRef, type StateInput } from "./api";
import { PfMark, stateStyle } from "./Calendar";
import { formatsOf, instantAt, platformOf, shortDate, STATE_NAMES, targetProblems, zoned, type Account, type Brand, type Post } from "./model";

const MAX_UPLOAD = 10 * 1024 * 1024;   // uploadMedia's cap (lib/content/postiz.ts)

export interface EditorProps {
  brand: Brand;
  accounts: Account[];
  media: MediaItem[];
  post: Post | null;
  defaults: { date: string; time: string };
  today: string;
  /** the brand's rotation lists (C7): the time row can hand the post to one instead of a fixed time */
  lists?: ListRow[];
  /** the reviewer's approve / reject bar (C8) */
  reviewBar?: ReactNode;
  /** a WordPress article this post starts from (C10) */
  source?: ReactNode;
  onSaved: (id: string, message: string) => void;
  onMediaAdded: (m: MediaItem) => void;
  /** C10: text, link, channel texts and media from a WordPress article; applied when n changes */
  prefill?: import("./ArticleSource").Prefill | null;
  /** C9: a library item to attach (n changes on every click, so the same item twice attaches once and says so) */
  attach?: { id: string; n: number } | null;
  onOpenLibrary?: () => void;
}

function message(e: unknown): string {
  if (e instanceof ApiError) {
    const over = (e.detail as { overLimit?: Array<{ platform: string; length: number; limit: number }> } | undefined)?.overLimit;
    if (over?.length) return over.map((o) => `${platformOf(o.platform).name} ${o.length}／${o.limit} 字，太長了`).join("；");
    if (e.status === 409) return `${e.message}（重新整理後再試）`;
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

export default function Editor(props: EditorProps) {
  const { brand, accounts, post } = props;
  const tz = brand.default_timezone;
  const canWrite = brand.role === "owner" || brand.role === "editor";
  const state: PostState = post?.state ?? "draft";
  const sentIds = new Set((post?.targets ?? []).filter((t) => t.state === "queued" || t.state === "published").map((t) => t.account_id));
  const sent = sentIds.size > 0;
  const contentLocked = !canWrite || state === "queued" || state === "published" || state === "deleted" || sent;

  const [picked, setPicked] = useState<string[]>(() => post ? post.targets.map((t) => t.account_id) : accounts.filter((a) => a.status === "connected").map((a) => a.id));
  const [body, setBody] = useState(post?.body ?? "");
  const [custom, setCustom] = useState<Record<string, string>>(() => Object.fromEntries((post?.targets ?? []).filter((t) => t.custom_body != null).map((t) => [t.account_id, t.custom_body as string])));
  const [formats, setFormats] = useState<Record<string, string>>(() => Object.fromEntries((post?.targets ?? []).map((t) => [t.account_id, t.format])));
  const [fc, setFc] = useState(post?.first_comment ?? "");
  const [link, setLink] = useState(post?.link_url ?? "");
  const [utm, setUtm] = useState(post?.link_utm ?? false);
  const [notes, setNotes] = useState(post?.notes ?? "");
  const [mediaList, setMediaList] = useState(() => [...(post?.media ?? [])].sort((a, b) => a.position - b.position).map((m) => ({ media_id: m.media_id, alt_text: m.alt_text })));
  const [open, setOpen] = useState<Record<string, boolean>>({ fc: !!post?.first_comment, link: !!post?.link_url, alt: !!post?.media.some((m) => m.alt_text), texts: false });
  const scheduledParts = post?.scheduled_at ? zoned(post.scheduled_at, tz) : null;
  const [date, setDate] = useState(scheduledParts?.date ?? props.defaults.date);
  const [time, setTime] = useState(scheduledParts?.time ?? props.defaults.time);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [mode, setMode] = useState<"fixed" | "rot">(post?.state === "rotation" ? "rot" : "fixed");
  const [listId, setListId] = useState<string | null>(post?.list_id ?? props.lists?.[0]?.id ?? null);
  const [device, setDevice] = useState<"phone" | "desktop">("phone");
  const [confirmNow, setConfirmNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<{ text: string; error?: boolean } | null>(null);
  const [texts, setTexts] = useState<Array<{ id: string; body: string }> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickTouched = useRef(false);
  const lastAttach = useRef(props.attach?.n ?? 0);
  const lastPrefill = useRef(0);
  const [sourceUrl, setSourceUrl] = useState<string | null>(post?.source_url ?? null);
  // a new post opened before the brand's channels arrived: take the connected ones once they do, unless someone chose
  useEffect(() => {
    if (!post && !pickTouched.current && accounts.length) setPicked(accounts.filter((a) => a.status === "connected").map((a) => a.id));
  }, [post, accounts]);

  const pickedAccounts = useMemo(() => picked.map((id) => accounts.find((a) => a.id === id)).filter((a): a is Account => !!a), [picked, accounts]);
  const preview = pickedAccounts.find((a) => a.id === previewId) ?? pickedAccounts[0] ?? null;
  const textFor = (a: Account) => {
    let t = custom[a.id] ?? body;
    if (link.trim()) {
      const l = utm ? (() => { try { return withUtm(link.trim(), a.platform); } catch { return link.trim(); } })() : link.trim();
      t = t.includes(link.trim()) ? t.split(link.trim()).join(l) : t.trim() ? `${t}\n\n${l}` : l;
    }
    return t;
  };
  const problems = overLimit("", pickedAccounts.map((a) => ({ accountId: a.id, platform: a.platform, customBody: textFor(a) })));

  useEffect(() => {
    if (open.texts && texts === null) api.texts(brand.id).then((r) => setTexts(r.texts)).catch((e) => setHint({ text: message(e), error: true }));
  }, [open.texts, texts, brand.id]);

  const say = (text: string, error = false) => setHint({ text, error });

  useEffect(() => {
    const p = props.prefill;
    if (!p || p.n === lastPrefill.current) return;
    lastPrefill.current = p.n;
    setBody(p.body);
    setLink(p.link);
    setOpen((o) => ({ ...o, link: !!p.link }));
    setSourceUrl(p.sourceUrl);
    setCustom(p.custom);
    setMediaList(p.mediaIds.map((id) => ({ media_id: id, alt_text: null })));
  }, [props.prefill]);

  useEffect(() => {
    const a = props.attach;
    if (!a || a.n === lastAttach.current) return;
    lastAttach.current = a.n;
    setMediaList((l) => (l.some((m) => m.media_id === a.id) ? l : [...l, { media_id: a.id, alt_text: null }]));
  }, [props.attach]);

  function input(): PostInput {
    const fields: PostInput["fields"] = { notes: notes.trim() || null };
    if (!contentLocked) Object.assign(fields, { body, first_comment: fc.trim() || null, link_url: link.trim() || null, link_utm: utm, source_url: sourceUrl });
    return {
      fields,
      targets: picked.map((id) => {
        const a = accounts.find((x) => x.id === id);
        return { account_id: id, custom_body: custom[id] ?? null, format: formats[id] ?? (a ? formatsOf(a.platform)[0].key : "post") };
      }),
      media: mediaList.map((m) => ({ media_id: m.media_id, alt_text: m.alt_text?.trim() || null })),
    };
  }

  async function saveContent(version = post?.version ?? 0, stateNow: PostState = state): Promise<SavedRef> {
    if (!post) return (await api.create(brand.id, input())).post;
    if (stateNow === "queued" || stateNow === "published") return { id: post.id, version };   // nothing of its content may change
    const i = input();
    if (contentLocked) delete i.media;   // sent: the media set stays as it went out
    return (await api.save(brand.id, post.id, version, i)).post;
  }

  async function act(kind: "draft" | "review" | "schedule" | "now") {
    if (!pickedAccounts.length) return say("先勾選要發到哪些帳號。", true);
    if (!contentLocked && !body.trim() && !mediaList.length && !pickedAccounts.every((a) => custom[a.id]?.trim())) return say("貼文還是空的。", true);
    if (problems.length) return say(problems.map((p) => `${platformOf(p.platform).name} 超過字數上限（${p.length}／${p.limit}）`).join("；"), true);
    const toList = kind === "schedule" && mode === "rot";
    if (toList && !listId) return say("還沒有輪播清單，先到「輪播」建一個。", true);
    let when: string | null = null;
    if (kind === "schedule" && !toList) {
      if (!date || !time) return say("先選日期和時間。", true);
      when = instantAt(date, time, tz);
      if (Date.parse(when) <= Date.now()) return say("排程時間要在未來。要現在發，按「立即發佈」。", true);
    }
    setBusy(true);
    setHint(null);
    try {
      const live = state === "scheduled" || state === "queued";
      let ref: SavedRef;
      const step = async (s: StateInput) => { ref = (await api.setState(brand.id, ref.id, ref.version, s)).post; };
      if (post && live && (kind === "draft" || kind === "review")) {
        // taken off the schedule first, then edited: with review on, an approved post's content is refused while it is
        // scheduled (review 2026-10-15), and a draft or a submission is what these two buttons ask for anyway
        ref = { id: post.id, version: post.version };
        await step({ action: "unschedule" });
        ref = await saveContent(ref.version, "draft");
      } else {
        ref = await saveContent();
      }
      if (kind === "draft") {
        props.onSaved(ref.id, live ? "已取消排程，存成草稿。" : "已存起來。");
      } else if (kind === "review") {
        await step({ action: "submit" });
        props.onSaved(ref.id, "已送審，審核的人核准後才會排程。");
      } else if (toList) {
        if (state === "rotation" && post?.list_id === listId) {
          props.onSaved(ref.id, "已存起來（還在清單裡）。");
          return;
        }
        if (state === "rotation") await step({ action: "from_rotation" });
        else if (live) await step({ action: "unschedule" });   // (only "加入清單" reaches here for a live post)
        const { items } = await api.list(brand.id, listId as string);
        const position = items.length ? Math.max(...items.map((x) => x.list_position ?? 0)) + 1 : 0;
        await step({ action: "to_rotation", listId: listId as string, listPosition: position });
        props.onSaved(ref.id, `已加到「${props.lists?.find((l) => l.id === listId)?.name ?? "清單"}」最後。`);
      } else if (kind === "schedule") {
        await step({ action: "schedule", scheduledAt: when as string });
        const z = zoned(when as string, tz);
        props.onSaved(ref.id, `已排在 ${shortDate(z.date)} ${z.time}。`);
      } else {
        await step({ action: "publish_now", confirmPublishNow: true });
        props.onSaved(ref.id, "已交出去，幾分鐘內會看到結果。");
      }
    } catch (e) {
      say(message(e), true);
    } finally {
      setBusy(false);
      setConfirmNow(false);
    }
  }

  async function copyAsNew() {
    if (!post) return;
    setBusy(true);
    try {
      const ref = (await api.create(brand.id, {
        fields: { body: post.body, first_comment: post.first_comment, link_url: post.link_url, link_utm: post.link_utm, notes: post.notes },
        targets: post.targets.map((t) => ({ account_id: t.account_id, custom_body: t.custom_body, format: t.format })),
        media: [...post.media].sort((a, b) => a.position - b.position).map((m) => ({ media_id: m.media_id, alt_text: m.alt_text })),
      })).post;
      props.onSaved(ref.id, "已複製成新草稿。");
    } catch (e) {
      say(message(e), true);
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    if (file.size > MAX_UPLOAD) return say("圖片超過 10 MB。", true);
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      const name = file.name.replace(/[^\w.\- ]/g, "_").slice(0, 200) || "image.webp";
      const { media } = await api.upload(brand.id, dataUrl, name);
      props.onMediaAdded(media);
      setMediaList((l) => [...l, { media_id: media.id, alt_text: null }]);
    } catch (e) {
      say(message(e), true);
    } finally {
      setBusy(false);
    }
  }

  const mediaPath = (id: string) => props.media.find((m) => m.id === id)?.postiz_path ?? null;
  const togglePick = (id: string) => {
    pickTouched.current = true;
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };
  const readOnly = !canWrite || state === "published" || state === "deleted";
  const can = {
    draft: canWrite && (["draft", "review", "scheduled", "queued", "rotation"].includes(state) || !post),
    review: canWrite && (["draft", "scheduled", "queued"].includes(state) || !post),
    schedule: canWrite && (["draft", "scheduled", "queued", "error"].includes(state) || (state === "rotation" && mode === "rot") || !post),
    now: brand.role === "owner" && (["draft", "scheduled", "queued", "error"].includes(state) || !post),
  };
  const notices = [
    ...(post ? targetProblems(post, accounts) : []),
    ...(state === "queued" ? ["這則已交給 Postiz 等時間到。可以改時間或取消排程，內容要先取消排程才能改。"] : []),
    ...(sent && state !== "published" ? ["已有頻道發出了，共用的文字和媒體不能再改；其他頻道可以另寫文字。"] : []),
    ...(state === "review" && brand.role !== "reviewer" ? ["等審核人核准。核准後會照排定時間發。"] : []),
  ];

  return (
    <div className="sm-ed">
      <div className="sm-top">
        <div className="sm-row"><span className="sm-lab">發到</span>
          {accounts.length === 0 && <span className="sm-muted">這個品牌還沒有社群帳號，先到「設定」連接。</span>}
          {accounts.map((a) => {
            const on = picked.includes(a.id);
            const lockedTarget = sentIds.has(a.id) || state === "queued";
            return (
              <button type="button" key={a.id} className={`sm-acct${on ? " sm-on" : ""}`} disabled={readOnly || !!lockedTarget || (a.status !== "connected" && !on)}
                title={a.status === "connected" ? a.label : "這個帳號的授權失效了，到設定重新連接"} onClick={() => togglePick(a.id)}>
                <PfMark platform={a.platform} /><span>{platformOf(a.platform).name}</span><small>{a.status === "connected" ? a.label : "連線失效，要重新連接"}</small>
              </button>
            );
          })}
        </div>
        {props.source}
      </div>

      <div className="sm-two">
        <div className="sm-write">
          <textarea aria-label="貼文內容" placeholder="寫一份文字，所有勾選的帳號都用這份。" value={preview && custom[preview.id] != null ? custom[preview.id] : body} readOnly={readOnly || (contentLocked && !(preview && custom[preview.id] != null && !sentIds.has(preview.id) && state !== "queued"))}
            onChange={(e) => { if (preview && custom[preview.id] != null) setCustom((c) => ({ ...c, [preview.id]: e.target.value })); else setBody(e.target.value); }} />
          <div className="sm-meters">
            {pickedAccounts.length ? pickedAccounts.map((a) => {
              const limit = BODY_LIMITS[a.platform];
              const n = bodyLength(a.platform, textFor(a));
              return <span key={a.id} className={limit && n > limit ? "sm-over" : ""}>{platformOf(a.platform).name} <b>{n}</b>{limit ? `／${limit.toLocaleString()}` : ""}{a.platform === "threads" ? " 位元組" : ""}</span>;
            }) : <span>先在上面勾選要發到哪些帳號。</span>}
          </div>
          <div className="sm-row sm-chips">
            {([["fc", "第一則留言"], ["link", "連結與 UTM"], ["alt", "替代文字"], ["texts", "常用文字"]] as const).map(([k, label]) => (
              <button type="button" key={k} className={open[k] ? "sm-on" : ""} onClick={() => setOpen((o) => ({ ...o, [k]: !o[k] }))}>{label}</button>
            ))}
          </div>
          {open.fc && <div className="sm-row"><span className="sm-lab">第一則留言</span><input type="text" aria-label="第一則留言" placeholder="貼文發出後，用自己的帳號留的第一則留言" style={{ flex: 1, minWidth: 0 }} value={fc} readOnly={contentLocked} onChange={(e) => setFc(e.target.value)} /></div>}
          {open.link && (
            <div className="sm-row"><span className="sm-lab">連結</span>
              <input type="url" aria-label="連結" placeholder="https://" style={{ flex: 1, minWidth: 0 }} value={link} readOnly={contentLocked} onChange={(e) => setLink(e.target.value)} />
              <span className="sm-chips"><button type="button" className={utm ? "sm-on" : ""} disabled={contentLocked} onClick={() => setUtm((u) => !u)}>加 UTM</button></span>
              {utm && link && <span className="sm-muted">帶 utm_source=各平台名、utm_medium=social</span>}
            </div>
          )}
          {open.alt && mediaList.map((m, i) => (
            <div className="sm-row" key={m.media_id}><span className="sm-lab">第 {i + 1} 張的替代文字</span>
              <input type="text" aria-label={`第 ${i + 1} 張圖片的替代文字`} placeholder="給看不到圖的人描述這張圖" style={{ flex: 1, minWidth: 0 }} value={m.alt_text ?? ""} readOnly={contentLocked}
                onChange={(e) => setMediaList((l) => l.map((x) => (x.media_id === m.media_id ? { ...x, alt_text: e.target.value } : x)))} />
            </div>
          ))}
          {open.alt && !mediaList.length && <span className="sm-muted">先附一張圖，再寫它的替代文字。</span>}
          {open.texts && (
            <div className="sm-row sm-chips"><span className="sm-lab">常用文字</span>
              {(texts ?? []).map((t) => <button type="button" key={t.id} title={t.body} disabled={contentLocked} onClick={() => setBody((b) => `${b}\n${t.body}`.trim())}>{t.body.slice(0, 12)}</button>)}
              {texts && !texts.length && <span className="sm-muted">還沒有存過。</span>}
              {canWrite && <button type="button" disabled={!body.trim()} onClick={async () => { try { const { text } = await api.addText(brand.id, body); setTexts((t) => [...(t ?? []), text]); say("已存到常用文字。"); } catch (e) { say(message(e), true); } }}>把目前文字存起來</button>}
            </div>
          )}
          {preview && formatsOf(preview.platform).length > 1 && (
            <div className="sm-row sm-chips"><span className="sm-lab">格式</span>
              {formatsOf(preview.platform).map((f) => (
                <button type="button" key={f.key} disabled={readOnly} className={(formats[preview.id] ?? "post") === f.key ? "sm-on" : ""} onClick={() => setFormats((x) => ({ ...x, [preview.id]: f.key }))}>{f.label}</button>
              ))}
              <span className="sm-muted">{platformOf(preview.platform).name}</span>
            </div>
          )}
          {pickedAccounts.length > 1 && (
            <div className="sm-row sm-chips"><span className="sm-lab">某個平台要不同？</span>
              {pickedAccounts.map((a) => (
                <button type="button" key={a.id} disabled={readOnly || sentIds.has(a.id) || state === "queued"} className={custom[a.id] != null ? "sm-on" : ""}
                  onClick={() => { setPreviewId(a.id); setCustom((c) => { const n = { ...c }; if (n[a.id] != null) delete n[a.id]; else n[a.id] = body; return n; }); }}>
                  {platformOf(a.platform).name}{custom[a.id] != null ? "（已另寫）" : ""}
                </button>
              ))}
            </div>
          )}
          {props.reviewBar}
          <div className="sm-row"><span className="sm-lab">媒體</span>
            {mediaList.map((m) => {
              const path = mediaPath(m.media_id);
              return (
                <span key={m.media_id} className="sm-row" style={{ gap: 2 }}>
                  {path ? <img className="sm-thumb" src={path} alt={m.alt_text ?? ""} /> : <span className="sm-thumb">圖</span>}
                  {!contentLocked && <button type="button" aria-label="拿掉這張圖" onClick={() => setMediaList((l) => l.filter((x) => x.media_id !== m.media_id))}>×</button>}
                </span>
              );
            })}
            {!contentLocked && <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>＋ 圖片</button>}
            {!contentLocked && props.onOpenLibrary && <button type="button" onClick={props.onOpenLibrary}>從媒體庫</button>}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
          </div>
          <input type="text" aria-label="備註" placeholder="備註（給團隊看，不會發出去）" value={notes} readOnly={!canWrite || readOnly} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="sm-prev">
          <div className="sm-row"><span className="sm-lab">預覽</span>
            <span className="sm-chips">{pickedAccounts.map((a) => <button type="button" key={a.id} className={preview?.id === a.id ? "sm-on" : ""} onClick={() => setPreviewId(a.id)}>{platformOf(a.platform).name}</button>)}</span>
            <span className="sm-chips" style={{ marginLeft: "auto" }}>
              <button type="button" className={device === "phone" ? "sm-on" : ""} onClick={() => setDevice("phone")}>手機</button>
              <button type="button" className={device === "desktop" ? "sm-on" : ""} onClick={() => setDevice("desktop")}>電腦</button>
            </span>
          </div>
          <div className="sm-frame">
            <div className={`sm-card${device === "desktop" ? " sm-wide" : ""}`}>
              <div className="sm-who"><span className="sm-av" /><b>{preview?.label ?? brand.name}</b><span className="sm-muted">{preview ? platformOf(preview.platform).name : "（還沒選帳號）"}</span></div>
              {mediaList[0] && mediaPath(mediaList[0].media_id) && <img className="sm-img" src={mediaPath(mediaList[0].media_id) as string} alt={mediaList[0].alt_text ?? ""} />}
              <div className="sm-txt">{(preview ? textFor(preview) : body) || "（貼文文字會出現在這裡）"}</div>
              {fc.trim() && <div className="sm-more">第一則留言：{fc}</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="sm-foot">
        <div className="sm-when">
          <span className="sm-state" style={stateStyle(state)}><span className="sm-dot" />{post ? STATE_NAMES[state] : "新貼文（還沒存）"}</span>
          {props.lists && !readOnly && (
            <span className="sm-chips">
              <button type="button" className={mode === "fixed" ? "sm-on" : ""} onClick={() => setMode("fixed")}>固定時間</button>
              <button type="button" className={mode === "rot" ? "sm-on" : ""} onClick={() => setMode("rot")}>加入輪播</button>
            </span>
          )}
          {mode === "fixed" ? (
            <span className="sm-chips">
              <input type="date" aria-label="發文日期" value={date} min={props.today} disabled={readOnly} onChange={(e) => setDate(e.target.value)} />
              <input type="time" aria-label="發文時間" value={time} disabled={readOnly} onChange={(e) => setTime(e.target.value)} />
              <span className="sm-muted">{tz}</span>
            </span>
          ) : (
            <span className="sm-chips">
              {(props.lists ?? []).map((l) => (
                <button type="button" key={l.id} className={listId === l.id ? "sm-on" : ""} disabled={readOnly} onClick={() => setListId(l.id)}>{l.name}{l.active ? "" : "（已暫停）"}</button>
              ))}
              {!props.lists?.length && <span className="sm-muted">還沒有清單，先到「輪播」建一個。</span>}
            </span>
          )}
        </div>
        <div className="sm-hint">
          {hint && <span className={hint.error ? "sm-err" : "sm-muted"}>{hint.text}　</span>}
          {notices.map((n) => <span key={n} className="sm-err">{n}　</span>)}
          {state === "published" && post && (
            <span className="sm-muted">已發佈的貼文不能改。
              {post.targets.filter((t) => t.release_url).map((t) => {
                const a = accounts.find((x) => x.id === t.account_id);
                return <a key={t.id} href={t.release_url as string} target="_blank" rel="noopener noreferrer">在 {a ? platformOf(a.platform).name : "平台"} 上看　</a>;
              })}
              {canWrite && <button type="button" disabled={busy} onClick={copyAsNew}>複製成新貼文</button>}
            </span>
          )}
        </div>
        {!readOnly && (
          <div className="sm-acts">
            <button type="button" disabled={busy || !can.draft} onClick={() => act("draft")}>存草稿</button>
            <button type="button" disabled={busy || !can.review} onClick={() => act("review")}>送審</button>
            <button type="button" className="btn-primary" disabled={busy || !can.schedule} onClick={() => act("schedule")}>{mode === "rot" ? "加入清單" : "排程"}</button>
            <button type="button" disabled={busy || !can.now} title={can.now ? "" : "只有擁有者可以立即發佈"} onClick={() => setConfirmNow(true)}>立即發佈</button>
          </div>
        )}
        {confirmNow && (
          <div className="sm-confirm">
            <span>會馬上發到所有勾選的帳號。發出去之後，這裡收不回來，要到各平台自己刪。</span>
            <button type="button" className="sm-danger" disabled={busy} onClick={() => act("now")}>確定發佈</button>
            <button type="button" onClick={() => setConfirmNow(false)}>取消</button>
          </div>
        )}
      </div>
    </div>
  );
}
