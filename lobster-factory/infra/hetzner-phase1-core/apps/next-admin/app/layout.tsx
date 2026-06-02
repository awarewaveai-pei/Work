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

              {/* 1. 總覽 ─────────────────────────────────────── */}
              <div className="sidebar-section">
                <div className="sidebar-section-label">Overview</div>
                <Link href="/" className="sidebar-link">
                  <span className="sidebar-icon">◈</span> Dashboard
                </Link>
              </div>

              {/* 2. 維修主控（每天第一眼看）─────────────────── */}
              <div className="sidebar-section">
                <div className="sidebar-section-label">Repair OS</div>
                <Link href="/ops/repairs" className="sidebar-link" title="AI 維修主控台：incident → repair → evidence">
                  <span className="sidebar-icon">🛠</span> Repair Center
                  <OpsInboxBadge />
                </Link>
                <Link href="/ops/clients" className="sidebar-link" title="全客戶健康狀態 + WP 外掛更新">
                  <span className="sidebar-icon">👥</span> Clients
                </Link>
                <Link href="/ops/onboarding" className="sidebar-link" title="新客戶建站：填表 → Claude 生規格">
                  <span className="sidebar-icon">✨</span> Onboarding
                </Link>
                <Link href="/ops/integrations" className="sidebar-link" title="客戶工具串接狀態：監控 / 通知 / AI / GitHub">
                  <span className="sidebar-icon">⇄</span> Integrations
                </Link>
                <Link href="/api-check" className="sidebar-link" title="Node API 健康（server-side）">
                  <span className="sidebar-icon">⬡</span> API Health
                </Link>
              </div>

              {/* 3. 操作（需要動作的事）────────────────────── */}
              <div className="sidebar-section">
                <div className="sidebar-section-label">Actions</div>
                <Link href="/ops/approvals" className="sidebar-link" title="高風險指令簽核佇列">
                  <span className="sidebar-icon">✓</span> Approvals
                </Link>
                <Link href="/ops/system-modes" className="sidebar-link" title="全域 Kill Switch / 維護模式">
                  <span className="sidebar-icon">◐</span> System Modes
                </Link>
              </div>

              {/* 4. 客戶開通（建立新東西）─────────────────── */}
              <div className="sidebar-section">
                <div className="sidebar-section-label">Provisioning</div>
                <Link href="/onboard" className="sidebar-link" title="新客戶上線精靈">
                  <span className="sidebar-icon">✦</span> New Client
                </Link>
                <Link href="/build" className="sidebar-link" title="部署執行：plan_only 或 enqueue">
                  <span className="sidebar-icon">⚡</span> Build Console
                </Link>
              </div>

              {/* 5. 內容工具（未來功能）─────────────────────── */}
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

              {/* 6. 系統（技術內部）──────────────────────────── */}
              <div className="sidebar-section">
                <div className="sidebar-section-label">System</div>
                <Link href="/ops-console" className="sidebar-link" title="架構邊界 · Tenant 設定 · M3 · AI Job">
                  <span className="sidebar-icon">▣</span> Ops Console
                </Link>
                <Link href="/ops/inbox" className="sidebar-link" title="內部事件引擎：除錯與原始事件檢視">
                  <span className="sidebar-icon">◇</span> Incident Engine
                </Link>
                <Link href="/api-check-client" className="sidebar-link" title="Node API 健康（browser-side）">
                  <span className="sidebar-icon">⬡</span> API Health (browser)
                </Link>
              </div>

              {/* 7. 外部工具（對外連結）──────────────────────── */}
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
