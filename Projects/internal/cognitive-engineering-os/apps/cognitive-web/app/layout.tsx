import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import "./design-system.css";
import "./globals.css";
import { strings } from "../lib/strings";
import { THEME_COOKIE, themeOf } from "../lib/theme";

export const metadata: Metadata = { title: strings.appName };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// The colour the person chose in 設定 (lib/theme.ts), on <html> before the page is sent; none = follow the computer.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = themeOf((await cookies()).get(THEME_COOKIE)?.value);
  return <html lang="zh-Hant" data-theme={theme}><body>{children}</body></html>;
}
