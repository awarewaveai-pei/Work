"use client";

// The schedules table (agency-os/docs/operations/SCHEDULES_PAGE_PLAN.md §3.2-3/4). One component for
// /ops/schedules (every client) and the client page's 維護 tab (`only` = that client's slug): one data
// source, so the two views cannot disagree. Rows = clients (they grow), columns = jobs (few), the clicked cell's settings beside.
// Styling = theme tokens (/tools/theme, lib/theme/tokens.ts) + the shared chips (components/tools/panel-primitives.ts);
// every choice is a visible chip, never a <select>. Times are shown and edited in Taipei time; rows store UTC.
// Copy: written by GPT to the operator's rule 清楚易懂、不冗長 (WORKLOG 2026-10-15).
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { roleHeader } from "@/lib/ops-role";
import { taipeiFromUtc, utcFromTaipei } from "@/lib/schedules/schedule";
import type { JobMeta, ScheduleCell, SchedulesView, SystemRow } from "@/lib/schedules/types";
import { chipStyle } from "@/components/tools/panel-primitives";

const T = {
  statEnabled: "可執行排程",
  statRanToday: "今日已執行",
  statFailing: "失敗排程",
  sectionClient: "客戶排程",
  sectionServer: "伺服器排程（唯讀）",
  serverHint: "點選伺服器工作列，查看詳細資料。",
  cost: "每次執行費用",
  detail: { what: "工作內容", when: "執行時間", where: "結果存放位置", look: "查看位置", fail: "失敗處理" },
  cellOff: "未啟用",
  cellBlocked: "已啟用，無法執行：",
  panelEmpty: "請先點選一個排程。",
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
  errForbidden: "只有擁有者或管理員可以修改",
  errConflict: "其他人剛修改此排程，頁面已重新載入，請再試一次",
  errSave: "儲存失敗，錯誤代碼：",
  errLoad: "頁面載入失敗，錯誤代碼：",
  server: { ok: "正常", stale: "長時間未回報", missing: "尚無資料", failed: "執行失敗" } as Record<SystemRow["state"], string>,
};

const DAYS = ["日", "一", "二", "三", "四", "五", "六"];
const SERVER_BADGE: Record<SystemRow["state"], string> = { ok: "badge-green", stale: "badge-yellow", missing: "badge-gray", failed: "badge-red" };

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

const card: CSSProperties = {
  background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)",
};
const th: CSSProperties = {
  textAlign: "left", padding: "10px 14px", fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)" as CSSProperties["fontWeight"],
  color: "var(--text-muted)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
};
const td: CSSProperties = { padding: "12px 14px", borderBottom: "1px solid var(--border-subtle)", verticalAlign: "top", fontSize: "var(--font-size-sm)" };
const label: CSSProperties = { fontSize: "var(--font-size-xs)", color: "var(--text-muted)", margin: "14px 0 6px" };

export function ScheduleTable({ only }: { only?: string }) {
  const [view, setView] = useState<SchedulesView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ jobKey: string; organizationId: string } | null>(null);
  const [serverKey, setServerKey] = useState<string | null>(null);
  const pickCell = (jobKey: string, organizationId: string) => { setSelected({ jobKey, organizationId }); setServerKey(null); };
  const pickServer = (key: string) => { setServerKey(key); setSelected(null); };
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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

  async function save(cell: ScheduleCell, patch: Partial<Pick<ScheduleCell, "enabled" | "frequency" | "hourUtc" | "dayOfWeekUtc">>) {
    const slug = view?.orgs.find((o) => o.id === cell.organizationId)?.slug;
    if (!slug) return;
    const next = { ...cell, ...patch };
    setSaving(true);
    setNotice(null);
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
  const sel = selected ? cellOf(selected.jobKey, selected.organizationId) : undefined;
  const selJob = sel ? view.jobs.find((j) => j.key === sel.jobKey) : undefined;
  const selOrg = sel ? view.orgs.find((o) => o.id === sel.organizationId) : undefined;
  const selFreq = selJob?.frequencies.find((f) => f.value === sel?.frequency);
  const selTp = sel ? taipeiFromUtc(sel.dayOfWeekUtc, sel.hourUtc) : null;
  const server = serverKey ? view.system.find((r) => r.key === serverKey) : undefined;

  return (
    <div>
      {!only && (
        <div className="card-grid" style={{ marginBottom: 24 }}>
          {[
            [T.statEnabled, view.summary.enabled, "var(--text-primary)"],
            [T.statRanToday, view.summary.ranToday, "var(--text-primary)"],
            [T.statFailing, view.summary.failing, view.summary.failing ? "var(--red)" : "var(--text-primary)"],
          ].map(([k, v, color]) => (
            <div key={String(k)} className="card">
              <div className="card-label">{k}</div>
              <div className="card-value" style={{ color: String(color), marginTop: 8 }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {notice && <p style={{ color: "var(--red)", fontSize: "var(--font-size-sm)", margin: "0 0 12px" }}>{notice}</p>}

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 520px", minWidth: 0 }}>
        <div className="section-title">{T.sectionClient}</div>
        <div style={{ ...card, overflowX: "auto", marginBottom: 28 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", color: "var(--text-primary)" }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 180 }} />
                {view.jobs.map((job) => (
                  <th key={job.key} style={{ ...th, whiteSpace: "normal", minWidth: 200 }}>
                    <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 700, color: "var(--text-primary)" }}>{job.label}</div>
                    <div style={{ fontWeight: 400, marginTop: 4, lineHeight: "var(--line-height-base)" }}>{job.description}</div>
                    <div style={{ fontWeight: 400, marginTop: 4, lineHeight: "var(--line-height-base)", color: "var(--text-secondary)" }}>{T.cost}：{job.cost}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.orgs.map((o) => (
                <tr key={o.id}>
                  <td style={{ ...td, fontWeight: 600 }}>{o.name}</td>
                  {view.jobs.map((job) => {
                    const c = cellOf(job.key, o.id);
                    if (!c) return <td key={job.key} style={td} />;
                    const isSel = selected?.jobKey === job.key && selected.organizationId === o.id;
                    return (
                      <td
                        key={job.key}
                        onClick={() => pickCell(job.key, o.id)}
                        style={{ ...td, cursor: "pointer", background: isSel ? "var(--bg-hover)" : undefined, boxShadow: isSel ? "inset 3px 0 0 var(--accent)" : undefined }}
                      >
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={c.enabled} disabled={saving} onChange={(e) => void save(c, { enabled: e.target.checked })} aria-label={`${job.label} · ${o.name}`} />
                          <span style={{ color: c.enabled ? "var(--text-primary)" : "var(--text-muted)" }}>{c.enabled ? cadence(job, c) : T.cellOff}</span>
                        </label>
                        {c.enabled && c.unavailable && (
                          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--yellow)", marginTop: 4 }}>{T.cellBlocked}{c.unavailable}</div>
                        )}
                        {c.enabled && !c.unavailable && (c.lastError || c.lastRunAt) && (
                          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                            <span className={`dot ${c.lastError ? "dot-red" : "dot-green"}`} />
                            {c.lastError ? `${T.resultFailed}${taipeiTime(c.lastErrorAt)}` : `${T.panelLastRun} ${taipeiTime(c.lastRunAt)}`}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {view.system.length > 0 && (
          <>
            <div className="section-title">{T.sectionServer}</div>
            <p style={{ color: "var(--text-muted)", fontSize: "var(--font-size-xs)", margin: "-6px 0 10px" }}>{T.serverHint}</p>
            <div className="ops-table">
              {view.system.map((r) => (
                <div
                  key={r.key}
                  className="ops-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => pickServer(r.key)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") pickServer(r.key); }}
                  style={{ gridTemplateColumns: "minmax(140px, max-content) 1fr auto", cursor: "pointer", background: serverKey === r.key ? "var(--bg-hover)" : undefined, boxShadow: serverKey === r.key ? "inset 3px 0 0 var(--accent)" : undefined }}
                >
                  <div className="ops-row-key">{r.label}</div>
                  <div className="ops-row-val">
                    {r.description}
                    <div>{r.cadence} · {taipeiTime(r.lastAt)}{r.detail ? ` · ${r.detail}` : ""}</div>
                  </div>
                  <span className={`card-badge ${SERVER_BADGE[r.state]}`}>{T.server[r.state]}</span>
                </div>
              ))}
            </div>
          </>
        )}
        </div>


        <aside style={{ ...card, flex: "0 1 320px", minWidth: 280, padding: "16px 18px", fontSize: "var(--font-size-sm)", color: "var(--text-primary)", position: "sticky", top: 16 }}>
          {server ? (
            <>
              <div style={{ fontWeight: 700, fontSize: "var(--font-size-md)" }}>{server.label}</div>
              <div style={{ color: "var(--text-muted)", marginTop: 2 }}>{server.cadence} · {T.server[server.state]}</div>
              {(["what", "when", "where", "look", "fail"] as const).map((k) => (
                <div key={k}>
                  <div style={label}>{T.detail[k]}</div>
                  <div style={{ lineHeight: "var(--line-height-base)" }}>
                    {server.details[k]}
                    {k === "look" && (
                      <> <a href={server.details.lookHref} style={{ color: "var(--accent)" }}>前往</a></>
                    )}
                  </div>
                </div>
              ))}
            </>
          ) : !sel || !selJob || !selOrg || !selTp ? (
            <p style={{ color: "var(--text-muted)", margin: 0 }}>{T.panelEmpty}</p>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: "var(--font-size-md)" }}>{selJob.label}</div>
              <div style={{ color: "var(--text-muted)", marginTop: 2 }}>{selOrg.name}</div>
              <div style={{ color: "var(--text-secondary)", marginTop: 8, fontSize: "var(--font-size-xs)", lineHeight: "var(--line-height-base)" }}>{T.cost}：{selJob.cost}</div>
              {sel.enabled && sel.unavailable && <div style={{ color: "var(--yellow)", marginTop: 8 }}>{T.cellBlocked}{sel.unavailable}</div>}

              <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", marginTop: 14 }}>
                <input type="checkbox" checked={sel.enabled} disabled={saving} onChange={(e) => void save(sel, { enabled: e.target.checked })} />
                {T.panelOn}
              </label>

              <div style={label}>{T.panelFrequency}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {selJob.frequencies.map((f) => (
                  <button key={f.value} type="button" disabled={saving} style={chipStyle(sel.frequency === f.value)} onClick={() => void save(sel, { frequency: f.value })}>{f.label}</button>
                ))}
              </div>

              {selFreq?.usesDay && (
                <>
                  <div style={label}>{T.panelWeekday}</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {DAYS.map((d, day) => (
                      <button key={day} type="button" disabled={saving} style={chipStyle(selTp.day === day)} onClick={() => void save(sel, utcFromTaipei(day, selTp.hour))}>{d}</button>
                    ))}
                  </div>
                </>
              )}

              {selFreq?.usesHour && (
                <>
                  <div style={label}>{T.panelHour}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      key={`${sel.jobKey}:${sel.organizationId}:${selTp.hour}`}
                      type="number" min={0} max={23} defaultValue={selTp.hour} disabled={saving} aria-label={T.panelHour}
                      onBlur={(e) => {
                        const h = Number(e.target.value);
                        if (Number.isInteger(h) && h >= 0 && h <= 23 && h !== selTp.hour) void save(sel, utcFromTaipei(selTp.day, h));
                      }}
                      style={{ width: 64, padding: "4px 8px", fontSize: "var(--font-size-sm)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
                    />
                    <span style={{ color: "var(--text-muted)" }}>:00</span>
                  </div>
                </>
              )}

              <div style={label}>{T.panelLastRun}</div>
              <div>{sel.lastRunAt ? taipeiTime(sel.lastRunAt) : T.resultNever}</div>
              <div style={label}>{T.panelLastResult}</div>
              {sel.lastError ? (
                <div style={{ color: "var(--red)", wordBreak: "break-all" }}>{T.resultFailed}{taipeiTime(sel.lastErrorAt)} · {sel.lastError}</div>
              ) : (
                <div>{sel.lastRunAt ? T.resultOk : T.resultNever}</div>
              )}
              <div style={label}>{T.panelChangedBy}</div>
              <div style={{ color: "var(--text-secondary)" }}>{sel.updatedBy ? `${sel.updatedBy} · ${taipeiTime(sel.updatedAt)}` : T.changedNever}</div>
            </>
          )}
        </aside>
      </div>

    </div>
  );
}
