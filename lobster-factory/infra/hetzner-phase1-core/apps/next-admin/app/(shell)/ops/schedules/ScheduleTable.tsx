"use client";

// The schedules page body (agency-os/docs/operations/SCHEDULES_PAGE_PLAN.md §3.2-3/4). One component for
// /ops/schedules (every client) and the client page's 維護 tab (`only` = that client's slug): one data
// source, so the two views cannot disagree.
// Layout (operator 2026-10-24): tabs = jobs (a fixed, small set) + server groups, never clients -- clients grow
// without bound, so they are rows: searchable, filterable, failures first, bulk-editable. Every setting sits on
// its row; nothing waits for a click to appear.
// Styling = theme tokens (/tools/theme, lib/theme/tokens.ts) + the shared chips (components/tools/panel-primitives.ts)
// + the app tab bar (SubTabs); every choice is a visible chip, never a <select>. Times are shown and edited
// in Taipei time; rows store UTC.
// Copy: written by GPT to the operator's rule 清楚易懂、不冗長 (WORKLOG 2026-10-15).
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { roleHeader } from "@/lib/ops-role";
import { taipeiFromUtc, utcFromTaipei } from "@/lib/schedules/schedule";
import type { JobMeta, ScheduleCell, ScheduleOrg, SchedulesView, SystemRow } from "@/lib/schedules/types";
import { HOST_GROUP_ORDER, HOST_UI } from "@/lib/schedules/host-jobs";
import { chipStyle } from "@/components/tools/panel-primitives";
import { SubTabs, type SubTab } from "../clients/[slug]/hub-ui";

const T = {
  statEnabled: "可執行排程",
  statRanToday: "今日已執行",
  statFailing: "失敗排程",
  tabsLabel: "排程分類",
  tabProblems: "異常",
  tabFailed: "失敗",
  search: "搜尋網站",
  searchServer: "搜尋排程",
  filter: { all: "全部", failed: "失敗", on: "已啟用", off: "未啟用", bad: "異常" },
  bulkHint: "勾選左邊的網站，就能一次改很多個。",
  bulkSelected: "已選 {n} 個網站，全部改成：",
  bulkOn: "全部開啟",
  bulkOff: "全部關閉",
  bulkTime: "套用時間",
  bulkClear: "取消選取",
  shown: "顯示 {n} / {total} 個 · 失敗的排在最上面",
  serverReadOnly: "伺服器排程只能查看，不能在這裡修改。",
  cost: "每次執行費用",
  col: { site: "網站", on: "開關", freq: "頻率", day: "星期", hour: "台北時間", last: "上次結果", job: "排程", when: "執行時間", state: "狀態" },
  detail: { what: "工作內容", when: "執行時間", where: "結果存放位置", look: "查看位置", fail: "失敗處理" },
  cellBlocked: "已啟用，無法執行：",
  panelOn: "啟用排程",
  pickHour: "選擇台北時間",
  resultOk: "成功",
  resultNever: "尚未執行",
  resultFailed: "失敗：",
  saved: "已儲存",
  errForbidden: "只有擁有者或管理員可以修改",
  errConflict: "其他人剛修改此排程，頁面已重新載入，請再試一次",
  errSave: "儲存失敗，錯誤代碼：",
  errLoad: "頁面載入失敗，錯誤代碼：",
  server: {
    ok: "正常", stale: "長時間未回報", missing: "尚無資料", failed: "執行失敗",
    unregistered: HOST_UI.state_unregistered, untracked: HOST_UI.state_untracked,
  } as Record<SystemRow["state"], string>,
  group: { backup: HOST_UI.group_backup, deploy: HOST_UI.group_deploy, site: HOST_UI.group_site } as Record<NonNullable<SystemRow["group"]>, string>,
};

const DAYS = ["日", "一", "二", "三", "四", "五", "六"];
const SERVER_BADGE: Record<SystemRow["state"], string> = {
  ok: "badge-green", stale: "badge-yellow", missing: "badge-gray", failed: "badge-red", unregistered: "badge-yellow", untracked: "badge-gray",
};
/** Server states that count as a problem. `untracked` is by design (run-parts reports no outcome). */
const SERVER_BAD = new Set<SystemRow["state"]>(["failed", "stale", "unregistered", "missing"]);

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const fill = (tpl: string, v: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

function taipeiTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Tab count text: "3" or "3 · 1 失敗" — the problem count is the reason to open a tab first. */
const countText = (n: number, bad: number, word: string) => (bad ? `${n} · ${bad} ${word}` : String(n));

const card: CSSProperties = {
  background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)",
  fontSize: "var(--font-size-sm)", color: "var(--text-primary)", minWidth: 0,
};
const muted: CSSProperties = { color: "var(--text-muted)", fontSize: "var(--font-size-xs)", lineHeight: "var(--line-height-base)" };
const headCell: CSSProperties = { ...muted, fontWeight: "var(--font-weight-semibold)" as CSSProperties["fontWeight"] };
const input: CSSProperties = {
  width: 180, padding: "5px 10px", fontSize: "var(--font-size-sm)", borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)", background: "var(--card-bg)", color: "var(--text-primary)",
};
/** Client-job rows: select | site | on | frequency | weekday | hour | last result. */
/** The weekday column only exists when some frequency on screen uses a weekday (a monthly job has none). */
const jobGrid = (showDay: boolean) => `28px minmax(140px, 1.2fr) 48px minmax(150px, 1.3fr)${showDay ? " 236px" : ""} 118px minmax(170px, 1.4fr)`;
/** Server rows: schedule | when | last run | state. */
const SERVER_GRID = "minmax(220px, 2fr) minmax(130px, 1fr) minmax(150px, 1fr) 96px";

type TabKey = `job:${string}` | `group:${NonNullable<SystemRow["group"]>}`;
type Patch = Partial<Pick<ScheduleCell, "enabled" | "frequency" | "hourUtc" | "dayOfWeekUtc">>;
type JobFilter = "all" | "failed" | "on" | "off";

export function ScheduleTable({ only }: { only?: string }) {
  const [view, setView] = useState<SchedulesView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey | null>(null);
  const [query, setQuery] = useState("");
  const [jobFilter, setJobFilter] = useState<JobFilter>("all");
  const [serverBadOnly, setServerBadOnly] = useState(false);
  /** Selected organization ids on the current job tab (cleared on tab change). */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkHour, setBulkHour] = useState(6);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** Row keys that just saved, for their 已儲存 mark. */
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/ops/schedules${only ? `?slug=${encodeURIComponent(only)}` : ""}`, { headers: { ...roleHeader("admin") }, cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) return setLoadError(String(body?.error ?? `HTTP ${res.status}`));
      setLoadError(null);
      setView(body.view as SchedulesView);
    } catch (e) {
      setLoadError(String(e));
    }
  }, [only]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!savedKeys.size) return;
    const t = setTimeout(() => setSavedKeys(new Set()), 2500);
    return () => clearTimeout(t);
  }, [savedKeys]);

  /** One PATCH; returns null on success, else the operator-facing error. */
  async function patchCell(cell: ScheduleCell, patch: Patch): Promise<string | null> {
    const slug = view?.orgs.find((o) => o.id === cell.organizationId)?.slug;
    if (!slug) return `${T.errSave}unknown_client`;
    const next = { ...cell, ...patch };
    try {
      const res = await fetch(`/api/ops/clients/${encodeURIComponent(slug)}/schedules/${cell.jobKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...roleHeader("admin") },
        body: JSON.stringify({
          enabled: next.enabled, frequency: next.frequency, hourUtc: next.hourUtc, dayOfWeekUtc: next.dayOfWeekUtc,
          ...(cell.version !== null ? { expectedVersion: cell.version } : {}),
        }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) return null;
      const code = String(body?.error ?? `HTTP ${res.status}`);
      return code === "forbidden_role" ? T.errForbidden : code === "version_conflict" ? T.errConflict : `${T.errSave}${code}`;
    } catch (e) {
      return `${T.errSave}${String(e)}`;
    }
  }

  /** Saves one or many cells (bulk = the same patch, or a per-cell patch), then reloads the view once. */
  async function save(items: Array<{ cell: ScheduleCell; patch: Patch }>) {
    if (!items.length) return;
    setSaving(true);
    setNotice(null);
    setSavedKeys(new Set());
    const ok = new Set<string>();
    let firstError: string | null = null;
    for (const { cell, patch } of items) {
      const err = await patchCell(cell, patch);
      if (err) firstError ??= err;
      else ok.add(`${cell.jobKey}:${cell.organizationId}`);
    }
    if (firstError) setNotice(items.length > 1 ? `${firstError}（${ok.size} / ${items.length}）` : firstError);
    setSavedKeys(ok);
    await load();
    setSaving(false);
  }

  if (loadError) return <p style={{ color: "var(--red)", fontSize: "var(--font-size-sm)" }}>{T.errLoad}{loadError}</p>;
  if (!view) return <p style={{ color: "var(--text-muted)", fontSize: "var(--font-size-sm)" }}>…</p>;

  // Rows without a group are problems (drift, unregistered, partial inventory): shown above the tabs on every tab.
  const problems = view.system.filter((r) => !r.group);
  const groups = only ? [] : HOST_GROUP_ORDER.filter((g) => view.system.some((r) => r.group === g));
  const jobCells = (jobKey: string) => view.cells.filter((c) => c.jobKey === jobKey);

  const tabs: Array<SubTab<TabKey>> = [
    ...(only ? [] : view.jobs).map((j) => {
      const cs = jobCells(j.key);
      return { key: `job:${j.key}` as TabKey, label: j.label, count: countText(cs.filter((c) => c.enabled).length, cs.filter((c) => c.lastError).length, T.tabFailed) };
    }),
    ...groups.map((g) => {
      const rs = view.system.filter((r) => r.group === g);
      return { key: `group:${g}` as TabKey, label: T.group[g], count: countText(rs.length, rs.filter((r) => SERVER_BAD.has(r.state)).length, T.tabProblems) };
    }),
  ];
  const active: TabKey | undefined = tabs.find((t) => t.key === tab)?.key ?? tabs[0]?.key;
  const activeJob = active?.startsWith("job:") ? view.jobs.find((j) => `job:${j.key}` === active) : undefined;
  const activeGroup = active?.startsWith("group:") ? groups.find((g) => `group:${g}` === active) : undefined;
  const changeTab = (k: TabKey) => { setTab(k); setSelected(new Set()); setQuery(""); };

  return (
    <div>
      {!only && (
        // One line, not stat cards: the tabs must start near the top.
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 16, fontSize: "var(--font-size-sm)", color: "var(--text-muted)" }}>
          {[
            [T.statEnabled, view.summary.enabled, "var(--text-primary)"],
            [T.statRanToday, view.summary.ranToday, "var(--text-primary)"],
            [T.statFailing, view.summary.failing, view.summary.failing ? "var(--red)" : "var(--text-primary)"],
          ].map(([k, v, color]) => (
            <span key={String(k)}>{k} <b style={{ color: String(color), fontSize: "var(--font-size-md)" }}>{v}</b></span>
          ))}
        </div>
      )}

      {problems.length > 0 && (
        <div style={{ ...card, marginBottom: 16, overflowX: "auto" }}>
          {problems.map((r) => <ServerRow key={r.key} r={r} />)}
        </div>
      )}

      {tabs.length > 1 && <SubTabs<TabKey> tabs={tabs} active={active as TabKey} onChange={changeTab} label={T.tabsLabel} idPrefix="schedules" />}

      {notice && <p style={{ color: "var(--red)", fontSize: "var(--font-size-sm)", margin: "0 0 12px" }}>{notice}</p>}

      <div role="tabpanel" id={active ? `schedules-panel-${active}` : undefined} aria-labelledby={active ? `schedules-tab-${active}` : undefined}>
        {only && <ClientJobs jobs={view.jobs} cells={view.cells} saving={saving} savedKeys={savedKeys} save={(items) => void save(items)} />}
        {activeJob && (
          <JobTable
            job={activeJob} orgs={view.orgs} cells={jobCells(activeJob.key)}
            query={query} setQuery={setQuery} filter={jobFilter} setFilter={setJobFilter}
            selected={selected} setSelected={setSelected} bulkHour={bulkHour} setBulkHour={setBulkHour}
            saving={saving} savedKeys={savedKeys} save={(items) => void save(items)}
          />
        )}
        {activeGroup && (
          <ServerTable rows={view.system.filter((r) => r.group === activeGroup)} query={query} setQuery={setQuery} badOnly={serverBadOnly} setBadOnly={setServerBadOnly} />
        )}
      </div>
    </div>
  );
}

function Toolbar({ query, setQuery, placeholder, children }: { query: string; setQuery: (q: string) => void; placeholder: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder} style={input} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

/** One job, one row per client: every setting on the row, failures first, bulk edits for many clients. */
function JobTable({ job, orgs, cells, query, setQuery, filter, setFilter, selected, setSelected, bulkHour, setBulkHour, saving, savedKeys, save }: {
  job: JobMeta; orgs: ScheduleOrg[]; cells: ScheduleCell[];
  query: string; setQuery: (q: string) => void; filter: JobFilter; setFilter: (f: JobFilter) => void;
  selected: Set<string>; setSelected: (s: Set<string>) => void; bulkHour: number; setBulkHour: (h: number) => void;
  saving: boolean; savedKeys: Set<string>; save: (items: Array<{ cell: ScheduleCell; patch: Patch }>) => void;
}) {
  const name = (id: string) => orgs.find((o) => o.id === id)?.name ?? id;
  const counts = { all: cells.length, failed: cells.filter((c) => c.lastError).length, on: cells.filter((c) => c.enabled).length, off: cells.filter((c) => !c.enabled).length };
  const q = query.trim().toLowerCase();
  const rows = cells
    .filter((c) => !q || name(c.organizationId).toLowerCase().includes(q))
    .filter((c) => filter === "all" || (filter === "failed" ? Boolean(c.lastError) : filter === "on" ? c.enabled : !c.enabled))
    .sort((a, b) => Number(Boolean(b.lastError)) - Number(Boolean(a.lastError)) || name(a.organizationId).localeCompare(name(b.organizationId), "zh-Hant"));
  const picked = cells.filter((c) => selected.has(c.organizationId));
  const allPicked = rows.length > 0 && rows.every((c) => selected.has(c.organizationId));
  const usesHour = job.frequencies.some((f) => f.usesHour);
  const showDay = job.frequencies.some((f) => f.usesDay);
  const toggle = (id: string, on: boolean) => { const s = new Set(selected); if (on) s.add(id); else s.delete(id); setSelected(s); };

  return (
    <>
      <p style={{ ...muted, margin: "0 0 10px" }}>{job.description}　{T.cost}：{job.cost}</p>
      <Toolbar query={query} setQuery={setQuery} placeholder={T.search}>
        {(["all", "failed", "on", "off"] as const).map((f) => (
          <button key={f} type="button" style={chipStyle(filter === f)} aria-pressed={filter === f} onClick={() => setFilter(f)}>{T.filter[f]} {counts[f]}</button>
        ))}
      </Toolbar>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 12px", marginBottom: 10, borderRadius: "var(--radius)", border: "1px dashed var(--border)", fontSize: "var(--font-size-sm)", minHeight: 40 }}>
        {picked.length ? (
          <>
            <b>{fill(T.bulkSelected, { n: picked.length })}</b>
            <button type="button" disabled={saving} style={chipStyle(false)} onClick={() => save(picked.map((cell) => ({ cell, patch: { enabled: true } })))}>{T.bulkOn}</button>
            <button type="button" disabled={saving} style={chipStyle(false)} onClick={() => save(picked.map((cell) => ({ cell, patch: { enabled: false } })))}>{T.bulkOff}</button>
            {job.frequencies.length > 1 && job.frequencies.map((f) => (
              <button key={f.value} type="button" disabled={saving} style={chipStyle(false)} onClick={() => save(picked.map((cell) => ({ cell, patch: { frequency: f.value } })))}>{f.label}</button>
            ))}
            {usesHour && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <HourPicker hour={bulkHour} disabled={saving} onChange={setBulkHour} />
                <button type="button" disabled={saving} style={chipStyle(false)}
                  onClick={() => save(picked.map((cell) => ({ cell, patch: utcFromTaipei(taipeiFromUtc(cell.dayOfWeekUtc, cell.hourUtc).day, bulkHour) })))}>{T.bulkTime}</button>
              </span>
            )}
            <button type="button" style={chipStyle(false)} onClick={() => setSelected(new Set())}>{T.bulkClear}</button>
          </>
        ) : (
          <span style={muted}>{T.bulkHint}</span>
        )}
      </div>

      <div style={{ ...card, overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: jobGrid(showDay), gap: 10, padding: "8px 14px", borderBottom: "1px solid var(--border)", minWidth: 900, alignItems: "center" }}>
          <span><input type="checkbox" checked={allPicked} aria-label={T.bulkClear}
            onChange={(e) => { const s = new Set(selected); rows.forEach((c) => (e.target.checked ? s.add(c.organizationId) : s.delete(c.organizationId))); setSelected(s); }} /></span>
          <span style={headCell}>{T.col.site}</span>
          <span style={headCell}>{T.col.on}</span>
          <span style={headCell}>{T.col.freq}</span>
          {showDay && <span style={headCell}>{T.col.day}</span>}
          <span style={headCell}>{T.col.hour}</span>
          <span style={headCell}>{T.col.last}</span>
        </div>
        {rows.map((c) => (
          <JobRow key={c.organizationId} job={job} c={c} name={name(c.organizationId)} single={false} showDay={showDay}
            picked={selected.has(c.organizationId)} onPick={(on) => toggle(c.organizationId, on)}
            saving={saving} saved={savedKeys.has(`${c.jobKey}:${c.organizationId}`)} onSave={(patch) => save([{ cell: c, patch }])} />
        ))}
      </div>
      <p style={{ ...muted, margin: "8px 0 0" }}>{fill(T.shown, { n: rows.length, total: cells.length })}</p>
    </>
  );
}

/** A single client's page: every job of that client in one table, one row per job (a client has few jobs). */
function ClientJobs({ jobs, cells, saving, savedKeys, save }: {
  jobs: JobMeta[]; cells: ScheduleCell[]; saving: boolean; savedKeys: Set<string>; save: (items: Array<{ cell: ScheduleCell; patch: Patch }>) => void;
}) {
  const showDay = jobs.some((j) => j.frequencies.some((f) => f.usesDay));
  return (
    <div style={{ ...card, overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: jobGrid(showDay), gap: 10, padding: "8px 14px", borderBottom: "1px solid var(--border)", minWidth: 900, alignItems: "center" }}>
        <span />
        <span style={headCell}>{T.col.job}</span>
        <span style={headCell}>{T.col.on}</span>
        <span style={headCell}>{T.col.freq}</span>
        {showDay && <span style={headCell}>{T.col.day}</span>}
        <span style={headCell}>{T.col.hour}</span>
        <span style={headCell}>{T.col.last}</span>
      </div>
      {jobs.map((job) => {
        const c = cells.find((x) => x.jobKey === job.key);
        return c ? (
          <JobRow key={job.key} job={job} c={c} name={job.label} sub={`${job.description}　${T.cost}：${job.cost}`} single showDay={showDay} picked={false} onPick={() => {}}
            saving={saving} saved={savedKeys.has(`${c.jobKey}:${c.organizationId}`)} onSave={(patch) => save([{ cell: c, patch }])} />
        ) : null;
      })}
    </div>
  );
}

/** The hour shows as a button; clicking it opens all 24 hours as a grid -- any hour in two clicks.
 *  Fixed-positioned so the rows' horizontal-scroll box does not clip it; closes on pick, Escape, outside click or scroll. */
function HourPicker({ hour, disabled, onChange }: { hour: number; disabled: boolean; onChange: (h: number) => void }) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    const onDown = (e: MouseEvent) => { if (!panelRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); window.removeEventListener("scroll", close, true); };
  }, [at]);
  const open = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 290, height = 150;
    setAt({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: r.bottom + height + 8 > window.innerHeight ? r.top - height - 4 : r.bottom + 4 });
  };
  return (
    <>
      <button ref={btnRef} type="button" disabled={disabled} aria-label={T.pickHour} aria-expanded={Boolean(at)}
        style={{ ...chipStyle(Boolean(at)), padding: "3px 12px", fontSize: "var(--font-size-sm)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
        onClick={() => (at ? setAt(null) : open())}>{hh(hour)}</button>
      {at && (
        <div ref={panelRef} role="group" aria-label={T.pickHour} style={{
          position: "fixed", left: at.left, top: at.top, zIndex: 50, width: 290, padding: 8, display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4,
          // Themes may give --card-bg alpha (cards show the page through); a floating panel must not, so the card
          // tint is laid over the page colour, which is always opaque.
          background: "linear-gradient(var(--card-bg), var(--card-bg)), var(--body-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)",
        }}>
          {Array.from({ length: 24 }, (_, h) => (
            <button key={h} type="button" style={{ ...chipStyle(h === hour), padding: "4px 0", textAlign: "center", fontVariantNumeric: "tabular-nums" }} aria-pressed={h === hour}
              onClick={() => { setAt(null); if (h !== hour) onChange(h); }}>{hh(h)}</button>
          ))}
        </div>
      )}
    </>
  );
}

function JobRow({ job, c, name, sub, single, showDay, picked, onPick, saving, saved, onSave }: {
  job: JobMeta; c: ScheduleCell; name: string; sub?: string; single: boolean; showDay: boolean; picked: boolean; onPick: (on: boolean) => void;
  saving: boolean; saved: boolean; onSave: (p: Patch) => void;
}) {
  const freq = job.frequencies.find((f) => f.value === c.frequency);
  const tp = taipeiFromUtc(c.dayOfWeekUtc, c.hourUtc);
  const dim: CSSProperties = c.enabled ? {} : { opacity: 0.55 };
  return (
    <div style={{
      display: "grid", gridTemplateColumns: jobGrid(showDay), gap: 10, padding: "8px 14px", borderBottom: "1px solid var(--border-subtle)", minWidth: 900, alignItems: "center",
      background: c.lastError ? "color-mix(in srgb, var(--red) 8%, transparent)" : picked ? "color-mix(in srgb, var(--accent) 10%, transparent)" : undefined,
    }}>
      <span>{!single && <input type="checkbox" checked={picked} onChange={(e) => onPick(e.target.checked)} aria-label={name} />}</span>
      <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={name}>
        {name}
        {saved && <span style={{ color: "var(--green)", fontWeight: 400, fontSize: "var(--font-size-xs)", marginLeft: 6 }}>✓ {T.saved}</span>}
        {sub && <div style={{ ...muted, fontWeight: 400, whiteSpace: "normal" }}>{sub}</div>}
        {c.enabled && c.unavailable && <div style={{ color: "var(--yellow)", fontWeight: 400, fontSize: "var(--font-size-xs)", whiteSpace: "normal" }}>{T.cellBlocked}{c.unavailable}</div>}
      </span>
      <span><input type="checkbox" checked={c.enabled} disabled={saving} onChange={(e) => onSave({ enabled: e.target.checked })} aria-label={`${T.panelOn} · ${job.label} · ${name}`} /></span>
      <span style={{ display: "flex", gap: 4, flexWrap: "wrap", ...dim }}>
        {job.frequencies.map((f) => (
          <button key={f.value} type="button" disabled={saving} style={chipStyle(c.frequency === f.value)} aria-pressed={c.frequency === f.value} onClick={() => onSave({ frequency: f.value })}>{f.label}</button>
        ))}
      </span>
      {showDay && (
        <span style={{ display: "flex", gap: 3, flexWrap: "nowrap", ...dim }}>
          {freq?.usesDay ? DAYS.map((d, day) => (
            <button key={day} type="button" disabled={saving} style={{ ...chipStyle(tp.day === day), padding: "3px 0", width: 29, textAlign: "center" }} aria-pressed={tp.day === day} onClick={() => onSave(utcFromTaipei(day, tp.hour))}>{d}</button>
          )) : <span style={muted}>—</span>}
        </span>
      )}
      <span style={dim}>
        {freq?.usesHour ? <HourPicker hour={tp.hour} disabled={saving} onChange={(h) => onSave(utcFromTaipei(tp.day, h))} /> : <span style={muted}>—</span>}
      </span>
      <span style={{ ...muted, display: "flex", flexDirection: "column" }}>
        {c.lastError ? (
          <span style={{ color: "var(--red)", wordBreak: "break-all" }}>{T.resultFailed}{taipeiTime(c.lastErrorAt)} · {c.lastError}</span>
        ) : (
          <span style={{ color: c.lastRunAt ? "var(--text-primary)" : undefined }}>{c.lastRunAt ? `${T.resultOk} · ${taipeiTime(c.lastRunAt)}` : T.resultNever}</span>
        )}
        {c.updatedBy && <span>{c.updatedBy} · {taipeiTime(c.updatedAt)}</span>}
      </span>
    </div>
  );
}

function ServerTable({ rows, query, setQuery, badOnly, setBadOnly }: {
  rows: SystemRow[]; query: string; setQuery: (q: string) => void; badOnly: boolean; setBadOnly: (b: boolean) => void;
}) {
  const q = query.trim().toLowerCase();
  const bad = rows.filter((r) => SERVER_BAD.has(r.state)).length;
  const shown = rows
    .filter((r) => !q || `${r.label} ${r.description}`.toLowerCase().includes(q))
    .filter((r) => !badOnly || SERVER_BAD.has(r.state))
    .sort((a, b) => Number(SERVER_BAD.has(b.state)) - Number(SERVER_BAD.has(a.state)));
  return (
    <>
      <p style={{ ...muted, margin: "0 0 10px" }}>{T.serverReadOnly}</p>
      <Toolbar query={query} setQuery={setQuery} placeholder={T.searchServer}>
        <button type="button" style={chipStyle(!badOnly)} aria-pressed={!badOnly} onClick={() => setBadOnly(false)}>{T.filter.all} {rows.length}</button>
        <button type="button" style={chipStyle(badOnly)} aria-pressed={badOnly} onClick={() => setBadOnly(true)}>{T.filter.bad} {bad}</button>
      </Toolbar>
      <div style={{ ...card, overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: SERVER_GRID, gap: 12, padding: "8px 14px", borderBottom: "1px solid var(--border)", minWidth: 760 }}>
          <span style={headCell}>{T.col.job}</span>
          <span style={headCell}>{T.col.when}</span>
          <span style={headCell}>{T.col.last}</span>
          <span style={headCell}>{T.col.state}</span>
        </div>
        {shown.map((r) => <ServerRow key={r.key} r={r} />)}
      </div>
      <p style={{ ...muted, margin: "8px 0 0" }}>{fill(T.shown, { n: shown.length, total: rows.length })}</p>
    </>
  );
}

/** One host schedule, read-only; its details on a second line, never behind a click. */
function ServerRow({ r }: { r: SystemRow }) {
  const last = [taipeiTime(r.lastAt), r.detail].filter((x) => x && x !== "—").join(" · ");
  const extra = [
    r.details.what && r.details.what !== r.description ? `${T.detail.what}：${r.details.what}` : "",
    r.details.fail ? `${T.detail.fail}：${r.details.fail}` : "",
    r.details.where ? `${T.detail.where}：${r.details.where}` : "",
  ].filter(Boolean);
  return (
    <div style={{
      display: "grid", gridTemplateColumns: SERVER_GRID, gap: 12, padding: "9px 14px", borderBottom: "1px solid var(--border-subtle)", minWidth: 760,
      background: SERVER_BAD.has(r.state) ? "color-mix(in srgb, var(--red) 8%, transparent)" : undefined,
    }}>
      <span style={{ minWidth: 0 }}>
        <b>{r.label}</b>
        <div style={{ ...muted, marginTop: 2 }}>{r.description}</div>
        {extra.map((x) => <div key={x} style={{ ...muted, marginTop: 2, wordBreak: "break-all" }}>{x}</div>)}
        {r.details.lookHref !== "/ops/schedules" && (
          <div style={{ ...muted, marginTop: 2 }}>{T.detail.look}：{r.details.look} <a href={r.details.lookHref} style={{ color: "var(--accent)" }}>前往</a></div>
        )}
      </span>
      <span style={{ fontSize: "var(--font-size-sm)" }}>{r.details.when || r.cadence || "—"}</span>
      <span style={{ fontSize: "var(--font-size-sm)" }}>{last || "—"}</span>
      <span><span className={`card-badge ${SERVER_BADGE[r.state]}`} style={{ whiteSpace: "nowrap" }}>{T.server[r.state]}</span></span>
    </div>
  );
}
