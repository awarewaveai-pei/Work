// ADR 017 4b-11 (Codex partialreview-c9327c19 F2): Replicate bills every pass, the customer pays only for a delivered print file.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ logged: [] as Record<string, unknown>[], put: { ok: true, publicUrl: "https://cdn/x.png", byteSize: 1 } as Record<string, unknown> }));
vi.mock("@/lib/ai/log-ai-call", () => ({ logImageCost: vi.fn(async (a: Record<string, unknown>) => { m.logged.push(a); }) }));
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
