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
import { EFFECTIVE_BADGE, EFFECTIVE_LABEL, formatTime, relativeTime, STATUS_LABEL, TYPE_LABEL } from "@/lib/systems/labels";
import { effectiveStatus, gapBreakdown, implementedRatio, overviewCounts, progressKind, recentHandoffs, type EffectiveState } from "@/lib/systems/overview";
import { importSummary } from "@/lib/systems/projection";
import { readDefinitions, readImportRuns, readPending, readProjectionInput, type Pending } from "@/lib/systems/store";
import { refreshState, type RefreshState } from "./refresh-state";
import { proposeNewSystem, requestSystemsRefresh, withdrawProposal } from "./actions";
import { Refused, box, errorBox, muted, page } from "./parts";

export const dynamic = "force-dynamic";
export const metadata = { title: "系統總控中心 · Ops" };

type Sp = { type?: string | string[]; status?: string | string[]; q?: string | string[]; r?: string | string[] };
const NOTICES: Record<string, { ok: boolean; text: string }> = {
  refresh_queued: { ok: true, text: "已排入，約 5 分鐘內更新。" },
  refresh_pending: { ok: true, text: "更新已在排隊中。" },
  proposal_not_found: { ok: false, text: "找不到這筆提案，可能已被撤回。" },
  bad_withdraw: { ok: false, text: "撤回原因不正確，沒有記下。" },
  withdrawn: { ok: true, text: "已撤回。" },
  proposed: { ok: true, text: "已記下，下一次 agent 開工時會寫進系統清單。" },
  bad_proposal: { ok: false, text: "名稱與用途各要 1–200 字，類型要選一個。" },
  forbidden: { ok: false, text: "只有擁有者或管理員能這樣做。" },
  db_unavailable: { ok: false, text: "資料庫暫時讀寫不了，沒有記下。" },
};
const NO_PENDING: Pending = { refresh: false, requestedAt: null, proposals: [] };
type Row = { system: SystemRow; p: SystemProjection; eff: EffectiveState };
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
.sys-row{position:relative}.sys-row:hover{background:var(--bg-subtle)}.sys-row a::after{content:"";position:absolute;inset:0}
.sys-add{position:relative}.sys-add summary::-webkit-details-marker{display:none}.sys-type input{position:absolute;opacity:0;pointer-events:none}.sys-type{position:relative}.sys-type input:checked+span{background:var(--accent);color:var(--btn-primary-text)}.sys-type input:focus-visible+span{outline:2px solid var(--accent)}
.sys-icon{height:30px;width:30px;border-radius:10px;display:grid;place-items:center;background:var(--accent-light);color:var(--accent-text);font-size:14px}
@media (max-width:1100px){.sys-board{grid-template-columns:minmax(0,1fr)}}
@media (max-width:760px){.sys-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.sys-table{display:none}.sys-cards{display:block}.sys-page{padding:20px 16px!important}}
`;

function TimeLabel({ iso }: { iso: string | null | undefined }) {
  return <span title={formatTime(iso)}>{relativeTime(iso)}</span>;
}

function Stat({ title, value, hint, icon, tone }: { title: string; value: number; hint: string; icon: string; tone?: "warn" | "success" }) {
  const toneStyle: React.CSSProperties = tone === "warn" ? { background: "var(--badge-yellow-bg)", color: "var(--badge-yellow-text)" } : tone === "success" ? { background: "var(--badge-green-bg)", color: "var(--badge-green-text)" } : {};
  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div className="card-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>{title}<span className="sys-icon" style={toneStyle} aria-hidden="true">{icon}</span></div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)", margin: "6px 0 4px" }}>{value}</div>
      <div style={muted}>{hint}</div>
    </div>
  );
}

function Progress({ p }: { p: SystemProjection }) {
  const kind = progressKind(p);
  if (kind === "empty") return <span style={muted}>尚未盤點</span>;
  if (kind === "legacy") return <span style={muted}>進度在舊監工頁</span>;
  const pct = Math.round((p.completion ?? 0) * 100);
  const impl = Math.round((implementedRatio(p) ?? 0) * 100);
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-text)" }}>已驗收 {pct}%・{p.verified}／{p.counted}</div>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>已實作 {impl}%</div>
      <div style={{ position: "relative", height: 6, maxWidth: 120, borderRadius: 99, background: "var(--bg-subtle)", overflow: "hidden", marginTop: 5 }}>
        <div style={{ position: "absolute", inset: 0, width: `${impl}%`, background: "var(--accent)", opacity: 0.4 }} />
        <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: "var(--accent)" }} />
      </div>
    </div>
  );
}

const StatusBadge = ({ eff }: { eff: EffectiveState }) => (
  <span className={`card-badge ${eff.status ? EFFECTIVE_BADGE[eff.status] : "badge-gray"}`} style={{ display: "inline-flex", whiteSpace: "nowrap" }}>{eff.status ? `${EFFECTIVE_LABEL[eff.status]}${eff.inferred ? "（推定）" : ""}` : "未設定"}</span>
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
        <thead><tr><th style={th}>系統名稱</th><th style={th}>狀態</th><th style={th}>進度</th><th style={th}>最近動態</th></tr></thead>
        <tbody>
          {rows.map(({ system, p, eff }) => (
            <tr key={system.id} className="sys-row">
              <td style={td}>
                <Link href={`/ops/systems/${system.slug}`} style={{ ...link, fontSize: 14, fontWeight: 800 }}>{system.name}</Link>
                <div style={muted}>{meta(system, p)}</div>
              </td>
              <td style={td}><StatusBadge eff={eff} /></td>
              <td style={td}><Progress p={p} /></td>
              <td style={{ ...td, ...muted }}><TimeLabel iso={p.lastCommitAt} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sys-cards">
        {rows.map(({ system, p, eff }) => (
          <Link key={system.id} href={`/ops/systems/${system.slug}`} className="card" style={{ ...link, display: "block", padding: 14, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <strong style={{ fontSize: 14 }}>{system.name}</strong><StatusBadge eff={eff} />
            </div>
            <div style={{ ...muted, margin: "4px 0 8px" }}>{meta(system, p)}・<TimeLabel iso={p.lastCommitAt} /></div>
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
      <div style={{ ...panelHead, display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><h2 style={{ margin: 0, fontSize: 16 }}>下次從這裡繼續</h2><div style={muted}>中斷後快速找回進度</div></div><span style={{ color: "var(--accent-text)" }} aria-hidden="true">◈</span></div>
      <div style={panelBody}>
        {items.length === 0 ? <div style={muted}>還沒有接續紀錄（commit trailer 寫 Next: 後會出現在這裡）。</div> : items.map(({ system, p }) => (
          <div key={system.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--card-border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong style={{ fontSize: 14 }}>{system.name}</strong><span style={muted}><TimeLabel iso={p.handoff.lastAt} /></span>
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

function AddSystemForm() {
  const field: React.CSSProperties = { fontSize: 13, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-subtle)", color: "var(--text-primary)", minWidth: 0 };
  return (
    <details className="sys-add">
      <summary className="btn-primary" style={{ listStyle: "none", cursor: "pointer", display: "inline-block", fontSize: 13, padding: "8px 14px" }}>＋ 新增系統</summary>
      <form action={proposeNewSystem} style={{ ...panel, position: "absolute", right: 0, zIndex: 5, width: 340, maxWidth: "calc(100vw - 32px)", marginTop: 8, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <input name="name" required maxLength={200} placeholder="系統名稱" aria-label="系統名稱" style={field} />
        <div role="radiogroup" aria-label="類型" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {SYSTEM_TYPES.map((t, i) => (
            <label key={t} className="sys-type"><input type="radio" name="type" value={t} required defaultChecked={i === 0} /><span className="btn-secondary" style={smallBtn}>{TYPE_LABEL[t]}</span></label>
          ))}
        </div>
        <input name="purpose" required maxLength={200} placeholder="一句話：這個系統做什麼" aria-label="用途" style={field} />
        <button type="submit" className="btn-primary" style={{ fontSize: 13, padding: "8px 14px" }}>送出</button>
        <div style={muted}>送出後會列在「待登記」，下一次 agent 開工時寫進系統清單。</div>
      </form>
    </details>
  );
}

function PendingPanel({ pending }: { pending: Pending }) {
  if (pending.proposals.length === 0) return null;
  return (
    <section style={panel}>
      <div style={panelHead}><h2 style={{ margin: 0, fontSize: 16 }}>待登記</h2><div style={muted}>下一次 agent 開工時會寫進系統清單</div></div>
      <div style={panelBody}>
        {pending.proposals.map((x) => (
          <div key={x.event_key} style={{ padding: "10px 0", borderBottom: "1px solid var(--card-border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong style={{ fontSize: 14 }}>{x.name}</strong><span style={muted}><TimeLabel iso={x.at} /></span></div>
            <div style={muted}>{TYPE_LABEL[x.type as SystemType] ?? x.type}・{x.purpose}</div>
            <details style={{ marginTop: 6 }}>
              <summary className="btn-secondary" style={{ ...smallBtn, listStyle: "none", cursor: "pointer", display: "inline-block" }}>撤回</summary>
              <form action={withdrawProposal} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 6 }}>
                <input type="hidden" name="event_key" value={x.event_key} />
                <span style={muted}>原因</span>
                {["打錯", "重複", "不做了"].map((r) => <button key={r} type="submit" name="reason" value={r} className="btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }}>{r}</button>)}
              </form>
            </details>
          </div>
        ))}
      </div>
    </section>
  );
}

function HelpCard({ rows }: { rows: Row[] }) {
  const target = recentHandoffs(rows.map((r) => ({ ...r, slug: r.system.slug, name: r.system.name, handoff: r.p.handoff })), 1)[0]?.system ?? rows[0]?.system;
  return (
    <div style={{ ...panel, padding: 20, background: "var(--accent)", color: "var(--btn-primary-text)" }}>
      <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>不記得上次做到哪裡？</h3>
      <p style={{ margin: "0 0 14px", fontSize: 12, lineHeight: 1.7 }}>點選系統，展開完整接續卡。可複製摘要給 Claude 或 Codex，重新開始工作。</p>
      {target ? <Link href={`/ops/systems/${target.slug}`} className="btn-secondary" style={smallBtn}>看看接續摘要</Link> : <span style={{ fontSize: 12 }}>還沒有系統可看。</span>}
    </div>
  );
}

function SyncPanel({ runs, refresh, pendingFailed }: { runs: UpdateRow[]; refresh: RefreshState; pendingFailed: boolean }) {
  const { lastOk, latest } = importSummary(runs);
  const gaps = gapBreakdown(runs);
  const bad = latest && latest.status !== "ok";
  return (
    <section style={panel}>
      <div style={panelHead}><h2 style={{ margin: 0, fontSize: 16 }}>資料同步狀態</h2><div style={muted}>每天 04:30 從 Git 匯入</div></div>
      <div style={panelBody}>
        {refresh.kind === "waiting" && <div style={{ fontSize: 13, color: "var(--accent-text)", marginBottom: 8 }}>已排入更新（約 5 分鐘內處理）</div>}
        {refresh.kind === "stale" && <div style={{ ...errorBox, padding: "8px 12px", marginBottom: 10 }}>匯入器沒有回應（已等 {refresh.minutes} 分鐘），可以再按一次「立即更新」。</div>}
        {pendingFailed && <div style={{ ...muted, marginBottom: 8 }}>待登記暫時讀不到。</div>}
        {!latest ? <div style={muted}>還沒有任何匯入紀錄：主機匯入器尚未跑過（或尚未開啟）。</div> : (
          <>
            <div style={{ fontSize: 13, color: "var(--text-primary)" }}>最後成功匯入：<strong><TimeLabel iso={lastOk?.at} /></strong></div>
            <div style={{ ...muted, margin: "4px 0 10px" }}>HEAD <code>{lastOk?.head ? lastOk.head.slice(0, 9) : "—"}</code></div>
            {bad && <div style={{ ...errorBox, padding: "8px 12px", marginBottom: 10 }}>最近一次（<TimeLabel iso={latest.at} />）{latest.status === "history_diverged" ? "發現 Git 歷史異常，已停止增量匯入" : "失敗"}{latest.error ? `：${latest.error}` : ""}</div>}
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
  const statusFilter = (SYSTEM_STATUSES as readonly string[]).includes(statusRaw) || statusRaw === "unset" || statusRaw === "maintenance" ? statusRaw : "";
  const q = (first(sp.q) ?? "").trim().slice(0, 100);
  const notice = NOTICES[first(sp.r) ?? ""];

  const sb = getSupabaseWriteClient();
  let failure: string | null = sb ? null : "Supabase 未設定。";
  let rows: Row[] = [];
  let runs: UpdateRow[] = [];
  let capped = false;
  let pending: Pending = NO_PENDING;
  let pendingFailed = false;
  if (sb) {
    try {
      const [defs, state, importRuns] = await Promise.all([readDefinitions(sb), readProjectionInput(sb), readImportRuns(sb)]);
      runs = importRuns;
      capped = state.capped;
      const now = Date.now();
      rows = defs.systems.map((system) => {
        const p = projectSystem({
          phases: defs.phases.filter((x) => x.system_id === system.id),
          features: defs.features.filter((x) => x.system_id === system.id),
          events: state.events.filter((e) => e.system_id === system.id),
          history: state.history,
          lastCommitAt: state.lastCommitAt[system.id] ?? null,
        });
        return { system, p, eff: effectiveStatus(p.status, p.lastCommitAt, now) };
      });
    } catch (e) {
      failure = String(e instanceof Error ? e.message : e);
    }
  }
  if (sb && !failure) {
    try {
      pending = await readPending(sb);
    } catch (e) {
      console.error(`[systems/page] pending: ${e instanceof Error ? e.message : String(e)}`);
      pendingFailed = true;
    }
  }
  const refresh = refreshState(pending, Date.now());
  const needle = q.toLowerCase();
  const shown = rows.filter(({ system, eff }) =>
    (!typeFilter || system.type === typeFilter) && (!statusFilter || (statusFilter === "unset" ? eff.status === null : eff.status === statusFilter))
    && (!needle || [system.name, system.purpose, system.slug, ...(system.aliases ?? [])].some((s) => (s ?? "").toLowerCase().includes(needle))));
  const counts = overviewCounts(rows.map(({ p, eff }) => ({ status: eff.status, inferred: eff.inferred, featureCount: p.features.length, blocker: p.handoff.blocker, lastCommitAt: p.lastCommitAt })), Date.now());
  const keep = (...omit: Array<"type" | "status" | "q">) => ({
    ...(typeFilter && !omit.includes("type") ? { type: typeFilter } : {}),
    ...(statusFilter && !omit.includes("status") ? { status: statusFilter } : {}),
    ...(q && !omit.includes("q") ? { q } : {}),
  });

  return (
    <div style={page} className="sys-page">
      <style>{RESPONSIVE}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2.2, fontWeight: 800, color: "var(--accent-text)" }}>DEVELOPMENT COMMAND CENTER</div>
          <h1 style={{ margin: "8px 0 6px" }}>系統總控中心</h1>
        </div>
        <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
          <form action={requestSystemsRefresh}>
            <button type="submit" className="btn-secondary" style={{ fontSize: 13, padding: "8px 14px" }} disabled={refresh.kind === "waiting"}>{refresh.kind === "waiting" ? "更新排隊中" : "◷ 立即更新"}</button>
          </form>
          <AddSystemForm />
        </div>
      </div>
      {notice && <div style={notice.ok ? box : errorBox}>{notice.text}</div>}
      <p style={{ ...muted, fontSize: 14, marginBottom: 20 }}>不必記住每一個專案：這裡看每個系統的用途、進度、卡點與下一步。這裡只能改系統狀態與驗收功能，其餘從 Git 匯入。</p>
      {failure && <div style={errorBox}>讀不到資料：{failure}</div>}
      {capped && <div style={errorBox}>事件超過讀取上限，最舊的一段沒有算進來。</div>}
      <div className="sys-stats">
        <Stat title="系統總數" icon="▦" value={counts.total} hint="registry 內所有系統" />
        <Stat title="開發中" icon="◉" value={counts.active} hint="已設或依最近 commit 推定" />
        <Stat title="待確認" icon="!" tone="warn" value={counts.needsAttention} hint="有卡點，或開發中卻 30 天沒有 commit" />
        <Stat title="維護與已完成" icon="✓" tone="success" value={counts.wrapped} hint="維護中、完成或封存" />
      </div>
      <div className="sys-board">
        <section style={panel}>
          <div style={{ ...panelHead, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}><div><h2 style={{ margin: 0, fontSize: 16 }}>所有系統</h2><div style={muted}>系統、開發狀態與有證據的完成度</div></div><span className="card-badge badge-gray">即時篩選</span></div>
          <div style={panelBody}>
            <form method="get" action="/ops/systems" style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {typeFilter && <input type="hidden" name="type" value={typeFilter} />}
              {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
              <input name="q" defaultValue={q} placeholder="搜尋系統名稱或用途" aria-label="搜尋系統" style={{ flex: 1, minWidth: 0, fontSize: 13, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-subtle)", color: "var(--text-primary)" }} />
              <button type="submit" className="btn-secondary" style={{ fontSize: 13, padding: "6px 14px" }}>搜尋</button>
              {q && <Link href={`/ops/systems${new URLSearchParams(keep("q")).toString() ? `?${new URLSearchParams(keep("q")).toString()}` : ""}`} className="btn-secondary" style={{ ...smallBtn, alignSelf: "center" }}>清除</Link>}
            </form>
            <FilterRow label="類型" param="type" current={typeFilter} other={keep("type")} options={SYSTEM_TYPES.map((t) => [t, TYPE_LABEL[t]])} />
            <FilterRow label="狀態" param="status" current={statusFilter} other={keep("status")} options={[["active", "開發中"], ["maintenance", "維護中"], ...SYSTEM_STATUSES.filter((s) => s !== "active").map((s) => [s, STATUS_LABEL[s]] as [string, string]), ["unset", "未設定"]]} />
            {rows.length === 0 && !failure ? <div style={muted}>還沒有系統：registry 尚未匯入。</div>
              : shown.length === 0 ? <div style={{ ...muted, padding: "24px 0", textAlign: "center" }}>找不到符合條件的系統</div>
              : <SystemTable rows={shown} />}
          </div>
          <div style={{ ...panelHead, borderTop: "1px solid var(--card-border)", borderBottom: "none", padding: "10px 20px", ...muted }}>
            顯示 {shown.length} 個系統{shown.length !== rows.length ? `（全部 ${rows.length}）` : ""}・點選任一系統看詳情
          </div>
        </section>
        <div className="sys-right">
          <PendingPanel pending={pending} />
          <ResumePanel rows={rows} />
          <SyncPanel runs={runs} refresh={refresh} pendingFailed={pendingFailed} />
          <HelpCard rows={rows} />
        </div>
      </div>
    </div>
  );
}
