"use client";
// 輪播 (SOCIAL_MANAGER_PLAN.md C7; mock: #listsView + #listDetail). Left: the brand's lists. Right: one list -- name,
// weekdays, time, channels, its items in order (next one marked), what it has already put on the calendar.
// Saving a list re-plans it (0101: unsent materialised posts are withdrawn and made again from the saved list).
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type ListInput, type ListRow } from "./api";
import { PfMark } from "./Calendar";
import DateTimePicker from "./compose/DateTimePicker";
import { platformOf, shortDate, WEEKDAY_NAMES, zoned, type Account, type Brand, type Post } from "./model";
import type { SlotContext } from "./SocialManager";

const titleOf = (p: Post) => p.body.trim() || p.targets.find((t) => t.custom_body?.trim())?.custom_body || "（沒有文字）";
const err = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));

// ---- the weekday x time grid (C23; 0105 social_list_slots) ------------------------------------------------------------
type Slot = { weekday: number; send_time: string };
/** one row of the grid = one time and the weekdays it goes out on; key is the row's identity while it is edited */
export interface SlotRow { key: string; time: string; days: number[] }
const hhmm = (t: string) => t.slice(0, 5);

/** The grid from a saved list: slots grouped by time, earliest first. A list with no slots rows (saved before 0105)
 *  falls back to its weekdays x send_time, so an old list opens as one full row and saves back as slots. */
export function rowsFromList(l: Pick<ListRow, "slots" | "weekdays" | "send_time">): SlotRow[] {
  const slots: Slot[] = l.slots?.length ? l.slots : l.weekdays.map((weekday) => ({ weekday, send_time: l.send_time }));
  const byTime = new Map<string, number[]>();
  for (const s of slots) byTime.set(hhmm(s.send_time), [...(byTime.get(hhmm(s.send_time)) ?? []), s.weekday]);
  return [...byTime.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([time, days], i) => ({ key: `r${i}`, time, days: [...new Set(days)].sort() }));
}

/** What is saved: each (weekday, time) once -- two rows with the same time merge -- by weekday then time. */
export function slotsFromRows(rows: ReadonlyArray<Pick<SlotRow, "time" | "days">>): Slot[] {
  const seen = new Map<string, Slot>();
  for (const r of rows) for (const weekday of r.days) seen.set(`${weekday} ${hhmm(r.time)}`, { weekday, send_time: hhmm(r.time) });
  return [...seen.values()].sort((a, b) => a.weekday - b.weekday || a.send_time.localeCompare(b.send_time));
}

/** the list card's summary: how many weekly slots (a list saved before 0105 has weekdays x one time) */
export const slotCount = (l: Pick<ListRow, "slots" | "weekdays">) => (l.slots?.length ? l.slots.length : l.weekdays.length);

const SUGGESTED = ["10:00", "12:00", "15:00", "18:00", "20:00", "09:00"];

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
          <span className="sm-muted">{l.active ? "進行中" : "已暫停"}　{slotCount(l) ? `每週 ${slotCount(l)} 個時段` : "（未設定時段）"}</span>
          <span className="sm-row">發到 {l.accounts.map((a) => { const acc = ctx.accounts.find((x) => x.id === a.account_id); return acc ? <PfMark key={a.account_id} platform={acc.platform} /> : null; })}</span>
        </button>
      ))}
      {lists && !lists.length && <span className="sm-muted">還沒有輪播清單。</span>}
      {canWrite && <button type="button" onClick={() => ctx.select({ kind: "list", id: null })}>＋ 新清單</button>}
      <span className="sm-muted">清單裡的貼文照順序輪流發，發完最後一則再從第一則開始。每天會把未來 7 天要發的排上行事曆。</span>
      <span className="sm-muted">例：一列選「10:00」＋週一、週三，另一列選「18:00」＋週五，就是每週 3 個時段。</span>
    </div>
  );
}

export function ListDetail({ ctx, listId }: { ctx: SlotContext; listId: string | null }) {
  const { brand, accounts } = ctx;
  const tz = brand.default_timezone;
  const canWrite = brand.role === "owner" || brand.role === "editor";
  const [list, setList] = useState<ListRow | null>(null);
  const [name, setName] = useState("新清單");
  const [rows, setRows] = useState<SlotRow[]>([{ key: "r0", time: "10:00", days: [] }]);
  const [pickRow, setPickRow] = useState<string | null>(null);   // the row whose time the picker is changing
  const nextKey = useRef(1);
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
    const loaded = rowsFromList(r.list);
    nextKey.current = loaded.length;
    setRows(loaded.length ? loaded : [{ key: "r0", time: r.list.send_time.slice(0, 5), days: [] }]);
    setPicked(r.list.accounts.map((a) => a.account_id));
    setItems(r.items);
    setUpcoming(r.upcoming);
  }, [brand.id, listId]);
  useEffect(() => { load().catch((e) => setHint({ text: err(e), error: true })); }, [load]);

  async function save(active: boolean) {
    const slots = slotsFromRows(rows);
    if (active && (!slots.length || !picked.length || !items.length)) return setHint({ text: "要先有發文時段、至少一個帳號、至少一則貼文，才能開始輪播。", error: true });
    setBusy(true);
    try {
      // weekdays / send_time stay in the body for the old readers; the database derives them from slots again
      const body: ListInput = {
        name: name.trim() || "清單", weekdays: [...new Set(slots.map((s) => s.weekday))], send_time: slots[0] ? slots.map((s) => s.send_time).sort()[0] : "10:00",
        active, account_ids: picked, slots,
      };
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
      <div className="sm-side" style={{ padding: 0, position: "relative" }}>
        <span className="sm-lab">每週發文時段　<span className="sm-muted">{tz}</span></span>
        {rows.map((r) => (
          <div key={r.key} className="sm-row sm-chips">
            <button type="button" aria-label={`改時間 ${r.time}`} disabled={!canWrite} onClick={() => setPickRow(r.key)}>{r.time}</button>
            {WEEKDAY_NAMES.map((n, i) => {
              const on = r.days.includes(i + 1);
              return (
                <button type="button" key={n} disabled={!canWrite} className={on ? "sm-on" : ""} aria-pressed={on} aria-label={n} title={`${r.time} 星期${n}`}
                  onClick={() => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, days: on ? x.days.filter((d) => d !== i + 1) : [...x.days, i + 1].sort() } : x)))}>{n}</button>
              );
            })}
            {canWrite && <button type="button" aria-label={`刪除 ${r.time} 這一列`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>刪除</button>}
          </div>
        ))}
        {!rows.length && <span className="sm-muted">還沒有時段，按「＋ 加一個時間」。</span>}
        {canWrite && (
          <span><button type="button" onClick={() => setRows((rs) => [...rs, { key: `r${nextKey.current++}`, time: SUGGESTED.find((t) => !rs.some((x) => x.time === t)) ?? "10:00", days: [] }])}>＋ 加一個時間</button></span>
        )}
        {pickRow && rows.some((r) => r.key === pickRow) && (
          <DateTimePicker date={null} time={rows.find((r) => r.key === pickRow)!.time} tz={tz} today={zoned(new Date(), tz).date} onClose={() => setPickRow(null)}
            onDone={(t) => { setRows((rs) => rs.map((x) => (x.key === pickRow ? { ...x, time: t } : x))); setPickRow(null); }} />
        )}
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
