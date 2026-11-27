// tickTopics against an in-memory queue that keeps the database's rules: every move guarded by status and version, and
// the start under the per-day cap (0121 content_topics_start).
import { describe, expect, it } from "vitest";
import { NEXT, type Topic, type TopicStatus } from "../store";
import { DAILY_START_CAP, MakeError, advanceStartedTopics, brandDay, requestPublish, STALE_GENERATING_MS, VIDEO_TIMEOUT_MS, tickTopics, type Made, type Published, type PublishRun, type TickDeps, type VideoPoll } from "../tick";
import { publishSteps, STEP_LEASE_MS, YOUTUBE_LIVE_TIMEOUT_MS, YOUTUBE_TIMEOUT_TEXT, type PublishPorts, type YoutubeLook } from "../publish-steps";

const ORG = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-11-03T02:00:00Z");
const review: Made["review"] = { pass: true, checks: [], at: NOW.toISOString() };

function topic(id: string, over: Partial<Topic> = {}): Topic {
  return {
    id, organization_id: ORG, site_id: "s1", title: `t${id}`, keyword: `k${id}`, angle: null, source: "manual", source_ref: {},
    month: "2026-11-01", scheduled_for: null, formats: ["article", "social"], status: "approved", artifacts: {}, review: null,
    version: 1, last_error: null, started_on: null, created_by: "staff:x", created_at: NOW.toISOString(), updated_at: NOW.toISOString(), ...over,
  };
}

/** auto = the site's publish mode is AI review auto publish; publish = what putting the drafts out does. */
type Save = (artifacts: Record<string, unknown>) => Promise<boolean>;
interface Pub { auto?: boolean | (() => Promise<boolean>); publish?: (t: Topic, save: Save, fresh: boolean) => Promise<PublishRun> }

function queue(rows: Topic[], make: (t: Topic) => Promise<Made> = async () => ({ artifacts: { wp_post_id: 1 }, review }),
  blocker = async (_t: Topic): Promise<string | null> => null, pub: Pub = {}) {
  const db = new Map(rows.map((r) => [r.id, { ...r }]));
  let clock = NOW.getTime();
  const made: string[] = [];
  const published: string[] = [];
  /** Video jobs: what prepare was paid for, what was closed empty, what each poll answers, what was attached. */
  const video = { prepared: [] as string[], abandoned: [] as string[], polls: new Map<string, VideoPoll>(), attached: [] as string[],
    attach: undefined as undefined | ((t: Topic, url: string, save: (a: Record<string, unknown>) => Promise<boolean>) => Promise<Published>) };
  let jobs = 0;
  /** The brand's organizations.default_timezone (null = none: the UTC day). */
  const zone = { tz: null as string | null };
  const write = (t: Topic, to: TopicStatus, patch: Partial<Topic> = {}) => {
    const cur = db.get(t.id);
    if (!cur || cur.status !== t.status || cur.version !== t.version) return null;
    const next = { ...cur, ...patch, status: to, version: cur.version + 1, updated_at: new Date(clock).toISOString() };
    db.set(t.id, next);
    return { ...next };
  };
  const deps: TickDeps = {
    now: () => new Date(clock),
    due: async (now) => [...db.values()].filter((t) => t.status === "approved" && (!t.scheduled_for || Date.parse(t.scheduled_for) <= now.getTime())).map((t) => ({ ...t })),
    blocker,
    inStatus: async (s) => [...db.values()].filter((t) => s.includes(t.status)).map((t) => ({ ...t })),
    start: async (t, cap) => {
      const day = brandDay(new Date(clock), zone.tz);   // the brand's day at the moment of the start, like make.ts
      if ([...db.values()].filter((r) => r.started_on === day).length >= cap) return null;
      return write(t, "generating", { started_on: day, last_error: null });
    },
    claim: async (t, patch) => write(t, t.status, patch ?? {}),
    move: async (t, to, patch) => {
      if (!NEXT[t.status].includes(to)) throw new Error(`${t.status} -> ${to}`);
      return write(t, to, patch);
    },
    make: async (t) => { made.push(t.id); return make(t); },
    autoPublishes: async () => (typeof pub.auto === "function" ? pub.auto() : pub.auto === true),
    publish: async (t, save, fresh) => {
      published.push(t.id);
      return (pub.publish ?? (async (x: Topic) => ({ artifacts: { ...x.artifacts, live: true }, done: true })))(t, save, fresh);
    },
    startVideo: async (t, record) => {
      const jobId = `job${++jobs}`;
      if (await record(jobId)) video.prepared.push(jobId); else video.abandoned.push(jobId);
    },
    pollVideo: async (_t, jobId) => video.polls.get(jobId) ?? { state: "running" },
    attachVideo: async (t, url, save) => {
      video.attached.push(t.id);
      if (video.attach) return video.attach(t, url, save);
      return { artifacts: { ...t.artifacts, video: { ...(t.artifacts.video as object), url, embedded_at: "now" } } };
    },
  };
  return { db, deps, made, published, video, zone, advance: (ms: number) => { clock += ms; } };
}

describe("tickTopics: seven-day return of an unapproved proposal", () => {
  it("an October proposal is returned once with a dated reason; the second round leaves it; a fresh one stays", async () => {
    const q = queue([topic("o", { status: "proposed", scheduled_for: "2026-10-19T17:00:00Z" }), topic("n", { status: "proposed", scheduled_for: "2026-10-30T01:00:00Z" })]);
    expect(await tickTopics(q.deps)).toContain("expired=1");
    expect(q.db.get("o")).toMatchObject({ status: "rejected", last_error: "排定日 2026-10-20 過了七天沒人核准，已退回；要做請改日期再核准" });
    expect(q.db.get("n")!.status).toBe("proposed");
    const v = q.db.get("o")!.version;
    expect(await tickTopics(q.deps)).toContain("expired=0");
    expect(q.db.get("o")!.version).toBe(v);
  });
});

describe("tickTopics: expiry backlog", () => {
  it("returns at most 10 per firing; the next firing takes the rest", async () => {
    const q = queue(Array.from({ length: 12 }, (_, i) => topic(`x${i}`, { status: "proposed", scheduled_for: "2026-10-01T00:00:00Z" })));
    expect(await tickTopics(q.deps)).toContain("expired=10");
    expect(await tickTopics(q.deps)).toContain("expired=2");
  });
});

describe("tickTopics", () => {
  it("starts what is due, makes it and moves it to reviewed with its artifacts and review", async () => {
    const q = queue([topic("a")]);
    expect(await tickTopics(q.deps)).toBe("interrupted=0 reviewed=1 started=1 drafted=0 failed=0 returned=0 published=0 scheduled=0 video_started=0 expired=0 publishing=0");
    expect(q.db.get("a")).toMatchObject({ status: "reviewed", artifacts: { wp_post_id: 1 }, review, started_on: "2026-11-03" });
  });

  it("starts at most the day's cap; the rest waits for the next day", async () => {
    const q = queue(["a", "b", "c"].map((id) => topic(id)));
    await tickTopics(q.deps);
    expect(q.made).toHaveLength(DAILY_START_CAP);
    await tickTopics(q.deps);
    expect(q.made).toHaveLength(DAILY_START_CAP);
    expect(q.db.get("c")?.status).toBe("approved");
  });

  it("the cap's day is the brand's: a Taipei brand's day turns at Taipei midnight, not UTC midnight (N4)", () => {
    expect(brandDay(new Date("2026-11-19T23:59:00Z"), "Asia/Taipei")).toBe("2026-11-20");   // Taipei 11/20 07:59
    expect(brandDay(new Date("2026-11-20T00:01:00Z"), "Asia/Taipei")).toBe("2026-11-20");   // Taipei 11/20 08:01
  });

  it("at the same instant a UTC brand is still on its own day (N4)", () => {
    expect(brandDay(new Date("2026-11-19T23:59:00Z"), "UTC")).toBe("2026-11-19");
    expect(brandDay(new Date("2026-11-19T23:59:00Z"), null)).toBe("2026-11-19");
  });

  it("rows started on a full UTC day do not block the brand's own next day (old data, N4)", async () => {
    const q = queue([topic("a", { status: "published", started_on: "2026-11-19" }), topic("b", { status: "published", started_on: "2026-11-19" }), topic("c")]);
    q.advance(Date.parse("2026-11-19T23:59:00Z") - NOW.getTime());   // UTC 11/19 is full; Taipei is already on 11/20
    q.zone.tz = "Asia/Taipei";
    await tickTopics(q.deps);
    expect(q.db.get("c")).toMatchObject({ status: "reviewed", started_on: "2026-11-20" });
  });

  it("a firing that crosses the brand's midnight counts a start on the day it happens, not the firing's first day", async () => {
    const full = { status: "published" as const, started_on: "2026-11-20" };
    const q = queue([topic("a", full), topic("b", full), topic("c")], undefined, async () => { q.advance(2_000); return null; });
    q.zone.tz = "Asia/Taipei";
    q.advance(Date.parse("2026-11-20T15:59:59Z") - NOW.getTime());   // Taipei 11/20 23:59:59, 11/20 already full
    await tickTopics(q.deps);   // the blocker check takes 2 s: c starts at Taipei 11/21 00:00:01
    expect(q.db.get("c")).toMatchObject({ status: "reviewed", started_on: "2026-11-21" });
  });

  it("leaves a topic whose day has not come", async () => {
    const q = queue([topic("a", { scheduled_for: "2026-11-05T00:00:00Z" })]);
    await tickTopics(q.deps);
    expect(q.db.get("a")?.status).toBe("approved");
  });

  it("a failed making fails that topic with its reason and the next one is still made", async () => {
    const q = queue([topic("a"), topic("b")], async (t) => { if (t.id === "a") throw new Error("文章生成失敗：x"); return { artifacts: {}, review }; });
    expect(await tickTopics(q.deps)).toContain("failed=1");
    expect(q.db.get("a")).toMatchObject({ status: "failed", last_error: "文章生成失敗：x" });
    expect(q.db.get("b")?.status).toBe("reviewed");
  });

  it("two firings at once never make the same topic twice", async () => {
    const q = queue([topic("a")]);
    await Promise.all([tickTopics(q.deps), tickTopics(q.deps)]);
    expect(q.made).toEqual(["a"]);
  });

  it("stops starting new topics once the time budget is spent", async () => {
    const q = queue([topic("a"), topic("b")], async () => { q.advance(150_000); return { artifacts: {}, review }; });
    await tickTopics(q.deps, { budgetMs: 100_000 });
    expect(q.made).toEqual(["a"]);
  });

  it("a generating topic is someone else's until it is old enough to be a lost one", async () => {
    const q = queue([topic("a", { status: "generating", updated_at: new Date(NOW.getTime() - 60_000).toISOString() })]);
    await tickTopics(q.deps);
    expect(q.db.get("a")?.status).toBe("generating");
    q.advance(STALE_GENERATING_MS);
    expect(await tickTopics(q.deps)).toContain("interrupted=1");
    expect(q.db.get("a")?.status).toBe("failed");
  });


  it("a drafted topic left by an earlier firing is reviewed by the next", async () => {
    const q = queue([topic("a", { status: "drafted", review })]);
    expect(await tickTopics(q.deps)).toContain("reviewed=1");
    expect(q.db.get("a")?.status).toBe("reviewed");
  });

  it("a failed making keeps the parts it made on the row, for the retry to reuse", async () => {
    const q = queue([topic("a")], async () => { throw new MakeError("社群改寫失敗", { article: { wp_post_id: 7 } }); });
    await tickTopics(q.deps);
    expect(q.db.get("a")).toMatchObject({ status: "failed", last_error: "社群改寫失敗", artifacts: { article: { wp_post_id: 7 } } });
  });

  it("a topic that cannot be made goes back to the person without using a daily slot", async () => {
    const q = queue([topic("gone"), topic("b"), topic("c")], undefined, async (t) => (t.id === "gone" ? "題目的網站不存在或已停用" : null));
    expect(await tickTopics(q.deps)).toContain("returned=1");
    expect(q.db.get("gone")).toMatchObject({ status: "proposed", last_error: "題目的網站不存在或已停用", started_on: null });
    expect(q.made).toEqual(["b", "c"]);
  });
});

// I5: a topic goes out without a person only when its review passed AND its site is set to auto publish.
describe("auto publish (I5)", () => {
  const failed: Made["review"] = { pass: false, checks: [{ name: "seo", pass: false, detail: "SEO 60 分" }], at: NOW.toISOString() };

  it("human review: a passed topic stays reviewed and nothing is published", async () => {
    const q = queue([topic("a")]);
    await tickTopics(q.deps);
    expect(q.db.get("a")?.status).toBe("reviewed");
    expect(q.published).toEqual([]);
  });

  it("auto publish but the review failed: stays reviewed, nothing is published", async () => {
    const q = queue([topic("a")], async () => ({ artifacts: { wp_post_id: 1 }, review: failed }), undefined, { auto: true });
    await tickTopics(q.deps);
    expect(q.db.get("a")?.status).toBe("reviewed");
    expect(q.published).toEqual([]);
  });

  it("auto publish and the review passed: published, with what went out on the row", async () => {
    const q = queue([topic("a")], undefined, undefined, { auto: true });
    expect(await tickTopics(q.deps)).toContain("published=1");
    expect(q.db.get("a")).toMatchObject({ status: "published", artifacts: { wp_post_id: 1, live: true } });
    expect(q.published).toEqual(["a"]);
  });

  it("a drafted topic from an earlier firing is published by the next when both hold", async () => {
    const q = queue([topic("a", { status: "drafted", review }), topic("b", { status: "drafted", review: failed })], undefined, undefined, { auto: true });
    await tickTopics(q.deps);
    expect(q.db.get("a")?.status).toBe("published");
    expect(q.db.get("b")?.status).toBe("reviewed");
  });

  it("a topic already sitting in reviewed is a person's: switching to auto does not publish it", async () => {
    const q = queue([topic("a", { status: "reviewed", review })], undefined, undefined, { auto: true });
    await tickTopics(q.deps);
    expect(q.db.get("a")?.status).toBe("reviewed");
    expect(q.published).toEqual([]);
  });

  it("a failed publish fails the topic and keeps what already went out", async () => {
    const q = queue([topic("a")], undefined, undefined, {
      auto: true, publish: async () => { throw new MakeError("社群排程失敗", { wp_post_id: 1, article: { published: { link: "https://x/p" } } }); },
    });
    expect(await tickTopics(q.deps)).toContain("failed=1");
    expect(q.db.get("a")).toMatchObject({ status: "failed", last_error: "社群排程失敗", artifacts: { article: { published: { link: "https://x/p" } } } });
  });

  it("a topic whose day is ahead waits as scheduled with nothing sent, and is published on its day", async () => {
    const at = new Date(NOW.getTime() + 3600_000).toISOString();
    const q = queue([topic("a", { status: "drafted", review, scheduled_for: at })], undefined, undefined, { auto: true });
    expect(await tickTopics(q.deps)).toContain("scheduled=1");
    expect(q.db.get("a")?.status).toBe("scheduled");
    expect(q.published).toEqual([]);
    await tickTopics(q.deps);
    expect(q.published).toEqual([]);
    q.advance(3600_000);
    expect(await tickTopics(q.deps)).toContain("published=1");
    expect(q.db.get("a")).toMatchObject({ status: "published", artifacts: { live: true } });
    expect(q.published).toEqual(["a"]);
  });

  it("a scheduled topic whose site went back to human review fails on its day with the drafts kept", async () => {
    const at = new Date(NOW.getTime() - 60_000).toISOString();
    const q = queue([topic("a", { status: "scheduled", review, scheduled_for: at, artifacts: { wp_post_id: 1 } })], undefined, undefined,
      { publish: async () => { throw new Error("網站已改成人工審核，沒有發布（草稿都在）"); } });
    await tickTopics(q.deps);
    expect(q.db.get("a")).toMatchObject({ status: "failed", artifacts: { wp_post_id: 1 }, last_error: expect.stringContaining("人工審核") });
  });

  it("a site setting that cannot be read fails the topic instead of leaving it silently manual", async () => {
    const q = queue([topic("a")], undefined, undefined, { auto: async () => { throw new Error("brand_voice:load:timeout"); } });
    expect(await tickTopics(q.deps)).toContain("failed=1");
    expect(q.db.get("a")).toMatchObject({ status: "failed", last_error: expect.stringContaining("讀不到網站的發布設定") });
    expect(q.published).toEqual([]);
  });

  it("a topic due in under a minute is not published early", async () => {
    const q = queue([topic("a", { status: "drafted", review, scheduled_for: new Date(NOW.getTime() + 30_000).toISOString() })], undefined, undefined, { auto: true });
    await tickTopics(q.deps);
    expect(q.db.get("a")?.status).toBe("scheduled");
    expect(q.published).toEqual([]);
  });

  it("two firings at once publish a scheduled topic once", async () => {
    const q = queue([topic("a", { status: "scheduled", review, scheduled_for: new Date(NOW.getTime() - 60_000).toISOString() })], undefined, undefined, { auto: true });
    await Promise.all([tickTopics(q.deps), tickTopics(q.deps)]);
    expect(q.published).toEqual(["a"]);
    expect(q.db.get("a")?.status).toBe("published");
  });
});

// P6: drafted -> waiting_video -> embedded, one push per firing; the browser need not stay open.
describe("video (P6)", () => {
  const withVideo = (id: string, over: Partial<Topic> = {}) => topic(id, { formats: ["article", "social", "video"], ...over });

  it("drafts first, the next firing starts the video, a later one attaches it when done and reviews the topic", async () => {
    const q = queue([withVideo("a")]);
    expect(await tickTopics(q.deps)).toContain("drafted=1");
    expect(await tickTopics(q.deps)).toContain("video_started=1");
    expect(q.db.get("a")).toMatchObject({ status: "waiting_video", artifacts: { wp_post_id: 1, video: { job_id: "job1" } } });
    await tickTopics(q.deps);
    expect(q.db.get("a")?.status).toBe("waiting_video");
    q.video.polls.set("job1", { state: "done", url: "https://cdn.example/v.mp4" });
    expect(await tickTopics(q.deps)).toContain("reviewed=1");
    expect(q.db.get("a")).toMatchObject({ status: "reviewed", artifacts: { video: { job_id: "job1", url: "https://cdn.example/v.mp4" } } });
    expect(q.video.attached).toEqual(["a"]);
  });

  it("two firings at once pay for one video; the other's job is closed empty", async () => {
    const q = queue([withVideo("a", { status: "drafted", review })]);
    await Promise.all([tickTopics(q.deps), tickTopics(q.deps)]);
    expect(q.video.prepared).toHaveLength(1);
    expect(q.video.abandoned).toHaveLength(1);
  });

  it("a failed render fails the topic and keeps its drafts", async () => {
    const q = queue([withVideo("a", { status: "waiting_video", review, artifacts: { wp_post_id: 1, video: { job_id: "j" } } })]);
    q.video.polls.set("j", { state: "error", error: "EU 500" });
    expect(await tickTopics(q.deps)).toContain("failed=1");
    expect(q.db.get("a")).toMatchObject({ status: "failed", last_error: "影片失敗：EU 500", artifacts: { wp_post_id: 1 } });
    expect(q.video.attached).toEqual([]);
  });

  it("a retry whose video had finished attaches it without making another; a failed attach keeps what was done", async () => {
    const url = "https://cdn.example/v.mp4";
    const q = queue([withVideo("a", { status: "drafted", review, artifacts: { video: { job_id: "j", url } } })]);
    q.video.attach = async (t) => { throw new MakeError("社群附影片失敗", { ...t.artifacts, video: { job_id: "j", url, embedded_at: "now" } }); };
    await tickTopics(q.deps);
    expect(q.video.prepared).toEqual([]);
    expect(q.db.get("a")).toMatchObject({ status: "failed", last_error: "社群附影片失敗", artifacts: { video: { url, embedded_at: "now" } } });
  });
  it("a check that could not look leaves the row for the next firing; a video waiting over an hour fails", async () => {
    const q = queue([withVideo("a", { status: "waiting_video", review, artifacts: { video: { job_id: "j" } } })]);
    q.deps.pollVideo = async () => { throw new Error("[job-store] read failed: timeout"); };
    await tickTopics(q.deps);
    expect(q.db.get("a")?.status).toBe("waiting_video");
    q.advance(VIDEO_TIMEOUT_MS);
    await tickTopics(q.deps);
    expect(q.db.get("a")).toMatchObject({ status: "failed", last_error: expect.stringContaining("超過一小時") });
  });
});

// N5a: YouTube first; the article only once YouTube's link is back; the other posts last. The real publishSteps runs
// against a fake Postiz / WordPress (nothing leaves the test).
describe("publish in steps (N5a)", () => {
  const LINK = "https://site.example/p";
  const YT = "https://youtu.be/abc";
  /** calls = every outside write / read in order; look = what the YouTube post answers. */
  function fake(q: ReturnType<typeof queue>) {
    const calls: string[] = [];
    const state = { look: { state: "waiting" } as YoutubeLook };
    const ports: PublishPorts = {
      now: () => q.deps.now(),
      sendPost: async (id, link, now) => { calls.push(`send:${id}${link ? `:${link}` : ""}`); return { state: "scheduled", scheduled_at: now.toISOString(), at: now.toISOString() }; },
      lookYoutube: async () => { calls.push("look"); return state.look; },
      publishArticle: async (id) => { calls.push(`article:${id}`); return { status: "publish", link: LINK }; },
    };
    q.deps.publish = (t, save, fresh) => publishSteps(t, ports, save, fresh);
    return { calls, state };
  }
  const split = { article: { wp_post_id: 7 }, social: { post_id: "p", youtube_post_id: "y" } };
  const due = (over: Partial<Topic> = {}) => topic("a", { status: "scheduled", review, formats: ["article", "social", "video"],
    scheduled_for: new Date(NOW.getTime() - 60_000).toISOString(), artifacts: split, ...over });

  it("order: YouTube is sent, the article waits for its link, then the article, then the other posts with the article's link", async () => {
    const q = queue([due()], undefined, undefined, { auto: true });
    const f = fake(q);
    expect(await tickTopics(q.deps)).toContain("publishing=1");
    expect(f.calls).toEqual(["send:y", "look"]);
    expect(q.db.get("a")).toMatchObject({ status: "publishing", artifacts: { publish: { youtube: { post_id: "y", sent_at: NOW.toISOString() } } } });
    f.state.look = { state: "live", url: YT };
    q.advance(5 * 60_000);
    expect(await tickTopics(q.deps)).toContain("published=1");
    expect(f.calls).toEqual(["send:y", "look", "look", "article:7", `send:p:${LINK}`]);
    expect(q.db.get("a")).toMatchObject({ status: "published", artifacts: { article: { published: { link: LINK } }, social: { sent: { state: "scheduled" } },
      publish: { youtube: { url: YT }, article: { url: LINK }, social: { post_id: "p", state: "scheduled" } } } });
  });

  it("YouTube not live: the article is not published and the other posts are not sent", async () => {
    const q = queue([due()], undefined, undefined, { auto: true });
    const f = fake(q);
    await tickTopics(q.deps);
    q.advance(30 * 60_000);
    await tickTopics(q.deps);
    expect(f.calls).toEqual(["send:y", "look", "look"]);
    expect(q.db.get("a")).toMatchObject({ status: "publishing" });
    expect((q.db.get("a")!.artifacts as typeof split & { article: { published?: unknown } }).article.published).toBeUndefined();
  });

  it("YouTube still not live an hour after it was sent: failed in Chinese, the article and the other posts still drafts", async () => {
    const q = queue([due()], undefined, undefined, { auto: true });
    const f = fake(q);
    await tickTopics(q.deps);
    q.advance(YOUTUBE_LIVE_TIMEOUT_MS);
    expect(await tickTopics(q.deps)).toContain("failed=1");
    expect(q.db.get("a")).toMatchObject({ status: "failed", last_error: YOUTUBE_TIMEOUT_TEXT, artifacts: { publish: { youtube: { post_id: "y" } } } });
    expect(f.calls.filter((c) => c !== "look")).toEqual(["send:y"]);
  });

  it("YouTube refused by Postiz: failed at once, nothing else sent", async () => {
    const q = queue([due()], undefined, undefined, { auto: true });
    const f = fake(q);
    f.state.look = { state: "error", error: "YouTube 頻道需要重新授權" };
    expect(await tickTopics(q.deps)).toContain("failed=1");
    expect(q.db.get("a")?.last_error).toContain("YouTube 發布失敗");
    expect(f.calls).toEqual(["send:y", "look"]);
  });

  it("restart: a step already recorded is not done again", async () => {
    const at = new Date(NOW.getTime() - 10 * 60_000).toISOString();
    const q = queue([topic("a", { status: "publishing", review, formats: ["article", "social", "video"], artifacts: {
      article: { wp_post_id: 7, published: { status: "publish", link: LINK, at } }, social: { post_id: "p", youtube_post_id: "y" },
      publish: { youtube: { post_id: "y", started_at: at, sent_at: at, since: at, url: YT }, article: { started_at: at, sent_at: at, url: LINK } },
    } })], undefined, undefined, { auto: true });
    const f = fake(q);
    expect(await tickTopics(q.deps)).toContain("published=1");
    expect(f.calls).toEqual([`send:p:${LINK}`]);
  });

  it("a step another run started a moment ago is left to it; one older than the lease (that run died) is done", async () => {
    const at = new Date(NOW.getTime() - 2 * 60_000).toISOString();
    const q = queue([topic("a", { status: "publishing", review, formats: ["article", "social"], artifacts: {
      article: { wp_post_id: 7 }, social: { post_id: "p" }, publish: { article: { started_at: at } } } })], undefined, undefined, { auto: true });
    const f = fake(q);
    expect(await tickTopics(q.deps)).toContain("publishing=1");
    expect(f.calls).toEqual([]);
    q.advance(STEP_LEASE_MS);
    expect(await tickTopics(q.deps)).toContain("published=1");
    expect(f.calls).toEqual(["article:7", `send:p:${LINK}`]);
  });

  it("old data: a topic made before the split (one social draft) goes out as before -- article, then that draft", async () => {
    const q = queue([topic("a", { status: "drafted", review, artifacts: { article: { wp_post_id: 7 }, social: { post_id: "p" } } })], undefined, undefined, { auto: true });
    const f = fake(q);
    expect(await tickTopics(q.deps)).toContain("published=1");
    expect(f.calls).toEqual(["article:7", `send:p:${LINK}`]);
    expect(q.db.get("a")?.status).toBe("published");
  });
});

// K31: the brand's content_pipeline schedule is off. A topic a person started runs to the end; nothing else moves.
describe("advanceStartedTopics: schedule off (K31)", () => {
  const withVideo = (id: string, over: Partial<Topic> = {}) => topic(id, { formats: ["article", "social", "video"], ...over });

  it("a person-started video topic: video started, attached, reviewed; the pressed 發布 goes on until YouTube's link is back", async () => {
    let youtubeLive = false;
    const q = queue([withVideo("a", { status: "drafted", review, artifacts: { wp_post_id: 1 } })], undefined, undefined,
      { auto: true, publish: async (t) => ({ artifacts: { ...t.artifacts, youtube: youtubeLive }, done: youtubeLive }) });
    expect(await advanceStartedTopics(q.deps)).toContain("video_started=1");
    expect(q.db.get("a")).toMatchObject({ status: "waiting_video", artifacts: { video: { job_id: "job1" } } });
    q.video.polls.set("job1", { state: "done", url: "https://cdn.example/v.mp4" });
    await advanceStartedTopics(q.deps);
    // the site is set to auto publish, but without the schedule only a person's press sends it
    expect(q.db.get("a")?.status).toBe("reviewed");
    expect(q.published).toEqual([]);
    expect(await requestPublish(q.deps, q.db.get("a")!, "staff:u1")).toMatchObject({ status: "publishing" });
    expect(await advanceStartedTopics(q.deps)).toContain("publishing=1");   // YouTube sent, its link not back yet
    youtubeLive = true;
    expect(await advanceStartedTopics(q.deps)).toContain("published=1");
    expect(q.db.get("a")?.status).toBe("published");
  });

  it("nothing the schedule alone does: an approved topic is not started, a stale proposal not returned, a reviewed or scheduled one not published", async () => {
    const q = queue([
      topic("due"),
      topic("old", { status: "proposed", scheduled_for: "2026-10-19T17:00:00Z" }),
      topic("rev", { status: "reviewed", review }),
      topic("sch", { status: "scheduled", review, scheduled_for: "2026-11-01T00:00:00Z" }),
    ], undefined, undefined, { auto: true });
    await advanceStartedTopics(q.deps);
    expect([...q.db.values()].map((t) => [t.id, t.status])).toEqual([["due", "approved"], ["old", "proposed"], ["rev", "reviewed"], ["sch", "scheduled"]]);
    expect(q.made).toEqual([]);
    expect(q.published).toEqual([]);
  });
});
