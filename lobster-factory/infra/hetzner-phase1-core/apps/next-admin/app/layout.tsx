import type { ReactNode, CSSProperties } from "react";
import "./globals.css";
import { PHProvider } from "./providers";
import { PostHogAnalytics } from "./posthog-analytics";
import { LogoutButton } from "./LogoutButton";
import { SidebarNav } from "./SidebarNav";
import { getThemeConfig } from "../lib/theme/store";

export const metadata = { title: "Lobster Factory Admin" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Saved global theme, server-side. Rendered as inline custom properties on <html> so the
  // operator's look applies on EVERY device before first paint (no FOUC, no localStorage).
  // Fail-open: getThemeConfig returns {} on any DB error/timeout → globals.css defaults.
  const { tokens, layout: navLayout } = await getThemeConfig();
  const themeStyle = tokens as CSSProperties;

  return (
    <html lang="zh-TW" style={themeStyle}>
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

              <SidebarNav initialLayout={navLayout} />

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
