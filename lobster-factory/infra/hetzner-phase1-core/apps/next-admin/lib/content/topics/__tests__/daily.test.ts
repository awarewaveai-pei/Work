// N8 daily trend topics: D1 off unless exactly true (old data), D2 claim the brand day before the paid call, score >= 70,
// at most 3, D4 ai_pick approves / human_pick waits, D5 the 90-day filter. All deps are fakes: no DB, no model.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/entitlements/grant", () => ({ grantFor: vi.fn(async () => ({ granted: true })), runForOrg: async (_o: string, _a: string, fn: () => unknown) => fn() }));

const store = vi.hoisted(() => ({ recent: vi.fn(), list: vi.fn() }));
vi.mock("../store", async (orig) => ({ ...(await orig<typeof import("../store")>()), recentTopics: store.recent, listTopics: store.list }));

import { dailyDeps, dailyIfDue, parseScores, type DailyCandidate, type DailyDeps, type DailyPick } from "../daily";

const NOW = new Date("2026-11-19T02:00:00Z");
const C = (title: string): DailyCandidate => ({ title, source: "google" });
const pick = (title: string, score: number, keyword = title): DailyPick => ({ candidate: C(title), score, reason: "r", title, keyword, angle: null });

type Fakes = { [K in keyof DailyDeps]: ReturnType<typeof vi.fn> } & DailyDeps;
function deps(over: Partial<DailyDeps> = {}): Fakes {
  const claimed = new Set<string>();
  return {
    sites: vi.fn(async () => [{ id: "s1", defaults: { dailyTrendTopics: true } }]),
    timeZone: vi.fn(async () => "Asia/Taipei"),
    canPlan: vi.fn(async () => true),
    // the DB's conditional update: the first claim of a site's day wins, every later one gets no row
    claimDay: vi.fn(async (site: string, day: string) => (claimed.has(`${site}|${day}`) ? false : (claimed.add(`${site}|${day}`), true))),
    candidates: vi.fn(async () => [C("a"), C("b"), C("c"), C("d"), C("e")]),
    covered: vi.fn(async () => new Set<string>()),
    score: vi.fn(async () => [pick("a", 95), pick("b", 80), pick("c", 75), pick("d", 72), pick("e", 40)]),
    propose: vi.fn(async (_s: string, rows: unknown[]) => rows.map((r, i) => ({ ...(r as object), id: `t${i}`, organization_id: "o", status: "proposed", version: 1 }))),
    approve: vi.fn(async (t) => t),
    ...over,
  } as never;
}
const proposed = (d: Fakes) => (d.propose.mock.calls[0]?.[1] ?? []) as Array<{ title: string; source_ref: Record<string, unknown>; scheduled_for: string }>;

describe("dailyIfDue", () => {
  it("1. two firings the same brand day propose once; the claim comes before the paid call (D2)", async () => {
    const d = deps();
    expect(await dailyIfDue(d, NOW)).toBe("daily site=s1 day=2026-11-19 candidates=5 topics=3 approved=0");
    expect(await dailyIfDue(d, new Date("2026-11-19T15:00:00Z"))).toBeNull();   // 23:00 Taipei, same day
    expect(d.score).toHaveBeenCalledTimes(1);
    expect(d.propose).toHaveBeenCalledTimes(1);
    expect(d.claimDay.mock.invocationCallOrder[0]).toBeLessThan(d.score.mock.invocationCallOrder[0]);
    expect(await dailyIfDue(d, new Date("2026-11-19T16:30:00Z"))).toMatch(/^daily site=s1 day=2026-11-20 /);   // 00:30 Taipei next day
  });

  it("2. a score under 70 is not proposed; at most 3, best first", async () => {
    const d = deps();
    await dailyIfDue(d, NOW);
    expect(proposed(d).map((r) => r.title)).toEqual(["a", "b", "c"]);
    expect(proposed(d)[0].source_ref).toEqual({ text: "a", trend_source: "google", score: 95, reason: "r", daily_on: "2026-11-19" });
    expect(proposed(d)[0].scheduled_for).toBe(NOW.toISOString());
    const low = deps({ score: vi.fn(async () => [pick("a", 69), pick("b", 10)]) });
    expect(await dailyIfDue(low, NOW)).toBe("daily site=s1 day=2026-11-19 candidates=5 topics=0 approved=0");
    expect(proposed(low)).toEqual([]);
  });

  it("3. ai_pick approves what it proposed; human_pick and publishMode leave it waiting (D4)", async () => {
    const ai = deps({ sites: vi.fn(async () => [{ id: "s1", defaults: { dailyTrendTopics: true, topicMode: "ai_pick" as const } }]) });
    expect(await dailyIfDue(ai, NOW)).toMatch(/approved=3$/);
    for (const extra of [{ topicMode: "human_pick" as const }, { publishMode: "ai_review_auto" as const }]) {
      const h = deps({ sites: vi.fn(async () => [{ id: "s1", defaults: { dailyTrendTopics: true, ...extra } }]) });
      expect(await dailyIfDue(h, NOW)).toMatch(/approved=0$/);
      expect(h.approve).not.toHaveBeenCalled();
    }
  });

  it("4. covered in the last 90 days: not sent to be scored, and an answer repeating one is dropped (D5)", async () => {
    const d = deps({ covered: vi.fn(async () => new Set(["a", "b-kw"])), score: vi.fn(async () => [pick("b", 99, "B-KW"), pick("c", 90), pick("d", 88)]) });
    await dailyIfDue(d, NOW);
    expect((d.score.mock.calls[0][1] as DailyCandidate[]).map((c) => c.title)).toEqual(["b", "c", "d", "e"]);
    expect(proposed(d).map((r) => r.title)).toEqual(["c", "d"]);
    const all = deps({ covered: vi.fn(async () => new Set(["a", "b", "c", "d", "e"])) });
    expect(await dailyIfDue(all, NOW)).toBe("daily site=s1 day=2026-11-19 candidates=0 topics=0");
    expect(all.score).not.toHaveBeenCalled();
  });

  it("5. old data: a site without the switch (or not exactly true) is never claimed, scored or proposed (D1)", async () => {
    for (const defaults of [{}, { dailyTrendTopics: false }, { dailyTrendTopics: "true" as never }, { topicMode: "ai_pick" as const }]) {
      const d = deps({ sites: vi.fn(async () => [{ id: "s1", defaults }]) });
      expect(await dailyIfDue(d, NOW)).toBeNull();
      for (const k of ["canPlan", "timeZone", "claimDay", "candidates", "covered", "score", "propose", "approve"] as const) expect(d[k]).not.toHaveBeenCalled();
    }
  });
});

describe("dailyDeps.covered", () => {
  it("counts another site's keyword of this month (unique per organization+month+keyword), so it is never scored and dropped (Codex 2026-11-19)", async () => {
    store.recent.mockResolvedValueOnce([{ title: "Own Title", keyword: "own" }]);
    store.list.mockResolvedValueOnce([{ keyword: "Other Site KW" }]);
    const covered = await dailyDeps({} as never, "o", "a").covered("s1", "2026-11-01");
    expect(store.list).toHaveBeenCalledWith({}, "o", "2026-11-01");
    expect([...covered].sort()).toEqual(["other site kw", "own", "own title"]);
  });
});

describe("parseScores", () => {
  it("keeps known indexes once, clamps the score, and scores 0 a pick missing its title or keyword", () => {
    const cands = [C("x"), C("y"), C("z")];
    const out = parseScores('ok {"scores":[{"i":1,"score":120,"title":"T","keyword":"k"},{"i":1,"score":99,"title":"T2","keyword":"k2"},{"i":2,"score":90,"title":"","keyword":"k"},{"i":9,"score":90}]}', cands);
    expect(out.map((p) => [p.candidate.title, p.score])).toEqual([["x", 100], ["y", 0]]);
    expect(() => parseScores("no json", cands)).toThrow("content_daily:unreadable_answer");
  });
});
