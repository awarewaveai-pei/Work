"use client";
// The left panel's calendar views (mock: #weekView, #monthView, #listView). Times are the brand's (model.ts zoned).
// Dragging a scheduled / failed / queued post to another slot reschedules it (PUT .../state schedule; a queued one is
// withdrawn from Postiz first, lib/social/withdraw.ts). Drafts, published and rotation posts do not move.
import { useMemo, useState, type CSSProperties, type DragEvent, type MouseEvent } from "react";
import type { PostState } from "@/lib/social/state";
import { addDays, monthGridStart, platformOf, shortDate, slotTime, STATE_NAMES, STATE_TOKEN, WEEKDAY_NAMES, zoned, type Account, type Post } from "./model";
import type { WpPost } from "./api";

/** A WordPress article's place on the calendar: its date is already the site's wall clock (wp-calendar.ts). */
const articleAt = (a: WpPost) => ({ date: a.date.slice(0, 10), time: a.date.slice(11, 16), minutes: Number(a.date.slice(11, 13)) * 60 + Number(a.date.slice(14, 16)) });

const HOUR_PX = 28;   // --hour in social.css
const MOVABLE: readonly PostState[] = ["scheduled", "error", "queued"];

export function PfMark({ platform }: { platform: string }) {
  const p = platformOf(platform);
  return <span className="sm-pf" title={p.name} style={{ "--sm-pf": `var(${p.token})` } as CSSProperties}>{p.mark}</span>;
}

export const stateStyle = (s: PostState) => ({ "--sm-state": `var(${STATE_TOKEN[s]})` }) as CSSProperties;

function platformsOf(post: Post, accounts: Account[]): string[] {
  return [...new Set(post.targets.map((t) => accounts.find((a) => a.id === t.account_id)?.platform ?? "?"))];
}

function titleOf(post: Post): string {
  return post.body.trim() || post.targets.find((t) => t.custom_body?.trim())?.custom_body || "（沒有文字）";
}

interface ViewProps {
  posts: Post[];
  /** C10: the brand's WordPress articles (dashed cards); click = start a post from it */
  articles?: WpPost[];
  onArticle?: (a: WpPost) => void;
  accounts: Account[];
  tz: string;
  today: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

export function WeekView(props: ViewProps & { weekStart: string; onNew: (date: string, time: string) => void; onMove: (post: Post, date: string, time: string) => void }) {
  const { posts, accounts, tz, today, selectedId, weekStart } = props;
  const [over, setOver] = useState<string | null>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const minutesAt = (e: MouseEvent | DragEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return ((e.clientY - r.top) / HOUR_PX) * 60;
  };
  return (
    <div className="sm-week">
      <div className="sm-days">
        <div />
        {days.map((d, i) => <div key={d} className={d === today ? "sm-today" : ""}>{WEEKDAY_NAMES[i]} {shortDate(d)}</div>)}
      </div>
      <div className="sm-grid" ref={(el) => { if (el && !el.dataset.scrolled) { el.scrollTop = HOUR_PX * 8; el.dataset.scrolled = "1"; } }}>
        <div className="sm-hours">{Array.from({ length: 24 }, (_, h) => <span key={h}>{String(h).padStart(2, "0")}:00</span>)}</div>
        {days.map((d) => (
          <div key={d} className={`sm-col${d === today ? " sm-today" : ""}${over === d ? " sm-over" : ""}`} data-date={d}
            onClick={(e) => props.onNew(d, slotTime(minutesAt(e)))}
            onDragOver={(e) => { e.preventDefault(); setOver(d); }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const post = posts.find((p) => p.id === e.dataTransfer.getData("text/plain"));
              if (post) props.onMove(post, d, slotTime(minutesAt(e)));
            }}>
            {(props.articles ?? []).filter((a) => articleAt(a).date === d).map((a) => (
              <button type="button" key={`${a.siteId}:${a.id}`} className="sm-post sm-article" style={{ top: (articleAt(a).minutes / 60) * HOUR_PX }}
                onClick={(e) => { e.stopPropagation(); props.onArticle?.(a); }} title={`文章：${a.title}`}>
                <div className="sm-t"><span>{articleAt(a).time}</span><PfMark platform="wordpress" /></div>
                <div className="sm-ttl">文章：{a.title}</div>
              </button>
            ))}
            {posts.filter((p) => p.scheduled_at && zoned(p.scheduled_at, tz).date === d).map((p) => {
              const at = zoned(p.scheduled_at as string, tz);
              return (
                <button type="button" key={p.id} className={`sm-post${selectedId === p.id ? " sm-sel" : ""}`} style={{ ...stateStyle(p.state), top: (at.minutes / 60) * HOUR_PX }}
                  draggable={MOVABLE.includes(p.state)} data-state={p.state}
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
                  onClick={(e) => { e.stopPropagation(); props.onOpen(p.id); }}
                  title={`${STATE_NAMES[p.state]}　${titleOf(p)}`}>
                  <div className="sm-t"><span>{at.time}</span>{p.state === "error" && <span className="sm-err">⚠</span>}{platformsOf(p, accounts).map((pf) => <PfMark key={pf} platform={pf} />)}</div>
                  <div className="sm-ttl">{titleOf(p)}</div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

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
          const ps = posts.filter((p) => p.scheduled_at && zoned(p.scheduled_at, tz).date === d)
            .sort((a, b) => (a.scheduled_at as string).localeCompare(b.scheduled_at as string));
          return (
            <button type="button" key={d} className={`sm-mday${d === today ? " sm-today" : ""}${d.startsWith(month) ? "" : " sm-out"}`} onClick={() => props.onPickWeek(d)}>
              <div className="sm-n">{Number(d.slice(8))}</div>
              {ps.slice(0, 3).map((p) => <div key={p.id} className="sm-mi" style={stateStyle(p.state)}>{zoned(p.scheduled_at as string, tz).time} {titleOf(p)}</div>)}
              {ps.length > 3 && <div className="sm-n">還有 {ps.length - 3} 則</div>}
              {(props.articles ?? []).filter((a) => articleAt(a).date === d).slice(0, 1).map((a) => <div key={a.id} className="sm-mi">文章：{a.title}</div>)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ListView(props: ViewProps & {
  canWrite: boolean; showTrash: boolean; checked: Set<string>; onCheck: (ids: string[], on: boolean) => void;
  onRestore: (post: Post) => void; onCopy: (post: Post) => void; onBulk: (action: "submit" | "delete") => void; undatedTruncated: boolean;
}) {
  const { posts, accounts, tz, checked } = props;
  const rows = [...posts].sort((a, b) => (a.scheduled_at ?? "9999").localeCompare(b.scheduled_at ?? "9999"));
  const all = rows.length > 0 && rows.every((p) => checked.has(p.id));
  return (
    <>
      <div className="sm-list">
        <table>
          <thead><tr>
            <th>{props.canWrite && !props.showTrash && <input type="checkbox" aria-label="全選" checked={all} onChange={(e) => props.onCheck(rows.map((p) => p.id), e.target.checked)} />}</th>
            <th>時間</th><th>平台</th><th>內容</th><th>狀態</th><th />
          </tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{props.canWrite && !props.showTrash && <input type="checkbox" aria-label="選取" checked={checked.has(p.id)} onChange={(e) => props.onCheck([p.id], e.target.checked)} />}</td>
                <td>{p.scheduled_at ? (() => { const z = zoned(p.scheduled_at, tz); return `${shortDate(z.date)} ${z.time}`; })() : p.state === "rotation" ? "輪播" : "未排時間"}</td>
                <td>{platformsOf(p, accounts).map((pf) => <PfMark key={pf} platform={pf} />)}</td>
                <td className="sm-wrap">{titleOf(p).slice(0, 120)}</td>
                <td><span className="sm-pill" style={stateStyle(p.state)}>{STATE_NAMES[p.state]}</span></td>
                <td>
                  {p.state === "deleted"
                    ? props.canWrite && <button type="button" onClick={() => props.onRestore(p)}>還原</button>
                    : <span className="sm-chips"><button type="button" onClick={() => props.onOpen(p.id)}>打開</button>{props.canWrite && <button type="button" onClick={() => props.onCopy(p)}>複製</button>}</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="sm-muted">{props.showTrash ? "垃圾桶是空的。" : "這段時間沒有貼文。"}</td></tr>}
          </tbody>
        </table>
        {props.undatedTruncated && !props.showTrash && <div className="sm-muted" style={{ padding: 8 }}>沒排時間的貼文只列出最新的 500 則。</div>}
      </div>
      {props.canWrite && !props.showTrash && (
        <div className="sm-bulk">
          <span className="sm-muted">已選 {checked.size} 則</span>
          <button type="button" disabled={!checked.size} onClick={() => props.onBulk("submit")}>送審所選</button>
          <button type="button" className="sm-danger" disabled={!checked.size} onClick={() => props.onBulk("delete")}>刪除所選</button>
          <span className="sm-muted">刪掉的在「已刪除」裡，可以還原。</span>
        </div>
      )}
    </>
  );
}
