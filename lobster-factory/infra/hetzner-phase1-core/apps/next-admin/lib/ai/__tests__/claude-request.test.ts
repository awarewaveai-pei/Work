import { describe, expect, it } from "vitest";
import {
  CLAUDE_DEFAULT_MODEL,
  THINKING_HEADROOM_TOKENS,
  claudeFallback,
  claudeIncomplete,
  claudeParams,
  claudeText,
} from "../gateway";
import { DEFAULT_AI_TEXT_MODEL } from "../text-model-options";

describe("claudeParams", () => {
  it("the app default is claude-opus-5-5, with thinking headroom and explicit effort", () => {
    expect(CLAUDE_DEFAULT_MODEL).toBe("claude-opus-5-5");
    expect(DEFAULT_AI_TEXT_MODEL).toBe(CLAUDE_DEFAULT_MODEL);
    const p = claudeParams(CLAUDE_DEFAULT_MODEL, 1000);
    expect(p).toEqual({ model: "claude-opus-5-5", max_tokens: 1000 + THINKING_HEADROOM_TOKENS, output_config: { effort: "medium" } });
    expect(p).not.toHaveProperty("thinking");   // always on; { type: "disabled" } would be a 400
    expect(p).not.toHaveProperty("temperature"); // non-default sampling params are a 400
  });

  it("models that do not always think keep the answer budget; Haiku gets no effort", () => {
    expect(claudeParams("claude-sonnet-4-6", 500, "low")).toEqual({ model: "claude-sonnet-4-6", max_tokens: 500, output_config: { effort: "low" } });
    expect(claudeParams("claude-haiku-4-5-20251001", 500)).toEqual({ model: "claude-haiku-4-5-20251001", max_tokens: 500 });
  });

  it("the classifier fallback opt-in is only for the models that take it", () => {
    expect(claudeFallback(CLAUDE_DEFAULT_MODEL)).toEqual({ betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    expect(claudeFallback("claude-sonnet-4-6")).toEqual({});
  });
});

describe("claudeText / claudeIncomplete", () => {
  it("reads the answer past a leading thinking block", () => {
    const msg = { content: [{ type: "thinking", thinking: "" }, { type: "text", text: "[\"a\"" }, { type: "text", text: "]" }] };
    expect(claudeText(msg)).toBe("[\"a\"]");
  });

  it("names a refusal or a truncation, and passes a whole answer", () => {
    expect(claudeIncomplete({ stop_reason: "refusal" })).toBe("model_refused");
    expect(claudeIncomplete({ stop_reason: "max_tokens" })).toBe("output_truncated");
    expect(claudeIncomplete({ stop_reason: "end_turn" })).toBeNull();
  });
});

describe("claudeParams on Haiku 5.5", () => {
  it("carries no budget_tokens and no non-default sampling, and accepts thinking disabled", () => {
    const p = claudeParams("claude-haiku-5-5", 500, "medium", { thinking: "off" });
    expect(p).toEqual({ model: "claude-haiku-5-5", max_tokens: 500, output_config: { effort: "medium" }, thinking: { type: "disabled" } });
    for (const k of ["temperature", "top_p", "top_k"]) expect(p).not.toHaveProperty(k);
    expect(p.thinking).not.toHaveProperty("budget_tokens");
    expect(claudeParams("claude-haiku-5-5", 500)).not.toHaveProperty("thinking"); // opt-in only
    expect(claudeParams("claude-opus-5-5", 500, "medium", { thinking: "off" })).not.toHaveProperty("thinking"); // always thinks: disabled is a 400
  });
});
