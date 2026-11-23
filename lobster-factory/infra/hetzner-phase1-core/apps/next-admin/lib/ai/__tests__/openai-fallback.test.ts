// K20: one table of per-feature defaults, and an OpenAI answer that is empty or cut off (gpt-6.x spends its reasoning inside
// max_completion_tokens) is never handed back: video script, social rewrite and humanize redo it on the feature's Claude
// model; outreach throws so its provider ladder moves on.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ create: vi.fn(), betaCreate: vi.fn(), stream: vi.fn(), openai: { text: "", finish: "length" } }));
vi.mock("@/lib/ai/gateway", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/gateway")>()),
  providerUrl: (_g: unknown, _p: string, path: string) => `https://openai.test${path}`,
  loadAnthropic: async () => function Anthropic() { return { messages: { create: m.create }, beta: { messages: { create: m.betaCreate, stream: m.stream } } }; },
}));
vi.mock("@/lib/ai/log-ai-call", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/log-ai-call")>()), logAiCall: vi.fn() }));
vi.mock("@/lib/entitlements/grant", () => ({
  grantFor: async () => ({ actor: "ops:x:someone" }),
  withFeature: (_k: string, h: (req: Request, g: unknown) => Promise<Response>) => (req: Request) => h(req, { actor: "ops:x:someone" }),
}));
vi.mock("@/lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "operator" }), canCreateAiImageJob: () => true }));

import { DEFAULT_AI_TEXT_MODEL, resolveFeatureTextModel, TEXT_FEATURE_DEFAULTS, type TextFeature } from "../text-model-options";
import { generateVideoScript } from "@/lib/content/video/video-script-core";
import { claudeWriter } from "@/lib/social/write-posts-claude";
import { generateWithOpenAI } from "@/lib/outreach/ai-openai";
import { POST as humanize } from "@/app/api/content/humanize/route";

const SCENES = JSON.stringify({ title: "T", description: "D", scenes: [{ id: 1, narration: "n", image_prompt: "p", broll_keyword: "k", visual: "custom" }] });
const openAiBody = () => JSON.stringify({ model: "gpt-6.2-sol", choices: [{ message: { content: m.openai.text }, finish_reason: m.openai.finish }],
  usage: { prompt_tokens: 10, completion_tokens: 7096, completion_tokens_details: { reasoning_tokens: 7096 } } });

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
  vi.stubEnv("ANTHROPIC_API_KEY", "ak-test");
  m.openai = { text: "", finish: "length" };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(openAiBody(), { status: 200 })));
  const usage = { input_tokens: 1, output_tokens: 1 };
  m.create.mockReset().mockResolvedValue({ model: "claude-haiku-5-5", usage, content: [{ type: "text", text: "CLAUDE" }] });
  m.betaCreate.mockReset().mockResolvedValue({ model: "claude-opus-5-5", usage, stop_reason: "end_turn", content: [{ type: "text", text: SCENES }] });
  m.stream.mockReset().mockImplementation(() => ({
    async *[Symbol.asyncIterator]() { yield { type: "content_block_delta", delta: { type: "text_delta", text: "CLAUDE" } }; },
    finalMessage: async () => ({ model: "claude-opus-5-5", usage, stop_reason: "end_turn", content: [] }),
    abort() {},
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("per-feature default model (TEXT_FEATURE_DEFAULTS)", () => {
  const noKeyClaude: Record<TextFeature, string> = { article: DEFAULT_AI_TEXT_MODEL, videoScript: "claude-opus-5-5",
    socialRewrite: "claude-haiku-5-5", humanize: "claude-opus-5-5", outreach: "claude-haiku-5-5" };
  for (const f of Object.keys(TEXT_FEATURE_DEFAULTS) as TextFeature[]) {
    it(`${f}: a pick is kept, none -> gpt-6.2-sol, none without an OpenAI key -> its Claude model`, () => {
      expect(resolveFeatureTextModel(f, "claude-sonnet-5-5", true)).toBe("claude-sonnet-5-5");
      expect(resolveFeatureTextModel(f, "gpt-5.4-mini", false)).toBe("gpt-5.4-mini");
      expect(resolveFeatureTextModel(f, undefined, true)).toBe("gpt-6.2-sol");
      expect(resolveFeatureTextModel(f, undefined, false)).toBe(noKeyClaude[f]);
    });
  }
});

describe("an empty or cut-off OpenAI answer is never returned", () => {
  it("video script: length -> Claude writes the script, the skip says why", async () => {
    const r = await generateVideoScript({ topic: "感恩日記" }, "k");
    expect(r).toMatchObject({ ok: true, title: "T", skipped: [{ model: "gpt-6.2-sol", error: "openai_length" }] });
    expect(m.betaCreate.mock.calls[0][0].model).toBe("claude-opus-5-5");
  });

  it("social rewrite: empty -> the Claude answer, not an empty post", async () => {
    m.openai = { text: "  ", finish: "stop" };
    const { ask } = await claudeWriter({ actor: "ops:x" } as never, "k", "t", null);
    expect(await ask("寫貼文")).toBe("CLAUDE");
    expect(m.create.mock.calls[0][0].model).toBe("claude-haiku-5-5");
  });

  it("humanize: length -> Claude streams the text; the OpenAI spend and the skip are on cost lines", async () => {
    const res = await humanize(new Request("http://localhost/api/content/humanize", { method: "POST", body: JSON.stringify({ text: "AI 文字" }) }));
    const body = await res.text();
    const text = body.split("\n").filter((l) => !l.startsWith("[COST_JSON]")).join("\n");
    expect(text.trim()).toBe("CLAUDE");
    expect(body).toContain('"error":"openai_length"');
  });

  it("outreach: length -> throws, so generate.ts moves to the next provider instead of parsing half an email", async () => {
    await expect(generateWithOpenAI({ actor: "ops:x" } as never, "k", "寫信")).rejects.toThrow(/length limit/);
  });
});
