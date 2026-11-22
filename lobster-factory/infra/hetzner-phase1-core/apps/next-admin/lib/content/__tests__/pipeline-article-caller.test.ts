// K7: the scheduled article's caller info (lane, subscription budget) rides under a symbol key that no request body can
// carry. This checks the real pipeline and the real article block hand it on to generate-core: a future ctx copy that
// drops symbol keys (JSON, structuredClone) would silently move the schedule to the owner lane.
import { describe, expect, it, vi } from "vitest";

const seen = vi.hoisted(() => ({ body: null as Record<PropertyKey, unknown> | null }));
vi.mock("@/lib/content/article/generate-core", async (orig) => ({
  ...(await orig<typeof import("@/lib/content/article/generate-core")>()),
  generateArticleMarkdown: async (body: Record<PropertyKey, unknown>) => { seen.body = body; return { ok: true, markdown: "# x" }; },
}));

import { runContentPipeline } from "@/lib/content/pipeline";
import { ARTICLE_CALLER } from "@/lib/content/article/generate-core";

describe("pipeline article stage", () => {
  it("hands the ARTICLE_CALLER symbol through to generate-core", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const caller = { lane: "schedule", subBudgetMs: 1000 };
    const r = await runContentPipeline({ keyword: "k", [ARTICLE_CALLER]: caller }, { stages: ["article"] });
    expect(r.ok).toBe(true);
    expect(seen.body?.[ARTICLE_CALLER]).toEqual(caller);
  });
});
