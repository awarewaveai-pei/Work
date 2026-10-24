// tickTopics against an in-memory queue that keeps the database's rules: every move guarded by status and version, and
// the start under the per-day cap (0121 content_topics_start).
import { describe, expect, it } from "vitest";
import { NEXT, type Topic, type TopicStatus } from "../store";
import { DAILY_START_CAP, MakeError, STALE_GENERATING_MS, tickTopics, type Made, type Published, type TickDeps } from "../tick";

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
interface Pub { auto?: boolean | (() => Promise<boolean>); publish?: (t: Topic) => Promise<Published> }

function queue(rows: Topic[], make: (t: Topic) => Promise<Made> = async () => ({ artifacts: { wp_post_id: 1 }, review }),
  blocker = async (_t: Topic): Promise<string | null> => null, pub: Pub = {}) {
  const db = new Map(rows.map((r) => [r.id, { ...r }]));
  let clock = NOW.getTime();
  const made: string[] = [];
  const published: string[] = [];
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
    start: async (t, day, cap) => {
      if ([...db.values()].filter((r) => r.started_on === day).length >= cap) return null;
      return write(t, "generating", { started_on: day, last_error: null });
    },
    claim: async (t) => write(t, t.status),
    move: async (t, to, patch) => {
      if (!NEXT[t.status].includes(to)) throw new Error(`${t.status} -> ${to}`);
      return write(t, to, patch);
    },
    make: async (t) => { made.push(t.id); return make(t); },
    autoPublishes: async () => (typeof pub.auto === "function" ? pub.auto() : pub.auto === true),
    publish: async (t) => { published.push(t.id); return (pub.publish ?? (async () => ({ artifacts: { ...t.artifacts, live: true } })))(t); },
  };
  return { db, deps, made, published, advance: (ms: number) => { clock += ms; } };
}

describe("tickTopics", () => {
  it("starts what is due, makes it and moves it to reviewed with its artifacts and review", async () => {
    const q = queue([topic("a")]);
    expect(await tickTopics(q.deps)).toBe("interrupted=0 reviewed=1 started=1 drafted=0 failed=0 returned=0 published=0 scheduled=0");
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

  it("a topic with video stays drafted for the video phase; a video-only topic is not started", async () => {
    const q = queue([topic("a", { formats: ["article", "video"] }), topic("v", { formats: ["video"] })]);
    expect(await tickTopics(q.deps)).toContain("drafted=1");
    expect(q.db.get("a")?.status).toBe("drafted");
    expect(q.db.get("v")?.status).toBe("approved");
    await tickTopics(q.deps);
    expect(q.db.get("a")?.status).toBe("drafted");
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
