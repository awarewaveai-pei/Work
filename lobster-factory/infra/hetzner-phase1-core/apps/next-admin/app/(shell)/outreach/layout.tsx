import type { ReactNode } from "react";
import { Suspense } from "react";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { NAV_FIRST, toPickOrg, type PickOrg } from "../ops/clients/nav-orgs";
import { OrgSwitcher } from "./OrgSwitcher";

// Outreach module shell: loads the first NAV_FIRST clients (same source and order as the /ops/clients nav; the
// switcher searches the rest) and renders the 代操 client switcher above every outreach page. Suspense wraps children so the
// pages' useSearchParams (useActiveOrg) usage is satisfied without per-page boilerplate.
export const dynamic = "force-dynamic";

export default async function OutreachLayout({ children }: { children: ReactNode }) {
  const supabase = getSupabaseServerClient();
  let orgs: PickOrg[] = [];
  let total = 0;
  if (supabase) {
    const { data, count } = await supabase
      .from("organizations")
      .select("id, slug, name, color:metadata->>color", { count: "exact" })
      .order("created_at", { ascending: true })
      .limit(NAV_FIRST);
    orgs = (data ?? []).map(toPickOrg);
    total = count ?? orgs.length;
  }
  return (
    <Suspense fallback={null}>
      <OrgSwitcher orgs={orgs} total={total} />
      {children}
    </Suspense>
  );
}
