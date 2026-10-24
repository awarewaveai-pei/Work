// content_pipeline: the sweep starts at most the client's own daily limit (0125), or the default when none is set.
import { beforeEach, describe, expect, it, vi } from "vitest";

const tickTopics = vi.hoisted(() => vi.fn(async () => "started=0"));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({}) }));
vi.mock("@/lib/collect/run", () => ({ runCollection: vi.fn() }));
vi.mock("@/lib/collect/blocks", () => ({}));
vi.mock("@/lib/content/topics/tick", async (orig) => ({ ...(await orig<typeof import("@/lib/content/topics/tick")>()), tickTopics }));
vi.mock("@/lib/content/topics/make", () => ({ topicDeps: () => ({}) }));

const { clientJob } = await import("@/lib/schedules/jobs");
const { DAILY_START_CAP } = await import("@/lib/content/topics/tick");
const job = clientJob("content_pipeline")!;

beforeEach(() => tickTopics.mockClear());

describe("content_pipeline job", () => {
  it("passes the client's stored limit to the tick, and the default when the row sets none", async () => {
    await job.run("o", "rk", { dailyLimit: 5 } as never);
    expect(tickTopics).toHaveBeenLastCalledWith({}, { cap: 5 });
    await job.run("o", "rk", { dailyLimit: null } as never);
    expect(tickTopics).toHaveBeenLastCalledWith({}, { cap: DAILY_START_CAP });
  });
});
