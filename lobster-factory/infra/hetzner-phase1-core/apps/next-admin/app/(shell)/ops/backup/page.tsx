// /ops/backup — every store's backup, as the host's daily coverage check saw it (BACKUP_COVERAGE_PLAN.md B6).
// Read-only: the page never starts a backup.
import { readBackupCoverage, BACKUP_COVERAGE_MAX_AGE_HOURS, type CoverageRow } from "@/lib/backup/coverage";

export const dynamic = "force-dynamic";
export const metadata = { title: "備份 · Ops" };

const cell = { padding: "10px 12px", borderBottom: "1px solid var(--border)", fontSize: 14, verticalAlign: "top" as const };

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span style={{ fontWeight: 600, color: ok ? "var(--green)" : "var(--red)" }}>{ok ? "正常" : "有問題"}</span>
  );
}

export default async function BackupsPage() {
  const read = await readBackupCoverage();
  const rows: CoverageRow[] = read.state === "ok" || read.state === "stale"
    ? [...read.status.rows].sort((a, b) => (a.status === b.status ? 0 : a.status === "FAIL" ? -1 : 1))
    : [];
  const fails = rows.filter((r) => r.status === "FAIL").length;

  let headline: string;
  let healthy = false;
  if (read.state === "missing" || read.state === "unreadable") {
    headline = `讀不到檢查結果：${read.reason}。`;
  } else if (read.state === "stale") {
    headline = `最近一次檢查是 ${Math.round(read.ageHours)} 小時前，超過 ${BACKUP_COVERAGE_MAX_AGE_HOURS} 小時，檢查可能停了。`;
  } else if (read.status.overall === "ERROR") {
    headline = `檢查沒有跑完：${read.status.error ?? "原因不明"}。`;
  } else if (fails > 0) {
    headline = `${rows.length} 項裡有 ${fails} 項有問題。`;
  } else {
    healthy = true;
    headline = `${rows.length} 項全部正常：每個庫都有今天的備份，也都已送到 R2。`;
  }

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1000 }}>
      <h1 style={{ marginBottom: 6 }}>備份</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 24 }}>
        主機每天 03:30（UTC）檢查一次：每個存資料的服務都要有今天的備份，而且已經送到 R2。
      </p>

      <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: 8, padding: "16px 20px", marginBottom: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: healthy ? "var(--green)" : "var(--red)" }}>{headline}</div>
        {(read.state === "ok" || read.state === "stale") && (
          <div style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 6 }}>
            檢查時間：{new Date(read.status.generated_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}（台北時間）
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
              <th style={cell}>狀態</th>
              <th style={cell}>項目</th>
              <th style={cell}>說明</th>
              <th style={cell}>處理卡片</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={cell}><StatusBadge ok={r.status === "PASS"} /></td>
                <td style={{ ...cell, fontFamily: "monospace" }}>{r.id}</td>
                <td style={cell}>{r.detail}</td>
                <td style={cell}>{r.plan ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
