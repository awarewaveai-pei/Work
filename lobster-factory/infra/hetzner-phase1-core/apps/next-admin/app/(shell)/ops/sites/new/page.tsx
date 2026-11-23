// /ops/sites/new -- "新增客戶網站" (SITE-FLOW-COMPLETION-PLAN.md §2 step 1, cards SF-J / SF-J2). Staff only; the API refuses anyone but owner/admin.
// The first NAV_FIRST clients come from the server for the 既有客戶 picker; the picker searches the rest (OrgPicker.tsx).
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { NAV_FIRST, toPickOrg, type PickOrg } from "../../clients/nav-orgs";
import { NewSiteForm } from "./NewSiteForm";

export const dynamic = "force-dynamic";

const ORG_COLS = "id,slug,name,color:metadata->>color";

/** The picker's first page; none (Supabase unset or unreadable) still leaves the search and the 新客戶 path working. */
async function loadClients(): Promise<{ clients: PickOrg[]; total: number }> {
  const sb = getSupabaseWriteClient();
  if (!sb) return { clients: [], total: 0 };
  const { data, error, count } = await sb.from("organizations").select(ORG_COLS, { count: "exact" }).neq("status", "inactive").order("created_at", { ascending: true }).limit(NAV_FIRST);
  if (error || !data) return { clients: [], total: 0 };
  const clients = data.map(toPickOrg);
  return { clients, total: count ?? clients.length };
}

export default async function NewSitePage() {
  const { clients, total } = await loadClients();
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: "var(--font-size-xl)", margin: "0 0 6px", color: "var(--text-primary)" }}>新增客戶網站</h1>
      <p style={{ color: "var(--text-muted)", fontSize: "var(--font-size-base)", margin: "0 0 20px" }}>
        填完按「建立」，系統只會建立紀錄，不會動主機。接著在建站流程頁一步一步做。
      </p>
      <NewSiteForm orgs={clients} total={total} />
    </div>
  );
}
