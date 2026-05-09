import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
import { PHProvider } from "./providers";
import { PostHogAnalytics } from "./posthog-analytics";
import { OpsInboxBadge } from "./ops/inbox/components/OpsInboxBadge";

export const metadata = { title: "Lobster Factory Admin" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>
        <PHProvider>
          <PostHogAnalytics />
          <div className="shell">
            <nav className="sidebar">
              <div className="sidebar-logo">
                <div className="sidebar-logo-mark">L</div>
                <div>
                  <div className="sidebar-logo-text">Lobster Factory</div>
                  <div className="sidebar-logo-sub">Admin Console</div>
                </div>
              </div>

              {/* ── Operations（日常監控） ── */}
              <div className="sidebar-section">
                <div className="sidebar-section-label">Operations</div>
                <Link href="/ops/inbox" className="sidebar-link" title="警報收件匣：Sentry / Uptime Kuma / Grafana / Netdata">
                  <span className="icon">📥</span> Ops Inbox
                  <OpsInboxBadge />
                </Link>
                <Link href="/ops/clients" className="sidebar-link" title="全客戶健康狀態 + WordPress 外掛更新">
                  <span className="icon">👥</span> Clients
                </Link>
                <Link href="/ops/approvals" className="sidebar-link" title="高風險指令需經 owner / admin 簽核">
                  <span className="icon">✓</span> 待簽核指令
                </Link>
                <Link href="/ops/system-modes" className="sidebar-link" title="全域 kill switch / 系統模式">
                  <span className="icon">◐</span> 系統模式
                </Link>
              </div>

              {/* ── Provisioning（新客戶上線） ── */}
              <div className="sidebar-section">
                <div className="sidebar-section-label">Provisioning</div>
                <Link href="/onboard" className="sidebar-link" title="新客戶上線精靈：資訊 → 部門 → 服務開通 → Build">
                  <span className="icon">✦</span> New Client
                </Link>
                <Link href="/build" className="sidebar-link" title="部署執行：plan_only 或 enqueue 模式">
                  <span className="icon">B</span> Build Console
                </Link>
              </div>

              {/* ── System（系統管理） ── */}
              <div className="sidebar-section">
                <div className="sidebar-section-label">System</div>
                <Link href="/" className="sidebar-link">
                  <span className="icon">◈</span> Dashboard
                </Link>
                <Link href="/ops-console" className="sidebar-link" title="架構邊界 · Tenant 設定 · M3 部門 · AI Job">
                  <span className="icon">▣</span> Ops Console
                </Link>
                <Link href="/api-check" className="sidebar-link" title="Node API 健康（server-side fetch）">
                  <span className="icon">⬡</span> API Health
                </Link>
                <Link href="/api-check-client" className="sidebar-link" title="Node API 健康（browser fetch）">
                  <span className="icon">⬡</span> API Health (browser)
                </Link>
              </div>

              {/* ── Services（外部服務） ── */}
              <div className="sidebar-section">
                <div className="sidebar-section-label">Services</div>
                <a href="https://n8n.aware-wave.com" target="_blank" rel="noreferrer" className="sidebar-link">
                  <span className="icon">⚙</span> n8n
                </a>
                <a href="https://uptime.aware-wave.com" target="_blank" rel="noreferrer" className="sidebar-link">
                  <span className="icon">◉</span> Uptime Kuma
                </a>
                <a href="https://trigger.aware-wave.com" target="_blank" rel="noreferrer" className="sidebar-link">
                  <span className="icon">▶</span> Trigger.dev
                </a>
                <a href="https://aware-wave.com" target="_blank" rel="noreferrer" className="sidebar-link">
                  <span className="icon">◻</span> WordPress
                </a>
              </div>

              <div className="sidebar-footer">
                aware-wave.com
              </div>
            </nav>

            <div className="main">
              {children}
            </div>
          </div>
        </PHProvider>
      </body>
    </html>
  );
}
