// Codex 2026-10-25 F3/F4/F7/F8: what an image or an OpenAI call writes to ai_call_logs.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({ from: () => ({ insert: async (r: Record<string, unknown>) => { m.rows.push(r); return { error: null }; } }) }),
}));
vi.mock("../../supabase-server", () => ({
  getSupabaseWriteClient: () => ({ from: () => ({ insert: async (r: Record<string, unknown>) => { m.rows.push(r); return { error: null }; } }) }),
}));

import { logImageResult, openaiUsageTokens } from "../log-ai-call";
import { IMAGE_RATES } from "../cost-model";

beforeEach(() => { m.rows = []; });
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("billed usage reaches ai_call_logs", () => {
  it("an image the provider finished is logged even when its download failed, with its own vendor and the org", async () => {
    logImageResult({ ok: false, billed: true }, { route: "r", model: "openai-high", organizationId: "org-9" });
    await settle();
    expect(m.rows).toEqual([expect.objectContaining({ model: "openai-high", vendor: "OpenAI", organization_id: "org-9", cost_usd: IMAGE_RATES["openai-high"].usd })]);
  });

  it("a failure before the provider finished costs nothing and writes nothing", async () => {
    logImageResult({ ok: false }, { route: "r", model: "openai-high" });
    await settle();
    expect(m.rows).toEqual([]);
  });

  it("openaiUsageTokens moves cached prompt tokens to the cache rate", () => {
    expect(openaiUsageTokens({ prompt_tokens: 2048, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 1024 } }))
      .toEqual({ inputTokens: 1024, outputTokens: 10, cacheReadTokens: 1024 });
    expect(openaiUsageTokens(null)).toEqual({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 });
  });
});
