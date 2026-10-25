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

describe("Codex 2026-10-25 review of 12dd0e699 (F3, F4)", () => {
  it("a job id that is not a uuid keeps the row: job_id empties, the value moves to metadata", async () => {
    const { logImageCost } = await import("../log-ai-call");
    await logImageCost({ route: "r", model: "flux-schnell", vendor: "Replicate", costUsd: 0.003, jobId: "j1" });
    expect(m.rows).toEqual([expect.objectContaining({ job_id: null, metadata: { raw_job_id: "j1" } })]);
  });

  it("a cost that names no organization is recorded on the account the enclosing grant scope bills", async () => {
    const { runForOrg } = await import("@/lib/entitlements/grant");
    const { logAiCall } = await import("../log-ai-call");
    const subjects = { byId: async (id: string) => ({ id, parent_organization_id: null, kind: "customer" as const }), bySlug: async () => null, internal: async () => null };
    await runForOrg("org-7", "ops:owner:u", () => logAiCall({ route: "r", model: "claude-opus-5-5", inputTokens: 1, outputTokens: 1 }), { subjects });
    await logAiCall({ route: "r", model: "claude-opus-5-5", inputTokens: 1, outputTokens: 1, organizationId: null });
    expect(m.rows.map((r) => r.organization_id)).toEqual(["org-7", null]);
  });
});
