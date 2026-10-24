"use client";

// The schedules page body (agency-os/docs/operations/SCHEDULES_PAGE_PLAN.md §3.2-3/4). One component for
// /ops/schedules (every client) and the client page's 維護 tab (`only` = that client's slug): one data
// source, so the two views cannot disagree.
// Layout (operator 2026-10-24): one tab bar -- one tab per client, then one per server group -- so a tab's
// content fits on screen; every setting is shown open on its card, nothing waits for a click to appear.
// Styling = theme tokens (/tools/theme, lib/theme/tokens.ts) + the shared chips (components/tools/panel-primitives.ts)
// + the app tab bar (SubTabs); every choice is a visible chip, never a <select>. Times are shown and edited
// in Taipei time; rows store UTC.
// Copy: written by GPT to the operator's rule 清楚易懂、不冗長 (WORKLOG 2026-10-15).
import { useCallback, useEffect, useState, type CSSProperties } from "react";
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
  serverReadOnly: "伺服器排程只能查看，不能在這裡修改。",
  cost: "每次執行費用",
  detail: { what: "工作內容", when: "執行時間", where: "結果存放位置", look: "查看位置", fail: "失敗處理" },
  cellOff: "未啟用",
  cellBlocked: "已啟用，無法執行：",
  panelOn: "啟用排程",
  panelFrequency: "執行頻率",
  panelWeekday: "執行星期",
  panelHour: "台北時間",
  panelLastRun: "上次執行",
  panelLastResult: "上次結果",
  resultOk: "成功",
  resultNever: "尚未執行",
  resultFailed: "失敗：",
  panelChangedBy: "最後修改者",
  changedNever: "尚未修改，使用預設值",
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
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const SERVER_BADGE: Record<SystemRow["state"], string> = {
  ok: "badge-green", stale: "badge-yellow", missing: "badge-gray", failed: "badge-red", unregistered: "badge-yellow", untracked: "badge-gray",
};
/** Server states that count as a problem on the tab label. `untracked` is by design (run-parts reports no outcome). */
const SERVER_BAD = new Set<SystemRow["state"]>(["failed", "stale", "unregistered", "missing"]);

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

function taipeiTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "每週一 11:00" / "每天 06:00" / "每小時" — the cell's actual schedule, in Taipei time. */
function cadence(job: JobMeta, c: ScheduleCell): string {
  const f = job.frequencies.find((x) => x.value === c.frequency);
  if (!f) return c.frequency;
  const tp = taipeiFromUtc(c.dayOfWeekUtc, c.hourUtc);
  if (f.usesDay) return `${f.label}${DAYS[tp.day]} ${hh(tp.hour)}`;
  return f.usesHour ? `${f.label} ${hh(tp.hour)}` : f.label;
}

/** Tab count text: "3" or "3 · 1 異常" — the problem count is the reason to open a tab first. */
const countText = (n: number, bad: number) => (bad ? `${n} · ${bad} ${T.tabProblems}` : String(n));

const card: CSSProperties = {
  background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)",
  padding: "14px 16px", fontSize: "var(--font-size-sm)", color: "var(--text-primary)", minWidth: 0,
};
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14, alignItems: "start" };
const label: CSSProperties = { fontSize: "var(--font-size-xs)", color: "var(--text-muted)", margin: "12px 0 6px" };
const muted: CSSProperties = { color: "var(--text-muted)", fontSize: "var(--font-size-xs)", lineHeight: "var(--line-height-base)" };

type TabKey = `org:${string}` | `group:${NonNullable<SystemRow["group"]>}`;
type Patch = Partial<Pick<ScheduleCell, "enabled" | "frequency" | "hourUtc" | "dayOfWeekUtc">>;

export function ScheduleTable({ only }: { only?: string }) {
  const [view, setView] = useState<SchedulesView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** The card that just saved, for its 已儲存 mark. */
  const [savedKey, setSavedKey] = useState<string | null>(null);

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
    if (!savedKey) return;
    const t = setTimeout(() => setSavedKey(null), 2500);
    return () => clearTimeout(t);
  }, [savedKey]);

  async function save(cell: ScheduleCell, patch: Patch) {
    const slug = view?.orgs.find((o) => o.id === cell.organizationId)?.slug;
    if (!slug) return;
    const next = { ...cell, ...patch };
    setSaving(true);
    setNotice(null);
    setSavedKey(null);
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
      if (!res.ok || !body?.ok) {
        const code = String(body?.error ?? `HTTP ${res.status}`);
        setNotice(code === "forbidden_role" ? T.errForbidden : code === "version_conflict" ? T.errConflict : `${T.errSave}${code}`);
      } else {
        setSavedKey(`${cell.jobKey}:${cell.organizationId}`);
      }
    } catch (e) {
      setNotice(`${T.errSave}${String(e)}`);
    } finally {
      await load();
      setSaving(false);
    }
  }

  if (loadError) return <p style={{ color: "var(--red)", fontSize: "var(--font-size-sm)" }}>{T.errLoad}{loadError}</p>;
  if (!view) return <p style={{ color: "var(--text-muted)", fontSize: "var(--font-size-sm)" }}>…</p>;

  const cellOf = (jobKey: string, orgId: string) => view.cells.find((c) => c.jobKey === jobKey && c.organizationId === orgId);
  const orgCells = (orgId: string) => view.cells.filter((c) => c.organizationId === orgId);
  // Rows without a group are problems (drift, unregistered, partial inventory): shown above the tabs on every tab.
  const problems = view.system.filter((r) => !r.group);
  const groups = only ? [] : HOST_GROUP_ORDER.filter((g) => view.system.some((r) => r.group === g));

  const tabs: Array<SubTab<TabKey>> = [
    ...view.orgs.map((o) => {
      const cs = orgCells(o.id);
      return { key: `org:${o.id}` as TabKey, label: o.name, count: countText(cs.filter((c) => c.enabled).length, cs.filter((c) => c.lastError).length) };
    }),
    ...groups.map((g) => {
      const rs = view.system.filter((r) => r.group === g);
      return { key: `group:${g}` as TabKey, label: T.group[g], count: countText(rs.length, rs.filter((r) => SERVER_BAD.has(r.state)).length) };
    }),
  ];
  const active: TabKey | undefined = tabs.find((t) => t.key === tab)?.key ?? tabs[0]?.key;
  const activeOrg = active?.startsWith("org:") ? view.orgs.find((o) => `org:${o.id}` === active) : undefined;
  const activeGroup = active?.startsWith("group:") ? groups.find((g) => `group:${g}` === active) : undefined;

  return (
    <div>
      {!only && (
        // One line, not three stat cards: the tabs must start near the top so a tab fits on screen.
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
        <div style={{ ...grid, marginBottom: 16 }}>
          {problems.map((r) => <ServerCard key={r.key} r={r} />)}
        </div>
      )}

      {tabs.length > 1 && <SubTabs<TabKey> tabs={tabs} active={active as TabKey} onChange={setTab} label={T.tabsLabel} idPrefix="schedules" />}

      {notice && <p style={{ color: "var(--red)", fontSize: "var(--font-size-sm)", margin: "0 0 12px" }}>{notice}</p>}

      <div role="tabpanel" id={active ? `schedules-panel-${active}` : undefined} aria-labelledby={active ? `schedules-tab-${active}` : undefined}>
        {activeOrg && (
          <div style={grid}>
            {view.jobs.map((job) => {
              const c = cellOf(job.key, activeOrg.id);
              return c ? (
                <JobCard key={job.key} job={job} org={activeOrg} c={c} saving={saving}
                  saved={savedKey === `${c.jobKey}:${c.organizationId}`} onSave={(p) => void save(c, p)} />
              ) : null;
            })}
          </div>
        )}
        {activeGroup && (
          <>
            <p style={{ ...muted, margin: "0 0 12px" }}>{T.serverReadOnly}</p>
            <div style={grid}>
              {view.system.filter((r) => r.group === activeGroup).map((r) => <ServerCard key={r.key} r={r} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** One client's job, every setting open whether it is on or off. */
function JobCard({ job, org, c, saving, saved, onSave }: {
  job: JobMeta; org: ScheduleOrg; c: ScheduleCell; saving: boolean; saved: boolean; onSave: (p: Patch) => void;
}) {
  const freq = job.frequencies.find((f) => f.value === c.frequency);
  const tp = taipeiFromUtc(c.dayOfWeekUtc, c.hourUtc);
  return (
    <section style={{ ...card, boxShadow: c.lastError ? "inset 3px 0 0 var(--red), var(--shadow)" : card.boxShadow }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: "var(--font-size-md)" }}>{job.label}</div>
        {saved && <span style={{ color: "var(--green)", fontSize: "var(--font-size-xs)", whiteSpace: "nowrap" }}>✓ {T.saved}</span>}
      </div>
      <div style={{ ...muted, marginTop: 4 }}>{job.description}</div>
      <div style={{ ...muted, color: "var(--text-secondary)", marginTop: 2 }}>{T.cost}：{job.cost}</div>

      <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", marginTop: 12, fontWeight: 600 }}>
        <input type="checkbox" checked={c.enabled} disabled={saving} onChange={(e) => onSave({ enabled: e.target.checked })} aria-label={`${T.panelOn} · ${job.label} · ${org.name}`} />
        {c.enabled ? `${T.panelOn}：${cadence(job, c)}` : T.cellOff}
      </label>
      {c.enabled && c.unavailable && <div style={{ color: "var(--yellow)", marginTop: 6, fontSize: "var(--font-size-xs)" }}>{T.cellBlocked}{c.unavailable}</div>}

      {/* Shown on and off alike: a job can be set up first and switched on later (the old side panel allowed it). */}
      <div style={label}>{T.panelFrequency}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {job.frequencies.map((f) => (
          <button key={f.value} type="button" disabled={saving} style={chipStyle(c.frequency === f.value)} aria-pressed={c.frequency === f.value} onClick={() => onSave({ frequency: f.value })}>{f.label}</button>
        ))}
      </div>

      {freq?.usesDay && (
        <>
          <div style={label}>{T.panelWeekday}</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {DAYS.map((d, day) => (
              <button key={day} type="button" disabled={saving} style={chipStyle(tp.day === day)} aria-pressed={tp.day === day} onClick={() => onSave(utcFromTaipei(day, tp.hour))}>{d}</button>
            ))}
          </div>
        </>
      )}

      {freq?.usesHour && (
        <>
          <div style={label}>{T.panelHour}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4 }} role="group" aria-label={T.panelHour}>
            {HOURS.map((h) => (
              <button key={h} type="button" disabled={saving} style={{ ...chipStyle(tp.hour === h), padding: "3px 0", textAlign: "center" }} aria-pressed={tp.hour === h}
                onClick={() => { if (h !== tp.hour) onSave(utcFromTaipei(tp.day, h)); }}>{hh(h)}</button>
            ))}
          </div>
        </>
      )}

      <div style={{ ...muted, marginTop: 12, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 10, rowGap: 2 }}>
        <span>{T.panelLastRun}</span>
        <span style={{ color: "var(--text-primary)" }}>{c.lastRunAt ? taipeiTime(c.lastRunAt) : T.resultNever}</span>
        <span>{T.panelLastResult}</span>
        {c.lastError ? (
          <span style={{ color: "var(--red)", wordBreak: "break-all" }}>{T.resultFailed}{taipeiTime(c.lastErrorAt)} · {c.lastError}</span>
        ) : (
          <span style={{ color: "var(--text-primary)" }}>{c.lastRunAt ? T.resultOk : T.resultNever}</span>
        )}
        <span>{T.panelChangedBy}</span>
        <span>{c.updatedBy ? `${c.updatedBy} · ${taipeiTime(c.updatedAt)}` : T.changedNever}</span>
      </div>
    </section>
  );
}

/** One host schedule, read-only, its details open. */
function ServerCard({ r }: { r: SystemRow }) {
  const last = [taipeiTime(r.lastAt), r.detail].filter((x) => x && x !== "—").join(" · ");
  return (
    <section style={{ ...card, boxShadow: SERVER_BAD.has(r.state) ? "inset 3px 0 0 var(--red), var(--shadow)" : card.boxShadow }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: "var(--font-size-md)" }}>{r.label}</div>
        <span className={`card-badge ${SERVER_BADGE[r.state]}`} style={{ whiteSpace: "nowrap" }}>{T.server[r.state]}</span>
      </div>
      <div style={{ ...muted, marginTop: 4 }}>{r.description}</div>
      <div style={{ ...muted, marginTop: 10, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 10, rowGap: 4 }}>
        {r.details.what && r.details.what !== r.description && (<><span>{T.detail.what}</span><span style={{ color: "var(--text-primary)" }}>{r.details.what}</span></>)}
        {(r.details.when || r.cadence) && (<><span>{T.detail.when}</span><span style={{ color: "var(--text-primary)" }}>{r.details.when || r.cadence}</span></>)}
        <span>{T.panelLastRun}</span><span style={{ color: "var(--text-primary)" }}>{last || "—"}</span>
        {r.details.fail && (<><span>{T.detail.fail}</span><span>{r.details.fail}</span></>)}
        {r.details.where && (<><span>{T.detail.where}</span><span style={{ wordBreak: "break-all" }}>{r.details.where}</span></>)}
        {r.details.lookHref !== "/ops/schedules" && (
          <><span>{T.detail.look}</span><span>{r.details.look} <a href={r.details.lookHref} style={{ color: "var(--accent)" }}>前往</a></span></>
        )}
      </div>
    </section>
  );
}
