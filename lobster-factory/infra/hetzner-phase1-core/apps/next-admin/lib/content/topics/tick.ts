// One push of a brand's topic queue (plan §3.2, I3, I8): fail the rows whose worker was lost, review what is drafted,
// start what is due under the daily cap and make it. Each firing does what fits in its time budget and stops; the next
// firing goes on. Every move is guarded by the version read (store.ts move / startTopic), so two firings, or a firing
// and the 「立即開始」 button, never move the same row twice. A row is worked on only by the caller that started it:
// a 'generating' row found here is someone else's, until it is old enough to be a lost one.
// A topic reaching 'reviewed' goes out by itself only when both hold (plan I5): its review passed and its site is set to
// AI review auto publish. Rows already sitting in 'reviewed' are a person's: switching a site to auto later does not
// publish them. One whose day is still ahead waits as 'scheduled' with nothing sent, and a later firing publishes it
// on its day -- WordPress's own scheduler (wp-cron, runs only on visits) and a social post timed ahead of the article
// are never relied on, so a social post never links to an article that is not live yet.
import type { Topic, TopicFormat, TopicStatus } from "./store";
import type { TopicReview } from "./review";

/** Topics a brand may start per UTC day when its content_pipeline row sets no limit (plan D5; 0125 daily_limit, 1-10). */
export const DAILY_START_CAP = 2;
/** Far beyond one making (article ~2 min + social), so only a restart mid-way leaves a row this old in 'generating'. */
export const STALE_GENERATING_MS = 30 * 60 * 1000;
/** run-due runs jobs one after another; this leaves room under the host cron's 5 minutes. */
export const TICK_BUDGET_MS = 200_000;
/** A video still not done this long after it was started has failed (renders take minutes; video_jobs rows live 1h). */
export const VIDEO_TIMEOUT_MS = 60 * 60 * 1000;

export interface Made { artifacts: Record<string, unknown>; review: TopicReview }
/** What went out (the article's link, the social post's state), kept on the row. */
export interface Published { artifacts: Record<string, unknown> }
/** A making that failed after some parts were made: they are kept on the failed row, so a retry does not make them again. */
export class MakeError extends Error {
  constructor(message: string, readonly artifacts: Record<string, unknown>) { super(message); }
}
/** What the pipeline makes; a topic with only youtube waits for the YouTube phase (P7). */
export const NOW_FORMATS: TopicFormat[] = ["article", "social", "video"];

/** One look at a topic's video job (finalize.ts finalizeVideoJob behind it). */
export type VideoPoll = { state: "running" } | { state: "error"; error: string } | { state: "done"; url: string };

export interface TickDeps {
  now(): Date;
  due(now: Date): Promise<Topic[]>;
  inStatus(statuses: TopicStatus[]): Promise<Topic[]>;
  /** Why the topic cannot be made now (its site is gone, say); null = it can. Asked before a start uses a daily slot. */
  blocker(t: Topic): Promise<string | null>;
  start(t: Topic, day: string, cap: number): Promise<Topic | null>;
  move(t: Topic, to: TopicStatus, patch?: Partial<Pick<Topic, "artifacts" | "review" | "last_error">>): Promise<Topic | null>;
  /** Takes the row (version bump, same status) before an outside write; null = someone else has it (store.ts claimTopic).
   *  With artifacts: also records what an outside write just did, so a restart does not do it again. */
  claim(t: Topic, patch?: { artifacts: Record<string, unknown> }): Promise<Topic | null>;
  /** The article draft and social drafts of one started topic, and their review. Throws when anything failed. */
  make(t: Topic): Promise<Made>;
  /** The topic's site is set to publish without a person (brand-voice.ts autoPublishes, read now). */
  autoPublishes(t: Topic): Promise<boolean>;
  /** Puts a topic's drafts out now (article live, then the social post with its link), re-reading the site's mode first.
   *  Throws when anything failed (a MakeError keeps what already went out, so a retry does not send it twice). */
  publish(t: Topic): Promise<Published>;
  /** Starts the topic's video (start.ts startVideoJob): `record(jobId)` runs once the job row exists and before anything
   *  is paid for; false = another firing has the topic, nothing is prepared. Throws when no job could be started. */
  startVideo(t: Topic, record: (jobId: string) => Promise<boolean>): Promise<void>;
  pollVideo(t: Topic, jobId: string): Promise<VideoPoll>;
  /** The finished video into the article draft and onto the social draft. `save(artifacts)` records each step on the row
   *  as it is done (false = the row was taken). Throws (a MakeError keeps what was done). */
  attachVideo(t: Topic, url: string, save: (artifacts: Record<string, unknown>) => Promise<boolean>): Promise<Published>;
}

/** What content_topics.artifacts.video holds (make.ts writes the attach flags). */
export interface VideoArtifact { job_id: string; url?: string }

export const makesNow = (t: Pick<Topic, "formats">) => t.formats.some((f) => NOW_FORMATS.includes(f));
/** Video is made after the drafts (P6): such a topic stays 'drafted' until then. */
export const waitsForVideo = (t: Pick<Topic, "formats">) => t.formats.includes("video") || t.formats.includes("youtube");

const failedPatch = (e: unknown) => ({ last_error: e instanceof Error ? e.message : String(e), ...(e instanceof MakeError ? { artifacts: e.artifacts } : {}) });

/** The topic's day (its scheduled_for) is still ahead: it waits as 'scheduled'. */
export const waitsForDay = (t: Pick<Topic, "scheduled_for">, now: Date) =>
  !!t.scheduled_for && Date.parse(t.scheduled_for) > now.getTime();

/** reviewed|scheduled -> published, or failed with what already went out. Claimed first: two overlapping firings never
 *  both write to WordPress and the social tool for one row. */
async function publishNow(deps: TickDeps, row: Topic): Promise<"published" | "failed" | "moved_elsewhere"> {
  const t = await deps.claim(row);
  if (!t) return "moved_elsewhere";
  let out: Published;
  try {
    out = await deps.publish(t);
  } catch (e) {
    return (await deps.move(t, "failed", failedPatch(e))) ? "failed" : "moved_elsewhere";
  }
  try {
    return (await deps.move(t, "published", { artifacts: out.artifacts })) ? "published" : "moved_elsewhere";
  } catch (e) {   // it went out but the row could not say so: keep what went out in the log, for a person to reconcile
    console.error(`[content/topics] ${t.id} published but not recorded: ${JSON.stringify(out.artifacts).slice(0, 2000)}`);
    throw e;
  }
}

/** I5: a reviewed topic goes out only with a passed review AND a site set to auto publish; otherwise it stays a draft. */
export async function publishReviewed(deps: TickDeps, reviewed: Topic): Promise<"reviewed" | "published" | "scheduled" | "failed" | "moved_elsewhere"> {
  if ((reviewed.review as TopicReview | null)?.pass !== true) return "reviewed";
  let auto: boolean;
  try {
    auto = (await deps.autoPublishes(reviewed)) === true;
  } catch (e) {   // not a silent "manual": rows left in 'reviewed' are never looked at again
    const why = `讀不到網站的發布設定：${e instanceof Error ? e.message : String(e)}`;
    return (await deps.move(reviewed, "failed", { last_error: why })) ? "failed" : "moved_elsewhere";
  }
  if (!auto) return "reviewed";
  if (waitsForDay(reviewed, deps.now())) return (await deps.move(reviewed, "scheduled")) ? "scheduled" : "moved_elsewhere";
  return publishNow(deps, reviewed);
}

type Outcome = "reviewed" | "drafted" | "published" | "scheduled" | "failed" | "moved_elsewhere" | "video_started";

const videoOf = (t: Pick<Topic, "artifacts">) => (t.artifacts as { video?: VideoArtifact }).video;
const failRow = async (deps: TickDeps, t: Topic, e: unknown): Promise<Outcome> =>
  (await deps.move(t, "failed", failedPatch(e))) ? "failed" : "moved_elsewhere";

/** embedded -> reviewed, then the same I5 gate as a topic without video. */
async function reviewEmbedded(deps: TickDeps, embedded: Topic): Promise<Outcome> {
  const reviewed = await deps.move(embedded, "reviewed");
  return reviewed ? publishReviewed(deps, reviewed) : "moved_elsewhere";
}

/** waiting_video -> embedded with the finished video in the article and on the social draft. Claimed first: the
 *  article's placeholder is replaced once, so two firings must not both write it. */
async function attachFinished(deps: TickDeps, waiting: Topic, url: string): Promise<Outcome> {
  const claimed = await deps.claim(waiting);
  if (!claimed) return "moved_elsewhere";
  const cur: { row: Topic } = { row: claimed };
  const save = async (artifacts: Record<string, unknown>) => {
    const r = await deps.claim(cur.row, { artifacts });
    if (r) cur.row = r;
    return !!r;
  };
  let out: Published;
  try {
    out = await deps.attachVideo(cur.row, url, save);
  } catch (e) {
    return failRow(deps, cur.row, e);
  }
  const embedded = await deps.move(cur.row, "embedded", { artifacts: out.artifacts });
  return embedded ? reviewEmbedded(deps, embedded) : "moved_elsewhere";
}

/** drafted -> waiting_video. The job is recorded on the row (the move) before anything is paid for, so of two firings
 *  only the one whose move won prepares; the other's job is closed empty. A retry whose video had finished
 *  (artifacts.video.url) attaches that one instead of making another. */
async function startVideo(deps: TickDeps, drafted: Topic): Promise<Outcome> {
  const finished = videoOf(drafted)?.url;
  if (finished) {
    const waiting = await deps.move(drafted, "waiting_video");
    return waiting ? attachFinished(deps, waiting, finished) : "moved_elsewhere";
  }
  const won: { row: Topic | null } = { row: null };
  try {
    await deps.startVideo(drafted, async (jobId) => {
      won.row = await deps.move(drafted, "waiting_video", { artifacts: { ...drafted.artifacts, video: { job_id: jobId } } });
      return !!won.row;
    });
  } catch (e) {
    return failRow(deps, won.row ?? drafted, e);
  }
  return won.row ? "video_started" : "moved_elsewhere";
}

/** One look at a waiting video: still rendering = nothing; failed = the topic fails (its drafts kept); done = attach. */
async function checkVideo(deps: TickDeps, waiting: Topic, now: Date): Promise<Outcome | null> {
  const jobId = videoOf(waiting)?.job_id;
  if (!jobId) return failRow(deps, waiting, new Error("沒有影片工作編號"));
  if (now.getTime() - Date.parse(waiting.updated_at) >= VIDEO_TIMEOUT_MS) {
    return failRow(deps, waiting, new Error("影片超過一小時沒有做好，按重試會重做影片"));
  }
  let poll: VideoPoll;
  try {
    poll = await deps.pollVideo(waiting, jobId);
  } catch (e) {   // could not look (a read failed): not a failed video -- the next firing looks again, within the timeout
    console.warn(`[content/topics] ${waiting.id} video check failed: ${e instanceof Error ? e.message : e}`);
    return null;
  }
  if (poll.state === "running") return null;
  if (poll.state === "error") return failRow(deps, waiting, new Error(`影片失敗：${poll.error}`));
  return attachFinished(deps, waiting, poll.url);
}

/** Makes one started topic and moves it on. Never throws for the topic's own failure: that is the row's last_error. */
export async function makeStarted(deps: TickDeps, started: Topic): Promise<Outcome> {
  let made: Made;
  try {
    made = await deps.make(started);
  } catch (e) {
    return (await deps.move(started, "failed", failedPatch(e))) ? "failed" : "moved_elsewhere";
  }
  // A DB error here throws (the drafts exist but the row says generating): the row is then failed as interrupted
  // after STALE_GENERATING_MS, and its retry makes new drafts beside the old ones -- drafts only, nothing published.
  const drafted = await deps.move(started, "drafted", { artifacts: made.artifacts, review: made.review });
  if (!drafted) return "moved_elsewhere";
  if (waitsForVideo(drafted)) return "drafted";
  const reviewed = await deps.move(drafted, "reviewed");
  return reviewed ? publishReviewed(deps, reviewed) : "drafted";
}

function count(n: Record<string, number>, r: Outcome) {
  if (r !== "moved_elsewhere") n[r]++;
}

export async function tickTopics(deps: TickDeps, opts: { cap?: number; budgetMs?: number } = {}): Promise<string> {
  const cap = opts.cap ?? DAILY_START_CAP;
  const budget = opts.budgetMs ?? TICK_BUDGET_MS;
  const t0 = deps.now();
  const n = { interrupted: 0, reviewed: 0, started: 0, drafted: 0, failed: 0, returned: 0, published: 0, scheduled: 0,
    video_started: 0 };

  for (const t of await deps.inStatus(["generating", "drafted", "waiting_video", "embedded", "scheduled"])) {
    if (t.status === "generating" && t0.getTime() - Date.parse(t.updated_at) >= STALE_GENERATING_MS) {
      if (await deps.move(t, "failed", { last_error: "做到一半中斷了（伺服器重新啟動），按重試會重新製作" })) n.interrupted++;
    } else if (t.status === "drafted" && !waitsForVideo(t)) {
      const reviewed = await deps.move(t, "reviewed");
      if (reviewed) count(n, await publishReviewed(deps, reviewed));
    } else if (t.status === "drafted") {
      // a prepare takes up to ~100s: started only while the firing has time for it, else by the next firing
      if (deps.now().getTime() - t0.getTime() < budget) count(n, await startVideo(deps, t));
    } else if (t.status === "waiting_video") {
      const r = await checkVideo(deps, t, t0);
      if (r) count(n, r);
    } else if (t.status === "embedded") {   // the move to reviewed was lost (restart): same gate as above
      count(n, await reviewEmbedded(deps, t));
    } else if (t.status === "scheduled" && !waitsForDay(t, t0)) {
      // its day came: publish re-reads the site's mode, so a switch back to human review wins (the row fails, drafts kept)
      count(n, await publishNow(deps, t));
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
    count(n, await makeStarted(deps, started));
  }
  return Object.entries(n).map(([k, v]) => `${k}=${v}`).join(" ");
}
