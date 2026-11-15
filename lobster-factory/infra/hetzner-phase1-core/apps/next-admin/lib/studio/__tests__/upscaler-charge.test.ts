// ADR 017 4b-11 (Codex partialreview-c9327c19 F2): Replicate bills every pass, the customer pays only for a delivered print file.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ logged: [] as Record<string, unknown>[], put: { ok: true, publicUrl: "https://cdn/x.png", byteSize: 1 } as Record<string, unknown> }));
vi.mock("@/lib/ai/log-ai-call", () => ({ holdCost: async () => ({ id: "hold-1", units: 0, settle: async () => ({ charged: 0, shortfall: 0 }) }), releaseHold: () => undefined, logImageCost: vi.fn(async (a: Record<string, unknown>) => { m.logged.push(a); }) }));
vi.mock("@/lib/ai/gateway", () => ({ providerUrl: (_g: unknown, _p: string, path: string) => `https://api.replicate.com${path}` }));
vi.mock("@/lib/entitlements/grant", () => ({ grantFor: async () => ({ tag: "upscale-grant" }) }));
vi.mock("../../storage/r2", () => ({ putDesignObject: async () => m.put }));

import { upscaleToPrintFile } from "../upscaler";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
beforeEach(() => {
  m.logged = [];
  vi.stubEnv("REPLICATE_API_TOKEN", "x");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/v1/predictions")) return json({ id: "p1", status: "succeeded", output: "https://replicate.delivery/out.png" });
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });   // the input probe and the output download
  }));
});

describe("upscale cost row", () => {
  it("a delivered print file is logged as delivered under the upscale grant", async () => {
    m.put = { ok: true, publicUrl: "https://cdn/x.png", byteSize: 3 };
    expect((await upscaleToPrintFile("https://in/x.png", null)).ok).toBe(true);
    expect(m.logged).toEqual([expect.objectContaining({ route: "studio/upscale", grant: { tag: "upscale-grant" }, delivered: true })]);
  });

  it("a pass that ran but whose file was never stored is our cost: logged, not delivered", async () => {
    m.put = { ok: false, error: "r2_down" };
    expect(await upscaleToPrintFile("https://in/x.png", null)).toEqual({ ok: false, error: "r2_down" });
    expect(m.logged).toEqual([expect.objectContaining({ route: "studio/upscale", delivered: false })]);
  });
});

describe("upscale second pass", () => {
  it("a second pass Replicate cannot be read on leaves time to deliver the first pass", async () => {
    vi.useFakeTimers();
    try {
      m.put = { ok: true, publicUrl: "https://cdn/x.png", byteSize: 3 };
      const png = Buffer.alloc(24);   // 1000x800 PNG header: pass 1 (4x) reaches 4000 < 4800, so a second pass runs
      png.writeUInt32BE(0x89504e47, 0); png.writeUInt32BE(1000, 16); png.writeUInt32BE(800, 20);
      let created = 0;
      vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
        if (url.endsWith("/v1/predictions")) return ++created === 1
          ? json({ id: "p1", status: "succeeded", output: "https://replicate.delivery/pass1.png" })
          : json({ id: "p2", status: "processing" });
        if (url.endsWith("/v1/predictions/p2")) return new Response("bad gateway", { status: 502 });
        return new Response(url.endsWith("pass1.png") ? new Uint8Array([1, 2, 3]) : png, { status: 200 });
      }));
      const p = upscaleToPrintFile("https://in/x.png", null);
      await vi.advanceTimersByTimeAsync(115_000);
      expect(await p).toEqual(expect.objectContaining({ ok: true, passes: 1 }));
    } finally {
      vi.useRealTimers();
    }
  });
});
