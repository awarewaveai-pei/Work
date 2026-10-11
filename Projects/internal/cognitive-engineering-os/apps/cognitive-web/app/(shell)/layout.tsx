import type { ReactNode } from "react";
import { AppNav } from "../../components/AppNav";

// Every page after login: the main menu + one content column (docs/mockups/home-mock.html `.app` / `.side` / `.wrap`).
// The menu does not read the catalog (no tool counts since 2026-10-11, ENTRY_SLICE1_CHECKLIST.md item 3): when GET
// /catalog fails, only the pages that list tools fail (app/(shell)/error.tsx); the run page and 我的案子 keep working.
export const dynamic = "force-dynamic";   // the catalog comes from the API at request time, never at build time

export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <AppNav />
      <main className="wrap">{children}</main>
    </div>
  );
}
