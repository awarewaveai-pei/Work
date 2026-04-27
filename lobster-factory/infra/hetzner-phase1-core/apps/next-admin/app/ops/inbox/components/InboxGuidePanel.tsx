/** Server component: explains Path B inbox vs monitors + webhook targets (no secrets). */
export function InboxGuidePanel({ publicBaseUrl }: { publicBaseUrl: string }) {
  const base = publicBaseUrl.replace(/\/$/, "");
  const paths = [
    { method: "POST", path: "/api/webhooks/sentry", note: "Sentry / 相容 payload" },
    { method: "POST", path: "/api/webhooks/grafana", note: "Grafana Alerting" },
    { method: "POST", path: "/api/webhooks/uptime-kuma", note: "Uptime Kuma" },
    { method: "POST", path: "/api/webhooks/posthog", note: "需 OPS_INBOX_POSTHOG_ENABLED=true" },
    { method: "POST", path: "/api/webhooks/netdata", note: "Netdata" },
  ] as const;

  return (
    <aside
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        maxWidth: 720,
      }}
    >
      <h2 style={{ fontSize: 15, marginBottom: 8 }}>這頁在做什麼？</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 12, lineHeight: 1.55 }}>
        <strong>Ops Inbox</strong>不是監控儀表，而是<strong>警報與事件寫入 Supabase 後的收件匣</strong>。側欄的 Uptime Kuma、n8n
        等是「監看來源」；請在來源端設定 Webhook（Bearer 使用伺服器上的 <code style={{ fontSize: 12 }}>OPS_INBOX_INGEST_TOKEN</code>
        ），事件才會出現在這裡。
      </p>
      <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 12, lineHeight: 1.55 }}>
        <strong>AI 協助修復</strong>在<strong>點進某一筆事件</strong>後的詳情頁：可一鍵帶上下文到 ChatGPT / Claude / Gemini，或貼回診斷到時間軸。
        沒有任何事件時，下方不會出現那些按鈕。
      </p>
      <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 12, lineHeight: 1.55 }}>
        <strong>四來源合成測試</strong>（Sentry / Uptime Kuma / Grafana / Netdata）：在 monorepo 執行{" "}
        <code style={{ fontSize: 12 }}>lobster-factory/infra/hetzner-phase1-core/scripts/test-ops-inbox-webhooks.ps1</code> 或{" "}
        <code style={{ fontSize: 12 }}>test-ops-inbox-webhooks.sh</code>
        （需設定 <code style={{ fontSize: 12 }}>OPS_INBOX_TEST_BASE_URL</code> 與 <code style={{ fontSize: 12 }}>OPS_INBOX_INGEST_TOKEN</code>
        ）。Slack 需在部署環境開啟 <code style={{ fontSize: 12 }}>OPS_INBOX_NOTIFY_ENABLED=true</code> 並設定 Incoming Webhook。
      </p>
      {base ? (
        <>
          <h3 style={{ fontSize: 13, marginBottom: 8 }}>Webhook 端點（複製到監控後台）</h3>
          <ul style={{ listStyle: "none", fontSize: 12, fontFamily: "ui-monospace, monospace" }}>
            {paths.map((row) => (
              <li key={row.path} style={{ marginBottom: 6, wordBreak: "break-all" }}>
                <span style={{ color: "var(--text-muted)" }}>{row.method} </span>
                <strong>{base + row.path}</strong>
                <span style={{ color: "var(--text-muted)", fontFamily: "inherit", marginLeft: 6 }}>— {row.note}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p style={{ color: "var(--text-muted)", fontSize: 12 }}>無法推斷公開網址；請以實際 Admin 網域替換上列路徑。</p>
      )}
    </aside>
  );
}
