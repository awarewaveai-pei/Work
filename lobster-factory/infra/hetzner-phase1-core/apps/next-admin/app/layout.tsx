import type { ReactNode } from "react";
import "./globals.css";
import { PHProvider } from "./providers";
import { PostHogAnalytics } from "./posthog-analytics";
import { LogoutButton } from "./LogoutButton";
import { SidebarNav } from "./SidebarNav";

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

              <SidebarNav />

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
