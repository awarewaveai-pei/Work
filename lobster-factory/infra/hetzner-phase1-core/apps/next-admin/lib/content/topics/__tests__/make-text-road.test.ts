// K7: a site's text road carried into the scheduled article. Old content_defaults = the input as before (no chain, no
// model); a road with a subscription runs on the SCHEDULE lane (the real bridge here; runSubJob only counted, or answered
// where a test says so), only for the operator's own organization, and a segment the host cannot run is skipped to the
// API, whose cost then replaces the topic's reservation. What goes on to WordPress never carries the cost lines.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  defaults: {} as Record<string, unknown>, articles: [] as string[], published: [] as string[], apiCalls: 0,
  subJobs: 0, subAnswer: null as null | { ok: true; text: string }, orgKind: "internal" as "internal" | "customer",
  orgMeta: null as unknown,
}));
vi.mock("@/lib/entitlements/grant", () => ({ runForOrg: (_o: string, _a: string, fn: () => unknown) => fn(), grantFor: async () => ({ actor: "staff:x" }) }));
vi.mock("@/lib/entitlements/subject", async (orig) => ({
  ...(await orig<typeof import("@/lib/entitlements/subject")>()),
  resolveSubject: async (h: { orgId?: string }) => ({ orgId: h.orgId, kind: m.orgKind }),
}));
vi.mock("@/lib/tarot/codex-bridge", async (orig) => {
  const real = await orig<typeof import("@/lib/tarot/codex-bridge")>();
  return { ...real, runSubJob: (...a: Parameters<typeof real.runSubJob>) => { m.subJobs++; return m.subAnswer ? Promise.resolve(m.subAnswer) : real.runSubJob(...a); } };
});
// organizations.metadata as text-road-guard reads it (the owner's mark on a client organization)
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({ from: () => ({ select: () => ({ eq: () => ({
  maybeSingle: async () => ({ data: { metadata: m.orgMeta }, error: null }) }) }) }) }) }));
vi.mock("@/lib/content/brand-voice-store", () => ({ loadSiteBrand: async () => ({ organizationId: "org1", defaults: m.defaults }) }));
vi.mock("@/lib/storage/r2", () => ({ isR2Configured: () => false }));
vi.mock("@/lib/ai/log-ai-call", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/log-ai-call")>()), logAiCall: async () => {} }));
vi.mock("@/lib/ai/gateway", () => ({
  claudeParams: (model: string, max: number) => ({ model, max_tokens: max }), claudeFallback: () => ({}), providerUrl: () => "http://x",
  loadAnthropic: async () => class {
    beta = { messages: { stream: () => {
      m.apiCalls++;
      const events = (async function* () { yield { type: "content_block_delta", delta: { type: "text_delta", text: "# API 文" } }; })();
      return Object.assign(events, { abort: () => {}, finalMessage: async () => ({ model: "claude-opus-5-5", stop_reason: "end_turn", usage: { input_tokens: 1000, output_tokens: 2000 } }) });
    } } };
  },
}));
// the article stage is the real generate-core (as the article block runs it); the WordPress stage records what it got
vi.mock("@/lib/content/pipeline", async () => {
  const { generateArticleMarkdown } = await import("@/lib/content/article/generate-core");
  return {
    runContentPipeline: async (input: Record<string, unknown>, opts: { stages: string[] }) => {
      if (opts.stages[0] !== "article") {
        m.published.push(String(input.markdown));
        return { ok: true, publish: { post_id: 1, edit_url: "e" }, qualityReport: { score: 80 } };
      }
      const r = await generateArticleMarkdown(input, "k");
      if (r.ok) m.articles.push(r.markdown);
      return r.ok ? { ok: true, markdown: r.markdown } : r;
    },
  };
});

import { articleInput, splitArticleCost, subBudgetMs, topicDeps, API_ARTICLE_RESERVE_MS, SCHEDULE_SUB_BUDGET_MS } from "../make";
import { claimJob, resetCodexBridgeForTests } from "@/lib/tarot/codex-bridge";
import { textCallCostUsd, usdToNtd } from "@/lib/ai/cost-calculator";
import { stepUpperTwd } from "../budget";
import type { Topic } from "../store";

const sb = { from: () => ({ select: () => { const q = { eq: () => q, gte: () => q, order: () => q, range: async () => ({ data: [], error: null }) }; return q; } }) };
const topic: Topic = {
  id: "11111111-1111-4111-8111-111111111111", organization_id: "org1", site_id: "s1", title: "t", keyword: "k", angle: null,
  source: "manual", source_ref: {}, month: "2026-11-01", scheduled_for: null, formats: ["article"], status: "generating",
  artifacts: {}, review: null, version: 1, last_error: null, started_on: null, created_by: "x", created_at: "", updated_at: "",
};
const costLine = (md: string) => JSON.parse(md.split("\n[COST_JSON]").at(-1)!) as { usd: number; skipped?: Array<{ error: string; model: string }> };
const cost = (usd: number, route: string) => `[COST_JSON]${JSON.stringify({ usd, model: "x", vendor: "v", route })}`;
const schedule = () => topicDeps(sb as never, "org1", "staff:x", { capTwd: 15, maker: "schedule" });
const spent = (made: { artifacts: Record<string, unknown> }) => (made.artifacts as { budget: { spentTwd: number } }).budget.spentTwd;

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", ""); // these tests drive the Anthropic stub: no OpenAI key -> the article default falls back to Claude (K15)
  resetCodexBridgeForTests();
  Object.assign(m, { defaults: {}, articles: [], published: [], apiCalls: 0, subJobs: 0, subAnswer: null, orgKind: "internal", orgMeta: null });
  vi.stubEnv("SERPER_API_KEY", "");
});

describe("articleInput with a site's text road", () => {
  it("old content_defaults (no road fields): exactly the input from before -- no chain, no model, no claude level", () => {
    const old = { tone: "Warm", language: "繁體中文", publishMode: "human_review" } as never;
    expect(articleInput(topic, old)).toEqual({
      keyword: "k", title: "t", language: "繁體中文", targetCountry: undefined, tone: "Warm", articleType: undefined,
      readability: undefined, pointOfView: undefined, details: "", generateMeta: true, media: { aiImages: "none" },
    });
    expect(articleInput(topic, { textChain: "api", textApiModel: "gpt-5.5" })).toMatchObject({ model: "gpt-5.5" });
    expect(articleInput(topic, { textChain: "api" })).not.toHaveProperty("chain");
    expect(articleInput(topic, { textChain: "claude+api", textClaudeModel: "sub-claude-haiku" })).toMatchObject({ chain: "claude+api", claudeModel: "sub-claude-haiku" });
  });
});

describe("cost lines and the subscription wait", () => {
  it("splitArticleCost cuts the trailing cost run, bills the last model and search lines, ignores one inside the text", () => {
    const raw = `# 文\n${cost(9, "content/article-generate")}\n正文\n${cost(0.01, "content/fetchRealSources")}\n${cost(0.02, "content/article-generate")}\n`;
    const out = splitArticleCost(raw);
    expect(out.markdown).toBe(`# 文\n${cost(9, "content/article-generate")}\n正文`);   // the converters drop that one
    expect(out.billedTwd).toBe(usdToNtd(0.03));
    expect(splitArticleCost("# 文")).toEqual({ markdown: "# 文", billedTwd: null });
  });
  it("the wait is the cap, or what the tick has left beyond the API's reserve; none left = no subscription", () => {
    expect(subBudgetMs(undefined, 0)).toBe(SCHEDULE_SUB_BUDGET_MS);
    expect(subBudgetMs(1_000_000, 1_000_000 - API_ARTICLE_RESERVE_MS - 30_000)).toBe(30_000);
    expect(subBudgetMs(1_000_000, 1_000_000 - API_ARTICLE_RESERVE_MS)).toBe(0);
  });
});

describe("the scheduled article on a road", () => {
  it("codex+api with the host offline: the API writes it, the cap records what the API was billed, WordPress gets no cost line", async () => {
    m.defaults = { textChain: "codex+api" };
    const made = await schedule().make(topic);
    expect(m.apiCalls).toBe(1);
    expect(costLine(m.articles[0]).skipped).toEqual([expect.objectContaining({ model: "sub-codex", error: "sub_worker_offline" })]);
    const billed = usdToNtd(textCallCostUsd({ model: "claude-opus-5-5", inputTokens: 1000, outputTokens: 2000 }));
    expect(spent(made)).toBe(Math.round(billed * 100) / 100);
    expect(billed).not.toBe(stepUpperTwd.article(0));   // the estimate was replaced, not kept
    expect(m.published).toEqual(["# API 文"]);
  });

  it("a subscription answer: the article is NT$0 on the cap (search cost only, US$0 today), WordPress gets the text alone", async () => {
    m.defaults = { textChain: "claude+api" };
    m.subAnswer = { ok: true, text: "# 訂閱文" };
    const made = await schedule().make(topic);
    expect(m.apiCalls).toBe(0);
    expect(spent(made)).toBe(0);
    expect(m.published).toEqual(["# 訂閱文"]);
  });

  it("claude+api while the host's worker runs codex only: the claude segment is skipped as offline on the schedule lane", async () => {
    await claimJob(0, "schedule", ["codex"]);   // the host's worker is online, without claude
    m.defaults = { textChain: "claude+api", textClaudeModel: "sub-claude-sonnet" };
    await schedule().make(topic);
    expect(m.apiCalls).toBe(1);
    expect(costLine(m.articles[0]).skipped).toEqual([{ model: "sub-claude-sonnet", error: "sub_worker_offline", reason: "Claude 訂閱 Sonnet：主機沒有登入這一家或離線" }]);
  });

  it("a customer's site with a stored subscription road, on the schedule: no subscription is tried, the API writes it (I1)", async () => {
    m.orgKind = "customer";
    m.defaults = { textChain: "claude+codex+api" };
    m.subAnswer = { ok: true, text: "# 不該出現" };
    await schedule().make(topic);
    expect(m.subJobs).toBe(0);
    expect(m.apiCalls).toBe(1);
    expect(m.published).toEqual(["# API 文"]);
  });

  it("a client organization the owner marked as hers (client_config.ownerSubscription): the subscription writes it", async () => {
    m.orgKind = "customer";
    m.orgMeta = { client_config: { ownerSubscription: true } };
    m.defaults = { textChain: "claude+api" };
    m.subAnswer = { ok: true, text: "# 訂閱文" };
    await schedule().make(topic);
    expect(m.subJobs).toBe(1);
    expect(m.apiCalls).toBe(0);
    expect(m.published).toEqual(["# 訂閱文"]);
  });

  it("a tick with no time left for a subscription: the API writes it, nothing is queued (I5)", async () => {
    m.defaults = { textChain: "claude+api" };
    m.subAnswer = { ok: true, text: "# 不該出現" };
    await schedule().make(topic, Date.now() + API_ARTICLE_RESERVE_MS - 1);
    expect(m.subJobs).toBe(0);
    expect(m.apiCalls).toBe(1);
  });

  it("a person who is not the owner pressing start on a subscription road: the API alone, no subscription is tried (I1)", async () => {
    m.defaults = { textChain: "claude+codex+api" };
    m.subAnswer = { ok: true, text: "# 不該出現" };
    await topicDeps(sb as never, "org1", "ops:operator:u-staff", { capTwd: 15 }).make(topic);
    expect(m.subJobs).toBe(0);
    expect(m.apiCalls).toBe(1);
    expect(costLine(m.articles[0])).not.toHaveProperty("skipped");
  });
});
