"use client";

// The /ops/clients sidebar: the client block (OrgPicker.tsx) in link mode, so the sidebar and every page that picks a
// client are one component. The layout hands over the first NAV_FIRST clients; typing searches the rest on the server.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrgPicker } from "./OrgPicker";
import type { PickOrg } from "./nav-orgs";

/** The client slug the current path is under (/ops/clients/<slug>[/...]), or null. */
function slugIn(pathname: string): string | null {
  const m = /^\/ops\/clients\/([^/]+)/.exec(pathname);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }   // a malformed %-escape must not crash the sidebar
}

export function ClientPanelNav({ orgs, total }: { orgs: PickOrg[]; total: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="客戶列表" className="client-panel">   {/* globals.css: beside the page, or inside 「更多」 at ≤ 640 */}
      <div style={{ padding: "12px 12px 0", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        客戶
      </div>
      <OrgPicker searchPath="/api/ops/org-search" orgs={orgs} total={total} selected={slugIn(pathname)} by="slug" fill hrefFor={(org) => `/ops/clients/${org.slug}`} />
      <div style={{ padding: "8px 10px", borderTop: "1px solid var(--card-border)" }}>
        <Link
          href="/ops/sites/new"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 8px", borderRadius: 6,
            border: "1px dashed var(--card-border)",
            color: "var(--text-muted)", fontSize: 12, textDecoration: "none",
          }}
        >
          + 新增客戶
        </Link>
      </div>
    </nav>
  );
}
