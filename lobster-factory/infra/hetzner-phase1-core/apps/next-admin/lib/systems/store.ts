// The four tables of migration 0174, service role only. Writes: the registry projection and importer events (ingest
// route), and the page's own status_change / review events. Reads are capped (PLAN §6: a page that cannot hurt the
// back office); a capped read says so, so the page never shows a partial history as the whole one.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngestBody, Registry } from "./contract";
import type { FeatureRow, PhaseRow, SystemRow, UpdateRow } from "./projection";

const CHUNK = 500;
export const HISTORY_READ_CAP = 20000;
export const MIGRATION_READ_CAP = 20000;
export const EVENT_READ_CAP = 5000;
export const ACTIVITY_READ_CAP = 100;
const UPDATE_COLUMNS = "id,event_key,system_id,phase_id,feature_id,event_type,source,commit_sha,occurred_at,payload,created_at";

function check<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return (r.data ?? []) as T;
}

/** Registry → the three definition tables in one transaction (migration 0174 systems_apply_registry: retire every live
 *  row, then upsert by id). A definition gone from the registry is retired, never deleted (events point at it). */
async function writeRegistry(sb: SupabaseClient, registry: Registry): Promise<void> {
  const p_systems = registry.systems.map((s, position) => ({
    id: s.id, slug: s.slug, name: s.name, aliases: s.aliases, type: s.type, purpose: s.purpose, product_key: s.product_key,
    source_paths: s.source_paths, position,
  }));
  const p_phases = registry.systems.flatMap((s) => s.phases.map((p, position) => ({
    id: p.id, system_id: s.id, slug: p.slug, name: p.name, legacy_source_path: p.legacy_source_path, position,
  })));
  const p_features = registry.systems.flatMap((s) => {
    const phaseId = new Map(s.phases.map((p) => [p.slug, p.id]));
    return s.features.map((f, position) => ({
      id: f.id, system_id: s.id, phase_id: phaseId.get(f.phase), slug: f.slug, name: f.name, position, // contract.ts checked the phase exists
    }));
  });
  const r = await sb.rpc("systems_apply_registry", { p_systems, p_phases, p_features });
  if (r.error) throw new Error(`systems_apply_registry: ${r.error.message}`);
}

/** Ingest: registry projection, then events insert-or-skip by event_key. Returns how many were new. */
export async function ingest(sb: SupabaseClient, body: IngestBody): Promise<{ inserted: number; skipped: number }> {
  await writeRegistry(sb, body.registry);

  const systemId = new Map(body.registry.systems.map((s) => [s.slug, s]));
  const seen = new Set<string>();
  const rows = body.events.filter((e) => (seen.has(e.event_key) ? false : (seen.add(e.event_key), true))).map((e) => {
    const sys = e.system_slug ? systemId.get(e.system_slug) : undefined;
    const phase = sys && e.phase_slug ? sys.phases.find((p) => p.slug === e.phase_slug) : undefined;
    const feature = sys && e.feature_slug ? sys.features.find((f) => f.slug === e.feature_slug) : undefined;
    return {
      event_key: e.event_key, system_id: sys?.id ?? null, phase_id: phase?.id ?? null, feature_id: feature?.id ?? null,
      system_slug: e.system_slug, phase_slug: e.phase_slug, feature_slug: e.feature_slug, event_type: e.event_type, source: e.source,
      commit_sha: e.commit_sha, occurred_at: e.occurred_at, payload: e.payload, evidence: e.evidence ?? null,
    };
  });
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const data = check(
      await sb.from("system_updates").upsert(rows.slice(i, i + CHUNK), { onConflict: "event_key", ignoreDuplicates: true }).select("event_key"),
      "system_updates insert",
    ) as unknown[];
    inserted += data.length;
  }
  return { inserted, skipped: body.events.length - inserted };
}

export interface Definitions { systems: SystemRow[]; phases: PhaseRow[]; features: FeatureRow[] }

export async function readDefinitions(sb: SupabaseClient, systemId?: string): Promise<Definitions> {
  const sel = <T>(table: string, cols: string) => {
    let q = sb.from(table).select(cols).eq("in_registry", true).order("position", { ascending: true }).limit(EVENT_READ_CAP);
    if (systemId) q = q.eq(table === "systems" ? "id" : "system_id", systemId);
    return q.then((r) => check(r as { data: T | null; error: { message: string } | null }, `${table} read`));
  };
  const [systems, phases, features] = await Promise.all([
    sel<SystemRow[]>("systems", "id,slug,name,aliases,type,purpose,product_key,source_paths,position"),
    sel<PhaseRow[]>("system_phases", "id,system_id,slug,name,legacy_source_path,position"),
    sel<FeatureRow[]>("system_features", "id,system_id,phase_id,slug,name,position"),
  ]);
  return { systems, phases, features };
}

// Read separately from the capped state events, so neither a long history nor a busy week can push them out:
// a migration is the only record of a switched phase (one per feature), a revert / orphaned event changes what every
// system's other events mean.
const SEPARATE_TYPES = ["migration", "revert", "orphaned"];

/** State-bearing events (not activity / import_run / the SEPARATE_TYPES), newest EVENT_READ_CAP; capped = there were
 *  more. The filter matches the partial index system_updates_state_idx (migration 0174). */
export async function readStateEvents(sb: SupabaseClient, systemId?: string): Promise<{ events: UpdateRow[]; capped: boolean }> {
  let q = sb.from("system_updates").select(UPDATE_COLUMNS).not("system_id", "is", null)
    .not("event_type", "in", `(activity,import_run,${SEPARATE_TYPES.join(",")})`)
    .order("occurred_at", { ascending: false }).order("created_at", { ascending: false }).limit(EVENT_READ_CAP + 1);
  if (systemId) q = q.eq("system_id", systemId);
  const rows = check(await q, "system_updates read") as unknown as UpdateRow[];
  return { events: rows.slice(0, EVENT_READ_CAP).reverse(), capped: rows.length > EVENT_READ_CAP };
}

async function readByType(sb: SupabaseClient, types: string[], cap: number, systemId?: string): Promise<{ events: UpdateRow[]; capped: boolean }> {
  let q = sb.from("system_updates").select(UPDATE_COLUMNS).in("event_type", types)
    .order("occurred_at", { ascending: false }).order("created_at", { ascending: false }).limit(cap + 1);
  if (systemId) q = q.eq("system_id", systemId);
  const rows = check(await q, `${types.join("/")} read`) as unknown as UpdateRow[];
  return { events: rows.slice(0, cap).reverse(), capped: rows.length > cap };
}

/** Migration events (at most one per feature), outside the state cap. */
export const readMigrationEvents = (sb: SupabaseClient, systemId?: string) => readByType(sb, ["migration"], MIGRATION_READ_CAP, systemId);

/** Every revert and orphaned event, whatever system it landed on (or none): a commit touching two systems is undone in
 *  both, and a revert of a revert needs the whole chain. */
export const readCommitHistory = (sb: SupabaseClient) => readByType(sb, ["revert", "orphaned"], HISTORY_READ_CAP);

/** Everything projectSystem needs: state events + migrations (per system or all), and the global commit history. */
export async function readProjectionInput(sb: SupabaseClient, systemId?: string): Promise<{ events: UpdateRow[]; history: UpdateRow[]; capped: boolean }> {
  const [state, migrations, history] = await Promise.all([readStateEvents(sb, systemId), readMigrationEvents(sb, systemId), readCommitHistory(sb)]);
  return { events: [...migrations.events, ...state.events], history: history.events, capped: state.capped || migrations.capped || history.capped };
}

/** Newest events of one system, any type, for the 紀錄 tab. */
export async function readRecentEvents(sb: SupabaseClient, systemId: string): Promise<UpdateRow[]> {
  return check(
    await sb.from("system_updates").select(UPDATE_COLUMNS).eq("system_id", systemId).order("occurred_at", { ascending: false }).limit(ACTIVITY_READ_CAP),
    "system_updates read",
  ) as unknown as UpdateRow[];
}

/** The newest import runs (the page shows the last ok one and the current gaps). */
export async function readImportRuns(sb: SupabaseClient): Promise<UpdateRow[]> {
  return check(
    await sb.from("system_updates").select(UPDATE_COLUMNS).eq("event_type", "import_run").order("occurred_at", { ascending: false }).limit(30),
    "import_run read",
  ) as unknown as UpdateRow[];
}

/** A user event from the page: status_change or review, source=user. */
export async function writeUserEvent(
  sb: SupabaseClient,
  e: { systemId: string; systemSlug: string; featureId?: string | null; featureSlug?: string | null; type: "status_change" | "review"; payload: Record<string, unknown> },
): Promise<void> {
  check(
    await sb.from("system_updates").insert({
      event_key: `user:${randomUUID()}`, system_id: e.systemId, system_slug: e.systemSlug, feature_id: e.featureId ?? null, feature_slug: e.featureSlug ?? null,
      event_type: e.type, source: "user", occurred_at: new Date().toISOString(), payload: e.payload,
    }),
    "system_updates insert",
  );
}
