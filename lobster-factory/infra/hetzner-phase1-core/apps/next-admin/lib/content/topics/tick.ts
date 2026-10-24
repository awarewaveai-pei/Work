// One push of a brand's topic queue (plan §3.2, I3, I8): fail the rows whose worker was lost, review what is drafted,
// start what is due under the daily cap and make it. Each firing does what fits in its time budget and stops; the next
// firing goes on. Every move is guarded by the version read (store.ts move / startTopic), so two firings, or a firing
// and the 「立即開始」 button, never move the same row twice. A row is worked on only by the caller that started it:
// a 'generating' row found here is someone else's, until it is old enough to be a lost one.
import type { Topic, TopicFormat, TopicStatus } from "./store";
import type { TopicReview } from "./review";

/** Topics a brand may start per UTC day (plan D5: N=2). The cost sentence on /ops/schedules quotes it. */
export const DAILY_START_CAP = 2;
/** Far beyond one making (article ~2 min + social), so only a restart mid-way leaves a row this old in 'generating'. */
export const STALE_GENERATING_MS = 30 * 60 * 1000;
/** run-due runs jobs one after another; this leaves room under the host cron's 5 minutes. */
export const TICK_BUDGET_MS = 200_000;

export interface Made { artifacts: Record<string, unknown>; review: TopicReview }
/** A making that failed after some parts were made: they are kept on the failed row, so a retry does not make them again. */
export class MakeError extends Error {
  constructor(message: string, readonly artifacts: Record<string, unknown>) { super(message); }
}
/** What this phase makes; a topic with neither waits for the video phase (P6). */
export const NOW_FORMATS: TopicFormat[] = ["article", "social"];

export interface TickDeps {
  now(): Date;
  due(now: Date): Promise<Topic[]>;
  inStatus(statuses: TopicStatus[]): Promise<Topic[]>;
  /** Why the topic cannot be made now (its site is gone, say); null = it can. Asked before a start uses a daily slot. */
  blocker(t: Topic): Promise<string | null>;
  start(t: Topic, day: string, cap: number): Promise<Topic | null>;
  move(t: Topic, to: TopicStatus, patch?: Partial<Pick<Topic, "artifacts" | "review" | "last_error">>): Promise<Topic | null>;
  /** The article draft and social drafts of one started topic, and their review. Throws when anything failed. */
  make(t: Topic): Promise<Made>;
}

export const makesNow = (t: Pick<Topic, "formats">) => t.formats.some((f) => NOW_FORMATS.includes(f));
/** Video is made after the drafts (P6): such a topic stays 'drafted' until then. */
const waitsForVideo = (t: Pick<Topic, "formats">) => t.formats.includes("video") || t.formats.includes("youtube");

/** Makes one started topic and moves it on. Never throws for the topic's own failure: that is the row's last_error. */
export async function makeStarted(deps: TickDeps, started: Topic): Promise<"reviewed" | "drafted" | "failed" | "moved_elsewhere"> {
  let made: Made;
  try {
    made = await deps.make(started);
  } catch (e) {
    const patch = { last_error: e instanceof Error ? e.message : String(e), ...(e instanceof MakeError ? { artifacts: e.artifacts } : {}) };
    return (await deps.move(started, "failed", patch)) ? "failed" : "moved_elsewhere";
  }
  // A DB error here throws (the drafts exist but the row says generating): the row is then failed as interrupted
  // after STALE_GENERATING_MS, and its retry makes new drafts beside the old ones -- drafts only, nothing published.
  const drafted = await deps.move(started, "drafted", { artifacts: made.artifacts, review: made.review });
  if (!drafted) return "moved_elsewhere";
  if (waitsForVideo(drafted)) return "drafted";
  return (await deps.move(drafted, "reviewed")) ? "reviewed" : "drafted";
}

export async function tickTopics(deps: TickDeps, opts: { cap?: number; budgetMs?: number } = {}): Promise<string> {
  const cap = opts.cap ?? DAILY_START_CAP;
  const budget = opts.budgetMs ?? TICK_BUDGET_MS;
  const t0 = deps.now();
  const n = { interrupted: 0, reviewed: 0, started: 0, drafted: 0, failed: 0, returned: 0 };

  for (const t of await deps.inStatus(["generating", "drafted"])) {
    if (t.status === "generating" && t0.getTime() - Date.parse(t.updated_at) >= STALE_GENERATING_MS) {
      if (await deps.move(t, "failed", { last_error: "做到一半中斷了（伺服器重新啟動），按重試會重新製作" })) n.interrupted++;
    } else if (t.status === "drafted" && !waitsForVideo(t)) {
      if (await deps.move(t, "reviewed")) n.reviewed++;
    }
  }

  const day = t0.toISOString().slice(0, 10);
  for (const t of (await deps.due(t0)).filter(makesNow)) {
    if (deps.now().getTime() - t0.getTime() >= budget) break;
    const blocked = await deps.blocker(t);
    if (blocked) {   // back to the person, without using a daily slot
      if (await deps.move(t, "proposed", { last_error: blocked })) n.returned++;
      continue;
    }
    const started = await deps.start(t, day, cap);
    if (!started) break;   // the day's cap is reached, or another firing took this row: the next firing looks again
    n.started++;
    const r = await makeStarted(deps, started);
    if (r === "reviewed") n.reviewed++;
    else if (r === "drafted") n.drafted++;
    else if (r === "failed") n.failed++;
  }
  return Object.entries(n).map(([k, v]) => `${k}=${v}`).join(" ");
}
