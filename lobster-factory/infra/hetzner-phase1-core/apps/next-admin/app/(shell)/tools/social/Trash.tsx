"use client";
// 已刪除貼文 (its own tab; mock v16 renderTrash; GAP_REPORT S5, F22): when it was due, when it was made, what, where to, the
// state it was in, when it was deleted and WHO (the newest `delete` row of the audit log, GET /api/social/posts?trash=1 deletions).
// 永久刪除: one row's button, or tick rows (the header box ticks every erasable one) and 「永久刪除所選」. Both open the
// same dialog naming how many; SocialManager then erases them one by one through the per-post purge route, so each
// keeps its own server checks (brand role, binned, never published, version).
import { useEffect, useState } from "react";
import EmptyState from "./EmptyState";
import { PfMark, platformsOf, stateStyle, titleOf } from "./Calendar";
import { who } from "./LogView";
import { shortDate, STATE_NAMES, zoned, type Account, type Post } from "./model";

export type Deletions = Record<string, { actor: string; from: string | null }>;

/** 永久刪除 one or many: one purge call per post, so the server checks each on its own (route -> assertCanPurge ->
 *  purgePost's own DELETE guard); one refused does not stop the rest, and the line names which ones were refused. */
export async function purgeEach(posts: Post[], purgeOne: (post: Post) => Promise<unknown>): Promise<{ text: string; error: boolean }> {
  const refused: Array<{ post: Post; why: string }> = [];
  for (const post of posts) {
    try { await purgeOne(post); } catch (e) { refused.push({ post, why: e instanceof Error ? e.message : String(e) }); }
  }
  const done = posts.length - refused.length;
  if (!refused.length) return { text: `已永久刪除 ${done} 則。`, error: false };
  return { text: `已永久刪除 ${done} 則；${refused.length} 則沒刪掉：${refused.map((r) => `「${titleOf(r.post).slice(0, 20)}」${r.why}`).join("；")}`, error: true };
}

const when = (iso: string | null, tz: string) => { if (!iso) return ""; const z = zoned(iso, tz); return `${shortDate(z.date)} ${z.time}`; };

/** A binned post that went out (published, or one channel did) stays as the record: no 永久刪除 (state.ts assertCanPurge). */
export const wentOut = (p: Post) => !!p.published_at || p.targets.some((t) => t.state === "published" || !!t.release_url);

const SHOWN = 5;   // titles listed in the dialog; the rest are counted

export default function Trash({ posts, deletions, accounts, tz, canWrite, onRestore, onPurge, onBack }: {
  posts: Post[]; deletions: Deletions; accounts: Account[]; tz: string; canWrite: boolean; onRestore: (post: Post) => void;
  onPurge: (posts: Post[]) => void; onBack: () => void;
}) {
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const [asking, setAsking] = useState<Post[] | null>(null);   // the posts whose 永久刪除 waits for the dialog
  const erasable = posts.filter((p) => !wentOut(p));
  // a ticked post that left the bin (restored, erased, reloaded away) loses its tick, so it is not ticked if it comes back
  useEffect(() => {
    const here = new Set(posts.filter((p) => !wentOut(p)).map((p) => p.id));
    setTicked((t) => ([...t].every((id) => here.has(id)) ? t : new Set([...t].filter((id) => here.has(id)))));
  }, [posts]);
  const selected = erasable.filter((p) => ticked.has(p.id));
  const all = erasable.length > 0 && selected.length === erasable.length;
  const tick = (ids: string[], on: boolean) => setTicked((t) => { const n = new Set(t); for (const id of ids) if (on) n.add(id); else n.delete(id); return n; });
  const confirm = () => {
    const ps = asking ?? [];
    setAsking(null);
    setTicked((t) => { const n = new Set(t); for (const p of ps) n.delete(p.id); return n; });
    onPurge(ps);
  };
  return (
    <section className="sm-panel" aria-label="已刪除貼文">
      <div className="sm-ptop">
        <h2>已刪除貼文<span className="sm-muted">刪掉的貼文留在這裡，可以還原。</span></h2>
        {canWrite && posts.length > 0 && (
          <button type="button" className="sm-danger" style={{ marginLeft: "auto" }} disabled={!selected.length} onClick={() => setAsking(selected)}>
            永久刪除所選{selected.length ? `（${selected.length}）` : ""}
          </button>
        )}
      </div>
      {posts.length ? (
        <div className="sm-list">
          <table>
            <thead><tr>
              <th>{canWrite && <input type="checkbox" aria-label="全選" checked={all} disabled={!erasable.length} onChange={(e) => tick(erasable.map((p) => p.id), e.target.checked)} />}</th>
              <th>排定發布時間</th><th>建立時間</th><th>內容</th><th>發到</th><th>刪除前</th><th>刪除時間</th><th>誰刪的</th><th />
            </tr></thead>
            <tbody>
              {posts.map((p) => {
                const d = deletions[p.id];
                const from = d?.from && d.from in STATE_NAMES ? (d.from as keyof typeof STATE_NAMES) : null;
                const out = wentOut(p);
                return (
                  <tr key={p.id}>
                    <td>{canWrite && <input type="checkbox" aria-label={`選取「${titleOf(p).slice(0, 20)}」`} checked={!out && ticked.has(p.id)} disabled={out}
                      title={out ? "發出去過的貼文留作紀錄，不能永久刪除" : undefined} onChange={(e) => tick([p.id], e.target.checked)} />}</td>
                    <td>{p.scheduled_at ? when(p.scheduled_at, tz) : "未排時間"}</td>
                    <td className="sm-muted">{when(p.created_at, tz)}</td>
                    <td className="sm-wrap">{titleOf(p).slice(0, 120)}</td>
                    <td><span className="sm-avs">{platformsOf(p, accounts).map((pf) => <PfMark key={pf} platform={pf} />)}</span></td>
                    <td>{from ? <span className="sm-pill" style={stateStyle(from)}>{STATE_NAMES[from]}</span> : <span className="sm-muted">不明</span>}</td>
                    <td>{when(p.deleted_at, tz)}</td>
                    <td>{d ? who(d.actor) : <span className="sm-muted">不明</span>}</td>
                    <td>{canWrite && <>
                      <button type="button" onClick={() => onRestore(p)}>還原</button>
                      {out ? <span className="sm-muted" title="發出去過的貼文留作紀錄">　已發佈過</span>
                        : <button type="button" className="sm-danger" onClick={() => setAsking([p])}>永久刪除</button>}
                    </>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <EmptyState icon="trash" line="沒有刪掉的貼文" hint="從日曆或清單刪掉的貼文，會留在這裡。" button="回排程日曆" onButton={onBack} />}
      {asking && asking.length > 0 && (
        <div className="sm-dialog-backdrop">
          <div className="sm-dialog" role="dialog" aria-modal="true" aria-labelledby="sm-purge-title">
            <div className="sm-dialog-heading">
              <span className="sm-dialog-icon" aria-hidden="true">!</span>
              <div>
                <h2 id="sm-purge-title">永久刪除 {asking.length} 則貼文，無法還原</h2>
                {asking.slice(0, SHOWN).map((p) => <p key={p.id}>「{titleOf(p).slice(0, 60)}」</p>)}
                {asking.length > SHOWN && <p className="sm-muted">還有 {asking.length - SHOWN} 則</p>}
              </div>
            </div>
            <p className="sm-dialog-warning">這些貼文和它們的頻道、留言、標籤、自動回覆規則會一起刪掉；媒體庫的檔案保留。</p>
            <div className="sm-dialog-actions">
              <button type="button" autoFocus onClick={() => setAsking(null)}>取消</button>
              <button type="button" className="sm-danger" onClick={confirm}>永久刪除 {asking.length} 則</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
