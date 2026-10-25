import type { ReactNode } from "react";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { ClientPanelNav } from "./ClientPanelNav";
import type { OrgStub } from "./ClientPanelNav";
import { NAV_FIRST, orgColor } from "./nav-orgs";

// The first NAV_FIRST clients only; the rest are found with the nav's search (GET /api/ops/org-search?q=).
export default async function ClientsLayout({ children }: { children: ReactNode }) {
  const supabase = getSupabaseServerClient();

  let orgs: OrgStub[] = [];
  let total = 0;
  if (supabase) {
    const { data, count } = await supabase
      .from("organizations")
      .select("slug, name, color:metadata->>color", { count: "exact" })
      .order("created_at", { ascending: true })
      .limit(NAV_FIRST);
    orgs = (data ?? []).map((row) => ({ slug: row.slug, name: row.name, color: orgColor(row.slug, row.color) }));
    total = count ?? orgs.length;
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <ClientPanelNav orgs={orgs} total={total} />
      <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
