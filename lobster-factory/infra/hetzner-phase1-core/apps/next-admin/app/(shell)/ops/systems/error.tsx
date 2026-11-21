"use client";
// A failure inside /ops/systems stays inside it: the rest of the back office keeps working (PLAN §6 隔離).
export default function SystemsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ padding: "32px 40px", maxWidth: 800 }}>
      <h1 style={{ marginBottom: 6 }}>系統總控中心</h1>
      <div style={{ background: "var(--badge-red-bg)", border: "1px solid var(--red)", color: "var(--badge-red-text)", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 13 }}>
        這一頁暫時出錯，後台其他頁不受影響。{error.digest ? `（代碼 ${error.digest}）` : ""}
      </div>
      <button type="button" className="btn-secondary" onClick={reset}>再試一次</button>
    </div>
  );
}
