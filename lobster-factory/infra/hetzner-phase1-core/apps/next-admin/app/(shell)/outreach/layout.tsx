import type { ReactNode } from "react";
import { Suspense } from "react";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { OrgSwitcher, type OrgOption } from "./OrgSwitcher";

// Outreach module shell: loads the client list (same source as /ops/clients = organizations table)
// and renders the 代操 client switcher above every outreach page. Suspense wraps children so the
// pages' useSearchParams (useActiveOrg) usage is satisfied without per-page boilerplate.
export const dynamic = "force-dynamic";

export default async function OutreachLayout({ children }: { children: ReactNode }) {
  const supabase = getSupabaseServerClient();
  let orgs: OrgOption[] = [];
  if (supabase) {
    const { data } = await supabase.from("organizations").select("id, name").order("created_at", { ascending: true });
    if (Array.isArray(data)) {
      orgs = data.map((r) => {
        const row = r as { id: unknown; name: unknown };
        return { id: String(row.id), name: String(row.name ?? "(unnamed)") };
      });
    }
  }
  return (
    <Suspense fallback={null}>
      <OrgSwitcher orgs={orgs} />
      {children}
    </Suspense>
  );
}
