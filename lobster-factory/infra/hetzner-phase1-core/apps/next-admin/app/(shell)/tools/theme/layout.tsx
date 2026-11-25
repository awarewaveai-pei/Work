import type { ReactNode } from "react";

// page.tsx is a client page, so its <title> lives here (menu name = <title> = <h1>, lib/portal/__tests__/page-names.test.ts).
export const metadata = { title: "主題編輯器" };

export default function ThemeLayout({ children }: { children: ReactNode }) {
  return children;
}
