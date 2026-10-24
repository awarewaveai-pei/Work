import type { ReactNode, CSSProperties } from "react";
import "./globals.css";
import { PHProvider } from "./providers";
import { PostHogAnalytics } from "./posthog-analytics";
import { getThemeConfig } from "../lib/theme/store";
import { FONT_TOKENS, googleFontsHref } from "../lib/theme/fonts";

export const metadata = { title: "Lobster Factory Admin" };

// The saved theme is runtime data: a page prerendered at build time bakes <html> with no theme
// (the build has no DB), so it paints the defaults first. getThemeConfig is cached, so this is cheap.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Theme tokens applied on <html> so every page (admin shell + public intake) inherits
  // CSS vars before first paint — no FOUC. Sidebar shell lives in (shell)/layout.tsx.
  const { tokens } = await getThemeConfig();
  const themeStyle = tokens as CSSProperties;
  // A saved web font (lib/theme/fonts.ts) is fetched only when a font token picks one.
  const fontsHref = googleFontsHref(Object.keys(FONT_TOKENS).map((k) => tokens[k]).filter(Boolean));

  return (
    <html lang="zh-TW" style={themeStyle}>
      {fontsHref && (
        <head>
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link rel="stylesheet" href={fontsHref} />
        </head>
      )}
      <body>
        <PHProvider>
          <PostHogAnalytics />
          {children}
        </PHProvider>
      </body>
    </html>
  );
}
