// Cold Outreach Workbench — server-side data layer (Phase 1 shell).
// SSOT: agency-os/docs/Outbound_OS_Engineering_Spec/COLD_OUTREACH_WORKBENCH_INTEGRATED_SPEC_v1.md (§B0.1)
//
// Access model (verified reality, §B0.1): this is an agency-internal ops console. DB access goes
// through the service-role client (lib/supabase-server.ts); RLS on co_* tables is service-role-only
// defense-in-depth. organization_id is a nullable "which client" FILTER (passed from route context,
// like ops/clients/[slug]), NOT a per-login isolation boundary. Route-layer ops-role RBAC
// (lib/ops-role.ts canManageOutreach) is the access gate. Per-tenant login isolation = Phase 5.
//
// All helpers fail soft (return zeros, never throw) so a page renders even if Supabase env is
// absent locally — same defensive posture as the rest of the console.

import { getSupabaseServerClient } from "@/lib/supabase-server";

export interface OutreachCounts {
  leads: number;
  inbox: number;
  suppression: number;
}

async function countRows(table: string, organizationId?: string): Promise<number> {
  const sb = getSupabaseServerClient();
  if (!sb) return 0;
  try {
    let query = sb.from(table).select("*", { count: "exact", head: true });
    if (organizationId) query = query.eq("organization_id", organizationId);
    const { count, error } = await query;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Headline counts for the Dashboard. organizationId scopes to one client when provided. */
export async function getOutreachCounts(organizationId?: string): Promise<OutreachCounts> {
  const [leads, inbox, suppression] = await Promise.all([
    countRows("co_leads", organizationId),
    countRows("co_lead_inbox", organizationId),
    countRows("co_suppression_list", organizationId),
  ]);
  return { leads, inbox, suppression };
}
