// POST /api/tools/script-forge (AUTO_CONTENT plan P5.2): the page sends { module, task, fields }; the system text and
// prompt are the registry's (lib/script-forge/modules.ts), the brand is read from the client's site on the server.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = vi.hoisted(() => "11111111-1111-4111-8111-111111111111");
const sent = vi.hoisted(() => ({ calls: [] as Array<{ system: string; messages: Array<{ content: string }> }>, options: [] as Array<{ maxRetries?: number }> }));
// Set = the real SDK stream accumulates this provider response (usage and stop_reason exactly as the SDK snapshots them).
const provider = vi.hoisted(() => ({ fetch: null as null | (() => Promise<Response>) }));
const limit = vi.hoisted(() => ({ ms: 110_000 }));
vi.mock("@/lib/entitlements/grant", () => ({ withFeature: (_k: string, h: (r: Request, g: unknown) => Promise<Response>) => (r: Request) => h(r, {}) }));
vi.mock("@/lib/ai/gateway", () => ({
  claudeParams: () => ({ model: "claude-haiku-5-5", max_tokens: 10 }), claudeFallback: () => ({}), providerUrl: () => "http://x",
  loadAnthropic: async () => provider.fetch ? class extends (await import("@anthropic-ai/sdk")).default {
    constructor(options: { apiKey: string; maxRetries?: number }) { super({ ...options, fetch: provider.fetch! }); }
  } : class {
    constructor(options: { maxRetries?: number }) { sent.options.push(options); }
    beta = { messages: { stream: (p: { system: string; messages: Array<{ content: string }> }) => {
      sent.calls.push(p);
      const events = (async function* () { yield { type: "content_block_delta", delta: { type: "text_delta", text: '{"hooks":[]}' } }; })();
      const done = { model: "claude-x", stop_reason: "end_turn", usage: { input_tokens: 7, output_tokens: 3 } };
      return Object.assign(events, { currentMessage: undefined, finalMessage: async () => done });
    } } };
  },
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({}) }));
vi.mock("@/lib/script-forge/run-store", () => ({
  get SCRIPT_STREAM_LIMIT_MS() { return limit.ms; },
  reserveScriptRun: async (_db: unknown, org: string, budget: { budgetTwd: number; spentTwd: number }, key: string, reserved: number) => {
    if (budget.spentTwd + reserved > budget.budgetTwd) throw Object.assign(Error("已到上限"), { status: 409 });
    return { kind: "claim", org, key, reserved, spentTwd: budget.spentTwd + reserved };
  },
  finishScriptRun: async (_db: unknown, claim: { spentTwd: number; reserved: number }, _text: string, actual: number | null) => ({ spentTwd: claim.spentTwd - claim.reserved + (actual ?? claim.reserved), estimated: actual === null }),
}));
const logged = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));
vi.mock("@/lib/ai/log-ai-call", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/log-ai-call")>()),
  logAiCall: async (a: Record<string, unknown>) => { logged.calls.push(a); },
}));
vi.mock("@/lib/content/brand-voice-store", () => ({
  loadSiteBrand: async (_sb: unknown, id: string) => (id === "own"
    ? { siteId: id, organizationId: ORG, name: "Shop", defaults: { brandVoiceInstructions: "溫暖親切", marketing: { forbiddenClaims: "治癒" } } }
    : id === "other" ? { siteId: id, organizationId: "22222222-2222-4222-8222-222222222222", name: "X", defaults: {} } : null),
}));
const { POST } = await import("./route");

const client = { "x-ops-user-kind": "client", "x-ops-org-id": ORG };
const post = (b: object) => POST(new Request("https://video.aware-wave.com/api/tools/script-forge", {
  method: "POST", headers: { "content-type": "application/json", ...client }, body: JSON.stringify(b),
}));

beforeEach(() => { vi.stubEnv("ANTHROPIC_API_KEY", "k"); sent.calls = []; sent.options = []; logged.calls = []; provider.fetch = null; limit.ms = 110_000; });
const budgeted = (extra: object = {}) => post({ module: "manual", task: "script", fields: { topic: "主題" }, model: "claude-haiku-5-5", autoBudget: { organizationId: ORG, runId: "run-one", budgetTwd: 10000, spentTwd: 1 }, ...extra });
const receiptOf = async (res: Response) => { const reserved = Number(res.headers.get("X-SF-Reserved-Twd")), parts = (await res.text()).split("\n[SF_BUDGET]"); return { reserved, text: parts[0], receipt: JSON.parse(parts[1]) }; };
const sse = (events: object[]) => events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join("");

describe("POST /api/tools/script-forge", () => {
  it("cannot read or bill a different organization's script run", async () => {
    const res = await post({ module: "manual", task: "script", fields: { topic: "主題" }, autoBudget: { organizationId: "22222222-2222-4222-8222-222222222222", runId: "run-one", budgetTwd: 10000, spentTwd: 0 } });
    expect(res.status).toBe(404); expect(sent.calls).toEqual([]);
  });
  it("one-click budget zero refuses before a provider call", async () => {
    const res = await post({ module: "manual", task: "script", fields: { topic: "主題" }, model: "claude-haiku-5-5", autoBudget: { organizationId: ORG, runId: "run-one", budgetTwd: 0, spentTwd: 0 } });
    expect(res.status).toBe(409); expect(sent.calls).toEqual([]);
  });
  it("budgeted streams return reserved and actual usage without changing ordinary streams", async () => {
    const res = await post({ module: "manual", task: "script", fields: { topic: "主題" }, model: "claude-haiku-5-5", autoBudget: { organizationId: ORG, runId: "run-one", budgetTwd: 10000, spentTwd: 1 } });
    expect(res.status).toBe(200);
    const reserved = Number(res.headers.get("X-SF-Reserved-Twd")), body = await res.text(), parts = body.split("\n[SF_BUDGET]");
    expect(parts[0]).toBe('{"hooks":[]}');
    const receipt = JSON.parse(parts[1]);
    expect(receipt.estimated).toBe(false); expect(receipt.spentTwd).toBeGreaterThanOrEqual(1); expect(receipt.spentTwd).toBeLessThanOrEqual(reserved);
    expect(sent.calls[0]).not.toHaveProperty("fallbacks");
    expect(sent.options[0].maxRetries).toBe(0);
  });
  it("a stream cut after a few deltas keeps the reservation: its output_tokens is still the message_start value", async () => {
    const enc = new TextEncoder(), head = sse([
      { type: "message_start", message: { id: "m", type: "message", role: "assistant", model: "claude-haiku-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 9, output_tokens: 1 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      ...["{\"sce", "nes\":[", "{\"vis"].map((text) => ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })),
    ]);
    let pulls = 0;
    provider.fetch = async () => new Response(new ReadableStream<Uint8Array>({ pull(c) { if (pulls++) c.error(new Error("connection reset")); else c.enqueue(enc.encode(head)); } }), { status: 200, headers: { "content-type": "text/event-stream" } });
    const { reserved, text, receipt } = await receiptOf(await budgeted());
    expect(text).toContain('{"scenes":[{"vis'); expect(text).toContain("[ERROR]");
    expect(receipt).toEqual({ spentTwd: reserved, estimated: true });
  });
  // Oracle 2026-11-18 F1: self-hosted Next does not enforce maxDuration; the route cuts a budgeted stream itself, so a
  // reservation can only go stale (run-store) after its stream is gone and a retry never runs beside it.
  it("a budgeted stream that outlives the limit is cut by the route: an error line, the reservation kept", async () => {
    limit.ms = 50;
    const enc = new TextEncoder(), head = sse([
      { type: "message_start", message: { id: "m", type: "message", role: "assistant", model: "claude-haiku-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 9, output_tokens: 1 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "{\"sce" } },
    ]);
    let pulls = 0;
    provider.fetch = (async (_u: unknown, init?: { signal?: AbortSignal }) => new Response(new ReadableStream<Uint8Array>({ pull(c) { if (!pulls++) c.enqueue(enc.encode(head)); else return new Promise<void>((_, no) => init?.signal?.addEventListener("abort", () => no(new Error("aborted")))); } }), { status: 200, headers: { "content-type": "text/event-stream" } })) as () => Promise<Response>;
    const { reserved, text, receipt } = await receiptOf(await budgeted());
    expect(text).toContain("[ERROR] 超過 0.05 秒"); expect(receipt).toEqual({ spentTwd: reserved, estimated: true });
  });
  it("a provider HTTP 429 was not billed: actual NT$0, not estimated (Anthropic and OpenAI)", async () => {
    provider.fetch = async () => Response.json({ type: "error", error: { type: "rate_limit_error", message: "slow down" } }, { status: 429 });
    const anthropic = await receiptOf(await budgeted());
    expect(anthropic.text).toContain("[ERROR]"); expect(anthropic.receipt).toEqual({ spentTwd: 1, estimated: false });
    vi.stubEnv("OPENAI_API_KEY", "k");
    const { OPENAI_TEXT_MODELS } = await import("@/lib/ai/text-model-options");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 429 })));
    try {
      const openai = await receiptOf(await budgeted({ model: OPENAI_TEXT_MODELS[0] }));
      expect(openai.text).toContain("OpenAI API error (429)"); expect(openai.receipt).toEqual({ spentTwd: 1, estimated: false });
    } finally { vi.unstubAllGlobals(); }
  });
  it("an unknown module or task is 400 and calls no AI", async () => {
    expect((await post({ module: "nope", task: "x", fields: {} })).status).toBe(400);
    expect((await post({ module: "hook", task: "nope", fields: {} })).status).toBe(400);
    expect((await post({ prompt: "任何我想問的事" })).status).toBe(400);   // the old whole-prompt body is gone (I6)
    expect(sent.calls).toEqual([]);
  });

  it("a known task streams, with the module's role and the client's brand built on the server", async () => {
    const res = await post({ module: "hook", task: "hooks", fields: { topic: "失眠" }, siteId: "own", lang: "English" });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"hooks":[]}');
    expect(sent.calls[0].system).toContain("開頭鉤子專家");
    expect(sent.calls[0].system).toContain("絕對不要使用這些說法：治癒");
    expect(sent.calls[0].messages[0].content).toContain("【預設輸出語言：English】");
    expect(sent.calls[0].messages[0].content).toContain("針對「失眠」");
  });

  it("another organization's site, or none, is 404 and calls no AI", async () => {
    expect((await post({ module: "hook", task: "hooks", fields: { topic: "x" }, siteId: "other" })).status).toBe(404);
    expect((await post({ module: "hook", task: "hooks", fields: { topic: "x" }, siteId: "gone" })).status).toBe(404);
    expect(sent.calls).toEqual([]);
  });

  it("a completed stream logs the message the SDK finished with (currentMessage is cleared at the end)", async () => {
    const res = await post({ module: "hook", task: "hooks", fields: { topic: "x" }, siteId: "own" });
    await res.text();
    expect(logged.calls).toEqual([expect.objectContaining({ route: "/api/tools/script-forge", response: { model: "claude-x", stop_reason: "end_turn", usage: { input_tokens: 7, output_tokens: 3 } } })]);
  });

  it("OpenAI: usage from the final frame is logged even when the connection breaks after it (Codex F5)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "k");
    const { OPENAI_TEXT_MODELS } = await import("@/lib/ai/text-model-options");
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (!(this as { sent?: boolean }).sent) {
          (this as { sent?: boolean }).sent = true;
          c.enqueue(enc.encode(["data: " + JSON.stringify({ choices: [{ delta: { content: "hi" } }] }),
            "data: " + JSON.stringify({ choices: [], usage: { prompt_tokens: 20, completion_tokens: 5 } }), ""].join(String.fromCharCode(10))));
        } else c.error(new Error("connection reset"));
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    try {
      const res = await post({ module: "hook", task: "hooks", fields: { topic: "x" }, siteId: "own", model: OPENAI_TEXT_MODELS[0] });
      await res.text();
      expect(logged.calls).toEqual([expect.objectContaining({ route: "/api/tools/script-forge", inputTokens: 20, outputTokens: 5 })]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
