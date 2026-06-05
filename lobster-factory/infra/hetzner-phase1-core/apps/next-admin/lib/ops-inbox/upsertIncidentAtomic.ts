import type { SupabaseClient } from "@supabase/supabase-js";
import type { Incident, IncidentDraft } from "./types";
import { computeFingerprintV2 } from "./fingerprint";

/**
 * Calls the upsert_incident_atomic PL/pgSQL function (migration 0035).
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
  // M4: salted parallel fingerprint, written to ops_incidents.fingerprint_v2 (migration
  // 0036). Computed here from the same draft so the 6 calling routes need no change.
  // ON CONFLICT still keys on (fingerprint, environment) — v2 is stored, not yet the
  // dedup key (constraint swap is a later migration). When the salt is unset, v2 === v1.
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
    })
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as Incident, error: null };
}
