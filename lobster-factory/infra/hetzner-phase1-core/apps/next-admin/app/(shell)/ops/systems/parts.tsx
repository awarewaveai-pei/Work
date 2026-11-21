// Pieces both /ops/systems pages use. Theme tokens and globals.css classes only.
import { importSummary, type UpdateRow } from "@/lib/systems/projection";
import { formatTime } from "@/lib/systems/labels";

export const page: React.CSSProperties = { padding: "32px 40px", maxWidth: 1100 };
export const muted: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)" };
export const box: React.CSSProperties = { background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13 };
export const errorBox: React.CSSProperties = { background: "var(--badge-red-bg)", border: "1px solid var(--red)", color: "var(--badge-red-text)", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13 };

export function Refused() {
  return (
    <div style={page}>
      <h1 style={{ marginBottom: 6 }}>系統總控中心</h1>
      <div style={errorBox}>這一頁只有擁有者或管理員能看。</div>
    </div>
  );
}

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
