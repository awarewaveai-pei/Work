// What a system looks like now, computed from its events (PLAN §3, §4, §8, §9). Pure: no I/O, so the page and the tests
// read the same answer. Rules:
// - status / priority: the newest status_change that carries each one.
// - handoff card: `next` = newest handoff that names one (absent = keep the previous); `blocker` is set by a handoff
//   and cleared only by one with blocker_cleared, never by a handoff that just leaves it out.
// - feature status: newest feature_update / migration (mapped_status) / review for that feature. Only a review may say
//   verified: a feature_update or migration that claims it counts as implemented.
// - a revert event hides every event of the reverted commit, in every system (revertedShas is read across all).
// - completion = verified / features not cancelled; no features = null (尚未盤點). Features of a phase that still
//   lives on its old supervisor page (legacy_source_path, no migration event yet) are left out: that page is the source.
import type { FeatureStatus } from "./contract";

export interface SystemRow {
  id: string; slug: string; name: string; aliases: string[]; type: string; purpose: string; product_key: string | null;
  source_paths: string[]; position: number;
}
export interface PhaseRow { id: string; system_id: string; slug: string; name: string; legacy_source_path: string | null; position: number }
export interface FeatureRow { id: string; system_id: string; phase_id: string | null; slug: string; name: string; position: number }
export interface UpdateRow {
  id: string; event_key: string; system_id: string | null; phase_id: string | null; feature_id: string | null;
  event_type: string; source: string; commit_sha: string | null; occurred_at: string; payload: Record<string, unknown>;
  created_at?: string;
}

export const SYSTEM_STATUSES = ["active", "paused", "done", "archived"] as const;
export const PRIORITIES = ["high", "normal", "low"] as const;
export type SystemStatus = (typeof SYSTEM_STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

export interface HandoffCard { next: string | null; nextAt: string | null; blocker: string | null; blockerAt: string | null; lastSubject: string | null; lastAt: string | null }
export interface FeatureView { feature: FeatureRow; status: FeatureStatus; source: string | null; at: string | null; legacy: boolean }
export interface PhaseView { phase: PhaseRow; legacy: boolean }
export interface SystemProjection {
  status: SystemStatus | null; priority: Priority | null; handoff: HandoffCard;
  features: FeatureView[]; phases: PhaseView[];
  counted: number; verified: number; implemented: number; completion: number | null;
  lastActivityAt: string | null;
}

const asStr = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const isFeatureStatus = (v: unknown): v is FeatureStatus =>
  v === "todo" || v === "in_progress" || v === "implemented" || v === "verified" || v === "blocked" || v === "cancelled";

/** Oldest first; ties keep input order (Array.prototype.sort is stable). */
export function chronological(events: readonly UpdateRow[]): UpdateRow[] {
  return [...events].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
}

/** Events still in force: a revert hides the reverted commit's events (the revert itself stays). */
export function liveEvents(events: readonly UpdateRow[], alsoReverted: ReadonlySet<string> = new Set()): UpdateRow[] {
  const reverted = new Set(alsoReverted);
  for (const sha of events.filter((e) => e.event_type === "revert").map((e) => asStr(e.payload.reverted_sha)).filter((s): s is string => !!s)) reverted.add(sha);
  return events.filter((e) => e.event_type === "revert" || !e.commit_sha || !reverted.has(e.commit_sha));
}

/** The status one event says a feature has, or null when it says nothing about it. */
function featureStatusOf(e: UpdateRow): FeatureStatus | null {
  const raw = e.event_type === "migration" ? e.payload.mapped_status : e.event_type === "feature_update" || e.event_type === "review" ? e.payload.status : undefined;
  if (!isFeatureStatus(raw)) return null;
  if (raw === "verified" && e.event_type !== "review") return "implemented";
  return raw;
}

export function projectSystem(input: {
  phases: readonly PhaseRow[]; features: readonly FeatureRow[]; events: readonly UpdateRow[];
  /** reverted SHAs from every revert event, not only this system's (store.readRevertedShas) */
  revertedShas?: ReadonlySet<string>;
}): SystemProjection {
  const events = chronological(liveEvents(input.events, input.revertedShas));
  let status: SystemStatus | null = null;
  let priority: Priority | null = null;
  const handoff: HandoffCard = { next: null, nextAt: null, blocker: null, blockerAt: null, lastSubject: null, lastAt: null };
  const featureState = new Map<string, { status: FeatureStatus; source: string; at: string }>();
  const migratedPhases = new Set<string>();
  const phaseOfFeature = new Map(input.features.map((f) => [f.id, f.phase_id]));
  let lastActivityAt: string | null = null;

  for (const e of events) {
    if (e.event_type !== "import_run") lastActivityAt = e.occurred_at;
    if (e.event_type === "status_change") {
      if ((SYSTEM_STATUSES as readonly unknown[]).includes(e.payload.status)) status = e.payload.status as SystemStatus;
      if ((PRIORITIES as readonly unknown[]).includes(e.payload.priority)) priority = e.payload.priority as Priority;
    } else if (e.event_type === "handoff") {
      handoff.lastSubject = asStr(e.payload.subject) ?? handoff.lastSubject;
      handoff.lastAt = e.occurred_at;
      const next = asStr(e.payload.next);
      if (next) { handoff.next = next; handoff.nextAt = e.occurred_at; }
      if (e.payload.blocker_cleared === true) { handoff.blocker = null; handoff.blockerAt = e.occurred_at; }
      const blocker = asStr(e.payload.blocker);
      if (blocker) { handoff.blocker = blocker; handoff.blockerAt = e.occurred_at; }
    }
    if (e.feature_id) {
      if (e.event_type === "migration") {
        const phase = phaseOfFeature.get(e.feature_id);
        if (phase) migratedPhases.add(phase);
      }
      const s = featureStatusOf(e);
      if (s) featureState.set(e.feature_id, { status: s, source: e.event_type, at: e.occurred_at });
    }
  }

  const legacyPhase = new Set(input.phases.filter((p) => p.legacy_source_path && !migratedPhases.has(p.id)).map((p) => p.id));
  const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;
  const features: FeatureView[] = [...input.features].sort(byPosition).map((feature) => {
    const st = featureState.get(feature.id);
    return { feature, status: st?.status ?? "todo", source: st?.source ?? null, at: st?.at ?? null, legacy: !!feature.phase_id && legacyPhase.has(feature.phase_id) };
  });
  const counted = features.filter((f) => !f.legacy && f.status !== "cancelled");
  const verified = counted.filter((f) => f.status === "verified").length;
  const implemented = counted.filter((f) => f.status === "implemented").length;
  return {
    status, priority, handoff, features,
    phases: [...input.phases].sort(byPosition).map((phase) => ({ phase, legacy: legacyPhase.has(phase.id) })),
    counted: counted.length, verified, implemented,
    completion: counted.length ? verified / counted.length : null,
    lastActivityAt,
  };
}

/** Newest import_run that finished ok, and the newest of any status (it carries the current gaps). */
export function importSummary(runs: readonly UpdateRow[]): {
  lastOk: { at: string; head: string | null } | null; latest: { at: string; status: string; head: string | null; gaps: number; error: string | null } | null;
} {
  const sorted = chronological(runs.filter((r) => r.event_type === "import_run")).reverse();
  const ok = sorted.find((r) => r.payload.status === "ok");
  const top = sorted[0];
  const gapCount = (p: Record<string, unknown>) => {
    const g = p.gaps;
    if (typeof g !== "object" || g === null) return 0;
    return Object.values(g).reduce<number>((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
  };
  return {
    lastOk: ok ? { at: ok.occurred_at, head: asStr(ok.payload.head) } : null,
    latest: top ? { at: top.occurred_at, status: String(top.payload.status ?? "unknown"), head: asStr(top.payload.head), gaps: gapCount(top.payload), error: asStr(top.payload.error) } : null,
  };
}
