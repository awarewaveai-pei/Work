"use client";
// /tools/social -- the social manager (spec = lobster-factory/docs/social/mockups/social-manager-mock.html v16; frame =
// SOCIAL_MANAGER_PLAN.md C19, ADR 016 §5 decisions 1-5). Top bar of six sections; 貼文排程 = six tabs, the calendar
// tabs with the channel list on the left and one toolbar row; the composer is its own page (compose/new, compose/<id>).
// Every read and write goes through /api/social (C4); this file holds only what is on screen.
// Views by card: 自動發布清單 C7 (Lists), 貼文素材庫 C9/C31 (library/), 紀錄 C11 (LogView), 審核 C8, 文章 C10.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, type MediaItem, type WpPost } from "./api";
import ArticleSource, { type Prefill } from "./ArticleSource";
import ChannelList from "./ChannelList";
import { copyInput } from "./compose/draft";
import { ReviewBar } from "./Review";
import { ListView, MonthView, stateStyle, WeekView } from "./Calendar";
import EmptyState from "./EmptyState";
import Trash, { type Deletions } from "./Trash";
import { useLists } from "./Lists";
import Editor from "./Editor";
import Icon from "./Icon";
import PlanTabs from "./PlanTabs";
import { isView, routeHref, socialBase, type OtherSection, type Section, type SocialRoute, type View } from "./routes";
import SectionShell from "./SectionShell";
import Settings from "./Settings";
import Toolbar, { noFilters, type Filters } from "./Toolbar";
import TopBar from "./TopBar";
import {
  addDays, addMonths, bestFor, bestKey, bestPlatforms, cannotWriteNotice, instantAt, mondayOf, monthGridStart, monthStart, occurrences, ROLE_NAMES, shortDate,
  STATE_NAMES, takenSlots, zoned, type Account, type Brand, type CalPost, type Post, type Tag,
} from "./model";
import "./social.css";

export type { View } from "./routes";

/** What a view asks to open. post / new / article go to the composer page; list opens in 自動發布清單. */
export type Selection = { kind: "post"; id: string } | { kind: "new"; date?: string; time?: string; key: number; body?: string; mediaIds?: string[] } | { kind: "list"; id: string | null }
  | { kind: "article"; article: WpPost; key: number } | { kind: "none" };

/** What the later cards plug in; each returns null until its card lands. */
export interface Slots {
  sideView?: (view: View, ctx: SlotContext) => ReactNode;
  headerExtra?: (ctx: SlotContext) => ReactNode;
  settingsExtra?: (ctx: SlotContext) => ReactNode;
  /** a top-bar section's page (C24 analytics, C26 smart links, ...); null = the not-open shell */
  section?: (section: OtherSection, ctx: SlotContext) => ReactNode;
}
export interface SlotContext {
  brand: Brand; accounts: Account[]; posts: Post[]; media: MediaItem[]; today: string;
  select: (s: Selection) => void; reload: () => Promise<void>; say: (t: string, error?: boolean) => void; setView: (v: View) => void;
  /** C9: the post open in the composer can take a library item */
  canAttach: boolean; attach: (mediaId: string) => void; attachMany: (mediaIds: string[]) => void; mediaAdded: (m: MediaItem) => void;
  /** C11: the log view opens on 「需處理」 when the bell was pressed */
  logFilter: "all" | "needs"; openNeeds: () => void;
  /** C7: the list open in 自動發布清單; null = a new one, undefined = none */
  listId: string | null | undefined;
}

type Note = { text: string; error?: boolean };
type Go = (href: string, replace?: boolean) => void;
// A note said right before moving to another page of the app (a copy opens in the composer): client navigation keeps
// this module, so the next route shows it once. A full reload drops it, which is fine for a status line.
let carried: Note | null = null;
let carriedComposeSeed: { body: string; mediaIds: string[]; n: number } | null = null;

const param = (k: string) => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(k));

export default function SocialManager({ slots = {}, route = { kind: "plan" }, go = (href, replace) => (replace ? window.location.replace(href) : window.location.assign(href)) }: { slots?: Slots; route?: SocialRoute; go?: Go }) {
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [brandTotal, setBrandTotal] = useState(0);   // > brands.length: staff search the rest in the top bar
  const [brandId, setBrandId] = useState<string | null>(null);
  const brand = brands?.find((b) => b.id === brandId) ?? null;
  const tz = brand?.default_timezone ?? "UTC";
  const today = useMemo(() => zoned(new Date(), tz).date, [tz]);
  const [view, setViewState] = useState<View>(() => { const v = param("view"); return isView(v) ? v : "week"; });
  const [anchor, setAnchor] = useState<string | null>(() => param("date"));
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [articles, setArticles] = useState<WpPost[]>([]);
  const [undatedTruncated, setUndatedTruncated] = useState(false);
  const [trash, setTrash] = useState<Post[]>([]);
  const [deletions, setDeletions] = useState<Deletions>({});
  const [tags, setTags] = useState<Tag[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [filters, setFilters] = useState<Filters>(noFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [bestPf, setBestPf] = useState<string | null>(null);
  const [only, setOnly] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<Note | null>(null);
  // taken when the route lands: compose/X -> compose/Y keeps this same component, so a mount-time read would miss it
  const routeKey = route.kind === "compose" ? `compose:${route.postId}` : route.kind === "section" ? route.section : "plan";
  useEffect(() => { if (carried) { setNote(carried); carried = null; } }, [routeKey]);
  const say = useCallback((text: string, error = false) => setNote({ text, error }), []);
  const [listsKey, setListsKey] = useState(0);
  const [listId, setListId] = useState<string | null | undefined>(undefined);
  const [logFilter, setLogFilter] = useState<"all" | "needs">(() => (param("log") === "needs" ? "needs" : "all"));
  // composer
  const postId = route.kind === "compose" ? route.postId : null;
  const [postKey, setPostKey] = useState(0);
  const [loadedPost, setLoadedPost] = useState<Post | null>(null);
  const [attachRequest, setAttachRequest] = useState<{ id: string; n: number } | null>(null);
  const [attachManyRequest, setAttachManyRequest] = useState<{ ids: string[]; n: number } | null>(null);
  const [composeSeed, setComposeSeed] = useState<{ body: string; mediaIds: string[]; n: number } | null>(() => carriedComposeSeed);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [mobileChannels, setMobileChannels] = useState(false);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [newKey] = useState(() => Date.now());

  const href = useCallback((r: SocialRoute, params: Record<string, string | null | undefined> = {}) =>
    routeHref(socialBase(window.location.pathname), r, { brand: brandId, ...params }), [brandId]);
  const goTo = useCallback((r: SocialRoute, params?: Record<string, string | null | undefined>, carry?: Note, replace = false) => {
    if (carry) carried = carry;
    go(href(r, params), replace);
  }, [go, href]);

  // The URL names the brand (and on the plan page the view), so a reload or a shared link reopens the same screen.
  const syncUrl = useCallback((k: string, v: string | null) => {
    const url = new URL(window.location.href);
    if (v) url.searchParams.set(k, v); else url.searchParams.delete(k);
    window.history.replaceState(null, "", url);   // null, not history.state: Next's own copy of the URL must follow
  }, []);
  const pickBrand = useCallback((id: string) => { setBrandId(id); setAnchor(null); syncUrl("brand", id); }, [syncUrl]);
  const setView = useCallback((v: View) => {
    if (route.kind !== "plan") return goTo({ kind: "plan" }, { view: v === "week" ? null : v });
    setViewState(v); setChecked(new Set()); setFilterOpen(false);
    if (v !== "lists") setListId(undefined);
    syncUrl("view", v === "week" ? null : v);
  }, [route.kind, goTo, syncUrl]);

  useEffect(() => {
    api.brands().then(async (r) => {
      // a link that names a brand opens that brand or none: falling back to the first one would put the work in someone else's
      const wanted = param("brand");
      let list = r.brands;
      let hit = wanted ? list.find((b) => b.id === wanted) : undefined;
      // staff get only the first page of brands: a named brand outside it is fetched by id
      if (wanted && !hit && r.total > list.length) {
        hit = (await api.brands({ id: wanted }).catch(() => null))?.brands[0];
        if (hit) list = [hit, ...list];
      }
      setBrands(list);
      setBrandTotal(r.total ?? list.length);
      if (wanted && !hit) say("連結指定的品牌不存在，或你沒有這個品牌的權限。請選一個品牌。", true);
      setBrandId(wanted ? hit?.id ?? null : r.brands[0]?.id ?? null);
    }).catch((e) => say(e instanceof Error ? e.message : String(e), true));
  }, [say]);

  const at = anchor ?? today;
  const window_ = useMemo(() => (view === "week" ? { start: mondayOf(at), days: 7 } : { start: monthGridStart(at), days: 42 }), [view, at]);

  const reload = useCallback(async () => {
    if (!brand) return;
    try {
      if (route.kind !== "plan") { setAccounts((await api.accounts(brand.id)).accounts); return; }
      const start = instantAt(window_.start, "00:00", tz);
      const end = instantAt(addDays(window_.start, window_.days), "00:00", tz);
      const writer = brand.role === "owner" || brand.role === "editor";   // WordPress articles: the content calendar's rule
      // the bin is read with every window: the 已刪除貼文 tab shows it, and a deleted series child keeps its slot taken (occurrences)
      const [p, a, t] = await Promise.all([api.posts(brand.id, start, end, writer), api.accounts(brand.id), api.trash(brand.id)]);
      setPosts(p.posts);
      setTags(p.tags ?? []);
      setArticles(p.wordpress ?? []);
      setUndatedTruncated(p.undatedTruncated);
      setAccounts(a.accounts);
      setTrash(t.posts);
      setDeletions(t.deletions ?? {});
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), true);
    }
  }, [brand, route.kind, window_, tz, say]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    if (!brand) return;
    if (route.kind !== "section") api.media(brand.id).then((r) => setMedia(r.media)).catch(() => setMedia([]));
    setChecked(new Set());
    setOnly(new Set());
    setFilters(noFilters());
    setBestPf(null);
    setListId(undefined);
  }, [brand, route.kind]);

  // the composer's post is read fresh (it may be outside any calendar window, or just saved)
  useEffect(() => {
    if (!brand || !postId) { setLoadedPost(null); return; }
    let live = true;
    api.get(brand.id, postId).then((r) => { if (live) setLoadedPost(r.post); }).catch((e) => { if (live) say(e instanceof Error ? e.message : String(e), true); });
    return () => { live = false; };
  }, [brand, postId, postKey, say]);

  const canWrite = brand?.role === "owner" || brand?.role === "editor";
  const openCompose = useCallback((date?: string, time?: string, extra: Record<string, string> = {}) => {
    if (canWrite) goTo({ kind: "compose", postId: null }, { date, time, ...extra });
  }, [canWrite, goTo]);
  const select = useCallback((s: Selection) => {
    if (s.kind === "post") goTo({ kind: "compose", postId: s.id });
    else if (s.kind === "new") {
      carriedComposeSeed = s.body || s.mediaIds?.length ? { body: s.body ?? "", mediaIds: s.mediaIds ?? [], n: s.key } : null;
      setComposeSeed(carriedComposeSeed);
      openCompose(s.date, s.time);
    }
    else if (s.kind === "article") openCompose(undefined, undefined, { site: s.article.siteId, article: String(s.article.id), title: s.article.title, day: s.article.date.slice(0, 10) });
    else if (s.kind === "list") { setListId(s.id); if (view !== "lists") setView("lists"); }
    else setListId(undefined);
  }, [goTo, openCompose, view, setView]);

  // a series' computed occurrences join the real posts (model.ts occurrences); a deleted-after-published template still makes children
  const calPosts = useMemo<CalPost[]>(() => {
    const from = new Date(instantAt(window_.start, "00:00", tz)), until = new Date(instantAt(addDays(window_.start, window_.days), "00:00", tz));
    const taken = takenSlots(posts, trash), now = new Date();
    return [...posts, ...[...posts, ...trash].flatMap((t) => occurrences(t, tz, now, from, until, taken))];
  }, [posts, trash, window_, tz]);
  const platformsOf = (p: Post) => p.targets.map((t) => accounts.find((a) => a.id === t.account_id)?.platform ?? "?");
  const visible = useMemo(() => calPosts.filter((p) =>
    (!filters.states.size || filters.states.has(p.state))
    && (!filters.platforms.size || platformsOf(p).some((x) => filters.platforms.has(x)) || p.targets.length === 0)
    && (!filters.tags.size || p.tags.some((t) => filters.tags.has(t.tag_id)))
    && (!only.size || p.targets.some((t) => only.has(t.account_id)))
    && (!query.trim() || `${p.body} ${p.targets.map((t) => t.custom_body ?? "").join(" ")}`.includes(query.trim())),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [calPosts, filters, only, query, accounts]);
  const shownArticles = only.size || filters.platforms.size || filters.tags.size ? [] : articles;

  // The loaded post counts only while it IS the one on the route: the editor remounts on `${id}:${version}`, so a post
  // still loaded from the previous route, under the new id at an equal version, would show (and save) the previous
  // post's text into this one (2026-10-16, GAP_REPORT B1). A same-id reload keeps the editor on screen until it arrives.
  const editorPost = postId && loadedPost?.id === postId ? loadedPost : null;
  const canAttach = route.kind === "compose" && (!postId || (!!editorPost && ["draft", "review", "scheduled", "error", "rotation"].includes(editorPost.state)));
  const ctx: SlotContext | null = brand ? {
    brand, accounts, posts, media, today, select, reload: async () => { await reload(); setListsKey((k) => k + 1); }, say, setView,
    canAttach, attach: (id) => setAttachRequest((r) => ({ id, n: (r?.n ?? 0) + 1 })),
    attachMany: (ids) => setAttachManyRequest((r) => ({ ids: [...new Set(ids)], n: (r?.n ?? 0) + 1 })),
    mediaAdded: (m) => setMedia((list) => [m, ...list]),
    logFilter, openNeeds: () => { if (route.kind === "plan") { setLogFilter("needs"); setView("log"); } else goTo({ kind: "plan" }, { view: "log", log: "needs" }); },
    listId,
  } : null;
  const lists = useLists(route.kind === "compose" ? brand : null, listsKey);

  async function move(post: Post, date: string, time: string) {
    if (!brand || !canWrite) return;
    const when = instantAt(date, time, tz);
    if (Date.parse(when) <= Date.now()) return say("不能拖到過去的時間。", true);
    try {
      await api.setState(brand.id, post.id, post.version, { action: "schedule", scheduledAt: when });
      say(`已改到 ${shortDate(date)} ${time}。`);
      await reload();
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
      say(bad.length ? `${results.length - bad.length} 則完成，${bad.length} 則沒有：${bad[0].error}` : action === "delete" ? "已刪除，可在「已刪除貼文」還原。" : "已送審。", bad.length > 0);
      setChecked(new Set());
      await reload();
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), true);
    }
  }

  async function removeOne(post: Post) {
    if (!brand) return;
    try {
      await api.setState(brand.id, post.id, post.version, { action: "delete" });
      say("已刪除，可在「已刪除貼文」還原。");
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
      const { post: ref } = await api.create(brand.id, copyInput(post));
      goTo({ kind: "compose", postId: ref.id }, {}, { text: "已複製成新草稿。" });
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), true);
    }
  }

  async function unlink(a: Account) {
    if (!brand) return;
    try {
      await api.unlink(brand.id, a.id);
      setOnly((s) => { const n = new Set(s); n.delete(a.id); return n; });
      say(`已移除「${a.label}」。`);
      await reload();
    } catch (e) {
      say(e instanceof ApiError && e.status === 409 ? "還有貼文要發到這個帳號，先把它們改掉或刪掉。" : String(e), true);
    }
  }

  const section: Section = route.kind === "section" ? route.section : "plan";
  const onSection = (s: Section) => {
    if (s === "plan") { if (route.kind === "plan") setView("week"); else goTo({ kind: "plan" }); }
    else if (s !== section) goTo({ kind: "section", section: s });
  };
  const statusLine = <span className={`sm-note ${note?.error ? "sm-err" : "sm-muted"}`} role="status">{note?.text}</span>;
  const top = (
    <TopBar section={section} brands={brands ?? []} total={brandTotal} brand={brand}
      onBrand={(id, found) => {
        // a brand found by the top bar's search joins the list, so `brand` resolves
        if (found) setBrands((l) => (l && !l.some((b) => b.id === found.id) ? [found, ...l] : l));
        if (route.kind === "compose") goTo({ kind: "plan" }, { brand: id }); else { pickBrand(id); setNote(null); }
      }}
      onSection={onSection} bell={ctx ? slots.headerExtra?.(ctx) : undefined} onSettings={brand ? () => setView("settings") : undefined} />
  );

  if (brands && !brands.length) return <div className="sm-app">{top}<main className="sm-main sm-full"><p className="sm-muted">你還沒有可以管理的品牌。</p></main></div>;
  if (!brand || !ctx) return <div className="sm-app">{top}<div className="sm-subbar">{statusLine}</div></div>;

  // ---- other sections: the shell until their card lands ----
  if (route.kind === "section") return (
    <div className="sm-app">{top}{note && <div className="sm-subbar">{statusLine}</div>}<main className="sm-main sm-full">{slots.section?.(route.section, ctx) ?? <SectionShell which={route.section} />}</main></div>
  );

  // ---- the composer's own page (decision 5) ----
  if (route.kind === "compose") {
    const article = param("article") && param("site") ? { siteId: param("site") as string, id: Number(param("article")), title: param("title") ?? "", day: param("day") ?? "" } : null;
    const articleFor = article ? `${article.siteId}:${article.id}` : null;
    // accounts= (the channel menu's 用這個頻道寫) is for C21's channel picker; today's editor starts with every connected channel
    const defaults = { date: param("date") ?? (article && article.day > today ? article.day : addDays(today, 1)), time: param("time") ?? "12:00" };
    const notice = postId ? null : cannotWriteNotice(brand.role);
    const title = postId ? "編輯貼文" : article ? "文章 → 社群貼文" : notice ? `你的角色：${ROLE_NAMES[brand.role]}` : "建立貼文";
    const library = libraryOpen ? slots.sideView?.("library", ctx) : null;
    return (
      <div className="sm-app">
        {top}
        <div className="sm-subbar">
          <h2 className="sm-comphead">
            <button type="button" onClick={() => goTo({ kind: "plan" })}><Icon name="arrowL" />回排程日曆</button>
            <span>{title}</span>
            {editorPost && <span className="sm-state" style={stateStyle(editorPost.state)}><span className="sm-dot" />{STATE_NAMES[editorPost.state]}</span>}
          </h2>
          {statusLine}
        </div>
        <main className={`sm-main sm-compose${library ? " sm-withlib" : ""}`}>
          {library && (
            <section className="sm-panel" aria-label="媒體庫">
              <div className="sm-ptop"><h2>媒體庫</h2><button type="button" className="sm-ibtn sm-r" aria-label="關閉媒體庫" onClick={() => setLibraryOpen(false)}><Icon name="x" /></button></div>
              {library}
            </section>
          )}
          <section className="sm-panel">
            {notice ? <p className="sm-side">{notice}</p> : postId && !editorPost ? <div className="sm-side sm-muted">載入中…</div> : (
              <Editor key={postId ? `${postId}:${editorPost?.version}` : `new:${newKey}`} brand={brand} accounts={accounts} media={media} post={editorPost} today={today} lists={lists}
                  attach={attachRequest} attachMany={attachManyRequest} seed={composeSeed} onOpenLibrary={() => setLibraryOpen(true)} defaults={defaults}
                prefill={articleFor && prefill?.for === articleFor ? prefill : null}
                reviewBar={editorPost ? <ReviewBar brand={brand} post={editorPost} onDone={async (_id, msg) => { say(msg); setPostKey((k) => k + 1); }} /> : undefined}
                source={article && !postId && canWrite ? (
                  <ArticleSource brand={brand} accounts={accounts} siteId={article.siteId} postId={article.id} title={article.title}
                    onPrefill={(p) => setPrefill((cur) => ({ ...p, n: (cur?.n ?? 0) + 1 }))} />
                ) : undefined}
                onMediaAdded={(m) => setMedia((list) => [m, ...list])}
                onSaved={(id, msg, plan) => {
                  // another post (a new one's first save replaces compose/new; 複製成新貼文 is a new page): through the
                  // router, so Back returns to a page that matches its address (critic 2026-10-17: history.replaceState
                  // kept compose/new's route under compose/<id>, and Back opened an empty composer that saved a duplicate)
                  carriedComposeSeed = null;
                  setComposeSeed(null);
                  if (plan) { setViewState("week"); setAnchor(plan.date); goTo({ kind: "plan" }, { date: plan.date }, { text: msg }); }
                  else if (id !== postId) goTo({ kind: "compose", postId: id }, {}, { text: msg }, !postId);
                  else { say(msg); setPostKey((k) => k + 1); }
                }} />
            )}
          </section>
        </main>
      </div>
    );
  }

  // ---- 貼文排程 ----
  const calendar = view === "week" || view === "month" || view === "list";
  const step = (n: number) => setAnchor(view === "week" ? addDays(at, 7 * n) : addMonths(at, n));
  const rangeLabel = view === "week" ? `${shortDate(mondayOf(at))} – ${shortDate(addDays(mondayOf(at), 6))}`
    : `${at.slice(0, 4)} 年 ${Number(at.slice(5, 7))} 月${view === "list" ? "前後六週" : ""}`;
  const atToday = view === "week" ? mondayOf(at) === mondayOf(today) : monthStart(at) === monthStart(today);
  const panel = (title: string, body: ReactNode) => <section className="sm-panel"><div className="sm-ptop"><h2>{title}</h2></div>{body}</section>;
  // only channels that can send: a chip must open a composer that has somewhere to go
  const bestPlatformKeys = bestPlatforms(accounts.filter((a) => a.status === "connected").map((a) => a.platform));
  const onBest = (pf: string | null) => { if (pf === null && !bestPf) say("先連接社群帳號，才看得到最佳時間。"); else setBestPf(pf); };
  const clearAll = () => { setFilters(noFilters()); setOnly(new Set()); setQuery(""); };
  const nothingYet = !posts.length && !calPosts.length && !shownArticles.length;
  // S7: the same empty state wherever there is nothing to list -- no posts yet, or none match
  const empty = nothingYet
    ? (accounts.some((a) => a.status === "connected")
      ? <EmptyState icon="calendar" line="這個品牌還沒有貼文" hint="寫好的貼文會照時間排在這裡。" button={canWrite ? "寫第一則貼文" : undefined} onButton={() => openCompose()} />
      : <EmptyState icon="link" line="還沒連接社群帳號" hint="連好帳號，才能排貼文。" button="到設定連接帳號" onButton={() => setView("settings")} />)
    : <EmptyState icon="search" line="沒有符合的貼文" hint="換個搜尋字，或清除篩選。" button="清除篩選" onButton={clearAll} />;
  const shared = {
    posts: visible, articles: shownArticles, onArticle: (article: WpPost) => select({ kind: "article", article, key: Date.now() }), accounts, media, tags, tz, today, canWrite,
    onOpen: (id: string) => select({ kind: "post", id }), onCopy: copy, onDelete: removeOne,
  };
  const toggleOnly = (id: string) => setOnly((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="sm-app">
      {top}
      <PlanTabs view={view} onView={setView} right={<span className="sm-r">{statusLine}<span className="sm-muted">時區 {tz}</span></span>} />
      <main className={`sm-main${calendar ? "" : " sm-full"}${mobileChannels ? " sm-mobile-channels" : ""}`}>
        {calendar && <>
          <ChannelList accounts={accounts} only={only} canWrite={canWrite} onToggle={toggleOnly} onOnly={(id) => { setOnly(new Set([id])); setMobileChannels(false); }}
            onWrite={(id) => { setMobileChannels(false); openCompose(undefined, undefined, { accounts: id }); }} onSettings={() => setView("settings")} onRemove={unlink}
            onCloseMobile={() => setMobileChannels(false)} />
          <section className="sm-panel sm-cal">
            <Toolbar mode={view as "week" | "month" | "list"} query={query} onQuery={setQuery} rangeLabel={rangeLabel} atToday={atToday}
              onStep={step} onToday={() => setAnchor(null)} onMode={(m) => setView(m)}
              platforms={[...new Set(accounts.map((a) => a.platform))]} tags={tags} filters={filters} onFilters={setFilters} filterOpen={filterOpen} onFilterOpen={setFilterOpen}
              bestPlatforms={bestPlatformKeys} best={bestPf} onBest={onBest} canWrite={canWrite} onCreate={() => openCompose()}
              checkedN={checked.size} onBulk={bulk} onMobileChannels={() => setMobileChannels(true)} />
            {nothingYet ? empty : <>
              {view === "week" && <WeekView {...shared} weekStart={mondayOf(at)} onNew={(date) => openCompose(date)} onMove={move}
                bestTimes={bestPf ? (d) => bestFor(bestPf, d) : null}
                onBestTime={(date, time) => openCompose(date, time, { accounts: accounts.filter((a) => a.status === "connected" && bestKey(a.platform) === bestPf).map((a) => a.id).join(",") })} />}
              {view === "month" && <MonthView {...shared} anchor={at} onPickWeek={(d) => { setAnchor(d); setView("week"); }} />}
              {view === "list" && <ListView {...shared} checked={checked} undatedTruncated={undatedTruncated} empty={empty}
                onCheck={(ids, on) => setChecked((c) => { const n = new Set(c); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; })} />}
              {view === "week" && canWrite && <button type="button" className="sm-mobile-fab" aria-label="建立貼文" onClick={() => openCompose()}><Icon name="plus" /></button>}
            </>}
          </section>
        </>}
        {view === "trash" && <Trash posts={trash} deletions={deletions} accounts={accounts} tz={tz} canWrite={canWrite} onRestore={restore} onBack={() => setView("week")} />}
        {view === "library" && panel("貼文素材庫", slots.sideView?.("library", ctx))}
        {view === "lists" && panel("自動發布清單", slots.sideView?.("lists", ctx))}
        {view === "flows" && (slots.sideView?.("flows", ctx) ?? <SectionShell which="flows" />)}
        {view === "log" && panel("需處理的事和紀錄", slots.sideView?.("log", ctx))}
        {view === "settings" && panel("設定", <Settings brand={brand} accounts={accounts} onAccounts={setAccounts} team={slots.settingsExtra?.(ctx)} />)}
      </main>
    </div>
  );
}
