// content_pipeline: the sweep starts at most the client's own daily limit (0125), or the default when none is set.
import { beforeEach, describe, expect, it, vi } from "vitest";

const tickTopics = vi.hoisted(() => vi.fn(async () => "started=0"));
const collectTrendsIfDue = vi.hoisted(() => vi.fn(async () => [] as string[]));
const planIfDue = vi.hoisted(() => vi.fn(async () => null as string | null));
const sites = vi.hoisted(() => ({ rows: [] as unknown[] }));
// wp_sites read: select().eq().eq() -> { data, error }
const sb = vi.hoisted(() => ({ from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: sites.rows, error: null }) }) }) }) }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => sb }));
vi.mock("@/lib/content/topics/collect-trends", () => ({ collectTrendsIfDue }));
vi.mock("@/lib/content/topics/plan-due", () => ({ planIfDue, planDueDeps: () => ({}) }));
vi.mock("@/lib/collect/run", () => ({ runCollection: vi.fn() }));
vi.mock("@/lib/collect/blocks", () => ({}));
vi.mock("@/lib/content/topics/tick", async (orig) => ({ ...(await orig<typeof import("@/lib/content/topics/tick")>()), tickTopics }));
vi.mock("@/lib/content/topics/make", () => ({ topicDeps: () => ({}) }));

const { clientJob } = await import("@/lib/schedules/jobs");
const { DAILY_START_CAP } = await import("@/lib/content/topics/tick");
const job = clientJob("content_pipeline")!;

beforeEach(() => { tickTopics.mockClear(); collectTrendsIfDue.mockClear(); planIfDue.mockClear(); planIfDue.mockResolvedValue(null); sites.rows = []; });

describe("content_pipeline job", () => {
  it("passes the client's stored limit to the tick, and the default when the row sets none", async () => {
    await job.run("o", "rk", { dailyLimit: 5 } as never);
    expect(tickTopics).toHaveBeenLastCalledWith({}, { cap: 5 });
    await job.run("o", "rk", { dailyLimit: null } as never);
    expect(tickTopics).toHaveBeenLastCalledWith({}, { cap: DAILY_START_CAP });
  });

  it("collects trends for the geos of the client's active sites, skipping a market with no trending source", async () => {
    sites.rows = [{ id: "a", content_defaults: { targetCountry: "台灣" } }, { id: "b", content_defaults: { targetCountry: "德國" } }];
    await job.run("o", "rk", { dailyLimit: 2 } as never);
    expect(collectTrendsIfDue).toHaveBeenCalledWith(sb, ["TW"]);
    sites.rows = [{ id: "c", content_defaults: null }];
    await job.run("o", "rk", { dailyLimit: 2 } as never);
    expect(collectTrendsIfDue).toHaveBeenLastCalledWith(sb, ["TW", "HK", "SG", "US", "GB", "JP", "AU"]);
  });

  it("a firing that planned a site's month does not tick (B3); one with nothing to plan ticks", async () => {
    planIfDue.mockResolvedValueOnce("planned site=s1 month=2026-11-01 topics=28 approved=0");
    expect(await job.run("o", "rk", { dailyLimit: 2 } as never)).toBe("planned site=s1 month=2026-11-01 topics=28 approved=0");
    expect(tickTopics).not.toHaveBeenCalled();
    expect(await job.run("o", "rk", { dailyLimit: 2 } as never)).toBe("started=0");
    expect(tickTopics).toHaveBeenCalledTimes(1);
  });

  it("a failed plan fails the firing without ticking", async () => {
    planIfDue.mockRejectedValueOnce(new Error("content_plan:unreadable_answer"));
    await expect(job.run("o", "rk", { dailyLimit: 2 } as never)).rejects.toThrow("unreadable_answer");
    expect(tickTopics).not.toHaveBeenCalled();
  });

  it("the cell's cost text names the monthly plan price (B6)", () => {
    expect(job.cost).toMatch(/每個網站每月第一次提案另約 [\d.]+ 美元/);
  });

  it("a trends failure still ticks, then reports both the tick summary and the failure", async () => {
    collectTrendsIfDue.mockRejectedValueOnce(new Error("content_trends:due:boom"));
    await expect(job.run("o", "rk", { dailyLimit: 2 } as never)).rejects.toThrow("started=0; content_pipeline:trends:content_trends:due:boom");
    expect(tickTopics).toHaveBeenCalledTimes(1);
  });
});
