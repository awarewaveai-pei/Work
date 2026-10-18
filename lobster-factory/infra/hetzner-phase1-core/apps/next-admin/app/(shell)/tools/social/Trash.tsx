"use client";
// 已刪除貼文 (its own tab; mock v16 renderTrash; GAP_REPORT S5, F22): when it was due, what, where to, the state it was in,
// when it was deleted and WHO (the newest `delete` row of the audit log, GET /api/social/posts?trash=1 deletions).
import EmptyState from "./EmptyState";
import { PfMark, platformsOf, stateStyle, titleOf } from "./Calendar";
import { who } from "./LogView";
import { shortDate, STATE_NAMES, zoned, type Account, type Post } from "./model";

export type Deletions = Record<string, { actor: string; from: string | null }>;

const when = (iso: string | null, tz: string) => { if (!iso) return ""; const z = zoned(iso, tz); return `${shortDate(z.date)} ${z.time}`; };

export default function Trash({ posts, deletions, accounts, tz, canWrite, onRestore, onBack }: {
  posts: Post[]; deletions: Deletions; accounts: Account[]; tz: string; canWrite: boolean; onRestore: (post: Post) => void; onBack: () => void;
}) {
  return (
    <section className="sm-panel" aria-label="已刪除貼文">
      <div className="sm-ptop"><h2>已刪除貼文<span className="sm-muted">刪掉的貼文留在這裡，可以還原。</span></h2></div>
      {posts.length ? (
        <div className="sm-list">
          <table>
            <thead><tr><th>排定時間</th><th>內容</th><th>發到</th><th>刪除前</th><th>刪除時間</th><th>誰刪的</th><th /></tr></thead>
            <tbody>
              {posts.map((p) => {
                const d = deletions[p.id];
                const from = d?.from && d.from in STATE_NAMES ? (d.from as keyof typeof STATE_NAMES) : null;
                return (
                  <tr key={p.id}>
                    <td>{p.scheduled_at ? when(p.scheduled_at, tz) : "未排時間"}</td>
                    <td className="sm-wrap">{titleOf(p).slice(0, 120)}</td>
                    <td><span className="sm-avs">{platformsOf(p, accounts).map((pf) => <PfMark key={pf} platform={pf} />)}</span></td>
                    <td>{from ? <span className="sm-pill" style={stateStyle(from)}>{STATE_NAMES[from]}</span> : <span className="sm-muted">不明</span>}</td>
                    <td>{when(p.deleted_at, tz)}</td>
                    <td>{d ? who(d.actor) : <span className="sm-muted">不明</span>}</td>
                    <td>{canWrite && <button type="button" onClick={() => onRestore(p)}>還原</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <EmptyState icon="trash" line="沒有刪掉的貼文" hint="從日曆或清單刪掉的貼文，會留在這裡。" button="回排程日曆" onButton={onBack} />}
    </section>
  );
}
