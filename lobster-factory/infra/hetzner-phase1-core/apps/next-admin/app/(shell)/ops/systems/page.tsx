// /ops/systems -- 系統總控中心: every system in agency-os/systems/registry.json with what it is for, how far it is and
// what comes next (agency-os/handoffs/2026-11-21-systems-control-center/PLAN.md). Definitions come from the registry
// projection, state from system_updates events (lib/systems/projection.ts). Owner / admin only; filters are buttons.
import Link from "next/link";
import { headers } from "next/headers";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { SYSTEM_TYPES, type SystemType } from "@/lib/systems/contract";
import { systemsAccess } from "@/lib/systems/access";
import { projectSystem, SYSTEM_STATUSES, type SystemProjection, type SystemRow, type UpdateRow } from "@/lib/systems/projection";
import { formatTime, PRIORITY_LABEL, STATUS_BADGE, STATUS_LABEL, TYPE_LABEL } from "@/lib/systems/labels";
import { readDefinitions, readImportRuns, readProjectionInput } from "@/lib/systems/store";
import { ImportLine, Refused, errorBox, muted, page } from "./parts";

export const dynamic = "force-dynamic";
export const metadata = { title: "系統總控中心 · Ops" };

type Sp = { type?: string | string[]; status?: string | string[] };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function FilterRow({ label, param, options, current, other }: { label: string; param: "type" | "status"; options: Array<[string, string]>; current: string; other: Record<string, string> }) {
  const href = (value: string) => {
    const q = new URLSearchParams({ ...other, ...(value ? { [param]: value } : {}) });
    const s = q.toString();
    return `/ops/systems${s ? `?${s}` : ""}`;
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <span style={{ ...muted, minWidth: 40 }}>{label}</span>
      {[["", "全部"] as [string, string], ...options].map(([value, text]) => (
        <Link key={value || "all"} href={href(value)} className={current === value ? "btn-primary" : "btn-secondary"} style={{ fontSize: 12, padding: "4px 10px", textDecoration: "none" }}>
          {text}
        </Link>
      ))}
    </div>
  );
}

function SystemCard({ system, p }: { system: SystemRow; p: SystemProjection }) {
  return (
    <Link href={`/ops/systems/${system.slug}`} className="card" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
      <div className="card-header">
        <span className="card-label">{TYPE_LABEL[system.type as SystemType] ?? system.type}</span>
        <span className={`card-badge ${p.status ? STATUS_BADGE[p.status] : "badge-gray"}`}>
          {p.status ? STATUS_LABEL[p.status] : "未設定"}{p.priority ? `・優先 ${PRIORITY_LABEL[p.priority]}` : ""}
        </span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>{system.name}</div>
      <div className="card-sub" style={{ marginBottom: 10 }}>{system.purpose || "（用途未填）"}</div>
      <div style={{ fontSize: 13, color: "var(--text-primary)", marginBottom: 6 }}>
        {p.completion === null ? "尚未盤點" : `完成度 ${Math.round(p.completion * 100)}%（已驗收 ${p.verified}／${p.counted}，已實作 ${p.implemented}）`}
      </div>
      {p.handoff.blocker && <div className="card-badge badge-red" style={{ marginBottom: 6, display: "inline-flex" }}>卡住：{p.handoff.blocker}</div>}
      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>下一步：{p.handoff.next ?? "—"}</div>
      <div style={{ ...muted, marginTop: 6 }}>最後狀態更新：{formatTime(p.lastActivityAt)}</div>
    </Link>
  );
}

export default async function SystemsPage({ searchParams }: { searchParams?: Promise<Sp> }) {
  const access = systemsAccess(await headers());
  if (!access.allowed) return <Refused />;
  const sp = searchParams ? await searchParams : {};
  const typeFilter = SYSTEM_TYPES.includes(first(sp.type) as SystemType) ? (first(sp.type) as string) : "";
  const statusRaw = first(sp.status) ?? "";
  const statusFilter = (SYSTEM_STATUSES as readonly string[]).includes(statusRaw) || statusRaw === "unset" ? statusRaw : "";

  const sb = getSupabaseWriteClient();
  let failure: string | null = sb ? null : "Supabase 未設定。";
  let rows: Array<{ system: SystemRow; p: SystemProjection }> = [];
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
  const shown = rows.filter(({ system, p }) =>
    (!typeFilter || system.type === typeFilter) && (!statusFilter || (statusFilter === "unset" ? p.status === null : p.status === statusFilter)));

  return (
    <div style={page}>
      <h1 style={{ marginBottom: 6 }}>系統總控中心</h1>
      <p style={{ ...muted, fontSize: 14, marginBottom: 20 }}>每個系統的用途、進度與下一步。資料每天 04:30 從 Git 匯入；這裡只能改系統狀態與驗收功能。</p>
      <ImportLine runs={runs} />
      {failure && <div style={errorBox}>讀不到資料：{failure}</div>}
      {capped && <div style={errorBox}>事件超過讀取上限，最舊的一段沒有算進來。</div>}
      <FilterRow label="類型" param="type" current={typeFilter} other={statusFilter ? { status: statusFilter } : {}} options={SYSTEM_TYPES.map((t) => [t, TYPE_LABEL[t]])} />
      <FilterRow label="狀態" param="status" current={statusFilter} other={typeFilter ? { type: typeFilter } : {}} options={[...SYSTEM_STATUSES.map((s) => [s, STATUS_LABEL[s]] as [string, string]), ["unset", "未設定"]]} />
      <div style={{ ...muted, margin: "12px 0" }}>共 {shown.length} 個系統{shown.length !== rows.length ? `（全部 ${rows.length}）` : ""}</div>
      {rows.length === 0 && !failure ? (
        <div style={muted}>還沒有系統：registry 尚未匯入。</div>
      ) : (
        <div className="card-grid">
          {shown.map(({ system, p }) => <SystemCard key={system.id} system={system} p={p} />)}
        </div>
      )}
    </div>
  );
}
