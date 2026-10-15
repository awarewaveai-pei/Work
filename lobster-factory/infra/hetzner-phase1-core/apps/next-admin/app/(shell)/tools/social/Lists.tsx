"use client";
// 輪播 (SOCIAL_MANAGER_PLAN.md C7; mock: #listsView + #listDetail). Left: the brand's lists. Right: one list -- name,
// weekdays, time, channels, its items in order (next one marked), what it has already put on the calendar.
// Saving a list re-plans it (0101: unsent materialised posts are withdrawn and made again from the saved list).
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type ListRow } from "./api";
import { PfMark } from "./Calendar";
import { platformOf, shortDate, WEEKDAY_NAMES, zoned, type Account, type Brand, type Post } from "./model";
import type { SlotContext } from "./SocialManager";

const titleOf = (p: Post) => p.body.trim() || p.targets.find((t) => t.custom_body?.trim())?.custom_body || "（沒有文字）";
const err = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));

export function ListsView({ ctx, selectedId }: { ctx: SlotContext; selectedId: string | null }) {
  const [lists, setLists] = useState<ListRow[] | null>(null);
  useEffect(() => {
    api.lists(ctx.brand.id).then((r) => setLists(r.lists)).catch((e) => ctx.say(err(e), true));
  }, [ctx.brand.id, ctx.posts]);   // posts change after a save: the list summary may have too
  const canWrite = ctx.brand.role === "owner" || ctx.brand.role === "editor";
  return (
    <div className="sm-side">
      {(lists ?? []).map((l) => (
        <button type="button" key={l.id} className={`sm-sec${selectedId === l.id ? " sm-sel" : ""}`} style={{ textAlign: "left", opacity: l.active ? 1 : 0.75 }}
          onClick={() => ctx.select({ kind: "list", id: l.id })}>
          <b>{l.name}</b>
          <span className="sm-muted">{l.active ? "進行中" : "已暫停"}　每週{l.weekdays.map((d) => WEEKDAY_NAMES[d - 1]).join("、") || "（未設定）"} {l.send_time.slice(0, 5)}</span>
          <span className="sm-row">發到 {l.accounts.map((a) => { const acc = ctx.accounts.find((x) => x.id === a.account_id); return acc ? <PfMark key={a.account_id} platform={acc.platform} /> : null; })}</span>
        </button>
      ))}
      {lists && !lists.length && <span className="sm-muted">還沒有輪播清單。</span>}
      {canWrite && <button type="button" onClick={() => ctx.select({ kind: "list", id: null })}>＋ 新清單</button>}
      <span className="sm-muted">清單裡的貼文照順序輪流發，發完最後一則再從第一則開始。每天會把未來 7 天要發的排上行事曆。</span>
    </div>
  );
}

export function ListDetail({ ctx, listId }: { ctx: SlotContext; listId: string | null }) {
  const { brand, accounts } = ctx;
  const tz = brand.default_timezone;
  const canWrite = brand.role === "owner" || brand.role === "editor";
  const [list, setList] = useState<ListRow | null>(null);
  const [name, setName] = useState("新清單");
  const [days, setDays] = useState<number[]>([]);
  const [time, setTime] = useState("10:00");
  const [picked, setPicked] = useState<string[]>(() => accounts.filter((a) => a.status === "connected").map((a) => a.id));
  const [items, setItems] = useState<Post[]>([]);
  const [upcoming, setUpcoming] = useState<Post[]>([]);
  const [hint, setHint] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!listId) return;
    const r = await api.list(brand.id, listId);
    setList(r.list);
    setName(r.list.name);
    setDays(r.list.weekdays);
    setTime(r.list.send_time.slice(0, 5));
    setPicked(r.list.accounts.map((a) => a.account_id));
    setItems(r.items);
    setUpcoming(r.upcoming);
  }, [brand.id, listId]);
  useEffect(() => { load().catch((e) => setHint({ text: err(e), error: true })); }, [load]);

  async function save(active: boolean) {
    if (active && (!days.length || !picked.length || !items.length)) return setHint({ text: "要先有排程日、至少一個帳號、至少一則貼文，才能開始輪播。", error: true });
    setBusy(true);
    try {
      const body = { name: name.trim() || "清單", weekdays: days, send_time: time, active, account_ids: picked };
      const id = listId ? (await api.saveList(brand.id, listId, body)).id : (await api.createList(brand.id, body)).id;
      ctx.say(active ? "清單已儲存，未來 7 天的貼文已排上行事曆。" : "清單已儲存（暫停中，不會發）。");   // the panel remounts on a new list
      await ctx.reload();
      if (!listId) ctx.select({ kind: "list", id });
      else await load();
    } catch (e) {
      setHint({ text: err(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function move(i: number, d: -1 | 1) {
    if (!listId) return;
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    try {
      await api.reorderList(brand.id, listId, next.map((p) => p.id));
      await load();
    } catch (e) {
      setHint({ text: err(e), error: true });
    }
  }

  async function removeItem(p: Post) {
    try {
      await api.setState(brand.id, p.id, p.version, { action: "from_rotation" });
      setHint({ text: "已移出清單，變回草稿。" });
      await load();
      await ctx.reload();
    } catch (e) {
      setHint({ text: err(e), error: true });
    }
  }

  async function addDraft(p: Post) {
    if (!listId) return;
    try {
      const position = items.length ? Math.max(...items.map((x) => x.list_position ?? 0)) + 1 : 0;
      await api.setState(brand.id, p.id, p.version, { action: "to_rotation", listId, listPosition: position });
      setAdding(false);
      setHint({ text: "已加到清單最後。" });
      await load();
      await ctx.reload();
    } catch (e) {
      setHint({ text: err(e), error: true });
    }
  }

  async function remove() {
    if (!listId) return;
    try {
      await api.deleteList(brand.id, listId);
      ctx.say("清單已刪除。");
      await ctx.reload();
      ctx.select({ kind: "new", key: Date.now() });
    } catch (e) {
      setHint({ text: e instanceof ApiError && e.status === 409 ? "清單裡還有貼文，先把它們移出來。" : err(e), error: true });
    }
  }

  const next = items.length && list ? items[list.cursor % items.length] : null;
  const drafts = ctx.posts.filter((p) => p.state === "draft" && p.targets.length > 0);

  return (
    <div className="sm-ed" style={{ gridTemplateRows: "auto auto auto minmax(0,1fr) auto" }}>
      <div className="sm-row"><span className="sm-lab">名稱</span><input type="text" aria-label="清單名稱" value={name} disabled={!canWrite} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 0 }} /></div>
      <div className="sm-row sm-chips"><span className="sm-lab">每週</span>
        {WEEKDAY_NAMES.map((n, i) => (
          <button type="button" key={n} disabled={!canWrite} className={days.includes(i + 1) ? "sm-on" : ""}
            onClick={() => setDays((d) => (d.includes(i + 1) ? d.filter((x) => x !== i + 1) : [...d, i + 1].sort()))}>{n}</button>
        ))}
        <input type="time" aria-label="發文時間" value={time} disabled={!canWrite} onChange={(e) => setTime(e.target.value)} />
        <span className="sm-muted">{tz}</span>
      </div>
      <div className="sm-row"><span className="sm-lab">發到</span>
        {accounts.map((a: Account) => (
          <button type="button" key={a.id} className={`sm-acct${picked.includes(a.id) ? " sm-on" : ""}`} disabled={!canWrite || a.status !== "connected"}
            onClick={() => setPicked((p) => (p.includes(a.id) ? p.filter((x) => x !== a.id) : [...p, a.id]))}>
            <PfMark platform={a.platform} /><span>{platformOf(a.platform).name}</span><small>{a.label}</small>
          </button>
        ))}
      </div>
      <div className="sm-side" style={{ padding: 0 }}>
        {!listId && <span className="sm-muted">先儲存清單，再加貼文。</span>}
        {items.map((p, i) => (
          <div key={p.id} className="sm-arow" style={{ gridTemplateColumns: "auto minmax(0,1fr) auto", border: "1px solid var(--card-border)", borderRadius: 6, padding: "4px 8px", background: next?.id === p.id ? "var(--bg-subtle)" : undefined }}>
            <span className="sm-muted">{i + 1}{next?.id === p.id ? "　下一則" : ""}</span>
            <span className="sm-ellipsis" title={titleOf(p)}>{titleOf(p)}</span>
            {canWrite && (
              <span className="sm-chips">
                <button type="button" aria-label="往上" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" aria-label="往下" disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button type="button" onClick={() => removeItem(p)}>移除</button>
              </span>
            )}
          </div>
        ))}
        {listId && !items.length && <span className="sm-muted">清單還是空的。按「從草稿加入」，或在編輯貼文時選「加入輪播」。</span>}
        {adding && (
          <div className="sm-row sm-chips"><span className="sm-lab">挑一則草稿</span>
            {drafts.length ? drafts.map((p) => <button type="button" key={p.id} title={titleOf(p)} onClick={() => addDraft(p)}>{titleOf(p).slice(0, 14)}…</button>) : <span className="sm-muted">這個品牌目前沒有選好帳號的草稿。</span>}
          </div>
        )}
        {upcoming.length > 0 && (
          <div className="sm-sec"><h3>已排上行事曆</h3>
            {upcoming.map((p) => { const z = zoned(p.scheduled_at as string, tz); return <span key={p.id} className="sm-ellipsis">{shortDate(z.date)} {z.time}　{titleOf(p)}</span>; })}
          </div>
        )}
      </div>
      <div className="sm-foot">
        <div className="sm-hint">{hint && <span className={hint.error ? "sm-err" : "sm-muted"}>{hint.text}</span>}</div>
        {canWrite && (
          <div className="sm-acts">
            {listId && <button type="button" disabled={busy} onClick={() => setAdding((a) => !a)}>從草稿加入</button>}
            {listId && list && <button type="button" disabled={busy} onClick={() => save(!list.active)}>{list.active ? "暫停" : "開始輪播"}</button>}
            <button type="button" className="btn-primary" disabled={busy} onClick={() => save(list?.active ?? false)}>儲存清單</button>
            {listId && <button type="button" className="sm-danger" disabled={busy} onClick={remove}>刪除清單</button>}
          </div>
        )}
      </div>
    </div>
  );
}

/** The editor's「加入輪播」: which list a draft joins (Editor.tsx asks for it when the time mode is rotation). */
export function useLists(brand: Brand | null, refresh = 0) {
  const [lists, setLists] = useState<ListRow[]>([]);
  useEffect(() => {
    if (brand) api.lists(brand.id).then((r) => setLists(r.lists)).catch(() => setLists([]));
  }, [brand, refresh]);
  return lists;
}
