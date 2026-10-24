import type { ReactNode, CSSProperties } from "react";
import "./globals.css";
import { PHProvider } from "./providers";
import { PostHogAnalytics } from "./posthog-analytics";
import { getThemeConfig } from "../lib/theme/store";

export const metadata = { title: "Lobster Factory Admin" };

// The saved theme is runtime data: a page prerendered at build time bakes <html> with no theme
// (the build has no DB), so it paints the defaults first. getThemeConfig is cached, so this is cheap.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Theme tokens applied on <html> so every page (admin shell + public intake) inherits
  // CSS vars before first paint — no FOUC. Sidebar shell lives in (shell)/layout.tsx.
  const { tokens } = await getThemeConfig();
  const themeStyle = tokens as CSSProperties;

  return (
    <html lang="zh-TW" style={themeStyle}>
      <body>
        <PHProvider>
          <PostHogAnalytics />
          {children}
        </PHProvider>
      </body>
    </html>
  );
}
