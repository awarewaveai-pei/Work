import type { ReactNode } from "react";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { ClientPanelNav } from "./ClientPanelNav";
import { NAV_FIRST, toPickOrg, type PickOrg } from "./nav-orgs";

// The first NAV_FIRST clients only; the rest are found with the nav's search (GET /api/ops/org-search?q=).
export default async function ClientsLayout({ children }: { children: ReactNode }) {
  const supabase = getSupabaseServerClient();

  let orgs: PickOrg[] = [];
  let total = 0;
  if (supabase) {
    const { data, count } = await supabase
      .from("organizations")
      .select("id, slug, name, color:metadata->>color", { count: "exact" })
      .neq("status", "inactive")
      .order("created_at", { ascending: true })
      .limit(NAV_FIRST);
    orgs = (data ?? []).map(toPickOrg);
    total = count ?? orgs.length;
  }

  return (
    <div className="client-panel-frame">
      <ClientPanelNav orgs={orgs} total={total} />
      <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
