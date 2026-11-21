// /ops/systems/[slug] -- one system: 概覽 / 功能 / 紀錄 / 接續卡 (tabs are links, ?tab=). Owner / admin only.
// The only writes are ../actions.ts (status_change, review). A phase still on its old supervisor page shows a pointer
// to it and no status (PLAN §8: one source of truth per phase).
import Link from "next/link";
import { headers } from "next/headers";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import type { SystemType } from "@/lib/systems/contract";
import { systemsAccess } from "@/lib/systems/access";
import { PRIORITIES, projectSystem, SYSTEM_STATUSES, type FeatureView, type SystemProjection, type SystemRow, type UpdateRow } from "@/lib/systems/projection";
import {
  EVENT_LABEL, FEATURE_BADGE, FEATURE_LABEL, formatTime, PRIORITY_LABEL, RESULT_MESSAGES, SOURCE_LABEL, STATUS_BADGE, STATUS_LABEL, TYPE_LABEL,
} from "@/lib/systems/labels";
import { readDefinitions, readImportRuns, readRecentEvents, readRevertedShas, readStateEvents } from "@/lib/systems/store";
import { reviewFeature, setSystemStatus } from "../actions";
import { ImportLine, Refused, box, errorBox, muted, page } from "../parts";

export const dynamic = "force-dynamic";
export const metadata = { title: "系統 · Ops" };

const TABS = [["overview", "概覽"], ["features", "功能"], ["log", "紀錄"], ["handoff", "接續卡"]] as const;
type Tab = (typeof TABS)[number][0];
type Sp = { tab?: string | string[]; r?: string | string[] };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const smallBtn: React.CSSProperties = { fontSize: 12, padding: "4px 10px" };
const row: React.CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--card-border)", fontSize: 13, color: "var(--text-primary)" };

function Overview({ system, p }: { system: SystemRow; p: SystemProjection }) {
  const hidden = (
    <>
      <input type="hidden" name="system_id" value={system.id} />
      <input type="hidden" name="slug" value={system.slug} />
    </>
  );
  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, color: "var(--text-primary)", marginBottom: 10 }}>{system.purpose || "（用途未填）"}</div>
        <div style={muted}>類型：{TYPE_LABEL[system.type as SystemType] ?? system.type}{system.product_key ? `・產品鍵 ${system.product_key}` : ""}</div>
        {system.aliases.length > 0 && <div style={muted}>別名：{system.aliases.join("、")}</div>}
        <div style={muted}>程式位置：{system.source_paths.length ? system.source_paths.map((s) => <code key={s} style={{ marginRight: 8 }}>{s}</code>) : "—"}</div>
        <div style={{ fontSize: 13, marginTop: 10, color: "var(--text-primary)" }}>
          {p.completion === null ? "尚未盤點（registry 還沒有功能）" : `完成度 ${Math.round(p.completion * 100)}%：已驗收 ${p.verified}／${p.counted}，已實作 ${p.implemented}`}
        </div>
      </div>
      <h3 style={{ marginBottom: 8 }}>系統狀態</h3>
      <form action={setSystemStatus} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {hidden}
        {SYSTEM_STATUSES.map((s) => (
          <button key={s} type="submit" name="status" value={s} className={p.status === s ? "btn-primary" : "btn-secondary"} style={smallBtn}>{STATUS_LABEL[s]}</button>
        ))}
      </form>
      <form action={setSystemStatus} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 20 }}>
        {hidden}
        <span style={muted}>優先</span>
        {PRIORITIES.map((s) => (
          <button key={s} type="submit" name="priority" value={s} className={p.priority === s ? "btn-primary" : "btn-secondary"} style={smallBtn}>{PRIORITY_LABEL[s]}</button>
        ))}
      </form>
      <h3 style={{ marginBottom: 8 }}>階段</h3>
      {p.phases.length === 0 ? <div style={muted}>沒有階段。</div> : p.phases.map(({ phase, legacy }) => (
        <div key={phase.id} style={row}>
          <strong>{phase.name}</strong>
          {legacy && phase.legacy_source_path ? <span style={muted}>舊監工頁（未切換）：<code>{phase.legacy_source_path}</code></span> : <span style={muted}>在這裡追蹤</span>}
        </div>
      ))}
    </div>
  );
}

function FeatureLine({ system, f }: { system: SystemRow; f: FeatureView }) {
  return (
    <div style={row}>
      <span style={{ minWidth: 220 }}>{f.feature.name} <code style={muted}>{f.feature.slug}</code></span>
      {f.legacy ? <span style={muted}>看舊監工頁</span> : (
        <>
          <span className={`card-badge ${FEATURE_BADGE[f.status]}`}>{FEATURE_LABEL[f.status]}</span>
          <span style={muted}>{f.at ? `${EVENT_LABEL[f.source ?? ""] ?? f.source}・${formatTime(f.at)}` : "沒有紀錄"}</span>
          <form action={reviewFeature} style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
            <input type="hidden" name="system_id" value={system.id} />
            <input type="hidden" name="slug" value={system.slug} />
            <input type="hidden" name="feature_id" value={f.feature.id} />
            <button type="submit" name="verdict" value="verified" className="btn-primary" style={smallBtn} disabled={f.status === "verified"}>驗收通過</button>
            <button type="submit" name="verdict" value="in_progress" className="btn-secondary" style={smallBtn}>退回</button>
          </form>
        </>
      )}
    </div>
  );
}

function Features({ system, p }: { system: SystemRow; p: SystemProjection }) {
  if (p.features.length === 0) return <div style={muted}>尚未盤點：registry 還沒有這個系統的功能。</div>;
  const groups = [...p.phases.map(({ phase }) => ({ id: phase.id as string | null, name: phase.name })), { id: null, name: "未分階段" }];
  return (
    <div>
      {groups.map((g) => {
        const list = p.features.filter((f) => f.feature.phase_id === g.id);
        if (!list.length) return null;
        return (
          <div key={g.id ?? "none"} style={{ marginBottom: 20 }}>
            <h3 style={{ marginBottom: 4 }}>{g.name}</h3>
            {list.map((f) => <FeatureLine key={f.feature.id} system={system} f={f} />)}
          </div>
        );
      })}
    </div>
  );
}

function summary(e: UpdateRow): string {
  const p = e.payload;
  const s = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
  switch (e.event_type) {
    case "status_change": return [s("status") && `狀態 ${STATUS_LABEL[s("status") as keyof typeof STATUS_LABEL] ?? s("status")}`, s("priority") && `優先 ${s("priority")}`].filter(Boolean).join("・");
    case "review": case "feature_update": return `${s("status")}${s("note") ? `：${s("note")}` : ""}`;
    case "migration": return `${s("legacy_status")} → ${s("mapped_status")}（${s("evidence_level")}）`;
    case "revert": return `撤銷 ${s("reverted_sha").slice(0, 9)}`;
    default: return s("subject");
  }
}

function Log({ events }: { events: UpdateRow[] }) {
  if (!events.length) return <div style={muted}>還沒有紀錄。</div>;
  return (
    <div>
      {events.map((e) => (
        <div key={e.id} style={row}>
          <span style={{ ...muted, minWidth: 150 }}>{formatTime(e.occurred_at)}</span>
          <span className="card-badge badge-gray">{EVENT_LABEL[e.event_type] ?? e.event_type}</span>
          <span style={muted}>{SOURCE_LABEL[e.source] ?? e.source}</span>
          <span style={{ flex: 1 }}>{summary(e)}</span>
          {e.commit_sha && <code style={muted}>{e.commit_sha.slice(0, 9)}</code>}
        </div>
      ))}
    </div>
  );
}

function Handoff({ p }: { p: SystemProjection }) {
  const h = p.handoff;
  return (
    <div>
      {h.blocker ? <div style={errorBox}>卡住：{h.blocker}<div style={{ ...muted, marginTop: 4 }}>{formatTime(h.blockerAt)} 起；只有 Blocker-Cleared 會解除</div></div> : <div style={box}>沒有卡住的事。</div>}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-label" style={{ marginBottom: 6 }}>下一步</div>
        <div style={{ fontSize: 15, color: "var(--text-primary)" }}>{h.next ?? "還沒有人寫下一步（commit trailer Next:）"}</div>
        {h.nextAt && <div style={{ ...muted, marginTop: 4 }}>{formatTime(h.nextAt)}</div>}
      </div>
      <div style={muted}>最近一次接續：{h.lastSubject ?? "—"}（{formatTime(h.lastAt)}）</div>
    </div>
  );
}

export default async function SystemPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams?: Promise<Sp> }) {
  const access = systemsAccess(await headers());
  if (!access.allowed) return <Refused />;
  const { slug } = await params;
  const sp = searchParams ? await searchParams : {};
  const tabRaw = first(sp.tab);
  const tab: Tab = TABS.some(([t]) => t === tabRaw) ? (tabRaw as Tab) : "overview";
  const notice = RESULT_MESSAGES[first(sp.r) ?? ""];

  const sb = getSupabaseWriteClient();
  if (!sb) return <div style={page}><div style={errorBox}>Supabase 未設定。</div></div>;
  let system: SystemRow | undefined;
  let p: SystemProjection | null = null;
  let recent: UpdateRow[] = [];
  let runs: UpdateRow[] = [];
  let capped = false;
  let failure: string | null = null;
  try {
    const all = await readDefinitions(sb);
    system = all.systems.find((s) => s.slug === slug);
    if (system) {
      const [state, rec, importRuns, revertedShas] = await Promise.all([readStateEvents(sb, system.id), tab === "log" ? readRecentEvents(sb, system.id) : Promise.resolve([]), readImportRuns(sb), readRevertedShas(sb)]);
      capped = state.capped;
      recent = rec;
      runs = importRuns;
      p = projectSystem({
        phases: all.phases.filter((x) => x.system_id === system!.id),
        features: all.features.filter((x) => x.system_id === system!.id),
        events: state.events,
        revertedShas,
      });
    }
  } catch (e) {
    failure = String(e instanceof Error ? e.message : e);
  }
  if (failure) return <div style={page}><div style={errorBox}>讀不到資料：{failure}</div></div>;
  if (!system || !p) {
    return (
      <div style={page}>
        <div style={errorBox}>找不到系統「{slug}」。</div>
        <Link href="/ops/systems">← 回系統總控中心</Link>
      </div>
    );
  }

  return (
    <div style={page}>
      <Link href="/ops/systems" style={{ ...muted, textDecoration: "none" }}>← 系統總控中心</Link>
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0 16px" }}>
        <h1 style={{ margin: 0 }}>{system.name}</h1>
        <span className={`card-badge ${p.status ? STATUS_BADGE[p.status] : "badge-gray"}`}>{p.status ? STATUS_LABEL[p.status] : "未設定"}</span>
      </div>
      <ImportLine runs={runs} />
      {notice && <div style={notice.ok ? box : errorBox}>{notice.text}</div>}
      {capped && <div style={errorBox}>事件超過讀取上限，最舊的一段沒有算進來。</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {TABS.map(([t, label]) => (
          <Link key={t} href={`/ops/systems/${system!.slug}?tab=${t}`} className={tab === t ? "btn-primary" : "btn-secondary"} style={{ ...smallBtn, textDecoration: "none" }}>{label}</Link>
        ))}
      </div>
      {tab === "overview" && <Overview system={system} p={p} />}
      {tab === "features" && <Features system={system} p={p} />}
      {tab === "log" && <Log events={recent} />}
      {tab === "handoff" && <Handoff p={p} />}
    </div>
  );
}
