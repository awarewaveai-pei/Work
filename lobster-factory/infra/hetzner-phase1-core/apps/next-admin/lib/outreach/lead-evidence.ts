// A fact a person or an import wrote down about a lead (inbox observation + source, a manual lead's observation) becomes
// one approved co_evidence row (card C9.2): the Cold Gate reads co_evidence only. Same (lead, source, claim) twice = one row.
import type { SupabaseClient } from "@supabase/supabase-js";

const CLAIM_MAX = 300;
const SOURCE_MAX = 1000; // 0150 checks

/** The fact as it would be stored, or null when there is nothing citable: blank claim, or no source / a source longer
 *  than the table allows. Scoring and writing both use it, so a score never counts a fact that was not written. */
export function citableFact(claim: string | null | undefined, sourceUrl: string | null | undefined): { claim: string; source: string } | null {
  const c = (claim ?? "").trim().slice(0, CLAIM_MAX);
  const source = (sourceUrl ?? "").trim();
  return c && source && source.length <= SOURCE_MAX ? { claim: c, source } : null;
}

/** No-op when the fact is not citable (citableFact). */
export async function recordLeadEvidence(db: SupabaseClient, a: { lead: { id: string; organization_id: string | null }; claim: string | null | undefined;
  sourceUrl: string | null | undefined; createdBy: "import" | "manual" }): Promise<string | null> {
  const fact = citableFact(a.claim, a.sourceUrl);
  if (!fact) return null;
  const { error } = await db.from("co_evidence").upsert(
    { lead_id: a.lead.id, organization_id: a.lead.organization_id, claim: fact.claim, source_url: fact.source, excerpt: null, status: "approved", created_by: a.createdBy },
    { onConflict: "lead_id,source_url,claim", ignoreDuplicates: true });
  return error ? error.message : null;
}
