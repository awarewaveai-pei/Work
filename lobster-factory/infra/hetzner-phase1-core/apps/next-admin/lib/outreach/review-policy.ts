// Cold Outreach v2 — the review policy of a service profile (SPEC D23). Decisions are pure and deterministic (a hash of the
// lead id, never Math.random), so the same lead always gets the same variant and the same sample decision, and an audit
// can recompute both.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ReviewMode = "manual" | "sampled";
/** Human-approved first emails a profile needs before it may switch to sampled. */
export const SAMPLED_MIN_HUMAN_APPROVED = 50;

const hash = (s: string): number => createHash("sha256").update(s).digest().readUInt32BE(0);

/** Sampled mode keeps one first email per lead: A on an even hash, B on an odd one. */
export function pickVariant(leadId: string): "A" | "B" {
  return hash(leadId) % 2 === 0 ? "A" : "B";
}

/** Whether this lead's email goes to a person anyway (review_sample_pct of them). */
export function inSample(leadId: string, pct: number): boolean {
  return hash(`sample:${leadId}`) % 100 < Math.max(0, Math.min(100, pct));
}

export type ClaimCheck = { verdict: "supported" } | { verdict: "unsupported"; claims: string[] } | { verdict: "error"; error: string };

/** Auto-approve only when all three hold; anything else stays a draft in the person's queue. block never passes. */
export function autoApproves(args: { gate: "pass" | "warn" | "block"; sampled: boolean; claim: ClaimCheck | null }): boolean {
  return args.gate === "pass" && !args.sampled && args.claim?.verdict === "supported";
}

/** First emails a person approved (gate_snapshot.auto is not true) under this profile: the count that unlocks sampled.
 *  The profile is the one recorded when the email was written (gate_snapshot.profile_id), not the lead's current one:
 *  moving approved leads onto another profile must not unlock it. */
export async function humanApprovedCount(db: SupabaseClient, profileId: string, organizationId: string | null): Promise<number> {
  let q = db
    .from("co_messages")
    .select("id", { count: "exact", head: true })
    .eq("gate_snapshot->>profile_id", profileId)
    .eq("output_type", "cold_email")
    .not("approved_at", "is", null)
    .or("gate_snapshot->>auto.is.null,gate_snapshot->>auto.neq.true");
  q = organizationId ? q.eq("organization_id", organizationId) : q.is("organization_id", null);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}
