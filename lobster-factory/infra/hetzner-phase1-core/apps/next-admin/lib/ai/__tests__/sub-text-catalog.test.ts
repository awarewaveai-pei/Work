import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock("../../supabase-server", () => ({
  getSupabaseWriteClient: () => ({ from: () => ({ insert: async (r: Record<string, unknown>) => { m.rows.push(r); return { error: null }; } }) }),
}));

import { SUB_TEXT_MODELS, isSubTextModel, subTextSpec, isAiTextModel, normalizeAiTextModel, resolveSavedAiTextModel, isOpenAiTextModel,
  DEFAULT_AI_TEXT_MODEL, TEXT_CHAINS, isTextChain, resolveTextChain, type AiTextModel } from "../text-model-options";
import { TEXT_RATES } from "../cost-model";
import { logAiCall } from "../log-ai-call";
import { can } from "@/lib/entitlements/can";
import { CUSTOMER, gateFixture } from "@/lib/entitlements/__tests__/gate-fixtures";

const SUB_IDS = ["sub-codex-luna", "sub-codex-terra", "sub-codex-sol", "sub-codex-astra", "sub-claude-haiku", "sub-claude-sonnet", "sub-claude-opus"] as const;
beforeEach(() => { m.rows = []; });

describe("訂閱 text models live apart from API models (K3)", () => {
  it.each(SUB_IDS)("%s is a sub model and invisible to every API-only path", (id) => {
    expect(isSubTextModel(id)).toBe(true);
    expect(subTextSpec(id)).toBeDefined();
    expect(isAiTextModel(id)).toBe(false);
    expect(normalizeAiTextModel(id)).toBe(DEFAULT_AI_TEXT_MODEL);
    expect(resolveSavedAiTextModel(id)).toBeUndefined();
    expect(isOpenAiTextModel(id as unknown as AiTextModel)).toBe(false);
  });
  it("no sub id in TEXT_RATES; catalog shape", () => {
    expect(Object.keys(TEXT_RATES).filter((k) => k.startsWith("sub-"))).toEqual([]);
    expect(Object.keys(SUB_TEXT_MODELS).sort()).toEqual([...SUB_IDS].sort());
    expect(subTextSpec("claude-opus-5-5")).toBeUndefined();
  });
  it("text chains", () => {
    expect(TEXT_CHAINS.map((chain) => resolveTextChain({ chain, apiModel: "gpt-5.4" }))).toEqual([
      ["sub-claude-opus", "sub-codex-sol", "gpt-5.4"], ["sub-claude-opus", "gpt-5.4"], ["sub-codex-sol", "gpt-5.4"], ["gpt-5.4"]]);
    expect(resolveTextChain({ chain: "claude+api", apiModel: "gpt-5.4", claudeModel: "sub-claude-haiku" })).toEqual(["sub-claude-haiku", "gpt-5.4"]);
    expect(resolveTextChain({ chain: "claude+api", apiModel: "x", claudeModel: "sub-codex-sol" })).toEqual(["sub-claude-opus", DEFAULT_AI_TEXT_MODEL]);
    expect(resolveTextChain({ chain: "codex+api", apiModel: "sub-codex-sol" })).toEqual(["sub-codex-sol", DEFAULT_AI_TEXT_MODEL]);
    // K17: the codex segment takes a codex id; a claude id, the retired "sub-codex" or junk -> the codex default
    expect(resolveTextChain({ chain: "codex+api", apiModel: "x", codexModel: "sub-codex-astra" })).toEqual(["sub-codex-astra", DEFAULT_AI_TEXT_MODEL]);
    for (const bad of ["sub-claude-haiku", "sub-codex", "gpt-5.4", 7, undefined]) expect(resolveTextChain({ chain: "codex+api", apiModel: "x", codexModel: bad })).toEqual(["sub-codex-sol", DEFAULT_AI_TEXT_MODEL]);
    expect(resolveTextChain({ chain: "claude+codex+api", apiModel: "x", claudeModel: "sub-claude-haiku", codexModel: "sub-codex-luna" })).toEqual(["sub-claude-haiku", "sub-codex-luna", DEFAULT_AI_TEXT_MODEL]);
    expect(isTextChain("api")).toBe(true);
    expect(isTextChain("codex")).toBe(false);
  });
  it("logAiCall writes usd 0, vendor 訂閱, answered_model, even with no token counts", async () => {
    const f = gateFixture({ credits: true, balance: 500 });
    const grant = await can(CUSTOMER, "studio.image", "ops:owner:u", f.deps);
    await logAiCall({ route: "r", model: "sub-claude-opus", inputTokens: 0, outputTokens: 0, grant, answeredModel: "claude-opus-5-5",
      metadata: { codex_5h_used_pct: 3 } });
    expect(m.rows).toEqual([expect.objectContaining({ model: "sub-claude-opus", vendor: "訂閱", cost_usd: 0,
      metadata: expect.objectContaining({ answered_model: "claude-opus-5-5", codex_5h_used_pct: 3 }) })]);
    expect((m.rows[0].metadata as Record<string, unknown>).rate_fallback).toBeUndefined();
  });
});
