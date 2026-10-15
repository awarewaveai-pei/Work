"use client";

// The schedules table (agency-os/docs/operations/SCHEDULES_PAGE_PLAN.md §3.2-3/4). One component for
// /ops/schedules (every client) and the client page's 維護 tab (`only` = that client's slug): one data
// source, so the two views cannot disagree. Rows = jobs, columns = clients, the clicked cell's details beside.
// Every choice is a visible button or checkbox, never a <select> (operator rule).
import { useCallback, useEffect, useState } from "react";
import { roleHeader } from "@/lib/ops-role";
import type { ScheduleCell, SchedulesView } from "@/lib/schedules/types";
import { ChipBtn, NoData, SubLabel, relativeTime } from "@/app/(shell)/ops/clients/[slug]/hub-ui";

const DAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

const SYSTEM_STATE: Record<string, { text: string; color: string }> = {
  ok: { text: "正常", color: "var(--green)" },
  stale: { text: "過期", color: "var(--severity-medium)" },
  missing: { text: "沒有資料", color: "var(--severity-medium)" },
  failed: { text: "失敗", color: "var(--red)" },
};

const ERROR_TEXT: Record<string, string> = {
  forbidden_role: "需要 owner／admin 權限才能修改。",
  version_conflict: "別人剛改過這一格，已重新載入；確認後再改一次。",
};

// Three states, three looks: a theme colour for "never ran" would read as one of the other two.
function dot(c: ScheduleCell): { glyph: string; color: string; label: string } {
  if (c.lastError) return { glyph: "●", color: "var(--red)", label: "上次失敗" };
  if (c.lastRunAt) return { glyph: "●", color: "var(--green)", label: "上次正常" };
  return { glyph: "○", color: "var(--text-muted)", label: "還沒跑過" };
}

function fmt(iso: string | null): string {
  return iso ? `${relativeTime(iso)}（${iso.slice(0, 16).replace("T", " ")} UTC）` : "—";
}

export function ScheduleTable({ only }: { only?: string }) {
  const [view, setView] = useState<SchedulesView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ jobKey: string; organizationId: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/ops/schedules${only ? `?slug=${encodeURIComponent(only)}` : ""}`, {
        headers: { ...roleHeader("admin") },
        cache: "no-store",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        setLoadError(body?.error ?? `HTTP ${res.status}`);
        return;
      }
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
    if (!view) return;
    const slug = view.orgs.find((o) => o.id === cell.organizationId)?.slug;
    if (!slug) return;
    const next = { ...cell, ...patch };
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/ops/clients/${encodeURIComponent(slug)}/schedules/${cell.jobKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...roleHeader("admin") },
        body: JSON.stringify({
          enabled: next.enabled,
          frequency: next.frequency,
          hourUtc: next.hourUtc,
          dayOfWeekUtc: next.dayOfWeekUtc,
          ...(cell.version !== null ? { expectedVersion: cell.version } : {}),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        const code = String(body?.error ?? `HTTP ${res.status}`);
        setNotice(ERROR_TEXT[code] ?? `儲存失敗：${code}`);
      }
    } catch (e) {
      setNotice(`儲存失敗：${String(e)}`);
    } finally {
      await load();
      setSaving(false);
    }
  }

  if (loadError) return <NoData>排程讀取失敗：{loadError}</NoData>;
  if (!view) return <NoData>載入中…</NoData>;

  const cellOf = (jobKey: string, organizationId: string) =>
    view.cells.find((c) => c.jobKey === jobKey && c.organizationId === organizationId);
  const sel = selected ? cellOf(selected.jobKey, selected.organizationId) : undefined;
  const selJob = sel ? view.jobs.find((j) => j.key === sel.jobKey) : undefined;
  const selOrg = sel ? view.orgs.find((o) => o.id === sel.organizationId) : undefined;
  const selFreq = selJob?.frequencies.find((f) => f.value === sel?.frequency);

  const th = { padding: "4px 8px", fontWeight: 500, color: "var(--text-muted)", textAlign: "left" as const, whiteSpace: "nowrap" as const };
  const td = { padding: "4px 8px", borderTop: "1px solid var(--border-subtle)" };

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
        {view.summary.enabled} 個排程開著 · 今天跑了 {view.summary.ranToday} · {view.summary.failing} 個失敗
        {saving ? " · 儲存中…" : ""}
      </div>
      {notice && <div style={{ fontSize: 12, color: "var(--red)", marginBottom: 8 }}>{notice}</div>}

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 420px", minWidth: 0, overflowX: "auto" }}>
          <SubLabel>客戶例行工作（在這裡設定）</SubLabel>
          <table style={{ fontSize: 12, borderCollapse: "collapse", color: "var(--text-primary)" }}>
            <thead>
              <tr>
                <th style={th}>工作</th>
                {view.orgs.map((o) => (
                  <th key={o.id} style={th}>{o.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.jobs.map((job) => (
                <tr key={job.key}>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{job.label}</td>
                  {view.orgs.map((o) => {
                    const c = cellOf(job.key, o.id);
                    if (!c) return <td key={o.id} style={td} />;
                    const isSel = selected?.jobKey === job.key && selected.organizationId === o.id;
                    return (
                      <td
                        key={o.id}
                        style={{ ...td, cursor: "pointer", background: isSel ? "var(--ai-bg)" : undefined, whiteSpace: "nowrap" }}
                        onClick={() => setSelected({ jobKey: job.key, organizationId: o.id })}
                        title={c.unavailable ?? undefined}
                      >
                        <input
                          type="checkbox"
                          checked={c.enabled}
                          disabled={saving}
                          aria-label={`${job.label} · ${o.name}`}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => void save(c, { enabled: e.target.checked })}
                        />{" "}
                        <span style={{ color: dot(c).color }} title={dot(c).label}>{dot(c).glyph}</span>
                        {c.unavailable ? <span style={{ color: "var(--text-muted)" }}> 不會執行</span> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {view.system.length > 0 && (
            <>
              <SubLabel>在主機跑（只顯示）</SubLabel>
              <table style={{ fontSize: 12, borderCollapse: "collapse", color: "var(--text-primary)" }}>
                <tbody>
                  {view.system.map((r) => (
                    <tr key={r.key}>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{r.label}</td>
                      <td style={{ ...td, whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{r.cadence}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{relativeTime(r.lastAt)}</td>
                      <td style={{ ...td, whiteSpace: "nowrap", color: SYSTEM_STATE[r.state].color }}>{SYSTEM_STATE[r.state].text}</td>
                      <td style={{ ...td, color: "var(--text-secondary)" }}>{r.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        <div style={{ flex: "0 1 300px", minWidth: 240, border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "var(--text-primary)" }}>
          {!sel || !selJob || !selOrg ? (
            <NoData>點表格裡的一格，這裡會顯示那一格的設定和上次執行結果。</NoData>
          ) : (
            <>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {selJob.label} · {selOrg.name}
              </div>
              {sel.unavailable && (
                <div style={{ color: "var(--severity-medium)", marginBottom: 6 }}>勾了也不會執行：{sel.unavailable}</div>
              )}
              <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                <input type="checkbox" checked={sel.enabled} disabled={saving} onChange={(e) => void save(sel, { enabled: e.target.checked })} />
                開啟
              </label>

              <SubLabel>頻率</SubLabel>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {selJob.frequencies.map((f) => (
                  <ChipBtn key={f.value} label={f.label} active={sel.frequency === f.value} onClick={() => void save(sel, { frequency: f.value })} />
                ))}
              </div>

              {selFreq?.usesDay && (
                <>
                  <SubLabel>星期（UTC）</SubLabel>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {DAY_LABELS.map((label, day) => (
                      <ChipBtn key={day} label={label} active={sel.dayOfWeekUtc === day} onClick={() => void save(sel, { dayOfWeekUtc: day })} />
                    ))}
                  </div>
                </>
              )}

              {selFreq?.usesHour && (
                <>
                  <SubLabel>幾點（UTC）</SubLabel>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--text-secondary)" }}>
                    <input
                      key={`${sel.jobKey}:${sel.organizationId}:${sel.hourUtc}`}
                      type="number"
                      min={0}
                      max={23}
                      defaultValue={sel.hourUtc}
                      disabled={saving}
                      aria-label="UTC 小時"
                      onBlur={(e) => {
                        const h = Number(e.target.value);
                        if (Number.isInteger(h) && h >= 0 && h <= 23 && h !== sel.hourUtc) void save(sel, { hourUtc: h });
                      }}
                      style={{ width: 56, fontSize: 12, padding: "3px 6px", borderRadius: 5, border: "1px solid var(--card-border)", background: "var(--bg-canvas)", color: "var(--text-primary)" }}
                    />
                    <span>點 UTC ＝ 台北 {(sel.hourUtc + 8) % 24} 點</span>
                  </div>
                </>
              )}

              <SubLabel>上次執行</SubLabel>
              <div>{fmt(sel.lastRunAt)}</div>
              <SubLabel>上次結果</SubLabel>
              {sel.lastError ? (
                <div style={{ color: "var(--red)", wordBreak: "break-all" }}>
                  失敗（{relativeTime(sel.lastErrorAt)}）：{sel.lastError}
                </div>
              ) : (
                <div>{sel.lastRunAt ? "正常" : "還沒跑過"}</div>
              )}
              <SubLabel>最近改動</SubLabel>
              <div style={{ color: "var(--text-secondary)" }}>{sel.updatedBy ? `${sel.updatedBy} · ${relativeTime(sel.updatedAt)}` : "沒改過（用預設值）"}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
