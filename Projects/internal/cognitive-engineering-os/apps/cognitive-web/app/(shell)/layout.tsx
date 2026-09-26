import type { ReactNode } from "react";
import { AppNav } from "../../components/AppNav";
import { loadCatalog } from "../../lib/catalog";

// Every page after login: the main menu + one content column (docs/mockups/home-mock.html `.app` / `.side` / `.wrap`).
// The menu does not depend on the catalog: when GET /catalog fails, the menu shows without counts and only the pages
// that list tools fail (app/(shell)/error.tsx); the run page and 我的專案 keep working.
export const dynamic = "force-dynamic";   // the catalog comes from the API at request time, never at build time

export default async function ShellLayout({ children }: { children: ReactNode }) {
  const catalog = await loadCatalog().catch(() => null);
  return (
    <div className="app">
      <AppNav counts={catalog ? { tools: catalog.counts.tools, workflows: catalog.counts.user_workflows } : null} />
      <main className="wrap">{children}</main>
    </div>
  );
}
