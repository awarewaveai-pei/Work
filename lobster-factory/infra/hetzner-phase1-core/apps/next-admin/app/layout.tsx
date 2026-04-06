import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-TW">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
