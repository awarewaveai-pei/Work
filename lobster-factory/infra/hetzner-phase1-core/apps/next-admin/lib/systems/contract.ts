// The ingest contract (agency-os/handoffs/2026-11-21-systems-control-center/briefs/COMMON.md 契約 1 + 2), checked by hand
// like the rest of next-admin (no schema library). parseIngest never throws: a body that breaks the contract is a 400
// with the first problem named, and nothing is written. Only the host importer sends this; status_change / review are
// user events the page writes itself, so the route refuses them. A feature_update's "verified" is downgraded by the
// projection, not refused (PLAN §9: verified only from a review or CI).

export const SYSTEM_TYPES = ["product", "internal", "infrastructure", "governance", "client"] as const;
export const FEATURE_STATUSES = ["todo", "in_progress", "implemented", "verified", "blocked", "cancelled"] as const;
export const IMPORTER_EVENT_TYPES = ["activity", "handoff", "feature_update", "revert", "orphaned", "migration", "import_run"] as const;
export const IMPORTER_SOURCES = ["agent", "migration", "importer"] as const;
export const IMPORT_RUN_STATUSES = ["ok", "history_diverged", "error"] as const;
export const GAP_KEYS = ["unowned_paths", "unclassified_trailers", "unregistered_products", "unclaimed_supervisors", "dead_source_paths", "unmapped_cards"] as const;

export type SystemType = (typeof SYSTEM_TYPES)[number];
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];
export type ImporterEventType = (typeof IMPORTER_EVENT_TYPES)[number];

export interface RegistryPhase { id: string; slug: string; name: string; legacy_source_path: string | null }
export interface RegistryFeature { id: string; slug: string; name: string; phase: string; legacy_code?: string }
export interface RegistrySystem {
  id: string; slug: string; name: string; aliases: string[]; type: SystemType; purpose: string; product_key: string | null;
  source_paths: string[]; phases: RegistryPhase[]; features: RegistryFeature[];
}
export interface Registry { version: 1; shared_paths: string[]; ignore_paths: string[]; systems: RegistrySystem[] }
export interface ImportRun {
  head: string; previous_head: string | null; status: (typeof IMPORT_RUN_STATUSES)[number]; error: string | null;
  gaps: Record<(typeof GAP_KEYS)[number], unknown[]>;
  /** phase ids whose supervisor page is still live and read every run (importer supervisor_snapshots) */
  live_phases: string[];
}
export interface IngestEvent {
  event_key: string; system_slug: string | null; phase_slug: string | null; feature_slug: string | null;
  event_type: ImporterEventType; source: (typeof IMPORTER_SOURCES)[number]; commit_sha: string | null;
  occurred_at: string; payload: Record<string, unknown>; evidence: unknown;
}
export interface IngestBody { registry: Registry; events: IngestEvent[] }

export const MAX_BODY_BYTES = 5 * 1024 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

class Bad extends Error {}
const fail = (where: string, what: string): never => { throw new Bad(`${where}: ${what}`); };
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const obj = (v: unknown, where: string) => (isObj(v) ? v : fail(where, "not an object"));
const str = (v: unknown, where: string, max = 2000) =>
  typeof v === "string" && v.length <= max ? v : fail(where, `not a string of at most ${max} characters`);
const nonEmpty = (v: unknown, where: string, max = 2000) => (str(v, where, max).trim() ? (v as string) : fail(where, "empty"));
const strOrNull = (v: unknown, where: string, max = 2000) => (v === null || v === undefined ? null : str(v, where, max));
const strArr = (v: unknown, where: string) =>
  Array.isArray(v) ? v.map((x, i) => str(x, `${where}[${i}]`, 500)) : fail(where, "not an array");
const oneOf = <T extends string>(v: unknown, list: readonly T[], where: string): T =>
  (list as readonly unknown[]).includes(v) ? (v as T) : fail(where, `not one of ${list.join("|")}`);
const uuid = (v: unknown, where: string) => (typeof v === "string" && UUID.test(v) ? v.toLowerCase() : fail(where, "not a uuid"));
const slug = (v: unknown, where: string) => (typeof v === "string" && SLUG.test(v) && v.length <= 100 ? v : fail(where, "not a kebab slug"));

function parseRegistry(raw: unknown): Registry {
  const r = obj(raw, "registry");
  if (r.version !== 1) fail("registry.version", "must be 1");
  const ids = new Set<string>();
  const slugs = new Set<string>();
  // Feature slugs are global, as the importer has them (a `Feature: <slug>=<status>` trailer names no system).
  const featureSlugs = new Set<string>();
  const claim = (id: string, where: string) => (ids.has(id) ? fail(where, `duplicate id ${id}`) : (ids.add(id), id));
  if (!Array.isArray(r.systems)) fail("registry.systems", "not an array");
  const systems = (r.systems as unknown[]).map((rawSystem, i): RegistrySystem => {
    const w = `registry.systems[${i}]`;
    const s = obj(rawSystem, w);
    const systemSlug = slug(s.slug, `${w}.slug`);
    if (slugs.has(systemSlug)) fail(`${w}.slug`, `duplicate slug ${systemSlug}`);
    slugs.add(systemSlug);
    const phaseSlugs = new Set<string>();
    const phases = (Array.isArray(s.phases) ? s.phases : fail(`${w}.phases`, "not an array")).map((rawPhase, j): RegistryPhase => {
      const pw = `${w}.phases[${j}]`;
      const p = obj(rawPhase, pw);
      const ps = slug(p.slug, `${pw}.slug`);
      if (phaseSlugs.has(ps)) fail(`${pw}.slug`, `duplicate phase slug ${ps}`);
      phaseSlugs.add(ps);
      return { id: claim(uuid(p.id, `${pw}.id`), `${pw}.id`), slug: ps, name: nonEmpty(p.name, `${pw}.name`, 200), legacy_source_path: strOrNull(p.legacy_source_path, `${pw}.legacy_source_path`, 500) };
    });
    const features = (Array.isArray(s.features) ? s.features : fail(`${w}.features`, "not an array")).map((rawFeature, j): RegistryFeature => {
      const fw = `${w}.features[${j}]`;
      const f = obj(rawFeature, fw);
      const fs = slug(f.slug, `${fw}.slug`);
      if (featureSlugs.has(fs)) fail(`${fw}.slug`, `duplicate feature slug ${fs}`);
      featureSlugs.add(fs);
      const phase = slug(f.phase, `${fw}.phase`);
      if (!phaseSlugs.has(phase)) fail(`${fw}.phase`, `no phase ${phase} in ${systemSlug}`);
      const out: RegistryFeature = { id: claim(uuid(f.id, `${fw}.id`), `${fw}.id`), slug: fs, name: nonEmpty(f.name, `${fw}.name`, 200), phase };
      // supervisor card code as written (ED.1, 批0): cutover lookup only, never stored
      if (f.legacy_code !== undefined) out.legacy_code = nonEmpty(f.legacy_code, `${fw}.legacy_code`, 40);
      return out;
    });
    return {
      id: claim(uuid(s.id, `${w}.id`), `${w}.id`), slug: systemSlug, name: nonEmpty(s.name, `${w}.name`, 200),
      aliases: s.aliases === undefined ? [] : strArr(s.aliases, `${w}.aliases`),
      type: oneOf(s.type, SYSTEM_TYPES, `${w}.type`), purpose: str(s.purpose, `${w}.purpose`),
      product_key: strOrNull(s.product_key, `${w}.product_key`, 100), source_paths: strArr(s.source_paths, `${w}.source_paths`),
      phases, features,
    };
  });
  return { version: 1, shared_paths: strArr(r.shared_paths, "registry.shared_paths"), ignore_paths: strArr(r.ignore_paths, "registry.ignore_paths"), systems };
}

function parseImportRun(raw: unknown, where: string): ImportRun {
  const r = obj(raw, where);
  const gapsRaw = obj(r.gaps ?? {}, `${where}.gaps`);
  const gaps = Object.fromEntries(GAP_KEYS.map((k) => [k, gapsRaw[k] === undefined ? [] : Array.isArray(gapsRaw[k]) ? gapsRaw[k] : fail(`${where}.gaps.${k}`, "not an array")])) as ImportRun["gaps"];
  return {
    head: nonEmpty(r.head, `${where}.head`, 64), previous_head: strOrNull(r.previous_head, `${where}.previous_head`, 64),
    status: oneOf(r.status, IMPORT_RUN_STATUSES, `${where}.status`), error: strOrNull(r.error, `${where}.error`), gaps,
    live_phases: r.live_phases === undefined ? [] : strArr(r.live_phases, `${where}.live_phases`),
  };
}

function parseEvent(raw: unknown, i: number): IngestEvent {
  const w = `events[${i}]`;
  const e = obj(raw, w);
  const eventType = oneOf(e.event_type, IMPORTER_EVENT_TYPES, `${w}.event_type`);
  const occurred = nonEmpty(e.occurred_at, `${w}.occurred_at`, 40);
  if (Number.isNaN(Date.parse(occurred))) fail(`${w}.occurred_at`, "not an ISO 8601 time");
  const payload = obj(e.payload ?? {}, `${w}.payload`);
  // A feature_update claiming "verified" is kept as sent and counted as implemented by lib/systems/projection.ts (only a
  // review verifies): refusing it here would let one stray trailer block every later run, since the importer resends.
  if (eventType === "feature_update") oneOf(payload.status, FEATURE_STATUSES, `${w}.payload.status`);
  if (eventType === "import_run") parseImportRun(payload, `${w}.payload`);
  if (eventType === "revert") nonEmpty(payload.reverted_sha, `${w}.payload.reverted_sha`, 64);
  if (eventType === "orphaned") nonEmpty(payload.sha, `${w}.payload.sha`, 64);
  return {
    event_key: nonEmpty(e.event_key, `${w}.event_key`, 200), system_slug: strOrNull(e.system_slug, `${w}.system_slug`, 100),
    phase_slug: strOrNull(e.phase_slug, `${w}.phase_slug`, 100), feature_slug: strOrNull(e.feature_slug, `${w}.feature_slug`, 100),
    event_type: eventType, source: oneOf(e.source, IMPORTER_SOURCES, `${w}.source`), commit_sha: strOrNull(e.commit_sha, `${w}.commit_sha`, 64),
    occurred_at: new Date(occurred).toISOString(), payload, evidence: e.evidence ?? null,
  };
}

// 契約 3: the page's 「立即更新」 and 「新增系統」 buttons, and withdrawing a proposal. User events with system_id null
// (migration 0177); the importer reads them through GET /api/internal/systems/pending, the projection ignores them, the
// ingest route refuses them.
export const USER_REQUEST_TYPES = ["refresh_request", "system_proposed", "system_proposal_closed"] as const;
export type UserRequestType = (typeof USER_REQUEST_TYPES)[number];
export interface SystemProposal { name: string; type: SystemType; purpose: string }

const REQUEST_KEYS: Record<UserRequestType, string[]> = {
  refresh_request: ["by"],
  system_proposed: ["by", "name", "type", "purpose"],
  system_proposal_closed: ["by", "proposal_event_key", "reason"],
};

/** A page request's payload, normalized (trimmed). `by` (the actor, as on every user event) is the only extra key. */
export function parseUserRequest(
  type: UserRequestType, raw: unknown,
): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const p = obj(raw, "payload");
    const allowed = REQUEST_KEYS[type];
    const extra = Object.keys(p).find((k) => !allowed.includes(k));
    if (extra) fail(`payload.${extra}`, "not allowed");
    const out: Record<string, unknown> = {};
    if (p.by !== undefined) out.by = str(p.by, "payload.by", 200);
    if (type === "system_proposed") {
      out.name = nonEmpty(p.name, "payload.name", 200).trim();
      out.type = oneOf(p.type, SYSTEM_TYPES, "payload.type");
      out.purpose = nonEmpty(p.purpose, "payload.purpose", 200).trim();
    }
    if (type === "system_proposal_closed") {
      out.proposal_event_key = nonEmpty(p.proposal_event_key, "payload.proposal_event_key", 200).trim();
      out.reason = nonEmpty(p.reason, "payload.reason", 500).trim();
    }
    return { ok: true, payload: out };
  } catch (e) {
    if (e instanceof Bad) return { ok: false, error: e.message };
    throw e;
  }
}

/** The name match of 契約 3: whitespace removed, case ignored. */
export const proposalKey = (s: string) => s.replace(/\s+/g, "").toLowerCase();

export type ParseResult = { ok: true; body: IngestBody } | { ok: false; error: string };

export function parseIngest(raw: unknown): ParseResult {
  try {
    const b = obj(raw, "body");
    const registry = parseRegistry(b.registry);
    if (!Array.isArray(b.events)) fail("events", "not an array");
    // No run record is made here: the importer sends its import_run event in the last batch, so a run only counts
    // once every batch landed.
    const events = (b.events as unknown[]).map(parseEvent);
    return { ok: true, body: { registry, events } };
  } catch (e) {
    if (e instanceof Bad) return { ok: false, error: e.message };
    throw e;
  }
}
