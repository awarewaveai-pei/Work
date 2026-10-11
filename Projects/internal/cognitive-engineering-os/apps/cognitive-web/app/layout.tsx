import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./design-system.css";
import "./globals.css";
import { strings } from "../lib/strings";

export const metadata: Metadata = { title: strings.appName };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
