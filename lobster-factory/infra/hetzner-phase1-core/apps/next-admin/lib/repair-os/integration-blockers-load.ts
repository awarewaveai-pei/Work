// Integration blockers for /ops/integrations and /ops/repairs, read without loading every binding or every organization
// (every WordPress buyer is an organization). Only rows that can produce a blocker are read (buildIntegrationBlocker:
// status failed, a last_error, or a failed last health check), at most BLOCKER_SCAN_LIMIT; each row brings its
// organization's name through the FK (0024), so no second query and no id list in the URL.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildIntegrationBlockers, type IntegrationBlocker } from "./integration-blockers";

export const BLOCKER_SCAN_LIMIT = 200;

const CAN_BLOCK = "status.eq.failed,last_error.not.is.null,api_metadata->last_health_check->>ok.eq.false";

type OrgName = { slug: string; name: string };

/** capped = more candidate rows exist than were read. orgFilter: a client's own organization (null = staff, all). */
export async function loadIntegrationBlockers(
  sb: SupabaseClient,
  orgFilter: string | null,
): Promise<{ blockers: IntegrationBlocker[]; capped: boolean; error: string | null }> {
  let q = sb
    .from("tenant_integration_bindings")
    .select("id,organization_id,provider,status,last_error,api_metadata,organizations(slug,name)")
    .or(CAN_BLOCK)
    .order("created_at", { ascending: true })
    .limit(BLOCKER_SCAN_LIMIT + 1);
  if (orgFilter) q = q.eq("organization_id", orgFilter);
  const res = await q;
  if (res.error) return { blockers: [], capped: false, error: res.error.message };
  const rows = (res.data ?? []).slice(0, BLOCKER_SCAN_LIMIT);
  const orgs = new Map<string, { id: string } & OrgName>();
  for (const row of rows) {
    // many-to-one = one object at runtime; the untyped client infers an array
    const raw = row.organizations as unknown as OrgName | OrgName[] | null;
    const org = Array.isArray(raw) ? raw[0] : raw;
    if (org) orgs.set(row.organization_id as string, { id: row.organization_id as string, ...org });
  }
  const bindings = rows.map((row) => ({
    id: row.id as string,
    organization_id: row.organization_id as string,
    provider: row.provider as string,
    status: row.status as string,
    last_error: row.last_error as string | null,
    api_metadata: typeof row.api_metadata === "object" && row.api_metadata && !Array.isArray(row.api_metadata)
      ? (row.api_metadata as Record<string, unknown>)
      : null,
  }));
  return {
    blockers: buildIntegrationBlockers(bindings, [...orgs.values()]),
    capped: (res.data ?? []).length > BLOCKER_SCAN_LIMIT,
    error: null,
  };
}
