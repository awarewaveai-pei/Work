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

              {/* ── Overview ─────────────────────────────────── */}
              <div className="sidebar-section">
                <div className="sidebar-section-label">Overview</div>
                <Link href="/" className="sidebar-link">
                  <span className="sidebar-icon">◈</span> Dashboard
                </Link>
              </div>

              {/* ── Operations（日常監控）────────────────────── */}
              <div className="sidebar-section">
                <div className="sidebar-section-label">Operations</div>
                <Link href="/ops/inbox" className="sidebar-link" title="警報收件匣：Sentry / Uptime Kuma / Grafana / Netdata">
                  <span className="sidebar-icon">📥</span> Ops Inbox
                  <OpsInboxBadge />
                </Link>
                <Link href="/ops/clients" className="sidebar-link" title="全客戶健康狀態 + WordPress 外掛更新">
                  <span className="sidebar-icon">👥</span> Clients
                </Link>
                <Link href="/ops/approvals" className="sidebar-link" title="高風險指令需經 owner / admin 簽核">
                  <span className="sidebar-icon">✓</span> Approvals
                </Link>
                <Link href="/ops/system-modes" className="sidebar-link" title="全域 kill switch / 系統模式">
                  <span className="sidebar-icon">◐</span> System Modes
                </Link>
              </div>

              {/* ── Provisioning（新客戶上線）────────────────── */}
              <div className="sidebar-section">
                <div className="sidebar-section-label">Provisioning</div>
                <Link href="/onboard" className="sidebar-link" title="新客戶上線精靈：資訊 → 部門 → 服務開通 → Build">
                  <span className="sidebar-icon">✦</span> New Client
                </Link>
                <Link href="/build" className="sidebar-link" title="部署執行：plan_only 或 enqueue 模式">
                  <span className="sidebar-icon">⚡</span> Build Console
                </Link>
              </div>

              {/* ── Content Tools（未來功能）─────────────────── */}
              <div className="sidebar-section">
                <div className="sidebar-section-label">Content Tools</div>
                <span className="sidebar-link-disabled">
                  <span className="sidebar-icon">✏</span> Generator
                  <span className="sidebar-coming-soon">Soon</span>
                </span>
                <span className="sidebar-link-disabled">
                  <span className="sidebar-icon">◧</span> Templates
                  <span className="sidebar-coming-soon">Soon</span>
                </span>
              </div>

              {/* ── Infrastructure（系統管理）────────────────── */}
              <div className="sidebar-section">
                <div className="sidebar-section-label">Infrastructure</div>
                <Link href="/ops-console" className="sidebar-link" title="架構邊界 · Tenant 設定 · M3 部門 · AI Job">
                  <span className="sidebar-icon">▣</span> Ops Console
                </Link>
                <Link href="/api-check" className="sidebar-link" title="Node API 健康（server-side fetch）">
                  <span className="sidebar-icon">⬡</span> API Health
                </Link>
                <Link href="/api-check-client" className="sidebar-link" title="Node API 健康（browser fetch）">
                  <span className="sidebar-icon">⬡</span> API Health (client)
                </Link>
              </div>

              {/* ── External Services（外部服務）─────────────── */}
              <div className="sidebar-section">
                <div className="sidebar-section-label">External</div>
                <a href="https://n8n.aware-wave.com" target="_blank" rel="noreferrer" className="sidebar-link">
                  <span className="sidebar-icon">⚙</span> n8n
                  <span className="sidebar-ext">↗</span>
                </a>
                <a href="https://uptime.aware-wave.com" target="_blank" rel="noreferrer" className="sidebar-link">
                  <span className="sidebar-icon">◉</span> Uptime Kuma
                  <span className="sidebar-ext">↗</span>
                </a>
                <a href="https://trigger.aware-wave.com" target="_blank" rel="noreferrer" className="sidebar-link">
                  <span className="sidebar-icon">▶</span> Trigger.dev
                  <span className="sidebar-ext">↗</span>
                </a>
                <a href="https://aware-wave.com" target="_blank" rel="noreferrer" className="sidebar-link">
                  <span className="sidebar-icon">◻</span> WordPress
                  <span className="sidebar-ext">↗</span>
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
