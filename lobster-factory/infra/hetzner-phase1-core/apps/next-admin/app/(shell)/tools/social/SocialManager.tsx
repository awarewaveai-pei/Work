"use client";
// /tools/social -- the social manager (SOCIAL_MANAGER_PLAN.md C6; spec = lobster-factory/docs/social/mockups/
// social-manager-mock.html). One screen: header (brand), left = calendar / list / side views, right = the editor.
// Every read and write goes through /api/social (C4); this file holds only what is on screen.
// Side views by card: 輪播 C7 (Lists), 媒體 C9 (MediaView), 紀錄 C11 (LogView), 團隊與審核 C8, 文章 C10.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PostState } from "@/lib/social/state";
import { api, ApiError, type MediaItem, type WpPost } from "./api";
import ArticleSource, { type Prefill } from "./ArticleSource";
import { ReviewBar } from "./Review";
import { ListView, MonthView, stateStyle, WeekView } from "./Calendar";
import { useLists } from "./Lists";
import Editor from "./Editor";
import Settings from "./Settings";
import { addDays, cannotWriteNotice, instantAt, mondayOf, monthGridStart, monthStart, platformOf, ROLE_NAMES, shortDate, STATE_NAMES, zoned, type Account, type Brand, type Post } from "./model";
import "./social.css";

export type View = "week" | "month" | "list" | "lists" | "media" | "log" | "settings";
const VIEWS: Array<[View, string]> = [["week", "週"], ["month", "月"], ["list", "清單"], ["lists", "輪播"], ["media", "媒體"], ["log", "紀錄"], ["settings", "設定"]];
const FILTER_STATES: PostState[] = ["draft", "review", "scheduled", "queued", "published", "error", "rotation"];

export type Selection = { kind: "post"; id: string } | { kind: "new"; date?: string; time?: string; key: number } | { kind: "list"; id: string | null }
  | { kind: "article"; article: WpPost; key: number } | { kind: "none" };

/** What the later cards plug in; each returns null until its card lands. */
export interface Slots {
  sideView?: (view: View, ctx: SlotContext) => ReactNode;
  rightPanel?: (sel: Selection, ctx: SlotContext) => ReactNode;
  headerExtra?: (ctx: SlotContext) => ReactNode;
  settingsExtra?: (ctx: SlotContext) => ReactNode;
}
export interface SlotContext {
  brand: Brand; accounts: Account[]; posts: Post[]; media: MediaItem[]; today: string;
  select: (s: Selection) => void; reload: () => Promise<void>; say: (t: string, error?: boolean) => void; setView: (v: View) => void;
  /** C9: the post open on the right can take a library item */
  canAttach: boolean; attach: (mediaId: string) => void; mediaAdded: (m: MediaItem) => void;
  /** C11: the log view opens on 「需處理」 when the header's 「通知 N」 was pressed */
  logFilter: "all" | "needs"; openNeeds: () => void;
}

export default function SocialManager({ slots = {} }: { slots?: Slots }) {
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);
  const brand = brands?.find((b) => b.id === brandId) ?? null;
  const tz = brand?.default_timezone ?? "UTC";
  const today = useMemo(() => zoned(new Date(), tz).date, [tz]);
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [articles, setArticles] = useState<WpPost[]>([]);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [undatedTruncated, setUndatedTruncated] = useState(false);
  const [trash, setTrash] = useState<Post[] | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [selection, setSelection] = useState<Selection>({ kind: "new", key: 0 });
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [pfFilter, setPfFilter] = useState<Set<string> | null>(null);   // null = every platform
  const [stFilter, setStFilter] = useState<Set<PostState>>(new Set(FILTER_STATES));
  const [showTrash, setShowTrash] = useState(false);
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const say = useCallback((text: string, error = false) => setNote({ text, error }), []);
  const [listsKey, setListsKey] = useState(0);
  const [attachRequest, setAttachRequest] = useState<{ id: string; n: number } | null>(null);
  const [logFilter, setLogFilter] = useState<"all" | "needs">("all");

  // the URL names the brand on screen, so a reload or a shared link reopens this brand (the ?brand= rule above)
  const pickBrand = useCallback((id: string) => {
    setBrandId(id); setAnchor(null);
    const url = new URL(window.location.href);
    url.searchParams.set("brand", id);
    window.history.replaceState(null, "", url);
  }, []);

  useEffect(() => {
    api.brands().then((r) => {
      setBrands(r.brands);
      // a link that names a brand opens that brand or none: falling back to the first one would put the work in someone else's
      const wanted = new URLSearchParams(window.location.search).get("brand");
      const hit = wanted ? r.brands.find((b) => b.id === wanted) : undefined;
      if (wanted && !hit) say("連結指定的品牌不存在，或你沒有這個品牌的權限。請選一個品牌。", true);
      setBrandId(wanted ? hit?.id ?? null : r.brands[0]?.id ?? null);
    }).catch((e) => say(e instanceof Error ? e.message : String(e), true));
  }, [say]);

  const at = anchor ?? today;
  const window_ = useMemo(() => {
    if (view === "week") return { start: mondayOf(at), days: 7 };
    return { start: monthGridStart(at), days: 42 };   // month and list: the six-week grid around the month
  }, [view, at]);

  const reload = useCallback(async () => {
    if (!brand) return;
    try {
      const start = instantAt(window_.start, "00:00", tz);
      const end = instantAt(addDays(window_.start, window_.days), "00:00", tz);
      const writer = brand.role === "owner" || brand.role === "editor";   // WordPress articles: the content calendar's rule
      const [p, a] = await Promise.all([api.posts(brand.id, start, end, writer), api.accounts(brand.id)]);
      setPosts(p.posts);
      setArticles(p.wordpress ?? []);
      setUndatedTruncated(p.undatedTruncated);
      setAccounts(a.accounts);
      if (showTrash) setTrash((await api.trash(brand.id)).posts);
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), true);
    }
  }, [brand, window_, tz, showTrash, say]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    if (!brand) return;
    api.media(brand.id).then((r) => setMedia(r.media)).catch(() => setMedia([]));
    setSelection({ kind: "new", key: Date.now() });
    setChecked(new Set());
    setPfFilter(null);
  }, [brand]);

  // the open post is read fresh (it may be outside the calendar window, or just saved)
  useEffect(() => {
    if (!brand || selection.kind !== "post") { setSelectedPost(null); return; }
    let live = true;
    api.get(brand.id, selection.id).then((r) => { if (live) setSelectedPost(r.post); }).catch((e) => say(e instanceof Error ? e.message : String(e), true));
    return () => { live = false; };
  }, [brand, selection, say]);

  const platformsOf = (p: Post) => p.targets.map((t) => accounts.find((a) => a.id === t.account_id)?.platform ?? "?");
  const visible = useMemo(() => (showTrash && view === "list" ? trash ?? [] : posts).filter((p) =>
    (showTrash || stFilter.has(p.state))
    && (!pfFilter || platformsOf(p).some((x) => pfFilter.has(x)) || p.targets.length === 0)
    && (!query.trim() || `${p.body} ${p.targets.map((t) => t.custom_body ?? "").join(" ")}`.includes(query.trim())),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [posts, trash, showTrash, view, stFilter, pfFilter, query, accounts]);

  const canAttach = selection.kind === "new" || (selection.kind === "post" && !!selectedPost && ["draft", "review", "scheduled", "error", "rotation"].includes(selectedPost.state));
  const ctx: SlotContext | null = brand ? {
    brand, accounts, posts, media, today, select: setSelection, reload: async () => { await reload(); setListsKey((k) => k + 1); }, say, setView,
    canAttach, attach: (id) => setAttachRequest((r) => ({ id, n: (r?.n ?? 0) + 1 })), mediaAdded: (m) => setMedia((list) => [m, ...list]),
    logFilter, openNeeds: () => { setLogFilter("needs"); setView("log"); },
  } : null;
  const lists = useLists(brand, listsKey);
  const canWrite = brand?.role === "owner" || brand?.role === "editor";

  async function move(post: Post, date: string, time: string) {
    if (!brand || !canWrite) return;
    const when = instantAt(date, time, tz);
    if (Date.parse(when) <= Date.now()) return say("不能拖到過去的時間。", true);
    try {
      await api.setState(brand.id, post.id, post.version, { action: "schedule", scheduledAt: when });
      say(`已改到 ${shortDate(date)} ${time}。`);
      await reload();
      if (selection.kind === "post" && selection.id === post.id) setSelection({ kind: "post", id: post.id });
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), true);
    }
  }

  async function bulk(action: "submit" | "delete") {
    if (!brand) return;
    const items = posts.filter((p) => checked.has(p.id)).map((p) => ({ id: p.id, version: p.version, action }));
    try {
      const { results } = await api.bulk(brand.id, items);
      const bad = results.filter((r) => !r.ok);
      say(bad.length ? `${results.length - bad.length} 則完成，${bad.length} 則沒有：${bad[0].error}` : action === "delete" ? "已刪除，可在「已刪除」還原。" : "已送審。", bad.length > 0);
      setChecked(new Set());
      await reload();
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), true);
    }
  }

  async function restore(post: Post) {
    if (!brand) return;
    try {
      await api.setState(brand.id, post.id, post.version, { action: "restore" });
      say(post.published_at ? "已還原（已發佈過的貼文還原後仍是已發佈）。" : "已還原成草稿。");
      await reload();
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), true);
    }
  }

  async function copy(post: Post) {
    if (!brand) return;
    try {
      const { post: ref } = await api.create(brand.id, {
        fields: { body: post.body, first_comment: post.first_comment, link_url: post.link_url, link_utm: post.link_utm, notes: post.notes },
        targets: post.targets.map((t) => ({ account_id: t.account_id, custom_body: t.custom_body, format: t.format })),
        media: [...post.media].sort((a, b) => a.position - b.position).map((m) => ({ media_id: m.media_id, alt_text: m.alt_text })),
      });
      say("已複製成新草稿。");
      await reload();
      setSelection({ kind: "post", id: ref.id });
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), true);
    }
  }

  if (brands && !brands.length) return <div className="sm-app"><div className="sm-head"><h1>社群發文</h1><span className="sm-muted">你還沒有可以管理的品牌。</span></div></div>;
  if (!brand || !ctx) return (
    <div className="sm-app"><div className="sm-head"><h1>社群發文</h1>
      {!!brands?.length && <span className="sm-chips"><span className="sm-lab">品牌</span>
        {brands.map((b) => <button type="button" key={b.id} onClick={() => { pickBrand(b.id); setNote(null); }}>{b.name}</button>)}
      </span>}
      {note && <span className="sm-err">{note.text}</span>}
    </div></div>
  );

  const calendarView = view === "week" || view === "month";
  const rangeLabel = view === "week"
    ? `${shortDate(mondayOf(at))} – ${shortDate(addDays(mondayOf(at), 6))}`
    : view === "month" ? `${at.slice(0, 4)} 年 ${Number(at.slice(5, 7))} 月`
    : view === "list" ? (showTrash ? "已刪除" : `${at.slice(0, 4)} 年 ${Number(at.slice(5, 7))} 月前後六週`) : VIEWS.find(([v]) => v === view)?.[1] ?? "";
  const step = (n: number) => setAnchor(view === "week" ? addDays(at, 7 * n) : monthStart(addDays(monthStart(at), n * 31)));
  const allPlatforms = [...new Set(accounts.map((a) => a.platform))];
  const editorPost = selection.kind === "post" ? selectedPost : null;
  const editorKey = selection.kind === "post" ? `${selection.id}:${selectedPost?.version ?? "loading"}`
    : selection.kind === "new" || selection.kind === "article" ? `${selection.kind}:${selection.key}` : "none";
  const articleDay = selection.kind === "article" ? selection.article.date.slice(0, 10) : null;
  const right = slots.rightPanel?.(selection, ctx);
  // A new post or an article draft needs write access; without it the panel says why instead of an editor that ignores typing.
  const notice = selection.kind === "new" || selection.kind === "article" ? cannotWriteNotice(brand.role) : null;

  return (
    <div className="sm-app">
      <header className="sm-head">
        <h1>社群發文</h1>
        <span className="sm-chips"><span className="sm-lab">品牌</span>
          {brands?.map((b) => <button type="button" key={b.id} className={b.id === brand.id ? "sm-on" : ""} onClick={() => pickBrand(b.id)}>{b.name}</button>)}
        </span>
        <span className="sm-muted">時區 {tz}</span>
        {slots.headerExtra?.(ctx)}
        <span className={`sm-note ${note?.error ? "sm-err" : "sm-muted"}`} role="status">{note?.text}</span>
      </header>
      <main className="sm-main">
        <section className="sm-panel">
          <h2><span>{rangeLabel}</span>
            <span className="sm-right">
              {calendarView && <><button type="button" aria-label="上一段" onClick={() => step(-1)}>‹</button><button type="button" onClick={() => setAnchor(null)}>今天</button><button type="button" aria-label="下一段" onClick={() => step(1)}>›</button></>}
              {VIEWS.map(([v, label]) => <button type="button" key={v} className={view === v ? "sm-on" : ""} onClick={() => { setView(v); setChecked(new Set()); if (v === "log") setLogFilter("all"); }}>{label}</button>)}
            </span>
          </h2>
          {(calendarView || view === "list") && (
            <div className="sm-bar">
              <span className="sm-muted">平台</span>
              <span className="sm-chips">{allPlatforms.map((pf) => (
                <button type="button" key={pf} className={!pfFilter || pfFilter.has(pf) ? "sm-on" : ""}
                  onClick={() => setPfFilter((cur) => { const n = new Set(cur ?? allPlatforms); if (n.has(pf)) n.delete(pf); else n.add(pf); return n; })}>{platformOf(pf).name}</button>
              ))}</span>
              <span className="sm-sep" />
              <span className="sm-muted">狀態</span>
              <span className="sm-chips">
                {FILTER_STATES.map((s) => (
                  <button type="button" key={s} className={!showTrash && stFilter.has(s) ? "sm-on" : ""} disabled={showTrash}
                    onClick={() => setStFilter((cur) => { const n = new Set(cur); if (n.has(s)) n.delete(s); else n.add(s); return n; })}>
                    <span className="sm-dot" style={{ background: "var(--sm-state)", ...stateStyle(s) }} />{STATE_NAMES[s]}</button>
                ))}
                {view === "list" && <button type="button" className={showTrash ? "sm-on" : ""} onClick={() => setShowTrash((t) => !t)}>已刪除</button>}
              </span>
              <input type="search" aria-label="搜尋貼文" placeholder="搜尋貼文" value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginLeft: "auto", maxWidth: 160 }} />
            </div>
          )}
          {view === "week" && <WeekView posts={visible} accounts={accounts} tz={tz} today={today} weekStart={mondayOf(at)} selectedId={selection.kind === "post" ? selection.id : null}
            onOpen={(id) => setSelection({ kind: "post", id })} onNew={(date, time) => canWrite && setSelection({ kind: "new", date, time, key: Date.now() })} onMove={move}
            articles={articles} onArticle={(article) => { setPrefill(null); setSelection({ kind: "article", article, key: Date.now() }); }} />}
          {view === "month" && <MonthView posts={visible} accounts={accounts} tz={tz} today={today} anchor={at} selectedId={null} onOpen={(id) => setSelection({ kind: "post", id })} articles={articles}
            onPickWeek={(d) => { setAnchor(d); setView("week"); }} />}
          {view === "list" && <ListView posts={visible} accounts={accounts} tz={tz} today={today} selectedId={null} onOpen={(id) => setSelection({ kind: "post", id })}
            canWrite={canWrite} showTrash={showTrash} checked={checked} undatedTruncated={undatedTruncated}
            onCheck={(ids, on) => setChecked((c) => { const n = new Set(c); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; })}
            onRestore={restore} onCopy={copy} onBulk={bulk} />}
          {view === "settings" && <Settings brand={brand} accounts={accounts} onAccounts={setAccounts} team={slots.settingsExtra?.(ctx)} />}
          {!["week", "month", "list", "settings"].includes(view) && (slots.sideView?.(view, ctx) ?? <div className="sm-side sm-muted">這一塊還在做。</div>)}
        </section>

        <section className="sm-panel">
          <h2><span>{selection.kind === "post" ? "編輯貼文" : selection.kind === "list" ? "輪播清單" : selection.kind === "article" ? "文章 → 社群貼文" : notice ? `你的角色：${ROLE_NAMES[brand.role]}` : "新貼文"}</span>
            <span className="sm-right">{canWrite && <button type="button" onClick={() => setSelection({ kind: "new", key: Date.now() })}>＋ 新貼文</button>}</span>
          </h2>
          {right ?? (notice ? <p className="sm-side">{notice}</p> : selection.kind === "post" && !selectedPost
            ? <div className="sm-side sm-muted">載入中…</div>
            : (selection.kind === "post" || selection.kind === "new" || selection.kind === "article") && (
              <Editor key={editorKey} brand={brand} accounts={accounts} media={media} post={editorPost} today={today} lists={lists}
                attach={attachRequest} onOpenLibrary={() => setView("media")}
                defaults={{ date: selection.kind === "new" && selection.date ? selection.date : articleDay && articleDay > today ? articleDay : addDays(today, 1), time: selection.kind === "new" && selection.time ? selection.time : "12:00" }}
                prefill={selection.kind === "article" && prefill?.for === `${selection.article.siteId}:${selection.article.id}` ? prefill : null}
                reviewBar={editorPost ? <ReviewBar brand={brand} post={editorPost} onDone={async (id, msg) => { say(msg); await reload(); setSelection({ kind: "post", id }); }} /> : undefined}
                source={selection.kind === "article" && canWrite ? (
                  <ArticleSource brand={brand} accounts={accounts} siteId={selection.article.siteId} postId={selection.article.id} title={selection.article.title}
                    onPrefill={(p) => setPrefill((cur) => ({ ...p, n: (cur?.n ?? 0) + 1 }))} />
                ) : undefined}
                onMediaAdded={(m) => setMedia((list) => [m, ...list])}
                onSaved={async (id, msg) => { say(msg); await reload(); setSelection({ kind: "post", id }); }} />
            ))}
        </section>
      </main>
    </div>
  );
}
