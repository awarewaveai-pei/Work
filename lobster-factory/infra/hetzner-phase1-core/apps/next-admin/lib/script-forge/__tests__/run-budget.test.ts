// K4a review: a chain always ends on the paid API, so the cap is priced on the API segment even when the plan names a
// subscription model (the sub id normalizes to the default API model, as the quote and the run both do).
import { describe, expect, it } from "vitest";
import { forgeCallUpperTwd, forgeRunUpperTwd } from "../run-budget";
import { DEFAULT_AI_TEXT_MODEL } from "@/lib/ai/text-model-options";

describe("script cap with a subscription model", () => {
  const ctx = { lang: "繁體中文", sceneCount: 6, customScenes: 3, brand: null };
  it("prices like the default API model, never NT$0", () => {
    const api = forgeRunUpperTwd({ model: DEFAULT_AI_TEXT_MODEL }, ctx);
    expect(api).toBeGreaterThan(0);
    expect(forgeRunUpperTwd({ model: "sub-claude-haiku" }, ctx)).toBe(api);
    expect(forgeCallUpperTwd("sub-codex-sol", "S", "P")).toBe(forgeCallUpperTwd(DEFAULT_AI_TEXT_MODEL, "S", "P"));
  });
});
