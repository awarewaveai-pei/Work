// The social sender (SOCIAL_MANAGER_PLAN.md C5; ADR 016 §2). One run, every 5 minutes (Trigger task social-dispatch
// -> POST /api/internal/social/dispatch): claim posts due within 10 minutes, create one Postiz post per target, then
// read Postiz back and move targets to published / error. The database functions of migration 0100 keep the
// invariants (claim once, one Postiz post per send, write-backs only on their own claim, a published target never
// resent); this file decides the order and what a Postiz answer means:
//   2xx with an id      -> recorded (queued)
//   429                 -> nothing reached Postiz: target stays pending, the whole sender backs off until the reset
//   other 4xx           -> refused for good: target error
//   5xx / timeout / 2xx without an id -> UNCERTAIN: the lease stays; after it runs out the next run gets the same
//                          send_key back (0100) and looks for a Postiz post carrying that exact key in its settings
//                          (sendKeyOf) -- found: recorded; not found: Postiz never made it, sent again with the key
// Sending is a production change: a brand (or the system) in a non-normal mode sends nothing; its posts stay queued
// and go out once the mode allows (reading results back is not blocked).
// Ports (dispatch-store.ts) are injected so the decisions are tested without a database or Postiz.

import { PostizApiError, sendKeyOf, type PostizPost, type RawIntegration } from "@/lib/content/postiz";
import { compose, ComposeError, type ComposeComment, type Composed } from "./compose";

/** dry_run: read only. draft: the whole pipeline, but Postiz only stores drafts (never publishes) -- the rehearsal on
 *  production (plan C5 acceptance). apply: sends. */
export type DispatchMode = "dry_run" | "draft" | "apply";
export type LeaseResult = "go" | "uncertain" | "busy" | "done" | "stale";
/** 0100 social_begin_send: the lease, and for go / uncertain the id this send gives its Postiz post. */
export interface Lease { lease: LeaseResult; sendKey: string | null }

export interface QueuedTarget {
  id: string;
  accountId: string;
  platform: string;
  integrationId: string;
  accountStatus: string;
  customBody: string | null;
  format: string;
  state: "pending" | "queued" | "published" | "error";
  postizPostId: string | null;
  /** when the target last changed (its failure, for an error target) */
  updatedAt: string;
}

export interface QueuedPost {
  id: string;
  organizationId: string;
  version: number;
  state: string;
  scheduledAt: string;
  /** when the post last changed: for a queued post, its claim */
  updatedAt: string;
  body: string;
  /** in position order (0105 social_post_comments) */
  comments: ComposeComment[];
  linkUrl: string | null;
  linkUtm: boolean;
  media: Array<{ postizMediaId: string | null; postizPath: string | null; altText: string | null }>;
  targets: QueuedTarget[];
}

export interface OutcomeChange { id: string; state: "published" | "error"; release_url?: string | null; error?: string | null }

export interface DispatchPorts {
  getBackoff(): Promise<Date | null>;
  setBackoff(until: Date): Promise<void>;
  claimDue(until: Date, limit: number): Promise<number>;
  /** dry run: what a claim would take, unclaimed */
  loadDue(until: Date, limit: number): Promise<QueuedPost[]>;
  loadQueued(limit: number): Promise<QueuedPost[]>;
  beginSend(post: QueuedPost, targetId: string): Promise<Lease>;
  recordSend(post: QueuedPost, targetId: string, postizPostId: string | null, error: string | null): Promise<boolean>;
  resetTarget(post: QueuedPost, targetId: string, deletedPostizPostId: string | null): Promise<boolean>;
  recordOutcome(post: QueuedPost, changes: OutcomeChange[]): Promise<string | null>;
  setAccountStatus(accountId: string, status: "connected" | "expired"): Promise<void>;
  /** The brand's (and global) system mode allows publishing (lib/system-modes/production-change-gate.ts) and the brand
   *  holds social.dispatch (enforce only; shadow always holds it). */
  sendAllowed(organizationId: string): Promise<boolean>;
  /** null = raised; otherwise why not (the run then fails, so Sentry has it) */
  raiseIncident(post: QueuedPost, message: string): Promise<string | null>;
  /** Postiz posts no target owns (0100 social_postiz_orphans), oldest first */
  loadOrphans(limit: number): Promise<string[]>;
  orphanGone(postizPostId: string): Promise<void>;
  orphanFailed(postizPostId: string, error: string): Promise<void>;
  postiz: {
    integrations(): Promise<RawIntegration[]>;
    listPosts(start: Date, end: Date): Promise<PostizPost[]>;
    createPost(opts: { sendKey: string; integrationId: string; type: "schedule" | "now" | "draft"; date: string } & Pick<Composed, "values" | "settings">): Promise<string>;
    deletePost(id: string): Promise<{ existed: boolean }>;
  };
}

export const SEND_WINDOW_MS = 10 * 60_000;      // plan C5: scheduled_at <= now + 10 min
export const CLAIM_LIMIT = 25;                   // posts claimed per run
export const QUEUED_LIMIT = 100;                 // queued posts worked per run (oldest first)
// per run: 12 runs/h x 20 = 240 of API_LIMIT=300/h on ks-aw-01 (lobster-factory/infra/postiz/docker-compose.yml),
// leaving 60/h for people (connect, withdraw) -- review 2026-10-15: 40 would have been 480/h
export const MAX_POSTIZ_CALLS = 20;   // plus at most one delete per write-back refused in this run (its orphan)
export const LEASE = "10 minutes";               // a send older than this with no id is uncertain (Postiz call: 20 s)
export const RUN_BUDGET_MS = 150_000;            // no new post started after this (route maxDuration 300 s)
const RESULT_WAIT_MS = 7 * 24 * 3600_000;        // how far back the result read looks (beyond: Postiz has no answer)
const ORPHAN_LIMIT = 10;                         // orphans retried per run
const DEFAULT_BACKOFF_S = 15 * 60;               // a 429 without Retry-After

export interface DispatchResult {
  mode: DispatchMode;
  backoffUntil: string | null;
  claimed: number;
  sent: number;
  adopted: number;
  uncertain: number;
  failedTargets: number;
  published: number;
  errored: number;
  orphansDeleted: number;
  /** posts whose brand (or the whole system) is in a mode that blocks publishing, or (enforce) the brand lacks
   *  social.dispatch: left queued, sent once it allows */
  blockedByMode: number;
  postizCalls: number;
  stoppedEarly: "budget" | "time" | null;
  errors: string[];
  wouldSend?: Array<{ postId: string; targetId: string; platform: string; type: "schedule" | "now"; chars?: number; error?: string }>;
}

class Backoff extends Error {
  constructor(readonly seconds: number) { super(`Postiz rate limit; back off ${seconds}s`); }
}
class OutOfBudget extends Error {}
class OutOfTime extends Error {}

function composeFor(post: QueuedPost, t: QueuedTarget): Composed {
  return compose({ body: post.body, customBody: t.customBody, comments: post.comments, linkUrl: post.linkUrl,
    linkUtm: post.linkUtm, platform: t.platform, format: t.format, media: post.media });
}

export async function runDispatch(ports: DispatchPorts, opts: { mode: DispatchMode; now?: Date; clock?: () => number }): Promise<DispatchResult> {
  const now = opts.now ?? new Date();
  const clock = opts.clock ?? Date.now;
  const started = clock();
  const r: DispatchResult = { mode: opts.mode, backoffUntil: null, claimed: 0, sent: 0, adopted: 0, uncertain: 0, failedTargets: 0,
    published: 0, errored: 0, orphansDeleted: 0, blockedByMode: 0, postizCalls: 0, stoppedEarly: null, errors: [] };
  const until = new Date(now.getTime() + SEND_WINDOW_MS);
  const sendType = (post: QueuedPost): "schedule" | "now" => (Date.parse(post.scheduledAt) <= now.getTime() ? "now" : "schedule");

  if (opts.mode === "dry_run") {
    r.wouldSend = [];
    const posts = [...(await ports.loadDue(until, CLAIM_LIMIT)), ...(await ports.loadQueued(QUEUED_LIMIT))];
    for (const post of posts) for (const t of post.targets) {
      if (t.state !== "pending" && t.state !== "error") continue;
      try {
        r.wouldSend.push({ postId: post.id, targetId: t.id, platform: t.platform, type: sendType(post), chars: composeFor(post, t).text.length });
      } catch (e) {
        r.wouldSend.push({ postId: post.id, targetId: t.id, platform: t.platform, type: sendType(post), error: (e as Error).message });
      }
    }
    return r;
  }

  const backoff = await ports.getBackoff();
  if (backoff && backoff.getTime() > now.getTime()) {
    r.backoffUntil = backoff.toISOString();
    return r;
  }

  // every Postiz call goes through here: the per-run budget, and a 429 anywhere stops the run
  // cleanup = deleting a Postiz post this run itself made: never refused by the budget, or it would be left behind
  async function call<T>(fn: () => Promise<T>, cleanup = false): Promise<T> {
    if (!cleanup && r.postizCalls >= MAX_POSTIZ_CALLS) throw new OutOfBudget();
    r.postizCalls++;
    try {
      return await fn();
    } catch (e) {
      if (e instanceof PostizApiError && e.status === 429) throw new Backoff(e.retryAfterSeconds ?? DEFAULT_BACKOFF_S);
      throw e;
    }
  }
  let integrations: Promise<RawIntegration[]> | null = null;
  const liveIntegrations = () => (integrations ??= call(() => ports.postiz.integrations()));
  let postizPosts: Promise<Map<string, PostizPost>> | null = null;
  let posts: QueuedPost[] = [];
  const modes = new Map<string, Promise<boolean>>();
  const allowed = (org: string) => {
    if (!modes.has(org)) modes.set(org, ports.sendAllowed(org));
    return modes.get(org) as Promise<boolean>;
  };
  const postizWindow = () => (postizPosts ??= (async () => {
    const earliest = Math.min(...posts.map((p) => Date.parse(p.scheduledAt)), now.getTime());
    // a late send's Postiz date is the send time, so the window always reaches back RESULT_WAIT_MS from now
    const start = new Date(Math.min(earliest, now.getTime() - RESULT_WAIT_MS) - 24 * 3600_000);
    const list = await call(() => ports.postiz.listPosts(start, new Date(now.getTime() + 24 * 3600_000)));
    return new Map(list.map((p) => [p.id, p]));
  })());

  // fresh = the orphan this run just made (deleted even past the budget); older ones wait for budget like any call
  async function deleteOrphan(id: string, fresh: boolean): Promise<void> {
    try {
      await call(() => ports.postiz.deletePost(id), fresh);
      await ports.orphanGone(id);
      r.orphansDeleted++;
    } catch (e) {
      if (e instanceof Backoff || e instanceof OutOfBudget) throw e;
      await ports.orphanFailed(id, String(e).slice(0, 500));
      r.errors.push(`orphan ${id}: ${String(e).slice(0, 200)}`);
    }
  }

  async function sendTarget(post: QueuedPost, t: QueuedTarget, sentNow: Set<string>): Promise<void> {
    if (clock() - started > RUN_BUDGET_MS) throw new OutOfTime();   // checked before the lease: no half-started send
    const { lease, sendKey } = await ports.beginSend(post, t.id);
    if (lease === "busy" || lease === "done" || lease === "stale" || !sendKey) return;
    const refuse = async (message: string) => {
      await ports.recordSend(post, t.id, null, message);
      t.state = "error";
      r.failedTargets++;
    };
    if (lease === "uncertain") {
      // an earlier run sent this with the same key and never heard back: Postiz has a post carrying that key, or none.
      // Looked up first, so a channel disconnected since then cannot hide a post that already exists (review 2026-10-15)
      const found = [...(await postizWindow()).values()].find((p) => sendKeyOf(p) === sendKey);
      if (found) {
        if (await ports.recordSend(post, t.id, found.id, null)) {
          t.state = "queued";
          t.postizPostId = found.id;
          sentNow.add(t.id);
          r.adopted++;
        }
        return;
      }
    }
    const live = (await liveIntegrations()).find((i) => i.id === t.integrationId);
    if (!live || live.disabled) {
      if (t.accountStatus !== "expired") await ports.setAccountStatus(t.accountId, "expired");
      return refuse(`the ${t.platform} channel is disconnected in Postiz; reconnect it, then schedule again`);
    }
    let composed: Composed;
    try {
      composed = composeFor(post, t);
    } catch (e) {
      // anything compose cannot build is this target's failure, never a run error that would leave its lease hanging
      return refuse(e instanceof ComposeError ? e.message : `could not build the post: ${String(e).slice(0, 200)}`);
    }
    if (clock() - started > RUN_BUDGET_MS) {   // the checks above took the rest of the run: give the lease back, unsent
      await ports.recordSend(post, t.id, null, null);
      throw new OutOfTime();
    }
    let id: string;
    try {
      id = await call(() => ports.postiz.createPost({ sendKey, integrationId: t.integrationId, type: opts.mode === "draft" ? "draft" : sendType(post), date: post.scheduledAt,
        values: composed.values, settings: composed.settings }));
    } catch (e) {
      if (e instanceof Backoff) {
        await ports.recordSend(post, t.id, null, null);   // nothing reached Postiz: drop the lease, stay pending
        throw e;
      }
      if (e instanceof OutOfBudget) {
        await ports.recordSend(post, t.id, null, null);
        throw e;
      }
      if (e instanceof PostizApiError && e.status >= 400 && e.status < 500) return refuse(`Postiz refused the post: ${e.message}`);
      r.uncertain++;   // 5xx, timeout, no id: the lease (and its key) stays; the next run looks the key up first
      r.errors.push(`${post.id}/${t.id}: uncertain send: ${String(e).slice(0, 200)}`);
      return;
    }
    if (!(await ports.recordSend(post, t.id, id, null))) {
      // the post was withdrawn (or re-claimed) while this call ran: this Postiz post belongs to nobody. The refused
      // write-back put it in social_postiz_orphans; deleting it now is the fast path, a failure is retried next run
      await deleteOrphan(id, true);
      return;
    }
    t.state = "queued";
    t.postizPostId = id;
    sentNow.add(t.id);
    r.sent++;
    if (t.accountStatus !== "connected") await ports.setAccountStatus(t.accountId, "connected");   // ADR 016 §4: the send decides
  }

  try {
    for (const id of await ports.loadOrphans(ORPHAN_LIMIT)) await deleteOrphan(id, false);
    r.claimed = await ports.claimDue(until, CLAIM_LIMIT);
    posts = await ports.loadQueued(QUEUED_LIMIT);
    for (const post of posts) {
      if (clock() - started > RUN_BUDGET_MS) {
        r.stoppedEarly = "time";
        break;
      }
      try {
        const sentNow = new Set<string>();
        const sending = post.targets.some((t) => t.state === "pending" || t.state === "error");
        if (sending && !(await allowed(post.organizationId))) r.blockedByMode++;
        else for (const t of post.targets) {
          // a target that failed during THIS claim stays failed (review 2026-10-15 R5: a refusal is not retried every run);
          // one that failed before the post was claimed again (a person rescheduled it) is sent again
          if (t.state === "error" && Date.parse(t.updatedAt) < Date.parse(post.updatedAt)) {
            // C4 review: a failed target is resent only after its Postiz ERROR post is gone
            if (t.postizPostId) await call(() => ports.postiz.deletePost(t.postizPostId as string));
            if (!(await ports.resetTarget(post, t.id, t.postizPostId))) continue;
            t.state = "pending";
            t.postizPostId = null;
          }
          if (t.state === "pending") await sendTarget(post, t, sentNow);
        }
        const changes: OutcomeChange[] = [];
        const waiting = post.targets.filter((t) => t.state === "queued" && t.postizPostId && !sentNow.has(t.id));
        if (waiting.length) {
          // looked up by id in the last RESULT_WAIT_MS of Postiz posts, whenever the post was scheduled (review
          // 2026-10-15: a post held back by a system mode is sent late, and its fresh Postiz post must still be found)
          const seen = await postizWindow();
          for (const t of waiting) {
            const p = seen.get(t.postizPostId as string);
            if (p?.state === "PUBLISHED") changes.push({ id: t.id, state: "published", release_url: p.releaseURL });
            else if (p?.state === "DRAFT" && opts.mode !== "draft") {
              // a rehearsal draft (SOCIAL_DISPATCH_MODE=draft) never goes out by itself: settle it, the person schedules again
              changes.push({ id: t.id, state: "error", error: "a rehearsal draft in Postiz (draft mode); schedule the post again to send it" });
            }
            else if (p?.state === "ERROR") changes.push({ id: t.id, state: "error", error: p.error ?? "Postiz reported an error" });
            else if (!p) changes.push({ id: t.id, state: "error", error: "Postiz has no such post any more (deleted there, its channel removed, or older than 7 days)" });
          }
        }
        const open = post.targets.some((t) => t.state === "pending" || t.state === "queued");
        if (changes.length || !open) {
          const next = await ports.recordOutcome(post, changes);
          if (next === "published") r.published++;
          if (next === "error") {
            r.errored++;
            const why = [...changes.filter((c) => c.state === "error").map((c) => c.error), ...post.targets.filter((t) => t.state === "error").map((t) => t.platform)];
            const notRaised = await ports.raiseIncident(post, `social post ${post.id} failed: ${why.filter(Boolean).join("; ").slice(0, 500)}`);
            if (notRaised) r.errors.push(`${post.id}: incident not raised: ${notRaised}`);
          }
        }
      } catch (e) {
        if (e instanceof Backoff || e instanceof OutOfBudget || e instanceof OutOfTime) throw e;
        r.errors.push(`${post.id}: ${String(e).slice(0, 200)}`);
      }
    }
  } catch (e) {
    if (e instanceof Backoff) {
      const until = new Date(now.getTime() + e.seconds * 1000);
      await ports.setBackoff(until);
      r.backoffUntil = until.toISOString();
    } else if (e instanceof OutOfBudget) {
      r.stoppedEarly = "budget";
    } else if (e instanceof OutOfTime) {
      r.stoppedEarly = "time";
    } else {
      throw e;
    }
  }
  return r;
}
