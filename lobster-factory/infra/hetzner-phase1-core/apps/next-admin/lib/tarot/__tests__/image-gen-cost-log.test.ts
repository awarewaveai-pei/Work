// generateTarotImage logs every image it makes (Codex 2026-10-25): also one the provider finished but whose download
// failed, on the account the grant bills, with the caller's route.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ logged: [] as Array<{ result: unknown; args: Record<string, unknown> }> }));
vi.mock("@/lib/ai/gateway", () => ({ providerUrl: (_g: unknown, _p: string, path: string) => `https://api.replicate.com${path}` }));
vi.mock("@/lib/ai/log-ai-call", () => ({
  billedOrgId: (g: { subject?: { orgId: string } }) => g.subject?.orgId ?? null,
  logImageResult: (result: unknown, args: Record<string, unknown>) => { m.logged.push({ result, args }); },
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
    expect(m.logged).toEqual([{ result: r, args: expect.objectContaining({ route: "tools/tarot/generate", model: "flux-schnell", jobId: "j1", organizationId: "parent-org" }) }]);
  });

  it("a refused request is handed to the logger as not billed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("no", { status: 422 })));
    const r = await generateTarotImage({ model: "flux-schnell", prompt: "p" }, grant);
    expect(r).toEqual({ ok: false, error: "replicate_422" });
    expect(m.logged).toHaveLength(1);
  });
});
