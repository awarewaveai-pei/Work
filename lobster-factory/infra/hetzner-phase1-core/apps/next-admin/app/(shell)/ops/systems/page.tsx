// /ops/systems -- 系統總控中心: every system in agency-os/systems/registry.json with what it is for, how far it is and
// what comes next (agency-os/handoffs/2026-11-21-systems-control-center/PLAN.md). Definitions come from the registry
// projection, state from system_updates events (lib/systems/projection.ts). Owner / admin only; filters are buttons.
// Layout follows the operator's reference panel (reference/ops-systems-prototype.html): stat cards, table + right column.
import Link from "next/link";
import { headers } from "next/headers";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { SYSTEM_TYPES, type SystemType } from "@/lib/systems/contract";
import { systemsAccess } from "@/lib/systems/access";
import { projectSystem, SYSTEM_STATUSES, type SystemProjection, type SystemRow, type UpdateRow } from "@/lib/systems/projection";
import { formatTime, STATUS_BADGE, STATUS_LABEL, TYPE_LABEL } from "@/lib/systems/labels";
import { gapBreakdown, overviewCounts, recentHandoffs } from "@/lib/systems/overview";
import { importSummary } from "@/lib/systems/projection";
import { readDefinitions, readImportRuns, readProjectionInput } from "@/lib/systems/store";
import { Refused, errorBox, muted, page } from "./parts";

export const dynamic = "force-dynamic";
export const metadata = { title: "系統總控中心 · Ops" };

type Sp = { type?: string | string[]; status?: string | string[]; q?: string | string[] };
type Row = { system: SystemRow; p: SystemProjection };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const smallBtn: React.CSSProperties = { fontSize: 12, padding: "4px 10px", textDecoration: "none" };
const panel: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)", minWidth: 0 };
const panelHead: React.CSSProperties = { padding: "16px 20px", borderBottom: "1px solid var(--card-border)" };
const panelBody: React.CSSProperties = { padding: "16px 20px" };

const RESPONSIVE = `
.sys-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:20px}
.sys-board{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(260px,.8fr);gap:16px;align-items:start}
.sys-right{display:flex;flex-direction:column;gap:16px}
.sys-cards{display:none}
@media (max-width:1100px){.sys-board{grid-template-columns:minmax(0,1fr)}}
@media (max-width:760px){.sys-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.sys-table{display:none}.sys-cards{display:block}.sys-page{padding:20px 16px!important}}
`;

function Stat({ title, value, hint }: { title: string; value: number; hint: string }) {
  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div className="card-label">{title}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)", margin: "6px 0 4px" }}>{value}</div>
      <div style={muted}>{hint}</div>
    </div>
  );
}

function Progress({ p }: { p: SystemProjection }) {
  if (p.completion === null) return <span style={muted}>尚未盤點</span>;
  const pct = Math.round(p.completion * 100);
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{pct}%・{p.verified}／{p.counted}</div>
      <div style={{ height: 6, maxWidth: 120, borderRadius: 99, background: "var(--bg-subtle)", overflow: "hidden", marginTop: 5 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent)" }} />
      </div>
    </div>
  );
}

const StatusBadge = ({ p }: { p: SystemProjection }) => (
  <span className={`card-badge ${p.status ? STATUS_BADGE[p.status] : "badge-gray"}`} style={{ display: "inline-flex", whiteSpace: "nowrap" }}>{p.status ? STATUS_LABEL[p.status] : "未設定"}</span>
);
const meta = (s: SystemRow, p: SystemProjection) => `${TYPE_LABEL[s.type as SystemType] ?? s.type}・${p.phases.length} 個階段`;
const link: React.CSSProperties = { color: "var(--text-primary)", textDecoration: "none" };

function FilterRow({ label, param, options, current, other }: { label: string; param: "type" | "status"; options: Array<[string, string]>; current: string; other: Record<string, string> }) {
  const href = (value: string) => {
    const s = new URLSearchParams({ ...other, ...(value ? { [param]: value } : {}) }).toString();
    return `/ops/systems${s ? `?${s}` : ""}`;
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <span style={{ ...muted, minWidth: 40 }}>{label}</span>
      {[["", "全部"] as [string, string], ...options].map(([value, text]) => (
        <Link key={value || "all"} href={href(value)} className={current === value ? "btn-primary" : "btn-secondary"} style={smallBtn}>{text}</Link>
      ))}
    </div>
  );
}

function SystemTable({ rows }: { rows: Row[] }) {
  const th: React.CSSProperties = { textAlign: "left", fontSize: 11, color: "var(--text-muted)", fontWeight: 700, padding: "6px 10px 10px" };
  const td: React.CSSProperties = { borderTop: "1px solid var(--card-border)", padding: "14px 10px", verticalAlign: "middle" };
  return (
    <>
      <table className="sys-table" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={th}>系統名稱</th><th style={th}>狀態</th><th style={th}>已驗收</th><th style={th}>最近動態</th></tr></thead>
        <tbody>
          {rows.map(({ system, p }) => (
            <tr key={system.id}>
              <td style={td}>
                <Link href={`/ops/systems/${system.slug}`} style={{ ...link, fontSize: 14, fontWeight: 800 }}>{system.name}</Link>
                <div style={muted}>{meta(system, p)}</div>
              </td>
              <td style={td}><StatusBadge p={p} /></td>
              <td style={td}><Progress p={p} /></td>
              <td style={{ ...td, ...muted }}>{formatTime(p.lastActivityAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sys-cards">
        {rows.map(({ system, p }) => (
          <Link key={system.id} href={`/ops/systems/${system.slug}`} className="card" style={{ ...link, display: "block", padding: 14, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <strong style={{ fontSize: 14 }}>{system.name}</strong><StatusBadge p={p} />
            </div>
            <div style={{ ...muted, margin: "4px 0 8px" }}>{meta(system, p)}・{formatTime(p.lastActivityAt)}</div>
            <Progress p={p} />
          </Link>
        ))}
      </div>
    </>
  );
}

function ResumePanel({ rows }: { rows: Row[] }) {
  const items = recentHandoffs(rows.map((r) => ({ ...r, slug: r.system.slug, name: r.system.name, handoff: r.p.handoff })), 3);
  return (
    <section style={panel}>
      <div style={panelHead}><h2 style={{ margin: 0, fontSize: 16 }}>下次從這裡繼續</h2><div style={muted}>中斷後快速找回進度</div></div>
      <div style={panelBody}>
        {items.length === 0 ? <div style={muted}>還沒有接續紀錄（commit trailer 寫 Next: 後會出現在這裡）。</div> : items.map(({ system, p }) => (
          <div key={system.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--card-border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong style={{ fontSize: 14 }}>{system.name}</strong><span style={muted}>{formatTime(p.handoff.lastAt)}</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", margin: "6px 0" }}>{p.handoff.next ?? "（沒有寫下一步）"}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              {p.handoff.blocker ? <span className="card-badge badge-red" style={{ display: "inline-flex" }}>有卡點：{p.handoff.blocker}</span> : <span style={muted}>無阻礙</span>}
              <Link href={`/ops/systems/${system.slug}`} className="btn-secondary" style={smallBtn}>查看接續</Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SyncPanel({ runs }: { runs: UpdateRow[] }) {
  const { lastOk, latest } = importSummary(runs);
  const gaps = gapBreakdown(runs);
  const bad = latest && latest.status !== "ok";
  return (
    <section style={panel}>
      <div style={panelHead}><h2 style={{ margin: 0, fontSize: 16 }}>資料同步狀態</h2><div style={muted}>每天 04:30 從 Git 匯入</div></div>
      <div style={panelBody}>
        {!latest ? <div style={muted}>還沒有任何匯入紀錄：主機匯入器尚未跑過（或尚未開啟）。</div> : (
          <>
            <div style={{ fontSize: 13, color: "var(--text-primary)" }}>最後成功匯入：<strong>{formatTime(lastOk?.at)}</strong></div>
            <div style={{ ...muted, margin: "4px 0 10px" }}>HEAD <code>{lastOk?.head ? lastOk.head.slice(0, 9) : "—"}</code></div>
            {bad && <div style={{ ...errorBox, padding: "8px 12px", marginBottom: 10 }}>最近一次（{formatTime(latest.at)}）{latest.status === "history_diverged" ? "發現 Git 歷史異常，已停止增量匯入" : "失敗"}{latest.error ? `：${latest.error}` : ""}</div>}
            {gaps.map((g) => (
              <div key={g.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: g.count ? "var(--text-primary)" : "var(--text-muted)" }}>
                <span>{g.label}</span><strong>{g.count}</strong>
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}

export default async function SystemsPage({ searchParams }: { searchParams?: Promise<Sp> }) {
  const access = systemsAccess(await headers());
  if (!access.allowed) return <Refused />;
  const sp = searchParams ? await searchParams : {};
  const typeFilter = SYSTEM_TYPES.includes(first(sp.type) as SystemType) ? (first(sp.type) as string) : "";
  const statusRaw = first(sp.status) ?? "";
  const statusFilter = (SYSTEM_STATUSES as readonly string[]).includes(statusRaw) || statusRaw === "unset" ? statusRaw : "";
  const q = (first(sp.q) ?? "").trim().slice(0, 100);

  const sb = getSupabaseWriteClient();
  let failure: string | null = sb ? null : "Supabase 未設定。";
  let rows: Row[] = [];
  let runs: UpdateRow[] = [];
  let capped = false;
  if (sb) {
    try {
      const [defs, state, importRuns] = await Promise.all([readDefinitions(sb), readProjectionInput(sb), readImportRuns(sb)]);
      runs = importRuns;
      capped = state.capped;
      rows = defs.systems.map((system) => ({
        system,
        p: projectSystem({
          phases: defs.phases.filter((x) => x.system_id === system.id),
          features: defs.features.filter((x) => x.system_id === system.id),
          events: state.events.filter((e) => e.system_id === system.id),
          history: state.history,
        }),
      }));
    } catch (e) {
      failure = String(e instanceof Error ? e.message : e);
    }
  }
  const needle = q.toLowerCase();
  const shown = rows.filter(({ system, p }) =>
    (!typeFilter || system.type === typeFilter) && (!statusFilter || (statusFilter === "unset" ? p.status === null : p.status === statusFilter))
    && (!needle || [system.name, system.purpose, system.slug, ...(system.aliases ?? [])].some((s) => (s ?? "").toLowerCase().includes(needle))));
  const counts = overviewCounts(rows.map(({ p }) => ({ status: p.status, counted: p.counted, blocker: p.handoff.blocker, lastActivityAt: p.lastActivityAt })), Date.now());
  const keep = (...omit: Array<"type" | "status" | "q">) => ({
    ...(typeFilter && !omit.includes("type") ? { type: typeFilter } : {}),
    ...(statusFilter && !omit.includes("status") ? { status: statusFilter } : {}),
    ...(q && !omit.includes("q") ? { q } : {}),
  });

  return (
    <div style={page} className="sys-page">
      <style>{RESPONSIVE}</style>
      <h1 style={{ marginBottom: 6 }}>系統總控中心</h1>
      <p style={{ ...muted, fontSize: 14, marginBottom: 20 }}>不必記住每一個專案：這裡看每個系統的用途、進度、卡點與下一步。這裡只能改系統狀態與驗收功能，其餘從 Git 匯入。</p>
      {failure && <div style={errorBox}>讀不到資料：{failure}</div>}
      {capped && <div style={errorBox}>事件超過讀取上限，最舊的一段沒有算進來。</div>}
      <div className="sys-stats">
        <Stat title="系統總數" value={counts.total} hint="registry 內所有系統" />
        <Stat title="開發中" value={counts.active} hint="狀態為進行中" />
        <Stat title="待確認" value={counts.needsAttention} hint="有卡點、尚未盤點或 30 天沒動靜" />
        <Stat title="維護與已完成" value={counts.wrapped} hint="完成或封存" />
      </div>
      <div className="sys-board">
        <section style={panel}>
          <div style={panelHead}><h2 style={{ margin: 0, fontSize: 16 }}>所有系統</h2><div style={muted}>系統、開發狀態與有證據的完成度</div></div>
          <div style={panelBody}>
            <form method="get" action="/ops/systems" style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {typeFilter && <input type="hidden" name="type" value={typeFilter} />}
              {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
              <input name="q" defaultValue={q} placeholder="搜尋系統名稱或用途" aria-label="搜尋系統" style={{ flex: 1, minWidth: 0, fontSize: 13, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-subtle)", color: "var(--text-primary)" }} />
              <button type="submit" className="btn-secondary" style={{ fontSize: 13, padding: "6px 14px" }}>搜尋</button>
              {q && <Link href={`/ops/systems${new URLSearchParams(keep("q")).toString() ? `?${new URLSearchParams(keep("q")).toString()}` : ""}`} className="btn-secondary" style={{ ...smallBtn, alignSelf: "center" }}>清除</Link>}
            </form>
            <FilterRow label="類型" param="type" current={typeFilter} other={keep("type")} options={SYSTEM_TYPES.map((t) => [t, TYPE_LABEL[t]])} />
            <FilterRow label="狀態" param="status" current={statusFilter} other={keep("status")} options={[...SYSTEM_STATUSES.map((s) => [s, STATUS_LABEL[s]] as [string, string]), ["unset", "未設定"]]} />
            {rows.length === 0 && !failure ? <div style={muted}>還沒有系統：registry 尚未匯入。</div>
              : shown.length === 0 ? <div style={{ ...muted, padding: "24px 0", textAlign: "center" }}>找不到符合條件的系統</div>
              : <SystemTable rows={shown} />}
          </div>
          <div style={{ ...panelHead, borderTop: "1px solid var(--card-border)", borderBottom: "none", padding: "10px 20px", ...muted }}>
            顯示 {shown.length} 個系統{shown.length !== rows.length ? `（全部 ${rows.length}）` : ""}・點選任一系統看詳情
          </div>
        </section>
        <div className="sys-right">
          <ResumePanel rows={rows} />
          <SyncPanel runs={runs} />
        </div>
      </div>
    </div>
  );
}
