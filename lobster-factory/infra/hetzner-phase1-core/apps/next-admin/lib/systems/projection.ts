// What a system looks like now, computed from its events (PLAN §3, §4, §8, §9). Pure: no I/O, so the page and the tests
// read the same answer. Rules:
// - status / priority: the newest status_change that carries each one.
// - handoff card: `next` = newest handoff that names one (absent = keep the previous); `blocker` is set by a handoff
//   and cleared only by one with blocker_cleared, never by a handoff that just leaves it out.
// - feature status: newest feature_update / migration (mapped_status) / review for that feature. Only a review may say
//   verified: a feature_update or migration that claims it counts as implemented.
// - a commit's events are hidden while the commit is reverted by a commit still in force; a revert that is itself
//   reverted lifts it again (back and forth, in commit order), and an orphaned commit (history diverged) is out with
//   its own reverts. Revert / orphaned events are read across every system (store.readCommitHistory).
// - completion = verified / features not cancelled; no features = null (尚未盤點). Features of a phase that still
//   lives on its old supervisor page (legacy_source_path, no migration event yet) are left out: that page is the source.
// - refresh_request / system_proposed / system_proposal_closed (契約 3) are requests, not state: ignored.
import { USER_REQUEST_TYPES, type FeatureStatus } from "./contract";

export interface SystemRow {
  id: string; slug: string; name: string; aliases: string[]; type: string; purpose: string; product_key: string | null;
  source_paths: string[]; position: number;
}
export interface PhaseRow { id: string; system_id: string; slug: string; name: string; legacy_source_path: string | null; position: number }
export interface FeatureRow { id: string; system_id: string; phase_id: string; slug: string; name: string; position: number }
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

/** Commits not in force, from revert and orphaned events. A commit is out when orphaned, or when some revert of it
 *  comes from a commit that is itself in force -- so reverting a revert brings the original back, and so on. A revert
 *  always comes after what it reverts, so the recursion follows commit order; a cycle (impossible in git) counts as in force. */
export function inactiveCommits(history: readonly UpdateRow[]): Set<string> {
  const orphaned = new Set(history.filter((e) => e.event_type === "orphaned").map((e) => asStr(e.payload.sha)).filter((x): x is string => !!x));
  const revertersOf = new Map<string, Array<string | null>>();
  for (const e of history) {
    if (e.event_type !== "revert") continue;
    const target = asStr(e.payload.reverted_sha);
    if (!target) continue;
    revertersOf.set(target, [...(revertersOf.get(target) ?? []), e.commit_sha]);
  }
  const memo = new Map<string, boolean>();
  const inactive = (sha: string, visiting: Set<string>): boolean => {
    if (orphaned.has(sha)) return true;
    const known = memo.get(sha);
    if (known !== undefined) return known;
    if (visiting.has(sha)) return false;
    visiting.add(sha);
    const out = (revertersOf.get(sha) ?? []).some((by) => by === null || !inactive(by, visiting));
    visiting.delete(sha);
    memo.set(sha, out);
    return out;
  };
  const shas = new Set<string>([...orphaned, ...revertersOf.keys()]);
  return new Set([...shas].filter((sha) => inactive(sha, new Set())));
}

/** Events still in force: every event of a commit that is out is hidden (its revert events too). */
export function liveEvents(events: readonly UpdateRow[], history: readonly UpdateRow[] = []): UpdateRow[] {
  const keys = new Set(history.map((e) => e.event_key));
  const out = inactiveCommits([...history, ...events.filter((e) => (e.event_type === "revert" || e.event_type === "orphaned") && !keys.has(e.event_key))]);
  return events.filter((e) => !e.commit_sha || !out.has(e.commit_sha));
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
  /** revert and orphaned events of every system, not only this one's (store.readCommitHistory) */
  history?: readonly UpdateRow[];
}): SystemProjection {
  const events = chronological(liveEvents(input.events, input.history));
  let status: SystemStatus | null = null;
  let priority: Priority | null = null;
  const handoff: HandoffCard = { next: null, nextAt: null, blocker: null, blockerAt: null, lastSubject: null, lastAt: null };
  const featureState = new Map<string, { status: FeatureStatus; source: string; at: string }>();
  const migratedPhases = new Set<string>();
  const phaseOfFeature = new Map(input.features.map((f) => [f.id, f.phase_id]));
  let lastActivityAt: string | null = null;

  for (const e of events) {
    if ((USER_REQUEST_TYPES as readonly string[]).includes(e.event_type)) continue;
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
