// K4a: an article on a text chain (PLAN 2026-11-22 §3). Subscription answer = the whole text plus a usd-0 [COST_JSON];
// every subscription segment down = the API article, its [COST_JSON] naming the skipped segments; no chain = as before.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  actor: "ops:owner:u-owner",
  jobs: [] as Array<{ tool: string; cliModel: string | null }>,
  answers: {} as Record<string, unknown>,
  logs: [] as Record<string, unknown>[],
  apiCalls: 0,
}));
vi.mock("@/lib/entitlements/grant", () => ({ grantFor: async () => ({ actor: m.actor }) }));
vi.mock("@/lib/ai/gateway", () => ({
  claudeParams: (model: string, max: number) => ({ model, max_tokens: max }), claudeFallback: () => ({}), providerUrl: () => "http://x",
  loadAnthropic: async () => class {
    beta = { messages: { stream: () => {
      m.apiCalls++;
      const events = (async function* () { yield { type: "content_block_delta", delta: { type: "text_delta", text: "API 文" } }; })();
      return Object.assign(events, { abort: () => {}, finalMessage: async () => ({ model: "claude-opus-5-5", stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 20 } }) });
    } } };
  },
}));
vi.mock("@/lib/tarot/codex-bridge", async (orig) => ({
  ...(await orig<typeof import("@/lib/tarot/codex-bridge")>()),
  runSubJob: async (input: { tool: string; cliModel: string | null }) => { m.jobs.push(input); return m.answers[input.tool] ?? { ok: false, error: "sub_worker_offline" }; },
}));
vi.mock("@/lib/ai/log-ai-call", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/log-ai-call")>()),
  logAiCall: async (a: Record<string, unknown>) => { m.logs.push(a); },
}));

import { prepareArticleGeneration, streamArticleGeneration, type ArticlePreparedConfig, type ArticlePrepareSuccess } from "../generate-core";

const base: ArticlePreparedConfig = { model: "claude-opus-5-5", maxTokens: 100, system: "S", userPrompt: "P", jobId: null };
const collect = async (config: ArticlePreparedConfig) => { let out = ""; for await (const c of streamArticleGeneration(config, "k")) out += c; return out; };
const costs = (out: string) => out.split("\n[COST_JSON]").slice(1).map((j) => JSON.parse(j));

beforeEach(() => { m.actor = "ops:owner:u-owner"; m.jobs = []; m.answers = {}; m.logs = []; m.apiCalls = 0; vi.stubEnv("CODEX_IMAGE_OWNER_USER_ID", "u-owner"); });

describe("article on a text chain", () => {
  it("a subscription answer: the whole text, a usd-0 [COST_JSON], one ledger row, no API call", async () => {
    m.answers.claude = { ok: true, text: "# 訂閱寫的文章", usage: { input_tokens: 3, output_tokens: 4 } };
    const out = await collect({ ...base, chain: "claude+api", claudeModel: "sub-claude-haiku" });
    expect(out).toBe(`# 訂閱寫的文章\n[COST_JSON]${JSON.stringify({ usd: 0, model: "sub-claude-haiku", vendor: "訂閱", route: "content/article-generate" })}`);
    expect(m.jobs).toEqual([{ tool: "claude", lane: "owner", cliModel: "haiku", system: "S", prompt: "P" }]);
    expect(m.logs).toHaveLength(1); expect(m.logs[0]).toMatchObject({ model: "sub-claude-haiku", route: "content/article-generate", tool: "content" });
    expect(m.apiCalls).toBe(0);
  });
  it("claude+codex+api with both segments offline: the API writes it, [COST_JSON] names both skips", async () => {
    const out = await collect({ ...base, chain: "claude+codex+api" });
    expect(out.startsWith("API 文\n[COST_JSON]")).toBe(true);
    expect(m.jobs.map((j) => j.tool)).toEqual(["claude", "codex"]);
    expect(m.apiCalls).toBe(1);
    const [cost] = costs(out);
    expect(cost).toMatchObject({ model: "claude-opus-5-5", vendor: "Anthropic", route: "content/article-generate" });
    expect(cost.skipped).toEqual([
      { model: "sub-claude-opus", error: "sub_worker_offline", reason: "Claude 訂閱 Opus：筆電離線" },
      { model: "sub-codex-sol", error: "sub_worker_offline", reason: "Codex 訂閱 GPT-6.2 sol：筆電離線" },
    ]);
    expect(m.logs.map((l) => (l.response as { model?: string } | undefined)?.model)).toEqual(["claude-opus-5-5"]); // only the API call is billed
  });
  it("no chain, or a chain sent by someone who is not the operator: the API path, no job, no skipped field", async () => {
    const plain = await collect(base);
    m.actor = "ops:staff:u-staff";
    const staff = await collect({ ...base, chain: "claude+codex+api" });
    expect(m.jobs).toEqual([]);
    expect(staff).toBe(plain);
    expect(costs(plain)[0]).not.toHaveProperty("skipped");
  });
  it("prepare: chain and claude model come from the body; none (or api) leaves the config as before", async () => {
    const body = { keyword: "k", externalLinks: ["https://example.com"], model: "gpt-5.4" };
    const before = (await prepareArticleGeneration(body)) as ArticlePrepareSuccess;
    expect(before.config).not.toHaveProperty("chain");
    expect(((await prepareArticleGeneration({ ...body, chain: "api" })) as ArticlePrepareSuccess).config).toEqual(before.config);
    const chained = (await prepareArticleGeneration({ ...body, chain: "codex+api", claudeModel: "sub-claude-sonnet", lane: "schedule" })) as ArticlePrepareSuccess;
    expect(chained.config).toEqual({ ...before.config, chain: "codex+api", claudeModel: "sub-claude-sonnet" }); // a body never picks the lane
  });
});
