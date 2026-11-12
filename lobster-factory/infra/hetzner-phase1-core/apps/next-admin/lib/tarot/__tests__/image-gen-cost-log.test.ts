// generateTarotImage logs every image it makes (Codex 2026-10-25): also one the provider finished but whose download
// failed, on the account the grant bills, with the caller's route.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ logged: [] as Array<{ result: unknown; args: Record<string, unknown> }>, held: [] as number[] }));
vi.mock("@/lib/ai/gateway", () => ({ providerUrl: (_g: unknown, _p: string, path: string) => `https://api.replicate.com${path}` }));
vi.mock("@/lib/ai/log-ai-call", () => ({
  billedOrgId: (g: { subject?: { orgId: string } }) => g.subject?.orgId ?? null,
  logImageResult: (result: unknown, args: Record<string, unknown>) => { m.logged.push({ result, args }); },
  holdCost: async (_g: unknown, usd: number) => (m.held.push(usd), { id: "hold-1", units: 0, settle: async () => ({ charged: 0, shortfall: 0 }) }), releaseHold: () => undefined,
}));

import { generateTarotImage } from "../image-gen";

const grant = { subject: { kind: "customer", orgId: "parent-org" } } as never;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

beforeEach(() => { m.logged = []; m.held = []; vi.stubEnv("REPLICATE_API_TOKEN", "t"); });
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

  it("nano-banana-2 runs Nano Banana 2.1 on Google directly, costed from its own usage; a non-PNG reply becomes PNG", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g");
    const sharp = (await import("sharp")).default;
    const jpeg = (await sharp({ create: { width: 2, height: 2, channels: 3, background: "#fff" } }).jpeg().toBuffer()).toString("base64");
    // usage as Google answered it on 2026-11-10 (real call): image tokens by modality, thinking outside total_output_tokens.
    const usage = { total_input_tokens: 200, total_output_tokens: 1937, total_thought_tokens: 654, output_tokens_by_modality: [{ modality: "image", tokens: 1680 }] };
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ status: "completed", usage,
      steps: [{ type: "model_output", content: [{ type: "image", mime_type: "image/jpeg", data: jpeg }] }] }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await generateTarotImage({ model: "nano-banana-2", prompt: "p", aspectRatio: "4:5", referenceImages: ["data:image/png;base64,aGk="] }, grant);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/v1beta\/interactions$/);
    expect(init.headers).toMatchObject({ "x-goog-api-key": "g" });
    expect(JSON.parse(String(init.body))).toEqual({ model: "gemini-nano-banana-2.1", store: false,
      input: [{ type: "text", text: "p" }, { type: "image", mime_type: "image/png", data: "aGk=" }],
      response_format: { type: "image", aspect_ratio: "4:5", image_size: "2K" } });
    expect(r).toMatchObject({ ok: true, costUsd: (200 * 1.5 + 1680 * 30 + (257 + 654) * 7.5) / 1_000_000 });
    expect((r as { image: string }).image).toMatch(/^data:image\/png;base64,iVBOR/);
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

  // Codex 2026-11-12 F1: the hold covers the input billed per megapixel, so an own My Designs URL is measured from its bytes
  // and a reference that cannot be measured is never sent.
  it("klein: an own-design URL reference is held and charged at its real megapixels; an unreadable one is not sent", async () => {
    vi.stubEnv("R2_DESIGNS_PUBLIC_BASE", "https://designs.example.test");
    const sharp = (await import("sharp")).default;
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#fff" } }).png().toBuffer();
    const out = (await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#000" } }).png().toBuffer());
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "https://designs.example.test/designs/a.png") return new Response(new Uint8Array(big), { headers: { "content-type": "image/png" } });
      if (url.includes("/predictions")) return json({ status: "succeeded", output: ["https://replicate.delivery/k.png"] });
      if (url === "https://replicate.delivery/k.png") return new Response(new Uint8Array(out), { headers: { "content-type": "image/png" } });
      throw new Error("unexpected " + url);
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await generateTarotImage({ model: "flux-2-klein-4b", prompt: "p", referenceImages: ["https://designs.example.test/designs/a.png"] }, grant);
    expect(m.held).toEqual([Math.round((12 * 0.001 + 1.1 * 0.001) * 1e6) / 1e6]); // output held at maxOutputMp
    expect((r as { costUsd: number }).costUsd).toBeLessThanOrEqual(m.held[0]);
    expect(r).toMatchObject({ ok: true, costUsd: Math.round((12 * 0.001 + (1024 * 1024) / 1e6 * 0.001) * 1e6) / 1e6 });

    m.held = [];
    fetchMock.mockClear();
    const refused = await generateTarotImage({ model: "flux-2-klein-4b", prompt: "p", referenceImages: ["https://elsewhere.test/a.png"] }, grant);
    expect(refused).toEqual({ ok: false, error: "invalid_reference_image" });
    expect(m.held).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
