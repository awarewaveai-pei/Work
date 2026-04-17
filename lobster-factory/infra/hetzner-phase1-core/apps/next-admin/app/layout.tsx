import type { ReactNode } from "react";
import { PHProvider } from "./providers";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-TW">
      <body style={{ margin: 0 }}>
        <PHProvider>{children}</PHProvider>
      </body>
    </html>
  );
}
