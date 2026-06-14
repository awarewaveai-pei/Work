import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
import { PHProvider } from "./providers";
import { PostHogAnalytics } from "./posthog-analytics";
import { OpsInboxBadge } from "./ops/inbox/components/OpsInboxBadge";
import { LogoutButton } from "./LogoutButton";

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
                <Link href="/ops/onboarding" className="sidebar-link" title="建站第 1 步：客戶探索式問卷（公司/品牌/客群/目標/視覺）→ Claude 生成網站規格">
                  <span className="sidebar-icon">✨</span> Onboarding（客戶 Intake）
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
                <Link href="/onboard" className="sidebar-link" title="建站第 2 步：技術建站精靈（客戶資訊 → 部門選型 M3 → 開通服務帳號 → 帶入 Build Console）。intake 之後的執行步驟">
                  <span className="sidebar-icon">✦</span> 建站精靈（技術）
                </Link>
                <Link href="/build" className="sidebar-link" title="部署執行：plan_only 或 enqueue">
                  <span className="sidebar-icon">⚡</span> Build Console
                </Link>
              </div>

              {/* 5. 內容工具（未來功能）─────────────────────── */}
              <div className="sidebar-section">
                <div className="sidebar-section-label">Content Tools</div>
                <Link href="/tools/content" className="sidebar-link" title="SEO/GEO 文章產出：關鍵字 → AI 產文 → WordPress 草稿一鍵推送">
                  <span className="sidebar-icon">✍</span> SEO Content
                </Link>
                <Link href="/tools/tarot" className="sidebar-link" title="塔羅牌印刷檔生成工具：AI 生成整套 78 張同風格牌卡">
                  <span className="sidebar-icon">🔮</span> Tarot
                </Link>
                <Link href="/tools/studio" className="sidebar-link" title="POD 設計生成器：主題/氛圍/風格 → 多模型生成 → 存入 My Designs">
                  <span className="sidebar-icon">✏</span> Studio
                </Link>
                <Link href="/tools/mockup" className="sidebar-link" title="AI 擬真商品照：設計圖 + 平拍/模特雙模式 + 鎖色鐵則 → Nano Banana 2 合成">
                  <span className="sidebar-icon">👕</span> Mockup
                </Link>
                <Link href="/tools/canvas" className="sidebar-link" title="快速編輯 Canvas：上傳圖案 + 加文字 + 拖曳/縮放/旋轉，即時預覽 → 下載 PNG 或存入 My Designs（Fabric.js）">
                  <span className="sidebar-icon">🎨</span> Canvas Editor
                </Link>
                <Link href="/tools/vector-editor" className="sidebar-link" title="向量設計工具：影像描圖向量化 + 字型庫 + QR/條碼 + 環形文字/文字沿路徑 + 去白底/AI去背 + Mockup + 出血裁切 + 批次匯出（14 積木）">
                  <span className="sidebar-icon">✒</span> Vector Editor
                </Link>
                <Link href="/tools/designs" className="sidebar-link" title="已儲存設計庫（R2 持久化），可重用/下載">
                  <span className="sidebar-icon">🗂</span> My Designs
                </Link>
                <Link href="/tools/publish" className="sidebar-link" title="一鍵上架：設計 → 300DPI 印刷檔 → Woo 草稿商品 → Printful 綁定（draft 人審後 publish）">
                  <span className="sidebar-icon">🛒</span> Publish
                </Link>
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
                <Link href="/ops/inbox" className="sidebar-link" title="事件收斂中心：所有來源事件 + AI 分類 + 原始 payload">
                  <span className="sidebar-icon">◇</span> Ops Inbox
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
                <LogoutButton />
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
