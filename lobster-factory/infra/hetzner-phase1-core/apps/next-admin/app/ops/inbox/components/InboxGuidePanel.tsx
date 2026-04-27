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
        background: "#fff",
        border: "1px solid #e5e7eb",
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
          color: "#475569",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          listStyle: "none",
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: 12, color: "#94a3b8" }}>ℹ</span>
        設定指南 / Webhook 端點
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>點擊展開</span>
      </summary>

      <div
        style={{
          borderTop: "1px solid #f1f5f9",
          padding: "14px 16px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "14px 32px",
        }}
      >
        {/* Left: explanation */}
        <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.65 }}>
          <p style={{ marginBottom: 8 }}>
            <strong style={{ color: "#334155" }}>Ops Inbox</strong> 是警報寫入 Supabase 後的收件匣，不是監控儀表。
            在各來源端設定 Webhook（Bearer 使用伺服器上的{" "}
            <code style={{ fontSize: 11, background: "#f1f5f9", padding: "1px 5px", borderRadius: 3 }}>
              OPS_INBOX_INGEST_TOKEN
            </code>
            ），事件才會出現在這裡。
          </p>
          <p style={{ marginBottom: 8 }}>
            <strong style={{ color: "#334155" }}>AI 診斷</strong> 在點進事件詳情頁後可用（ChatGPT / Claude / Gemini）。
          </p>
          <p>
            <strong style={{ color: "#334155" }}>合成測試腳本</strong>：
            <code style={{ fontSize: 11, background: "#f1f5f9", padding: "1px 5px", borderRadius: 3 }}>
              test-ops-inbox-webhooks.sh
            </code>{" "}
            /{" "}
            <code style={{ fontSize: 11, background: "#f1f5f9", padding: "1px 5px", borderRadius: 3 }}>
              .ps1
            </code>
          </p>
        </div>

        {/* Right: webhook endpoints */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
            Webhook 端點
          </p>
          {base ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {paths.map((row) => (
                <div
                  key={row.path}
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e5e7eb",
                    borderRadius: 6,
                    padding: "6px 10px",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontFamily: "ui-monospace, monospace",
                      color: "#334155",
                      wordBreak: "break-all",
                      marginBottom: 2,
                    }}
                  >
                    <span style={{ color: "#6366f1", fontWeight: 600, marginRight: 6 }}>POST</span>
                    {base + row.path}
                  </div>
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>{row.note}</div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: "#94a3b8" }}>無法推斷公開網址。</p>
          )}
        </div>
      </div>
    </details>
  );
}
