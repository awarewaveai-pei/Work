// POST /api/content/generate (K4a, PLAN 2026-11-22 I5): a chain with subscription segments, asked by the operator, is
// answered 202 + X-Codex-Job and runs detached; everything else streams exactly as before.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ actor: "ops:owner:u-owner", jobs: 0, grantThrows: false }));
vi.mock("@/lib/entitlements/grant", () => ({
  withFeature: (_k: string, h: (r: Request, g: unknown) => Promise<Response>) => (r: Request) => h(r, { actor: m.actor }),
  grantFor: async () => { if (m.grantThrows) throw new Error("gate down"); return { actor: m.actor }; },
}));
vi.mock("@/lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "owner" }), canCreateAiImageJob: () => true }));
vi.mock("@/lib/ai/gateway", () => ({
  claudeParams: (model: string, max: number) => ({ model, max_tokens: max }), claudeFallback: () => ({}), providerUrl: () => "http://x",
  loadAnthropic: async () => class {
    beta = { messages: { stream: () => Object.assign((async function* () { yield { type: "content_block_delta", delta: { type: "text_delta", text: "API 文" } }; })(),
      { abort: () => {}, finalMessage: async () => ({ model: "claude-opus-5-5", stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 20 } }) }) } };
  },
}));
vi.mock("@/lib/tarot/codex-bridge", async (orig) => ({
  ...(await orig<typeof import("@/lib/tarot/codex-bridge")>()),
  runSubJob: async () => { m.jobs++; return { ok: true, text: "# 訂閱寫的" }; },
}));
vi.mock("@/lib/ai/log-ai-call", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/log-ai-call")>()), logAiCall: async () => {} }));

const { POST } = await import("./route");
const { CODEX_JOB_HEADER, takeCodexResult, resetCodexBridgeForTests } = await import("@/lib/tarot/codex-bridge");

const post = (extra: object = {}) => POST(new Request("https://app.aware-wave.com/api/content/generate", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ keyword: "k", externalLinks: ["https://example.com"], model: "claude-opus-5-5", ...extra }),
}));

beforeEach(() => { m.actor = "ops:owner:u-owner"; m.jobs = 0; m.grantThrows = false; vi.stubEnv("ANTHROPIC_API_KEY", "k"); vi.stubEnv("CODEX_IMAGE_OWNER_USER_ID", "u-owner"); resetCodexBridgeForTests(); });

describe("POST /api/content/generate", () => {
  it("no chain: the same text/plain stream as before", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get(CODEX_JOB_HEADER)).toBeNull();
    const body = await res.text();
    expect(body.split("\n[COST_JSON]")[0]).toBe("API 文");
    expect(Object.keys(JSON.parse(body.split("\n[COST_JSON]")[1]))).toEqual(["usd", "model", "vendor", "route"]);
    expect(m.jobs).toBe(0);
  });
  it("the operator's chain with a subscription segment: 202 + job header at once; the poll gets { ok, markdown }", async () => {
    const res = await post({ chain: "claude+api", claudeModel: "sub-claude-haiku" });
    expect(res.status).toBe(202);
    const id = res.headers.get(CODEX_JOB_HEADER)!;
    expect(id).toBeTruthy();
    let r = takeCodexResult(id, m.actor);
    for (let i = 0; r.state === "running" && i < 50; i++) { await new Promise((ok) => setTimeout(ok, 5)); r = takeCodexResult(id, m.actor); }
    expect(r).toEqual({ state: "done", status: 200, body: { ok: true, markdown: `# 訂閱寫的\n[COST_JSON]${JSON.stringify({ usd: 0, model: "sub-claude-haiku", vendor: "訂閱", route: "content/article-generate" })}` } });
    expect(m.jobs).toBe(1);
  });
  it("a detached job that throws: the poll gets the article's error, not a picture's", async () => {
    m.grantThrows = true;
    const res = await post({ chain: "claude+api" });
    expect(res.status).toBe(202);
    const id = res.headers.get(CODEX_JOB_HEADER)!;
    let r = takeCodexResult(id, m.actor);
    for (let i = 0; r.state === "running" && i < 50; i++) { await new Promise((ok) => setTimeout(ok, 5)); r = takeCodexResult(id, m.actor); }
    expect(r).toEqual({ state: "done", status: 200, body: { ok: false, error: "文章產生失敗，沒有寫出內容，請再試一次", code: "article_failed" } });
  });
  it("a chain sent by someone else is API only: streamed in the request, nothing queued", async () => {
    m.actor = "ops:staff:u-staff";
    const res = await post({ chain: "claude+codex+api" });
    expect(res.status).toBe(200);
    expect((await res.text()).startsWith("API 文\n[COST_JSON]")).toBe(true);
    expect(m.jobs).toBe(0);
  });
});
