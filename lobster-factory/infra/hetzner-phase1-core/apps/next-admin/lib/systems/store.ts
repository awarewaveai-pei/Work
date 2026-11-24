// The four tables of migration 0174, service role only. Writes: the registry projection and importer events (ingest
// route), and the page's own status_change / review events and its refresh / new-system requests (契約 3). Reads are capped (PLAN §6: a page that cannot hurt the
// back office); a capped read says so, so the page never shows a partial history as the whole one.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseUserRequest, proposalKey } from "./contract";
import type { IngestBody, Registry, SystemProposal, UserRequestType } from "./contract";
import { spreadCommits } from "./projection";
import type { FeatureRow, PhaseRow, SystemRow, UpdateRow } from "./projection";

const CHUNK = 500;
export const HISTORY_READ_CAP = 20000;
export const MIGRATION_READ_CAP = 20000;
export const SPREAD_READ_CAP = 20000;
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
export async function readProjectionInput(sb: SupabaseClient, systemId?: string): Promise<{
  events: UpdateRow[]; history: UpdateRow[]; capped: boolean;
  /** system id -> newest git commit (view system_last_commit, migration 0177): pass as projectSystem's lastCommitAt */
  lastCommitAt: Record<string, string>;
  /** pass as projectSystem's spreadCommits */
  spreadCommits: Set<string>;
}> {
  const [state, migrations, history, lastCommitAt, spread] = await Promise.all([readStateEvents(sb, systemId), readMigrationEvents(sb, systemId), readCommitHistory(sb), readLastCommits(sb, systemId), readSpreadCommits(sb)]);
  return { events: [...migrations.events, ...state.events], history: history.events, capped: state.capped || migrations.capped || history.capped, lastCommitAt, spreadCommits: spread.shas };
}

/** Commits whose handoff landed on more than one system without System: (importer before 2026-11-24 pasted one Next:
 *  on every path owner). projectSystem skips those handoffs; read across all systems, like the commit history. */
export async function readSpreadCommits(sb: SupabaseClient): Promise<{ shas: Set<string>; capped: boolean }> {
  const rows = check(await sb.from("system_updates").select("commit_sha,system_id")
    .eq("event_type", "handoff").not("commit_sha", "is", null).not("system_id", "is", null)
    .order("occurred_at", { ascending: false }).order("commit_sha").limit(SPREAD_READ_CAP + 1), "handoff spread read") as unknown as
    Array<{ commit_sha: string; system_id: string }>;
  // capped: the oldest commits fall out, so a pasted handoff that old may count again -- only if nothing newer exists
  return { shas: spreadCommits(rows.slice(0, SPREAD_READ_CAP)), capped: rows.length > SPREAD_READ_CAP };
}

/** View system_last_commit (migration 0177): one row per system that has a git commit event, any type -- the inferred
 *  status's clock. */
export async function readLastCommits(sb: SupabaseClient, systemId?: string): Promise<Record<string, string>> {
  let q = sb.from("system_last_commit").select("system_id,last_commit_at").limit(EVENT_READ_CAP);
  if (systemId) q = q.eq("system_id", systemId);
  const rows = check(await q, "system_last_commit read") as unknown as Array<{ system_id: string; last_commit_at: string }>;
  return Object.fromEntries(rows.map((r) => [r.system_id, r.last_commit_at]));
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

/// --- 契約 3: 「立即更新」, 「新增系統」 and withdrawing a proposal (migration 0177). system_id null; the projection
// ignores all three. ---------------------------------------------------------------------------------------------

export const PROPOSAL_READ_CAP = 200;

/** A request payload that breaks 契約 3 (parseUserRequest's message). The caller maps it to its own code. */
export class BadInput extends Error { override name = "BadInput"; }
/** closeProposal: the key is not a system_proposed event. */
export class ProposalNotFound extends Error { override name = "ProposalNotFound"; }

async function writeRequest(sb: SupabaseClient, type: UserRequestType, payload: Record<string, unknown>): Promise<void> {
  const parsed = parseUserRequest(type, payload);
  if ("error" in parsed) throw new BadInput(`${type}: ${parsed.error}`);
  check(
    await sb.from("system_updates").insert({
      event_key: `user:${randomUUID()}`, system_id: null, event_type: type, source: "user",
      occurred_at: new Date().toISOString(), payload: parsed.payload,
    }),
    "system_updates insert",
  );
}

/** 「立即更新」: the host asks GET /api/internal/systems/pending every 5 minutes and imports when this is newer than
 *  the newest import_run. */
export const requestRefresh = (sb: SupabaseClient, actor: string) => writeRequest(sb, "refresh_request", { by: actor });

/** 「新增系統」: waits on /api/internal/systems/pending until an agent writes it into registry.json or someone closes
 *  it. Throws on a payload that breaks 契約 3 (name / purpose 1-200 characters, type one of the five). */
export const proposeSystem = (sb: SupabaseClient, actor: string, p: SystemProposal) =>
  writeRequest(sb, "system_proposed", { by: actor, name: p.name, type: p.type, purpose: p.purpose });

/** Withdraws a proposal that will not become a registry entry (duplicate, mistake). Throws ProposalNotFound when
 *  `proposalEventKey` is not a system_proposed event, BadInput on an empty or too long reason; other errors = the
 *  database. */
export async function closeProposal(sb: SupabaseClient, actor: string, proposalEventKey: string, reason: string): Promise<void> {
  const found = check(
    await sb.from("system_updates").select("event_key").eq("event_key", proposalEventKey).eq("event_type", "system_proposed").limit(1),
    "system_proposed read",
  ) as unknown[];
  if (found.length === 0) throw new ProposalNotFound(`system_proposal_closed: no proposal ${proposalEventKey}`);
  await writeRequest(sb, "system_proposal_closed", { by: actor, proposal_event_key: proposalEventKey, reason });
}

export interface PendingProposal { event_key: string; name: string; type: string; purpose: string; at: string }
/** requestedAt = the newest refresh_request (null: never), whether or not still pending; the host remembers the last
 *  one it answered, so a request is worked on once even when every run fails. */
export interface Pending { refresh: boolean; requestedAt: string | null; proposals: PendingProposal[] }

type EventIn = { event_key: string; payload: Record<string, unknown>; occurred_at: string };

/** Pure part of readPending. refresh = a refresh_request newer than the newest import_run (any status: a run that
 *  failed still answered it -- the next request asks again). A proposal is pending while its name matches no live
 *  system's name / slug / alias (proposalKey) and it is not closed; closing one also closes the older proposals of the
 *  same name (else the older copy would come back). The same name asked twice is listed once, newest wins; oldest
 *  first. */
export function pendingFrom(input: {
  lastRequestAt: string | null; lastRunAt: string | null;
  proposals: ReadonlyArray<EventIn>;
  closed?: ReadonlyArray<{ payload: Record<string, unknown> }>;
  systems: ReadonlyArray<{ name: string; slug: string; aliases: string[] | null }>;
}): Pending {
  const refresh = !!input.lastRequestAt && (!input.lastRunAt || Date.parse(input.lastRequestAt) > Date.parse(input.lastRunAt));
  const taken = new Set(input.systems.flatMap((s) => [s.name, s.slug, ...(s.aliases ?? [])]).map(proposalKey));
  const closedKeys = new Set((input.closed ?? []).map((c) => c.payload.proposal_event_key).filter((k): k is string => typeof k === "string"));
  const nameOf = (e: EventIn) => (typeof e.payload.name === "string" && e.payload.name.trim() ? proposalKey(e.payload.name) : null);
  const closedUpTo = new Map<string, number>(); // name -> newest closed proposal time
  for (const e of input.proposals) {
    const n = nameOf(e);
    if (n && closedKeys.has(e.event_key)) closedUpTo.set(n, Math.max(closedUpTo.get(n) ?? -Infinity, Date.parse(e.occurred_at)));
  }
  const byName = new Map<string, PendingProposal>();
  for (const e of [...input.proposals].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at))) {
    const n = nameOf(e);
    if (!n || taken.has(n)) continue;
    if (closedKeys.has(e.event_key) || Date.parse(e.occurred_at) <= (closedUpTo.get(n) ?? -Infinity)) continue;
    byName.delete(n);
    byName.set(n, { event_key: e.event_key, name: String(e.payload.name), type: String(e.payload.type ?? ""), purpose: String(e.payload.purpose ?? ""), at: e.occurred_at });
  }
  return { refresh, requestedAt: input.lastRequestAt, proposals: [...byName.values()] };
}

type Res = { data: unknown; error: { message: string } | null };

/** 契約 3 JSON for the host (GET /api/internal/systems/pending). Capped reads on the (event_type, occurred_at) index of
 *  0174, and the live systems. */
export async function readPending(sb: SupabaseClient): Promise<Pending> {
  const newest = async (type: string) => {
    const rows = check(
      await sb.from("system_updates").select("occurred_at").eq("event_type", type).order("occurred_at", { ascending: false }).limit(1),
      `${type} read`,
    ) as Array<{ occurred_at: string }>;
    return rows[0]?.occurred_at ?? null;
  };
  const events = (type: string) =>
    sb.from("system_updates").select("event_key,payload,occurred_at").eq("event_type", type)
      .order("occurred_at", { ascending: false }).limit(PROPOSAL_READ_CAP)
      .then((r) => check(r as Res, `${type} read`) as EventIn[]);
  const [lastRequestAt, lastRunAt, proposals, closed, systems] = await Promise.all([
    newest("refresh_request"),
    newest("import_run"),
    events("system_proposed"),
    events("system_proposal_closed"),
    sb.from("systems").select("name,slug,aliases").eq("in_registry", true).limit(EVENT_READ_CAP)
      .then((r) => check(r as Res, "systems read") as Array<{ name: string; slug: string; aliases: string[] | null }>),
  ]);
  return pendingFrom({ lastRequestAt, lastRunAt, proposals, closed, systems });
}
