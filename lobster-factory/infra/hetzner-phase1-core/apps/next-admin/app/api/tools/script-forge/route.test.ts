// POST /api/tools/script-forge (AUTO_CONTENT plan P5.2): the page sends { module, task, fields }; the system text and
// prompt are the registry's (lib/script-forge/modules.ts), the brand is read from the client's site on the server.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = vi.hoisted(() => "11111111-1111-4111-8111-111111111111");
const sent = vi.hoisted(() => ({ calls: [] as Array<{ system: string; messages: Array<{ content: string }> }> }));
vi.mock("@/lib/entitlements/grant", () => ({ withFeature: (_k: string, h: (r: Request, g: unknown) => Promise<Response>) => (r: Request) => h(r, {}) }));
vi.mock("@/lib/ai/gateway", () => ({
  claudeParams: () => ({}), claudeFallback: () => ({}), providerUrl: () => "http://x",
  loadAnthropic: async () => class {
    beta = { messages: { create: async (p: { system: string; messages: Array<{ content: string }> }) => {
      sent.calls.push(p);
      return (async function* () { yield { type: "content_block_delta", delta: { type: "text_delta", text: '{"hooks":[]}' } }; })();
    } } };
  },
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({}) }));
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

beforeEach(() => { vi.stubEnv("ANTHROPIC_API_KEY", "k"); sent.calls = []; });

describe("POST /api/tools/script-forge", () => {
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
});
