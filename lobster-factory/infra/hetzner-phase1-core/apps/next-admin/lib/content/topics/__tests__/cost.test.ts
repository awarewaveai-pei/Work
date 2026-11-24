// N3: the price shown for one topic. It counts the article's images (the same constant make.ts uses), and once a brand has
// 5 finished topics with a ledger spend after the N2 switch-over, the 30-day median replaces the price list (named on the page).
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { featureUnitCostUsd, usdToNtd } from "@/lib/ai/cost-calculator";
import { DEFAULT_IMAGE_MODEL, IMAGE_RATES, TEXT_FEATURES } from "@/lib/ai/cost-model";
import { ACTUAL_FIRST_DAY, medianOf, recentTopicActual } from "../actual-cost";
import { TOPIC_BUDGET_EPOCH } from "../budget";
import { ACTUAL_MIN_TOPICS, TOPIC_ARTICLE_IMAGES, TOPIC_COVER_IMAGES, costBasisNote, topicCostUsd, topicShownTwd } from "../cost";
import { TOPIC_ARTICLE_IMAGES as MAKE_IMAGES } from "../make";

type Row = Record<string, unknown>;
/** A tiny PostgREST stand-in: select/eq/in/gte filter the rows, order/limit/range page them; awaiting the chain returns the rows. */
function fakeSb(tables: Record<string, Row[]>): SupabaseClient {
  return {
    from(name: string) {
      let rows = [...(tables[name] ?? [])];
      const done = () => Promise.resolve({ data: rows, error: null });
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q; },
        in: (c: string, v: unknown[]) => { rows = rows.filter((r) => v.includes(r[c])); return q; },
        gte: (c: string, v: string) => { rows = rows.filter((r) => String(r[c]) >= v); return q; },
        order: () => q,
        limit: (n: number) => { rows = rows.slice(0, n); return q; },
        range: (a: number, b: number) => { rows = rows.slice(a, b + 1); return done(); },
        then: (res: (v: unknown) => unknown) => done().then(res),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

const NOW = new Date("2026-12-01T00:00:00.000Z");
const AFTER = "2026-11-25T01:00:00.000Z";
const STATUSES = ["published", "reviewed", "scheduled"];   // all three are "made"; scheduled waits for its publish day
const topic = (i: number, day: string, formats = ["article", "social"]) => ({ id: `t${i}`, organization_id: "org", status: STATUSES[i % 3], started_on: day, formats });
const logs = (spentUsd: number[], at: string) => spentUsd.map((usd, i) => ({ id: i + 1, job_id: `t${i}`, cost_usd: usd, created_at: at }));

describe("topic price counts the article's images", () => {
  it("the article price = the article feature + TOPIC_ARTICLE_IMAGES body images + the cover, and the constant is the one make.ts writes", () => {
    const f = TEXT_FEATURES.find((x) => x.key === "article")!;
    const images = TOPIC_ARTICLE_IMAGES + TOPIC_COVER_IMAGES;
    const expected = Math.ceil((featureUnitCostUsd(f) + images * IMAGE_RATES[DEFAULT_IMAGE_MODEL].usd) * 100) / 100;
    expect(topicCostUsd(["article"]).usual).toBe(expected);
    // K10: on the site's image model (an unusable one = the default)
    const onMax = Math.ceil((featureUnitCostUsd(f) + images * IMAGE_RATES["flux-2-max"].usd) * 100) / 100;
    expect(topicCostUsd(["article"], { imageModel: "flux-2-max" }).usual).toBe(onMax);
    expect(topicCostUsd(["article"], { imageModel: "codex-image" }).usual).toBe(expected);
    expect(topicCostUsd(["article"]).usual).toBeGreaterThan(Math.ceil(featureUnitCostUsd(f) * 100) / 100);
    expect(MAKE_IMAGES).toBe(TOPIC_ARTICLE_IMAGES);
  });
});

describe("shown price: 30-day median once 5 finished topics have a spend, else the price list", () => {
  it("5 finished topics after the switch-over -> the median, in NT$, named as real spend", async () => {
    const sb = fakeSb({
      content_topics: [0, 1, 2, 3, 4].map((i) => topic(i, "2026-11-25")),
      ai_call_logs: logs([0.2, 0.3, 0.32, 0.4, 0.9], AFTER),   // median 0.32 USD
    });
    const actual = await recentTopicActual(sb, "org", NOW);
    expect(actual).toEqual({ "article+social": { twd: usdToNtd(0.32), n: 5 } });
    const shown = topicShownTwd(["social", "article"], actual);
    expect(shown).toMatchObject({ basis: "actual", n: 5 });
    expect(shown.usual).toBe(Math.ceil(usdToNtd(0.32) * 10) / 10);
    expect(shown.max).toBeGreaterThanOrEqual(shown.usual);
    expect(costBasisNote(shown.basis, shown.n)).toBe("近 30 天 5 題實際花費的中位數");
  });

  it("fewer than 5 finished topics -> the price list, named as such", async () => {
    const sb = fakeSb({ content_topics: [0, 1, 2, 3].map((i) => topic(i, "2026-11-25")), ai_call_logs: logs([0.3, 0.3, 0.3, 0.3], AFTER) });
    const actual = await recentTopicActual(sb, "org", NOW);
    expect(actual).toEqual({});
    const shown = topicShownTwd(["article", "social"], actual);
    expect(shown.basis).toBe("list");
    expect(shown.usual).toBeGreaterThan(0);
    expect(costBasisNote(shown.basis, shown.n)).toBe("價目表估價");
    expect(ACTUAL_MIN_TOPICS).toBe(5);
  });

  it("old data: topics started before the N2 ledger (and ledger rows before its epoch) are not counted -> the price list", async () => {
    const old = [0, 1, 2, 3, 4, 5].map((i) => topic(i, "2026-11-10"));
    const sb1 = fakeSb({ content_topics: old, ai_call_logs: logs([0.3, 0.3, 0.3, 0.3, 0.3, 0.3], "2026-11-10T01:00:00.000Z") });
    expect(await recentTopicActual(sb1, "org", NOW)).toEqual({});
    // started after the switch-over, but every ledger row is older than the epoch: no spend to take a median of
    const sb2 = fakeSb({ content_topics: [0, 1, 2, 3, 4].map((i) => topic(i, "2026-11-25")), ai_call_logs: logs([0.3, 0.3, 0.3, 0.3, 0.3], "2026-11-18T01:00:00.000Z") });
    expect(await recentTopicActual(sb2, "org", NOW)).toEqual({});
    expect(ACTUAL_FIRST_DAY).toBe("2026-11-20");
    expect(Date.parse(`${ACTUAL_FIRST_DAY}T00:00:00Z`)).toBeGreaterThan(Date.parse(TOPIC_BUDGET_EPOCH));
  });

  it("each formats combination has its own median: five video topics do not price an article-only topic", async () => {
    const sb = fakeSb({
      content_topics: [0, 1, 2, 3, 4].map((i) => topic(i, "2026-11-25", ["article", "social", "video"])),
      ai_call_logs: logs([0.6, 0.6, 0.6, 0.6, 0.6], AFTER),
    });
    const actual = await recentTopicActual(sb, "org", NOW);
    expect(topicShownTwd(["article", "social", "video"], actual)).toMatchObject({ basis: "actual", n: 5 });
    expect(topicShownTwd(["article"], actual).basis).toBe("list");
    expect(topicShownTwd(undefined, actual).basis).toBe("list");   // the default article + social is another combination
  });

  it("a failed read never blocks: null, and the page falls back to the price list", async () => {
    const broken = { from: () => { throw new Error("db down"); } } as unknown as SupabaseClient;
    expect(await recentTopicActual(broken, "org", NOW)).toEqual({});
  });

  it("median of an even and an odd count", () => {
    expect(medianOf([3, 1, 2])).toBe(2);
    expect(medianOf([4, 1, 2, 3])).toBe(2.5);
  });
});
