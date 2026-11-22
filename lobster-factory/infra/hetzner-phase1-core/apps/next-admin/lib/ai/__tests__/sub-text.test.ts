// K4a: runSubText (one subscription segment) and runTextChain (a resolved chain, API last). PLAN 2026-11-22 §3, I1, I6.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ jobs: [] as unknown[], logs: [] as Record<string, unknown>[], answer: { ok: true, text: "全文", usage: { input_tokens: 5, output_tokens: 9 }, answeredModel: "claude-haiku-x" } as unknown }));
vi.mock("@/lib/tarot/codex-bridge", async (orig) => ({
  ...(await orig<typeof import("@/lib/tarot/codex-bridge")>()),
  runSubJob: async (input: unknown) => { m.jobs.push(input); return m.answer; },
}));
vi.mock("../log-ai-call", () => ({ logAiCall: async (a: Record<string, unknown>) => { m.logs.push(a); } }));

import { runSubText, runTextChain, skipNote, type SubTextResult } from "../sub-text";
import { TEXT_CHAINS, resolveTextChain, type SubTextModel } from "../text-model-options";
import type { Grant } from "@/lib/entitlements/can";

const OWNER = "ops:owner:u-owner";
const grant = (actor: string) => ({ actor }) as unknown as Grant;
const args = (actor: string) => ({ grant: grant(actor), model: "sub-claude-haiku" as const, system: "S", prompt: "P", lane: "owner" as const,
  signal: new AbortController().signal, route: "content/article-generate", tool: "content", jobId: null });

beforeEach(() => { m.jobs = []; m.logs = []; vi.stubEnv("CODEX_IMAGE_OWNER_USER_ID", "u-owner"); });

describe("runSubText", () => {
  it("the owner lane refuses anyone but the operator before anything is queued (I1)", async () => {
    expect(await runSubText(args("ops:staff:u-staff"))).toEqual({ ok: false, error: "sub_operator_only" });
    expect(await runSubText(args("client:u-owner"))).toEqual({ ok: false, error: "sub_operator_only" });
    expect(m.jobs).toEqual([]); expect(m.logs).toEqual([]);
  });
  it("the operator's job runs on her lane with the model's CLI settings; one usd-0 row with the usage (I6)", async () => {
    expect(await runSubText(args(OWNER))).toEqual({ ok: true, text: "全文", answeredModel: "claude-haiku-x", usage: { input_tokens: 5, output_tokens: 9 } });
    expect(m.jobs).toEqual([{ tool: "claude", lane: "owner", cliModel: "haiku", system: "S", prompt: "P" }]);
    expect(m.logs).toHaveLength(1);
    expect(m.logs[0]).toMatchObject({ model: "sub-claude-haiku", route: "content/article-generate", tool: "content", answeredModel: "claude-haiku-x",
      inputTokens: 5, outputTokens: 9, metadata: { input_tokens: 5, output_tokens: 9 } });
  });
  it("a failed segment is not logged", async () => {
    m.answer = { ok: false, error: "sub_quota_exhausted", quotaResetsAt: 1 };
    try { expect(await runSubText(args(OWNER))).toEqual({ ok: false, error: "sub_quota_exhausted" }); } finally { m.answer = { ok: true, text: "全文" }; }
    expect(m.logs).toEqual([]);
  });
});

describe("runTextChain", () => {
  const apiModel = "gpt-5.4";
  const run = (fail: readonly string[]) => {
    const tried: string[] = [];
    return { tried, handlers: {
      runSub: async (model: SubTextModel): Promise<SubTextResult> => { tried.push(model); return fail.includes(model) ? { ok: false, error: "sub_worker_offline" } : { ok: true, text: `from ${model}` }; },
      runApi: async (model: string) => { tried.push(model); return `api ${model}`; },
    } };
  };

  it.each(TEXT_CHAINS)("%s: every subscription segment down -> the API answers, each skip recorded in order", async (chain) => {
    const models = resolveTextChain({ chain, apiModel });
    const { tried, handlers } = run(models);
    const out = await runTextChain(models, handlers);
    expect(tried).toEqual(models);
    expect(out).toEqual({ via: "api", model: apiModel, result: `api ${apiModel}`, skipped: models.slice(0, -1).map((model) => ({ model, error: "sub_worker_offline" })) });
  });
  it.each(TEXT_CHAINS.filter((c) => c !== "api"))("%s: the first segment answers -> no later segment is touched", async (chain) => {
    const models = resolveTextChain({ chain, apiModel });
    const { tried, handlers } = run([]);
    expect(await runTextChain(models, handlers)).toEqual({ via: "sub", model: models[0], text: `from ${models[0]}`, skipped: [] });
    expect(tried).toEqual([models[0]]);
  });
  it("claude+codex+api: Claude down, Codex answers", async () => {
    const models = resolveTextChain({ chain: "claude+codex+api", apiModel, claudeModel: "sub-claude-sonnet" });
    const { tried, handlers } = run(["sub-claude-sonnet"]);
    expect(await runTextChain(models, handlers)).toEqual({ via: "sub", model: "sub-codex", text: "from sub-codex", skipped: [{ model: "sub-claude-sonnet", error: "sub_worker_offline" }] });
    expect(tried).toEqual(["sub-claude-sonnet", "sub-codex"]);
  });
  it("a segment that throws is skipped as sub_exec_failed and the API still runs", async () => {
    const out = await runTextChain(["sub-claude-opus", apiModel], {
      runSub: async () => { throw new Error("boom"); },
      runApi: async (model: string) => `api ${model}`,
    });
    expect(out).toEqual({ via: "api", model: apiModel, result: `api ${apiModel}`, skipped: [{ model: "sub-claude-opus", error: "sub_exec_failed" }] });
  });
  it("a skip as the page shows it", () => {
    expect(skipNote({ model: "sub-claude-haiku", error: "sub_worker_offline" })).toEqual({ model: "sub-claude-haiku", error: "sub_worker_offline", reason: "Claude 訂閱 Haiku：筆電離線" });
    expect(skipNote({ model: "sub-codex", error: "sub_worker_offline" }, "schedule").reason).toBe("Codex 訂閱：主機沒有登入這一家或離線");
  });
});
