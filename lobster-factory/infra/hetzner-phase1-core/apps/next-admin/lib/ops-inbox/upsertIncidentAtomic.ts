import type { SupabaseClient } from "@supabase/supabase-js";
import type { Incident, IncidentDraft } from "./types";
import { computeFingerprintV2 } from "./fingerprint";
import { linkStormParent } from "@/lib/repair-center/correlate";

// Negative cache for slug→org resolution (critic 2026-07-03 minor): a flapping
// monitor carrying a slug with no matching organization would otherwise hit
// the organizations table on every heartbeat. Module-scoped and best-effort —
// serverless instances each keep their own copy, which is fine for a cache.
const UNRESOLVED_SLUG_TTL_MS = 60_000;
const unresolvedSlugUntil = new Map<string, number>();

/**
 * Calls the upsert_incident_atomic PL/pgSQL function (migration 0056, latest).
 * occurrence_count is incremented via SET count + 1 inside the row lock —
 * eliminates the read-then-write race in concurrent webhook retries (M10).
 *
 * Caller is responsible for computing isReopen from the pre-fetched snapshot
 * (needed for transition dispatch). The SQL function re-evaluates isReopen
 * atomically against current DB status for the actual UPDATE.
 */
export async function upsertIncidentAtomic(
  supabase: SupabaseClient,
  draft: IncidentDraft & { fingerprint: string },
  isReopen: boolean,
): Promise<{ data: Incident | null; error: string | null }> {
  // M4: salted parallel fingerprint, written to ops_incidents.fingerprint_v2 (migration 0036).
  // 0056: client_slug propagated from normalizer tag so repair_runs inherit it correctly.
  const { data, error } = await supabase
    .rpc("upsert_incident_atomic", {
      p_fingerprint:    draft.fingerprint,
      p_fingerprint_v2: computeFingerprintV2(draft),
      p_environment: draft.environment,
      p_source:      draft.source,
      p_external_id: draft.external_id,
      p_signal_type: draft.signal_type,
      p_severity:    draft.severity,
      p_service:     draft.service ?? null,
      p_title:       draft.title,
      p_message:     draft.message ?? null,
      p_raw:         draft.raw,
      p_tags:        draft.tags,
      p_is_reopen:   isReopen,
      p_client_slug: draft.client_slug ?? null,
    })
    .single();

  if (error) return { data: null, error: error.message };

  // Tenant attribution (2026-07-03 chain audit 缺件③, the critical break):
  // client_slug reached ops_incidents (0056) but NOTHING resolved it into
  // organization_id, so every webhook incident carried NULL org and the
  // org-filtered views/repair_runs stayed empty for client scopes forever.
  // Single choke point for every source; best-effort UPDATE keeps ingest
  // fail-open (an attribution failure must never drop an incident), and the
  // WHERE organization_id IS NULL guard makes retries idempotent and never
  // overwrites an attribution set elsewhere. RPC signature untouched — no
  // migration dependency (the 0055/PGRST202 two-week-outage class).
  let incident = data as Incident;
  try {
    if (
      incident?.client_slug &&
      !incident.organization_id &&
      (unresolvedSlugUntil.get(incident.client_slug) ?? 0) < Date.now()
    ) {
      const { data: org } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", incident.client_slug)
        .maybeSingle();
      if (org?.id) {
        unresolvedSlugUntil.delete(incident.client_slug);
        const { error: updErr } = await supabase
          .from("ops_incidents")
          .update({ organization_id: org.id })
          .eq("id", incident.id)
          .is("organization_id", null);
        if (!updErr) incident = { ...incident, organization_id: org.id };
      } else {
        unresolvedSlugUntil.set(incident.client_slug, Date.now() + UNRESOLVED_SLUG_TTL_MS);
      }
    }
  } catch (e) {
    console.warn("[ops-inbox] slug→org attribution failed (fail-open):", e);
  }

  // Storm correlation (A3): link this incident to the earliest open sibling
  // in the same ±15min window / tenant scope. Only on first occurrence — a
  // flapping monitor must not pay a correlation query per heartbeat. Fail-open
  // inside linkStormParent; requires migration 0058 (missing column → update
  // fails silently, ingest unaffected).
  if (incident.occurrence_count <= 1) {
    incident = await linkStormParent(supabase, incident);
  }

  return { data: incident, error: null };
}
