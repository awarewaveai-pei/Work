/** Server component: collapsible setup guide + webhook endpoints. */
export function InboxGuidePanel({ publicBaseUrl }: { publicBaseUrl: string }) {
  const base = publicBaseUrl.replace(/\/$/, "");
  const paths = [
    { path: "/api/webhooks/sentry", note: "Sentry / 相容 payload" },
    { path: "/api/webhooks/grafana", note: "Grafana Alerting" },
    { path: "/api/webhooks/uptime-kuma", note: "Uptime Kuma" },
    { path: "/api/webhooks/netdata", note: "Netdata" },
    { path: "/api/webhooks/posthog", note: "需 OPS_INBOX_POSTHOG_ENABLED=true" },
  ] as const;

  return (
    <details
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        marginBottom: 16,
        overflow: "hidden",
      }}
    >
      <summary
        style={{
          padding: "10px 16px",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-muted)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          listStyle: "none",
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>ℹ</span>
        設定指南 / Webhook 端點
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>點擊展開</span>
      </summary>

      <div
        style={{
          borderTop: "1px solid var(--bg-subtle)",
          padding: "14px 16px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "14px 32px",
        }}
      >
        {/* Left: explanation */}
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.65 }}>
          <p style={{ marginBottom: 8 }}>
            <strong style={{ color: "var(--text-secondary)" }}>Ops Inbox</strong> 是警報寫入 Supabase 後的收件匣，不是監控儀表。
            在各來源端設定 Webhook（Bearer 使用伺服器上的{" "}
            <code style={{ fontSize: 11, background: "var(--badge-gray-bg)", padding: "1px 5px", borderRadius: 3 }}>
              OPS_INBOX_INGEST_TOKEN
            </code>
            ），事件才會出現在這裡。
          </p>
          <p style={{ marginBottom: 8 }}>
            <strong style={{ color: "var(--text-secondary)" }}>AI 診斷</strong> 在點進事件詳情頁後可用（ChatGPT / Claude / Gemini）。
          </p>
          <p>
            <strong style={{ color: "var(--text-secondary)" }}>合成測試腳本</strong>：
            <code style={{ fontSize: 11, background: "var(--badge-gray-bg)", padding: "1px 5px", borderRadius: 3 }}>
              test-ops-inbox-webhooks.sh
            </code>{" "}
            /{" "}
            <code style={{ fontSize: 11, background: "var(--badge-gray-bg)", padding: "1px 5px", borderRadius: 3 }}>
              .ps1
            </code>
          </p>
        </div>

        {/* Right: webhook endpoints */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
            Webhook 端點
          </p>
          {base ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {paths.map((row) => (
                <div
                  key={row.path}
                  style={{
                    background: "var(--bg-subtle)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "6px 10px",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontFamily: "ui-monospace, monospace",
                      color: "var(--text-secondary)",
                      wordBreak: "break-all",
                      marginBottom: 2,
                    }}
                  >
                    <span style={{ color: "var(--accent-text)", fontWeight: 600, marginRight: 6 }}>POST</span>
                    {base + row.path}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{row.note}</div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>無法推斷公開網址。</p>
          )}
        </div>
      </div>
    </details>
  );
}
