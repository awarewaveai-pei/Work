// Pieces the /ops/systems pages share (總控中心, 積木目錄, one system). Theme tokens and globals.css classes only.
import Link from "next/link";
import { SYSTEM_TYPES } from "@/lib/systems/contract";
import { importSummary, type SystemProjection, type UpdateRow } from "@/lib/systems/projection";
import { EFFECTIVE_BADGE, EFFECTIVE_LABEL, formatTime, TYPE_LABEL } from "@/lib/systems/labels";
import { implementedRatio, progressKind, type EffectiveState } from "@/lib/systems/overview";
import { proposeNewSystem } from "./actions";

export const page: React.CSSProperties = { padding: "32px 40px", maxWidth: 1100 };
export const muted: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)" };
export const box: React.CSSProperties = { background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13 };
export const errorBox: React.CSSProperties = { background: "var(--badge-red-bg)", border: "1px solid var(--red)", color: "var(--badge-red-text)", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13 };
export const smallBtn: React.CSSProperties = { fontSize: 12, padding: "4px 10px", textDecoration: "none" };
export const panel: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)", minWidth: 0 };
export const panelHead: React.CSSProperties = { padding: "16px 20px", borderBottom: "1px solid var(--card-border)" };
export const panelBody: React.CSSProperties = { padding: "16px 20px" };

export function Refused() {
  return (
    <div style={page}>
      <h1 style={{ marginBottom: 6 }}>系統總控中心</h1>
      <div style={errorBox}>這一頁只有擁有者或管理員能看。</div>
    </div>
  );
}

const TABS = [["/ops/systems", "systems", "系統總控中心"], ["/ops/systems/blocks", "blocks", "LEGO 積木目錄"]] as const;

/** Eyebrow, title, the two tabs and the right-hand buttons; both list pages open with it. */
export function SystemsHeader({ current, title, children }: { current: (typeof TABS)[number][1]; title: string; children?: React.ReactNode }) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2.2, fontWeight: 800, color: "var(--accent-text)" }}>DEVELOPMENT COMMAND CENTER</div>
          <h1 style={{ margin: "8px 0 6px" }}>{title}</h1>
        </div>
        <div style={{ display: "flex", gap: 9, alignItems: "center" }}>{children}</div>
      </div>
      <nav aria-label="總控中心分頁" style={{ display: "flex", gap: 6, margin: "10px 0 16px", borderBottom: "1px solid var(--card-border)" }}>
        {TABS.map(([href, key, label]) => (
          <Link key={key} href={href} aria-current={current === key ? "page" : undefined}
            style={{ padding: "8px 14px", fontSize: 13, fontWeight: 700, textDecoration: "none", marginBottom: -1,
              color: current === key ? "var(--accent-text)" : "var(--text-muted)", borderBottom: `2px solid ${current === key ? "var(--accent)" : "transparent"}` }}>
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}

/** 「＋ 新增系統」: writes a system_proposed event; the proposal waits under 待登記 until an agent adds it to registry.json. */
export function AddSystemForm() {
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

/** CSS the header pieces need (the 新增系統 popover and its type buttons). */
export const HEADER_CSS = `.sys-add{position:relative}.sys-add summary::-webkit-details-marker{display:none}.sys-type input{position:absolute;opacity:0;pointer-events:none}.sys-type{position:relative}.sys-type input:checked+span{background:var(--accent);color:var(--btn-primary-text)}.sys-type input:focus-visible+span{outline:2px solid var(--accent)}`;

/** 已驗收 % (solid) over 已實作 % (faint) for one system. */
export function Progress({ p }: { p: SystemProjection }) {
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

export const StatusBadge = ({ eff }: { eff: EffectiveState }) => (
  <span className={`card-badge ${eff.status ? EFFECTIVE_BADGE[eff.status] : "badge-gray"}`} style={{ display: "inline-flex", whiteSpace: "nowrap" }}>{eff.status ? `${EFFECTIVE_LABEL[eff.status]}${eff.inferred ? "（推定）" : ""}` : "未設定"}</span>
);

/** Last successful import, the current gaps, and a warning when the newest run did not end ok. */
export function ImportLine({ runs }: { runs: UpdateRow[] }) {
  const { lastOk, latest } = importSummary(runs);
  if (!latest) return <div style={box}>還沒有任何匯入紀錄：主機匯入器尚未跑過（或尚未開啟）。</div>;
  const short = (h: string | null) => (h ? h.slice(0, 9) : "—");
  return (
    <div style={latest.status === "ok" ? box : errorBox}>
      最後成功匯入：<strong>{formatTime(lastOk?.at)}</strong>（HEAD <code>{short(lastOk?.head ?? null)}</code>）・缺口 <strong>{latest.gaps}</strong> 項
      {latest.status !== "ok" && (
        <div style={{ marginTop: 4 }}>
          最近一次匯入（{formatTime(latest.at)}）{latest.status === "history_diverged" ? "發現 Git 歷史異常，已停止增量匯入" : "失敗"}
          {latest.error ? `：${latest.error}` : ""}。資料停在上一次成功的時間。
        </div>
      )}
    </div>
  );
}
