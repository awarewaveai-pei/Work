// K4a review: a chain always ends on the paid API, so the cap is priced on the API segment even when the plan names a
// subscription model (the sub id normalizes to the default API model, as the quote and the run both do).
import { describe, expect, it } from "vitest";
import { FORGE_MAX_TOKENS, forgeCallUpperTwd, forgeRunUpperTwd } from "../run-budget";
import { DEFAULT_AI_TEXT_MODEL, OPENAI_REASONING_HEADROOM_TOKENS } from "@/lib/ai/text-model-options";
import { textCallCostUsd } from "@/lib/ai/cost-calculator";
import { TWD_RATE } from "@/lib/ai/cost-model";

describe("script cap with a subscription model", () => {
  const ctx = { lang: "繁體中文", sceneCount: 6, customScenes: 3, brand: null };
  it("prices like the default API model, never NT$0", () => {
    const api = forgeRunUpperTwd({ model: DEFAULT_AI_TEXT_MODEL }, ctx);
    expect(api).toBeGreaterThan(0);
    expect(forgeRunUpperTwd({ model: "sub-claude-haiku" }, ctx)).toBe(api);
    expect(forgeCallUpperTwd("sub-codex-sol", "S", "P")).toBe(forgeCallUpperTwd(DEFAULT_AI_TEXT_MODEL, "S", "P"));
  });
});

describe("script cap on an OpenAI model (K21)", () => {
  it("covers the most one call can bill: the input and the limit plus the thinking headroom", () => {
    const system = "S", prompt = "P";
    const inputTokens = Buffer.byteLength(system + prompt, "utf8") + 512;
    const worst = textCallCostUsd({ model: "gpt-6.2-sol", inputTokens, outputTokens: FORGE_MAX_TOKENS + OPENAI_REASONING_HEADROOM_TOKENS }) * TWD_RATE;
    expect(forgeCallUpperTwd("gpt-6.2-sol", system, prompt)).toBeGreaterThanOrEqual(worst);
  });
});
