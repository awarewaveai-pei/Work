// content_pipeline: the sweep starts at most the client's own daily limit (0125), or the default when none is set.
import { beforeEach, describe, expect, it, vi } from "vitest";

const tickTopics = vi.hoisted(() => vi.fn(async () => "started=0"));
const collectTrendsIfDue = vi.hoisted(() => vi.fn(async () => [] as string[]));
const sites = vi.hoisted(() => ({ rows: [] as unknown[] }));
// wp_sites read: select().eq().eq() -> { data, error }
const sb = vi.hoisted(() => ({ from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: sites.rows, error: null }) }) }) }) }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => sb }));
vi.mock("@/lib/content/topics/collect-trends", () => ({ collectTrendsIfDue }));
vi.mock("@/lib/collect/run", () => ({ runCollection: vi.fn() }));
vi.mock("@/lib/collect/blocks", () => ({}));
vi.mock("@/lib/content/topics/tick", async (orig) => ({ ...(await orig<typeof import("@/lib/content/topics/tick")>()), tickTopics }));
vi.mock("@/lib/content/topics/make", () => ({ topicDeps: () => ({}) }));

const { clientJob } = await import("@/lib/schedules/jobs");
const { DAILY_START_CAP } = await import("@/lib/content/topics/tick");
const job = clientJob("content_pipeline")!;

beforeEach(() => { tickTopics.mockClear(); collectTrendsIfDue.mockClear(); sites.rows = []; });

describe("content_pipeline job", () => {
  it("passes the client's stored limit to the tick, and the default when the row sets none", async () => {
    await job.run("o", "rk", { dailyLimit: 5 } as never);
    expect(tickTopics).toHaveBeenLastCalledWith({}, { cap: 5 });
    await job.run("o", "rk", { dailyLimit: null } as never);
    expect(tickTopics).toHaveBeenLastCalledWith({}, { cap: DAILY_START_CAP });
  });

  it("collects trends for the geos of the client's active sites, skipping a market with no trending source", async () => {
    sites.rows = [{ id: "a", content_defaults: { targetCountry: "台灣" } }, { id: "b", content_defaults: { targetCountry: "德國" } }, { id: "c", content_defaults: null }];
    await job.run("o", "rk", { dailyLimit: 2 } as never);
    expect(collectTrendsIfDue).toHaveBeenCalledWith(sb, ["TW"]);
  });
});
