// generateTarotImage logs every image it makes (Codex 2026-10-25): also one the provider finished but whose download
// failed, on the account the grant bills, with the caller's route.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ logged: [] as Array<{ result: unknown; args: Record<string, unknown> }> }));
vi.mock("@/lib/ai/gateway", () => ({ providerUrl: (_g: unknown, _p: string, path: string) => `https://api.replicate.com${path}` }));
vi.mock("@/lib/ai/log-ai-call", () => ({
  billedOrgId: (g: { subject?: { orgId: string } }) => g.subject?.orgId ?? null,
  logImageResult: (result: unknown, args: Record<string, unknown>) => { m.logged.push({ result, args }); },
  holdCost: async () => ({ id: "hold-1", units: 0, settle: async () => ({ charged: 0, shortfall: 0 }) }), releaseHold: () => undefined,
}));

import { generateTarotImage } from "../image-gen";

const grant = { subject: { kind: "customer", orgId: "parent-org" } } as never;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

beforeEach(() => { m.logged = []; vi.stubEnv("REPLICATE_API_TOKEN", "t"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("generateTarotImage logs its cost", () => {
  it("a finished prediction whose download fails is billed and logged on the grant's account", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json({ status: "succeeded", output: ["https://replicate.delivery/x.png"] }))
      .mockResolvedValueOnce(new Response("down", { status: 503 })));
    const r = await generateTarotImage({ model: "flux-schnell", prompt: "p", costLog: { route: "tools/tarot/generate", tool: "tarot", jobId: "j1" } }, grant);
    expect(r).toMatchObject({ ok: false, billed: true });
    expect(m.logged).toEqual([{ result: r, args: expect.objectContaining({ route: "tools/tarot/generate", model: "flux-schnell", jobId: "j1", grant }) }]);
  });

  it("a refused request is handed to the logger as not billed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("no", { status: 422 })));
    const r = await generateTarotImage({ model: "flux-schnell", prompt: "p" }, grant);
    expect(r).toEqual({ ok: false, error: "replicate_422" });
    expect(m.logged).toHaveLength(1);
  });

  it("an OpenAI image is costed from its own usage at the gpt-image-2 token rates (F1)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "k");
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ data: [{ b64_json: "aGk=" }],
      usage: { input_tokens_details: { text_tokens: 100, image_tokens: 0 }, output_tokens: 1000 } }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await generateTarotImage({ model: "openai-low", prompt: "p" }, grant);
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toMatchObject({ model: "gpt-image-2" });
    expect(r).toMatchObject({ ok: true, costUsd: (100 * 5 + 1000 * 30) / 1_000_000 });
  });

  it("a prediction still running at our deadline is cancelled and logged as billed (F2)", async () => {
    vi.useFakeTimers();
    try {
      const running = { status: "processing", urls: { get: "https://api.replicate.com/v1/predictions/p1", cancel: "https://api.replicate.com/v1/predictions/p1/cancel" } };
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/cancel")) return json({ status: "canceled" });
        if (init?.signal?.aborted) throw new Error("The operation was aborted.");
        return json(running);
      });
      vi.stubGlobal("fetch", fetchMock);
      const pending = generateTarotImage({ model: "flux-schnell", prompt: "p" }, grant);
      await vi.advanceTimersByTimeAsync(61_000);
      const r = await pending;
      expect(r).toMatchObject({ ok: false, error: "generation_timeout", billed: true });
      expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/cancel"))).toBe(true);
      expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Prefer: "wait=45" });
    } finally {
      vi.useRealTimers();
    }
  });
});
