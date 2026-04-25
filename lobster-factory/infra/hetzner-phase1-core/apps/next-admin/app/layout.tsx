import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
import { PHProvider } from "./providers";

export const metadata = { title: "Lobster Factory Admin" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>
        <PHProvider>
          <div className="shell">
            <nav className="sidebar">
              <div className="sidebar-logo">
                <div className="sidebar-logo-mark">L</div>
                <div>
                  <div className="sidebar-logo-text">Lobster Factory</div>
                  <div className="sidebar-logo-sub">Admin Console</div>
                </div>
              </div>

              <div className="sidebar-section">
                <div className="sidebar-section-label">Overview</div>
                <Link href="/" className="sidebar-link">
                  <span className="icon">◈</span> Dashboard
                </Link>
                <Link href="/ops-console" className="sidebar-link">
                  <span className="icon">▣</span> Ops Console v1
                </Link>
                <Link href="/api-check" className="sidebar-link">
                  <span className="icon">⬡</span> API Health
                </Link>
                <Link href="/api-check-client" className="sidebar-link">
                  <span className="icon">⬡</span> API Health (browser)
                </Link>
              </div>

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
