// One incident in through the standard path: snapshot -> transition -> atomic upsert -> notify.
// For in-app producers (lib/schedules sweep). The webhook routes run the same four steps inline with
// their own Sentry tags.
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchNotifications } from "./notify/dispatcher";
import { computeTransition } from "./transition";
import type { Incident, IncidentDraft, IncidentSnapshot } from "./types";
import { upsertIncidentAtomic } from "./upsertIncidentAtomic";

/** Never throws: an incident that cannot be written is returned as an error string for the caller to report. */
export async function ingestIncident(
  sb: SupabaseClient,
  draft: IncidentDraft & { fingerprint: string },
): Promise<{ id: string | null; error: string | null }> {
  try {
    const { data: existing, error: readError } = await sb
      .from("ops_incidents")
      .select("id, severity, status, occurrence_count, reopen_count")
      .eq("fingerprint", draft.fingerprint)
      .eq("environment", draft.environment)
      .maybeSingle();
    if (readError) return { id: null, error: `read_existing:${readError.message}` };
    const transition = computeTransition((existing ?? null) as IncidentSnapshot | null, draft);
    const { data, error } = await upsertIncidentAtomic(sb, draft, transition.kind === "reopened");
    if (error || !data) return { id: null, error: `upsert:${error ?? "empty"}` };
    try {
      await dispatchNotifications({ incident: data as Incident, transition });
    } catch (e) {
      return { id: data.id, error: `notify:${String(e).slice(0, 200)}` };
    }
    return { id: data.id, error: null };
  } catch (e) {
    return { id: null, error: String(e).slice(0, 200) };
  }
}
