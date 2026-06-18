import type { ReactNode } from "react";
import "./globals.css";
import { PHProvider } from "./providers";
import { PostHogAnalytics } from "./posthog-analytics";
import { LogoutButton } from "./LogoutButton";
import { SidebarNav } from "./SidebarNav";

export const metadata = { title: "Lobster Factory Admin" };

// Inline script that runs synchronously before first paint — reads aw-theme-overrides
// from localStorage and applies CSS custom properties so theme changes survive page reload.
const THEME_INJECT_SCRIPT = `(function(){try{var o=JSON.parse(localStorage.getItem('aw-theme-overrides')||'{}');var s=document.documentElement.style;for(var k in o){if(k.indexOf('--')===0)s.setProperty(k,o[k]);}}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-TW">
      <head>
        {/* Must be first in <head> — applies before CSS bundle loads to eliminate FOUC */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INJECT_SCRIPT }} />
      </head>
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
