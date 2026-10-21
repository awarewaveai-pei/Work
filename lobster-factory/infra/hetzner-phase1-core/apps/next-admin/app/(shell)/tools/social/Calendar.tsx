"use client";
// The calendar tab's views (mock v16: #weekView, #monthView, #listView; SOCIAL_MANAGER_PLAN.md C22). Times are the brand's
// (model.ts zoned). Week = one column per day, cards stacked by time (decision 4); dragging a scheduled / failed / queued
// card to another day reschedules it at the same time (PUT .../state schedule; a queued one is withdrawn from Postiz first,
// lib/social/withdraw.ts). Drafts, published, rotation and computed repeat occurrences do not move.
import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import type { PostState } from "@/lib/social/state";
import Icon from "./Icon";
import {
  addDays, monthGridStart, platformOf, shortDate, STATE_NAMES, STATE_TOKEN, TAG_TOKEN, WEEKDAY_NAMES, zoned,
  type Account, type CalPost, type Post, type Tag,
} from "./model";
import type { MediaItem, WpPost } from "./api";

/** A WordPress article's place on the calendar: its date is already the site's wall clock (wp-calendar.ts). */
const articleAt = (a: WpPost) => ({ date: a.date.slice(0, 10), time: a.date.slice(11, 16) });

const MOVABLE: readonly PostState[] = ["scheduled", "error", "queued"];

export function PfMark({ platform }: { platform: string }) {
  const p = platformOf(platform);
  return <span className="sm-pf" title={p.name} style={{ "--sm-pf": `var(${p.token})` } as CSSProperties}>{p.mark}</span>;
}

export const stateStyle = (s: PostState) => ({ "--sm-state": `var(${STATE_TOKEN[s]})` }) as CSSProperties;

export function platformsOf(post: Post, accounts: Account[]): string[] {
  return [...new Set(post.targets.map((t) => accounts.find((a) => a.id === t.account_id)?.platform ?? "?"))];
}

export function titleOf(post: Post): string {
  return post.body.trim() || post.targets.find((t) => t.custom_body?.trim())?.custom_body || "（沒有文字）";
}

/** The brand's wall clock, refreshed every minute: the "現在" line and "today" follow it without a reload. */
function useClock(tz: string): { date: string; time: string } {
  const [now, setNow] = useState(() => zoned(new Date(), tz));
  useEffect(() => {
    setNow(zoned(new Date(), tz));
    const t = setInterval(() => setNow(zoned(new Date(), tz)), 60_000);
    return () => clearInterval(t);
  }, [tz]);
  return now;
}

/** A target on a channel that is gone or not connected: the post cannot go out (published ones already did). */
const unconnected = (post: Post, accounts: Account[]) => post.state !== "published"
  && post.targets.some((t) => accounts.find((a) => a.id === t.account_id)?.status !== "connected");

const imagesOf = (post: Post, media: MediaItem[]) => [...post.media].sort((a, b) => a.position - b.position)
  .map((m) => media.find((x) => x.id === m.media_id)?.postiz_path).filter((u): u is string => !!u);

/** First picture (or the word 文字) with the platform marks on its corner. */
export function Thumb({ post, accounts, media, size = "card" }: { post: Post; accounts: Account[]; media: MediaItem[]; size?: "card" | "row" }) {
  const urls = imagesOf(post, media);
  const n = post.media.length;
  return (
    <div className={`sm-cthumb sm-${size}${n ? "" : " sm-txt"}`}>
      {urls[0] ? <img src={urls[0]} alt="" loading="lazy" /> : n ? <span className="sm-muted">圖</span> : <span className="sm-muted">文字</span>}
      {n > 1 && <span className="sm-more">+{n - 1}</span>}
      <span className="sm-avs">{platformsOf(post, accounts).map((pf) => <PfMark key={pf} platform={pf} />)}</span>
    </div>
  );
}

interface CardProps {
  post: CalPost; accounts: Account[]; media: MediaItem[]; tags: Tag[]; tz: string; canWrite: boolean;
  onOpen: (id: string) => void; onCopy: (post: Post) => void; onDelete: (post: Post) => void;
}

function Card({ post, accounts, media, tags, tz, canWrite, onOpen, onCopy, onDelete }: CardProps) {
  const mine = !post.occurrenceOf;
  const own = post.tags.map((t) => tags.find((x) => x.id === t.tag_id)).filter((t): t is Tag => !!t);
  const who = [...new Set(post.targets.map((t) => accounts.find((a) => a.id === t.account_id)?.label ?? "已移除的帳號"))].join("、");
  const open = () => onOpen(post.occurrenceOf ?? post.id);
  const key = (e: KeyboardEvent) => { if (e.key === "Enter" && e.target === e.currentTarget) open(); };
  const releases = post.state === "published" ? post.targets.filter((t) => t.release_url) : [];
  return (
    <div className="sm-post" role="button" tabIndex={0} style={stateStyle(post.state)} data-state={post.state} data-id={post.id}
      draggable={mine && MOVABLE.includes(post.state)} onDragStart={(e) => e.dataTransfer.setData("text/plain", post.id)}
      onClick={(e) => { e.stopPropagation(); open(); }} onKeyDown={key} title={`${STATE_NAMES[post.state]} · ${who}`}>
      {own[0] && <i className="sm-ctag" style={{ background: `var(${TAG_TOKEN[own[0].colour]})` }} title={`標籤：${own[0].name}`} />}
      <Thumb post={post} accounts={accounts} media={media} />
      <div className="sm-cmeta">
        <span>{post.scheduled_at ? zoned(post.scheduled_at, tz).time : ""}</span>
        {post.list_id && <span title="來自自動發布清單">↻</span>}
        {(post.repeat || post.repeat_of) && <span title="週期性安排">🔁</span>}
        {post.auto_mode === "own" && <span title="這則有自己的自動回覆規則">🤖</span>}
        {unconnected(post, accounts) && <span className="sm-err" title="有頻道沒連接，這則發不出去">⚠</span>}
        {own.map((t) => <span key={t.id} style={{ color: `var(${TAG_TOKEN[t.colour]})` }}>#{t.name}</span>)}
        <span className="sm-ellipsis">{who}</span>
      </div>
      <div className="sm-ctext">{titleOf(post)}</div>
      {!!releases.length && <div className="sm-release-links" aria-label="已發佈貼文連結">{releases.map((t) => {
        const account = accounts.find((a) => a.id === t.account_id);
        const label = `在 ${account ? platformOf(account.platform).name : "平台"} 查看貼文`;
        return <a key={t.id} href={t.release_url as string} target="_blank" rel="noopener noreferrer" aria-label={label} onClick={(e) => e.stopPropagation()}><PfMark platform={account?.platform ?? ""} />{label}</a>;
      })}</div>}
      {mine && (
        <span className="sm-cacts">
          <button type="button" title="預覽" aria-label="預覽" onClick={(e) => { e.stopPropagation(); open(); }}><Icon name="eye" /></button>
          {canWrite && <button type="button" title="複製成新的草稿" aria-label="複製" onClick={(e) => { e.stopPropagation(); onCopy(post); }}><Icon name="copy" /></button>}
          {canWrite && <button type="button" title={post.state === "published" ? "已發佈的不能從這裡刪" : "刪除（可在已刪除貼文還原）"} aria-label="刪除" disabled={post.state === "published"}
            onClick={(e) => { e.stopPropagation(); onDelete(post); }}><Icon name="trash" /></button>}
        </span>
      )}
    </div>
  );
}

interface ViewProps {
  posts: CalPost[];
  /** C10: the brand's WordPress articles (dashed cards); click = start a post from it */
  articles?: WpPost[];
  onArticle?: (a: WpPost) => void;
  accounts: Account[];
  media: MediaItem[];
  tags: Tag[];
  tz: string;
  today: string;
  canWrite: boolean;
  onOpen: (id: string) => void;
  onCopy: (post: Post) => void;
  onDelete: (post: Post) => void;
}

const byTime = (a: CalPost, b: CalPost) => (a.scheduled_at as string).localeCompare(b.scheduled_at as string);

export function WeekView(props: ViewProps & {
  weekStart: string; onNew: (date: string) => void; onMove: (post: Post, date: string, time: string) => void;
  /** the chosen platform's best times for a day; null = the best-times mode is off */
  bestTimes: ((date: string) => string[]) | null; onBestTime: (date: string, time: string) => void;
}) {
  const { posts, accounts, tz, canWrite } = props;
  const clock = useClock(tz);
  const today = props.today > clock.date ? props.today : clock.date;
  const [over, setOver] = useState<string | null>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(props.weekStart, i)), [props.weekStart]);
  const [mobileDay, setMobileDay] = useState(() => props.today >= props.weekStart && props.today < addDays(props.weekStart, 7) ? props.today : props.weekStart);
  useEffect(() => { if (!days.includes(mobileDay)) setMobileDay(props.today >= props.weekStart && props.today < addDays(props.weekStart, 7) ? props.today : props.weekStart); }, [days, mobileDay, props.today, props.weekStart]);
  return (
    <div className="sm-week-wrap">
      <div className="sm-mobile-dates" aria-label="選擇日期">
        {days.map((d, i) => <button type="button" key={d} className={d === mobileDay ? "sm-on" : ""} onClick={() => setMobileDay(d)}><span>{WEEKDAY_NAMES[i]}</span><b>{Number(d.slice(8))}</b></button>)}
      </div>
      <div className="sm-week">
        {days.map((d, i) => {
        const ps = posts.filter((p) => p.scheduled_at && zoned(p.scheduled_at, tz).date === d).sort(byTime);
        const arts = (props.articles ?? []).filter((a) => articleAt(a).date === d);
        const best = props.bestTimes && d >= today ? props.bestTimes(d) : [];
        const card = (p: CalPost) => <Card key={p.id} post={p} accounts={accounts} media={props.media} tags={props.tags} tz={tz} canWrite={canWrite}
          onOpen={props.onOpen} onCopy={props.onCopy} onDelete={props.onDelete} />;
        const at = d === today ? ps.findIndex((p) => zoned(p.scheduled_at as string, tz).time > clock.time) : -1;
        const split = at < 0 ? ps.length : at;
        return (
          <div key={d} className={`sm-day${d < today ? " sm-past" : ""}${d === today ? " sm-today" : ""}${d === mobileDay ? " sm-mobile-selected" : ""}${over === d ? " sm-over" : ""}`} data-date={d}>
            <div className="sm-dh"><span className="sm-muted">{WEEKDAY_NAMES[i]}</span><b>{Number(d.slice(8))}</b><span className="sm-n">{ps.length ? `${ps.length} 則` : ""}</span></div>
            <div className="sm-col" data-date={d}
              onClick={(e) => { if (e.target === e.currentTarget && canWrite && d >= today) props.onNew(d); }}
              onDragOver={(e) => { e.preventDefault(); setOver(d); }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const post = posts.find((p) => p.id === e.dataTransfer.getData("text/plain"));
                if (post?.scheduled_at) props.onMove(post, d, zoned(post.scheduled_at, tz).time);
              }}>
              {best.length > 0 && (
                <div className="sm-best"><Icon name="star" />{best.map((t) => <button type="button" key={t} title={`在 ${t} 寫一則`} onClick={(e) => { e.stopPropagation(); props.onBestTime(d, t); }}>{t}</button>)}</div>
              )}
              {arts.map((a) => (
                <button type="button" key={`${a.siteId}:${a.id}`} className="sm-post sm-article" onClick={(e) => { e.stopPropagation(); props.onArticle?.(a); }} title={`文章：${a.title}`}>
                  <div className="sm-cmeta"><span>{articleAt(a).time}</span><PfMark platform="wordpress" /><span className="sm-ellipsis">WordPress</span></div>
                  <div className="sm-ctext">文章：{a.title}</div>
                </button>
              ))}
              {ps.slice(0, split).map(card)}
              {d === today && <div className="sm-now">現在 {clock.time}</div>}
              {ps.slice(split).map(card)}
              {canWrite && d >= today && <button type="button" className="sm-add" onClick={(e) => { e.stopPropagation(); props.onNew(d); }}><Icon name="plus" />新增</button>}
            </div>
          </div>
        );
        })}
      </div>
    </div>
  );
}

/** Cells show two posts and 「還有 N 則」; a click opens that week. Changing month is the toolbar's ‹ › (SocialManager step). */
export function MonthView(props: ViewProps & { anchor: string; onPickWeek: (date: string) => void }) {
  const { posts, tz, today, anchor } = props;
  const start = monthGridStart(anchor);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const month = anchor.slice(0, 7);
  return (
    <div className="sm-month">
      <div className="sm-mhead">{WEEKDAY_NAMES.map((n) => <div key={n}>{n}</div>)}</div>
      <div className="sm-mgrid">
        {cells.map((d) => {
          const ps = posts.filter((p) => p.scheduled_at && zoned(p.scheduled_at, tz).date === d).sort(byTime);
          const arts = (props.articles ?? []).filter((a) => articleAt(a).date === d);
          return (
            <button type="button" key={d} className={`sm-mday${d === today ? " sm-today" : ""}${d.startsWith(month) ? "" : " sm-out"}`} data-date={d} onClick={() => props.onPickWeek(d)}>
              <div className="sm-n">{Number(d.slice(8))}</div>
              {ps.slice(0, 2).map((p) => <div key={p.id} className="sm-mi" style={stateStyle(p.state)}>{zoned(p.scheduled_at as string, tz).time} {titleOf(p)}</div>)}
              {ps.length > 2 && <div className="sm-n">還有 {ps.length - 2} 則</div>}
              {ps.length <= 1 && arts.slice(0, 1).map((a) => <div key={`${a.siteId}:${a.id}`} className="sm-mi">文章：{a.title}</div>)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The list tab: a table (mock #listView); the bulk actions are the toolbar's 批次動作 menu, not a bar under the table. */
export function ListView(props: ViewProps & {
  checked: Set<string>; onCheck: (ids: string[], on: boolean) => void; undatedTruncated: boolean;
  /** shown in place of the rows when none match (SocialManager knows why: nothing yet, or the filters) */
  empty: ReactNode;
}) {
  const { posts, accounts, tz, checked, canWrite } = props;
  const rows = [...posts].sort((a, b) => (a.scheduled_at ?? "9999").localeCompare(b.scheduled_at ?? "9999"));
  const real = rows.filter((p) => !p.occurrenceOf);
  const all = real.length > 0 && real.every((p) => checked.has(p.id));
  if (!rows.length) return <div className="sm-list">{props.empty}</div>;
  return (
    <div className="sm-list">
      <table>
        <thead><tr>
          <th>{canWrite && <input type="checkbox" aria-label="全選" checked={all} onChange={(e) => props.onCheck(real.map((p) => p.id), e.target.checked)} />}</th>
          <th /><th>時間</th><th>發到</th><th>內容</th><th>狀態</th><th />
        </tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{canWrite && !p.occurrenceOf && <input type="checkbox" aria-label="選取" checked={checked.has(p.id)} onChange={(e) => props.onCheck([p.id], e.target.checked)} />}</td>
              <td><Thumb post={p} accounts={accounts} media={props.media} size="row" /></td>
              <td>{p.scheduled_at ? (() => { const z = zoned(p.scheduled_at, tz); return `${shortDate(z.date)} ${z.time}`; })() : p.state === "rotation" ? "輪播" : "未排時間"}</td>
              <td><span className="sm-avs">{platformsOf(p, accounts).map((pf) => <PfMark key={pf} platform={pf} />)}</span>{unconnected(p, accounts) && <span className="sm-err" title="有頻道沒連接"> ⚠</span>}</td>
              <td className="sm-wrap">{titleOf(p).slice(0, 120)}</td>
              <td><span className="sm-pill" style={stateStyle(p.state)}>{STATE_NAMES[p.state]}</span></td>
              <td>
                <span className="sm-chips">
                  <button type="button" className="sm-ibtn" title="打開" aria-label="打開" onClick={() => props.onOpen(p.occurrenceOf ?? p.id)}><Icon name="eye" /></button>
                  {canWrite && !p.occurrenceOf && <button type="button" className="sm-ibtn" title="複製成新的草稿" aria-label="複製" onClick={() => props.onCopy(p)}><Icon name="copy" /></button>}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {props.undatedTruncated && <div className="sm-muted" style={{ padding: 8 }}>沒排時間的貼文只列出最新的 500 則。</div>}
    </div>
  );
}
