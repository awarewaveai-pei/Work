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
import { can } from "@/lib/entitlements/can";
import { creditsForCost } from "@/lib/entitlements/ledger";
import { CUSTOMER, gateFixture } from "@/lib/entitlements/__tests__/gate-fixtures";

beforeEach(() => { m.rows = []; vi.spyOn(console, "warn").mockImplementation(() => {}); });
const ACTOR = "ops:owner:u";
/** studio.image billed in credits (a credit-plan row, 0145 studio_credits) on a wallet of `balance`. */
const creditsGrant = async (balance = 500) => { const f = gateFixture({ credits: true, balance }); return { f, grant: await can(CUSTOMER, "studio.image", ACTOR, f.deps) }; };
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("billed usage reaches ai_call_logs", () => {
  it("an image the provider finished is logged even when its download failed, on the grant's account, and not charged", async () => {
    const { f, grant } = await creditsGrant();
    logImageResult({ ok: false, billed: true }, { route: "r", model: "openai-high", grant });
    await settle();
    expect(m.rows).toEqual([expect.objectContaining({ model: "openai-high", vendor: "OpenAI", organization_id: CUSTOMER.orgId, cost_usd: IMAGE_RATES["openai-high"].usd })]);
    expect(f.debit).not.toHaveBeenCalled();   // the customer got nothing: our cost
  });

  it("a failure before the provider finished costs nothing and writes nothing", async () => {
    logImageResult({ ok: false }, { route: "r", model: "openai-high", grant: (await creditsGrant()).grant });
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
    const { grant } = await creditsGrant();
    await logImageCost({ route: "r", model: "flux-schnell", vendor: "Replicate", costUsd: 0.003, jobId: "j1", grant });
    expect(m.rows).toEqual([expect.objectContaining({ job_id: null, metadata: { raw_job_id: "j1", credits_charged: 1 } })]);
  });
});

describe("ADR 017 4b-11: a delivered call is charged its cost", () => {
  it("prices 1 credit = NT$1 at 3x cost, rounded up, at least 1, nothing for a free call", () => {
    expect([0.0046, 0.25, 0.002, 0].map(creditsForCost)).toEqual([1, 24, 1, 0]);
  });

  it("a credits grant is debited once, keyed by the cost row it wrote", async () => {
    const { logImageCost } = await import("../log-ai-call");
    const { f, grant } = await creditsGrant();
    await logImageCost({ route: "r", model: "kling", vendor: "Replicate", costUsd: 0.25, grant });
    expect(f.debit).toHaveBeenCalledTimes(1);
    expect(f.debit).toHaveBeenCalledWith(expect.objectContaining({ orgId: CUSTOMER.orgId, units: 24, idempotencyKey: `ai-call:${m.rows[0].id}`, featureKey: "studio.image" }));
    expect(m.rows[0]).toMatchObject({ organization_id: CUSTOMER.orgId, metadata: { credits_charged: 24 } });
  });

  it("a comp or contract grant covers its use: recorded, never debited", async () => {
    const { logAiCall } = await import("../log-ai-call");
    const f = gateFixture({ entitlement: { productKey: "studio", featureKey: "studio.image", source: "comp" } });
    await logAiCall({ route: "r", model: "claude-opus-5-5", inputTokens: 100_000, outputTokens: 10_000, grant: await can(CUSTOMER, "studio.image", ACTOR, f.deps) });
    expect(f.debit).not.toHaveBeenCalled();
    expect(m.rows[0]).toMatchObject({ organization_id: CUSTOMER.orgId, metadata: { credits_charged: 0 } });
  });

  it("a wallet short of the price is drained and the row says how much was not covered", async () => {
    const { logImageCost } = await import("../log-ai-call");
    const { grant } = await creditsGrant(5);
    await logImageCost({ route: "r", model: "kling", vendor: "Replicate", costUsd: 0.25, grant });
    expect(m.rows[0]).toMatchObject({ metadata: { credits_charged: 5, credits_shortfall: 19 } });
  });
});
